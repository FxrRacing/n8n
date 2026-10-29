# fxr-sso

FXR-authored OpenID Connect sign-in for internal use. Built for Microsoft Entra ID; works with any
OIDC provider that supports discovery. Authorization code flow with PKCE, nonce and state checks.

| Route                                    | Purpose                                                                                                                                                        |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /rest/fxr-sso/login?redirect=/path` | Starts the flow. Stores PKCE verifier, nonce and state in a short-lived signed cookie, redirects to the provider.                                              |
| `GET /rest/fxr-sso/callback`             | Exchanges the code, validates the ID token, resolves the n8n user, issues n8n's normal auth cookie, redirects back. Errors redirect to `/signin?ssoError=...`. |

User resolution, in order: identity already linked to the provider subject → existing user with the
same email (identity gets linked) → auto-provision a new user with a personal project when
`FXR_SSO_AUTO_PROVISION=true` and the email domain is allowed. Disabled users are refused.

| Env                       | Meaning                                              |
| ------------------------- | ---------------------------------------------------- |
| `FXR_SSO_ISSUER`          | `https://login.microsoftonline.com/<tenant-id>/v2.0` |
| `FXR_SSO_CLIENT_ID`       | App registration client ID                           |
| `FXR_SSO_CLIENT_SECRET`   | App registration secret (Container App secret)       |
| `FXR_SSO_ALLOWED_DOMAINS` | e.g. `fxrracing.com`. Empty allows any domain        |
| `FXR_SSO_AUTO_PROVISION`  | default `true`                                       |
| `FXR_SSO_DEFAULT_ROLE`    | default `global:member`                              |
| `FXR_SSO_LOGIN_LABEL`     | default `Microsoft`                                  |

Email/password login stays available as a break-glass path for the owner. Uses only free code:
`AuthService.issueCookie`, `UserRepository.createUserWithProject`, `AuthIdentity`, `openid-client`.
