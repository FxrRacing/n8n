// Public API for the n8n server. Do not export the module classes from this file: each one
// loads through its own `./fxr-<name>/module` entry so a disabled module is never imported.
export { FxrSsoSessionIssuer } from './fxr-sso/fxr-sso-session-issuer';
