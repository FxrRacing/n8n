import type {
	IDataObject,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	IPollFunctions,
} from 'n8n-workflow';
import { NodeConnectionTypes } from 'n8n-workflow';

import { netsuiteApiRequestAllItems, sqlString, sqlTimestamp } from './GenericFunctions';

/** SuiteQL tables that carry datecreated / lastmodifieddate columns. */
const TABLE_OPTIONS = [
	{ name: 'Transaction (Orders, Invoices, Fulfillments…)', value: 'transaction' },
	{ name: 'Customer', value: 'customer' },
	{ name: 'Vendor', value: 'vendor' },
	{ name: 'Contact', value: 'contact' },
	{ name: 'Item', value: 'item' },
	{ name: 'Other (Specify Below)', value: '__custom' },
];

/** Transaction type codes as stored in transaction.type */
const TRANSACTION_TYPE_OPTIONS = [
	{ name: 'Any', value: '' },
	{ name: 'Sales Order', value: 'SalesOrd' },
	{ name: 'Cash Sale', value: 'CashSale' },
	{ name: 'Invoice', value: 'CustInvc' },
	{ name: 'Item Fulfillment', value: 'ItemShip' },
	{ name: 'Customer Payment', value: 'CustPymt' },
	{ name: 'Credit Memo', value: 'CustCred' },
	{ name: 'Return Authorization', value: 'RtnAuth' },
	{ name: 'Purchase Order', value: 'PurchOrd' },
	{ name: 'Item Receipt', value: 'ItemRcpt' },
	{ name: 'Vendor Bill', value: 'VendBill' },
	{ name: 'Inventory Adjustment', value: 'InvAdjst' },
	{ name: 'Transfer Order', value: 'TrnfrOrd' },
];

export interface TriggerQueryOptions {
	table: string;
	event: 'created' | 'updated';
	since: Date;
	transactionType?: string;
	extraWhere?: string;
	columns?: string;
}

/** Pure query builder, exported for tests. */
export function buildTriggerQuery(options: TriggerQueryOptions): string {
	const dateColumn = options.event === 'created' ? 'datecreated' : 'lastmodifieddate';
	const columns = options.columns?.trim() || '*';
	const where = [`${dateColumn} >= ${sqlTimestamp(options.since)}`];
	if (options.table === 'transaction' && options.transactionType) {
		where.push(`type = ${sqlString(options.transactionType)}`);
	}
	if (options.extraWhere?.trim()) where.push(`(${options.extraWhere.trim()})`);
	return `SELECT ${columns} FROM ${options.table} WHERE ${where.join(' AND ')} ORDER BY ${dateColumn} ASC`;
}

type PollState = { lastPoll?: string; seen?: string[] };

