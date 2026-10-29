import { Service } from '@n8n/di';

import { INSIGHTS_DATE_RANGE_KEYS, keyRangeToDays } from '../insights/insights.constants';

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

	private getAvailableDateRanges(): DateRange[] {
		return INSIGHTS_DATE_RANGE_KEYS.map((key) => ({
			key,
			licensed: true,
			granularity: key === 'day' ? 'hour' : keyRangeToDays[key] <= 30 ? 'day' : 'week',
		}));
	}
}

type DateRange = {
	key: 'day' | 'week' | '2weeks' | 'month' | 'quarter' | '6months' | 'year';
	licensed: boolean;
	granularity: 'hour' | 'day' | 'week';
};
