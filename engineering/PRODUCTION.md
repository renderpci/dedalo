# PRODUCTION.md — operating the Dédalo TS server

Status: 2026-07 · the deployment reference required by the ops baseline
(audit DEC-17; items S2-32/33/35/36/37/38/39, S2-17, S3-48). One page per
concern; the reference systemd units live in `deploy/`.

## 1. Runtime (S2-36)

The Bun runtime is **pinned**: `.bun-version` + `package.json` `engines.bun`
(currently `1.4.0`). The code is coupled to version-specific Bun behavior —
`Bun.sql` jsonb parameter inference (a drift here is the realized S1-07/S1-08
corruption class), the Bun.sql MariaDB adapter (diffusion), `Bun.serve`
defaults. The server echoes its runtime at boot and **warns loudly** when it
differs from the pin. Never run `bun upgrade` on a production box; upgrade =
change the pin, run the full suite, deploy. `ExecStart` should point at the
pinned binary path, not a floating `bun` on `$PATH`.

**Upgrading the pin — what an operator must do (2026-08-25, 1.3.9 -> 1.4.0).**
The code updater REFUSES a release whose `.bun-version` differs from the running
runtime (`src/core/update/code_update.ts`), so an installation still on the old
Bun will decline the next release rather than half-install it. That is the gate
working. The order is therefore: **install the new Bun on the box first, restart
onto it, then apply the update.** The panel's readiness list shows this as the
"Bun version pin" line and cannot pre-decide it — the release's pin is only known
once the archive is downloaded.

**Ambient input added by Bun 1.4:** `Bun.sql` now honours `PGSSLMODE` /
`PG_SSLMODE` from the environment. That is a Postgres connection input the typed
config catalog does NOT see, so it cannot be audited through `readEnv`. Leave
both unset unless you mean them.

**Verified on 1.4.0 (2026-08-25), the version-coupled behaviours above:** the
`Bun.sql` jsonb double-encode trap is UNCHANGED, so the `$n::text::jsonb` idiom
remains load-bearing; the MariaDB adapter now decodes `DATETIME`/`TIMESTAMP` as
UTC (1.3.9 shifted them to local) and `JSON` columns as objects; `Bun.serve`
unix-socket options are unchanged. Full evidence: the bump's findings log.

## 2. Process supervision (S2-38, S2-17)

Reference units in `deploy/`:

- `dedalo-ts.service` — `Restart=always`, journald log capture, SIGTERM stop.
- `dedalo-ts-watchdog.service` + `.timer` — every 30 s:
  `curl --fail --unix-socket /tmp/dedalo_ts.sock http://localhost/health`;
  on failure restarts the main unit. (systemd `WatchdogSec` needs `sd_notify`,
  which Bun does not speak — the curl timer is the equivalent.)
- `dedalo-backup.service` + `.timer` — the nightly backup set (§6).
- `dedalo-ts-rollback.service` — restores the previous code tree after a
  failed code update (§12; fired by `OnFailure=` on the main unit and by the
  watchdog when a pending update never confirms). Publishing a release:
  `engineering/RELEASE.md`.

`/health` answers `200 {result:'ok', db:'ok'}` only when **Postgres answers**
(S3-48); DB down / pool wedged → `503 {db:'down'}` → watchdog restart + a
red monitoring check.

**Graceful shutdown (S2-17).** On SIGTERM/SIGINT the server: stops the
diffusion scheduler cadences → stops accepting connections → drains in-flight
requests up to `SERVER_SHUTDOWN_GRACE_MS` (default 10000) → marks still-live
media transcode jobs `interrupted` in their pfiles → journals dying background
tool jobs → closes the Postgres pool → unlinks the socket → exits 0.

A **planned restart** takes the same path and exits `RESTART_EXIT_CODE` (75)
instead of 0. `scheduleServerRestart` (`src/core/install/restart.ts`) hands off
to the graceful sequence through a handler `startServer` registers at boot, so
`persist_config` and a code update drain exactly like a supervisor's SIGTERM;
with no listening server registered (CLI, test runner) it falls back to an
immediate exit. It returns a `RestartOutcome` — `suppressed` under
`DEDALO_INSTALL_NO_RESTART`, otherwise `draining` / `immediate` — so a caller
can never report a restart it did not perform.

Diffusion RUNNERS are separate processes and survive restarts by design; the
sweeper heals anything that does not. **That survival is the unit file's job**:
`deploy/dedalo-ts.service` sets `KillMode=process` so systemd signals only the
server. Under the default (`control-group`) every runner is killed alongside it
and long publications are truncated mid-flight.

**Double-start guard.** At boot, a pre-existing socket file is **probed with a
connect()**: if something answers, the server refuses to start (exit 1)
instead of silently stealing the live instance's socket.

**Boot warm-up + poison latch (first-load TDZ class).** Before listening, the
server serially evaluates the whole `src/core` module graph
(`warmCoreModuleGraph`), so a concurrent first-request burst can never race
module evaluation into a TDZ-poisoned module (Bun caches a failed evaluation
for the whole process life — observed once as 1114 identical read failures
with a green DB-only health check). A warm-up failure aborts the boot (exit 1
— a visible crash loop beats a silently degraded server). Defense in depth:
if a TDZ-shaped `ReferenceError` ever reaches the dispatch catch anyway, the
process flips a poison latch (`core/api/process_health.ts`) — `/health`
answers `503 {process:'poisoned'}` from then on and the watchdog recycles the
process within its 30 s cadence. Gate: `test/unit/process_health.test.ts`.

## 3. Sockets, reverse proxy, timeouts (S2-33)

Production serving is **unix-socket-only**: `SERVER_UNIX_SOCKET` (default
`/tmp/dedalo_ts.sock`). The reverse proxy owns TCP/TLS, serves the client
statics + media, and forwards `/api` + dynamic routes to the socket. The TCP
listener (`SERVER_TCP_PORT`) is a dev convenience — do not expose it.

**Media access control**: the ENGINE generates the web-server rules; the PROXY
enforces them (one `stat()` per request — media files reach 16–32 GB, so nothing
may sit in the byte path). See §3.1 and `engineering/MEDIA_PROTECTION.md`.

Both listeners set an explicit `idleTimeout` (`SERVER_IDLE_TIMEOUT_S`,
default 255 — Bun's maximum; the silent Bun default of 10 s killed slow
exports/searches mid-handler). **Match the proxy**: a proxy read-timeout below
the slowest legitimate request (large exports, tool actions) re-introduces the
same failure one hop earlier. nginx sketch:

