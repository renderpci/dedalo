# The TS-native install engine (developer reference)

> See also: [Installing the TypeScript/Bun server (operator guide)](../install/ts_native_install.md) · [Development](index.md) · [Extending Dédalo](extending/index.md)

This page documents how the TS-native install works internally (DEC-19). For the
step-by-step **operator** instructions, see the
[install guide](../install/ts_native_install.md); this page is for developers
working on `src/core/install/` and the install boot path.

## The engine

One engine under `src/core/install/`, driven by two frontends that share it:
the browser wizard (the byte-identical client at `client/dedalo/core/installer/`,
served in install mode) and the headless CLI `scripts/install.ts` (npm
`dedalo:install`). The router `engine.ts runInstallStep(rqo, context)` maps each
wizard step (`options.action`) to a pure engine function and returns the
**top-level** envelope the client reads (`{result, msg, …extras}`).

| Step | Module | Notes |
|---|---|---|
| diagnostics | `init_test.ts`, `server_info.ts` | `init_test.result` is the client progression gate; `server_info` is cosmetic (TS-meaningful facts only — WC-006) |
| `test_db_connection` | `db_probe.ts` | psql `SELECT 1` on POSTED creds; falls back to the `postgres` DB to tell "missing DB" from "auth wrong" |
| `test_diffusion_connection` | `db_probe.ts` → `diffusion/api/` facade | one-shot MariaDB probe (facade-only, boundary rule) |
| `persist_config` | `config_persist.ts` | atomic `.env` write (PHP key names, 0600, backup-on-overwrite, preserve-or-generate secrets) + state |
| `verify_active_config` | `config_persist.ts` | confirms the RESTARTED process is on the new config |
| `check_directories` | `directories.ts` | private/sessions/cache/media/backups, write+unlink probe |
| `install_db_from_default_file` | `db_restore.ts` | empty-DB gate → gunzip → `psql -f` the seed |
| `set_root_pw` | `root_pw.ts` | Argon2id, direct UPDATE `matrix_users` section_id `-1` dd133 |
| `install_hierarchies` | `hierarchy_import.ts` | `\copy` into `matrix_hierarchy` + counter consolidate (login-gated) |
| `register_tools` | `register_tools.ts` | reuses `core/tools/register.ts importTools({dryRun:false})` |
| `install_finish` | `finish.ts` | seal guard (root + password exist) → `install_status='sealed'` |

## Install-mode boot (the config-freeze problem)

`config.ts` builds and **freezes** `config` at import and `requireEnv`-throws on
missing `ENTITY`/`DB_NAME`/`DB_HOST`/`DB_USER`, so a machine with no `.env`
cannot boot. `resolveInstallMode()` sets `config.installMode` true when **all
four** required keys are unset AND the install is not sealed; the four keys then
carry sentinels so the server boots to serve the wizard. A **partial** config
still throws (operator error), and a **sealed** install whose `.env` vanished
also throws (never silently re-enter the wizard on live data). In install mode
`server.ts` skips migrations / RAG / diffusion, and `/health` reports `db:down`.

## Restart-after-configure

The server reads config once at import, so `persist_config` writes `.env` and
then `process.exit(0)` (`restart.ts scheduleServerRestart`); the supervisor
(`deploy/dedalo-ts.service` `Restart=always`) restarts it into configured mode.
Exit-then-restart avoids racing the socket double-start guard that a self-respawn
would hit. The wizard's separate manual **Verify** click (+ the client's request
retries) bridges the gap. `scheduleServerRestart` is a no-op under
`DEDALO_INSTALL_NO_RESTART=true` (tests and the CLI). The **CLI** sets the DB/
entity env before importing config, so it resolves the real config in one
process and needs no restart.

`start` mounts the wizard while `config.installMode || installInProgress()`
(`gate.ts`): after `persist_config` the server has restarted OUT of install mode
but is not yet sealed (`install_status='configured'`), so a mid-install **reload**
must resume the wizard rather than drop to the login form. `installInProgress()`
deliberately does NOT fire for `undefined`/`unconfigured` status, so an existing
PHP-provisioned deployment (which never ran the TS installer) always gets login.

