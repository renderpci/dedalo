# WC-030 — `php_info` + `php_runtime` maintenance widgets MERGED into one native `runtime_info` (catalog shrinks 31 → 30)

- **Date:** 2026-07-15.
- **Shape:** two PHP-oracle-era catalog slots become one. `php_info` (a
  `phpinfo()` iframe with no Bun equivalent — always `engineDenied`) is
  renamed to `runtime_info`, and rather than staying a denied stub it TAKES
  OVER the already-TS-native `php_runtime` widget's real implementation (Bun
  version/pid/memory/uptime via `getValue`, plus `clear_cache_files` /
  `clear_session_files` `apiActions`); the `php_runtime` slot is then removed
  from the catalog entirely. Net effect: the TS catalog has ONE FEWER widget
  than the frozen PHP oracle (30 vs 31), and it is no longer engine-disabled —
  the panel now renders live in the dashboard.
  - **Server:** `src/core/area_maintenance/widgets/runtime_info.ts` carries
    `php_runtime.ts`'s logic under the `runtime_info` id/label (`'RUNTIME
    INFO'`, no `class` override — matches `php_runtime`'s original plain
    layout, not `php_info`'s `'violet fit width_100'` iframe styling).
    `php_runtime.ts` is deleted; `registry.ts` drops the `php_runtime` import
    and its `CORE_WIDGET_MODULES` entry, keeping `runtime_info` at the former
    `php_info` array position (catalog ORDER for every other widget is
    unchanged).
  - **Client:** `client/dedalo/core/area_maintenance/widgets/runtime_info/`
    now holds `php_runtime`'s renderer (renamed `runtime_info.js` /
    `render_runtime_info.js` / `runtime_info.less`, CSS class
    `.wrapper_widget.runtime_info`) — `php_info`'s dead iframe renderer is
    gone, not merely hidden. `render_runtime_info.js` is REWRITTEN to render
    the Bun payload the TS `getValue` actually emits (`{info:{engine,version,
    pid,platform,memory_rss,memory_heap_used,uptime_seconds}, environment}`):
    a one-line runtime summary + the info/environment blocks + the two working
    maintenance actions. The PHP-era sections it inherited (PHP user, error-log
    path, session path, opcache status, "Caches & directories" health panel,
    upload-chunk cleanup) are DELETED — they read fields the engine never
    emits, so the panel no longer reads as PHP. Two carried-over bugs are fixed
    in the same pass: the action buttons' success check was `result===true`
    but the TS `widget_request` returns `result:{cleared:[…]}`/`{pruned:N}` on
    success (now a truthiness check), and the maintenance container was renamed
    `runtime_actions` to avoid colliding with the global `.maintenance_container`
    maintenance-mode banner class in `page/css/layout/general.less`.
    `render_area_maintenance.js`'s `ENGINE_DISABLED_WIDGETS` is now EMPTY (the
    widget is no longer denied); its System Map node (`MAP_NODES` 'web') and
    tool description (`MAP_TOOL_DESC`) are re-keyed `php_runtime` →
    `runtime_info`. `test_others_lifecycle.js`'s widget census drops
    `php_runtime` and keeps `runtime_info` in its alphabetical slot.
    `scripts/sync_client.sh`'s (retired, non-executing) `TS_OWNED_EXCLUDES`
    comment is updated for history.
  - **Ownership/env gates:** `test/unit/config_env_tripwire.test.ts`'s
    NODE_ENV allowlist entry and `test/unit/update_ownership_tripwire.test.ts`'s
    `apiActions` classification keys move from `php_runtime.*` to
    `runtime_info.*`; `test/unit/server_state.test.ts`'s runtime-panel gate
    calls `runtime_info` instead of `php_runtime`.
- **Gate reconciliation:** `widgets_differential` filters the frozen PHP
  oracle's `php_runtime` entry OUT of the comparison list (PHP-only now, the
  mirror image of the `error_reports`/WC-018 TS-only filter), bringing both
  sides to 30, THEN omits `id`/`label`/`class` (in addition to the universal
  `value` omission) at the remaining slot where the frozen oracle's `id ===
  'php_info'`, matching the `diffusion_server_control` pattern — `class`
  because the widget deliberately keeps `php_runtime`'s plain layout (no
  class) instead of `php_info`'s `'violet fit width_100'`, per the server
  note above.
  `dedalo_files_differential`'s `isRuntimeInfoRenameEntry` filters ALL THREE
  of `/dedalo/core/area_maintenance/widgets/php_info/`,
  `/…/php_runtime/` (PHP-side, frozen) and `/…/runtime_info/` (TS-side, new)
  from both sides of the file-set compare (the WC-013 pattern) — the
  every-TS-url-resolves test still validates the new files serve.
