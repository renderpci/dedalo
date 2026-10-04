# WC-2026-10-01-tool-grant-one-decision — one tool-grant decision; the admin flag widens nothing at any door

- **Date:** 2026-10-01 (closure Step 3, integrator request 8 — consolidate the grant checks
  onto `assertToolGranted`).
- **Decision:** closure Step 3 (SEC-3 / TOOLS-4 follow-up). Code:
  `src/core/tools/security.ts` (`isToolGranted` — the one decision; `assertToolGranted`
  throws on it), its callers: `src/core/tools/dispatch.ts` (gates 3+4),
  `src/core/api/handlers/dd_core_api.ts` (the `?tool=` deep link and
  `get_element_context`'s tool branch), `tools/tool_export/server/access.ts`
  (`exportToolAuthorized`), and the toolbar stamp `src/core/tools/registry.ts`
  (`currentActorToolNames`).
- **Shape before:** `getUserTools` stopped widening the list for global admins on
  2026-08-09, but two places still keyed on the ADMIN FLAG: (1) the dispatcher answered a
  non-superuser global admin `tool.invalid_name` for a real, active tool its profile does
  not grant ("an admin sees every active tool" — no longer true); (2) the element toolbar
  stamp skipped the profile filter for every global admin, so their toolbars offered every
  tool and the dispatcher then refused the click. `get_element_context`'s tool branch read
  `context.session.userId` through a cast (a session-less call threw a 500).
- **Shape after:** the grant is decided in ONE function, keyed on the identity: the
  superuser (-1) holds every active tool; everyone else, global admins included, holds
  what the profile grants plus the always-active tools. (1) A non-superuser global admin
  asking an ungranted tool gets **403 `tool.not_authorized`**; `tool.invalid_name` stays
  for a malformed name and, for the superuser, an unknown or inactive one. (2) A global
  admin's toolbar lists exactly the tools its profile grants. (3) `get_element_context`
  asks the principal; a session-less call is the 403.
- **Reason:** a tool is used by the profiles it is granted to; one rule, asked the same way
  at every door, cannot drift between them.
- **Gate reconciliation:** no parity fixture pins a non-superuser admin's tool refusal or
  toolbar (the frozen store's admin is the superuser); no re-harvest. Gates:
  `test/unit/tools_dispatch.test.ts` (gate 4: the non-superuser admin leg),
  `test/unit/component_tools_stamp.test.ts` (the admin flag widens no toolbar; the
  superuser keeps the full list), `test/unit/get_element_context_native.test.ts` (the
  session-less 403).
