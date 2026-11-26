import type {
	InsightsByTime,
	InsightsByWorkflow,
	InsightsSummary,
	RestrictedInsightsByTime,
} from '@n8n/api-types';
import { InsightsDateFilterDto, ListInsightsWorkflowQueryDto } from '@n8n/api-types';
import { AuthenticatedRequest } from '@n8n/db';
import { Get, GlobalScope, Query, RestController } from '@n8n/decorators';
import { DateTime } from 'luxon';
import { z } from 'zod';

import { InsightsService } from '@n8n/backend-module-insights';
import { BadRequestError } from '@n8n/errors';

/**
 * FXR: mirrors upstream /insights routes without license gating — no @Licensed decorators and
 * no validateDateFiltersLicense; date defaulting/sanitization is ported verbatim. Reads go
 * straight to the upstream InsightsService, so per-user access filtering and time zone handling
 * are upstream's.
 */
@RestController('/fxr-insights')
export class FxrInsightsController {
	constructor(private readonly insightsService: InsightsService) {}

	@Get('/summary')
	@GlobalScope('insights:list')
	async getInsightsSummary(
		req: AuthenticatedRequest,
		_res: Response,
		@Query query: InsightsDateFilterDto = {},
	): Promise<InsightsSummary> {
		const { startDate, endDate, timeZone } = this.prepareDateFilters(query);

		return await this.insightsService.getInsightsSummary({
			user: req.user,
			startDate,
			endDate,
			timeZone,
			projectId: query.projectId,
		});
	}

	@Get('/by-workflow')
	@GlobalScope('insights:list')
	async getInsightsByWorkflow(
		req: AuthenticatedRequest,
		_res: Response,
		@Query query: ListInsightsWorkflowQueryDto,
	): Promise<InsightsByWorkflow> {
		const { startDate, endDate, timeZone } = this.prepareDateFilters(query);

		return await this.insightsService.getInsightsByWorkflow({
			user: req.user,
			skip: query.skip,
			take: query.take,
			sortBy: query.sortBy,
			projectId: query.projectId,
			startDate,
			endDate,
			timeZone,
		});
	}

	@Get('/by-time')
	@GlobalScope('insights:list')
	async getInsightsByTime(
		req: AuthenticatedRequest,
		_res: Response,
		@Query query: InsightsDateFilterDto,
	): Promise<InsightsByTime[]> {
		const { startDate, endDate, timeZone } = this.prepareDateFilters(query);

		return await this.insightsService.getInsightsByTime({
			user: req.user,
			projectId: query.projectId,
			startDate,
			endDate,
			timeZone,
		});
	}

	/**
	 * This endpoint is used to get the time saved insights by time.
	 * time data for time saved insights is not restricted by the license
	 */
	@Get('/by-time/time-saved')
	@GlobalScope('insights:list')
	async getTimeSavedInsightsByTime(
		req: AuthenticatedRequest,
		_res: Response,
		@Query query: InsightsDateFilterDto,
	): Promise<RestrictedInsightsByTime[]> {
		const { startDate, endDate, timeZone } = this.prepareDateFilters(query);

		return await this.insightsService.getTimeSavedInsightsByTime({
			user: req.user,
			projectId: query.projectId,
			startDate,
			endDate,
			timeZone,
		});
	}

	private validateQueryDates(query: InsightsDateFilterDto | ListInsightsWorkflowQueryDto) {
		const schema = z
			.object({
				startDate: z.coerce.date().optional(),
				endDate: z.coerce.date().optional(),
			})
			.refine(
				(data) => {
					if (data.startDate && data.endDate) {
						return data.startDate <= data.endDate;
					}
					return true;
				},
				{
					message: 'endDate must be the same as or after startDate',
					path: ['endDate'],
				},
			);

		const result = schema.safeParse(query);
		if (!result.success) {
			throw new BadRequestError(result.error.errors.map(({ message }) => message).join(' '));
		}
	}

	private prepareDateFilters(query: InsightsDateFilterDto | ListInsightsWorkflowQueryDto): {
		startDate: Date;
		endDate: Date;
		timeZone?: string;
	} {
		this.validateQueryDates(query);
		return this.getSanitizedDateFilters(query);
	}

	/**
	 * When the `startDate` is not provided, we default to the last 7 days.
	 * When the `endDate` is not provided, we default to today.
	 */
	private getSanitizedDateFilters(query: InsightsDateFilterDto | ListInsightsWorkflowQueryDto): {
		startDate: Date;
		endDate: Date;
		timeZone?: string;
	} {
		const today = new Date();
		const timeZone = query.timeZone;

		if (!query.startDate) {
			return {
				startDate: DateTime.now().minus({ days: 7 }).toJSDate(),
				endDate: today,
				timeZone,
			};
		}

		return { startDate: query.startDate, endDate: query.endDate ?? today, timeZone };
	}
}
