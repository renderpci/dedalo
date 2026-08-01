# WC-076 — the engine advisory sheds its daemon-era keys and controls (2026-07-30)

- **Date:** 2026-07-30. Completes the removal WC-005 started; sibling of WC-075.
- **Why.** WC-005 removed the daemon lifecycle from the maintenance widget but
  left the TOOL's advisory surface intact, because it renders from a different
  action (`dd_diffusion_api::get_engine_advisory`). What stayed behind was a
  control for a process that no longer exists: a "Restart engine" button, a
  "Show log" button reading the daemon's log tail, and an `auto_recover` request
  option asking the server to restart the engine before answering — served, post
  cutover, by the very process it would have restarted.
- **Reachability, stated honestly.** None of it rendered. `buildEngineAdvisory`
  hardcodes `state:'ok'` (the engine is in-process), `get_content_data` only
  draws the banner when `state!=='ok'`, and `actions` was always `[]`. This is a
  DEAD-CODE retirement, not a behaviour change: no user could reach any of it.
  It is worth doing anyway — a dead branch keyed on `actions` is exactly what
  comes back to life the first time `actions` is non-empty for an unrelated
  reason.
- **Shape before (TS):** `get_engine_advisory` → `{result, state, is_admin,
  recovered, title, cause, steps, actions, checks, service_cmd_configured,
  log_tail}`; request options `{auto_recover:boolean}`.
- **Shape after (TS):** `{result, state, is_admin, title, cause, steps, actions,
  checks}`; request options `{}`. Three keys retired:
  - `recovered` — whether an auto-recover attempt had restarted the daemon.
  - `service_cmd_configured` — whether `DEDALO_DIFFUSION_SERVICE_CMD` was set.
    That key is itself `dropped(…, NO_CONSUMER)` in `migration_map.ts`.
  - `log_tail` — the tail of the daemon's log file. The engine's log is now the
    server's own journal (`engineering/PRODUCTION.md` §2).
  Emitting them as a permanent `false`/`false`/`null` was the wrong compromise:
  a constant that LOOKS like a signal is one a client eventually branches on.
- **Client.** `tools/tool_diffusion/js/`: the `restart_engine` and `show_log`
  action blocks are gone from `render_tool_diffusion.js`, `auto_recover` is gone
  from the `get_engine_advisory` request and its catch-fallback in
  `tool_diffusion.js`, and the stale "Dispatched by PHP dd_diffusion_api (NOT
  Bun)" note is corrected — it has been Bun since the cutover. `retry` is the
  only remaining action. The banner itself is KEPT as the shape a genuine
  unhealthy verdict would use (a target DB going away is the plausible one),
  documented in place as not-live-UI.
- **Gate reconciliation:** `diffusion_dispatch_gate.test.ts` (hermetic) asserts
  the three keys are absent from `buildEngineAdvisory` while the live shape
  (`state`/`title`/`checks.engine`) is unchanged, and that no client branch on
  `restart_engine` / `show_log` / `log_tail` / `auto_recover` returns. The
  assertions match CODE patterns, not the prose that explains the retirement.
  No re-harvest: `tools/` is outside client byte-identity (WC-005).
