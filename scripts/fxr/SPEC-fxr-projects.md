# Spec: `fxr-projects`, team projects for FXR

Status: draft for review. Not started. Follows the `fxr-sharing` pattern.

## Goal

Team projects in the normal n8n UI: a project sidebar, project settings with members and roles,
workflows and credentials owned by a project rather than a person, and a "move to project" action.
All for internal FXR use under the Sustainable Use License, without modifying, copying from, or
depending on any new code in `.ee` files.

## What the trace found

The free code already contains almost the whole feature. It is hidden, not missing.

| Piece | Where | Free? | Gate |
|---|---|---|---|
| `project`, `project_relation`, `role`, `role_scope` tables and entities | `@n8n/db` | yes | none |
| Project roles `project:admin/editor/viewer` with their scopes, synced into the DB at startup for every instance | `@n8n/db/src/services/auth.roles.service.ts` | yes | none, synced regardless of license |
| `ProjectController` read endpoints: list, count, my-projects, get one | `cli/src/controllers/project.controller.ts` | yes | none |
| `POST /projects` create | same file, line 101 | yes | `@Licensed('feat:projectRole:admin')` |
| Member add/change/remove, update, delete | same file | yes | delegate to `project.service.ee.ts` |
| Workflow/credential list, open, run, save for project members | `workflow.service.ts`, finders | yes | role-driven, no license check |
| Create workflow inside a project | `workflows.controller.ts:112` | yes | scope check only |
| Whole project UI: navigation, settings, members table, role select, move modal, create flow | `editor-ui/src/features/collaboration/projects/` (30+ components) | yes | hidden when `settings.enterprise.projects.team.limit === 0` |
| Role dropdown shows roles as locked | `role.service.ts:355` sets `licensed: false` on project roles | yes | license check in free file |
| Move workflow/credential to project | `/workflows/:id/transfer` | yes | delegates to `workflow.service.ee.ts` |

So the work is: a backend module that performs the five writes the EE service performs today
(create project, change members, update, delete, move resource), and four small edits to free
frontend files so the existing UI turns on and calls our endpoints for those writes.

## Backend: `packages/cli/src/modules/fxr-projects/`

`@BackendModule({ name: 'fxr-projects', instanceTypes: ['main'] })`, `settings()` returns
`{ enabled: true, teamProjectsLimit: -1 }`, served to the UI via the existing `/rest/module-settings`. Registered by one line in `modules.config.ts`. Uses only `ProjectRepository`,
`ProjectRelationRepository`, `SharedWorkflowRepository`, `SharedCredentialsRepository`,
`RoleRepository`, `UserRepository`.

| Method | Path | Scope | Behaviour |
|---|---|---|---|
| POST | `/rest/fxr-projects` | `@GlobalScope('project:create')` | Insert `project {type:'team', name, icon, description, creatorId}` and `project_relation {creator, 'project:admin'}`. Returns the project. |
| PATCH | `/rest/fxr-projects/:projectId` | `@ProjectScope('project:update')` | name, icon, description. Team projects only. |
| PUT | `/rest/fxr-projects/:projectId/members` | `@ProjectScope('project:update')` | Body `{ relations: [{ userId, role }] }`, replaces the member list. Roles restricted to `project:admin|editor|viewer`. Refuses to remove the last admin. |
| PATCH | `/rest/fxr-projects/:projectId/members/:userId` | `@ProjectScope('project:update')` | Change one role. Same last-admin rule. |
| DELETE | `/rest/fxr-projects/:projectId/members/:userId` | `@ProjectScope('project:update')` | Remove one member. |
| DELETE | `/rest/fxr-projects/:projectId?transferId=` | `@ProjectScope('project:delete')` | Requires `transferId` unless the project owns nothing. Repoints `workflow:owner` / `credential:owner` rows to the transfer project, deletes relations, deletes project. Never deletes workflows. |
| PUT | `/rest/fxr-projects/workflows/:workflowId/move` | `@ProjectScope('workflow:move')` | Body `{ destinationProjectId }`. Updates the `workflow:owner` row's `projectId`; deletes any `workflow:editor` row for the destination. Deactivates and reactivates if active so triggers re-register. |
| PUT | `/rest/fxr-projects/credentials/:credentialId/move` | `@ProjectScope('credential:move')` | Same for `credential:owner` / `credential:user`. |

Personal projects are never created, deleted, or given members by this module. Reads keep using
the free `/rest/projects/*` endpoints.

Unit tests per endpoint: happy path, scope denial, last-admin rule, delete-without-transfer
refusal, move of an active workflow.

## Frontend: four edits to free files

1. `features/collaboration/projects/projects.store.ts` line 69: `teamProjectsLimit` becomes
   `enterprise.projects.team.limit || moduleSettings['fxr-projects']?.teamProjectsLimit || 0`.
   A real license still wins; otherwise our module's value applies; module off is upstream
   behaviour. This single change reveals the sidebar, create flow, settings, members table and
   move modal.
2. `features/collaboration/projects/projects.api.ts`: `createProject`, `updateProject`,
   `deleteProject`, `addProjectMembers`, `updateProjectMemberRole`, `deleteProjectMember` call
   `/fxr-projects/...` when the module is active, else the original paths.
3. `app/stores/roles.store.ts` `processedProjectRoles`: mark the three built-in project roles
   `licensed: true` when the module is active, so the role select is usable.
4. `features/collaboration/projects/projects.store.ts` `moveResourceToProject`: call the module's
   move endpoints when active. The EE `workflows.ee.ts` client file stays untouched.

Each edit is a few lines guarded by the module flag, so an upstream sync merges cleanly and the
behaviour is identical to upstream when the module is off. No `.ee.vue` or `.ee.ts` file changes.

## Rollout

| Phase | Scope | Est. |
|---|---|---|
| 1 | Backend module, create/members/update, tests, `modules.config.ts` line | 1.5 days |
| 2 | Frontend edits 1 to 3, manual test with two users on staging | 1 day |
| 3 | Move endpoints + frontend edit 4, delete-with-transfer | 1 day |
| 4 | Deploy via pipeline (`N8N_ENABLED_MODULES=fxr-sharing,fxr-projects`), migrate existing workflows into projects | 0.5 day |

`fxr-sharing` stays for ad-hoc person-to-person sharing; projects become the default home for
anything shared by a team.

## Risks

- `@ProjectScope` is enforced by `permissions.ee/check-access.ts`. We use the decorator exactly as
  every free controller does and change nothing in it. Worth a lawyer's confirmation along with the
  rest of the "internal use" position.
- Folders inside projects are a separate licensed flag (`feat:folders`), free with community
  registration. Register the instance before expecting folders in project views.
- Upstream changes to the project UI can conflict with edits 1 to 4. Keeping each edit to a guarded
  few lines limits that.
- The free `GET /projects/*` reads run through `project.service.ee.ts`, as they already do for
  personal projects on every community instance. We add no new dependency on that file.

## Out of scope

Custom roles, project-level variables, external secrets per project, SSO role mapping. Each is a
separate licensed feature with its own gate.
