import type { ModuleInterface } from '@n8n/decorators';
import { BackendModule } from '@n8n/decorators';

/**
 * FXR: enables team projects for internal use. Provides project creation and tells the UI the
 * team project limit is unlimited. Enable with N8N_ENABLED_MODULES=fxr-projects.
 */
@BackendModule({ name: 'fxr-projects', instanceTypes: ['main'] })
export class FxrProjectsModule implements ModuleInterface {
	async init() {
		await import('./fxr-projects.controller');
	}

	async settings() {
		return await Promise.resolve({ enabled: true, teamProjectsLimit: -1 });
	}
}
