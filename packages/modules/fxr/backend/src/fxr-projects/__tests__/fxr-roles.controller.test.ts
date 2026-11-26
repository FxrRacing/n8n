import type { EventService, RoleService } from '@n8n/backend-services';
import type { AuthenticatedRequest } from '@n8n/db';
import { BadRequestError } from '@n8n/errors';
import type { Role as RoleDTO } from '@n8n/permissions';
import { mock } from 'vitest-mock-extended';

import { FxrRolesController } from '../fxr-roles.controller';

describe('FxrRolesController', () => {
	const roleService = mock<RoleService>();
	const eventService = mock<EventService>();
	const controller = new FxrRolesController(roleService, eventService);
	const req = mock<AuthenticatedRequest>({ user: { id: 'u1' } });
	const role = mock<RoleDTO>({
		slug: 'project:dealer-ops-abc123',
		roleType: 'project',
		scopes: ['workflow:read'],
	});
	const globalRole = mock<RoleDTO>({ slug: 'global:auditor-abc123', roleType: 'global' });

	afterEach(() => vi.resetAllMocks());

	it('creates a custom project role and emits the created event', async () => {
		roleService.createCustomRole.mockResolvedValue(role);
		const body = {
			displayName: 'Dealer Ops',
			roleType: 'project' as const,
			scopes: ['workflow:read'],
		};

		const result = await controller.createRole(req, undefined, body);

		expect(roleService.createCustomRole).toHaveBeenCalledWith(body);
		expect(eventService.emit).toHaveBeenCalledWith('custom-role-created', {
			userId: 'u1',
			roleSlug: role.slug,
			scopes: role.scopes,
			source: 'ui',
		});
		expect(result).toBe(role);
	});

	it('rejects creating a global role', async () => {
		const body = { displayName: 'Auditor', roleType: 'global' as const, scopes: [] };

		await expect(controller.createRole(req, undefined, body)).rejects.toThrow(BadRequestError);
		expect(roleService.createCustomRole).not.toHaveBeenCalled();
	});

	it('updates a custom project role', async () => {
		roleService.getRole.mockResolvedValue(role);
		roleService.updateCustomRole.mockResolvedValue(role);

		const result = await controller.updateRole(req, undefined, role.slug, {
			displayName: 'Dealer Ops 2',
		});

		expect(roleService.updateCustomRole).toHaveBeenCalledWith({
			slug: role.slug,
			newRole: { displayName: 'Dealer Ops 2' },
			userId: 'u1',
		});
		expect(result).toBe(role);
	});

	it('deletes a custom project role', async () => {
		roleService.getRole.mockResolvedValue(role);
		roleService.removeCustomRole.mockResolvedValue(role);

		await controller.deleteRole(req, undefined, role.slug);

		expect(roleService.removeCustomRole).toHaveBeenCalledWith({ slug: role.slug, userId: 'u1' });
	});

	it('rejects updating or deleting a global role', async () => {
		roleService.getRole.mockResolvedValue(globalRole);

		await expect(
			controller.updateRole(req, undefined, globalRole.slug, { displayName: 'X' }),
		).rejects.toThrow(BadRequestError);
		await expect(controller.deleteRole(req, undefined, globalRole.slug)).rejects.toThrow(
			BadRequestError,
		);
		expect(roleService.updateCustomRole).not.toHaveBeenCalled();
		expect(roleService.removeCustomRole).not.toHaveBeenCalled();
	});
});
