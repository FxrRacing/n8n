import { Config, Env } from '@n8n/config';

/**
 * FXR single sign-on (OpenID Connect, authorization code + PKCE).
 * Works with Microsoft Entra ID and any other OIDC provider that supports discovery.
 */
@Config
export class FxrSsoConfig {
	/** OIDC issuer URL, e.g. https://login.microsoftonline.com/<tenant-id>/v2.0 */
	@Env('FXR_SSO_ISSUER')
	issuer: string = '';

	/** Application (client) ID of the app registration. */
	@Env('FXR_SSO_CLIENT_ID')
	clientId: string = '';

	/** Client secret of the app registration. */
	@Env('FXR_SSO_CLIENT_SECRET')
	clientSecret: string = '';

	/** Comma-separated email domains allowed to sign in, e.g. fxrracing.com. Empty allows any. */
	@Env('FXR_SSO_ALLOWED_DOMAINS')
	allowedDomains: string = '';

	/** Whether to create an n8n user on first sign-in for an email that is not yet known. */
	@Env('FXR_SSO_AUTO_PROVISION')
	autoProvision: boolean = true;

	/** Global role for auto-provisioned users. */
	@Env('FXR_SSO_DEFAULT_ROLE')
	defaultRole: string = 'global:member';

	/** Label shown on the sign-in button. */
	@Env('FXR_SSO_LOGIN_LABEL')
	loginLabel: string = 'Microsoft';
}
