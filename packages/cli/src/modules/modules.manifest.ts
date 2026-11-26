import type { PackagedModules } from '@n8n/backend-common';
import { Container } from '@n8n/di';

/**
 * Backend modules that load from workspace packages instead of this directory.
 * Keep each import in a thunk so an ineligible module is not imported.
 */
export const packagedModules: PackagedModules = {
	'data-table': async () => await import('@n8n/backend-module-data-table/module'),
	insights: async () => await import('@n8n/backend-module-insights/module'),
	'quick-connect': async () => await import('@n8n/backend-module-quick-connect/module'),
	'workflow-builder': async () => await import('@n8n/backend-module-workflow-builder/module'),
	apps: async () => {
		const { AppSandboxSettings, AppBindingAdapters } = await import('@n8n/backend-module-apps');
		const { resolveAppSandboxConfig } = await import('./apps/sandbox-settings.js');
		const { AppDataTableAdapter } = await import('./apps/bindings/app-data-table.adapter.js');
		const { AppWorkflowAdapter } = await import('./apps/bindings/app-workflow.adapter.js');
		const { AppAgentAdapter } = await import('./apps/bindings/app-agent.adapter.js');
		Container.set(AppSandboxSettings, { resolve: resolveAppSandboxConfig });
		Container.set(AppBindingAdapters, {
			resolve: () => ({
				dataTables: Container.get(AppDataTableAdapter),
				workflows: Container.get(AppWorkflowAdapter),
				agents: Container.get(AppAgentAdapter),
			}),
		});
		return await import('@n8n/backend-module-apps/module');
	},
	'execution-limits': async () => await import('@n8n/backend-module-execution-limits/module'),
	'execution-ledger': async () => await import('@n8n/backend-module-execution-ledger/module'),
	'durable-leases': async () => await import('@n8n/backend-module-durable-leases/module'),
	// FXR modules, all from the one @n8n/backend-module-fxr package.
	'fxr-insights': async () => await import('@n8n/backend-module-fxr/fxr-insights/module'),
	'fxr-projects': async () => await import('@n8n/backend-module-fxr/fxr-projects/module'),
	'fxr-sharing': async () => await import('@n8n/backend-module-fxr/fxr-sharing/module'),
	'fxr-sso': async () => {
		const { FxrSsoSessionIssuer } = await import('@n8n/backend-module-fxr');
		const { AuthService } = await import('@/auth/auth.service.js');
		Container.set(FxrSsoSessionIssuer, {
			issueCookie: (res, person, browserId) =>
				Container.get(AuthService).issueCookie(res, person, false, browserId),
		});
		return await import('@n8n/backend-module-fxr/fxr-sso/module');
	},
};