## Pre-auth window

`dispatch.ts` Gate 1b: the install surface (`dd_utils_api:install` +
`get_install_context`) is pre-auth WHILE UNSEALED and IP-gated
(`DEDALO_INSTALL_ALLOWED_IPS`, `loopback` token; unset = open, dev). Once sealed
the surface returns **404**. CSRF is unchanged (Gate 3 only runs for sessions),
and the record-writing steps re-check the session in the handler.

## Languages (mandatory)

`config.ts` requires four language keys whenever the server is configured
(`INSTALL_MODE=false`): `DEDALO_APPLICATION_LANGS` (code→label map),
`DEDALO_PROJECTS_DEFAULT_LANGS` (code array), `DEDALO_APPLICATION_LANGS_DEFAULT`,
`DEDALO_DATA_LANG_DEFAULT` (owner rule: a missing/malformed value must refuse
boot). The installer therefore MUST write them, or the post-`persist_config`
restart crash-loops.

- `lang_catalog.ts` is the single source of truth: `INSTALL_LANG_CATALOG` (the
  curated ~10 code→label set) + `deriveLangConfig({langs, appLangDefault,
  dataLangDefault})` — PURE (no `config.ts` import). The picked set drives BOTH
  the map and the array, so they can never disagree. Absent `langs` → the whole
  catalog; an explicit empty set or a default ∉ set → `errors` (refused).
- `config_persist.ts` calls `deriveLangConfig`, refuses on `errors`, and writes
  the map/array as **RAW compact `JSON.stringify`** (NOT `envQuote`):
  `parseEnvFile` strips surrounding quotes but does not unescape inner `\"`, so
  an `envQuote`'d JSON value would not round-trip through `JSON.parse`. Scalars
  (`*_DEFAULT`, `DEDALO_APPLICATION_LANG`, `DEDALO_DATA_LANG`,
  `DEDALO_STRUCTURE_LANG`) use `envQuote`.
- The **CLI** (`scripts/install.ts`) presets the lang env vars from
  `deriveLangConfig` BEFORE importing config (with ENTITY/DB set, config would
  otherwise throw at import) — `deriveLangConfig` is pure precisely so it can run
  first. Flags: `--langs`, `--app-lang`, `--data-lang`.
- The wizard collects them on the Entity step (`render_installer.js`), seeded
  from `context.ts` `available_langs`/`install_checked_langs`; ≥1 enforced both
  client-side and in `deriveLangConfig`.

## Config / paths

- The `.env` is written with **PHP key names** (`env.ts PHP_KEY_ALIASES` resolve
  them); `DEDALO_SALT_STRING` is written for PHP coexistence but has no TS reader.
- `DEDALO_PRIVATE_DIR` relocates the whole private tree — both `env.ts` (read)
  and the installer (write) honor it. `installPrivateDir()` (`paths.ts`) adds a
  write-only test override `DEDALO_INSTALL_PRIVATE_DIR`.
- pg client binaries resolve via `pg_bin.ts` (config `DEDALO_PG_BIN_PATH`, then
  Homebrew `postgresql@NN` newest-first, then PATH — a client older than the
  server refuses to connect); `pg_exec.ts` runs psql against an explicit
  connection descriptor (posted creds for the browser probe; the CLI path).

## Seed

`install/db/dedalo_install.pgsql.gz` (byte-identical to the PHP
`dedalo7_install.pgsql.gz`): full matrix/`dd_ontology` schema, extensions
(`btree_gin`/`pg_trgm`/`unaccent`), functions/indexes, the populated core
ontology (~3,500 `dd_ontology` rows), the root user (empty password), the default
project and Admin/User profiles. Hierarchy import files are vendored under
`install/import/hierarchy/` (42 `<tld>.copy.gz` + three metadata JSONs).

## Gates

`test/unit/install_*.test.ts`: install-mode boot (subprocess config import), the
pre-auth gate + reload-resume + verify-await regressions, the `.env` write
contract, the seed restore + Argon2id root pw + login (real scratch DB), the
hierarchy import, the seed drift tripwire, and the full CLI **e2e ending in a
verified root login**.
