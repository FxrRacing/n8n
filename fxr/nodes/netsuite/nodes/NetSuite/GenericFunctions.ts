import { createHmac, createPrivateKey, randomBytes, sign as cryptoSign, constants } from 'node:crypto';

import type {
	IDataObject,
	IExecuteFunctions,
	IHttpRequestMethods,
	ILoadOptionsFunctions,
	IPollFunctions,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, NodeOperationError } from 'n8n-workflow';

export interface NetSuiteCredentials {
	accountId: string;
	consumerKey: string;
	consumerSecret: string;
	tokenId: string;
	tokenSecret: string;
	restletScriptId?: string;
	restletDeployId?: string;
}

export interface NetSuiteOAuth2Credentials {
	accountId: string;
	clientId: string;
	certificateId: string;
	privateKey: string;
	scope: string;
	restletScriptId?: string;
	restletDeployId?: string;
}

export type NetSuiteAuthType = 'tokenBased' | 'oAuth2';

export type NetSuiteContext = IExecuteFunctions | ILoadOptionsFunctions | IPollFunctions;

export type QueryParams = Record<string, string | number | boolean | undefined>;

/** Which NetSuite host family a request targets. */
export type NetSuiteDomain = 'suitetalk' | 'restlets';

/** RFC 3986 percent-encoding as required by the OAuth 1.0a spec */
export function rfc3986(value: string): string {
	return encodeURIComponent(value).replace(
		/[!'()*]/g,
		(c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
	);
}

/** 1234567_SB1 → 1234567-sb1 */
export function normalizeAccountId(accountId: string): string {
	return accountId.trim().toLowerCase().replace(/_/g, '-');
}

/** Account-specific host: 1234567_SB1 → 1234567-sb1.suitetalk.api.netsuite.com */
export function getRestDomain(accountId: string, domain: NetSuiteDomain = 'suitetalk'): string {
	return `${normalizeAccountId(accountId)}.${domain}.api.netsuite.com`;
}

export function serializeQuery(query: QueryParams): string {
	return Object.entries(query)
		.filter(([, value]) => value !== undefined)
		.map(([key, value]) => `${rfc3986(key)}=${rfc3986(String(value))}`)
		.join('&');
}

// ---------------------------------------------------------------------------
// Token-Based Authentication (OAuth 1.0a, HMAC-SHA256)
// ---------------------------------------------------------------------------

export interface OAuth1Nonce {
	nonce: string;
	timestamp: string;
}

export function generateNonce(): OAuth1Nonce {
	return {
		nonce: randomBytes(16).toString('hex'),
		timestamp: String(Math.floor(Date.now() / 1000)),
	};
}

/**
 * Build the OAuth 1.0a Authorization header NetSuite TBA expects.
 * Signature method is HMAC-SHA256; realm is the upper-cased account ID.
 * `nonce` is injectable so the output is testable.
 */
export function buildAuthorizationHeader(
	credentials: NetSuiteCredentials,
	method: string,
	baseUrl: string,
	query: QueryParams,
	nonce: OAuth1Nonce = generateNonce(),
): string {
	const oauthParams: Record<string, string> = {
		oauth_consumer_key: credentials.consumerKey,
		oauth_nonce: nonce.nonce,
		oauth_signature_method: 'HMAC-SHA256',
		oauth_timestamp: nonce.timestamp,
		oauth_token: credentials.tokenId,
		oauth_version: '1.0',
	};

	const pairs: Array<[string, string]> = Object.entries(oauthParams).map(([key, value]) => [
		rfc3986(key),
		rfc3986(value),
	]);
	for (const [key, value] of Object.entries(query)) {
		if (value === undefined) continue;
		pairs.push([rfc3986(key), rfc3986(String(value))]);
	}
	pairs.sort(([aKey, aValue], [bKey, bValue]) => {
		if (aKey === bKey) return aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
		return aKey < bKey ? -1 : 1;
	});

	const paramString = pairs.map(([key, value]) => `${key}=${value}`).join('&');
	const baseString = [method.toUpperCase(), rfc3986(baseUrl), rfc3986(paramString)].join('&');
	const signingKey = `${rfc3986(credentials.consumerSecret)}&${rfc3986(credentials.tokenSecret)}`;
	const signature = createHmac('sha256', signingKey).update(baseString).digest('base64');

	const headerParams: Record<string, string> = {
		realm: credentials.accountId.trim().toUpperCase(),
		...oauthParams,
		oauth_signature: signature,
	};

	return `OAuth ${Object.entries(headerParams)
		.map(([key, value]) => `${key}="${rfc3986(value)}"`)
		.join(', ')}`;
}

/** Build a fully signed TBA request (URL + headers) without sending it */
export function buildSignedRequest(
	credentials: NetSuiteCredentials,
	method: IHttpRequestMethods,
	path: string,
	query: QueryParams = {},
	extraHeaders: Record<string, string> = {},
	domain: NetSuiteDomain = 'suitetalk',
): { url: string; headers: Record<string, string> } {
	const baseUrl = `https://${getRestDomain(credentials.accountId, domain)}${path}`;
	const authorization = buildAuthorizationHeader(credentials, method, baseUrl, query);
	const queryString = serializeQuery(query);

	return {
		url: queryString ? `${baseUrl}?${queryString}` : baseUrl,
		headers: {
			Authorization: authorization,
			'Content-Type': 'application/json',
			...extraHeaders,
		},
	};
}

// ---------------------------------------------------------------------------
// OAuth 2.0 client credentials (machine-to-machine, JWT bearer assertion)
// ---------------------------------------------------------------------------

function base64url(input: Buffer | string): string {
	return Buffer.from(input).toString('base64url');
}

export function getTokenEndpoint(accountId: string): string {
	return `https://${getRestDomain(accountId)}/services/rest/auth/oauth2/v1/token`;
}

/**
 * Build the signed JWT NetSuite expects as `client_assertion`.
 * Uses PS256 (RSA-PSS) which NetSuite accepts for RSA certificates.
 * `now` is injectable for tests.
 */
export function buildClientAssertion(
	credentials: NetSuiteOAuth2Credentials,
	now: number = Math.floor(Date.now() / 1000),
): string {
	const header = { alg: 'PS256', typ: 'JWT', kid: credentials.certificateId };
	const payload = {
		iss: credentials.clientId,
		scope: credentials.scope
			.split(/[,\s]+/)
			.filter(Boolean)
			.join(' '),
		aud: getTokenEndpoint(credentials.accountId),
		iat: now,
		exp: now + 300,
	};
	const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
	const key = createPrivateKey(credentials.privateKey);
	const signature = cryptoSign('sha256', Buffer.from(signingInput), {
		key,
		padding: constants.RSA_PKCS1_PSS_PADDING,
		saltLength: constants.RSA_PSS_SALTLEN_DIGEST,
	});
	return `${signingInput}.${base64url(signature)}`;
}

type CachedToken = { accessToken: string; expiresAt: number };
const tokenCache = new Map<string, CachedToken>();

/** Fetch (or reuse) an OAuth 2.0 access token for the given credentials. */
export async function getOAuth2AccessToken(
	this: NetSuiteContext,
	credentials: NetSuiteOAuth2Credentials,
): Promise<string> {
	const cacheKey = `${normalizeAccountId(credentials.accountId)}:${credentials.clientId}`;
	const cached = tokenCache.get(cacheKey);
	const nowMs = Date.now();
	if (cached && cached.expiresAt - 30_000 > nowMs) return cached.accessToken;

	const assertion = buildClientAssertion(credentials);
	const body = new URLSearchParams({
		grant_type: 'client_credentials',
		client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
		client_assertion: assertion,
	}).toString();

	try {
		const response = (await this.helpers.httpRequest({
			method: 'POST',
			url: getTokenEndpoint(credentials.accountId),
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body,
			json: true,
		})) as { access_token: string; expires_in: number | string };

		const expiresIn = Number(response.expires_in) || 3600;
		tokenCache.set(cacheKey, {
			accessToken: response.access_token,
			expiresAt: nowMs + expiresIn * 1000,
		});
		return response.access_token;
	} catch (error) {
		throw new NodeApiError(this.getNode(), error as JsonObject, {
			message: 'NetSuite OAuth 2.0 token request failed',
		});
	}
}

/** Exposed for tests. */
export function clearTokenCache() {
	tokenCache.clear();
}

// ---------------------------------------------------------------------------
// Request helpers
// ---------------------------------------------------------------------------

export async function getAuthType(this: NetSuiteContext, itemIndex = 0): Promise<NetSuiteAuthType> {
	try {
		return this.getNodeParameter('authentication', itemIndex) as NetSuiteAuthType;
	} catch {
		return 'tokenBased';
	}
}

/** Resolve the account-level settings (account ID, RESTlet IDs) from whichever credential is in use. */
export async function getAccountSettings(
	this: NetSuiteContext,
): Promise<{ accountId: string; restletScriptId?: string; restletDeployId?: string }> {
	const authType = await getAuthType.call(this);
	if (authType === 'oAuth2') {
		const c = (await this.getCredentials('netSuiteOAuth2Api')) as unknown as NetSuiteOAuth2Credentials;
		return { accountId: c.accountId, restletScriptId: c.restletScriptId, restletDeployId: c.restletDeployId };
	}
	const c = (await this.getCredentials('netSuiteTokenApi')) as unknown as NetSuiteCredentials;
	return { accountId: c.accountId, restletScriptId: c.restletScriptId, restletDeployId: c.restletDeployId };
}

/** Build URL + auth headers for a request using whichever credential the node is configured with. */
export async function buildAuthenticatedRequest(
	this: NetSuiteContext,
	method: IHttpRequestMethods,
	path: string,
	query: QueryParams = {},
	extraHeaders: Record<string, string> = {},
	domain: NetSuiteDomain = 'suitetalk',
): Promise<{ url: string; headers: Record<string, string> }> {
	const authType = await getAuthType.call(this);

	if (authType === 'oAuth2') {
		const credentials = (await this.getCredentials(
			'netSuiteOAuth2Api',
		)) as unknown as NetSuiteOAuth2Credentials;
		const token = await getOAuth2AccessToken.call(this, credentials);
		const baseUrl = `https://${getRestDomain(credentials.accountId, domain)}${path}`;
		const queryString = serializeQuery(query);
		return {
			url: queryString ? `${baseUrl}?${queryString}` : baseUrl,
			headers: {
				Authorization: `Bearer ${token}`,
				'Content-Type': 'application/json',
				...extraHeaders,
			},
		};
	}

	const credentials = (await this.getCredentials(
		'netSuiteTokenApi',
	)) as unknown as NetSuiteCredentials;
	return buildSignedRequest(credentials, method, path, query, extraHeaders, domain);
}

export async function netsuiteApiRequest(
	this: NetSuiteContext,
	method: IHttpRequestMethods,
	path: string,
	body?: IDataObject,
	query: QueryParams = {},
	extraHeaders: Record<string, string> = {},
	returnFullResponse = false,
	domain: NetSuiteDomain = 'suitetalk',
): Promise<IDataObject> {
	const { url, headers } = await buildAuthenticatedRequest.call(
		this,
		method,
		path,
		query,
		extraHeaders,
		domain,
	);

	try {
		const response = await this.helpers.httpRequest({
			method,
			url,
			headers,
			body: body && Object.keys(body).length ? body : undefined,
			json: true,
			returnFullResponse,
		});
		return (response ?? {}) as IDataObject;
	} catch (error) {
		throw new NodeApiError(this.getNode(), error as JsonObject);
	}
}

/** Paginate through a NetSuite REST collection (record list or SuiteQL result) */
export async function netsuiteApiRequestAllItems(
	this: NetSuiteContext,
	method: IHttpRequestMethods,
	path: string,
	body?: IDataObject,
	query: QueryParams = {},
	extraHeaders: Record<string, string> = {},
	maxItems?: number,
): Promise<IDataObject[]> {
	const pageSize = 1000;
	const items: IDataObject[] = [];
	let offset = 0;
	let hasMore = true;

	while (hasMore) {
		const limit = maxItems !== undefined ? Math.min(pageSize, maxItems - items.length) : pageSize;
		const response = await netsuiteApiRequest.call(
			this,
			method,
			path,
			body,
			{ ...query, limit, offset },
			extraHeaders,
		);

		const pageItems = (response.items as IDataObject[] | undefined) ?? [];
		items.push(...pageItems);

		hasMore = response.hasMore === true;
		offset += pageItems.length;

		if (maxItems !== undefined && items.length >= maxItems) break;
		if (pageItems.length === 0) break;
	}

	return maxItems !== undefined ? items.slice(0, maxItems) : items;
}

// ---------------------------------------------------------------------------
// Saved Search (via RESTlet, see suitescript/savedSearchRestlet.js)
// ---------------------------------------------------------------------------

export interface SavedSearchPage {
	results: IDataObject[];
	pageIndex: number;
	pageCount: number;
	total: number;
}

/** Run a saved search through the deployed RESTlet, paging until `maxItems` or the end. */
export async function runSavedSearch(
	this: NetSuiteContext,
	searchId: string,
	options: { pageSize?: number; maxItems?: number; filters?: IDataObject[] } = {},
): Promise<IDataObject[]> {
	const { restletScriptId, restletDeployId } = await getAccountSettings.call(this);
	if (!restletScriptId) {
		throw new NodeOperationError(
			this.getNode(),
			'Saved Search requires the RESTlet Script ID on the NetSuite credential. Deploy suitescript/savedSearchRestlet.js and fill in its script and deployment IDs.',
		);
	}

	const pageSize = Math.min(options.pageSize ?? 1000, 1000);
	const results: IDataObject[] = [];
	let pageIndex = 0;

	while (true) {
		const response = (await netsuiteApiRequest.call(
			this,
			'POST',
			'/app/site/hosting/restlet.nl',
			{ searchId, pageSize, pageIndex, filters: options.filters ?? [] },
			{ script: restletScriptId, deploy: restletDeployId ?? '1' },
			{},
			false,
			'restlets',
		)) as unknown as SavedSearchPage;

		results.push(...(response.results ?? []));
		pageIndex += 1;

		if (options.maxItems !== undefined && results.length >= options.maxItems) break;
		if (pageIndex >= (response.pageCount ?? 0)) break;
	}

	return options.maxItems !== undefined ? results.slice(0, options.maxItems) : results;
}

// ---------------------------------------------------------------------------
// SuiteQL helpers shared by the node and the trigger
// ---------------------------------------------------------------------------

/** Escape a string literal for SuiteQL. */
export function sqlString(value: string): string {
	return `'${value.replace(/'/g, "''")}'`;
}

/** Format a Date as a SuiteQL TO_TIMESTAMP(...) expression in UTC. */
export function sqlTimestamp(date: Date): string {
	const iso = date.toISOString(); // 2026-10-28T19:59:42.123Z
	const formatted = `${iso.slice(0, 10)} ${iso.slice(11, 19)}`;
	return `TO_TIMESTAMP(${sqlString(formatted)}, 'YYYY-MM-DD HH24:MI:SS')`;
}
