import type { AuthenticatedRequest } from '@n8n/db';
import type { Role as RoleDTO } from '@n8n/permissions';
import { mock } from 'jest-mock-extended';

import type { EventService } from '@/events/event.service';
import type { RoleService } from '@/services/role.service';

import { FxrRolesController } from '../fxr-roles.controller';

describe('FxrRolesController', () => {
	const roleService = mock<RoleService>();
	const eventService = mock<EventService>();
	const controller = new FxrRolesController(roleService, eventService);
	const req = mock<AuthenticatedRequest>({ user: { id: 'u1' } });
	const role = mock<RoleDTO>({ slug: 'project:dealer-ops-abc123', scopes: ['workflow:read'] });

	afterEach(() => jest.clearAllMocks());

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
		});
		expect(result).toBe(role);
	});

	it('updates a custom role', async () => {
		roleService.updateCustomRole.mockResolvedValue(role);

		await controller.updateRole(req, undefined, role.slug, { displayName: 'Dealer Ops 2' });

		expect(roleService.updateCustomRole).toHaveBeenCalledWith(role.slug, {
			displayName: 'Dealer Ops 2',
		});
		expect(eventService.emit).toHaveBeenCalledWith('custom-role-updated', expect.anything());
	});

	it('deletes a custom role', async () => {
		roleService.removeCustomRole.mockResolvedValue(role);

		await controller.deleteRole(req, undefined, role.slug);

		expect(roleService.removeCustomRole).toHaveBeenCalledWith(role.slug);
		expect(eventService.emit).toHaveBeenCalledWith('custom-role-deleted', {
			userId: 'u1',
			roleSlug: role.slug,
		});
	});
});
