# @n8n/backend-module-fxr

FXR-authored backend modules, kept in one workspace package so they sit outside the upstream n8n
server code and depend only on n8n's shared packages.

| Module         | Folder              | What it does                                          |
| -------------- | ------------------- | ----------------------------------------------------- |
| `fxr-insights` | `src/fxr-insights/` | Serves the insights dashboard data on fork routes     |
| `fxr-projects` | `src/fxr-projects/` | Team projects and custom project roles                |
| `fxr-sharing`  | `src/fxr-sharing/`  | Share workflows and credentials between users         |
| `fxr-sso`      | `src/fxr-sso/`      | OpenID Connect sign-in (Microsoft Entra ID)           |

Each folder has its own README. Enable modules per environment with `N8N_ENABLED_MODULES`.

## How it plugs into n8n

These are the only places outside this package that the backend modules touch:

- `packages/@n8n/backend-common/src/modules/modules.config.ts`: the four module names.
- `packages/cli/src/modules/modules.manifest.ts`: one lazy import per module. The `fxr-sso` entry
  also registers `FxrSsoSessionIssuer`, which lets the module start an n8n session without
  importing server code.
- `packages/cli/package.json` and `packages/cli/tsconfig.json`: the dependency and project
  reference.
- `packages/cli/src/services/frontend.service.ts`: advertises the fxr-sso login to the sign-in page.

## Rules

- No imports from the n8n server (`@/…`) and none from `.ee` files or directories.
- The package root (`src/index.ts`) exports only what the server needs. Module classes load
  through their `./fxr-<name>/module` entries.

## Commands

Run from this directory:

```sh
pnpm build
pnpm typecheck
pnpm lint
pnpm test
```
