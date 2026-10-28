import type {
	Project,
	ProjectRepository,
	SharedCredentialsRepository,
	SharedWorkflow,
	SharedWorkflowRepository,
	User,
	UserRepository,
} from '@n8n/db';
import { mock } from 'jest-mock-extended';

import { ForbiddenError } from '@/errors/response-errors/forbidden.error';
import { NotFoundError } from '@/errors/response-errors/not-found.error';

import { FxrSharingService } from '../fxr-sharing.service';

describe('FxrSharingService', () => {
	const sharedWorkflowRepository = mock<SharedWorkflowRepository>();
	const sharedCredentialsRepository = mock<SharedCredentialsRepository>();
	const projectRepository = mock<ProjectRepository>();
	const userRepository = mock<UserRepository>();
	const service = new FxrSharingService(
		sharedWorkflowRepository,
		sharedCredentialsRepository,
		projectRepository,
		userRepository,
	);

	const ownerProject = mock<Project>({ id: 'p-owner', type: 'personal' });
	const owner = mock<User>({ id: 'u-owner', role: { slug: 'global:member' } });
	const instanceOwner = mock<User>({ id: 'u-root', role: { slug: 'global:owner' } });
	const stranger = mock<User>({ id: 'u-other', role: { slug: 'global:member' } });

	const relation = (projectId: string, role: SharedWorkflow['role']) =>
		mock<SharedWorkflow>({ workflowId: 'wf1', projectId, role });

	beforeEach(() => {
		jest.resetAllMocks();
		sharedWorkflowRepository.getWorkflowOwningProject.mockResolvedValue(ownerProject);
		projectRepository.getPersonalProjectForUserOrFail.mockImplementation(async (userId) =>
			mock<Project>({ id: userId === 'u-owner' ? 'p-owner' : `p-${userId}` }),
		);
		projectRepository.getPersonalProjectForUser.mockImplementation(async (userId) =>
			userId === 'u-missing'
				? null
				: mock<Project>({ id: userId === 'u-owner' ? 'p-owner' : `p-${userId}` }),
		);
		userRepository.findPersonalOwnerForProject.mockImplementation(async (projectId) =>
			mock<User>({
				id: projectId.replace('p-', ''),
				email: `${projectId}@fxr.test`,
				firstName: 'F',
				lastName: 'L',
			}),
		);
	});

	describe('setWorkflowSharees', () => {
		it('adds missing editor relations and removes stale ones', async () => {
			sharedWorkflowRepository.getAllRelationsForWorkflows.mockResolvedValue([
				relation('p-owner', 'workflow:owner'),
				relation('p-u-a', 'workflow:editor'),
				relation('p-u-b', 'workflow:editor'),
			]);

			await service.setWorkflowSharees(owner, 'wf1', ['u-b', 'u-c']);

			expect(sharedWorkflowRepository.delete).toHaveBeenCalledWith(
				expect.objectContaining({ workflowId: 'wf1', role: 'workflow:editor' }),
			);
			expect(sharedWorkflowRepository.insert).toHaveBeenCalledWith([
				{ workflowId: 'wf1', projectId: 'p-u-c', role: 'workflow:editor' },
			]);
		});

		it('never shares a workflow with its own owning project', async () => {
			sharedWorkflowRepository.getAllRelationsForWorkflows.mockResolvedValue([
				relation('p-owner', 'workflow:owner'),
			]);

			await service.setWorkflowSharees(owner, 'wf1', ['u-owner']);

			expect(sharedWorkflowRepository.insert).not.toHaveBeenCalled();
			expect(sharedWorkflowRepository.delete).not.toHaveBeenCalled();
		});

		it('rejects a caller who does not own the workflow', async () => {
			await expect(service.setWorkflowSharees(stranger, 'wf1', ['u-a'])).rejects.toThrow(
				ForbiddenError,
			);
			expect(sharedWorkflowRepository.insert).not.toHaveBeenCalled();
		});

		it('lets the instance owner manage any workflow', async () => {
			sharedWorkflowRepository.getAllRelationsForWorkflows.mockResolvedValue([
				relation('p-owner', 'workflow:owner'),
			]);

			await service.setWorkflowSharees(instanceOwner, 'wf1', ['u-a']);

			expect(sharedWorkflowRepository.insert).toHaveBeenCalledWith([
				{ workflowId: 'wf1', projectId: 'p-u-a', role: 'workflow:editor' },
			]);
		});

		it('fails when the workflow has no owning project', async () => {
			sharedWorkflowRepository.getWorkflowOwningProject.mockResolvedValue(undefined);
			await expect(service.setWorkflowSharees(owner, 'wf1', [])).rejects.toThrow(NotFoundError);
		});

		it('fails when a sharee user does not exist', async () => {
			await expect(service.setWorkflowSharees(owner, 'wf1', ['u-missing'])).rejects.toThrow(
				NotFoundError,
			);
			expect(sharedWorkflowRepository.insert).not.toHaveBeenCalled();
		});
	});

	describe('getWorkflowShareState', () => {
		it('returns only editor sharees, resolved to users', async () => {
			sharedWorkflowRepository.getAllRelationsForWorkflows.mockResolvedValue([
				relation('p-owner', 'workflow:owner'),
				relation('p-u-a', 'workflow:editor'),
			]);

			const state = await service.getWorkflowShareState(owner, 'wf1');

			expect(state.ownerProjectId).toBe('p-owner');
			expect(state.sharees).toEqual([
				{ id: 'u-a', email: 'p-u-a@fxr.test', firstName: 'F', lastName: 'L' },
			]);
		});
	});

	describe('listCandidateUsers', () => {
		it('excludes the caller, disabled and pending users', async () => {
			userRepository.find.mockResolvedValue([
				mock<User>({ id: 'u-owner', disabled: false, isPending: false }),
				mock<User>({ id: 'u-a', email: 'a@fxr.test', disabled: false, isPending: false }),
				mock<User>({ id: 'u-disabled', disabled: true, isPending: false }),
				mock<User>({ id: 'u-pending', disabled: false, isPending: true }),
			]);

			const users = await service.listCandidateUsers(owner);

			expect(users.map((u) => u.id)).toEqual(['u-a']);
		});
	});
});
