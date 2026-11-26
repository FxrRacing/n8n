# fxr-projects

FXR-authored module that turns on team projects for internal use.

- `settings()` reports `teamProjectsLimit: -1`. The projects store reads it as a fallback when the
  licensed limit is 0, which reveals n8n's existing (free) project UI.
- `POST /rest/fxr-projects` creates a team project and makes the caller `project:admin`
  (`@GlobalScope('project:create')`, so instance owner/admins). The store routes creation here when
  the module is active.
- `POST/PATCH/DELETE /rest/fxr-projects/roles[/:slug]` manage custom project roles
  (`@GlobalScope('role:manage')`) through the free `RoleService`. `settings()` reports
  `customRoles: true`, which the settings store reads to show the Project Roles page.
- Everything else (list, settings, members, move) uses n8n's existing endpoints.

Enable with `N8N_ENABLED_MODULES=fxr-sharing,fxr-projects`. Imports from and copies nothing in `.ee`
files; uses the free project, project_relation and role repositories.
