# n8n licensed (Enterprise) features: scope for FXR

Snapshot of what in this fork is gated behind a paid n8n license, how the gate works, and which
files carry the Enterprise License. Generated from the source at commit `00776cf` (upstream
master, June 2026 snapshot). Feature flags come from `packages/@n8n/constants/src/index.ts`.

## How the gate works

- The server pulls entitlements from `https://license.n8n.io` using `N8N_LICENSE_ACTIVATION_KEY`
  (`packages/cli/src/license.ts`). No key means plan `Community`: every `feat:*` flag is false.
- Backend: controllers use `@Licensed('feat:x')`, services call `license.isXLicensed()`, and whole
  modules declare `licenseFlag` in `@BackendModule(...)` so they do not even load when unlicensed.
- Frontend: `packages/cli/src/services/frontend.service.ts` sends an `enterprise` block of booleans
  to the UI; components check `EnterpriseEditionFeature.X` (44 call sites, 14 of them for Sharing).
- Quotas default to unlimited when unlicensed, except team projects (0) and AI credits (0).

## Licensed features

| Flag | What it unlocks | Backend gate | Relevance to FXR |
|---|---|---|---|
| `feat:sharing` | Share workflows and credentials with other users | `@Licensed` on sharing endpoints, `workflow.service.ee.ts`, `credentials.service.ee.ts` | High. Without it, every workflow/credential belongs to one owner's personal space |
| `feat:projectRole:*`, `quota:maxTeamProjects` | Team projects with admin/editor/viewer roles | `project.service.ee.ts`, `@n8n/permissions/*.ee.ts` | High. Community gets 0 team projects |
| `feat:advancedPermissions` | Global admin role, member role management | `isAdvancedPermissionsLicensed()` (3 sites) | Medium |
| `feat:customRoles` | Define custom roles | `isCustomRolesLicensed()` | Low |
| `feat:personalSpacePolicy` | Restrict what members can do in personal space | `@Licensed('feat:personalSpacePolicy')` | Low |
| `feat:variables`, `quota:maxVariables` | `$vars` environment variables | `environments.ee/variables/*.ee.ts` | Medium. Useful for prod vs staging config |
| `feat:sourceControl` | Git-backed environments, push/pull workflows between staging and prod | module `source-control.ee` (9 files) | High for the staging/prod plan |
| `feat:externalSecrets` | Pull credentials from Azure Key Vault, AWS, Vault, etc. | module `external-secrets.ee` (13 files) | Medium. Key Vault integration would be nice-to-have |
| `feat:logStreaming` | Stream audit/event logs to webhook, syslog, Sentry | module `log-streaming.ee` | Low |
| `feat:ldap`, `feat:saml`, `feat:oidc` | SSO logins | modules `ldap.ee`, `sso-saml`, `sso-oidc` | Medium. Entra ID login would use OIDC |
| provisioning (needs any SSO flag) | Auto-create users and map roles from the IdP | module `provisioning.ee` | Low |
| `feat:mfaEnforcement` | Force MFA for all users | `isMFAEnforcementLicensed()` | Low. Optional MFA stays free |
| `feat:apiKeyScopes` | Scoped public API keys | public API | Low |
| `feat:apiDisabled` | Switch off the public API | `isAPIDisabled()` | None |
| `feat:advancedExecutionFilters` | Filter executions by metadata, annotations | `execution.service.ee.ts`, annotation tag files | Low |
| `feat:debugInEditor` | Load a failed execution into the editor | `isDebugInEditorLicensed()` | Medium. Free with community registration |
| `feat:folders` | Folders in the workflow list | `@Licensed('feat:folders')` | Medium. Free with community registration |
| `feat:workflowDiffs`, `feat:namedVersions`, `quota:workflowHistoryPrune` | Long workflow history, named versions, visual diffs | `@Licensed('feat:namedVersions')` | Low. Community keeps 24h of history |
| `feat:insights:*` | Insights dashboard beyond the summary | `@Licensed('feat:insights:viewDashboard')` | Low |
| `feat:binaryDataS3` | Store binary data in S3-compatible storage | `core/src/binary-data/object-store/object-store.service.ee.ts` | Medium if workflows handle files. Filesystem mode stays free |
| `feat:multipleMainInstances` | Several main instances behind a load balancer | `scaling/multi-main-setup.ee.ts` | None at current scale. Workers are free |
| `feat:workerView` | Worker status page in the UI | `scaling/worker-status.service.ee.ts` | Low. Logs cover it |
| `feat:dynamicCredentials`, `feat:tokenExchange` | Per-request credential resolution, OAuth token exchange | modules `dynamic-credentials.ee`, `token-exchange` | Low |
| `feat:dataRedaction` | Redact sensitive values in execution data | frontend gate | Low |
| `feat:aiAssistant`, `feat:askAi`, `feat:aiBuilder`, `feat:aiCredits`, `feat:aiGateway` | n8n-hosted AI assistant, builder and gateway | `@Licensed('feat:aiBuilder')`, `@Licensed('feat:aiGateway')` | None. Own LLM credentials in AI nodes are free |
| `feat:communityNodes:customRegistry`, `feat:n8nPackages` | Private npm registry for community nodes | module `n8n-packages` | Low |
| `feat:showNonProdBanner` | Banner marking an instance as non-production | `isLicensed(SHOW_NON_PROD_BANNER)` | Low |
| `feat:otel:customSpanAttributes` | Custom OpenTelemetry span attributes | config | None |
| evaluations (`quota:evaluations:*`) | Workflow evaluation runs and metrics | `evaluation.ee/*`, Evaluation nodes | Low |

