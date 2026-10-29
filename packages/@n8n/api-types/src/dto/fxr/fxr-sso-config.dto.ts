import { z } from 'zod';

import { Z } from '../../zod-class';

export const FXR_SSO_DEFAULT_ROLES = ['global:member', 'global:admin'] as const;

/** FXR: editable OpenID Connect settings for the fxr-sso module. */
export class FxrSsoConfigDto extends Z.class({
	enabled: z.boolean(),
	issuer: z.string().trim().url().or(z.literal('')),
	clientId: z.string().trim().max(200),
	/** Omit or send empty to keep the stored secret. */
	clientSecret: z.string().max(2000).optional(),
	allowedDomains: z.string().trim().max(500),
	autoProvision: z.boolean(),
	defaultRole: z.enum(FXR_SSO_DEFAULT_ROLES),
	loginLabel: z.string().trim().max(50),
}) {}

/** What the settings UI receives. Never includes the secret. */
export type FxrSsoConfigResponse = Omit<FxrSsoConfigDto, 'clientSecret'> & {
	hasClientSecret: boolean;
	managedByEnv: boolean;
	callbackUrl: string;
	loginUrl: string;
};
