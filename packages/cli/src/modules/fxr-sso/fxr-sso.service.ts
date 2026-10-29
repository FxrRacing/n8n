import { Logger } from '@n8n/backend-common';
import { AuthIdentity, AuthIdentityRepository, UserRepository, type User } from '@n8n/db';
import { Service } from '@n8n/di';
import * as client from 'openid-client';

import { ForbiddenError } from '@/errors/response-errors/forbidden.error';
import { JwtService } from '@/services/jwt.service';

import { FxrSsoSettingsService, type FxrSsoEffectiveConfig } from './fxr-sso-settings.service';

const PROVIDER_TYPE = 'oidc' as const;
const STATE_TTL_SECONDS = 600;
/** Users created through SSO never log in with a password. */
const NO_PASSWORD_PLACEHOLDER = '!fxr-sso-no-password';

export interface SsoClaims {
	sub: string;
	email: string;
	givenName?: string;
	familyName?: string;
}

export interface LoginState {
	codeVerifier: string;
	nonce: string;
	state: string;
	redirect: string;
}

/** Pure helpers, exported for tests. */
export function emailDomainAllowed(email: string, allowedDomains: string): boolean {
	const allowed = allowedDomains
		.split(',')
		.map((d) => d.trim().toLowerCase())
		.filter(Boolean);
	if (allowed.length === 0) return true;
	const domain = email.split('@')[1]?.toLowerCase() ?? '';
	return allowed.includes(domain);
}

export function claimsFromIdToken(claims: Record<string, unknown>): SsoClaims {
	const email = String(claims.email ?? claims.preferred_username ?? claims.upn ?? '')
		.trim()
		.toLowerCase();
	return {
		sub: String(claims.sub ?? ''),
		email,
		givenName: typeof claims.given_name === 'string' ? claims.given_name : undefined,
		familyName: typeof claims.family_name === 'string' ? claims.family_name : undefined,
	};
}

@Service()
export class FxrSsoService {
	private configuration: client.Configuration | undefined;
	private configurationKey = '';

	constructor(
		private readonly settings: FxrSsoSettingsService,
		private readonly logger: Logger,
		private readonly userRepository: UserRepository,
		private readonly authIdentityRepository: AuthIdentityRepository,
		private readonly jwtService: JwtService,
	) {}

	async isConfigured() {
		return (await this.settings.getEffective()).enabled;
	}

	get callbackUrl() {
		return this.settings.callbackUrl;
	}

	get loginUrl() {
		return this.settings.loginUrl;
	}

	/** Discover the provider for the current config; re-discovers when issuer or client change. */
	private async getConfiguration(config?: FxrSsoEffectiveConfig): Promise<client.Configuration> {
		const effective = config ?? (await this.settings.getEffective());
		const key = `${effective.issuer}|${effective.clientId}`;
		if (this.configuration && this.configurationKey === key) return this.configuration;
		this.configuration = await client.discovery(
			new URL(effective.issuer),
			effective.clientId,
			effective.clientSecret,
		);
		this.configurationKey = key;
		return this.configuration;
	}

	/** Used by the settings page "Test" button: can we reach and understand the provider? */
	async testConnection(): Promise<{ ok: boolean; issuer: string; message: string }> {
		const effective = await this.settings.getEffective();
		if (!effective.issuer || !effective.clientId || !effective.clientSecret) {
			return {
				ok: false,
				issuer: effective.issuer,
				message: 'Issuer, client ID and secret are required',
			};
		}
		try {
			const configuration = await client.discovery(
				new URL(effective.issuer),
				effective.clientId,
				effective.clientSecret,
			);
			const metadata = configuration.serverMetadata();
			return { ok: true, issuer: metadata.issuer, message: 'Provider discovery succeeded' };
		} catch (error) {
			return { ok: false, issuer: effective.issuer, message: (error as Error).message };
		}
	}

	/** Build the provider authorization URL and a signed state token to store in a cookie. */
	async startLogin(redirect: string): Promise<{ authorizationUrl: string; stateToken: string }> {
		const configuration = await this.getConfiguration();
		const codeVerifier = client.randomPKCECodeVerifier();
		const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier);
		const state = client.randomState();
		const nonce = client.randomNonce();

		const authorizationUrl = client.buildAuthorizationUrl(configuration, {
			redirect_uri: this.callbackUrl,
			scope: 'openid profile email',
			code_challenge: codeChallenge,
			code_challenge_method: 'S256',
			state,
			nonce,
		});

		const payload: LoginState = { codeVerifier, nonce, state, redirect };
		const stateToken = this.jwtService.sign(payload, { expiresIn: STATE_TTL_SECONDS });
		return { authorizationUrl: authorizationUrl.href, stateToken };
	}

	/** Exchange the callback for tokens, validate, and resolve the n8n user. */
	async completeLogin(
		callbackUrl: URL,
		stateToken: string,
	): Promise<{ user: User; redirect: string }> {
		const loginState = this.jwtService.verify<LoginState>(stateToken);
		const configuration = await this.getConfiguration();

		const tokens = await client.authorizationCodeGrant(configuration, callbackUrl, {
			pkceCodeVerifier: loginState.codeVerifier,
			expectedNonce: loginState.nonce,
			expectedState: loginState.state,
			idTokenExpected: true,
		});

		const rawClaims = tokens.claims();
		if (!rawClaims) throw new ForbiddenError('Identity provider returned no ID token claims');
		const claims = claimsFromIdToken(rawClaims as Record<string, unknown>);
		if (!claims.sub || !claims.email) {
			throw new ForbiddenError('Identity provider did not return a subject and email');
		}

		const user = await this.resolveUser(claims);
		return { user, redirect: loginState.redirect };
	}

	/** Identity by sub → existing user by email → auto-provision. */
	async resolveUser(claims: SsoClaims): Promise<User> {
		const config = await this.settings.getEffective();
		if (!emailDomainAllowed(claims.email, config.allowedDomains)) {
			this.logger.warn('FXR SSO: sign-in refused for email outside allowed domains', {
				email: claims.email,
			});
			throw new ForbiddenError('Your account is not allowed to sign in here');
		}

		const identity = await this.authIdentityRepository.findOne({
			where: { providerId: claims.sub, providerType: PROVIDER_TYPE },
			relations: { user: { role: true } },
		});
		if (identity?.user) {
			if (identity.user.disabled) throw new ForbiddenError('This account is disabled');
			return identity.user;
		}

		const existing = await this.userRepository.findOne({
			where: { email: claims.email },
			relations: ['role', 'authIdentities'],
		});
		if (existing) {
			if (existing.disabled) throw new ForbiddenError('This account is disabled');
			await this.authIdentityRepository.save(
				AuthIdentity.create(existing, claims.sub, PROVIDER_TYPE),
			);
			this.logger.info('FXR SSO: linked identity to existing user', { userId: existing.id });
			return existing;
		}

		if (!config.autoProvision) {
			throw new ForbiddenError('No n8n account exists for this email. Ask an admin to invite you.');
		}

		const user = await this.userRepository.manager.transaction(async (trx) => {
			const { user: created } = await this.userRepository.createUserWithProject(
				{
					email: claims.email,
					firstName: claims.givenName?.trim() || 'FXR',
					lastName: claims.familyName?.trim() || 'User',
					role: { slug: config.defaultRole },
					password: NO_PASSWORD_PLACEHOLDER,
				},
				trx,
			);
			await trx.save(AuthIdentity.create(created, claims.sub, PROVIDER_TYPE));
			return created;
		});
		this.logger.info('FXR SSO: provisioned new user', { userId: user.id });
		return user;
	}
}
