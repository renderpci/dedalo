# WC-075 — `diffusion_server_control.set_scheduler` gains `drain_resume`; `scheduler.draining` on both readouts (2026-07-30)

- **Date:** 2026-07-30. Widens the action list WC-005 pinned when the daemon
  lifecycle was removed.
- **Why now.** The PHP widget had three lifecycle buttons —
  `start_server`/`stop_server`/`restart_server`, which shelled out to
  `DEDALO_DIFFUSION_SERVICE_CMD` against a SEPARATE Bun daemon. WC-005 removed
  them because the daemon does not exist post-cutover (diffusion is in-process;
  `info.ts` reports `service_cmd_configured:false`, `actions:[]`), and
  `diffusion_server_control.test.ts` denies the three method names. That
  decision stands. What was missing is the operation those buttons stood in for:
  an admin quiescing publication work before a backup, a schema change or a
  config edit. There is exactly one controllable thing left — job DISPATCH — so
  the lifecycle controls live on `set_scheduler`, not on revived daemon verbs.
- **Shape before (TS):** `set_scheduler` accepts `'pause' | 'resume'`; the
  scheduler readout carries `{running, queued, max_runners, paused,
  stale_after_seconds}` in BOTH serializations — `get_value.result.scheduler`
  and the 1 Hz `QueueFrame.scheduler` of `follow_queue` (WC-069).
- **Shape after (TS):**
  1. `set_scheduler` accepts `'pause' | 'resume' | 'drain_resume'`. Anything
     else still refuses with `errors:['invalid_action']`; the message now
     enumerates the three. `drain_resume` on an already-draining scheduler
     refuses with `errors:['already_draining']`.
  2. `drain_resume` RETURNS IMMEDIATELY (`result:true`, msg contains
     'Draining'). It does not carry the wait: the drain is bounded by
     `DRAIN_TIMEOUT_MS` (5 min), far beyond `SERVER_IDLE_TIMEOUT_S` (255 s max)
     and the documented 300 s proxy read timeout. Progress is observed on the
     queue stream, which is what that stream is for.
  3. Both scheduler serializations gain `draining: boolean` — `get_value` and
     `QueueFrame.scheduler` (including its degenerate error/deadline/refusal
     frames, which report `false`). One meaning, two wires: the client renders a
     single Dispatch pill from `paused` + `draining`, and a frame missing the
     key would silently read as "not draining".
- **Semantics.** `drain_resume` = pause dispatch → poll `countRunningJobs()`
  until 0 → resume + kick. On timeout it stays PAUSED and reports `timed_out`:
  cancellation is cooperative, so resuming on top of runners that would not
  drain is exactly the state the operator asked to avoid. `resumeScheduler()`
  aborts an in-flight drain (the waiter re-reads the latch each poll), so an
  admin is never stuck behind a runner with minutes of work left. All of it is
  in-memory and resets to running on restart, like `paused` already did.
- **Client.** Three buttons in the scheduler panel — Resume dispatch
  (`success`), Pause dispatch (`danger`), Drain & resume (`warning`) — matching
  the PHP button colours, with the honest labels. They are DISPATCH controls;
  the naming deliberately does not say "server". The live layer patches the
  Dispatch pill and the three disabled states from the stream, because a drain
  ends minutes after the request that started it returned and nothing else
  would ever repaint it.
- **Gate reconciliation:** `diffusion_server_control.test.ts` (DB tier) covers
  `drain_resume` end to end and the `draining` key on `get_value`;
  `diffusion_dispatch_gate.test.ts` (HERMETIC tier — new) covers verb
  validation, pause/resume, and that the retired daemon verbs are not smuggled
  back in as scheduler actions. `diffusion_queue_stream.test.ts` carries the new
  frame key. No re-harvest: the frozen store predates `follow_queue` (WC-069)
  and this widget's panel is TS-owned (WC-005).

### WC-074 addendum — the folded card, the map chip, and the boot wipe probe (2026-07-30)

Recorded with the entry because the eager verdict added in WC-074 was only
*enabling* a collapsed-card warning; nothing rendered it. These are the
consumers that make the verdict visible without opening a panel.

- **The folded card warns.** `render_database_info.js` now calls
  `set_widget_label_style(self, 'warning', add|remove, …)` from its render, which
  runs on page load for every card (see the WC-071 note in
  `docs/core/areas/area_maintenance.md`: cards are built and rendered
  unconditionally). `self.value` carries the verdict there because of WC-074's
  `eagerValue`, so the header tints before anyone expands anything.
- **A new `.warning` header variant** in `area_maintenance.less`, beside the
  existing `.danger`. Deliberately NOT `.danger`: degraded statistics mean "come
  and press a button", not "something failed", and painting it red trains
  operators to ignore red. `bun run css:build` re-run — the committed `.css` and
  `.css.map` are the served artifacts and `css_build_tripwire` demands byte
  identity with a fresh compile.
- **The Map `pg` node reports it.** `render_area_maintenance.js`'s map probe
  ALREADY fetched `database_info`'s value and used only `r.tables.length`; the
  `statistics` verdict was fetched and discarded. It now sets the node to
  `warn` + "Statistics degraded" with the offender count. `warn`, not `bad`: the
  database is serving fine.
- **Boot wipe probe (server.ts, inside the `!config.installMode` guard).**
  Fire-and-forget, `.catch()`ed, never awaited, DETECTION ONLY. Predicate:
  `pg_stat_bgwriter.stats_reset >= pg_postmaster_start_time()`.
  `pg_stat_database.stats_reset` cannot serve this — variable-numbered stats
  entries are DROPPED and recreated NULL (measured: 0 non-null rows). The
  fixed-numbered views reset in place WITH a timestamp, so the predicate means
  "the cumulative counters were discarded at or after this boot". Verified TRUE
  on this cluster (`stats_reset` 2026-07-28 11:02:18 vs postmaster start
  11:02:15, corroborated by `postgresql@18.log`: "database system was not
  properly shut down").
  Two deliberate limits: it stays TRUE for the whole postmaster lifetime, so it
  is PROVENANCE and never "repair owed"; and it is blind to a restore into a
  fresh cluster (counters zero, flag FALSE) — exactly the case the per-table
  verdict catches. The two signals are complements.
- **Still no repair without an operator, and still no scheduler** — see the
  WC-074 "deliberately not built" list. Boot auto-ANALYZE stays rejected because
  multiple Bun instances against one database is a documented topology
  (`STAGING_VALIDATION.md`) and a rolling restart would fire N concurrent
  ANALYZEs.
