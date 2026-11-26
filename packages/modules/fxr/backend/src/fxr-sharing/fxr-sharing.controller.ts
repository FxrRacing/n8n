import type { AuthenticatedRequest } from '@n8n/db';
import { Body, Get, GlobalScope, Param, ProjectScope, Put, RestController } from '@n8n/decorators';

import { SetShareesDto } from './dto/set-sharees.dto';
import { FxrSharingService } from './fxr-sharing.service';

@RestController('/fxr-sharing')
export class FxrSharingController {
	constructor(private readonly service: FxrSharingService) {}

	@Get('/users')
	@GlobalScope('user:list')
	async listUsers(req: AuthenticatedRequest) {
		return await this.service.listCandidateUsers(req.user);
	}

	@Get('/workflows/:workflowId')
	@ProjectScope('workflow:read')
	async getWorkflowSharees(
		req: AuthenticatedRequest,
		_res: unknown,
		@Param('workflowId') workflowId: string,
	) {
		return await this.service.getWorkflowShareState(req.user, workflowId);
	}

	@Put('/workflows/:workflowId')
	@ProjectScope('workflow:update')
	async setWorkflowSharees(
		req: AuthenticatedRequest,
		_res: unknown,
		@Param('workflowId') workflowId: string,
		@Body body: SetShareesDto,
	) {
		return await this.service.setWorkflowSharees(req.user, workflowId, body.userIds);
	}

	@Get('/credentials/:credentialId')
	@ProjectScope('credential:read')
	async getCredentialSharees(
		req: AuthenticatedRequest,
		_res: unknown,
		@Param('credentialId') credentialId: string,
	) {
		return await this.service.getCredentialShareState(req.user, credentialId);
	}

	@Put('/credentials/:credentialId')
	@ProjectScope('credential:update')
	async setCredentialSharees(
		req: AuthenticatedRequest,
		_res: unknown,
		@Param('credentialId') credentialId: string,
		@Body body: SetShareesDto,
	) {
		return await this.service.setCredentialSharees(req.user, credentialId, body.userIds);
	}
}