```nginx
upstream dedalo_ts { server unix:/tmp/dedalo_ts.sock; }
server {
    listen 443 ssl;
    http2 on;                      # multiplexes the ~100-module ES boot graph
    # ... TLS certs ...

    # Media — protected. The rule files are GENERATED by the engine
    # (src/core/media/protection.ts) into the media root and enforced HERE.
    # See §3.1 below; the map include goes in http{}, not here.
    include /path/to/media/dedalo_media_protection.nginx.conf;
    open_file_cache off;           # a stat() cache delays unpublish taking effect

    # API + dynamic routes → the Bun socket. MUST keep precedence over the
    # static /dedalo/ prefix below (regex locations win over prefix ones).
    location ~ ^/(api/v1/|dedalo/core/api/) {
        proxy_pass http://dedalo_ts;
        proxy_http_version 1.1;
        proxy_read_timeout 300s;   # ≥ the slowest legitimate request
        proxy_send_timeout 300s;
        proxy_buffering off;       # SSE + NDJSON streaming (diffusion, export)
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    # Client statics — nginx serves the copied client tree directly. Mirrors
    # the Bun dev/fallback semantics (src/core/api/static_asset.ts): the tree
    # is re-synced IN PLACE (not content-hashed), so text assets revalidate
    # (etag → 304, the client's service worker replays If-None-Match) and are
    # NEVER `immutable`. The 2026-07-09 boot probe measured 25 files / 1.4 MB
    # uncompressed on a cold boot — gzip + 304s are the whole win here.
    location /dedalo/ {
        alias /path/to/master_dedalo/client/dedalo/;   # scripts/sync_client.sh target
        etag on;
        add_header Cache-Control "no-cache";           # revalidate; 304s are cheap
        add_header X-Content-Type-Options "nosniff";
        add_header X-Frame-Options "SAMEORIGIN";
        add_header Referrer-Policy "strict-origin-when-cross-origin";
        gzip on;
        gzip_types text/css application/javascript application/json image/svg+xml;
        gzip_min_length 1024;
        location ~* \.(png|jpe?g|gif|webp|ico|woff2?|ttf|otf)$ {
            add_header Cache-Control "public, max-age=3600";
        }
        # Tool assets (/dedalo/tools/) live in the repo tools/ tree, NOT under
        # client/ — proxy them to the socket (the Bun handler enforces the
        # server/-subtree and extension fail-closed rules). tools_common needs
        # no rule of its own: since 2026-08-16 it is client source under
        # client/dedalo/core/ and the client location already covers it.
        location /dedalo/tools/ { proxy_pass http://dedalo_ts; }
    }
}
```

`TRUSTED_PROXY_HOPS` (default 1) must equal the number of proxies appending
X-Forwarded-For, or the login throttle keys on the wrong address.

### 3.1 Media access control (the proxy enforces what the engine generates)

Full definition: **`engineering/MEDIA_PROTECTION.md`**. The operator-facing contract:

- The engine writes three files into the media root (at boot and at login,
  config-hash guarded): `.htaccess` (Apache), `dedalo_media_protection.nginx.conf`
  (nginx `server{}`), `dedalo_media_protection_map.nginx.conf` (nginx `http{}` —
  a `map` cannot live in `server{}`; **omit it and nginx refuses to start**, which
  is deliberate: a half-wired gate must never boot half-open).
- **nginx needs a reload on a mode change** (`nginx -t && nginx -s reload`); Apache's
  `.htaccess` applies immediately. The daily cookie rotation needs no reload — that
  is why the cookie NAME is fixed and only its value rotates.
- **Never proxy media through Bun.** The gate is one `stat()` in the web server so
  multi-GB files keep `sendfile`/Range and the `mp4` `?start=` clipping handler. A
  `Range` request must answer `206`; a `200` with a full body means something has been
  put in the byte path.
- `open_file_cache` off (or `_valid ≤ 2s`) on the media locations, or an unpublish
  will not take effect on the next request.
- **Apache**: the media vhost needs `AllowOverride All` (or at least `FileInfo Options`)
  and `mod_rewrite`, or the generated `.htaccess` is ignored — silently, and open.
- `MEDIA_DEV_ROUTE_ENABLED` must stay `false`: that route serves media from Bun with
  no per-record ACL and bypasses these rules entirely (MEDIA-04).

**Assistant streaming (`dd_mcp_api:agent_chat_stream`, WC-013):** the chat is
an SSE response that can run for minutes on hard questions (adaptive-thinking
turns). It sends `: ping` heartbeats every 15 s and `X-Accel-Buffering: no`,
so the nginx sketch above (proxy_buffering off + generous read timeout)
already covers it — a proxy that buffers or times out under ~30 s will stall
or kill the chat. The non-streaming `agent_chat` twin has no heartbeat; the
client prefers the stream action for exactly this reason.

## 4. Database pool + statement timeouts (S2-32)

Config keys (all in `../private/.env`; catalog `src/config/config.ts` `ops`):

| Key | Default | Guidance |
|---|---|---|
| `DB_POOL_MAX` | 10 | Per PROCESS. Budget: server + each diffusion runner (up to `DEDALO_DIFFUSION_MAX_RUNNERS`) + RAG drain + coexisting PHP must stay under Postgres `max_connections` (typically 100). Example: server 10 + 2 runners × 10 + PHP ~20 → fine; 8 runners × 10 → NOT. |
| `DB_POOL_ACQUIRE_TIMEOUT_MS` | 0 (wait forever) | Set (e.g. 30000) so pool exhaustion becomes a loud error instead of a silent indefinite hang. |
| `DB_STATEMENT_TIMEOUT_MS` | 0 (off) | **Set 60000 in production** (WC-055). It is the ONLY bound on a search that cannot abort early — a deliberately-unindexed match (dd551 Data, `f_unaccent(…) ~* …`) reads the whole table, ~175 s on a 33 M-row activity log, and a client disconnecting does **not** cancel it. Maintenance is exempt (below), so this no longer conflicts with REINDEX/VACUUM. |
| `DEDALO_SLOW_QUERY_MS` | 0 (off) | Warn-log statements slower than this. |

All four keys are live in `src/core/db/postgres.ts` (verified 2026-07-07):
`DB_POOL_MAX` sizes the pool, an acquire gate fronts it so saturation is
observable (`db_pool_waits` counter) and bounded (`DB_POOL_ACQUIRE_TIMEOUT_MS`
fail-loud), `DB_STATEMENT_TIMEOUT_MS` is a per-connection GUC, and
`DEDALO_SLOW_QUERY_MS` warn-logs slow statements.

**Maintenance is exempt from the ceiling** (`runWithoutStatementTimeout`,
WC-055). `DB_STATEMENT_TIMEOUT_MS` is a POOL-WIDE GUC, so before this it could
not be set at all without also aborting the operations that are SUPPOSED to run
for minutes — which is why it shipped disabled. These four paths now clear the
GUC on a RESERVED connection for their own statement only:
`db_assets.optimizeTables` (REINDEX + VACUUM per table),
`db_assets.pruneMatrixIndexes` (DROP INDEX CONCURRENTLY),
`db_assets.execMaintenance` (the `ar_maintenance` sentences, incl. VACUUM FULL),
and the Database-info widget's whole-database VACUUM ANALYZE. The GUC is never
cleared on a POOLED connection: a plain `SET` persists for the life of the
connection, so that would silently un-bound every later request handed the same
one. Anything request-driven stays under the ceiling by design.

Raise the value if a legitimate REQUEST-path operation on your install (a large
export) exceeds it; measure first with `DEDALO_SLOW_QUERY_MS`.

## 5. Observability (S2-37)

- **Access log**: `DEDALO_ACCESS_LOG=true` → one JSON line per API request on
  stdout: `{ts, type:'access', request_id, user_id, api:'class::action',
  status, ms}`. journald captures it (`journalctl -u dedalo-ts -o cat | jq`).
- **Slow requests**: `DEDALO_SLOW_REQUEST_MS` (default 5000) warn-logs slower
  handlers regardless of the access-log flag.
