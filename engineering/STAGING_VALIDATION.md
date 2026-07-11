# STAGING_VALIDATION.md — exercise the ops hardening before production

The foundation audit (COVERAGE.md) named this its single biggest coverage hole:
the operations work (supervision, graceful shutdown, socket guard, migrations,
backup, pool posture, observability) is **code-verified and unit-tested but
never exercised through a real restart / failover**. Unit tests can't prove a
systemd unit restarts a dead process, that a SIGTERM actually drains in-flight
requests, or that a pool reconnects after Postgres bounces.

Run this once on a staging box that mirrors production (systemd, a reverse
proxy, its own Postgres + RAG pgvector, and — during coexistence — a PHP
install against the shared matrix DB). Each check states the action, the
**observable** to confirm, and the pass bar. Operating procedures and config
keys live in `PRODUCTION.md`; this page only validates them. Nothing here
writes real records — use a staging DB or scratch surfaces.

Legend: ▢ to run · ✅ pass criterion · ⚠ known limit.

---

## A. Boot, supervision, health (PRODUCTION §1–2)

**A1. Clean boot under systemd.**
▢ Install the `deploy/` units, `systemctl start dedalo-ts`, `journalctl -u dedalo-ts -f`.
✅ Boot echoes the Bun version (S2-36) and the resolved socket path; migrations
run (see D1); `/health` answers.
```
curl --fail --unix-socket /tmp/dedalo_ts.sock http://localhost/health
# expect: 200 {"result":"ok","db":"ok"}
```

**A2. Watchdog restarts a hung/dead process.**
▢ `systemctl kill -s SIGKILL dedalo-ts` (simulate a crash), watch the journal.
✅ `Restart=always` brings it back within seconds; the watchdog timer's
`curl --unix-socket … /health` probe passes again on the next 30 s tick.
✅ Kill Postgres instead (leave the server up): `/health` flips to
`503 {"db":"down"}` and the watchdog restarts the unit. Bring Postgres back →
green without a manual restart (A5 covers pool self-heal).

**A3. Double-start guard (S2-17).**
▢ With the server running, start a second instance on the **same**
`SERVER_UNIX_SOCKET`.
✅ The second process probes the live socket with `connect()`, finds it
answered, and refuses to start (**exit 1**) — it does not steal the socket.

---

## B. Graceful shutdown & drain (PRODUCTION §2, S2-17)

**B1. In-flight request survives SIGTERM.**
▢ Start a slow legitimate request (a large export or a tool action), then
`systemctl stop dedalo-ts` mid-flight.
✅ The server stops accepting **new** connections but the in-flight request
**completes** within `SERVER_SHUTDOWN_GRACE_MS` (default 10 000); the client
gets a real response, not a reset. Journal shows the ordered teardown:
scheduler cadences stopped → drain → pool closed → socket unlinked → exit 0.

**B2. Background work is marked, not lost.**
▢ Trigger a media transcode, SIGTERM before it finishes.
✅ The transcode's pfile is marked `interrupted` (not left `running`); the
boot reconcile (D3) or the sweeper heals it. Dying background tool jobs are
journaled.
⚠ Diffusion **runners** are separate processes and survive by design — confirm
a mid-publish runner keeps going across a server restart and the sweeper heals
any orphan.

**B3. Socket is released.**
✅ After exit, `/tmp/dedalo_ts.sock` is gone (unlinked) — the next boot is clean
and A3's guard has nothing stale to probe.

---

## C. Reverse proxy, timeouts, streaming (PRODUCTION §3)

**C1. Socket-only serving through the proxy.**
▢ Front the socket with the `PRODUCTION §3` nginx sketch; drive the client
through the proxy end-to-end (log in, edit a record, run a tool).
✅ Everything works over the socket; the dev TCP port is **not** exposed.

