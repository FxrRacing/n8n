import type { IDataObject, INodeProperties } from 'n8n-workflow';

/**
 * Typed field definitions for the most common FXR record types. Anything not covered here is
 * entered as JSON. Each typed record type exposes a `fields` collection for scalar fields and,
 * where relevant, a `lines` fixedCollection for sublists. `toRecordBody` turns the UI values into a
 * SuiteTalk REST body.
 */

export const TYPED_RECORD_TYPES = [
	'salesOrder',
	'customer',
	'itemFulfillment',
	'inventoryAdjustment',
] as const;
export type TypedRecordType = (typeof TYPED_RECORD_TYPES)[number];

const ref = (displayName: string, name: string, description: string): INodeProperties => ({
	displayName,
	name,
	type: 'string',
	default: '',
	description: `${description}. Internal ID.`,
});

const showFor = (recordType: TypedRecordType, extra: IDataObject = {}) => ({
	show: {
		resource: ['record'],
		operation: ['create', 'update'],
		inputMode: ['fields'],
		recordType: [recordType],
		...extra,
	},
});

// ---------------------------------------------------------------------------
// Sales Order
// ---------------------------------------------------------------------------

const salesOrderFields: INodeProperties = {
	displayName: 'Fields',
	name: 'fields',
	type: 'collection',
	placeholder: 'Add Field',
	default: {},
	displayOptions: showFor('salesOrder'),
	options: [
		ref('Customer', 'entity', 'Customer the order belongs to'),
		{ displayName: 'Date', name: 'tranDate', type: 'dateTime', default: '', description: 'Transaction date' },
		{ displayName: 'PO / Reference Number', name: 'otherRefNum', type: 'string', default: '' },
		{ displayName: 'Memo', name: 'memo', type: 'string', default: '' },
		ref('Location', 'location', 'Fulfilment location'),
		ref('Subsidiary', 'subsidiary', 'Subsidiary'),
		ref('Department', 'department', 'Department'),
		ref('Class', 'class', 'Class'),
		{
			displayName: 'Order Status',
			name: 'orderStatus',
			type: 'options',
			default: 'B',
			options: [
				{ name: 'Pending Approval', value: 'A' },
				{ name: 'Pending Fulfillment', value: 'B' },
			],
		},
		ref('Shipping Method', 'shipMethod', 'Shipping item'),
		{ displayName: 'Shipping Cost', name: 'shippingCost', type: 'number', default: 0 },
		{ displayName: 'External ID', name: 'externalId', type: 'string', default: '' },
	],
};

const salesOrderLines: INodeProperties = {
	displayName: 'Items',
	name: 'lines',
	type: 'fixedCollection',
	typeOptions: { multipleValues: true },
	placeholder: 'Add Item',
	default: {},
	displayOptions: showFor('salesOrder'),
	options: [
		{
			name: 'item',
			displayName: 'Item',
			values: [
				ref('Item', 'item', 'Item to sell'),
				{ displayName: 'Quantity', name: 'quantity', type: 'number', default: 1 },
				{ displayName: 'Rate', name: 'rate', type: 'number', default: 0, description: 'Unit price. Leave 0 to use the item price.' },
				ref('Location', 'location', 'Line-level location'),
				{ displayName: 'Description', name: 'description', type: 'string', default: '' },
			],
		},
	],
};

// ---------------------------------------------------------------------------
// Customer
// ---------------------------------------------------------------------------

const customerFields: INodeProperties = {
	displayName: 'Fields',
	name: 'fields',
	type: 'collection',
	placeholder: 'Add Field',
	default: {},
	displayOptions: showFor('customer'),
	options: [
		{ displayName: 'Is Individual', name: 'isPerson', type: 'boolean', default: false },
		{ displayName: 'Company Name', name: 'companyName', type: 'string', default: '' },
		{ displayName: 'First Name', name: 'firstName', type: 'string', default: '' },
		{ displayName: 'Last Name', name: 'lastName', type: 'string', default: '' },
		{ displayName: 'Email', name: 'email', type: 'string', default: '', placeholder: 'name@example.com' },
		{ displayName: 'Phone', name: 'phone', type: 'string', default: '' },
		ref('Subsidiary', 'subsidiary', 'Subsidiary'),
		ref('Sales Rep', 'salesRep', 'Sales rep'),
		ref('Price Level', 'priceLevel', 'Price level'),
		ref('Terms', 'terms', 'Payment terms'),
		{ displayName: 'Comments', name: 'comments', type: 'string', default: '' },
		{ displayName: 'External ID', name: 'externalId', type: 'string', default: '' },
	],
};

// ---------------------------------------------------------------------------
// Item Fulfillment
// ---------------------------------------------------------------------------