- **Counters endpoint**: `GET /api/v1/counters` — session-gated,
  **global-admin only** (404 otherwise). Aggregates request totals/latency,
  slow-request and pool-wait counters, diffusion queue depths + scheduler
  state, media job headroom, background tool job stats, RSS, uptime.
- **`observers_big_result_refused`** — the PHP-parity >2000-reference freeze
  (set_dato_external computes but refuses the persist above 2000 referencers).
  EXPECTED to tick steadily, not an incident signal: targets permanently above
  the threshold (this install: `cult1/5` 4,547 refs; `numisdata224/13787`
  3,078; `numisdata224/13108` 2,874) re-compute and re-refuse on EVERY save
  touching them once drifted — PHP behaved identically, and neither the
  cascade nor `observer_reconcile --apply` can converge them by design. A
  climbing counter on OTHER targets is worth a look;
  `scripts/observer_reconcile.ts` (dry run) names the frozen records. Note
  the COST shape: the freeze withholds only the persist — a frozen target
  still pays the full uncapped closure walk + inverse search under its row
  lock on EVERY save touching it, forever (it can never converge). Beyond
  this counter, the only signal for that cost is
  `observers_recompute_lock_slow`; if it ticks steadily alongside a frozen
  hot term, that term is your contention source.
- **Observer cascade — ALWAYS ON** (D1 relay + D2 bounded dispatch,
  `WC-2026-08-02-observer-cascade-bounded-flag`). A saved component's
  declared observer edges fire transitively (relay hops AND
  recompute-triggered re-propagation), bounded by a shared visited set and a
  depth budget of 8 hops. There is no config switch: the mirrors are STORED
  relation data declared by the ontology, so gating them would make two
  identical installs store different values (the `DEDALO_OBSERVER_CASCADE`
  rollout flag was retired 2026-08-02 once the benchmark cleared the cascade
  — typical external hop p50 1.3 ms / p90 3.1 ms, worst real case 22 ms,
  measured graph depth ≤ 2 with zero cycles). Watch the cascade counters:
  `observers_cascade_cycle_refused` / `observers_cascade_depth_exceeded` /
  `observers_cascade_hop_failed` / `observers_cascade_hop_dropped` should
  STAY at zero — any tick names its chain in the log and means a TRUE cyclic
  observe graph (the node repeats on its own chain), an over-deep graph, a
  failing hop, or (hop_dropped) a leaked continuation that lost its commit
  lane — not normal operation. `observers_cascade_converged_skipped` is the
  BENIGN sibling: the same observer reached through two branches of one
  cascade (a converged diamond) is dispatched once and the second arrival
  skipped — expected on diamond-shaped ontologies, NOT a cycle; only the
  cycle counter indicates one. `observers_recompute_lock_slow` ticks when a
  recompute held its target row lock >2s (the D3 closure + uncapped search
  run under the lock) — steady ticks mean editor-visible contention on hot
  terms. `observers_propagation_failed_in_tx` counts level-0 propagation
  failures that happened INSIDE an ambient transaction (e.g. a CSV-import
  row) — those rethrow to the transaction owner instead of being swallowed,
  so the import row's error names the real cause. Cascade hops always run
  post-COMMIT (a rolled-back import fires nothing) and the relay writes
  nothing (`WC-2026-08-02-observer-relay-writes-nothing`).
  **Discovery is observer-declared** (subscription registry,
  `WC-2026-08-02-observer-subscription-registry-activation`): an edge
  dispatches iff the OBSERVER's `properties.observe` entry carries a
  `server` block — a reverse-only declaration alone is enough (the
  subscriber registers itself). The forward `properties.observers` array is
  legacy, consulted only to scope `'all'` wildcards and to target
  reused-component hosts. The registry is built once per ontology state
  (warmed at boot, hub-invalidated on any dd_ontology write); the boot
  probe loud-logs contract violations (dead forward specs, dead wildcards,
  unresolved SQO hosts, cycles) and the `observers_registry` gauge +
  `observers_registry_contract_violations` counter expose them on
  /api/v1/counters. `observers_host_section_unresolved` counts SQO
  recomputes refused because no host section resolved (observe-entry scope
  → forward spec → the observer's own section, virtual↔real-aware) —
  should stay 0; a tick names the edge whose observe entry needs a
  `section_tipo`.
  **Incident playbook — a runaway or buggy EDGE**: there is no global
  switch, and that is deliberate; the kill switch is PER-EDGE and lives in
  the source of truth. Disable the offending edge in `dd_ontology` — blank
  the observer node's `properties.observe` entry's `server` key — and the
  edge stops firing engine-wide once the ontology cache invalidates.
  (Removing the observed node's `properties.observers` declaration is NOT a
  kill switch any more: the reverse declaration alone dispatches; it only
  stops wildcard-matched edges.) That is an ontology EDIT, not a config
  override: the engine keeps doing exactly what the ontology declares. Heal any
  drift afterwards with `scripts/observer_reconcile.ts` — run it as a CENSUS
  first (`--json` for per-record causes, `--budget` to adjudicate the drop
  volume against `engineering/observer_shrink_budget.json` with a non-zero
  exit), then `--apply`. Since 2026-08-06 the recompute writes the FULL law
  including drops (`WC-2026-08-06-observer-grow-only-failsafe-retired`), so
  the budget gate is the standing protection against a value-law change that
  would mass-delete. Every live observer write is preceded by a
  `matrix_time_machine` row, so per-record restore exists for a hop that
  wrote wrong values. Blast radius is structurally capped meanwhile: hops
  cannot hang (visited set + depth budget), cannot fire on ROLLBACK, the
  relay writes nothing, and a recompute whose own seed could not be built
  withholds its drops (`observers_shrink_refused_degraded_seed` — the log
  names the ontology node to fix).
  **Bulk-import throughput**: the commit lane drains synchronously in the
  importing request after COMMIT, so imports pay the cascade per row —
  ~2.7 s of observer work per 1,000 saved rows at the measured p50 (data-
  dependent). Bulk doors that skip propagation entirely (tool_propagate,
  delete_data wipe, portalize) rely on the reconciler afterwards. A
  mid-import kill leaves mirrors partially recomputed, not corrupt: each
  recompute is a single locked, TM-audited write of a value derived from
  committed truth, and the reconciler converges whatever the kill missed.
- **`diffusion_queue_streams_opened` / `_closed` (WC-067)** — the leak alarm for
  the maintenance widget's live queue feed. Each open `follow_queue` SSE stream
  runs a 1 s poll loop for as long as an admin has the panel open, so the two
  must CONVERGE shortly after the last panel is closed. A persistent and growing
  gap means poll loops are outliving their clients, and is the signal to look
  (a browser tab that never sent a FIN, a proxy holding the connection). It is
  a real gauge rather than a test because nothing in-process can assert that a
  dropped socket fires `cancel()`; the stream's unconditional 15 s heartbeat and
  its 15-minute hard lifetime exist to bound the damage either way, so a gap
  should also self-heal within ~15 min.
- **Table-statistics health (WC-073)** — the Database-info panel computes a
  `statistics` verdict and shows a warning when it reads `degraded`. Two
  signals: tables ≥64 MB with `last_analyze` AND `last_autoanalyze` NULL, and
  the RESET signature `reltuples >= 1000 AND n_live_tup*100 < reltuples` (the
  planner believing in a big table while the cumulative counters believe it is
  empty). **Why it is worth a gauge:** a stats-collector reset — a crash
  restart, or a restore into a fresh cluster — wipes the cumulative counters
  while `pg_statistic` survives, and `autovacuum`/`autoanalyze` trigger on
  `n_mod_since_analyze` / `n_dead_tup`, which then restart from zero. So
  autovacuum reads `on` and every query still answers while a large table stops
  being maintained. Note the mechanism precisely: autovacuum's arithmetic is
  INTACT — autoanalyze fires at `n_mod_since_analyze >= 50 + 0.1 * reltuples`
  and `reltuples` survived, so the threshold stays correctly sized while the
  counter restarts at 0. Recovery is therefore churn-proportional: small hot
  tables self-heal within hours, a 51 M-row table needs ~5.1 M modifications
  first, which in practice means never. It is not "never" by mechanism.
  Found by accident on 2026-07-29 (38 of 43 tables on the scale DB,
  `matrix_time_machine` reporting 91 live rows against a real 50,993,786; on
  2026-07-30 all 11 v7 databases on the local cluster proved affected, i.e. the
  cause is cluster-wide, not per-database).
- **Repairing it.** Press **"Repair table statistics"** in the Database-info
  panel (`analyze_statistics`, WC-074) — plain `ANALYZE` scoped to the tables the
  verdict named. **Not** "Analyze database" (`analyze_db`), which runs
  whole-database `VACUUM ANALYZE`: reclaiming space is a different job and its
  cost is page-proportional. Plain `ANALYZE` samples a bounded page count, so it
  is near-flat in table size — measured 2026-07-30 on this cluster: ~60 s for a
  141 GB database, 20 s for ~5 GB, 8 s for 912 MB, 4 s for 68 MB. Treat that as
  an order of magnitude, not a budget (at least one local install carries manual
  `SET STATISTICS` tuning that inflates it). Cluster-wide, `ANALYZE;` per
  database from psql is the equivalent — the engine's pool is bound to ONE
  database, so the widget can only ever repair the active one.
- **Check it after any restore, crash recovery, PITR, clone or cluster move** —
  those are the events that produce it, and a `pg_dump`/restore-test (§6) is
  routine here. There is deliberately no scheduler: once the counters are
  correct, autoanalyze maintains statistics by itself, so a periodic engine-side
  ANALYZE would duplicate a correctly-configured mechanism with a worse trigger.
- **Error correlation**: every handler exception logs server-side with its
  `request_id`; the client receives the id, never the exception text.

## 6. Backups (S2-35)

The **backup set is five stores** — the matrix DB alone is not a backup:

1. **Matrix Postgres DB** — the make_backup widget (or `pg_dump -F c -b`).
   The TS server threads `PGPASSWORD` from `DB_PASSWORD`, verifies a
   **non-empty artifact**, surfaces the pg_dump log tail on failure, and
   deletes empty artifacts (a zero-byte "backup" discovered at restore time
   is the worst failure mode). Default dir: `<private>/backups/db`
   (`DEDALO_BACKUP_DIR` overrides).
2. **RAG pgvector DB** (`DEDALO_RAG_*`) — separate database, separate dump.
3. **Media originals** (`MEDIA_PATH`) — the `original` quality is the source
   of truth every derivative rebuilds from; derivatives need no backup.
4. **`../private/`** — `.env` secrets, session store, `ts_state.json`.
5. **Every site-builder INSTANCE on this host** — per instance: its
   declaration and `secrets/`, its workspaces root (`SITES_ROOT`: every site's
   source and full git history), each site's whole webspace (**both** release
   stores, `.releases/pre` and `.releases/web`, **and** the two served
   symlinks), and its audit trail (`AUDIT_DIR`). Nothing GENERATED is copied:
   the unit, the vhosts, the rendered env and `sites.json` are functions of the
   declaration and `provision apply` rewrites them all. See
   `engineering/SITE_BUILDER_INSTANCES.md`. A host that declares no instance
   has an empty store 5 and that is not a failure.

