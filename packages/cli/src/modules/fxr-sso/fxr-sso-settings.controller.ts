import { FxrSsoConfigDto } from '@n8n/api-types';
import type { AuthenticatedRequest } from '@n8n/db';
import { Body, Get, GlobalScope, Post, Put, RestController } from '@n8n/decorators';

import { BadRequestError } from '@/errors/response-errors/bad-request.error';

import { FxrSsoSettingsService } from './fxr-sso-settings.service';
import { FxrSsoService } from './fxr-sso.service';

/** Settings page endpoints. Same scope n8n uses for its own SSO settings page. */
@RestController('/fxr-sso/config')
export class FxrSsoSettingsController {
	constructor(
		private readonly settingsService: FxrSsoSettingsService,
		private readonly ssoService: FxrSsoService,
	) {}

	@Get('/')
	@GlobalScope('saml:manage')
	async getConfig(_req: AuthenticatedRequest) {
		return await this.settingsService.getForUi();
	}

	@Put('/')
	@GlobalScope('saml:manage')
	async saveConfig(_req: AuthenticatedRequest, _res: unknown, @Body body: FxrSsoConfigDto) {
		if (this.settingsService.managedByEnv) {
			throw new BadRequestError('FXR SSO is managed by environment variables on this instance');
		}
		return await this.settingsService.save(body);
	}

	@Post('/test')
	@GlobalScope('saml:manage')
	async testConfig(_req: AuthenticatedRequest) {
		return await this.ssoService.testConnection();
	}
}
