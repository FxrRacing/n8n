# fxr-sharing

FXR-authored module. Lets a workflow or credential owner (or the instance owner) grant other users
on this instance `workflow:editor` / `credential:user` access, by writing rows to the existing
`shared_workflow` and `shared_credentials` tables. The free list, open, run and update paths in
n8n are role-driven and pick these rows up with no further changes.

Enable with `N8N_ENABLED_MODULES=fxr-sharing`.

| Method | Path                                                                  | Scope               |
| ------ | --------------------------------------------------------------------- | ------------------- |
| GET    | `/rest/fxr-sharing/users`                                             | `user:list`         |
| GET    | `/rest/fxr-sharing/workflows/:workflowId`                             | `workflow:read`     |
| PUT    | `/rest/fxr-sharing/workflows/:workflowId` `{ userIds: string[] }`     | `workflow:update`   |
| GET    | `/rest/fxr-sharing/credentials/:credentialId`                         | `credential:read`   |
| PUT    | `/rest/fxr-sharing/credentials/:credentialId` `{ userIds: string[] }` | `credential:update` |

PUT replaces the full sharee list. The owning project is never a sharee. Only the resource owner or
the instance owner may change sharing. This module imports from and copies nothing in any `.ee`
file; it depends only on the entities, repositories and decorators licensed under the Sustainable
Use License.