`deploy/dedalo-backup.service` + `.timer` is the reference nightly job. Each
store above names the token that copies it, and `test/unit/operator_commands_tripwire.test.ts`
asserts the two agree — a store documented here and copied by nothing is the
failure this table exists to make impossible:

| # | Store | What copies it in `deploy/dedalo-backup.service` |
|---|---|---|
| 1 | Matrix Postgres DB | `pg_dump` |
| 2 | RAG pgvector DB | `DEDALO_RAG_DB_NAME` |
| 3 | Media originals | `MEDIA_PATH` |
| 4 | `../private/` | `/opt/dedalo/private/` |
| 5 | Site-builder instances | `dedalo-site-builder-backup.sh` |

Store 5's `ExecStart` carries systemd's `+` prefix, so that one step runs as **root** while
the other four stay unprivileged. It has to: an instance's credentials are `0600 root:root`
inside a `0700` directory and its state roots are `0750` owned by that museum's own service
user, and the backup user is in none of those groups — that separation is the isolation
itself. The destination consequently holds credentials: create it `0700 root:root` and treat
the whole backup tree as secret material, which store 4 already made true.

MariaDB **diffusion targets are derived data** — rebuildable by re-publishing;
no dump surface exists (DIFFUSION_SPEC §8.6). Restore-test quarterly.

### 6.1 Restore order

Restore in dependency order — each step needs the one before it, and step 5
cannot even be attempted before step 1:

1. **`../private/`** (store 4). It carries the `.env` every other step reads —
   the DB credentials, `MEDIA_PATH`, and the `DEDALO_SITE_BUILDER_*` pairing
   lines. Restoring it last means restoring everything else blind.
2. **Matrix Postgres DB** (store 1), with `pg_restore` into an empty database.
3. **RAG pgvector DB** (store 2) if enabled; it is derived from the matrix DB
   and can also be re-embedded rather than restored.
4. **Media originals** (store 3), then rebuild derivatives with
   `tool_update_cache` — do not restore derivatives.
5. **Each site-builder instance** (store 5), in this order and no other:
   1. `config/` back to `/etc/dedalo_sites/instances/<instance>/` — the
      declaration and its `secrets/`, root-owned, modes preserved. Everything
      else about the instance is derived from this directory.
   2. The BYTES: the workspaces root, each site's webspace, the audit
      directory, back to the paths the declaration names — **including hidden
      entries**. The backup mirrors each webspace at its own SOURCE PATH under
      `<instance>/webspaces/` (minus the leading slash), so the tree under that
      directory reads as the host's own and there is nothing to work out: two
      sites whose webspaces share a basename cannot collide, which they did
      when the destination was the basename alone. The `.dedalo_site_instance` markers and the `.releases` stores
      are dot-prefixed, and a root that comes back non-empty and unmarked is
      refused by the provisioner (SITE_BUILDER_INSTANCES.md §5). A restore that
      skips dotfiles produces a host that will not converge.
   3. `bun run provision apply --instance <instance>` in
      `publication/site_builder/`, as root. This recreates the user and group,
      re-asserts every ownership and mode on the restored trees, and rewrites
      every generated artifact — the unit, the vhosts, the env, `sites.json`,
      the pairing fragment — from the declaration, **and links each vhost into
      the directory the web server reads** (`sites-enabled/`), which is what
      makes the restored museum answer on its domain rather than merely exist. It creates a served symlink
      only when one is ABSENT and never re-points an existing one, which is why
      the bytes go back first.
   4. `bun run provision check --instance <instance>` must exit 0.
   5. If the engine's `DEDALO_SITE_BUILDER_TOKEN` was lost with its `.env`,
      re-pair from the restored credential:
      `bun run scripts/site_builder_pair.ts <config dir>/engine.env.fragment --token-file <config dir>/secrets/SERVICE_TOKEN`.

