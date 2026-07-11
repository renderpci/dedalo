---
name: dedalo-ts-ops-config
description: Configuration discipline and running the Dédalo v7 TS/Bun server in production. Use when reading or adding a DEDALO_* config key, touching process.env / src/config/env.ts (readEnv) / src/config/config.ts / ../private/.env, wiring a COEXISTENCE flag (DEDALO_DIFFUSION_NATIVE, DEDALO_DEV_MODE, DEDALO_SESSION_DB_PATH), or doing anything ops: deploy/systemd, the unix socket + reverse proxy (SERVER_UNIX_SOCKET), graceful shutdown (SIGTERM drain), boot migrations, backups, /health, /api/v1/counters observability, or pool sizing (DB_POOL_MAX). Also for "config key isn't taking effect", config_env_tripwire or coex_tag_tripwire failures, and "how do we run this in production". Authoritative ops doc: engineering/PRODUCTION.md; validation checklist: rewrite/STAGING_VALIDATION.md; PHP↔TS shared-DB rules: rewrite/COEXISTENCE.md; config precedence + key census: dedalo-config skill + ../private/sample.env.
---

# Dédalo v7 TS — ops & config discipline

Two jobs: (1) read/add configuration the ONE correct way, (2) run and supervise the
Bun server in production. This skill is orientation + the load-bearing rules. The
operational detail lives in **engineering/PRODUCTION.md** (§1–9) — POINT there, do not re-derive it.
Measured current state: **rewrite/LEDGER.md**.

## The one config law

**`readEnv` (`src/config/env.ts:98`) is the ONLY environment reader. NEVER touch
`process.env` outside `src/config/`.**

