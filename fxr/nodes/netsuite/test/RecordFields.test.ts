import { toRecordBody } from '../nodes/NetSuite/RecordFields';

describe('toRecordBody', () => {
	it('wraps reference fields as { id } and drops empty values', () => {
		const body = toRecordBody(
			'salesOrder',
			{ entity: '42', memo: '', otherRefNum: 'PO-1', location: 'eid:WH-EAST' },
			{},
		);
		expect(body).toEqual({
			entity: { id: '42' },
			otherRefNum: 'PO-1',
			location: { externalId: 'WH-EAST' },
		});
	});

	it('puts sales order lines under item.items', () => {
		const body = toRecordBody(
			'salesOrder',
			{ entity: '42' },
			{ item: [{ item: '7', quantity: 2, rate: 0, location: '' }] },
		);
		expect(body.item).toEqual({ items: [{ item: { id: '7' }, quantity: 2, rate: 0 }] });
	});

	it('puts inventory adjustment lines under inventory.items', () => {
		const body = toRecordBody(
			'inventoryAdjustment',
			{ account: '100', subsidiary: '1' },
			{ item: [{ item: '7', location: '3', adjustQtyBy: -5 }] },
		);
		expect(body).toEqual({
			account: { id: '100' },
			subsidiary: { id: '1' },
			inventory: { items: [{ item: { id: '7' }, location: { id: '3' }, adjustQtyBy: -5 }] },
		});
	});

	it('expands tracking numbers into a package list', () => {
		const body = toRecordBody('itemFulfillment', { createdFrom: '9', trackingNumbers: '1Z1, 1Z2 ,' }, {});
		expect(body).toEqual({
			createdFrom: { id: '9' },
			packageList: { items: [{ packageTrackingNumber: '1Z1' }, { packageTrackingNumber: '1Z2' }] },
		});
	});
});
