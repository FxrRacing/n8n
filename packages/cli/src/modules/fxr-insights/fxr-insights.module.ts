import type { ModuleInterface } from '@n8n/decorators';
import { BackendModule } from '@n8n/decorators';
import { Container } from '@n8n/di';

/**
 * FXR: re-exposes n8n's (license-gated) Insights analytics for fork users. Reads through the
 * upstream insights engine (same tables/entities/services — that module stays enabled and owns
 * collection/compaction/pruning). Serves /rest/fxr-insights/* without any license checks so the
 * dashboard works on the fork. Enable with N8N_ENABLED_MODULES=fxr-insights.
 */
@BackendModule({ name: 'fxr-insights', instanceTypes: ['main', 'webhook'] })
export class FxrInsightsModule implements ModuleInterface {
	async init() {
		await import('./fxr-insights.controller');
	}

	async settings() {
		const { FxrInsightsSettings } = await import('./fxr-insights.settings');
		return Container.get(FxrInsightsSettings).settings();
	}
}
