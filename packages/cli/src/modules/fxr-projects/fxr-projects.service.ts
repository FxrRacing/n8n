import type { CreateProjectDto } from '@n8n/api-types';
import { ProjectRelationRepository, ProjectRepository, RoleRepository, type User } from '@n8n/db';
import { Service } from '@n8n/di';

import { BadRequestError } from '@/errors/response-errors/bad-request.error';

const PROJECT_ADMIN = 'project:admin';

@Service()
export class FxrProjectsService {
	constructor(
		private readonly projectRepository: ProjectRepository,
		private readonly projectRelationRepository: ProjectRelationRepository,
		private readonly roleRepository: RoleRepository,
	) {}

	/** Creates a team project and makes the caller its admin. */
	async createTeamProject(user: User, dto: CreateProjectDto) {
		const adminRole = await this.roleRepository.findBySlug(PROJECT_ADMIN);
		if (!adminRole) throw new BadRequestError(`Role ${PROJECT_ADMIN} is not available`);

		const project = await this.projectRepository.save(
			this.projectRepository.create({
				name: dto.name,
				type: 'team',
				icon: dto.icon ?? null,
				description: null,
				creatorId: user.id,
			}),
		);

		await this.projectRelationRepository.save(
			this.projectRelationRepository.create({
				projectId: project.id,
				userId: user.id,
				role: { slug: PROJECT_ADMIN },
			}),
		);

		const globalRole = user.role?.slug
			? await this.roleRepository.findBySlug(user.role.slug)
			: null;
		const scopes = [
			...new Set([
				...(globalRole?.scopes ?? []).map((s) => s.slug),
				...adminRole.scopes.map((s) => s.slug),
			]),
		];

		return { ...project, role: PROJECT_ADMIN, scopes };
	}
}