**C2. Slow request is not killed mid-handler.**
▢ Run the slowest legitimate request you have (largest export / heaviest
search) through the proxy.
✅ It completes. `SERVER_IDLE_TIMEOUT_S` (255) and the proxy
`proxy_read_timeout` (≥ 300 s) both clear it — neither hop resets it. This is
the regression the 255 s idleTimeout fixed (Bun's silent 10 s default).

**C3. Streaming passes through.**
✅ An SSE diffusion follow and an NDJSON export stream incrementally with
`proxy_buffering off` — the client sees progress, not one buffered dump.

**C4. Proxy-hop / XFF.**
✅ `TRUSTED_PROXY_HOPS` equals your proxy count: a failed login throttles on the
**real** client IP, not the proxy's (test from two client IPs behind the proxy).

---

## D. Database pool, migrations, statement timeout (PRODUCTION §4, §7)

**D1. Migrations apply at boot (S2-39).**
▢ Point a fresh staging server at a DB with the shared matrix schema present
(PHP-provisioned during coexistence) but no `dedalo_ts_*` tables.
✅ `install/db/migrate.ts` runs `0001_baseline.sql` and records it in
`dedalo_ts_schema_migrations`; a second boot is a no-op (idempotent).
▢ Point a fresh staging server at an EMPTY database.
✅ `/health` reports `db:down` and only the install wizard is served; the
TS-native installer (`src/core/install/`, wizard or headless `bun run
scripts/install.ts`) provisions matrix/dd_ontology from the vendored seed.
The former **DEC-19/S2-39 cutover blocker is RESOLVED** (2026-07-09 — see
`engineering/PRODUCTION.md` §7 and `rewrite/COEXISTENCE.md`). Coexistence
caveats: the root password is written Argon2id (TS-login-only until re-set on
the PHP side); `.env` is written with PHP key names.

**D2. Pool exhaustion is loud, not a hang (S2-32).**
▢ Set `DB_POOL_ACQUIRE_TIMEOUT_MS=30000` and `DB_STATEMENT_TIMEOUT_MS=60000`;
generate more concurrent slow queries than `DB_POOL_MAX`.
✅ Waiters surface a loud "no pooled connection within
DB_POOL_ACQUIRE_TIMEOUT_MS" error (not an indefinite stall); `db_pool_waits`
increments on `/api/v1/counters`; a runaway query is cut at 60 s rather than
holding a connection forever.

**D3. Pool self-heals after Postgres bounces.**
▢ `systemctl restart postgresql` under light load.
✅ `/health` blips `503` then recovers; subsequent requests reconnect and
succeed without restarting dedalo-ts. (Pairs with A2.)

**D4. Connection budget.**
✅ With the diffusion scheduler host + N runners + RAG drain + coexisting PHP
all live, `SELECT count(*) FROM pg_stat_activity` stays comfortably under
Postgres `max_connections`. Re-check the PRODUCTION §4 arithmetic against the
real runner count.

---

## E. Observability (PRODUCTION §5)

**E1. Access log.**
▢ `DEDALO_ACCESS_LOG=true`; make a few requests; `journalctl -u dedalo-ts -o cat | jq 'select(.type=="access")'`.
✅ One JSON line per request with `request_id`, `user_id`, `class::action`,
`status`, `ms`.

**E2. Slow-request + error correlation.**
✅ A handler over `DEDALO_SLOW_REQUEST_MS` (5000) warn-logs. Force a handler
error → the client gets a `request_id` and **never** the exception text; the
same id appears server-side with the stack.

**E3. Counters endpoint is admin-only.**
✅ `GET /api/v1/counters` as a global admin returns totals/latency, pool waits,
diffusion queue depths, media headroom, RSS, uptime. As a non-admin (or
anonymous): **404** (S2-37 — the endpoint's existence is not advertised).

---

## F. Backups (PRODUCTION §6)

**F1. All four stores, and a real restore.**
▢ Run `deploy/dedalo-backup.timer` (or the make_backup widget). Then **restore
into a throwaway DB** and diff a sample.
✅ Matrix PG dump is **non-empty** and restores; RAG pgvector dumped
separately; media `original` quality present; `../private/` (`.env`, session
store, `ts_state.json`) captured.
✅ Failure path: make pg_dump fail (bad `DB_PASSWORD`) → the widget surfaces the
pg_dump log tail and **deletes the empty artifact** (no zero-byte "backup"
survives). This is the one the audit cared about most — a backup nobody
restore-tested is the classic silent failure.
⚠ MariaDB diffusion targets are derived data (re-publishable) — no dump; confirm
a re-publish rebuilds them.

---

## G. Diffusion scheduler placement (PRODUCTION §8)

**G1. Scheduler on a dedicated instance.**
▢ Main web instances: `DEDALO_DIFFUSION_SCHEDULER_ENABLED=false`. One scheduler
instance: enabled.
✅ Web instances serve without claim/sweep cadences but the delete-propagation
executor still registers (deletes still unpublish); only the scheduler instance
claims jobs; `DEDALO_DIFFUSION_MAX_RUNNERS` is not exceeded under a burst of
enqueues (atomic claim).
✅ The queue test seam (`DIFFUSION_JOBS_TABLE`) means CI never touches this
table — confirm staging uses the real table and the flake memory is retired.

---

## Sign-off

A staging pass = every ▢ observed, every ✅ met, every ⚠ understood. Until then,
the crash-recovery / failover / pool-reconnect conclusions in the audit are
**code-derived only** (COVERAGE.md "Verification-environment caveats"). File
anything that fails as a REMEDIATION Tier-1 op item and re-run the affected
section.
