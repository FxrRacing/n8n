import type { InsightsSummary } from '@n8n/api-types';
import type { MockProxy } from 'jest-mock-extended';
import { mock } from 'jest-mock-extended';

import { TypeToNumber } from '../../insights/database/entities/insights-shared';
import type { InsightsService } from '../../insights/insights.service';
import { FxrInsightsService } from '../fxr-insights.service';

describe('FxrInsightsService', () => {
	let upstreamInsightsService: MockProxy<InsightsService>;
	let fxrInsightsService: FxrInsightsService;

	beforeEach(() => {
		jest.resetAllMocks();
		upstreamInsightsService = mock<InsightsService>();
		fxrInsightsService = new FxrInsightsService(upstreamInsightsService);
	});

	describe('getInsightsSummary', () => {
		it('passes dates and project filter through to the upstream service', async () => {
			// ARRANGE
			const summary = mock<InsightsSummary>();
			upstreamInsightsService.getInsightsSummary.mockResolvedValue(summary);
			const startDate = new Date('2025-06-01');
			const endDate = new Date('2025-06-07');

			// ACT
			const result = await fxrInsightsService.getInsightsSummary({
				startDate,
				endDate,
				projectId: 'project-1',
			});

			// ASSERT
			expect(upstreamInsightsService.getInsightsSummary).toHaveBeenCalledWith({
				startDate,
				endDate,
				projectId: 'project-1',
			});
			expect(result).toBe(summary);
		});

		it('passes a missing projectId through as undefined', async () => {
			// ARRANGE
			const startDate = new Date('2025-06-01');
			const endDate = new Date('2025-06-07');

			// ACT
			await fxrInsightsService.getInsightsSummary({ startDate, endDate });

			// ASSERT
			expect(upstreamInsightsService.getInsightsSummary).toHaveBeenCalledWith({
				startDate,
				endDate,
				projectId: undefined,
			});
		});
	});

	describe('getInsightsByWorkflow', () => {
		it('applies the upstream defaults for skip, take and sortBy', async () => {
			// ARRANGE
			upstreamInsightsService.getInsightsByWorkflow.mockResolvedValue({ count: 0, data: [] });
			const startDate = new Date('2025-06-01');
			const endDate = new Date('2025-06-07');

			// ACT
			await fxrInsightsService.getInsightsByWorkflow({ startDate, endDate });

			// ASSERT
			expect(upstreamInsightsService.getInsightsByWorkflow).toHaveBeenCalledWith({
				skip: 0,
				take: 10,
				sortBy: 'total:desc',
				projectId: undefined,
				startDate,
				endDate,
			});
		});

		it('passes explicit pagination, sorting and project filter through', async () => {
			// ARRANGE
			upstreamInsightsService.getInsightsByWorkflow.mockResolvedValue({ count: 1, data: [] });
			const startDate = new Date('2025-06-01');
			const endDate = new Date('2025-06-07');

			// ACT
			await fxrInsightsService.getInsightsByWorkflow({
				skip: 5,
				take: 20,
				sortBy: 'failureRate:asc',
				projectId: 'project-1',
				startDate,
				endDate,
			});

			// ASSERT
			expect(upstreamInsightsService.getInsightsByWorkflow).toHaveBeenCalledWith({
				skip: 5,
				take: 20,
				sortBy: 'failureRate:asc',
				projectId: 'project-1',
				startDate,
				endDate,
			});
		});
	});

	describe('getInsightsByTime', () => {
		it('defaults to all insight types, mirroring the upstream service default', async () => {
			// ARRANGE
			upstreamInsightsService.getInsightsByTime.mockResolvedValue([]);
			const startDate = new Date('2025-06-01');
			const endDate = new Date('2025-06-07');

			// ACT
			await fxrInsightsService.getInsightsByTime({ startDate, endDate });

			// ASSERT
			expect(upstreamInsightsService.getInsightsByTime).toHaveBeenCalledWith({
				insightTypes: Object.keys(TypeToNumber),
				projectId: undefined,
				startDate,
				endDate,
			});
		});

		it('restricts to the requested insight types when provided', async () => {
			// ARRANGE
			upstreamInsightsService.getInsightsByTime.mockResolvedValue([]);
			const startDate = new Date('2025-06-01');
			const endDate = new Date('2025-06-07');

			// ACT
			await fxrInsightsService.getInsightsByTime({
				insightTypes: ['time_saved_min'],
				startDate,
				endDate,
			});

			// ASSERT
			expect(upstreamInsightsService.getInsightsByTime).toHaveBeenCalledWith({
				insightTypes: ['time_saved_min'],
				projectId: undefined,
				startDate,
				endDate,
			});
		});
	});

	describe('license-free pass-through', () => {
		it('only delegates to the three upstream reader methods', async () => {
			// ARRANGE
			upstreamInsightsService.getInsightsSummary.mockResolvedValue(mock<InsightsSummary>());
			upstreamInsightsService.getInsightsByWorkflow.mockResolvedValue({ count: 0, data: [] });
			upstreamInsightsService.getInsightsByTime.mockResolvedValue([]);
			const startDate = new Date('2025-06-01');
			const endDate = new Date('2025-06-07');

			// ACT
			await fxrInsightsService.getInsightsSummary({ startDate, endDate });
			await fxrInsightsService.getInsightsByWorkflow({ startDate, endDate });
			await fxrInsightsService.getInsightsByTime({ startDate, endDate });

			// ASSERT — engine lifecycle and license validation stay with the upstream module.
			expect(upstreamInsightsService.getInsightsSummary).toHaveBeenCalledTimes(1);
			expect(upstreamInsightsService.getInsightsByWorkflow).toHaveBeenCalledTimes(1);
			expect(upstreamInsightsService.getInsightsByTime).toHaveBeenCalledTimes(1);
			expect(upstreamInsightsService.validateDateFiltersLicense).not.toHaveBeenCalled();
			expect(upstreamInsightsService.init).not.toHaveBeenCalled();
			expect(upstreamInsightsService.shutdown).not.toHaveBeenCalled();
		});
	});
});
