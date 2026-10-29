import type { ModuleInterface } from '@n8n/decorators';
import { BackendModule } from '@n8n/decorators';
import { Container } from '@n8n/di';

/**
 * FXR: OpenID Connect sign-in (Entra ID) for internal use. Adds /rest/fxr-sso/login and
 * /rest/fxr-sso/callback, a settings page API under /rest/fxr-sso/config, and advertises the
 * login URL to the sign-in page through the public frontend settings. Configured from
 * Settings → Single Sign-On, or by FXR_SSO_* env vars (which take precedence).
 * Enable with N8N_ENABLED_MODULES=fxr-sso.
 */
@BackendModule({ name: 'fxr-sso', instanceTypes: ['main'] })
export class FxrSsoModule implements ModuleInterface {
	async init() {
		await import('./fxr-sso.controller');
		await import('./fxr-sso-settings.controller');
	}

	async settings() {
		const { FxrSsoSettingsService } = await import('./fxr-sso-settings.service');
		const settings = Container.get(FxrSsoSettingsService);
		const effective = await settings.getEffective();
		return {
			enabled: effective.enabled,
			loginUrl: settings.loginUrl,
			callbackUrl: settings.callbackUrl,
			loginLabel: effective.loginLabel,
			autoProvision: effective.autoProvision,
			managedByEnv: effective.managedByEnv,
		};
	}
}
