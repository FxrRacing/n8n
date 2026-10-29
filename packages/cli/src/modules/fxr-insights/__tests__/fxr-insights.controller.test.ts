import { ControllerRegistryMetadata } from '@n8n/decorators';
import type { InsightsSummary } from '@n8n/api-types';
import type { AuthenticatedRequest } from '@n8n/db';
import { Container } from '@n8n/di';
import { mock } from 'jest-mock-extended';
import { DateTime } from 'luxon';

import { BadRequestError } from '@/errors/response-errors/bad-request.error';

import { FxrInsightsController } from '../fxr-insights.controller';
import type { FxrInsightsService } from '../fxr-insights.service';

function expectDatesClose(actual: Date, expected: Date, maxDriftMs?: number) {
	const maxDrift = maxDriftMs ?? 60000; // default to 1 minute
	expect(Math.abs(actual.getTime() - expected.getTime())).toBeLessThanOrEqual(maxDrift);
}

describe('FxrInsightsController', () => {
	const fxrInsightsService = mock<FxrInsightsService>();
	let controller: FxrInsightsController;
	const sevenDaysAgo = DateTime.now().minus({ days: 7 }).toJSDate();
	const today = DateTime.now().toJSDate();

	beforeAll(() => {
		controller = new FxrInsightsController(fxrInsightsService);
	});

	beforeEach(() => {
		jest.resetAllMocks();
	});

	describe('route metadata', () => {
		const metadata = Container.get(ControllerRegistryMetadata).getControllerMetadata(
			FxrInsightsController as never,
		);
		const routeCases = Array.from(metadata.routes.entries()).map(([handlerName, route]) => ({
			handlerName,
			route,
		}));

		it('registers the four GET routes under /fxr-insights with the insights:list scope', () => {
			// ASSERT
			expect(metadata.basePath).toBe('/fxr-insights');
			expect(routeCases).toHaveLength(4);
		});

		it.each(routeCases)('$route.path is a scoped GET route', ({ route }) => {
			// ASSERT
			expect(route.method).toBe('get');
			expect(route.skipAuth).toBe(false);
			expect(route.accessScope).toEqual({ scope: 'insights:list', globalOnly: true });
		});

		it.each([
			['getInsightsSummary', '/summary'],
			['getInsightsByWorkflow', '/by-workflow'],
			['getInsightsByTime', '/by-time'],
			['getTimeSavedInsightsByTime', '/by-time/time-saved'],
		])('%s serves %s', (handlerName, path) => {
			// ASSERT
			const route = metadata.routes.get(handlerName);
			expect(route?.path).toBe(path);
		});
	});

	describe('getInsightsSummary', () => {
		it('should default the date range to the last 7 days when no dates are provided', async () => {
			// ARRANGE
			const summary = mock<InsightsSummary>();
			fxrInsightsService.getInsightsSummary.mockResolvedValue(summary);

			// ACT
			const response = await controller.getInsightsSummary(
				mock<AuthenticatedRequest>(),
				mock<Response>(),
			);

			// ASSERT
			expect(response).toBe(summary);
			expect(fxrInsightsService.getInsightsSummary).toHaveBeenCalledWith(
				expect.objectContaining({
					startDate: expect.any(Date),
					endDate: expect.any(Date),
					projectId: undefined,
				}),
			);
			const callArgs = fxrInsightsService.getInsightsSummary.mock.calls[0][0];
			expectDatesClose(callArgs.startDate, sevenDaysAgo);
			expectDatesClose(callArgs.endDate, today);
		});

		it('should use the query filters when provided', async () => {
			// ARRANGE
			const summary = mock<InsightsSummary>();
			fxrInsightsService.getInsightsSummary.mockResolvedValue(summary);
			const startDate = DateTime.now().minus({ days: 12, hours: 12 }).toJSDate();
			const endDate = DateTime.now().minus({ days: 4, hours: 5 }).toJSDate();

			// ACT
			const response = await controller.getInsightsSummary(
				mock<AuthenticatedRequest>(),
				mock<Response>(),
				{ startDate, endDate, projectId: 'test-project' },
			);

			// ASSERT
			expect(fxrInsightsService.getInsightsSummary).toHaveBeenCalledWith({
				startDate,
				endDate,
				projectId: 'test-project',
			});
			expect(response).toBe(summary);
		});

		it('should default the endDate to today when not provided', async () => {
			// ARRANGE
			fxrInsightsService.getInsightsSummary.mockResolvedValue(mock());
			const startDate = DateTime.now().startOf('day').minus({ days: 12, minutes: 43 }).toJSDate();

			// ACT
			await controller.getInsightsSummary(mock<AuthenticatedRequest>(), mock<Response>(), {
				startDate,
				projectId: 'test-project',
			});

			// ASSERT
			const callArgs = fxrInsightsService.getInsightsSummary.mock.calls[0][0];
			expect(callArgs.startDate).toBe(startDate);
			expectDatesClose(callArgs.endDate, today);
			expect(callArgs.projectId).toBe('test-project');
		});

		it('should throw a BadRequestError when endDate is before startDate', async () => {
			// ARRANGE
			const execution = controller.getInsightsSummary(
				mock<AuthenticatedRequest>(),
				mock<Response>(),
				{
					startDate: new Date('2025-06-10'),
					endDate: new Date('2025-06-01'),
				},
			);

			// ASSERT
			await expect(execution).rejects.toThrow(BadRequestError);
			await expect(execution).rejects.toThrow('endDate must be the same as or after startDate');
			expect(fxrInsightsService.getInsightsSummary).not.toHaveBeenCalled();
		});
	});

	describe('getInsightsByWorkflow', () => {
		const query = { skip: 5, take: 10, sortBy: 'failureRate:asc' as const };

		it('should pass pagination, sorting and the sanitized date filters through', async () => {
			// ARRANGE
			fxrInsightsService.getInsightsByWorkflow.mockResolvedValue({ count: 0, data: [] });

			// ACT
			const response = await controller.getInsightsByWorkflow(
				mock<AuthenticatedRequest>(),
				mock<Response>(),
				{ ...query, projectId: 'test-project' },
			);

			// ASSERT
			expect(fxrInsightsService.getInsightsByWorkflow).toHaveBeenCalledWith(
				expect.objectContaining({
					skip: 5,
					take: 10,
					sortBy: 'failureRate:asc',
					projectId: 'test-project',
					startDate: expect.any(Date),
					endDate: expect.any(Date),
				}),
			);
			const callArgs = fxrInsightsService.getInsightsByWorkflow.mock.calls[0][0];
			expectDatesClose(callArgs.startDate, sevenDaysAgo);
			expectDatesClose(callArgs.endDate, today);
			expect(response).toEqual({ count: 0, data: [] });
		});

		it('should throw a BadRequestError when endDate is before startDate', async () => {
			// ARRANGE
			const execution = controller.getInsightsByWorkflow(
				mock<AuthenticatedRequest>(),
				mock<Response>(),
				{
					...query,
					startDate: new Date('2025-06-10'),
					endDate: new Date('2025-06-01'),
				},
			);

			// ASSERT
			await expect(execution).rejects.toThrow(BadRequestError);
			await expect(execution).rejects.toThrow('endDate must be the same as or after startDate');
			expect(fxrInsightsService.getInsightsByWorkflow).not.toHaveBeenCalled();
		});
	});

	describe('getInsightsByTime', () => {
		it('should request all insight types (no restriction)', async () => {
			// ARRANGE
			fxrInsightsService.getInsightsByTime.mockResolvedValue([]);

			// ACT
			const response = await controller.getInsightsByTime(
				mock<AuthenticatedRequest>(),
				mock<Response>(),
				{},
			);

			// ASSERT
			expect(fxrInsightsService.getInsightsByTime).toHaveBeenCalledWith({
				insightTypes: undefined,
				projectId: undefined,
				startDate: expect.any(Date),
				endDate: expect.any(Date),
			});
			const callArgs = fxrInsightsService.getInsightsByTime.mock.calls[0][0];
			expectDatesClose(callArgs.startDate, sevenDaysAgo);
			expectDatesClose(callArgs.endDate, today);
			expect(response).toEqual([]);
		});
	});

	describe('getTimeSavedInsightsByTime', () => {
		it('restricts the query to the time_saved_min type', async () => {
			// ARRANGE
			fxrInsightsService.getInsightsByTime.mockResolvedValue([]);

			// ACT
			const response = await controller.getTimeSavedInsightsByTime(
				mock<AuthenticatedRequest>(),
				mock<Response>(),
				{ projectId: 'test-project' },
			);

			// ASSERT
			expect(fxrInsightsService.getInsightsByTime).toHaveBeenCalledWith({
				insightTypes: ['time_saved_min'],
				projectId: 'test-project',
				startDate: expect.any(Date),
				endDate: expect.any(Date),
			});
			const callArgs = fxrInsightsService.getInsightsByTime.mock.calls[0][0];
			expectDatesClose(callArgs.startDate, sevenDaysAgo);
			expectDatesClose(callArgs.endDate, today);
			expect(response).toEqual([]);
		});
	});
});
