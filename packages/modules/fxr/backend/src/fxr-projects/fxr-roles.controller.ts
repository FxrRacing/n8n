import { CreateRoleDto, UpdateRoleDto } from '@n8n/api-types';
import { EventService, RoleService } from '@n8n/backend-services';
import type { AuthenticatedRequest } from '@n8n/db';
import { Body, Delete, GlobalScope, Param, Patch, Post, RestController } from '@n8n/decorators';
import { BadRequestError } from '@n8n/errors';
import type { Role as RoleDTO } from '@n8n/permissions';

// The n8n server owns this event (its telemetry relay listens for it) and declares it in its own
// event map, which a module package cannot see. The payload must stay identical to the server's.
declare module '@n8n/backend-services' {
	interface EventMap {
		'custom-role-created': {
			userId: string;
			roleSlug: string;
			scopes: string[];
			source: 'ui' | 'public-api';
		};
	}
}

/**
 * FXR: custom project roles for internal use. Thin wrapper over the free RoleService
 * create/update/remove methods, mirroring the shape of n8n's /roles endpoints. Project roles
 * only: instance (global) roles stay with the upstream /roles endpoints.
 */
@RestController('/fxr-projects/roles')
export class FxrRolesController {
	constructor(
		private readonly roleService: RoleService,
		private readonly eventService: EventService,
	) {}

	@Post('/')
	@GlobalScope('role:manage')
	async createRole(
		req: AuthenticatedRequest,
		_res: unknown,
		@Body body: CreateRoleDto,
	): Promise<RoleDTO> {
		if (body.roleType !== 'project') {
			throw new BadRequestError('Only project roles can be managed through fxr-projects');
		}
		const result = await this.roleService.createCustomRole(body);
		this.eventService.emit('custom-role-created', {
			userId: req.user.id,
			roleSlug: result.slug,
			scopes: result.scopes,
			source: 'ui',
		});
		return result;
	}

	@Patch('/:slug')
	@GlobalScope('role:manage')
	async updateRole(
		req: AuthenticatedRequest,
		_res: unknown,
		@Param('slug') slug: string,
		@Body body: UpdateRoleDto,
	): Promise<RoleDTO> {
		await this.assertProjectRole(slug);
		// The service emits `custom-role-updated`.
		return await this.roleService.updateCustomRole({ slug, newRole: body, userId: req.user.id });
	}

	@Delete('/:slug')
	@GlobalScope('role:manage')
	async deleteRole(
		req: AuthenticatedRequest,
		_res: unknown,
		@Param('slug') slug: string,
	): Promise<RoleDTO> {
		await this.assertProjectRole(slug);
		// The service emits `custom-role-deleted`.
		return await this.roleService.removeCustomRole({ slug, userId: req.user.id });
	}

	private async assertProjectRole(slug: string) {
		const role = await this.roleService.getRole(slug);
		if (role.roleType !== 'project') {
			throw new BadRequestError('Only project roles can be managed through fxr-projects');
		}
	}
}
