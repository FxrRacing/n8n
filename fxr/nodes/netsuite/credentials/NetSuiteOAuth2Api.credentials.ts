import type { ICredentialType, INodeProperties } from 'n8n-workflow';

export class NetSuiteOAuth2Api implements ICredentialType {
	name = 'netSuiteOAuth2Api';

	displayName = 'NetSuite OAuth 2.0 (Machine-to-Machine) API';

	documentationUrl =
		'https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_162730264820.html';

	properties: INodeProperties[] = [
		{
			displayName: 'Account ID',
			name: 'accountId',
			type: 'string',
			default: '',
			required: true,
			placeholder: 'e.g. 1234567 or 1234567_SB1',
			description: 'Your NetSuite account ID (Setup → Company → Company Information)',
		},
		{
			displayName: 'Client ID',
			name: 'clientId',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description:
				'Client ID (consumer key) of the Integration record with OAuth 2.0 client credentials enabled',
		},
		{
			displayName: 'Certificate ID',
			name: 'certificateId',
			type: 'string',
			default: '',
			required: true,
			description:
				'ID shown in Setup → Integration → OAuth 2.0 Client Credentials Setup after uploading the public certificate',
		},
		{
			displayName: 'Private Key (PEM)',
			name: 'privateKey',
			type: 'string',
			typeOptions: { password: true, rows: 6 },
			default: '',
			required: true,
			description:
				'RSA private key matching the uploaded certificate. Generate with: openssl req -x509 -newkey rsa:4096 -sha256 -keyout key.pem -out cert.pem -nodes -days 730',
		},
		{
			displayName: 'Scope',
			name: 'scope',
			type: 'string',
			default: 'rest_webservices',
			description: 'Space-separated OAuth scopes. Add restlets to call RESTlets (Saved Search).',
		},
		{
			displayName: 'Saved Search RESTlet Script ID',
			name: 'restletScriptId',
			type: 'string',
			default: '',
			placeholder: 'e.g. customscript_fxr_saved_search',
			description:
				'Only needed for the Saved Search resource. Script ID of the deployed RESTlet from suitescript/savedSearchRestlet.js.',
		},
		{
			displayName: 'Saved Search RESTlet Deployment ID',
			name: 'restletDeployId',
			type: 'string',
			default: '1',
			description: 'Only needed for the Saved Search resource. Deployment ID of the RESTlet.',
		},
	];
}
