import type { FxrSsoConfigDto, FxrSsoConfigResponse } from '@n8n/api-types';
import { ModuleRegistry } from '@n8n/backend-common';
import { SettingsRepository } from '@n8n/db';
import { Service } from '@n8n/di';
import { Cipher } from 'n8n-core';

import { UrlService } from '@/services/url.service';

import { FxrSsoConfig } from './fxr-sso.config';

export const FXR_SSO_SETTINGS_KEY = 'fxr.sso';

export interface FxrSsoEffectiveConfig {
	enabled: boolean;
	issuer: string;
	clientId: string;
	clientSecret: string;
	allowedDomains: string;
	autoProvision: boolean;
	defaultRole: string;
	loginLabel: string;
	managedByEnv: boolean;
}

interface StoredConfig {
	enabled: boolean;
	issuer: string;
	clientId: string;
	clientSecretEncrypted: string;
	allowedDomains: string;
	autoProvision: boolean;
	defaultRole: string;
	loginLabel: string;
}

const EMPTY: StoredConfig = {
	enabled: false,
	issuer: '',
	clientId: '',
	clientSecretEncrypted: '',
	allowedDomains: '',
	autoProvision: true,
	defaultRole: 'global:member',
	loginLabel: 'Microsoft',
};

/**
 * Where the fxr-sso configuration comes from. Environment variables win when FXR_SSO_ISSUER is
 * set (managed by env); otherwise the row in the settings table, edited from the UI, is used.
 * The client secret is stored encrypted with the instance encryption key.
 */
@Service()
export class FxrSsoSettingsService {
	constructor(
		private readonly envConfig: FxrSsoConfig,
		private readonly settingsRepository: SettingsRepository,
		private readonly cipher: Cipher,
		private readonly urlService: UrlService,
		private readonly moduleRegistry: ModuleRegistry,
	) {}

	get managedByEnv() {
		return Boolean(this.envConfig.issuer);
	}

	get callbackUrl() {
		return `${this.urlService.getInstanceBaseUrl()}/rest/fxr-sso/callback`;
	}

	get loginUrl() {
		return `${this.urlService.getInstanceBaseUrl()}/rest/fxr-sso/login`;
	}

	private async loadStored(): Promise<StoredConfig> {
		const row = await this.settingsRepository.findByKey(FXR_SSO_SETTINGS_KEY);
		if (!row) return { ...EMPTY };
		try {
			return { ...EMPTY, ...(JSON.parse(row.value) as Partial<StoredConfig>) };
		} catch {
			return { ...EMPTY };
		}
	}

	async getEffective(): Promise<FxrSsoEffectiveConfig> {
		if (this.managedByEnv) {
			return {
				enabled: Boolean(this.envConfig.clientId && this.envConfig.clientSecret),
				issuer: this.envConfig.issuer,
				clientId: this.envConfig.clientId,
				clientSecret: this.envConfig.clientSecret,
				allowedDomains: this.envConfig.allowedDomains,
				autoProvision: this.envConfig.autoProvision,
				defaultRole: this.envConfig.defaultRole,
				loginLabel: this.envConfig.loginLabel,
				managedByEnv: true,
			};
		}
		const stored = await this.loadStored();
		const clientSecret = stored.clientSecretEncrypted
			? this.cipher.decrypt(stored.clientSecretEncrypted)
			: '';
		return {
			enabled: stored.enabled && Boolean(stored.issuer && stored.clientId && clientSecret),
			issuer: stored.issuer,
			clientId: stored.clientId,
			clientSecret,
			allowedDomains: stored.allowedDomains,
			autoProvision: stored.autoProvision,
			defaultRole: stored.defaultRole,
			loginLabel: stored.loginLabel,
			managedByEnv: false,
		};
	}

	/** Shape for the settings UI. The secret is never returned. */
	async getForUi(): Promise<FxrSsoConfigResponse> {
		const effective = await this.getEffective();
		const stored = this.managedByEnv ? null : await this.loadStored();
		return {
			enabled: this.managedByEnv ? effective.enabled : (stored?.enabled ?? false),
			issuer: effective.issuer,
			clientId: effective.clientId,
			allowedDomains: effective.allowedDomains,
			autoProvision: effective.autoProvision,
			defaultRole: effective.defaultRole as FxrSsoConfigResponse['defaultRole'],
			loginLabel: effective.loginLabel,
			hasClientSecret: Boolean(effective.clientSecret),
			managedByEnv: this.managedByEnv,
			callbackUrl: this.callbackUrl,
			loginUrl: this.loginUrl,
		};
	}

	/** Persist UI edits. An empty clientSecret keeps the stored one. */
	async save(dto: FxrSsoConfigDto): Promise<FxrSsoConfigResponse> {
		if (this.managedByEnv) {
			throw new Error('FXR SSO is managed by environment variables and cannot be edited here');
		}
		const current = await this.loadStored();
		const next: StoredConfig = {
			enabled: dto.enabled,
			issuer: dto.issuer,
			clientId: dto.clientId,
			clientSecretEncrypted: dto.clientSecret
				? this.cipher.encrypt(dto.clientSecret)
				: current.clientSecretEncrypted,
			allowedDomains: dto.allowedDomains,
			autoProvision: dto.autoProvision,
			defaultRole: dto.defaultRole,
			loginLabel: dto.loginLabel || 'Microsoft',
		};
		await this.settingsRepository.upsert(
			{ key: FXR_SSO_SETTINGS_KEY, value: JSON.stringify(next), loadOnStartup: false },
			['key'],
		);
		await this.moduleRegistry.refreshModuleSettings('fxr-sso');
		return await this.getForUi();
	}
}
