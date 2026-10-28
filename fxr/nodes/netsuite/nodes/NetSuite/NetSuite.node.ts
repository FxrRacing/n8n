import type {
	ICredentialsDecrypted,
	ICredentialTestFunctions,
	IDataObject,
	IExecuteFunctions,
	IHttpRequestMethods,
	INodeCredentialTestResult,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { jsonParse, NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import {
	buildClientAssertion,
	buildSignedRequest,
	getTokenEndpoint,
	netsuiteApiRequest,
	netsuiteApiRequestAllItems,
	runSavedSearch,
	type NetSuiteCredentials,
	type NetSuiteOAuth2Credentials,
	type QueryParams,
} from './GenericFunctions';
import { TYPED_RECORD_TYPES, toRecordBody, typedRecordProperties, type TypedRecordType } from './RecordFields';

const RECORD_TYPE_OPTIONS = [
	{ name: 'Cash Sale', value: 'cashSale' },
	{ name: 'Contact', value: 'contact' },
	{ name: 'Credit Memo', value: 'creditMemo' },
	{ name: 'Customer', value: 'customer' },
	{ name: 'Customer Payment', value: 'customerPayment' },
	{ name: 'Employee', value: 'employee' },
	{ name: 'Inventory Item', value: 'inventoryItem' },
	{ name: 'Invoice', value: 'invoice' },
	{ name: 'Item Fulfillment', value: 'itemFulfillment' },
	{ name: 'Location', value: 'location' },
	{ name: 'Non-Inventory Sale Item', value: 'nonInventorySaleItem' },
	{ name: 'Purchase Order', value: 'purchaseOrder' },
	{ name: 'Sales Order', value: 'salesOrder' },
	{ name: 'Subsidiary', value: 'subsidiary' },
	{ name: 'Vendor', value: 'vendor' },
	{ name: 'Vendor Bill', value: 'vendorBill' },
	{ name: 'Other (Specify Below)', value: '__custom' },
];

function isTypedRecordType(value: string): value is TypedRecordType {
	return (TYPED_RECORD_TYPES as readonly string[]).includes(value);
}

/** Resolve the create/update body from either the typed form or raw JSON. */
function getRecordBody(this: IExecuteFunctions, itemIndex: number, recordType: string): IDataObject {
	const inputMode = isTypedRecordType(recordType)
		? (this.getNodeParameter('inputMode', itemIndex, 'json') as string)
		: 'json';

	if (inputMode === 'fields' && isTypedRecordType(recordType)) {
		const fields = this.getNodeParameter('fields', itemIndex, {}) as IDataObject;
		const lines = this.getNodeParameter('lines', itemIndex, {}) as IDataObject;
		const extra = jsonParse<IDataObject>(
			(this.getNodeParameter('recordBodyExtra', itemIndex, '{}') as string) || '{}',
		);
		return { ...toRecordBody(recordType, fields, lines), ...extra };
	}

	return jsonParse<IDataObject>((this.getNodeParameter('recordBody', itemIndex) as string) || '{}');
}

export class NetSuite implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'NetSuite',
		name: 'netSuite',
		icon: 'file:netsuite.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{ $parameter["operation"] + ": " + $parameter["resource"] }}',
		description: 'Interact with NetSuite via SuiteTalk REST, SuiteQL and saved searches',
		defaults: {
			name: 'NetSuite',
		},
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: 'netSuiteTokenApi',
				required: true,
				testedBy: 'netSuiteTokenApiTest',
				displayOptions: { show: { authentication: ['tokenBased'] } },
			},
			{
				name: 'netSuiteOAuth2Api',
				required: true,
				testedBy: 'netSuiteOAuth2ApiTest',
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
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{ name: 'Record', value: 'record' },
					{ name: 'Saved Search', value: 'savedSearch' },
					{ name: 'SuiteQL', value: 'suiteql' },
					{ name: 'Raw Request', value: 'raw' },
				],
				default: 'record',
			},

			// ----------------------------------
			//         record
			// ----------------------------------
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: {
					show: { resource: ['record'] },
				},
				options: [
					{
						name: 'Create',
						value: 'create',
						description: 'Create a record',
						action: 'Create a record',
					},
					{
						name: 'Delete',
						value: 'delete',
						description: 'Delete a record',
						action: 'Delete a record',
					},
					{
						name: 'Get',
						value: 'get',
						description: 'Get a record by ID',
						action: 'Get a record',
					},
					{
						name: 'Get Many',
						value: 'getAll',
						description: 'List records with optional filters',
						action: 'Get many records',
					},
					{
						name: 'Update',
						value: 'update',
						description: 'Update a record (PATCH)',
						action: 'Update a record',
					},
				],
				default: 'get',
			},
			{
				displayName: 'Record Type',
				name: 'recordType',
				type: 'options',
				options: RECORD_TYPE_OPTIONS,
				default: 'salesOrder',
				displayOptions: {
					show: { resource: ['record'] },
				},
				description: 'The NetSuite record type to operate on',
			},
			{
				displayName: 'Custom Record Type',
				name: 'customRecordType',
				type: 'string',
				default: '',
				placeholder: 'e.g. customrecord_my_record',
				displayOptions: {
					show: { resource: ['record'], recordType: ['__custom'] },
				},
				description: 'Record type ID as used in the REST API path',
			},
			{
				displayName: 'Record ID',
				name: 'recordId',
				type: 'string',
				default: '',
				required: true,
				displayOptions: {
					show: { resource: ['record'], operation: ['get', 'update', 'delete'] },
				},
				description: 'Internal ID of the record. Prefix with eid: to address by external ID (e.g. eid:MY-EXT-ID).',
			},
			{
				displayName: 'Input Mode',
				name: 'inputMode',
				type: 'options',
				options: [
					{ name: 'Fields', value: 'fields', description: 'Pick common fields from a form' },
					{ name: 'JSON', value: 'json', description: 'Provide the full REST body as JSON' },
				],
				default: 'fields',
				displayOptions: {
					show: {
						resource: ['record'],
						operation: ['create', 'update'],
						recordType: [...TYPED_RECORD_TYPES],
					},
				},
			},
			...typedRecordProperties,
			{
				displayName: 'Body (JSON)',
				name: 'recordBody',
				type: 'json',
				default: '{}',
				displayOptions: {
					show: { resource: ['record'], operation: ['create', 'update'] },
					hide: { inputMode: ['fields'] },
				},
				description: 'Record fields as JSON, matching the SuiteTalk REST record schema',
			},
			{
				displayName: 'Additional JSON',
				name: 'recordBodyExtra',
				type: 'json',
				default: '{}',
				displayOptions: {
					show: {
						resource: ['record'],
						operation: ['create', 'update'],
						inputMode: ['fields'],
						recordType: [...TYPED_RECORD_TYPES],
					},
				},
				description: 'Extra fields (e.g. custom fields) merged over the form values',
			},
			{
				displayName: 'Options',
				name: 'recordGetOptions',
				type: 'collection',
				placeholder: 'Add Option',
				default: {},
				displayOptions: {
					show: { resource: ['record'], operation: ['get'] },
				},
				options: [
					{
						displayName: 'Expand Sub-Resources',
						name: 'expandSubResources',
						type: 'boolean',
						default: false,
						description: 'Whether to expand sublists and subrecords inline instead of returning links',
					},
					{
						displayName: 'Fields',
						name: 'fields',
						type: 'string',
						default: '',
						placeholder: 'e.g. entityid,companyname,email',
						description: 'Comma-separated list of fields to return. Leave empty for all fields.',
					},
				],
			},
			{
				displayName: 'Return All',
				name: 'returnAll',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: { resource: ['record'], operation: ['getAll'] },
				},
				description: 'Whether to return all results or only up to a given limit',
			},
			{
				displayName: 'Limit',
				name: 'limit',
				type: 'number',
				typeOptions: { minValue: 1 },
				default: 50,
				displayOptions: {
					show: { resource: ['record'], operation: ['getAll'], returnAll: [false] },
				},
				description: 'Max number of results to return',
			},
			{
				displayName: 'Filter Query',
				name: 'filterQuery',
				type: 'string',
				default: '',
				placeholder: 'e.g. email IS "jane@example.com" AND dateCreated AFTER "2026-01-01"',
				displayOptions: {
					show: { resource: ['record'], operation: ['getAll'] },
				},
				description:
					'NetSuite REST query filter (the q parameter). See SuiteTalk REST docs for the condition syntax.',
			},

			// ----------------------------------
			//         savedSearch
			// ----------------------------------
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['savedSearch'] } },
				options: [
					{
						name: 'Run',
						value: 'run',
						description: 'Run a saved search through the FXR RESTlet',
						action: 'Run a saved search',
					},
				],
				default: 'run',
			},
			{
				displayName: 'Search ID',
				name: 'searchId',
				type: 'string',
				default: '',
				required: true,
				placeholder: 'e.g. customsearch_open_orders or 1234',
				displayOptions: { show: { resource: ['savedSearch'] } },
				description: 'Script ID or internal ID of the saved search',
			},
			{
				displayName: 'Return All',
				name: 'returnAll',
				type: 'boolean',
				default: false,
				displayOptions: { show: { resource: ['savedSearch'] } },
				description: 'Whether to return all results or only up to a given limit',
			},
			{
				displayName: 'Limit',
				name: 'limit',
				type: 'number',
				typeOptions: { minValue: 1 },
				default: 50,
				displayOptions: { show: { resource: ['savedSearch'], returnAll: [false] } },
				description: 'Max number of results to return',
			},
			{
				displayName: 'Additional Filters (JSON)',
				name: 'searchFilters',
				type: 'json',
				default: '[]',
				displayOptions: { show: { resource: ['savedSearch'] } },
				placeholder: '[["status", "anyof", "SalesOrd:B"], ["trandate", "onorafter", "today"]]',
				description:
					'Array of [fieldName, operator, ...values] triples appended to the saved search filters',
			},

			// ----------------------------------
			//         suiteql
			// ----------------------------------
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: {
					show: { resource: ['suiteql'] },
				},
				options: [
					{
						name: 'Execute',
						value: 'execute',
						description: 'Run a SuiteQL query',
						action: 'Execute a SuiteQL query',
					},
				],
				default: 'execute',
			},
			{
				displayName: 'Query',
				name: 'query',
				type: 'string',
				typeOptions: { rows: 4 },
				default: '',
				required: true,
				placeholder: 'SELECT id, entityid, email FROM customer WHERE email IS NOT NULL',
				displayOptions: {
					show: { resource: ['suiteql'] },
				},
				description: 'The SuiteQL query to execute',
			},
			{
				displayName: 'Return All',
				name: 'returnAll',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: { resource: ['suiteql'] },
				},
				description: 'Whether to return all results or only up to a given limit',
			},
			{
				displayName: 'Limit',
				name: 'limit',
				type: 'number',
				typeOptions: { minValue: 1 },
				default: 50,
				displayOptions: {
					show: { resource: ['suiteql'], returnAll: [false] },
				},
				description: 'Max number of results to return',
			},

			// ----------------------------------
			//         raw
			// ----------------------------------
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: {
					show: { resource: ['raw'] },
				},
				options: [
					{
						name: 'Request',
						value: 'request',
						description: 'Make a signed request to any SuiteTalk REST endpoint',
						action: 'Make a raw API request',
					},
				],
				default: 'request',
			},
			{
				displayName: 'Method',
				name: 'method',
				type: 'options',
				options: [
					{ name: 'DELETE', value: 'DELETE' },
					{ name: 'GET', value: 'GET' },
					{ name: 'PATCH', value: 'PATCH' },
					{ name: 'POST', value: 'POST' },
					{ name: 'PUT', value: 'PUT' },
				],
				default: 'GET',
				displayOptions: {
					show: { resource: ['raw'] },
				},
			},
			{
				displayName: 'Path',
				name: 'path',
				type: 'string',
				default: '',
				required: true,
				placeholder: '/services/rest/record/v1/customer',
				displayOptions: {
					show: { resource: ['raw'] },
				},
				description: 'Path relative to the account REST domain. Must start with /services/rest/.',
			},
			{
				displayName: 'Query Parameters (JSON)',
				name: 'rawQuery',
				type: 'json',
				default: '{}',
				displayOptions: {
					show: { resource: ['raw'] },
				},
				description: 'Query parameters as a flat JSON object, e.g. {"limit": 10}',
			},
			{
				displayName: 'Body (JSON)',
				name: 'rawBody',
				type: 'json',
				default: '{}',
				displayOptions: {
					show: { resource: ['raw'], method: ['PATCH', 'POST', 'PUT'] },
				},
				description: 'Request body as JSON',
			},
		],
	};

	methods = {
		credentialTest: {
			async netSuiteOAuth2ApiTest(
				this: ICredentialTestFunctions,
				credential: ICredentialsDecrypted,
			): Promise<INodeCredentialTestResult> {
				const credentials = credential.data as unknown as NetSuiteOAuth2Credentials;
				try {
					const assertion = buildClientAssertion(credentials);
					await this.helpers.request({
						method: 'POST',
						uri: getTokenEndpoint(credentials.accountId),
						headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
						body: new URLSearchParams({
							grant_type: 'client_credentials',
							client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
							client_assertion: assertion,
						}).toString(),
					});
					return { status: 'OK', message: 'Token request successful' };
				} catch (error) {
					return { status: 'Error', message: (error as Error).message };
				}
			},
			async netSuiteTokenApiTest(
				this: ICredentialTestFunctions,
				credential: ICredentialsDecrypted,
			): Promise<INodeCredentialTestResult> {
				const credentials = credential.data as unknown as NetSuiteCredentials;
				const { url, headers } = buildSignedRequest(
					credentials,
					'POST',
					'/services/rest/query/v1/suiteql',
					{ limit: 1 },
					{ Prefer: 'transient' },
				);

				try {
					await this.helpers.request({
						method: 'POST',
						uri: url,
						headers,
						body: { q: 'SELECT 1 AS ok FROM DUAL' },
						json: true,
					});
					return { status: 'OK', message: 'Authentication successful' };
				} catch (error) {
					return {
						status: 'Error',
						message: (error as Error).message,
					};
				}
			},
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		const resource = this.getNodeParameter('resource', 0);
		const operation = this.getNodeParameter('operation', 0);

		for (let i = 0; i < items.length; i++) {
			try {
				let responseData: IDataObject | IDataObject[] = {};

				if (resource === 'record') {
					const recordTypeSelection = this.getNodeParameter('recordType', i) as string;
					const recordType =
						recordTypeSelection === '__custom'
							? (this.getNodeParameter('customRecordType', i) as string)
							: recordTypeSelection;

					if (!recordType) {
						throw new NodeOperationError(this.getNode(), 'Record type must not be empty', {
							itemIndex: i,
						});
					}

					const basePath = `/services/rest/record/v1/${recordType}`;

					if (operation === 'get') {
						const recordId = this.getNodeParameter('recordId', i) as string;
						const options = this.getNodeParameter('recordGetOptions', i) as IDataObject;
						const query: QueryParams = {};
						if (options.expandSubResources === true) query.expandSubResources = 'true';
						if (options.fields) query.fields = String(options.fields);

						responseData = await netsuiteApiRequest.call(
							this,
							'GET',
							`${basePath}/${encodeURIComponent(recordId)}`,
							undefined,
							query,
						);
					} else if (operation === 'getAll') {
						const returnAll = this.getNodeParameter('returnAll', i) as boolean;
						const filterQuery = this.getNodeParameter('filterQuery', i) as string;
						const query: QueryParams = {};
						if (filterQuery) query.q = filterQuery;

						const maxItems = returnAll
							? undefined
							: (this.getNodeParameter('limit', i) as number);
						responseData = await netsuiteApiRequestAllItems.call(
							this,
							'GET',
							basePath,
							undefined,
							query,
							{},
							maxItems,
						);
					} else if (operation === 'create') {
						const body = getRecordBody.call(this, i, recordType);
						const response = await netsuiteApiRequest.call(
							this,
							'POST',
							basePath,
							body,
							{},
							{},
							true,
						);
						const location = ((response.headers as IDataObject)?.location as string) ?? '';
						const id = location.split('/').pop() ?? '';
						responseData = { success: true, id, recordType };
					} else if (operation === 'update') {
						const recordId = this.getNodeParameter('recordId', i) as string;
						const body = getRecordBody.call(this, i, recordType);
						await netsuiteApiRequest.call(
							this,
							'PATCH',
							`${basePath}/${encodeURIComponent(recordId)}`,
							body,
						);
						responseData = { success: true, id: recordId, recordType };
					} else if (operation === 'delete') {
						const recordId = this.getNodeParameter('recordId', i) as string;
						await netsuiteApiRequest.call(
							this,
							'DELETE',
							`${basePath}/${encodeURIComponent(recordId)}`,
						);
						responseData = { success: true, id: recordId, recordType };
					}
				} else if (resource === 'savedSearch') {
					const searchId = this.getNodeParameter('searchId', i) as string;
					const returnAll = this.getNodeParameter('returnAll', i) as boolean;
					const maxItems = returnAll ? undefined : (this.getNodeParameter('limit', i) as number);
					const filters = jsonParse<IDataObject[]>(
						(this.getNodeParameter('searchFilters', i) as string) || '[]',
					);
					responseData = await runSavedSearch.call(this, searchId, { maxItems, filters });
				} else if (resource === 'suiteql') {
					const query = this.getNodeParameter('query', i) as string;
					const returnAll = this.getNodeParameter('returnAll', i) as boolean;
					const maxItems = returnAll ? undefined : (this.getNodeParameter('limit', i) as number);

					responseData = await netsuiteApiRequestAllItems.call(
						this,
						'POST',
						'/services/rest/query/v1/suiteql',
						{ q: query },
						{},
						{ Prefer: 'transient' },
						maxItems,
					);
				} else if (resource === 'raw') {
					const method = this.getNodeParameter('method', i) as IHttpRequestMethods;
					const path = this.getNodeParameter('path', i) as string;
					const rawQuery = jsonParse<QueryParams>(this.getNodeParameter('rawQuery', i) as string);
					const body = ['PATCH', 'POST', 'PUT'].includes(method)
						? jsonParse<IDataObject>(this.getNodeParameter('rawBody', i) as string)
						: undefined;

					if (!path.startsWith('/services/rest/')) {
						throw new NodeOperationError(
							this.getNode(),
							'Path must start with /services/rest/',
							{ itemIndex: i },
						);
					}

					responseData = await netsuiteApiRequest.call(this, method, path, body, rawQuery);
				}

				const executionData = this.helpers.constructExecutionMetaData(
					this.helpers.returnJsonArray(responseData),
					{ itemData: { item: i } },
				);
				returnData.push(...executionData);
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: { error: (error as Error).message },
						pairedItem: { item: i },
					});
					continue;
				}
				throw error;
			}
		}

		return [returnData];
	}
}