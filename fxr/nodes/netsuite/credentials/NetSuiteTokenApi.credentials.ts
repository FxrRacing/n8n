import type { ICredentialType, INodeProperties } from 'n8n-workflow';

export class NetSuiteTokenApi implements ICredentialType {
	name = 'netSuiteTokenApi';

	displayName = 'NetSuite Token-Based Auth API';

	documentationUrl =
		'https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_4247337262.html';

	properties: INodeProperties[] = [
		{
			displayName: 'Account ID',
			name: 'accountId',
			type: 'string',
			default: '',
			required: true,
			placeholder: 'e.g. 1234567 or 1234567_SB1',
			description:
				'Your NetSuite account ID. Found under Setup → Company → Company Information. Sandbox accounts include a suffix like _SB1.',
		},
		{
			displayName: 'Consumer Key',
			name: 'consumerKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description: 'Consumer key of the Integration record (Setup → Integration → Manage Integrations)',
		},
		{
			displayName: 'Consumer Secret',
			name: 'consumerSecret',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description: 'Consumer secret of the Integration record',
		},
		{
			displayName: 'Token ID',
			name: 'tokenId',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description: 'Token ID of the Access Token (Setup → Users/Roles → Access Tokens)',
		},
		{
			displayName: 'Token Secret',
			name: 'tokenSecret',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description: 'Token secret of the Access Token',
		},
		{
			displayName: 'Saved Search RESTlet Script ID',
			name: 'restletScriptId',
			type: 'string',
			default: '',
			placeholder: 'e.g. customscript_fxr_saved_search',
			description:
				'Only needed for the Saved Search resource. Script ID of the deployed RESTlet from suitescript/savedSearchRestlet.js in this package.',
		},
		{
			displayName: 'Saved Search RESTlet Deployment ID',
			name: 'restletDeployId',
			type: 'string',
			default: '1',
			placeholder: 'e.g. 1 or customdeploy_ns_saved_search',
			description:
				'Only needed for the Saved Search resource. Deployment ID of the RESTlet (the value after &deploy= in its external URL).',
		},
	];
}