const itemFulfillmentFields: INodeProperties = {
	displayName: 'Fields',
	name: 'fields',
	type: 'collection',
	placeholder: 'Add Field',
	default: {},
	displayOptions: showFor('itemFulfillment'),
	options: [
		ref('Created From (Sales Order)', 'createdFrom', 'Sales order being fulfilled'),
		{
			displayName: 'Ship Status',
			name: 'shipStatus',
			type: 'options',
			default: 'C',
			options: [
				{ name: 'Picked', value: 'A' },
				{ name: 'Packed', value: 'B' },
				{ name: 'Shipped', value: 'C' },
			],
		},
		{ displayName: 'Date', name: 'tranDate', type: 'dateTime', default: '' },
		{ displayName: 'Memo', name: 'memo', type: 'string', default: '' },
		{ displayName: 'Tracking Numbers', name: 'trackingNumbers', type: 'string', default: '', description: 'Comma-separated' },
		{ displayName: 'External ID', name: 'externalId', type: 'string', default: '' },
	],
};

const itemFulfillmentLines: INodeProperties = {
	displayName: 'Items',
	name: 'lines',
	type: 'fixedCollection',
	typeOptions: { multipleValues: true },
	placeholder: 'Add Item',
	default: {},
	displayOptions: showFor('itemFulfillment'),
	description: 'Leave empty to fulfil every line on the sales order',
	options: [
		{
			name: 'item',
			displayName: 'Item',
			values: [
				{ displayName: 'Order Line', name: 'orderLine', type: 'number', default: 1, description: 'Line number on the sales order' },
				{ displayName: 'Quantity', name: 'quantity', type: 'number', default: 1 },
				ref('Location', 'location', 'Ship-from location'),
				{ displayName: 'Fulfil', name: 'itemReceive', type: 'boolean', default: true },
			],
		},
	],
};

// ---------------------------------------------------------------------------
// Inventory Adjustment
// ---------------------------------------------------------------------------

const inventoryAdjustmentFields: INodeProperties = {
	displayName: 'Fields',
	name: 'fields',
	type: 'collection',
	placeholder: 'Add Field',
	default: {},
	displayOptions: showFor('inventoryAdjustment'),
	options: [
		ref('Adjustment Account', 'account', 'GL account to post the adjustment against'),
		ref('Subsidiary', 'subsidiary', 'Subsidiary'),
		ref('Location', 'adjLocation', 'Default adjustment location'),
		{ displayName: 'Date', name: 'tranDate', type: 'dateTime', default: '' },
		{ displayName: 'Memo', name: 'memo', type: 'string', default: '' },
		{ displayName: 'External ID', name: 'externalId', type: 'string', default: '' },
	],
};

const inventoryAdjustmentLines: INodeProperties = {
	displayName: 'Inventory Lines',
	name: 'lines',
	type: 'fixedCollection',
	typeOptions: { multipleValues: true },
	placeholder: 'Add Line',
	default: {},
	displayOptions: showFor('inventoryAdjustment'),
	options: [
		{
			name: 'item',
			displayName: 'Line',
			values: [
				ref('Item', 'item', 'Inventory item'),
				ref('Location', 'location', 'Location'),
				{ displayName: 'Adjust Quantity By', name: 'adjustQtyBy', type: 'number', default: 0, description: 'Positive to add stock, negative to remove' },
				{ displayName: 'Unit Cost', name: 'unitCost', type: 'number', default: 0 },
				{ displayName: 'Memo', name: 'memo', type: 'string', default: '' },
			],
		},
	],
};

export const typedRecordProperties: INodeProperties[] = [
	salesOrderFields,
	salesOrderLines,
	customerFields,
	itemFulfillmentFields,
	itemFulfillmentLines,
	inventoryAdjustmentFields,
	inventoryAdjustmentLines,
];

// ---------------------------------------------------------------------------
// UI values → REST body
// ---------------------------------------------------------------------------

const REF_FIELDS = new Set([
	'entity', 'location', 'subsidiary', 'department', 'class', 'shipMethod', 'salesRep',
	'priceLevel', 'terms', 'createdFrom', 'account', 'adjLocation', 'item',
]);

/** Wrap internal-ID references as { id } and drop empty values. */
function normalizeFields(fields: IDataObject): IDataObject {
	const out: IDataObject = {};
	for (const [key, value] of Object.entries(fields)) {
		if (value === '' || value === undefined || value === null) continue;
		if (REF_FIELDS.has(key)) {
			const id = String(value);
			out[key] = id.startsWith('eid:') ? { externalId: id.slice(4) } : { id };
		} else if (key === 'trackingNumbers' && typeof value === 'string') {
			out.packageList = { items: value.split(',').map((n) => ({ packageTrackingNumber: n.trim() })).filter((p) => p.packageTrackingNumber) };
		} else {
			out[key] = value;
		}
	}
	return out;
}

export function toRecordBody(
	recordType: TypedRecordType,
	fields: IDataObject,
	lines: IDataObject,
): IDataObject {
	const body = normalizeFields(fields);
	const lineItems = ((lines.item as IDataObject[] | undefined) ?? []).map(normalizeFields);

	if (lineItems.length === 0) return body;

	if (recordType === 'inventoryAdjustment') {
		body.inventory = { items: lineItems };
	} else {
		body.item = { items: lineItems };
	}
	return body;
}
