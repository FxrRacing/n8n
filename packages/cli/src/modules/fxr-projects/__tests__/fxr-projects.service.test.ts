import type {
	Project,
	ProjectRelation,
	ProjectRelationRepository,
	ProjectRepository,
	Role,
	RoleRepository,
	User,
} from '@n8n/db';
import { mock } from 'jest-mock-extended';

import { BadRequestError } from '@/errors/response-errors/bad-request.error';

import { FxrProjectsService } from '../fxr-projects.service';

describe('FxrProjectsService', () => {
	const projectRepository = mock<ProjectRepository>();
	const projectRelationRepository = mock<ProjectRelationRepository>();
	const roleRepository = mock<RoleRepository>();
	const service = new FxrProjectsService(
		projectRepository,
		projectRelationRepository,
		roleRepository,
	);

	const user = mock<User>({ id: 'u1', role: { slug: 'global:owner' } });
	const adminRole = mock<Role>({
		slug: 'project:admin',
		scopes: [{ slug: 'project:update' }, { slug: 'workflow:create' }],
	});
	const ownerRole = mock<Role>({ slug: 'global:owner', scopes: [{ slug: 'project:create' }] });

	beforeEach(() => {
		jest.resetAllMocks();
		roleRepository.findBySlug.mockImplementation(async (slug) =>
			slug === 'project:admin' ? adminRole : slug === 'global:owner' ? ownerRole : null,
		);
		projectRepository.create.mockImplementation((p) => p as Project);
		projectRepository.save.mockImplementation(async (p) => ({ ...p, id: 'p1' }) as Project);
		projectRelationRepository.create.mockImplementation((r) => r as ProjectRelation);
		projectRelationRepository.save.mockImplementation(async (r) => r as ProjectRelation);
	});

	it('creates a team project owned by the caller as admin', async () => {
		const result = await service.createTeamProject(user, {
			name: 'Dealers',
			icon: { type: 'emoji', value: '🏁' },
		});

		expect(projectRepository.save).toHaveBeenCalledWith(
			expect.objectContaining({ name: 'Dealers', type: 'team', creatorId: 'u1' }),
		);
		expect(projectRelationRepository.save).toHaveBeenCalledWith(
			expect.objectContaining({ projectId: 'p1', userId: 'u1', role: { slug: 'project:admin' } }),
		);
		expect(result.id).toBe('p1');
		expect(result.role).toBe('project:admin');
		expect(result.scopes).toEqual(
			expect.arrayContaining(['project:create', 'project:update', 'workflow:create']),
		);
	});

	it('fails when the admin role is missing from the database', async () => {
		roleRepository.findBySlug.mockResolvedValue(null);

		await expect(service.createTeamProject(user, { name: 'X' })).rejects.toThrow(BadRequestError);
		expect(projectRepository.save).not.toHaveBeenCalled();
	});
});
