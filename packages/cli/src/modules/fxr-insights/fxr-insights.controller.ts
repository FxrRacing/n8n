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

import { BadRequestError } from '@/errors/response-errors/bad-request.error';

import { FxrInsightsService } from './fxr-insights.service';

/**
 * FXR: mirrors upstream /insights routes without license gating — no @Licensed decorators and
 * no validateDateFiltersLicense; date defaulting/sanitization is ported verbatim.
 */
@RestController('/fxr-insights')
export class FxrInsightsController {
	constructor(private readonly fxrInsightsService: FxrInsightsService) {}

	@Get('/summary')
	@GlobalScope('insights:list')
	async getInsightsSummary(
		_req: AuthenticatedRequest,
		_res: Response,
		@Query query: InsightsDateFilterDto = {},
	): Promise<InsightsSummary> {
		const { startDate, endDate } = this.prepareDateFilters(query);

		return await this.fxrInsightsService.getInsightsSummary({
			startDate,
			endDate,
			projectId: query.projectId,
		});
	}

	@Get('/by-workflow')
	@GlobalScope('insights:list')
	async getInsightsByWorkflow(
		_req: AuthenticatedRequest,
		_res: Response,
		@Query query: ListInsightsWorkflowQueryDto,
	): Promise<InsightsByWorkflow> {
		const { startDate, endDate } = this.prepareDateFilters(query);

		return await this.fxrInsightsService.getInsightsByWorkflow({
			skip: query.skip,
			take: query.take,
			sortBy: query.sortBy,
			projectId: query.projectId,
			startDate,
			endDate,
		});
	}

	@Get('/by-time')
	@GlobalScope('insights:list')
	async getInsightsByTime(
		_req: AuthenticatedRequest,
		_res: Response,
		@Query query: InsightsDateFilterDto,
	): Promise<InsightsByTime[]> {
		const { startDate, endDate } = this.prepareDateFilters(query);

		// Cast to full insights by time type
		// as the service returns all types by default
		return (await this.fxrInsightsService.getInsightsByTime({
			projectId: query.projectId,
			startDate,
			endDate,
		})) as InsightsByTime[];
	}

	/**
	 * This endpoint is used to get the time saved insights by time.
	 * time data for time saved insights is not restricted by the license
	 */
	@Get('/by-time/time-saved')
	@GlobalScope('insights:list')
	async getTimeSavedInsightsByTime(
		_req: AuthenticatedRequest,
		_res: Response,
		@Query query: InsightsDateFilterDto,
	): Promise<RestrictedInsightsByTime[]> {
		const { startDate, endDate } = this.prepareDateFilters(query);

		// Cast to restricted insights by time type
		// as the service returns only time saved data
		return (await this.fxrInsightsService.getInsightsByTime({
			insightTypes: ['time_saved_min'],
			projectId: query.projectId,
			startDate,
			endDate,
		})) as RestrictedInsightsByTime[];
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
	} {
		const today = new Date();

		if (!query.startDate) {
			return {
				startDate: DateTime.now().minus({ days: 7 }).toJSDate(),
				endDate: today,
			};
		}

		return { startDate: query.startDate, endDate: query.endDate ?? today };
	}
}
