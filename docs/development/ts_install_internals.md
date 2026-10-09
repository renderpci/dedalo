# The install engine (developer reference)

> See also: [Installing Dédalo (operator guide)](../install/production.md) · [Development](index.md) · [Extending Dédalo](extending/index.md)

This page documents how the install engine works internally (DEC-19). For the
step-by-step **operator** instructions, see the
[install guide](../install/production.md); this page is for developers
working on `src/core/install/` and the install boot path.

## The engine

One engine under `src/core/install/`, driven by two frontends that share it:
the browser wizard (the byte-identical client at `client/dedalo/core/installer/`,
served in install mode) and the headless CLI `scripts/install.ts` (npm
`dedalo:install`; the container script `install.sh` drives it). The router
`engine.ts runInstallStep(rqo, context)` maps each wizard step (`options.action`)
through its `STEP_HANDLERS` table to a pure engine function and returns the
**top-level** envelope the client reads (`{result, msg, …extras}`).
`INSTALL_ROUTER_ACTIONS` is that table's key list.

## The install plan (one module, every front end)

`install_plan.ts` is the ONE place that turns raw answers into an install:
`buildInstallPlan(raw, {salt, priorEnv})` normalizes them
(`normalizeInstallAnswers` — every default lives here and nowhere else), and
returns the `.env` sections in file order, the keys the plan owns, the ordered
step ids, the optional thesauri, notes and errors. It is PURE: it imports only
`lang_catalog.ts` and `hierarchy_meta.ts`, never `config.ts`, errors or the
database, because the CLI imports it before any configuration exists.

- **The CLI** maps argv to the SAME raw record the wizard posts
  (`answersFromCliArgs`, table `INSTALL_CLI_FLAGS` — the parser carries no
  defaults, and an unknown flag or a value flag without a value is an error),
  seeds the process environment from `cliBootEnv(plan)` through
  `seedProcessEnv` (`src/config/env.ts` — the installer is the one writer of
  `process.env` outside the loader), then runs `plan.steps` with an exhaustive
  switch. `--plan` prints the plan as one JSON line and touches nothing.
- **The wizard** posts the same keys to `persist_config`; `config_persist.ts`
  builds the plan from them (with the prior `.env` values) and renders
  `plan.env`, refusing `install.invalid_input` on `plan.errors` before any write.
- **The steps** (`INSTALL_STEP_IDS`) are the router's action names:
  `test_db_connection`, `test_diffusion_connection` (diffusion only),
  `test_mailer_connection` (mailer only), `persist_config`, `check_directories`,
  `install_db_from_default_file`, `set_root_pw`, `install_hierarchies` (always —
  possibly with an empty list), `register_tools` (unless skipped),
  `install_finish`. The CLI's pre-flight and closing login check, and the
  wizard's `verify_active_config` and in-wizard login, are front-end affordances,
  not plan steps.
- **Update servers.** The plan writes `ONTOLOGY_SERVERS` and `CODE_SERVERS`
  (raw JSON) — `OFFICIAL_ONTOLOGY_SERVER` / `OFFICIAL_CODE_SERVER` by default,
  `[]` for `update_servers: 'none'`. With the official choice, a key whose prior
  `.env` value is a non-empty list is left out of the plan, so the persist step
  carries the operator's line (mirrors included) verbatim; a prior `[]` (an
  earlier air-gapped answer) or an unparseable value is replaced by the official
  entry.
- **Never in the plan:** `DEDALO_SUPERVISED`. Supervision is declared by the
  process manager (unit `Environment=`, compose `environment:`, the supervised
  `bun run` scripts); the engine reads it from the process environment only
  (`src/core/update/supervision.ts`).

`install_plan_parity_tripwire` holds the front ends to this: the same answers
through CLI argv and through the wizard record yield the same plan, a spawned
`--plan` equals the in-process plan, and two persisted `.env` files differ only in
the generated secret.