## Free, often assumed paid

Queue mode, workers, Redis, Postgres, webhooks, the full node library, AI nodes with your own API
keys, optional MFA, 24h workflow history, the public API, execution pruning, and unlimited users and
active workflows. Community registration (Settings, Usage and plan, free key by email) adds folders,
debug in editor and custom execution data search, per n8n's documentation.

## Enterprise-licensed files (118)

`LICENSE.md` excludes any file with `.ee.` in its name or `.ee` in its directory from the Sustainable
Use License. `LICENSE_EE.md` allows copying and modifying them for development and testing, forbids
production use without a license, and forbids patches that bypass the gate. They ship inside every
n8n image, including ours, and stay inert without a key.

| Area | Files |
|---|---|
| Permissions model (`@n8n/permissions`) | 17 |
| DB entities and repositories for evaluations, annotations, secrets providers | 13 |
| External secrets module | 13 |
| Source control module | 9 |
| Evaluations (cli + Evaluation nodes) | 12 |
| Provisioning, LDAP, SAML, OIDC | 13 |
| Log streaming destinations | 4 |
| Sharing, projects, variables, execution and workflow EE services | 10 |
| Scaling (multi-main, worker view) and S3 binary data | 3 |
| Frontend components, composables and API clients | 24 |

Full list:

