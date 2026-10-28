import { buildTriggerQuery } from '../nodes/NetSuite/NetSuiteTrigger.node';

describe('buildTriggerQuery', () => {
	const since = new Date('2026-10-28T10:00:00Z');

	it('filters transactions by type and lastmodifieddate for updated events', () => {
		expect(
			buildTriggerQuery({ table: 'transaction', event: 'updated', since, transactionType: 'SalesOrd' }),
		).toBe(
			"SELECT * FROM transaction WHERE lastmodifieddate >= TO_TIMESTAMP('2026-10-28 10:00:00', 'YYYY-MM-DD HH24:MI:SS') AND type = 'SalesOrd' ORDER BY lastmodifieddate ASC",
		);
	});

	it('uses datecreated for created events and honours columns and extra conditions', () => {
		expect(
			buildTriggerQuery({
				table: 'customer',
				event: 'created',
				since,
				columns: 'id, entityid',
				extraWhere: "isinactive = 'F'",
			}),
		).toBe(
			"SELECT id, entityid FROM customer WHERE datecreated >= TO_TIMESTAMP('2026-10-28 10:00:00', 'YYYY-MM-DD HH24:MI:SS') AND (isinactive = 'F') ORDER BY datecreated ASC",
		);
	});

	it('ignores transaction type for non-transaction tables', () => {
		expect(buildTriggerQuery({ table: 'item', event: 'updated', since, transactionType: 'SalesOrd' })).not.toContain('type =');
	});
});
