# FXR fork workflow

| Branch | Purpose |
|---|---|
| `master` | Pristine mirror of upstream `n8n-io/n8n`. Never commit here. |
| `fxr` | Our line. Upstream + FXR changes. Push here to deploy. |

- **Deploy**: every push to `fxr` runs `.github/workflows/fxr-deploy.yml`, which builds the
  image, pushes it to `fxrn8nacr.azurecr.io/n8n:fxr-<sha>`, and updates the `n8n-app` container app.
- **Sync upstream**: `scripts/fxr/sync-upstream.sh`, then push `fxr`.
- **Feature work**: branch from `fxr`, open a PR into `fxr`.
- **Staging** (when created): set repo variables `CONTAINERAPP_NAME` / `CONTAINERAPP_RG` on the
  `staging` GitHub environment and run the workflow manually with `environment: staging`.

Upstream n8n's own GitHub workflows are disabled in the repo's Actions settings; leave them
disabled after each sync (new upstream workflow files need disabling once).
