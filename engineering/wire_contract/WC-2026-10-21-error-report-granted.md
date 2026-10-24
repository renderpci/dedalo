# WC-2026-10-21-error-report-granted — `tool_error_report_granted` page_globals key (TS-only) gates the error-report launcher

- **Date:** 2026-10-21.
- **Shape:** `buildPageGlobals` (`src/core/resolve/environment.ts`) emits a new
  boolean `tool_error_report_granted`: `true` when the session principal is a
  global admin (the tool's `sendReport` handler refuses anyone else) AND the ONE
  grant door (`isToolGranted`, `src/core/tools/security.ts` — profile dd1067
  grants, always_active, superuser -1) authorizes `tool_error_report`. `false`
  for anonymous callers. PHP `get_page_globals` has NO twin.
- **Why:** the global launcher tab (`client/dedalo/core/common/js/error_report_launcher.js`)
  gated on `is_global_admin`, but since 2026-08-09 the tool ACL has no admin
  flag; an admin whose profile lacked the tool saw the tab and every click
  answered `tool.not_authorized`. A page_globals key costs no round-trip (both
  reads behind `isToolGranted` are cached) — preferred over a per-page
  `user_tools` request.
- **Client effect:** the launcher installs only when the key is `true`.
- **Gate reconciliation:** `test/parity/environment_differential.test.ts`
  (page_globals key-set test) asserts the key present TS-side / absent PHP-side,
  then strips it before the exact key-set compare — the WC-031 pattern.
