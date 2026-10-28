import { CreateRoleDto, UpdateRoleDto } from '@n8n/api-types';
import type { AuthenticatedRequest } from '@n8n/db';
import { Body, Delete, GlobalScope, Param, Patch, Post, RestController } from '@n8n/decorators';
import type { Role as RoleDTO } from '@n8n/permissions';

import { EventService } from '@/events/event.service';
import { RoleService } from '@/services/role.service';

/**
 * FXR: custom project roles for internal use. Thin wrapper over the free RoleService
 * create/update/remove methods, mirroring the shape of n8n's /roles endpoints.
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
		const result = await this.roleService.createCustomRole(body);
		this.eventService.emit('custom-role-created', {
			userId: req.user.id,
			roleSlug: result.slug,
			scopes: result.scopes,
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
		const result = await this.roleService.updateCustomRole(slug, body);
		this.eventService.emit('custom-role-updated', {
			userId: req.user.id,
			roleSlug: result.slug,
			scopes: result.scopes,
		});
		return result;
	}

	@Delete('/:slug')
	@GlobalScope('role:manage')
	async deleteRole(
		req: AuthenticatedRequest,
		_res: unknown,
		@Param('slug') slug: string,
	): Promise<RoleDTO> {
		const result = await this.roleService.removeCustomRole(slug);
		this.eventService.emit('custom-role-deleted', { userId: req.user.id, roleSlug: result.slug });
		return result;
	}
}
