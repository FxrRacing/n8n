import { Service } from '@n8n/di';
import type { InsightsByWorkflow, InsightsSummary } from '@n8n/api-types';

import { TypeToNumber } from '../insights/database/entities/insights-shared';
import type { TypeUnit } from '../insights/database/entities/insights-shared';
import { InsightsService } from '../insights/insights.service';

/**
 * FXR: thin license-free wrapper over the upstream engine's read methods. No
 * `validateDateFiltersLicense` here — the fork serves all history and granularities. Engine
 * lifecycle (`init`/`shutdown`) stays with the upstream module.
 */
@Service()
export class FxrInsightsService {
	constructor(private readonly insightsService: InsightsService) {}

	async getInsightsSummary({
		startDate,
		endDate,
		projectId,
	}: {
		startDate: Date;
		endDate: Date;
		projectId?: string;
	}): Promise<InsightsSummary> {
		return await this.insightsService.getInsightsSummary({ startDate, endDate, projectId });
	}

	async getInsightsByWorkflow({
		skip = 0,
		take = 10,
		sortBy = 'total:desc',
		projectId,
		startDate,
		endDate,
	}: {
		skip?: number;
		take?: number;
		sortBy?: string;
		projectId?: string;
		startDate: Date;
		endDate: Date;
	}): Promise<InsightsByWorkflow> {
		return await this.insightsService.getInsightsByWorkflow({
			skip,
			take,
			sortBy,
			projectId,
			startDate,
			endDate,
		});
	}

	async getInsightsByTime({
		// Default to all insight types
		insightTypes = Object.keys(TypeToNumber) as TypeUnit[],
		projectId,
		startDate,
		endDate,
	}: {
		insightTypes?: TypeUnit[];
		projectId?: string;
		startDate: Date;
		endDate: Date;
	}) {
		return await this.insightsService.getInsightsByTime({
			insightTypes,
			projectId,
			startDate,
			endDate,
		});
	}
}
