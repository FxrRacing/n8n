import type { Logger } from '@n8n/backend-common';
import type { AuthIdentity, AuthIdentityRepository, User, UserRepository } from '@n8n/db';
import { mock } from 'jest-mock-extended';

import { ForbiddenError } from '@/errors/response-errors/forbidden.error';
import type { JwtService } from '@/services/jwt.service';

import type { FxrSsoEffectiveConfig, FxrSsoSettingsService } from '../fxr-sso-settings.service';
import { claimsFromIdToken, emailDomainAllowed, FxrSsoService } from '../fxr-sso.service';

describe('emailDomainAllowed', () => {
	it('allows anything when no domains are configured', () => {
		expect(emailDomainAllowed('a@b.com', '')).toBe(true);
	});
	it('matches configured domains case-insensitively', () => {
		expect(emailDomainAllowed('Derek@FXRRacing.com', 'fxrracing.com, fxr.ca')).toBe(true);
		expect(emailDomainAllowed('x@gmail.com', 'fxrracing.com')).toBe(false);
	});
});

describe('claimsFromIdToken', () => {
	it('falls back from email to preferred_username and lower-cases it', () => {
		expect(
			claimsFromIdToken({ sub: 's', preferred_username: 'A@FXR.com', given_name: 'A' }),
		).toEqual({
			sub: 's',
			email: 'a@fxr.com',
			givenName: 'A',
			familyName: undefined,
		});
	});
});

describe('FxrSsoService.resolveUser', () => {
	const effective: FxrSsoEffectiveConfig = {
		enabled: true,
		issuer: 'https://login.microsoftonline.com/t/v2.0',
		clientId: 'c',
		clientSecret: 's',
		allowedDomains: 'fxrracing.com',
		autoProvision: true,
		defaultRole: 'global:member',
		loginLabel: 'Microsoft',
		managedByEnv: false,
	};
	const settings = mock<FxrSsoSettingsService>();
	const userRepository = mock<UserRepository>();
	const authIdentityRepository = mock<AuthIdentityRepository>();
	const service = new FxrSsoService(
		settings,
		mock<Logger>(),
		userRepository,
		authIdentityRepository,
		mock<JwtService>(),
	);
	const claims = { sub: 'sub-1', email: 'dev@fxrracing.com', givenName: 'Dev', familyName: 'Fxr' };

	beforeEach(() => {
		jest.resetAllMocks();
		settings.getEffective.mockResolvedValue({ ...effective });
	});

	it('refuses emails outside the allowed domains before touching the database', async () => {
		await expect(service.resolveUser({ ...claims, email: 'x@gmail.com' })).rejects.toThrow(
			ForbiddenError,
		);
		expect(authIdentityRepository.findOne).not.toHaveBeenCalled();
	});

	it('returns the user already linked to the subject', async () => {
		const user = mock<User>({ id: 'u1', disabled: false });
		authIdentityRepository.findOne.mockResolvedValue(mock<AuthIdentity>({ user }));

		const resolved = await service.resolveUser(claims);
		expect(resolved.id).toBe('u1');
		expect(userRepository.findOne).not.toHaveBeenCalled();
	});

	it('links the subject to an existing user found by email', async () => {
		authIdentityRepository.findOne.mockResolvedValue(null);
		const user = mock<User>({ id: 'u2', disabled: false });
		userRepository.findOne.mockResolvedValue(user);

		await expect(service.resolveUser(claims)).resolves.toBe(user);
		expect(authIdentityRepository.save).toHaveBeenCalledWith(
			expect.objectContaining({ providerId: 'sub-1', providerType: 'oidc', userId: 'u2' }),
		);
	});

	it('refuses disabled users', async () => {
		authIdentityRepository.findOne.mockResolvedValue(null);
		userRepository.findOne.mockResolvedValue(mock<User>({ id: 'u3', disabled: true }));

		await expect(service.resolveUser(claims)).rejects.toThrow(ForbiddenError);
	});

	it('refuses unknown users when auto-provisioning is off', async () => {
		authIdentityRepository.findOne.mockResolvedValue(null);
		userRepository.findOne.mockResolvedValue(null);
		settings.getEffective.mockResolvedValue({ ...effective, autoProvision: false });

		await expect(service.resolveUser(claims)).rejects.toThrow(ForbiddenError);
		expect(userRepository.createUserWithProject).not.toHaveBeenCalled();
	});
});
