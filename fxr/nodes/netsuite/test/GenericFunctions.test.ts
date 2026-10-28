import { generateKeyPairSync, verify, constants } from 'node:crypto';

import {
	buildAuthorizationHeader,
	buildClientAssertion,
	buildSignedRequest,
	getRestDomain,
	getTokenEndpoint,
	rfc3986,
	serializeQuery,
	sqlString,
	sqlTimestamp,
	type NetSuiteCredentials,
} from '../nodes/NetSuite/GenericFunctions';

const tba: NetSuiteCredentials = {
	accountId: '1234567_SB1',
	consumerKey: 'ck',
	consumerSecret: 'cs',
	tokenId: 'tid',
	tokenSecret: 'ts',
};

describe('encoding helpers', () => {
	it('percent-encodes per RFC 3986 including the characters encodeURIComponent skips', () => {
		expect(rfc3986("a b!'()*~")).toBe('a%20b%21%27%28%29%2A~');
	});

	it('maps sandbox account IDs to the REST host', () => {
		expect(getRestDomain('1234567_SB1')).toBe('1234567-sb1.suitetalk.api.netsuite.com');
		expect(getRestDomain('1234567', 'restlets')).toBe('1234567.restlets.api.netsuite.com');
	});

	it('serialises query params and drops undefined values', () => {
		expect(serializeQuery({ limit: 10, q: 'a b', skip: undefined })).toBe('limit=10&q=a%20b');
	});

	it('escapes SuiteQL strings and formats UTC timestamps', () => {
		expect(sqlString("O'Brien")).toBe("'O''Brien'");
		expect(sqlTimestamp(new Date('2026-10-28T19:59:42.123Z'))).toBe(
			"TO_TIMESTAMP('2026-10-28 19:59:42', 'YYYY-MM-DD HH24:MI:SS')",
		);
	});
});

describe('Token-Based Authentication header', () => {
	const nonce = { nonce: 'abc123', timestamp: '1700000000' };

	it('produces a stable HMAC-SHA256 signature for a fixed nonce and timestamp', () => {
		const header = buildAuthorizationHeader(
			tba,
			'GET',
			'https://1234567-sb1.suitetalk.api.netsuite.com/services/rest/record/v1/customer',
			{ limit: 10 },
			nonce,
		);
		expect(header.startsWith('OAuth realm="1234567_SB1", ')).toBe(true);
		expect(header).toContain('oauth_signature_method="HMAC-SHA256"');
		expect(header).toContain('oauth_nonce="abc123"');
		expect(header).toContain('oauth_timestamp="1700000000"');
		// Deterministic: same input, same signature.
		const again = buildAuthorizationHeader(
			tba,
			'GET',
			'https://1234567-sb1.suitetalk.api.netsuite.com/services/rest/record/v1/customer',
			{ limit: 10 },
			nonce,
		);
		expect(again).toBe(header);
	});

	it('changes the signature when query params change', () => {
		const url = 'https://1234567-sb1.suitetalk.api.netsuite.com/services/rest/record/v1/customer';
		const a = buildAuthorizationHeader(tba, 'GET', url, { limit: 10 }, nonce);
		const b = buildAuthorizationHeader(tba, 'GET', url, { limit: 20 }, nonce);
		expect(a).not.toBe(b);
	});

	it('builds a signed request URL with query string on the requested domain', () => {
		const { url, headers } = buildSignedRequest(
			tba,
			'POST',
			'/app/site/hosting/restlet.nl',
			{ script: 'customscript_x', deploy: '1' },
			{},
			'restlets',
		);
		expect(url).toBe(
			'https://1234567-sb1.restlets.api.netsuite.com/app/site/hosting/restlet.nl?script=customscript_x&deploy=1',
		);
		expect(headers.Authorization.startsWith('OAuth ')).toBe(true);
		expect(headers['Content-Type']).toBe('application/json');
	});
});

describe('OAuth 2.0 client assertion', () => {
	const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
	const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();

	it('builds a PS256 JWT with NetSuite claims that verifies against the public key', () => {
		const jwt = buildClientAssertion(
			{
				accountId: '1234567',
				clientId: 'client-id',
				certificateId: 'cert-id',
				privateKey: pem,
				scope: 'rest_webservices, restlets',
			},
			1700000000,
		);
		const [h, p, sig] = jwt.split('.');
		const header = JSON.parse(Buffer.from(h, 'base64url').toString());
		const payload = JSON.parse(Buffer.from(p, 'base64url').toString());

		expect(header).toEqual({ alg: 'PS256', typ: 'JWT', kid: 'cert-id' });
		expect(payload).toEqual({
			iss: 'client-id',
			scope: 'rest_webservices restlets',
			aud: getTokenEndpoint('1234567'),
			iat: 1700000000,
			exp: 1700000300,
		});

		const ok = verify(
			'sha256',
			Buffer.from(`${h}.${p}`),
			{
				key: publicKey,
				padding: constants.RSA_PKCS1_PSS_PADDING,
				saltLength: constants.RSA_PSS_SALTLEN_DIGEST,
			},
			Buffer.from(sig, 'base64url'),
		);
		expect(ok).toBe(true);
	});
});
