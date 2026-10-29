# fxr-insights

FXR-authored re-exposure of n8n's (license-gated) Insights analytics. A thin license-free shell
around the **upstream insights engine**: the upstream `insights` module stays enabled and owns the
entities, repositories, collection/compaction/pruning timers and its own license-gated controller —
this module only serves the same data under fork-owned routes with no license checks.

| Route                                    | Scope           | Response                     |
| ---------------------------------------- | --------------- | ---------------------------- |
| `GET /rest/fxr-insights/summary`         | `insights:list` | `InsightsSummary`            |
| `GET /rest/fxr-insights/by-workflow`     | `insights:list` | `InsightsByWorkflow`         |
| `GET /rest/fxr-insights/by-time`         | `insights:list` | `InsightsByTime[]`           |
| `GET /rest/fxr-insights/by-time/time-saved` | `insights:list` | `RestrictedInsightsByTime[]` |

Design notes:

- **Tables are upstream's**: `insights_metadata` / `insights_raw` / `insights_by_period` and their
  entities & repositories are reused via the DI container. No fork tables, entities, or migrations.
- **No fork config class**: collection/compaction/pruning knobs stay the upstream `N8N_INSIGHTS_*`
  env vars; the fork adds none.
- **Settings**: `settings()` returns the upstream settings shape with every date range
  licensed=true (no LicenseState dependency), so the range picker ports unchanged.
- **Queries**: DTOs and response types come from `@n8n/api-types` unchanged. Date defaulting
  (last 7 days / today) is ported verbatim from the upstream controller, minus the license checks
  (`@Licensed`, `validateDateFiltersLicense`) — the fork serves all history and granularities.
- **Enable**: append `fxr-insights` to `N8N_ENABLED_MODULES`. Must not disable the upstream
  `insights` module — it registers the entities and runs the engine.
- **Frontend**: the editor's insights feature (`features/execution/insights`) calls
  `/rest/fxr-insights/*`, reads `moduleSettings['fxr-insights']`, and gates the sidebar entry and
  route on the `fxr-insights` module being active.
