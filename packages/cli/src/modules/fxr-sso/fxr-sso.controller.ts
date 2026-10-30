import { Logger } from '@n8n/backend-common';
import { Get, RestController } from '@n8n/decorators';
import type { Response } from 'express';

import { AuthService } from '@/auth/auth.service';
import { AuthlessRequest } from '@/requests';
import { UrlService } from '@/services/url.service';
import { validateRedirectUrl } from '@/utils/validate-redirect-url';

import { FxrSsoService, toOAuthError } from './fxr-sso.service';

const STATE_COOKIE = 'fxr-sso-state';

/**
 * Prefer the OAuth `error` / `error_description` openid-client attaches to provider errors: for
 * Entra ID the description carries the AADSTS code that says what is actually misconfigured.
 */
function describeSsoError(error: unknown): string {
	const oauthError = toOAuthError(error);
	if (oauthError) return [oauthError.code, oauthError.description].filter(Boolean).join(': ');
	return error instanceof Error ? error.message : 'Unknown error';
}

@RestController('/fxr-sso')
export class FxrSsoController {
	constructor(
		private readonly ssoService: FxrSsoService,
		private readonly authService: AuthService,
		private readonly urlService: UrlService,
		private readonly logger: Logger,
	) {}

	/** Browser lands here from the sign-in button. */
	@Get('/login', { skipAuth: true })
	async login(req: AuthlessRequest, res: Response) {
		if (!(await this.ssoService.isConfigured())) {
			this.logger.warn('FXR SSO: login requested but SSO is not configured');
			return this.failToSignin(res, 'sso_not_configured');
		}
		const query = req.query as Record<string, string | undefined>;
		const redirect = validateRedirectUrl(query.redirect ?? '');
		const { authorizationUrl, stateToken } = await this.ssoService.startLogin(redirect);
		res.cookie(STATE_COOKIE, stateToken, {
			httpOnly: true,
			sameSite: 'lax',
			secure: this.urlService.getInstanceBaseUrl().startsWith('https'),
			maxAge: 10 * 60 * 1000,
		});
		return res.redirect(authorizationUrl);
	}

	/** Identity provider redirects back here. */
	@Get('/callback', { skipAuth: true })
	async handleCallback(req: AuthlessRequest, res: Response) {
		const stateToken = (req.cookies as Record<string, string> | undefined)?.[STATE_COOKIE];
		res.clearCookie(STATE_COOKIE);
		if (!stateToken) {
			this.logger.warn('FXR SSO: callback received without state cookie', {
				callbackUrl: this.ssoService.callbackUrl,
			});
			return this.failToSignin(res, 'sso_state_missing');
		}

		try {
			const callbackUrl = new URL(req.originalUrl, this.urlService.getInstanceBaseUrl());
			const { user, redirect } = await this.ssoService.completeLogin(callbackUrl, stateToken);
			this.authService.issueCookie(res, user, false, req.browserId);
			return res.redirect(this.urlService.getInstanceBaseUrl() + validateRedirectUrl(redirect));
		} catch (error) {
			const message = describeSsoError(error);
			this.logger.warn('FXR SSO: sign-in failed', {
				message,
				callbackUrl: this.ssoService.callbackUrl,
			});
			return this.failToSignin(res, 'sso_failed', message);
		}
	}

	private failToSignin(res: Response, code: string, message?: string) {
		const params = new URLSearchParams({ ssoError: code });
		if (message) params.set('ssoMessage', message.slice(0, 500));
		return res.redirect(`${this.urlService.getInstanceBaseUrl()}/signin?${params.toString()}`);
	}
}