### 6.2 The reconciliation rule

`provision check` proves the host matches its declaration. It does NOT prove a
museum's site still serves, and after a restore that is the only question worth
answering. So, **after restoring store 5, for every site: the served symlink
must resolve, its target must be a non-empty directory, and for production the
release it names must equal that site's own `published.release`.** A link that
resolves to a directory that is not there, or to a release the site does not
claim, is a museum serving a blank page or last month's page — and both look
exactly like a successful restore from every other angle.

Per site, with `<webspace>` from the instance's `sites.json` and `<slug>` from
its workspaces root:

```bash
readlink   "<webspace>/web"                       # → .releases/web/<release>
ls -A      "<webspace>/web/" | head              # must not be empty
grep -o '"release": *"[^"]*"' "<SITES_ROOT>/<slug>/site.json"   # must name the same <release>
```

That comparison is the same one `publication/site_builder/src/provision/verify.ts`
runs before and after an adoption. It is not yet reachable as a standalone verb;
until it is, a restore is reconciled by the three reads above.

## 7. Schema: migrations + provisioning (S2-39, DEC-17/DEC-19)

- **TS-owned tables** (`dedalo_ts_*`): ordered migrations in
  `install/db/migrations/NNNN_name.sql`, applied at boot by
  `install/db/migrate.ts` into the `dedalo_ts_schema_migrations` version
  table (one transaction per file; idempotent; never edit an applied file).
  Subsystem lazy `CREATE TABLE IF NOT EXISTS` bootstraps remain as fallback.
- **Shared matrix/dd_ontology schema**: provisioned by the **TS-native
  installer** (`src/core/install/`, DEC-19 — the former cutover blocker is
  RESOLVED). A fresh, empty PostgreSQL database is provisioned by restoring the
  vendored seed dump `install/db/dedalo_install.pgsql.gz` (full schema +
  extensions + populated core `dd_ontology` + root user + default
  project/profiles), then setting the Argon2id root password. Two frontends
  drive one engine: the browser wizard (auto-served when unconfigured) and the
  headless CLI `bun run scripts/install.ts` (npm `dedalo:install`). See
  **`docs/install/ts_native_install.md`** for the operator guide. PHP is no longer required to
  install a TS instance.

### 7.1 Install mode + restart-after-configure

A server booted with none of `ENTITY`/`DB_NAME`/`DB_HOST`/`DB_USER` set enters
**install mode** (`config.installMode`): it skips all DB-dependent boot steps,
`/health` reports `db:down`, and it serves ONLY the install wizard. The browser
`persist_config` step writes `../private/.env` and then **exits the process**
with `RESTART_EXIT_CODE` (75 — `src/core/install/restart.ts`); the supervisor
restarts it into configured mode. The wizard's separate manual
`verify_active_config` click + the client's request retries bridge the gap. The
pre-auth install surface is gated: reachable only while UNSEALED and only from
`DEDALO_INSTALL_ALLOWED_IPS` — FAIL-CLOSED since 2026-08-24
(`engineering/wire_contract/WC-2026-08-24-install-ip-gate-fail-closed.md`): unset
or empty means LOOPBACK ONLY, entries are `loopback` / a literal address / a CIDR
block, and `any` is the one explicit opt-out that opens it to every address. The
effective policy is printed at boot next to the INSTALL MODE banner. Its limit is
the resolved client address: a request with no `X-Forwarded-For` reads as
`'local'`, so a bare TCP listener with no proxy in front must still be closed at
the firewall. Once `install_finish` seals the instance the surface returns 404. The CLI needs no restart (it sets
the env before importing config).

The supervisor is:

| Where | What restarts it |
|---|---|
| Production | `deploy/dedalo-ts.service` — `Restart=always` (+ `SuccessExitStatus=75`, so the planned exit is not booked as a crash). |
| Dev | `bun run dev` or `bun run start:supervised` — both loop on exit 75 ONLY. |

Exit 75 is a *distinct* code on purpose: a graceful ^C also exits 0, so a
supervisor keying on 0 could never be stopped, and one keying on "any exit"
would hot-loop a crash. `bun run start` is deliberately NOT supervised — systemd
is its supervisor. The contract is gated by
`test/unit/install_restart_supervisor_tripwire.test.ts` (it exists because this
mechanism once named a `start:supervised` script that was never written, which
hung the browser wizard at "Save configuration" for every dev).

## 8. Diffusion scheduler placement

`DEDALO_DIFFUSION_SCHEDULER_ENABLED=false` starts the server without the
claim/sweep cadences (run them in a dedicated instance/host instead). The
delete-propagation executor registers regardless. `DEDALO_DIFFUSION_MAX_RUNNERS`
(default 2) is enforced atomically inside the claim statement.

## 9. Residue lifecycle (S3-46/62/63/64)

Automatic: media pfiles reconciled at boot + pruned after 30 days (terminal);
in-memory job registries evict terminal records after 1 h (pfile mirror
remains); `login_attempts` rows GC'd past the throttle window; terminal
diffusion job rows purged after 7 days (daily, sweeper cadence); the dd1758
ledger keeps the durable publication audit trail.

## 10. Publication API (the isolated public surface)

The Publication API is **not part of this server** and is not started by it. It is a
separate, read-only front for the diffusion-published MariaDB, deployable on the web
server's host (or any host that can reach the published DB) — it never touches the
matrix Postgres, imports no engine code, and holds no engine credentials. Both versions
can run side by side against the same published databases.

| | Path | Runtime | How it runs |
|---|---|---|---|
| **v1** (legacy) | `publication/server_api/v1` | PHP 8 + Apache | Copy the folder to the vhost. Its PHP deps travel with it (`v1/shared/`), so it is self-contained. Create `config_api/server_config_api.php` from `sample.server_config_api.php` (DB creds + the shared `code`); the file is gitignored and denied by `config_api/.htaccess`. Kept **as-is** for existing v4/v5/v6 websites — no new features. |
| **v2** (current) | `publication/server_api/v2` | Bun + TypeScript | `bun run publication:install` once, then `bun run start:publication` (or a systemd unit modeled on `deploy/dedalo-ts.service`, pointing `WorkingDirectory` at the v2 folder). Config is v2's **own `.env`** — never `../private/.env`. |

Both take a **read-only MariaDB user**. That is the real security boundary: the API's
`DB_NAMES` allowlist scopes which published databases are reachable, and nothing in
either version issues a write. v2 additionally offers `API_KEYS`, per-IP rate limiting
and request timeouts (`engineering`-adjacent detail lives in `docs/diffusion/publication_api/`).

