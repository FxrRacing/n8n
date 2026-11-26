import { SSO_ERROR_LOGIN_FAILED, SSO_ERROR_QUERY_PARAM } from '@n8n/api-types';
import { Logger } from '@n8n/backend-common';
import { UrlService } from '@n8n/backend-services';
import { Get, RestController } from '@n8n/decorators';
import { validateRedirectUrl } from '@n8n/utils/validate-redirect-url';
import type { Request, Response } from 'express';

import { FxrSsoSessionIssuer } from './fxr-sso-session-issuer';
import { FxrSsoService, toOAuthError } from './fxr-sso.service';

/** The auth middleware sets `browserId` on every request, including unauthenticated ones. */
type BrowserRequest = Request & { browserId?: string };

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
		private readonly sessionIssuer: FxrSsoSessionIssuer,
		private readonly urlService: UrlService,
		private readonly logger: Logger,
	) {}

	/** Browser lands here from the sign-in button. */
	@Get('/login', { skipAuth: true })
	async login(req: BrowserRequest, res: Response) {
		if (!(await this.ssoService.isConfigured())) {
			this.logger.warn('FXR SSO: login requested but SSO is not configured');
			return this.failToSignin(res);
		}
		const query = req.query as Record<string, string | undefined>;
		const redirect = validateRedirectUrl(query.redirect ?? '');
		try {
			const { authorizationUrl, stateToken } = await this.ssoService.startLogin(redirect);
			res.cookie(STATE_COOKIE, stateToken, {
				httpOnly: true,
				sameSite: 'lax',
				secure: this.urlService.getInstanceBaseUrl().startsWith('https'),
				maxAge: 10 * 60 * 1000,
			});
			return res.redirect(authorizationUrl);
		} catch (error) {
			// The provider could not be reached or rejected the configuration (wrong issuer, tenant).
			this.logger.warn('FXR SSO: could not start sign-in', { message: describeSsoError(error) });
			return this.failToSignin(res);
		}
	}

	/** Identity provider redirects back here. */
	@Get('/callback', { skipAuth: true })
	async handleCallback(req: BrowserRequest, res: Response) {
		const stateToken = (req.cookies as Record<string, string> | undefined)?.[STATE_COOKIE];
		res.clearCookie(STATE_COOKIE);
		if (!stateToken) {
			this.logger.warn('FXR SSO: callback received without state cookie', {
				callbackUrl: this.ssoService.callbackUrl,
			});
			return this.failToSignin(res);
		}

		try {
			const callbackUrl = new URL(req.originalUrl, this.urlService.getInstanceBaseUrl());
			const { user, redirect } = await this.ssoService.completeLogin(callbackUrl, stateToken);
			this.sessionIssuer.issueCookie(res, user, req.browserId);
			return res.redirect(this.urlService.getInstanceBaseUrl() + validateRedirectUrl(redirect));
		} catch (error) {
			const message = describeSsoError(error);
			this.logger.warn('FXR SSO: sign-in failed', {
				message,
				callbackUrl: this.ssoService.callbackUrl,
			});
			return this.failToSignin(res);
		}
	}

	/**
	 * Sends the browser back to the sign-in page with n8n's own SSO failure code, so the page
	 * shows its standard message. The cause is only written to the server log: the provider's
	 * message is untrusted and never put in the URL.
	 */
	private failToSignin(res: Response) {
		const params = new URLSearchParams({ [SSO_ERROR_QUERY_PARAM]: SSO_ERROR_LOGIN_FAILED });
		return res.redirect(`${this.urlService.getInstanceBaseUrl()}/signin?${params.toString()}`);
	}
}
