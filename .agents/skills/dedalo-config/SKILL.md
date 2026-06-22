---
name: dedalo-config
description: Use when adding, changing, reading, or debugging Dédalo v7 configuration — DEDALO_* constants, the config catalog, ../private/.env / .env.<host> / config.local.php / state.php, config_key, scopes, bootstrap.php, sample.env, or when a setting or env var "isn't taking effect".
---

# Dédalo v7 configuration

## Mental model

v7 is **catalog-driven**. One source of truth for *defaults* is the **catalog** (`core/base/config/catalog/domains/*.php`); per-install *values + secrets* live **outside the web root** in `../private/`; `config/bootstrap.php` is just the loader. At boot the catalog is resolved and emitted as the legacy `DEDALO_*` constants (via `compat_shim`), so existing `defined()`/constant code keeps working.

There are **no `config/config*.php` files to edit** in v7 (they were v6). The operator-facing guide is **`docs/config/administration.md`** — read it for `.env` syntax, per-host configs, fallbacks, and migration.

## Where things live

| Thing | Path | Edit it? |
|---|---|---|
| Defaults + types + docs (the reference) | `core/base/config/catalog/domains/*.php` | only to add a setting / change a global default |
| Loader (no values) | `config/bootstrap.php` | never |
| Per-install config + secrets | `../private/.env` | **yes — main file** |
| Per-host overrides | `../private/.env.<host>` | optional |
| Machine-written state | `../private/state.php` | rarely (widgets write it) |
| Migrated unknown defines | `../private/passthrough.php` | rarely |
| Nested/computed config | `../private/config.local.php` | advanced |
| Generated settings reference | `../private/sample.env` (via `php dev/gen_sample_env.php` → `sample_env_renderer`) | generated, never hand-edit |

`../private/` is a **sibling of the install root** (`dirname(DEDALO_ROOT_PATH)/private`) — outside the web root, and it survives code updates.

## The catalog: `config_key`

```php
new config_key(path: 'db.hostname', const: 'DEDALO_HOSTNAME_CONN', type: 'string',
    default: 'localhost', scope: config_scope::STATIC, doc: 'PostgreSQL host.')
```
Fields: `path` (dot-path), `const` (`DEDALO_*` name, or `null` = new-world-only), `type`, `default`, `scope`, `merge`, `derived` (closure for DERIVED), `doc`.
Caster types (`config_caster`): `int · float · bool · string · list · map` (+ the literal word `null` → real null). `.env` is text, so types matter.
Domains (one file each, grouped by topic): paths, identity, runtime, lang, defaults, media_image, media_av, media_docs, features, diffusion, db, **rag**, **mailer**, areas, state. Put a new key in the matching file — a feature flag → `features.php`, a path/URL → `paths.php`, a language setting → `lang.php`, a DB field → `db.php`, RAG → `rag.php`, SMTP / password-reset → `mailer.php`. Unsure? `grep` an existing similar `const` to find its domain.

## Scopes (how a key is materialized)

| scope | source | emitted as constant? |
|---|---|---|
| STATIC | catalog default + override cascade | yes |
| DERIVED | `derived()` closure from other keys | yes |
| SECRET | `../private/.env` (live) | yes (empty if unset) |
| STATE | `../private/state.php` (live) | yes (empty if unset) |
| REQUEST / USER | per-request / per-user, computed at boot (`request_context`) | **no** — emitted by the WEB boot's request-state phase, not `compat_shim` |
| PASSTHROUGH | `passthrough.php` (migration only) | via include |

Override cascade (low→high): catalog default → boot-resolved `paths.*` → `config.local.php` → `.env` → `.env.<host>` → process env.

## Golden rules (these bite)

- **No `config_key` → silently ignored.** A `DEDALO_*` line in `.env` never becomes a constant unless a catalog `config_key` declares it. To add a setting, add the key to the right domain.
- **Cataloged constants are ALWAYS emitted** (empty `''`/`0`/`false`/`[]` on a fresh install, via the bootstrap safety net). So gate features on **value** (`!empty(X)`, `X !== false`), never bare `defined('X')`.
- **Baseline for defaults = `config/sample.config.php` / `sample.config_db.php`** (canonical), NOT the local `config*.php` (an install's customizations). Diffing against the local file yields false "regressions".
- **Read the emitted constant** at runtime (`DEDALO_*`) or `config('dot.path')` — not legacy config files.
- **Tri-state values** (`false | 'private' | 'publication'`, or `false | filename`) → type `string` (a `bool` type collapses the strings). **Thresholds** (0.92) → type `float`.
- **MariaDB is Bun-only.** No `MYSQL_DEDALO_*` in the PHP catalog; the diffusion DB lives in `diffusion/api/v1/.env` (`DB_*`). `env_sync::MAP` = shared/drift keys; `env_sync::BUN_DB_MAP` = the MariaDB→`DB_*` write map used by the installer/migration only.

## Common tasks

- **Add/change a setting:** add or edit the `config_key` (pick the scope; secrets/credentials → `SECRET`); set per-install values in `../private/.env` by `const` name; **reload php-fpm**; if it's a DB/diffusion value, restart the Bun engine; run `php dev/gen_sample_env.php` to refresh the reference.
- **Verify (no DB needed):** `vendor/bin/phpunit -c test/server/phpunit.unit.xml` (the `catalog_*_Test` / `config_*_Test` suite asserts no dup paths/consts, scope sets, caster types). Add/extend a `catalog_*_Test` when you add a domain.
- **Inspect resolution without side effects:** resolve the catalog + `compat_shim::emit` in isolation rather than including `config/bootstrap.php` on a box that still has legacy `config/config_*.php` — **bootstrap.php auto-runs the one-time v6→v7 migration** (`config_auto_migrate`), which quarantines those files.

## Related
- `docs/config/administration.md` — operator guide (the long form).
- Skills: `dedalo-rag` (RAG subsystem), `dedalo-diffusion` (Bun/MariaDB), `dedalo-media-protection`.
- Install/update: the wizard writes `../private/` (no config-file editing); see `docs/install/index.md`, `docs/management/updates/`.