Gates: `bun run test:publication` (v2's own suite + typecheck) and
`test/integration/publication_api_v2_smoke.test.ts` (boots v2 as a subprocess against a
real published DB; skips loudly without `DEDALO_DIFFUSION_DB_*`).

## 11. RAG: drain cron + embedding sidecar

RAG (`src/ai/rag/` — opt-in, `DEDALO_RAG_ENABLED`) adds exactly TWO ops
surfaces to a deployment; everything else rides the normal engine deploy.
Hands-on guide: `docs/core/ai/rag_cookbook.md` (Install / Enable / R3).

**1. The drain cron (REQUIRED — without it, nothing ever indexes).** Saves
only enqueue a dirty marker (`rag_index_queue`, matrix DB, best-effort — a
down vector store never fails a save); ALL embedding work happens in the
out-of-band drain:

```cron
* * * * * cd /srv/dedalo-ts && bun run src/ai/rag/cli/rag_drain.ts >> /var/log/dedalo/rag_drain.log 2>&1
```

Deliberately an EXTERNAL short-lived process, not an in-server timer:
- **request-path isolation** — embedding is heavy (network to the sidecar,
  thousands of chunks for a large transcript); a runaway index job can never
  degrade the serving engine, and memory returns to the OS each pass;
- **cache freshness** — the process exits per pass, so module-level caches
  (ontology, section_map, terms) die with it. Do NOT daemonize the drain
  without adding cache-invalidation hooks first — a long-lived drain embeds
  STALE terms;
- **multi-host safe** — a Postgres advisory lock single-flights the drain, so
  the same cron line on every app host is redundancy, not contention.

Idle cost ≈ zero (empty queue → one SELECT; RAG disabled → no-op). Failures
back off exponentially (`2^attempts` min, 5-attempt cap, `last_error` kept);
watch `RagQueue.stats()` — `{pending, ready, blocked, failed, oldestAgeSec}` —
in monitoring (cookbook R10). Pool budget: the drain is one more Postgres
client — already counted in the §4 `DB_POOL_MAX` example.

**2. The embedding sidecar (for real semantic quality).** Any HTTP service
speaking `POST {endpoint}/embed {model, input:[…]} → {embeddings:[[…]]}` —
Ollama's native `/api/embed` matches this contract byte-for-byte
(`DEDALO_RAG_EMBEDDING_ENDPOINT=http://127.0.0.1:11434/api`, model `bge-m3`).
Run it under its own supervision (systemd unit / launchd); the engine treats a
sidecar failure as a RETRYABLE miss (never a garbage vector), so a sidecar
restart just delays indexing. The embedding model name is the vector-store
PARTITION KEY: changing model (or quantization) = a new partition = re-index
(cookbook R11) — never mix precisions under one name.

Backups: the vector DB (`dedalo7_rag`) is derived state — §6 already covers it
as a separate dump; losing it costs a re-index, never data.

## 12. Code updates: swap pipeline, channels, rollback

Publishing side (the master's runbook): `engineering/RELEASE.md`. This section
is the CONSUMER side — what an install does with a release, and what catches
it when the release is bad. Engine: `src/core/update/code_update.ts`.

**The swap pipeline.** Download (TLS-on, origin-pinned, capped) → sha256
verified against the manifest sidecar → zip entries pre-validated (no
absolute/`..`/symlink entries) → extracted into a QUARANTINE dir, never over
the live tree → **dependencies installed in quarantine** (`bun install
--frozen-lockfile --production` against the release's own lockfile) →
**pre-flight smoke boot** of the quarantined tree (a throwaway process must
evaluate the server entrypoint cleanly; a release that cannot even load is
refused with the live tree untouched) → the SENTINEL is written
`status:"pending"` (naming the backup dir the swap INTENDS to create) → the
live tree is renamed into the backup dir (same-device asserted, so both
renames are atomic) → the new tree moves in → planned restart (exit 75).

**DISK SPACE is a pre-download gate (2026-08-25).** A remote install died mid
`bun install` with a wall of bun `NoSpaceLeft`/`FileNotFound` extraction errors
— a full filesystem, discovered only after download, verify and extract had
spent minutes and disk. `src/core/update/disk_space.ts` now measures first:
required = the live tree MINUS `PRESERVE_ROOT_ENTRIES` (`.git` is renamed into
the new tree, never staged — counting it over-states the need by the whole
repository history) times a 1.15 margin; available = `statfs` where staging
lives (one probe covers both sides, since `renameSwap` asserts backup and tree
are same-device). A measured shortfall REFUSES before the first byte is
fetched; an unmeasurable side never refuses and logs that the gate is
disarmed. The panel cannot pre-decide it (`du` over ~10^5 inodes is not a
panel-path walk), so `status.ts` reports the free bytes as an INPUT line and
stays `unknown` — a second, cheaper rule there would disagree with this one.

**The sentinel** (`<backup root>/last_code_update.json`, backup root =
`<install>/../backups/code`, `DEDALO_BACKUP_PATH` overrides) is the rollback
contract: written `status:"pending"` BEFORE the swap's first rename, so a
crash at ANY point of the swap leaves a sentinel the supervisor can read; the
NEW tree flips it to `"confirmed"` once it listens and reaches the database.
A pending, unconfirmed sentinel is the machine-readable fact "the last update
never proved itself". Because it is written pre-swap, the `backupDir` it names
may not exist yet — the rollback script handles that state explicitly (below).

**The supervisor scripts live OUT OF TREE.** The swap renames the whole app
tree; in the crash window between its two renames there is NO tree at
`/opt/dedalo/master_dedalo` — an in-tree rollback script would vanish exactly
when `OnFailure=` needs it. The units therefore execute the INSTALLED copies
at `/opt/dedalo/bin/` (a sibling of the checkout, next to the pinned bun at
`/opt/dedalo/.bun/`), never the shipped copies inside `deploy/`. One-time
install:

```sh
sudo install -d /opt/dedalo/bin
sudo install -m 0755 deploy/dedalo-code-rollback.sh /opt/dedalo/bin/
sudo install -m 0755 deploy/dedalo-ts-watchdog.sh   /opt/dedalo/bin/
```

An out-of-tree copy is a real staleness risk: it does NOT update with the
tree. Re-run the two `install` lines after any code update that touched
`deploy/*.sh` (the release notes say when), and after editing them locally.
The scripts are deliberately self-contained and change rarely, but a drifted
copy fails the contract silently — refresh it, don't trust it.

**Backup-root resolution (scripts = engine).** The units do not source
`../private/.env` (on purpose — systemd's env parser mangles raw-JSON
values), yet the ENGINE writes the sentinel to `DEDALO_BACKUP_PATH` resolved
through `readEnv` (process env, then `<private>/.env`). The scripts therefore
resolve the backup root with the SAME precedence: `--backup-root` flag →
`DEDALO_BACKUP_PATH` in the process environment → `DEDALO_BACKUP_PATH` in
`<private>/.env` (private dir = `$DEDALO_PRIVATE_DIR`, default the checkout's
sibling `private/`) → the documented default `<install>/../backups/code`. A
wrong or unreadable `.env` degrades to the default and logs a WARN — never
silently. An install that relocated backups needs no unit edit; pinning
`--backup-root` in the unit is still the most explicit option.

**Automatic rollback** is the systemd units' job, on two triggers:

- the new tree NEVER boots — `dedalo-ts.service` exhausts its start limit and
  enters `failed`; its `OnFailure=dedalo-ts-rollback.service` fires;
- the new tree boots but is DEAD — the watchdog probe
  (`deploy/dedalo-ts-watchdog.sh`) sees a red `/health` with a pending
  unconfirmed sentinel and starts the rollback unit instead of a restart.

`dedalo-code-rollback.sh` (the `/opt/dedalo/bin/` copy) distinguishes FOUR
states of the sentinel and logs which one it saw:

1. **pending, backupDir exists, no usable tree at APP_DIR** — the crash landed
   BETWEEN the two renames (window W1): restore `backupDir` → APP_DIR.
2. **pending, backupDir missing, APP_DIR present** — the crash landed BEFORE
   the first rename: nothing was swapped, nothing to restore; mark the
   sentinel attempted and exit 0.
3. **pending, both present** — the normal post-swap rollback: park the failed
   tree, restore the backup.
4. **confirmed / absent / already attempted** — exit 0, touch nothing.

For a restore (states 1 and 3) it: flips `rollback_attempted` FIRST (a
rollback that itself fails must never loop), parks any failed tree at
`<backup root>/failed_<stamp>`, moves the backup tree back (it keeps its own
`node_modules` — the pipeline does not strip it from the backup, which is
exactly what makes the restore bootable offline), carries `.git` back if the
backup lacks it, marks the sentinel `rolled_back`, restarts, health-waits, and
says GREEN or "manual intervention required". The four states are drilled
against a real filesystem fixture by
`test/unit/install_restart_supervisor_tripwire.test.ts`.

**Honest limit:** automatic rollback REQUIRES the systemd units. A plain
`bun run start:supervised` loop respawns on exit 75 but has no failure hook —
the update response names the backup dir, and the manual procedure is the
script's own body: move the failed tree aside, move the backup back, start.

**Deployment channels.** The pipeline serves exactly one of two layouts:

| Channel | Layout | Update | Rollback |
|---|---|---|---|
| `tree_swap` | the repo is a checkout on a host (systemd or supervised loop) | quarantine → rename swap (above) | sentinel + `dedalo-code-rollback.sh` |
| `image` | containerized; the code tree is INSIDE the image (`Dockerfile` copies the build-context allowlist, §13), only `/private`/media/socket are volumes | the swap is REFUSED — a tree swap would land in the container's writable layer and be discarded on the next recreation. Use `deploy/dedalo-image-update.sh` (pull a new tag, or rebuild from a ref) | re-pin the previous image tag + `up -d` — atomic and complete, dependencies included |

**Offline-dependency caveat.** A release whose `bun.lock` changed needs
registry access at install time (the quarantine `bun install`). On an
air-gapped host that install FAILS IN QUARANTINE and the live tree is never
touched — the loud, safe outcome. Pre-warm the offline cache or use the image
channel there.

**Keep runtime data OUT of the code tree.** The swap renames the whole tree;
anything living inside it would ride along (the pipeline refuses the swap when
it finds runtime data in the tree, naming the key to set). Per-key recipe:

- `MEDIA_PATH` — move the `media/` tree out (e.g. `/srv/dedalo/media`), set
  the key, restart, verify a thumbnail loads. The refusal names this key when
  a `media/` dir sits inside the code tree.
- `DEDALO_ONTOLOGY_RECOVERY_PATH` — point the ontology-update recovery dumps
  at a directory outside the tree.
- `DEDALO_BACKUP_DIR` (database dumps) and `DEDALO_BACKUP_PATH` (code
  backups) — both default outside the tree already; never point them into it.
- `DEDALO_PRIVATE_DIR` — the private tree is a SIBLING by default; only ever
  relocate it further out (containers use `/private`), never inward.

## 13. The container build context: secrets, and rotating a key that already shipped

**The invariant: secret material never travels with the code, by any lane.**
The code updater has enforced it on the tree-swap lane for a while — it REFUSES
a swap rather than let `deploy/certs/key.pem` ride along with the tree
(`refuseUntrackedSecrets`). Until 2026-08-28 the IMAGE lane had no such rule:
the `Dockerfile` was `COPY . .` and `.dockerignore` was a hand-maintained
denylist naming neither `deploy/certs/` nor `.dedalo.env` — both of which
`.gitignore` already treats as secrets, and both of which `install.sh` WRITES
before it runs `compose build` (audit 2026-08-26, OPS-01).

### 13.1 What the build context is now

Three mechanisms, in the order Docker applies them:

1. **`.dockerignore` denies the ROOT and re-includes the tracked top-level
   entries the image needs** — deny-all **at depth 1**, and that is the precise
   claim. A `.dockerignore` pattern is matched SEGMENT-WISE and `*` never
   crosses a `/`, so the leading `*` denies exactly the top-level entries;
   inheritance then carries each re-inclusion down its subtree. An operator's
   ROOT drop-in — `deploy/` (never re-included), `.dedalo.env`, `media/`,
   `backup.pem` — cannot enter a context that starts from nothing. A drop-in
   NESTED inside an allowlisted tree is a different case, and it is what
   mechanisms 2 and 4 cover.

   Eight tracked top-level entries are deliberately kept out
   (`IMAGE_EXCLUSIONS`): `deploy`, `test`, `.github`, `.gitlab`,
   `.gitlab-ci.yml`, `.vscode`, `.claude`, `CLAUDE.md`. `test` and `.github`
   were already excluded before this policy, so **six** are newly kept out —
   `deploy` being the one that matters.
2. **The census is DERIVED from EVERY tracked `.gitignore`.** Not just the root
   one: `publication/server_api/v2/.gitignore` (`coverage/`, `dist/`) and
   `publication/site_builder/.gitignore` (`.test-tmp/`) are translated too, each
   RELATIVE TO ITS OWN DIRECTORY, and re-applied AFTER the allowlist (last match
   wins). So a gitignored path INSIDE an allowlisted tree —
   `.agents/settings.local.json`, `src/core/update/install_stamp.json`, the
   nested `node_modules` trees, `publication/server_api/v2/dist/` — is denied
   too. Add a secret to any `.gitignore` and it leaves the image in the same
   change; add a NEW `.gitignore` anywhere and the artifact changes with it, so
   there is no scope statement to go stale.

   The per-directory scoping is load-bearing. Translated globally, the v2 API's
   `dist/` would also drop `client/…/service_ckeditor/css/dist/`, which the image
   needs — a context narrowed past what the engine needs breaks an install, which
   is a defect, not caution.
3. **The COPY is narrow.** The Dockerfile names each allowlisted entry instead
   of `COPY . .`, and `deploy/` is not among them: the directory `install.sh`
   writes private keys into cannot be reached by any COPY, whatever the ignore
   rules say. Nothing in a container reads `deploy/` — the compose stacks
   bind-mount the proxy config and the certificates from the HOST checkout.
4. **Secret-SHAPED names are denied at EVERY depth**, which is the residual of
   mechanism 1: a `certs` directory, a `.env*` name, a
   `.pem/.key/.crt/.cer/.p12/.pfx` extension, anywhere in the tree. It is the
   same shape the code updater already refuses on the tree-swap lane
   (`isSecretShapedName`). The tracked files of that shape — two placeholder
   samples — are re-included by exact path, derived from the tracked tree, so a
   third one reddens the gate instead of riding along.

**What is left, stated plainly:** a NON-secret-shaped untracked file nested
inside an allowlisted tree (`client/scratch.js`, `src/notes.txt`) still enters
the build context. Closing that would mean allowlisting every tracked file
individually, and the first file someone forgot to regenerate would break an
install. The gate asserts this residual explicitly, at its exact size, so it
cannot quietly grow.

Both artifacts are GENERATED: `bun run context:gen` (`bun run context:check`
renders without writing and exits 1 on drift; the policy, the reasons and the
translation rules live in `deploy/build_context.ts`). The gate is
`test/unit/build_context_secret_tripwire.test.ts`, which re-implements Docker's
own pattern matcher, asserts the two artifacts equal the derivation, that every
rule of every tracked `.gitignore` is excluded, that no `COPY`/`ADD` in the
Dockerfile names the whole context or reaches `deploy/` in any spelling, and —
the other direction — that no tracked file the engine needs was narrowed away.

**Adding a top-level entry to the repo means regenerating both artifacts.** The
gate is red until you do, and it prints what it expected.

### 13.2 Rotating TLS material

`deploy/dedalo-tls-rotate.sh` is the ONE generator of local-CA material —
`install.sh` calls it for the first issue, so an install and a rotation produce
the same shape of certificate. It archives the previous material into
`deploy/certs/rotated-<UTC stamp>/` (700, never overwritten, outside the build
context and outside every release archive) before it writes anything new, so a
half-finished rotation can always be put back.

```shell
# a local certificate authority (install.sh option 2)
deploy/dedalo-tls-rotate.sh --mode local-ca --host dedalo.local

# a certificate your institution issues (install.sh option 3)
deploy/dedalo-tls-rotate.sh --mode existing --cert /path/fullchain.pem --key /path/privkey.pem
```

The OPERATOR-facing version of this procedure is `docs/install/docker.md`
("Rotating TLS material"), linked from the simple install's after-install steps
and its troubleshooting table — a rotation only an engineer can find is not
delivered. This section is the same procedure with the reasoning.

It reloads nginx when it can reach the stack — `--compose-file` names the stack
(default `docker-compose.simple.yml`; pass `docker-compose.yml` on the full
one), `--no-reload` skips it. Only the SIMPLE stack's proxy also reloads itself
every six hours; on the full stack a missed reload keeps serving the OLD
certificate until you reload it yourself. It then prints the new CA file with
its SHA-256 fingerprint. Each CA carries its issue stamp in the subject
(`CN=Dedalo local CA <stamp>`) — two authorities both called "Dedalo local CA"
are indistinguishable in a Windows or macOS trust store, and an operator
rotating away from a compromised key must be able to tell which entry to delete.

**Let's Encrypt (option 1) needs none of this**: its key lives in the
`letsencrypt` named volume, never in the build context, and it renews itself.

### 13.3 If you have already distributed an image — read this

An image built on a host that ran `./install.sh` with the local-CA option
CONTAINS `deploy/certs/dedalo-local-ca.key`. That is the private key of an
authority you were told to install into the Trusted Root store of every
computer that uses Dédalo: whoever holds it can mint a browser-trusted
certificate for ANY hostname, for every one of those workstations. It travels
wherever the image travels — a registry (`dedalo-image-update.sh --mode pull`),
a `docker save` tarball, a copy handed to a supplier, or one more member of the
host's `docker` group than you expected. Assume it is compromised; it cannot be
un-distributed.

In this order:

1. **Rotate the CA and the site certificate** — §13.2. Do this first: the
   replacement must exist before you invalidate the old one.
2. **Install the NEW CA on every workstation, then DELETE the old entry.**
   Until the old one is removed, a certificate signed with the leaked key is
   still trusted by that machine, which is the whole point of rotating. The old
   CA certificate is in the `rotated-…` archive if you need its fingerprint.
3. **Rotate the database password.** `.dedalo.env` (`POSTGRES_PASSWORD`) was in
   the context too. The port is never published, so the exposure is bounded by
   who can reach the container network — but rotate it anyway:

   ```shell
   docker compose -f docker-compose.simple.yml --env-file .dedalo.env \
       exec -T postgres psql -U dedalo -d dedalo -c "ALTER ROLE dedalo WITH PASSWORD 'new-password'"
   ```

   then set the new value in `.dedalo.env` and append `DB_PASSWORD="new-password"`
   to the engine's own `/private/.env` (the private volume). The loader takes the
   LAST occurrence of a key, which is what makes an append-only file rotatable
   (`src/config/env.ts`). Restart the stack.
4. **Rebuild and re-distribute the image**, on a tree with the current
   `.dockerignore` + `Dockerfile`. Verify before pushing:

   ```shell
   docker run --rm --user 0 <image> ls /opt/dedalo/master_dedalo/deploy 2>&1
   # expected: "No such file or directory" — deploy/ is not in the image at all
   ```

5. **Delete the old images and tarballs** you can still reach: registry tags,
   `docker save` files, the rollback tag `dedalo-image-update.sh` left behind,
   and any build cache on machines that built it (`docker builder prune -af`).
   You cannot delete the copies you already handed out — which is why step 2 is
   the one that actually ends the exposure.

## 14. Revoking an account (and what a compromised one needs)

An account's access has TWO independent halves, and the engine ends both — but only
for the doors it can reach. Know which is which before you assume an account is out.

**What a write to the record does automatically** (`src/core/security/revocation.ts`,
fired from the record-write chokepoint): deactivating (dd131 = No), renaming (dd132),
changing the password (dd133), removing the profile (dd1725), flipping global-admin
(dd244) or deleting the record ENDS that user's sessions, unlinks their per-session
media markers, and drops pending password-recovery codes. There is nothing to run by
hand and no cache to clear. Media is the half people forget: the web server authorizes
by `stat()`ing a marker file, so a session that ends without its marker going with it
leaves a cookie that still reads the whole archive — that is why the two are one
operation and not two.

**The one surface a revocation cannot reach by ending sessions** is a long-lived
process that holds no session: the MCP stdio server (`DEDALO_MCP_USER_ID`). It re-asks
the account's standing on every tool call, so a deactivation or a deletion takes effect
on the next call without a restart — but a process is not a session and will not
disappear. If the service account itself is the compromised one, stop the process.

### The two steps for a COMPROMISED account

Order matters. Doing only the first is the common mistake, because the account stops
being able to log in and it looks finished.

1. **Cut the credentials.** Change the password (dd133) — do NOT merely deactivate.
   Deactivation refuses the LOGIN door; it is a policy state, and a policy state is the
   thing an operator un-flips by accident. A changed password invalidates what the
   attacker holds. Both end every live session and every media marker.
2. **Deal with what the account left behind.** Sessions and markers are gone; these
   are not: any MCP/agent process configured as that user (stop it, then repoint
   `DEDALO_MCP_USER_ID`), any API integration holding a token minted for it, and the
   record changes it made — the Time Machine holds them by user, which is where a
   review starts.

Root (dd128/-1) is EXEMPT from the dd131 refusal, by design and in parity with the
frozen PHP: it is the installation's recovery identity, and a mis-clicked radio must
not lock an installation out of itself. Root's credentials are cut in step 1 like
anyone else's — root may edit its own password, which is the only in-engine way to
rotate it.
