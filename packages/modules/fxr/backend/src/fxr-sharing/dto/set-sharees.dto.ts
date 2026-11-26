import { Z } from '@n8n/api-types';
import { z } from 'zod';

export class SetShareesDto extends Z.class({
	userIds: z.array(z.string().min(1)).max(200),
}) {}