- `packages/@n8n/db/src/entities/annotation-tag-entity.ee.ts`
- `packages/@n8n/db/src/entities/annotation-tag-mapping.ee.ts`
- `packages/@n8n/db/src/entities/evaluation-collection.ee.ts`
- `packages/@n8n/db/src/entities/evaluation-config.ee.ts`
- `packages/@n8n/db/src/entities/execution-annotation.ee.ts`
- `packages/@n8n/db/src/entities/test-case-execution.ee.ts`
- `packages/@n8n/db/src/entities/test-run.ee.ts`
- `packages/@n8n/db/src/repositories/annotation-tag-mapping.repository.ee.ts`
- `packages/@n8n/db/src/repositories/annotation-tag.repository.ee.ts`
- `packages/@n8n/db/src/repositories/project-secrets-provider-access.repository.ee.ts`
- `packages/@n8n/db/src/repositories/secrets-provider-connection.repository.ee.ts`
- `packages/@n8n/db/src/repositories/test-case-execution.repository.ee.ts`
- `packages/@n8n/db/src/repositories/test-run.repository.ee.ts`
- `packages/@n8n/permissions/src/constants.ee.ts`
- `packages/@n8n/permissions/src/public-api-permissions.ee.ts`
- `packages/@n8n/permissions/src/roles/role-maps.ee.ts`
- `packages/@n8n/permissions/src/roles/scopes/credential-sharing-scopes.ee.ts`
- `packages/@n8n/permissions/src/roles/scopes/global-scopes.ee.ts`
- `packages/@n8n/permissions/src/roles/scopes/project-scopes.ee.ts`
- `packages/@n8n/permissions/src/roles/scopes/secrets-provider-connection-sharing-scopes.ee.ts`
- `packages/@n8n/permissions/src/roles/scopes/workflow-sharing-scopes.ee.ts`
- `packages/@n8n/permissions/src/schemas.ee.ts`
- `packages/@n8n/permissions/src/types.ee.ts`
- `packages/@n8n/permissions/src/utilities/combine-scopes.ee.ts`
- `packages/@n8n/permissions/src/utilities/get-global-scopes.ee.ts`
- `packages/@n8n/permissions/src/utilities/get-resource-permissions.ee.ts`
- `packages/@n8n/permissions/src/utilities/get-role-scopes.ee.ts`
- `packages/@n8n/permissions/src/utilities/has-global-scope.ee.ts`
- `packages/@n8n/permissions/src/utilities/has-scope.ee.ts`
- `packages/@n8n/permissions/src/utilities/static-roles-with-scope.ee.ts`
- `packages/cli/src/controllers/annotation-tags.controller.ee.ts`
- `packages/cli/src/credentials/credentials.service.ee.ts`
- `packages/cli/src/environments.ee/variables/variables.controller.ee.ts`
- `packages/cli/src/environments.ee/variables/variables.service.ee.ts`
- `packages/cli/src/evaluation.ee/evaluation-collections.controller.ee.ts`
- `packages/cli/src/evaluation.ee/insights/eval-insights.controller.ee.ts`
- `packages/cli/src/evaluation.ee/test-runner/errors.ee.ts`
- `packages/cli/src/evaluation.ee/test-runner/evaluation-metrics.ee.ts`
- `packages/cli/src/evaluation.ee/test-runner/test-run-cleanup.service.ee.ts`
- `packages/cli/src/evaluation.ee/test-runner/test-runner.service.ee.ts`
- `packages/cli/src/evaluation.ee/test-runner/utils.ee.ts`
- `packages/cli/src/evaluation.ee/test-runs.controller.ee.ts`
- `packages/cli/src/evaluation.ee/test-runs.types.ee.ts`
- `packages/cli/src/executions/execution.service.ee.ts`
- `packages/cli/src/modules/external-secrets.ee/external-secrets-manager.ee.ts`
- `packages/cli/src/modules/external-secrets.ee/external-secrets-providers.ee.ts`
- `packages/cli/src/modules/external-secrets.ee/external-secrets-settings.controller.ee.ts`
- `packages/cli/src/modules/external-secrets.ee/external-secrets-settings.service.ee.ts`
- `packages/cli/src/modules/external-secrets.ee/external-secrets.controller.ee.ts`
- `packages/cli/src/modules/external-secrets.ee/external-secrets.service.ee.ts`
- `packages/cli/src/modules/external-secrets.ee/redaction.service.ee.ts`
- `packages/cli/src/modules/external-secrets.ee/secret-provider-access-check.service.ee.ts`
- `packages/cli/src/modules/external-secrets.ee/secrets-providers-completions.controller.ee.ts`
- `packages/cli/src/modules/external-secrets.ee/secrets-providers-connections.controller.ee.ts`
- `packages/cli/src/modules/external-secrets.ee/secrets-providers-connections.service.ee.ts`
- `packages/cli/src/modules/external-secrets.ee/secrets-providers-project.controller.ee.ts`
- `packages/cli/src/modules/external-secrets.ee/secrets-providers-types.controller.ee.ts`
- `packages/cli/src/modules/ldap.ee/helpers.ee.ts`
- `packages/cli/src/modules/ldap.ee/ldap.controller.ee.ts`
- `packages/cli/src/modules/ldap.ee/ldap.service.ee.ts`
- `packages/cli/src/modules/log-streaming.ee/destinations/message-event-bus-destination-sentry.ee.ts`
- `packages/cli/src/modules/log-streaming.ee/destinations/message-event-bus-destination-syslog.ee.ts`
- `packages/cli/src/modules/log-streaming.ee/destinations/message-event-bus-destination-webhook.ee.ts`
- `packages/cli/src/modules/log-streaming.ee/destinations/message-event-bus-destination.ee.ts`
- `packages/cli/src/modules/provisioning.ee/provisioning.controller.ee.ts`
- `packages/cli/src/modules/provisioning.ee/provisioning.service.ee.ts`
- `packages/cli/src/modules/provisioning.ee/role-mapping-rule.controller.ee.ts`
- `packages/cli/src/modules/provisioning.ee/role-mapping-rule.service.ee.ts`
- `packages/cli/src/modules/provisioning.ee/role-resolver.service.ee.ts`
- `packages/cli/src/modules/source-control.ee/middleware/source-control-enabled-middleware.ee.ts`
- `packages/cli/src/modules/source-control.ee/source-control-export.service.ee.ts`
- `packages/cli/src/modules/source-control.ee/source-control-git.service.ee.ts`
- `packages/cli/src/modules/source-control.ee/source-control-helper.ee.ts`
- `packages/cli/src/modules/source-control.ee/source-control-import.service.ee.ts`
- `packages/cli/src/modules/source-control.ee/source-control-preferences.service.ee.ts`
- `packages/cli/src/modules/source-control.ee/source-control-status.service.ee.ts`
- `packages/cli/src/modules/source-control.ee/source-control.controller.ee.ts`
- `packages/cli/src/modules/source-control.ee/source-control.service.ee.ts`
- `packages/cli/src/modules/sso-oidc/oidc.controller.ee.ts`
- `packages/cli/src/modules/sso-oidc/oidc.service.ee.ts`
- `packages/cli/src/modules/sso-saml/saml.controller.ee.ts`
- `packages/cli/src/modules/sso-saml/saml.service.ee.ts`
- `packages/cli/src/modules/sso-saml/service-provider.ee.ts`
- `packages/cli/src/public-api/v1/handlers/users/users.handler.ee.ts`
- `packages/cli/src/public-api/v1/handlers/users/users.service.ee.ts`
- `packages/cli/src/scaling/multi-main-setup.ee.ts`
- `packages/cli/src/scaling/worker-status.service.ee.ts`
- `packages/cli/src/services/annotation-tag.service.ee.ts`
- `packages/cli/src/services/project.service.ee.ts`
- `packages/cli/src/workflows/workflow.service.ee.ts`
- `packages/core/src/binary-data/object-store/object-store.service.ee.ts`
- `packages/frontend/@n8n/rest-api-client/src/api/eventbus.ee.ts`
- `packages/frontend/@n8n/rest-api-client/src/api/externalSecrets.ee.ts`
- `packages/frontend/@n8n/rest-api-client/src/api/secretsProvider.ee.ts`
- `packages/frontend/editor-ui/src/app/api/workflows.ee.ts`
- `packages/frontend/editor-ui/src/app/components/EnterpriseEdition.ee.vue`
- `packages/frontend/editor-ui/src/app/components/WorkflowShareModal.ee.vue`
- `packages/frontend/editor-ui/src/features/credentials/components/CredentialEdit/CredentialSharing.ee.vue`
- `packages/frontend/editor-ui/src/features/execution/executions/components/workflow/WorkflowExecutionAnnotationPanel.ee.vue`
- `packages/frontend/editor-ui/src/features/execution/executions/components/workflow/WorkflowExecutionAnnotationTags.ee.vue`
- `packages/frontend/editor-ui/src/features/integrations/externalSecrets.ee/components/ExternalSecretsProviderCard.ee.vue`
- `packages/frontend/editor-ui/src/features/integrations/externalSecrets.ee/components/ExternalSecretsProviderConnectionSwitch.ee.vue`
- `packages/frontend/editor-ui/src/features/integrations/externalSecrets.ee/components/ExternalSecretsProviderImage.ee.vue`
- `packages/frontend/editor-ui/src/features/integrations/externalSecrets.ee/components/ExternalSecretsProviderModal.ee.vue`
- `packages/frontend/editor-ui/src/features/integrations/secretsProviders.ee/components/DeleteSecretsProviderModal.ee.vue`
- `packages/frontend/editor-ui/src/features/integrations/secretsProviders.ee/components/SecretsProviderConnectionCard.ee.vue`
- `packages/frontend/editor-ui/src/features/integrations/secretsProviders.ee/components/SecretsProviderConnectionModal.ee.vue`
- `packages/frontend/editor-ui/src/features/integrations/secretsProviders.ee/components/SecretsProviderImage.ee.vue`
- `packages/frontend/editor-ui/src/features/integrations/secretsProviders.ee/components/SecretsProvidersEmptyState.ee.vue`
- `packages/frontend/editor-ui/src/features/integrations/secretsProviders.ee/composables/useConnectionModal.ee.ts`
- `packages/frontend/editor-ui/src/features/integrations/secretsProviders.ee/composables/useSecretsProviderConnection.ee.ts`
- `packages/frontend/editor-ui/src/features/integrations/secretsProviders.ee/composables/useSecretsProvidersList.ee.ts`
- `packages/frontend/editor-ui/src/features/integrations/secretsProviders.ee/views/SettingsSecretsProviders.ee.vue`
- `packages/frontend/editor-ui/src/features/shared/tags/components/AnnotationTagsDropdown.ee.vue`
- `packages/frontend/editor-ui/src/features/shared/tags/components/TagsManager/AnnotationTagsManager.ee.vue`
- `packages/nodes-base/nodes/Evaluation/Evaluation/CannedMetricPrompts.ee.ts`
- `packages/nodes-base/nodes/Evaluation/Evaluation/Evaluation.node.ee.ts`
- `packages/nodes-base/nodes/Evaluation/EvaluationTrigger/EvaluationTrigger.node.ee.ts`

## What this means for FXR

1. Everything we run today is free. Nothing in the Azure setup touches a licensed path.
2. The two gaps that will bite first are **sharing** and **team projects**. Without them, each
   workflow and credential belongs to the user who created it. Workaround: a shared service
   account that owns production workflows, with people logging in as themselves only to build.
3. **Source control** is the licensed answer to promoting workflows from staging to prod. The free
   alternative is export/import via the public API, which we can script in the pipeline.
4. **External secrets** with Azure Key Vault would be the clean credential story. Free alternative
   is credentials in n8n's encrypted table, which is what we have.
5. If those gaps become real, n8n's Business plan is the tier that includes sharing, projects,
   source control and external secrets. Price on request from n8n.
