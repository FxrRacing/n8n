import type { Person } from '@n8n/db';
import type { Response } from 'express';

/**
 * Starts an n8n session for a person who signed in through fxr-sso.
 *
 * The session cookie is issued by the n8n server's own auth service, which a module package
 * cannot import. The server registers the implementation in its module manifest
 * (`packages/cli/src/modules/modules.manifest.ts`) before it loads the fxr-sso module.
 */
export abstract class FxrSsoSessionIssuer {
	abstract issueCookie(res: Response, person: Person, browserId?: string): void;
}
