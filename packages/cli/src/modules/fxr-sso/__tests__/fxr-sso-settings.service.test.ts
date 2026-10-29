import type { ModuleRegistry } from '@n8n/backend-common';
import type { Settings, SettingsRepository } from '@n8n/db';
import { mock } from 'jest-mock-extended';
import type { Cipher } from 'n8n-core';

import type { UrlService } from '@/services/url.service';

import type { FxrSsoConfig } from '../fxr-sso.config';
import { FXR_SSO_SETTINGS_KEY, FxrSsoSettingsService } from '../fxr-sso-settings.service';

describe('FxrSsoSettingsService', () => {
	const settingsRepository = mock<SettingsRepository>();
	const cipher = mock<Cipher>();
	const moduleRegistry = mock<ModuleRegistry>();
	const urlService = mock<UrlService>();
	const envEmpty = mock<FxrSsoConfig>({ issuer: '', clientId: '', clientSecret: '' });

	const stored = (value: object) => mock<Settings>({ value: JSON.stringify(value) });

	beforeEach(() => {
		jest.resetAllMocks();
		urlService.getInstanceBaseUrl.mockReturnValue('https://n8n.fxr.test');
		cipher.encrypt.mockImplementation((v) => `enc(${String(v)})`);
		cipher.decrypt.mockImplementation((v) => v.replace(/^enc\(|\)$/g, ''));
	});

	it('prefers environment variables when FXR_SSO_ISSUER is set', async () => {
		const env = mock<FxrSsoConfig>({
			issuer: 'https://login.microsoftonline.com/t/v2.0',
			clientId: 'env-client',
			clientSecret: 'env-secret',
			allowedDomains: 'fxrracing.com',
			autoProvision: false,
			defaultRole: 'global:member',
			loginLabel: 'Microsoft',
		});
		const service = new FxrSsoSettingsService(
			env,
			settingsRepository,
			cipher,
			urlService,
			moduleRegistry,
		);

		const effective = await service.getEffective();

		expect(effective).toMatchObject({ enabled: true, clientId: 'env-client', managedByEnv: true });
		expect(settingsRepository.findByKey).not.toHaveBeenCalled();
		await expect(service.save(mock())).rejects.toThrow('managed by environment');
	});

	it('reads the stored row and decrypts the secret when not managed by env', async () => {
		settingsRepository.findByKey.mockResolvedValue(
			stored({
				enabled: true,
				issuer: 'https://idp',
				clientId: 'c',
				clientSecretEncrypted: 'enc(s)',
			}),
		);
		const service = new FxrSsoSettingsService(
			envEmpty,
			settingsRepository,
			cipher,
			urlService,
			moduleRegistry,
		);

		const effective = await service.getEffective();
		const ui = await service.getForUi();

		expect(effective).toMatchObject({ enabled: true, clientSecret: 's', managedByEnv: false });
		expect(ui).toMatchObject({
			hasClientSecret: true,
			callbackUrl: 'https://n8n.fxr.test/rest/fxr-sso/callback',
		});
		expect(ui).not.toHaveProperty('clientSecret');
	});

	it('is disabled when the stored row is incomplete', async () => {
		settingsRepository.findByKey.mockResolvedValue(
			stored({ enabled: true, issuer: 'https://idp' }),
		);
		const service = new FxrSsoSettingsService(
			envEmpty,
			settingsRepository,
			cipher,
			urlService,
			moduleRegistry,
		);

		expect((await service.getEffective()).enabled).toBe(false);
	});

	it('encrypts a new secret and keeps the old one when the field is left empty', async () => {
		settingsRepository.findByKey.mockResolvedValue(
			stored({
				enabled: false,
				issuer: 'https://idp',
				clientId: 'c',
				clientSecretEncrypted: 'enc(old)',
			}),
		);
		const service = new FxrSsoSettingsService(
			envEmpty,
			settingsRepository,
			cipher,
			urlService,
			moduleRegistry,
		);
		const base = {
			enabled: true,
			issuer: 'https://idp',
			clientId: 'c2',
			allowedDomains: 'fxrracing.com',
			autoProvision: true,
			defaultRole: 'global:member' as const,
			loginLabel: 'Microsoft',
		};

		await service.save({ ...base, clientSecret: '' });
		expect(settingsRepository.upsert).toHaveBeenLastCalledWith(
			expect.objectContaining({
				key: FXR_SSO_SETTINGS_KEY,
				value: expect.stringContaining('enc(old)'),
			}),
			['key'],
		);

		await service.save({ ...base, clientSecret: 'new' });
		expect(settingsRepository.upsert).toHaveBeenLastCalledWith(
			expect.objectContaining({ value: expect.stringContaining('enc(new)') }),
			['key'],
		);
		expect(moduleRegistry.refreshModuleSettings).toHaveBeenCalledWith('fxr-sso');
	});
});
