import type { InsightsDateRange } from '@n8n/api-types';
import { Service } from '@n8n/di';

/** Range keys and their length in days, matching the upstream insights module. */
const RANGE_DAYS: Record<InsightsDateRange['key'], number> = {
	day: 1,
	week: 7,
	'2weeks': 14,
	month: 30,
	quarter: 90,
	'6months': 180,
	year: 365,
};

/**
 * FXR: same settings shape the upstream `insights` module serves (so the frontend range picker
 * ports unchanged), computed without LicenseState — every range is licensed on the fork.
 */
@Service()
export class FxrInsightsSettings {
	settings() {
		return {
			summary: true,
			dashboard: true,
			dateRanges: this.getAvailableDateRanges(),
		};
	}

	private getAvailableDateRanges(): InsightsDateRange[] {
		return Object.entries(RANGE_DAYS).map(([key, days]) => ({
			key: key as InsightsDateRange['key'],
			licensed: true,
			granularity: key === 'day' ? 'hour' : days <= 30 ? 'day' : 'week',
		}));
	}
}
