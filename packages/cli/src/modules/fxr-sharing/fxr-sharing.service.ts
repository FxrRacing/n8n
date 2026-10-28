import {
	ProjectRepository,
	SharedCredentialsRepository,
	SharedWorkflowRepository,
	UserRepository,
	type Project,
	type User,
} from '@n8n/db';
import { Service } from '@n8n/di';
import { In } from '@n8n/typeorm';

import { ForbiddenError } from '@/errors/response-errors/forbidden.error';
import { NotFoundError } from '@/errors/response-errors/not-found.error';

const INSTANCE_OWNER_ROLE = 'global:owner';
const WORKFLOW_EDITOR = 'workflow:editor' as const;
const CREDENTIAL_USER = 'credential:user' as const;

export type Sharee = { id: string; email: string; firstName: string; lastName: string };

export type ShareState = {
	ownerProjectId: string;
	sharees: Sharee[];
};

@Service()
export class FxrSharingService {
	constructor(
		private readonly sharedWorkflowRepository: SharedWorkflowRepository,
		private readonly sharedCredentialsRepository: SharedCredentialsRepository,
		private readonly projectRepository: ProjectRepository,
		private readonly userRepository: UserRepository,
	) {}

	/** Users that can be picked as sharees: active, non-pending, not the caller. */
	async listCandidateUsers(caller: User): Promise<Sharee[]> {
		const users = await this.userRepository.find({
			select: ['id', 'email', 'firstName', 'lastName', 'password', 'disabled'],
		});
		return users
			.filter((u) => u.id !== caller.id && !u.disabled && !u.isPending)
			.map((u) => this.toSharee(u));
	}

	async getWorkflowShareState(caller: User, workflowId: string): Promise<ShareState> {
		const owner = await this.assertWorkflowManager(caller, workflowId);
		const relations = await this.sharedWorkflowRepository.getAllRelationsForWorkflows([workflowId]);
		const projectIds = relations.filter((r) => r.role === WORKFLOW_EDITOR).map((r) => r.projectId);
		return { ownerProjectId: owner.id, sharees: await this.usersForPersonalProjects(projectIds) };
	}

	async setWorkflowSharees(caller: User, workflowId: string, userIds: string[]) {
		const owner = await this.assertWorkflowManager(caller, workflowId);
		const target = (await this.personalProjectIds(userIds)).filter((id) => id !== owner.id);
		const current = (await this.sharedWorkflowRepository.getAllRelationsForWorkflows([workflowId]))
			.filter((r) => r.role === WORKFLOW_EDITOR)
			.map((r) => r.projectId);

		const toRemove = current.filter((id) => !target.includes(id));
		const toAdd = target.filter((id) => !current.includes(id));

		if (toRemove.length > 0) {
			await this.sharedWorkflowRepository.delete({
				workflowId,
				role: WORKFLOW_EDITOR,
				projectId: In(toRemove),
			});
		}
		if (toAdd.length > 0) {
			await this.sharedWorkflowRepository.insert(
				toAdd.map((projectId) => ({ workflowId, projectId, role: WORKFLOW_EDITOR })),
			);
		}
		return await this.getWorkflowShareState(caller, workflowId);
	}

	async getCredentialShareState(caller: User, credentialId: string): Promise<ShareState> {
		const owner = await this.assertCredentialManager(caller, credentialId);
		const relations = await this.sharedCredentialsRepository.getAllRelationsForCredentials([
			credentialId,
		]);
		const projectIds = relations.filter((r) => r.role === CREDENTIAL_USER).map((r) => r.projectId);
		return { ownerProjectId: owner.id, sharees: await this.usersForPersonalProjects(projectIds) };
	}

	async setCredentialSharees(caller: User, credentialId: string, userIds: string[]) {
		const owner = await this.assertCredentialManager(caller, credentialId);
		const target = (await this.personalProjectIds(userIds)).filter((id) => id !== owner.id);
		const current = (
			await this.sharedCredentialsRepository.getAllRelationsForCredentials([credentialId])
		)
			.filter((r) => r.role === CREDENTIAL_USER)
			.map((r) => r.projectId);

		const toRemove = current.filter((id) => !target.includes(id));
		const toAdd = target.filter((id) => !current.includes(id));

		if (toRemove.length > 0) {
			await this.sharedCredentialsRepository.delete({
				credentialsId: credentialId,
				role: CREDENTIAL_USER,
				projectId: In(toRemove),
			});
		}
		if (toAdd.length > 0) {
			await this.sharedCredentialsRepository.insert(
				toAdd.map((projectId) => ({
					credentialsId: credentialId,
					projectId,
					role: CREDENTIAL_USER,
				})),
			);
		}
		return await this.getCredentialShareState(caller, credentialId);
	}

	// ---- helpers ----

	private isInstanceOwner(user: User) {
		return user.role?.slug === INSTANCE_OWNER_ROLE;
	}

	private async assertWorkflowManager(caller: User, workflowId: string): Promise<Project> {
		const owner = await this.sharedWorkflowRepository.getWorkflowOwningProject(workflowId);
		if (!owner) throw new NotFoundError('Workflow not found');
		await this.assertManages(caller, owner, 'workflow');
		return owner;
	}

	private async assertCredentialManager(caller: User, credentialId: string): Promise<Project> {
		const owner = await this.sharedCredentialsRepository.findCredentialOwningProject(credentialId);
		if (!owner) throw new NotFoundError('Credential not found');
		await this.assertManages(caller, owner, 'credential');
		return owner;
	}

	private async assertManages(caller: User, owner: Project, kind: 'workflow' | 'credential') {
		if (this.isInstanceOwner(caller)) return;
		const personal = await this.projectRepository.getPersonalProjectForUserOrFail(caller.id);
		if (personal.id !== owner.id) {
			throw new ForbiddenError(`Only the ${kind} owner can manage its sharing`);
		}
	}

	private async personalProjectIds(userIds: string[]) {
		const unique = [...new Set(userIds)];
		const projects = await Promise.all(
			unique.map(async (id) => await this.projectRepository.getPersonalProjectForUser(id)),
		);
		const missing = unique.filter((_, i) => !projects[i]);
		if (missing.length > 0) throw new NotFoundError(`Unknown user(s): ${missing.join(', ')}`);
		return projects.flatMap((p) => (p ? [p.id] : []));
	}

	private async usersForPersonalProjects(projectIds: string[]): Promise<Sharee[]> {
		const users = await Promise.all(
			projectIds.map(async (id) => await this.userRepository.findPersonalOwnerForProject(id)),
		);
		return users.flatMap((u) => (u ? [this.toSharee(u)] : []));
	}

	private toSharee(u: User): Sharee {
		return { id: u.id, email: u.email, firstName: u.firstName, lastName: u.lastName };
	}
}
