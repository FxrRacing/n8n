import { CreateProjectDto } from '@n8n/api-types';
import type { AuthenticatedRequest } from '@n8n/db';
import { Body, GlobalScope, Post, RestController } from '@n8n/decorators';

import { FxrProjectsService } from './fxr-projects.service';

@RestController('/fxr-projects')
export class FxrProjectsController {
	constructor(private readonly service: FxrProjectsService) {}

	@Post('/')
	@GlobalScope('project:create')
	async createProject(req: AuthenticatedRequest, _res: unknown, @Body body: CreateProjectDto) {
		return await this.service.createTeamProject(req.user, body);
	}
}
