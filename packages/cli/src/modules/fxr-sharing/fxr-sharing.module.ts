import type { ModuleInterface } from '@n8n/decorators';
import { BackendModule } from '@n8n/decorators';

/**
 * FXR: lets a workflow or credential owner grant other users of this instance
 * editor/user access, using the existing shared_workflow and shared_credentials
 * tables. Enable with N8N_ENABLED_MODULES=fxr-sharing.
 */
@BackendModule({ name: 'fxr-sharing', instanceTypes: ['main'] })
export class FxrSharingModule implements ModuleInterface {
	async init() {
		await import('./fxr-sharing.controller');
	}

	async settings() {
		return await Promise.resolve({ enabled: true });
	}
}
