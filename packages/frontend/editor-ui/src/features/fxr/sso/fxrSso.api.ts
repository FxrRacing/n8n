import type { FxrSsoConfigDto, FxrSsoConfigResponse } from '@n8n/api-types';
import { makeRestApiRequest, type IRestApiContext } from '@n8n/rest-api-client';

export const getFxrSsoConfig = async (context: IRestApiContext): Promise<FxrSsoConfigResponse> =>
	await makeRestApiRequest(context, 'GET', '/fxr-sso/config');

export const saveFxrSsoConfig = async (
	context: IRestApiContext,
	payload: FxrSsoConfigDto,
): Promise<FxrSsoConfigResponse> =>
	await makeRestApiRequest(context, 'PUT', '/fxr-sso/config', payload);

export const testFxrSsoConfig = async (
	context: IRestApiContext,
): Promise<{ ok: boolean; issuer: string; message: string }> =>
	await makeRestApiRequest(context, 'POST', '/fxr-sso/config/test');