Why: `readEnv` implements the precedence chain (real process env > `../private/.env` /
`.env.<host>` overlays > catalog default). A raw `process.env.KEY` bypasses that chain,
so a value set in `../private/.env` silently does nothing, and the read is untestable
(the tripwire's own docstring: it "silently drops the override"). This is exactly the
"config key isn't taking effect" bug.

- Typed catalog: **`src/config/config.ts`** — every subsystem's keys resolved once at
  boot into a frozen object. Pool/observability/timeout/backup keys live under
  **`config.ops`** (`config.ts:700`); the socket path under `config.server.unixSocketPath`
  (`SERVER_UNIX_SOCKET`, `config.ts:622`).
- Precedence, scopes, `../private/.env` / `.env.<host>` / `sample.env` key census:
  cross-link the **dedalo-config** skill. `../private/sample.env` is the GENERATED key
  census — regenerate it when you add a key.

**Tripwire: `test/unit/config_env_tripwire.test.ts`** — statically bans `process.env`
in `src/` and `tools/` outside `src/config/`. It carries a small **subprocess-passthrough
allowlist** (each entry cites a reason: pg_dump / media binaries / runner child get the
whole env). Lowering the count is free; raising it needs a justified allowlist entry.
A new key is: add to `config.ts` (read via `readEnv`), regenerate `sample.env`, done —
never sprinkle `readEnv` calls if a `config.*` field will do.

## Coexistence config (retires at cutover)

These flags exist ONLY because the TS server currently shares a DB with the live PHP
oracle (transitional — see the "TS self-contained, not shared" memory). Verified readers:

- **`DEDALO_DIFFUSION_NATIVE`** (+ `DEDALO_DIFFUSION_NATIVE_ELEMENTS`) — routes diffusion
  to the native TS engine (`src/core/resolve/environment.ts:124`,
  `src/core/resolve/widget_request.ts:1059`, `src/diffusion/api/actions.ts:244`). Unset →
  the diffusion tool 404s `get_diffusion_info` (TS has no legacy route); set it in
  `../private/.env` and restart (memory: "diffusion native flag client 404").
- **`DEDALO_DEV_MODE`** (`src/core/resolve/environment.ts:35`) — drives the
  `DEVELOPMENT_SERVER`/`SHOW_DEBUG`/`SHOW_DEVELOPER` posture the pre-auth login SW path
  reads. This posture must be available **pre-auth**; the S1-19 fix (engineering/WIRE_CONTRACT.md,
  rewrite/STATUS.md) was a login stall that made the client-test gate unrunnable — do NOT
  gate dev/login-path env behind `isLogged`.
- **`DEDALO_SESSION_DB_PATH`** (`src/core/security/session_store.ts:76,304`) — session
  store override, used for test isolation.

**Tripwire: `test/unit/coex_tag_tripwire.test.ts`** (DEC-19/DEC-12) — every source file
with a bare-word `COEX` tag must (1) cite DEC-19 and (2) have a row in **rewrite/COEXISTENCE.md**.
No allowlist: a new coexistence hedge adds its ledger row + DEC citation in the same change.
Why: coexistence scaffolding is invisible debt; without the tag+row it never gets torn
out at cutover and PHP/TS drift silently against the shared DB.

## Running in production

**Unix-socket only.** Bun.serve listens on `SERVER_UNIX_SOCKET`
(default `/tmp/dedalo_ts.sock`). A reverse proxy owns TCP/TLS, statics, and media —
the app process never binds a port. Full runtime/supervision/proxy config: **engineering/PRODUCTION.md §1–3**.

Verified behaviors in `src/server.ts` — do not regress these:

- **Graceful shutdown** (`installShutdownHandlers`, ~server.ts:653): SIGTERM → stop
  accepting → drain in-flight requests within `config.ops.shutdownGraceMs` → mark undrained
  media jobs `interrupted` in their pfiles → close the DB pool → `unlinkSync` the socket →
  exit 0. Idempotent latch so a repeated SIGTERM doesn't re-drain. Diffusion RUNNERS
  survive by design (engineering/PRODUCTION.md §8).
- **Double-start socket guard** (~server.ts:619): a second `startServer` must NOT silently
  unlink the first instance's socket — the guard refuses. Why: two servers on one socket
  = corrupted request routing.
- **Boot migrations** (`runBootMigrations`, `install/db/migrate.ts:99`): run once, idempotent,
  a failure logs loudly and aborts boot so no request sees a half-migrated schema. Also
  reconciles `running`→`interrupted` pfiles from the previous process life. Authoritative:
  engineering/PRODUCTION.md §7 (DEC-17/DEC-19).
- **`/health`** (`src/core/api/process_health.ts`) is DB-checked AND poison-latched: once a
  boot-order/TDZ ReferenceError poisons the process, `/health` turns 503 so the watchdog
  (engineering/PRODUCTION.md §2) recycles it — a plain DB ping alone stayed green while `read`
  failed, which is the bug it fixes.
- **`/api/v1/counters`** (`src/core/api/counters.ts`, audit S2-37): session-gated AND
  global-admin-only; 404s for non-admins (no existence leak). Access log is one structured
  JSON line per request behind `DEDALO_ACCESS_LOG`.
- **Pool posture** (`config.ops`): `DB_POOL_MAX` (per-process; cross-process budget in
  engineering/PRODUCTION.md §4), `DB_POOL_ACQUIRE_TIMEOUT_MS`, `DB_STATEMENT_TIMEOUT_MS`.
- **Backups** (`src/core/area_maintenance/backup.ts`, S2-35): TS-native `pg_dump -F c` of the
  SHARED DB into the TS server's OWN `../private/backups/db` (never the PHP dir). The full
  backup set + restore-test cadence + the other stores: **engineering/PRODUCTION.md §6** — point there,
  do not enumerate here.

## Validation (the audit's biggest coverage hole)

Ops is **code-verified, not yet failover-tested.** Before trusting a deploy, run the
checklist in **rewrite/STAGING_VALIDATION.md** — it proves shutdown/restart/failover/health/pool
behavior through a REAL restart, which no unit test exercises.

## Bun coupling

- Version is **pinned**: `.bun-version` = `1.3.9`, `package.json` `engines.bun` = `1.3.9`.
  Ops surfaces (Bun.serve unix socket, `Bun.spawn` for media/pg_dump, Bun.sql for
  postgres+mariadb) are version-sensitive — do not float the version.
- The **Bun.sql jsonb/array param trap**: a plain object / native array bound into a jsonb
  param is mis-encoded; the write path routes through `encodeForJsonb`
  (`src/core/db/json_codec.ts:102`, which REJECTS lossy shapes). Full write-path contract:
  see `src/core/db/json_codec.ts` + the isolation/caching skill; PHP on the same Postgres is
  the byte-coexistent oracle.

## The meta-rule (audit's central lesson)

Every invariant enforced only by docs/memory was violated in practice; every **tripwired**
boundary held. If you add an ops/config invariant, add its tripwire — otherwise it will rot.
This skill's two live rails are `config_env_tripwire` (no stray `process.env`) and
`coex_tag_tripwire` (every coexistence hedge is ledgered). Tripwire index: **rewrite/LEDGER.md**.