| Step | Module | Notes |
|---|---|---|
| diagnostics | `init_test.ts`, `server_info.ts` | `init_test.result` is the client progression gate; `server_info` is cosmetic (TS-meaningful facts only — WC-2026-07-09-installer-diagnostics-grid) |
| `test_db_connection` | `db_probe.ts` | psql `SELECT 1` on POSTED creds; falls back to the `postgres` DB to tell "missing DB" from "auth wrong" |
| `test_diffusion_connection` | `db_probe.ts` → `diffusion/api/` facade | one-shot MariaDB probe (facade-only, boundary rule) |
| `persist_config` | `config_persist.ts` | atomic `.env` write (0600, backup-on-overwrite, preserve-or-generate secrets) + state |
| `verify_active_config` | `config_persist.ts` | confirms the RESTARTED process is on the new config |
| `check_directories` | `directories.ts` | private/sessions/cache/media/backups, write+unlink probe |
| `install_db_from_default_file` | `db_restore.ts` | empty-DB gate → gunzip → `psql -f` the seed → engine ontology → `activateCoreHierarchies()` (activates `lg`, see below) |
| `set_root_pw` | `root_pw.ts` | Argon2id, direct UPDATE `matrix_users` section_id `-1` dd133 |
| `install_hierarchies` | `hierarchy_import.ts` | optional thesauri only: `\copy` into `matrix_hierarchy` + counter consolidate + activation (login-gated); a core TLD is activation-only, an empty list is a no-op |
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
deliberately does NOT fire for `undefined`/`unconfigured` status, so a deployment
provisioned by some other route (one that never ran the installer) always gets the
login form, never the wizard.

## Pre-auth window

`dispatch.ts` Gate 1b: the install surface (`dd_utils_api:install` +
`get_install_context`) is pre-auth WHILE UNSEALED and IP-gated by
`installIpAllowed` (`gate.ts`). The gate is **fail-closed since 2026-08-24**
(`engineering/wire_contract/WC-2026-08-24-install-ip-gate-fail-closed.md`): an
unset or empty `DEDALO_INSTALL_ALLOWED_IPS` means the local machine only
(`DEFAULT_INSTALL_ALLOW_ENTRIES = ['loopback']`), and `any` is the single
spelling that admits every address. An entry is `loopback`, a literal address, or
a CIDR block matched bitwise by the pure `ipInCidr` (malformed ⇒ no match, never
a throw). The refusal is `install.ip_denied` (403); its only detail is the caller's own
resolved address (`client_address`, so the operator knows what to add —
`engineering/wire_contract/WC-2026-10-08-install-ip-denied-names-address.md`).
The policy source is never echoed back; the operator reads the effective policy
off the boot log (`describeInstallAllowPolicy`). Honest limit: `clientIp` is the
trusted-hop `X-Forwarded-For` value, and a request without that header resolves
to the sentinel `'local'`, so on a bare TCP listener with no proxy the gate
cannot see the real peer. Once sealed the surface returns **404**. CSRF is
unchanged (Gate 3 only runs for sessions), and the record-writing steps re-check
the session in the handler.

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
  the map and the array, so they can never disagree. Absent `langs` →
  `INSTALL_DEFAULT_LANG_CODES` (`lg-eng`, `lg-spa`; the rest of the catalog is
  optional); an explicit empty set or a default ∉ set → `errors` (refused).
- `install_plan.ts` calls `deriveLangConfig` (its errors become plan errors, so
  `config_persist.ts` refuses on them), and the plan carries
  the map/array as **RAW compact `JSON.stringify`** (NOT `envQuote`):
  `parseEnvFile` strips surrounding quotes but does not unescape inner `\"`, so
  an `envQuote`'d JSON value would not round-trip through `JSON.parse`. Scalars
  (`*_DEFAULT`, `DEDALO_APPLICATION_LANG`, `DEDALO_DATA_LANG`,
  `DEDALO_STRUCTURE_LANG`) use `envQuote`.
- The **CLI** (`scripts/install.ts`) presets the lang env vars from the plan's
  `deriveLangConfig` result (`cliBootEnv`) BEFORE importing config (with ENTITY/DB
  set, config would otherwise throw at import) — `deriveLangConfig` is pure
  precisely so it can run first. Flags: `--langs`, `--app-lang`, `--data-lang`.