export class NetSuiteTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'NetSuite Trigger',
		name: 'netSuiteTrigger',
		icon: 'file:netsuite.svg',
		group: ['trigger'],
		version: 1,
		subtitle: '={{ $parameter["event"] + ": " + ($parameter["table"] === "__custom" ? $parameter["customTable"] : $parameter["table"]) }}',
		description: 'Starts a workflow when NetSuite records are created or updated (polls SuiteQL)',
		defaults: { name: 'NetSuite Trigger' },
		polling: true,
		inputs: [],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: 'netSuiteTokenApi',
				required: true,
				displayOptions: { show: { authentication: ['tokenBased'] } },
			},
			{
				name: 'netSuiteOAuth2Api',
				required: true,
				displayOptions: { show: { authentication: ['oAuth2'] } },
			},
		],
		properties: [
			{
				displayName: 'Authentication',
				name: 'authentication',
				type: 'options',
				options: [
					{ name: 'Token-Based (OAuth 1.0a)', value: 'tokenBased' },
					{ name: 'OAuth 2.0 Machine-to-Machine', value: 'oAuth2' },
				],
				default: 'tokenBased',
			},
			{
				displayName: 'Event',
				name: 'event',
				type: 'options',
				options: [
					{ name: 'Record Created', value: 'created' },
					{ name: 'Record Created or Updated', value: 'updated' },
				],
				default: 'updated',
			},
			{
				displayName: 'Table',
				name: 'table',
				type: 'options',
				options: TABLE_OPTIONS,
				default: 'transaction',
				description: 'SuiteQL table to watch',
			},
			{
				displayName: 'Custom Table',
				name: 'customTable',
				type: 'string',
				default: '',
				placeholder: 'e.g. customrecord_fxr_dealer',
				displayOptions: { show: { table: ['__custom'] } },
				description: 'SuiteQL table name. Must have datecreated and lastmodifieddate columns.',
			},
			{
				displayName: 'Transaction Type',
				name: 'transactionType',
				type: 'options',
				options: TRANSACTION_TYPE_OPTIONS,
				default: 'SalesOrd',
				displayOptions: { show: { table: ['transaction'] } },
			},
			{
				displayName: 'Options',
				name: 'options',
				type: 'collection',
				placeholder: 'Add Option',
				default: {},
				options: [
					{
						displayName: 'Columns',
						name: 'columns',
						type: 'string',
						default: '',
						placeholder: 'e.g. id, tranid, entity, status, lastmodifieddate',
						description: 'Comma-separated SuiteQL columns to return. Leave empty for all.',
					},
					{
						displayName: 'Additional WHERE Clause',
						name: 'extraWhere',
						type: 'string',
						default: '',
						placeholder: "e.g. status = 'B' AND location = 3",
						description: 'Extra SuiteQL conditions ANDed with the date filter',
					},
					{
						displayName: 'Overlap (Seconds)',
						name: 'overlapSeconds',
						type: 'number',
						default: 120,
						description:
							'Re-query this many seconds before the last poll to absorb NetSuite clock skew and commit lag. Duplicates are filtered by ID.',
					},
					{
						displayName: 'Max Records per Poll',
						name: 'maxRecords',
						type: 'number',
						typeOptions: { minValue: 1 },
						default: 500,
					},
				],
			},
		],
	};

	async poll(this: IPollFunctions): Promise<INodeExecutionData[][] | null> {
		const state = this.getWorkflowStaticData('node') as PollState;
		const event = this.getNodeParameter('event') as 'created' | 'updated';
		const tableParam = this.getNodeParameter('table') as string;
		const table = tableParam === '__custom' ? (this.getNodeParameter('customTable') as string) : tableParam;
		const transactionType = table === 'transaction' ? (this.getNodeParameter('transactionType') as string) : '';
		const options = this.getNodeParameter('options') as {
			columns?: string;
			extraWhere?: string;
			overlapSeconds?: number;
			maxRecords?: number;
		};

		const now = new Date();
		const isManual = this.getMode() === 'manual';
		const overlapMs = (options.overlapSeconds ?? 120) * 1000;
		const since = isManual
			? new Date(now.getTime() - 24 * 60 * 60 * 1000)
			: new Date((state.lastPoll ? new Date(state.lastPoll).getTime() : now.getTime() - 60_000) - overlapMs);

		const query = buildTriggerQuery({
			table,
			event,
			since,
			transactionType,
			extraWhere: options.extraWhere,
			columns: options.columns,
		});

		const rows = await netsuiteApiRequestAllItems.call(
			this,
			'POST',
			'/services/rest/query/v1/suiteql',
			{ q: query },
			{},
			{ Prefer: 'transient' },
			isManual ? 10 : options.maxRecords ?? 500,
		);

		if (isManual) {
			return rows.length ? [this.helpers.returnJsonArray(rows)] : null;
		}

		// Deduplicate against the previous poll using id + date column.
		const dateColumn = event === 'created' ? 'datecreated' : 'lastmodifieddate';
		const seen = new Set(state.seen ?? []);
		const fresh: IDataObject[] = [];
		const nextSeen: string[] = [];
		for (const row of rows) {
			const key = `${String(row.id)}:${String(row[dateColumn] ?? '')}`;
			nextSeen.push(key);
			if (!seen.has(key)) fresh.push(row);
		}

		state.lastPoll = now.toISOString();
		state.seen = nextSeen.slice(-5000);

		return fresh.length ? [this.helpers.returnJsonArray(fresh)] : null;
	}
}
