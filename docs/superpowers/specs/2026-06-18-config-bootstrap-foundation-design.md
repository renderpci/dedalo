# Dédalo v7 — Config + Bootstrap Foundation (Design Spec)

- **Date:** 2026-06-18
- **Status:** Approved (design) — pending spec review, then implementation planning
- **Owner:** orchestrated design (5-agent panel: bootstrap-lifecycle, config-model/DX, security, migration, reliability devil's-advocate)
- **Scope:** Replace the v6 config/bootstrap system (`config.php`, `config_db.php`, `config_areas.php`, `config_core.php`) with a modern, production-grade foundation for v7.

---

## 1. Context & problem statement

The v6 configuration system (analyzed via the `sample.config*.php` files only — the live working files are dev-hacked and were deliberately not used as a reference) has four parts:

- **`config.php`** — a ~960-line file that conflates four concerns: (a) path constants, (b) runtime **side-effects** (`session_start_manager()`, `setlocale()`, `date_default_timezone_set()`, `mb_internal_encoding()`), (c) ordered `include`s of subsystems (version, logger, core_functions, config_core, config_db, dd_tipos, loader), and (d) ~150 `define()` value constants. Ordering is load-bearing and accidental: some constants depend on functions/constants loaded earlier (`logged_user_id()`, `DEDALO_SECTION_PROJECTS_TIPO`, `fix_cascade_config_var()`).
- **`config_db.php`** — plaintext DB secrets (PostgreSQL private data + MariaDB public data) via `define()`.
- **`config_areas.php`** — a *different* mechanism: mutable `$areas_deny[]`/`$areas_allow[]` arrays consumed via include-scope variables (`core/area/class.area.php:212`).
- **`config_core.php`** — auto-managed *state* (`DEDALO_INSTALL_STATUS`), rewritten by the installer (`core/install/class.install_config_manager.php`, regex + `LOCK_EX`).

### Core problems
1. Bootstrap (process) and config (data) are fused in one file.
2. Everything is a global `define()` — no typing, validation, layering, or testability.
3. Three incompatible mechanisms (constants / mutable arrays / state file).
4. Secrets live in code.
5. No environment layering (dev/pre/prod); ad-hoc `DEVELOPMENT_SERVER` + per-install hacks (`config/acc/*`).
6. PHP↔Bun duplication: `diffusion/api/v1/.env` shares values (`DEDALO_DIFFUSION_INTERNAL_TOKEN`, `DEDALO_MEDIA_PATH`, MariaDB creds) that must be hand-synced and already drift.

### Repo reality (verified, corrects earlier analysis)
- **Nothing config-related is tracked in git.** `config/config.php` (a stripped 4 KB local file), a local WIP `config/bootstrap.php` (~29 KB), and `diffusion/api/v1/.env` are all **git-ignored** (`config/*`, `diffusion/api/v1/.gitignore`). There are **no secrets in the tracked repo**.
- The local `config/bootstrap.php` is a **prior, abandoned attempt** at this redesign. It references `core/base/class.env_loader.php` and `core/base/class.config_migrator.php`, which **do not exist** (so it cannot run). Decision: treat it as a throwaway requirements artifact; **build clean**.

---

## 2. Locked decisions (constraints — not to be relitigated)

1. **Compat:** the new config system is the **source of truth** but still emits the legacy `DEDALO_*` global constants via a **generated compat shim**, so existing `define()`-based reads across core keep working unchanged.
2. **Secrets:** secrets move **out of tracked files into environment variables / a git-ignored `.env`**, aligned with the Bun diffusion engine.
3. **Format:** non-secret config lives in **PHP files that return typed arrays** (opcache-cacheable, no parser dependency). No YAML/JSON runtime parsing for core config.
4. **Runtime:** target **modern PHP (8.1+)**; **keep Dédalo's own autoloader** — **no Composer runtime dependency for core boot**. Modern syntax (enums, readonly, typed constants, DTOs) allowed.
5. **WIP `bootstrap.php`:** prior experiment; build clean.
6. **RoadRunner worker:** not yet a production target. Design request-scoped accessors correctly now (FPM correct, worker-safe), but **phase** the ~300-site call migration as deferred work.
7. **Salt:** `DEDALO_SALT_STRING` encrypts stored passwords and **must not be broken**. Migration **preserves the existing salt verbatim** (moves it to `.env` unchanged); **never regenerate**. No forced rotation. v6 already blocks the default sentinel values at install, so **git history needs no remediation**. Any future salt rotation (dual-key + re-encrypt) is **out of scope**.

---

## 3. Goals & non-goals

**Goals**
- Clean separation of **bootstrap** (imperative process) from **config** (declarative data).
- A single declarative **catalog** that is the one place a setting is defined; everything (constant, validation, docs, migration routing) is generated from it.
- Typed, layered, validated, cacheable config with a back-compat constant shim.
- Secrets in env/`.env`, fail-closed in production, single-source with the Bun engine.
- An automated, safe **migration tool** to convert existing installs, preserving unknown custom defines and the salt.

**Non-goals (this effort)**
- Rewriting the ~300 request-scoped constant read-sites (Phase 5, deferred).
- Salt rotation / re-encryption tooling.
- Removing secrets from git history (not needed).
- Changing the ontology constants in `dd_tipos.php` (consumed, not owned by config).

---

## 4. Architecture overview

The keystone is a **catalog of `ConfigKey` definitions**. From each key, the system generates: the typed value, the legacy `DEDALO_*` constant (via the shim), validation, documentation, and the migration router. A **`scope` taxonomy** on each key is the single contract that resolves every cross-cutting question (what the shim emits statically, what is an accessor, what is a secret read live, what is passthrough).

```
catalog (ConfigKey[])  ─┬─► ConfigCompiler ─► compiled artifact (flat array, opcache)
                        │                         └─► Config repository ─► config() / DTOs / enums
                        ├─► compat_shim ─► define('DEDALO_*', …)  (STATIC/DERIVED scope only)
                        ├─► doc generator ─► sample.config*.php, docs/config.md
                        └─► constant_map ─► migration tool routing (shared source of truth)

Boot::run(EntrypointProfile) ─► ordered phases ─► READY   (state machine; replaces define-guard)
env_loader ─► private/.env (+ process env) ─► secrets (live, never compiled, never $_ENV/putenv)
RequestContext ─► request/user-scoped values (lang, SHOW_DEBUG) — accessors, not define()
```

---

## 5. Detailed design

### 5.1 Directory & file layout

```
config/
  catalog/
    catalog.php                      # assembles domains/*; returns ConfigKey[]
    domains/{paths,media,lang,db,diffusion,sessions,cache,logging,tools,areas,...}.php
  schema/
    constant_map.php                 # ONE manifest shared by shim + migrator
  values/                            # shipped DEFAULT values (tracked), PHP returning typed arrays
  env/{development,pre,production}.php # per-environment overrides (tracked)
  local/config.php                   # per-install overrides (git-ignored) — the file a sysadmin edits
  areas.php                          # deny/allow lists (migrated from config_areas.php)
  state.php                          # machine-written runtime state (git-ignored) — replaces config_core.php
  sample.config*.php                 # GENERATED reference docs (from the catalog)
  config.php                         # thin shim -> Boot (back-compat for include sites)
  nginx.conf.sample                  # NEW — missing nginx hardening sample
core/base/boot/                      # BOOTSTRAP — require-d, never autoloaded (runs before the loader)
  class.Boot.php  class.boot_paths.php  class.boot_runtime.php
  class.env_loader.php  class.compat_shim.php  enum.EntrypointProfile.php
core/base/config/                    # CONFIG runtime — autoloaded
  class.Config.php  class.ConfigCompiler.php  class.ConfigKey.php  class.RequestContext.php
  dto/*  enum/*
../private/.env                      # secrets (git-ignored, outside docroot) + .env.<hostname>
../cache/config/config.<hostname>.<entity>.php  # compiled artifact (outside docroot)
```

Bootstrap classes live under `core/base/boot/` and are `require`d by absolute path (they must exist before the autoloader runs at P10). Config-runtime classes under `core/base/config/` are autoloaded normally.

### 5.2 The catalog — `ConfigKey` (single source of truth)

```php
final readonly class ConfigKey {
    public function __construct(
        public string  $path,        // 'media.image.thumb_width'
        public ?string $const,       // 'DEDALO_IMAGE_THUMB_WIDTH' | null (new-world-only)
        public string  $type,        // 'int'|'bool'|'string'|'list<string>'|'map<string,string>'|'enum:Class'
        public mixed   $default = null,
        public Scope   $scope  = Scope::STATIC,
        public Merge   $merge  = Merge::REPLACE,
        public int     $layers = Layer::ALL,
        public ?\Closure $derived = null,     // computed from resolved config (post-merge)
        public bool    $required = false,
        public ?string $alias_of = null,
        public ?string $deprecated = null,
        public string  $doc = '',
    ) {}
}
```

A new setting is added in **exactly one place**. The doc generator, validator, shim, and migration router all read this.

### 5.3 The `scope` taxonomy (the contract that resolves contradictions)

| Scope | Source | Shim emits `define()`? | Compiled into artifact? | Notes |
|---|---|---|---|---|
| `STATIC` | values/env/local | yes | yes | the majority |
| `DERIVED` | computed at compile | yes | yes | paths from root, quality ladders |
| `DERIVED_REQUEST` | computed at boot | yes (at boot) | no | reads `$_SERVER` (host, web root, protocol) |
| `REQUEST` | per request | **no** (accessor only) | no | `DEDALO_APPLICATION_LANG`, `DEDALO_DATA_LANG` |
| `USER` | per logged user | **no** (accessor only) | no | `SHOW_DEBUG`, `SHOW_DEVELOPER` |
| `SECRET` | env/`.env` | yes (from live env) | **no** (read live) | DB pw, salt, tokens |
| `STATE` | `state.php` | yes (from live state) | **no** (read live) | install status, maintenance |
| `PASSTHROUGH` | migrated custom defines | yes (unvalidated) | yes | preserved unknown defines |

REQUEST/USER scopes are **excluded from the shim** and exposed only via `RequestContext` — this is the fix for the long-lived-worker cross-user leak, and it is declared per key rather than discovered during implementation.

### 5.4 Layering, precedence, merge

Precedence (highest wins): **STATE > SECRETS(env) > INSTALL(`local/`) > ENVIRONMENT(`env/`) > DEFAULTS(`values/`)**.

- **Merge default = `REPLACE`** (matches v6 `define()` semantics: overriding `DEDALO_APPLICATION_LANGS` replaces the whole map). Deep-merge is **opt-in per key** (`Merge::DEEP`) for genuine maps like `MAGICK_CONFIG`.
- Unknown keys in `local/` → warning, **except** `PASSTHROUGH` keys (migrated) and namespaced `tool.<name>.*` (third-party tools via `DEDALO_ADDITIONAL_TOOLS`).
- `config/acc/*` per-env variants migrate into `env/` + `local/` as **deltas vs base** (the 198-define DES variant becomes a small override set).

### 5.5 Accessor API

```php
// 1. Global dot-path reader (house procedural style; mirrors get_legacy_constant_value())
config('media.image.thumb_width');                 // typed value, fail-loud on typo (missing key w/o default)
config('media.image.thumb_width', 222);            // with fallback

// 2. Readonly domain DTOs (recommended for NEW code — typed, IDE/PHPStan, mockable)
Config::i()->media()->image()->thumb_width;         // int

// 3. Backed enums for fixed sets
GeoProvider::VARIOUS; SessionHandler::Files; MediaAccessMode::Publication; LogLevel::ERROR;

// 4. RequestContext for request/user-scoped values
$ctx->application_lang();   // wraps fix_cascade_config_var() (kept intact)
$ctx->data_lang();
$ctx->show_debug();
```

`Config` is a read-only singleton over the compiled flat array (`array_key_exists` reads, opcache-friendly). DTOs are materialized once from the flat values. `fix_cascade_config_var()` (`shared/core_functions.php:1480`) is **wrapped, not rewritten** (it has security-relevant XSS handling and a session write-back).

### 5.6 Compiled cache

- One artifact per **`{hostname}.{entity}`** (a host can serve multiple entities; sharing would leak entity A's DB creds to entity B). Stored **outside docroot** (`../cache/config/`).
- **Secrets, process-env overrides, REQUEST/USER/STATE values are NOT compiled in** — read live each boot.
- **Atomic write**: write temp file + `rename()` on the same filesystem, guarded by `LOCK_EX`, to survive the concurrent-FPM-cold-cache race (no torn reads → no parse-fatal 500s on deploy).
- **Signature** = `sha1(catalog mtimes + env/local content hash + DEDALO_VERSION + active env name)`; sidecar `.sig`. Process-env overrides are read live (not compiled), so they cannot be silently shadowed by a stale signature.
- Prod: compile is a deploy step; runtime staleness check skipped when `DEVELOPMENT_SERVER=false`. **Deploy runbook must include opcache reset + graceful FPM/worker reload.**

### 5.7 Bootstrap pipeline

`Boot::run(EntrypointProfile $p)` — a state machine (`NOT_STARTED → IN_PROGRESS → READY → FAILED`) replacing the fragile `if (defined('DEDALO_ROOT_PATH')) throw` guard. `READY` short-circuits (idempotent) so multiple include-sites and worker re-entry are safe. `IN_PROGRESS` re-entry → typed exception (real bug surfaced). `FAILED` carries the failing phase.

```
P0  guard (state machine)
P1  runtime floor: php-version gate, error_reporting baseline,
    register error/exception/shutdown handlers EARLY + zero-config fallback logger
P2  paths
P3  env load (.env + process env into env_loader private store)
P4  config build (Config from compiled artifact; NO side-effects)
P5  SECRET GATE — evolved SEC-094, fail-closed in production   ← before logger/DB/session
P6  compat shim — emit all non-request/user-scoped define()s (see §5.3 scope table);
    SECRET/STATE values sourced live, REQUEST/USER excluded (accessor-only)
P7  core_functions (pure helpers)
P8  logger (lazy DSN; opens no DB connection)
P9  dd_tipos (ontology constants; needed before any tipo-derived config)
P10 autoloader (class.loader.php; remove logger from its include list — owned by P8)
P11 mb_internal_encoding
P12 setlocale + timezone
P13 session  [SKIPPABLE per profile]
P14 request state: application_lang / data_lang / SHOW_DEBUG / SHOW_DEVELOPER via RequestContext
P15 dispatch (return to front controller)
```

**Entrypoint profiles** (`EntrypointProfile` enum): `WEB | CLI | CRON | WORKER_INIT | TEST`. CLI/CRON/WORKER_INIT skip P13/P14 (resolve from env defaults). The worker boots P0–P12 once; session + request-state are per-request work owned by the worker loop, never frozen as `define()`. `config.php` becomes a thin shim that calls `Boot::run(WEB)` for the many existing include sites.

Notes resolved: no genuine circular dependency (logger consumes config values; config never needs the logger). The early fallback logger (P1) makes failures in P2–P7 observable. Tipo-derived constants (`DEDALO_FILTER_SECTION_TIPO_DEFAULT = DEDALO_SECTION_PROJECTS_TIPO`) are computed after P9.

### 5.8 Secrets — env loader, `.env`, Bun sync, fail-closed gate, salt

- **`env_loader`** (zero-dep): `file()`-based strict parse; KEY regex `^[A-Z_][A-Z0-9_]*$`; single-quote literal / double-quote with limited escapes; **no `${VAR}` interpolation**; type coercion in accessors (`get_int/get_bool/get_json` with JSON depth cap; never `unserialize`). Three hard rules:
  1. **Real process env wins** over `.env` file.
  2. **Never writes `$_ENV`/`$_SERVER`/`putenv`** — values held in a private static array only (so `phpinfo()` and `proc_open` children cannot leak them). Provides a test-only `reset()` seam.
  3. **Refuses** a group/world-writable `.env`; only reads a fixed path (`../private/.env` + `.env.<hostname>`), never request-derived.
- **Missing/corrupt `.env` contract:** bad **non-secret** key → log + skip + default; missing/bad **SECRET** key → fail-closed in production, loud in dev.
- **Bun single source:** the canonical `private/.env` is the only place shared secrets live. Bun reads the same file (`--env-file`) or its `.env` is generated from it with a drift-hash guard, via the name map (Appendix B). A `--check-bun-sync` mode reports drift.
- **SEC-094 evolved:** add `DEDALO_DIFFUSION_INTERNAL_TOKEN`, `DEDALO_INFO_KEY == DEDALO_ENTITY`, empty/low-entropy salt checks; **fail-closed (503) in production by default** (`IS_PRODUCTION`/`!DEVELOPMENT_SERVER`), friendly in dev and during install (`DEDALO_INSTALL_STATUS === false` carve-out). Runs at **P5**.
- **Salt:** preserved verbatim by the migration into `.env`; never regenerated; required + non-default in production.

### 5.9 Compat shim

Generated from the catalog. Emits a `define()` (guarded by `if (!defined())`) for every key with `scope ∈ {STATIC, DERIVED, DERIVED_REQUEST, SECRET, STATE, PASSTHROUGH}` and `const !== null`; **excludes REQUEST/USER** (accessor-only). SECRET/STATE values are sourced live (env/state), never from the compiled artifact. Emits both new + legacy names for `alias_of` keys. A **permanent boot-diff CI gate** boots old vs new config in isolated subprocesses and diffs `get_defined_constants(true)['user']` to prove the shim emits exactly the legacy surface (minus the intentionally-excluded request/user set).

### 5.10 Migration tool

CLI `install/migrate_config_v7.php [--dry-run] [--yes]`, in the install subsystem (already owns config writes + DB conns). **Tokenizer-based static parse** (`token_get_all`) — never `include`s the old files (they start sessions, open the `activity://` Postgres logger, `setlocale`). Phases: discover/lock → static extract (incl. commented-out and unknown defines, with a running symbol table for constant-refs) → safe value resolution (fold literals/concats; mark `$_SERVER`/`dirname`/`fix_cascade`/**cross-file constant refs** as runtime→derived, do not bake) → classify via `constant_map.php` (secret→`.env`, config→typed files, state→`state.php`, derived→drop, unknown→`PASSTHROUGH` preserved verbatim) → build in memory → **validate via subprocess boot-diff** → atomic commit with timestamped backup. Idempotent, schema-versioned (vN→vN+1), keys per `{hostname}.{entity}`, never merges two entities' secrets, syncs the Bun `.env`. **Preserves the salt and all unknown custom defines** (the headline requirement).

---

## 6. Testability & CI gates

- **Two-tier contract:** new code → injectable `config()`/DTOs (unit-testable, mockable); legacy constant readers → process-isolated integration tests against the existing live-DB suite.
- `define()` is process-global and irreversible → `IS_UNIT_TEST` stays a first-class boot profile (`TEST`); `dedalo_assert_secrets_initialised()` keeps its `IS_UNIT_TEST` early-return.
- Pure unit-testable components: `env_loader` (string→array), the migrator (`string → ClassifiedConfig`, file I/O injected), the catalog validator.
- **Permanent CI gates:** (1) shim boot-diff; (2) `constant_map` coverage guard — every `DEDALO_*` symbol consumed in `core/` must have a manifest entry (or be intentionally `removed`); (3) Bun drift check.

---

## 7. Security hardening

- **Phase 0 (decoupled, ship independently):** `php_info` widget → superuser-only + `phpinfo(INFO_ALL & ~INFO_ENVIRONMENT & ~INFO_VARIABLES)` (`core/area_maintenance/widgets/php_info/php_info.php`); `config_core.php`/`state.php` perms → 644 (currently 0666, world-writable); add `config/nginx.conf.sample` (nginx deploys have none of the `.htaccess` protections today).
- Secret classification: Appendix A. Redaction helper `redact_secret()` for any "show effective config" feature (deny-by-default for names matching `/PASS|SECRET|TOKEN|SALT|_KEY$|CODE$/i`).
- `display_errors=Off` in production; secrets fetched via `env_loader::get()` calls (not inline literals) so they never appear in mid-boot stack traces.
- File permissions model: `private/` 750, `.env` 640/600 (loader enforces the floor), config `*.php` 644, compiled cache 640 outside docroot, backups 0770 outside docroot.

---

## 8. Reliability / ops

- **Cache write race:** atomic temp+`rename()` + `LOCK_EX`; compiled dir on same fs as temp.
- **opcache:** deploy runbook resets opcache + graceful reload; document prod `validate_timestamps` setting.
- **Worker reload:** per-request cheap signature stat → graceful `worker.stop()` recycle so config + secrets reload together (no split-brain). (Relevant when workers go to prod; Phase 5.)
- **State lifecycle:** `state.php` written atomically; for multi-instance/NFS, prefer the DB heartbeat-lock pattern (cf. commit `836f4848c9`) over advisory `flock`.
- **Two-boot-path transition:** `config.php` becomes an idempotent shim → `Boot`; all include sites converted in one mechanical pass behind the `READY` short-circuit (no "already included" fatal).
- **`--validate` boot mode** for the deploy pipeline (runs catalog validators + a DB ping before traffic shifts).

---

## 9. Phased delivery (each phase = its own plan → implement cycle)

- **Phase 0 — Security quick-wins (decoupled):** php_info widget, state-file perms, nginx sample.
- **Phase 1 — Secrets foundation:** `env_loader` + secrets to `.env` + evolved fail-closed SEC-094 + Bun single-source.
- **Phase 2 — Config core:** catalog + `constant_map` + typed value files + `Config`/`ConfigCompiler` + accessor API + compat shim + compiled cache.
- **Phase 3 — Bootstrap pipeline:** `Boot` state machine + entrypoint profiles; `config.php` → thin shim; convert include sites.
- **Phase 4 — Migration tool:** tokenizer CLI + boot-diff validation + Bun sync.
- **Phase 5 — Deferred (worker correctness):** `RequestContext` accessors + incremental migration of request-scoped read-sites.

Dependency order: 1 → 2 → 3 → 4; Phase 0 anytime; Phase 5 after 3. Phases 2 and 3 share the catalog/scope contract and must agree on it before either starts.

---

## 10. Risk register (top items + resolution)

| # | Risk | Sev | Resolution |
|---|------|-----|-----------|
| 1 | Request-scoped values frozen as `define()` leak cross-user in a long-lived worker | High (deferred) | `scope: REQUEST/USER` excluded from shim → accessor-only; call-site migration in Phase 5 |
| 2 | Secret gate after logger/session + fails open | High | Move to P5 (before logger/DB/session); fail-closed in prod by default |
| 3 | Compiled cache write race / opcache staleness on deploy | High | Atomic temp+rename+LOCK_EX; deploy-time opcache reset + reload step |
| 4 | `{hostname}`-only cache key leaks entity A creds to entity B | High | Key by `{hostname}.{entity}`; never share artifact across entities |
| 5 | "real env wins" silently shadowed by stale signature | High | Process-env + secrets read live, never compiled |
| 6 | "unknown key = fail" rejects migrated custom defines | High | `PASSTHROUGH` scope in `constant_map`; emitted unvalidated |
| 7 | Two boot paths fatal during transition | High | `config.php` idempotent shim → Boot; one mechanical conversion pass |
| 8 | `define()` irreversibility caps testability | High | Two-tier test contract; `TEST` boot profile; boot-diff CI gate |
| 9 | deep-merge default contradicts v6 replace semantics | Med | Default `REPLACE`; opt-in `DEEP` per key |
| 10 | cross-file derived constant mis-classified by tokenizer | Med | Tokenizer treats external constant refs as `derived`; dd_tipos a hard pre-config dep |
| 11 | `.env` missing/corrupt boot behavior undefined | Med | Written contract: bad non-secret → skip+default; bad/missing secret → fail-closed prod |
| 12 | nginx deploys unprotected | Med | Ship `config/nginx.conf.sample`; cache + `.env` outside docroot |
| 13 | Breaking stored encryption via salt change | High | Preserve salt verbatim; never regenerate; rotation out of scope |

---

## 11. Open items / future work
- Phase 5 worker correctness (accessors + ~300-site migration) when RoadRunner becomes a prod target.
- Optional salt rotation (dual-key + re-encrypt) — separate future effort.
- DTO codegen from the catalog (eliminate DTO drift) — nice-to-have.

---

## Appendix A — Secret classification (→ `.env`, never compiled, redacted)
`DEDALO_PASSWORD_CONN`, `MYSQL_DEDALO_PASSWORD_CONN`, `DEDALO_SALT_STRING` (preserve!), `DEDALO_DIFFUSION_INTERNAL_TOKEN`, `API_WEB_USER_CODE_MULTIPLE[].code`, `ONTOLOGY_SERVERS[].code`, `CODE_SERVERS[].code`, `GEONAMES_ACCOUNT_USERNAME`, SAML keys. DB usernames: config (flagged by sentinel if default). Install fingerprints `DEDALO_INFORMATION`/`DEDALO_INFO_KEY`: state, redacted, not rotatable.

## Appendix B — PHP ↔ Bun `.env` name map (single source)
`MYSQL_DEDALO_HOSTNAME_CONN→DB_HOST`, `MYSQL_DEDALO_DB_PORT_CONN→DB_PORT`, `MYSQL_DEDALO_USERNAME_CONN→DB_USER`, `MYSQL_DEDALO_PASSWORD_CONN→DB_PASSWORD`, `MYSQL_DEDALO_DATABASE_CONN→DB_NAME`, `DEDALO_DIFFUSION_SOCKET_PATH→SOCKET_PATH`, `DEDALO_DIFFUSION_INTERNAL_TOKEN→DIFFUSION_INTERNAL_TOKEN`, `DEDALO_API_URL→DEDALO_API_URL`, `DEDALO_MEDIA_PATH→DEDALO_MEDIA_PATH`.