- `DEDALO_APPLICATION_LANGS` is ALWAYS the whole `INSTALL_LANG_CATALOG` (= every
  shipped `src/core/labels/catalog/lg-*.json`, gated in
  `test/unit/install_lang_catalog.test.ts`); the picked set only drives
  `DEDALO_PROJECTS_DEFAULT_LANGS`. The interface default may be any catalog
  code, the data default must be picked.
- The wizard collects them on the Entity step (`render_installer.js`), seeded
  from `context.ts` `available_langs`/`install_checked_langs` (pre-ticked =
  `INSTALL_DEFAULT_LANG_CODES`); ≥1 enforced both
  client-side and in `deriveLangConfig`.

## Config / paths

- **Key spellings.** `env.ts` reads each config key by its canonical name and
  accepts a documented legacy `DEDALO_*` spelling as a fallback, so an
  administrator can carry an existing `.env` over unchanged; the canonical name
  always wins when both are set. `DEDALO_SALT_STRING` is generated (or preserved)
  on write for continuity, but nothing in the server reads it — it is not a
  password salt and never was (see `src/core/security/password_hash.ts`).
- `DEDALO_PRIVATE_DIR` relocates the whole private tree — both `env.ts` (read)
  and the installer (write) honor it. `installPrivateDir()` (`paths.ts`) adds a
  write-only test override `DEDALO_INSTALL_PRIVATE_DIR`.
- pg client binaries resolve via `pg_bin.ts` (config `DEDALO_PG_BIN_PATH`, then
  Homebrew `postgresql@NN` newest-first, then PATH — a client older than the
  server refuses to connect); `pg_exec.ts` runs psql against an explicit
  connection descriptor (posted creds for the browser probe; the CLI path).

## Core hierarchies (Languages)

`hierarchy_meta.ts` `CORE_HIERARCHIES` names the thesauri every install has —
today only `lg` (Languages). Its terms ship **in the seed**, in `matrix_langs`
(the table `lg1`/`lg2` resolve to), so it is never imported: there is no
`lg1.copy.gz` and no `lg` descriptor in `hierarchies.json`. It only needs
activating — flag active, active in thesaurus, link the root — which
`activateCoreHierarchies()` (`hierarchy_activate.ts`) does inside
`install_db_from_default_file`, so every surface that restores the seed (CLI,
wizard, `install.sh`) gets it with no separate step. `installHierarchies` answers
a core TLD with activation only (`replace` is refused: its terms cannot be
re-imported), and a front end that lists `lg` gets it dropped with a note.

The optional thesauri pre-selected by default are data, not code:
`defaultOptionalHierarchies()` reads the descriptors flagged
`install_checked_default` in `hierarchies.json` (today `es`). The CLI default,
`install.sh`'s `default` answer and the wizard's `install_checked_default`
context property all come from it.

## Seed

`install/db/dedalo_install.pgsql.gz`: full matrix/`dd_ontology` schema, extensions
(`btree_gin`/`pg_trgm`/`unaccent`), functions/indexes, the populated core
ontology (~3,500 `dd_ontology` rows), the root user (empty password), the default
project and Admin/User profiles, and the Languages terms in `matrix_langs`.
Optional hierarchy import files are vendored under `install/import/hierarchy/`
(`<tld>1`/`<tld>2` `.copy.gz` files + three metadata JSONs).

## Gates

`test/unit/install_*.test.ts`: install-mode boot (subprocess config import), the
pre-auth gate + reload-resume + verify-await regressions, the `.env` write
contract, the seed restore + Argon2id root pw + login (real scratch DB), the
hierarchy import, the seed drift tripwire, and the full CLI **e2e ending in a
verified root login** (and asserting `lg` active with zero `matrix_hierarchy`
rows). `install_plan_parity_tripwire` holds CLI and wizard to one plan;
`install_core_hierarchy_native` proves the core activation needs no import;
`install_sh_portability` runs `install.sh`'s answer-to-flag block through the
plan's own parser.
