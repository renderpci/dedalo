---
name: dedalo-install
description: Use when installing Dédalo v7, running or debugging the browser install wizard, or modifying the install subsystem — core/installer/ (class.installer façade + installer_config_manager / installer_database_manager / installer_ontology_manager / installer_hierarchy_manager / installer_data_seeder / installer_setup_manager / installer_config_persistor / installer_secret), installer_json.php, the front-end installer module (core/installer/js/installer.js, render_install.js, model 'installer', tipo dd1590), the pre-auth install API actions (get_install_context, install, persist_config, set_root_pw, test_db_connection, test_diffusion_connection, check_directories, verify_active_config), the ../private/ config dir (.env, .env.<host>, state.php, sample.env), DEDALO_INSTALL_STATUS / DEDALO_TEST_INSTALL, or install/db schema seeds. v7 has NO config files to edit; the wizard writes everything outside the web root.
---

# Dédalo v7 install

**Core principle:** v7 has **no config files to rename or edit**. Installation is a
**pre-authentication browser wizard** that writes every per-install value and secret to a
**`../private/`** directory — a *sibling* of the install root, **outside the web root** — and
**auto-generates the secrets**. The install is sealed by `DEDALO_INSTALL_STATUS=installed`.

The web-served `config/` holds only the loader `config/bootstrap.php` + sample templates —
nothing to copy. Authoritative user docs: `docs/install/index.md` (+ `install_fedora.md`,
`apache_configuration.md`). Config model: `docs/config/administration.md`.

## Admin install flow

**Prerequisites (you provide):** Linux server; PHP 8.4/8.5 (pgsql, gd, mbstring, xml, curl,
zip, bcmath, opcache, fpm…); Apache/NGINX + php-fpm; **PostgreSQL** with an **empty database +
user** already created; ffmpeg, ImageMagick, poppler-utils. The dir **one level above** the
install root must be **writable by the web/php user** — the wizard does `mkdir ../private` (0700).
(MariaDB/MySQL is **only** for the optional diffusion engine and is owned by **Bun**, not PHP.)

**Wizard steps** (run automatically while not installed — open Dédalo in a browser):
Diagnostics → Database (the PG db+user you created) → Entity (`DEDALO_ENTITY` + locale) →
Diffusion *(optional; MariaDB/Bun)* → **Save config** (writes `../private/.env` + `state.php`
+ optional Bun `diffusion/api/v1/.env`, auto-generating `DEDALO_SALT_STRING` + the diffusion
token) → Directories (media/sessions/backups) → Install DDBB schema → Set root password →
Login → Install hierarchies → **Done** (the `install_finish` action seals
`DEDALO_INSTALL_STATUS=installed` into `../private/state.php`).

## The `../private/` model (out of web root)

| File | Purpose |
|------|---------|
| `.env` | per-install constants by `DEDALO_*` name (PHP side); chmod 0600 |
| `.env.<host>` | per-hostname overrides (highest file precedence) |
| `state.php` | machine-managed STATE by catalog dot-path (e.g. `state.install_status`); **not hand-edited** |
| `sample.env` | generated documented REFERENCE of **every** catalog constant (defaults + `CHANGE_ME` placeholders); default perms; safe to read, never loaded |
| `diffusion/api/v1/.env` | Bun engine MariaDB connection (in the install root, written when diffusion enabled) |

Precedence (low→high): catalog defaults → `../private/config.local.php` → `.env` → `.env.<host>`
→ real process env. PG CLI tools (`psql`/`pg_dump`/`pg_restore`) authenticate via **`PGPASSWORD`**
from `DEDALO_PASSWORD_CONN` (no `.pgpass` needed) — works for **local AND remote** DBs; always
pass `-h/-p` and resolve binaries via `system::get_pg_bin_path()`.

## Code architecture (`core/installer/`)

`class.installer` (`class.installer.php`) is the **façade** (`extends common`, model `'installer'`,
tipo `dd1590`). It delegates to specialised managers (each loaded via `include_once __DIR__`):

| Manager | Responsibility |
|---------|----------------|
| `installer_config_manager` | config resolution, DB status, install-status file |
| `installer_database_manager` | DB clone/clean, extensions, optimization, install-from-seed |
| `installer_ontology_manager` | ontology strip, recovery file export/import |
| `installer_hierarchy_manager` | hierarchy file discovery/import/activation |
| `installer_data_seeder` | seed root user, projects, profiles, test record |
| `installer_setup_manager` | **`persist_config`** — atomic write of `.env`/`state.php`/Bun `.env` (+ `sample.env`) via `migration_committer::commit` (the committer lives in **top-level** `install/class.migration_committer.php`, not `core/installer/`); `private_dir()` |
| `installer_config_persistor` | render `.env` (`render_env`) + `state.php` (`render_state`) content |
| `installer_secret` | generate `DEDALO_SALT_STRING` + diffusion token (hex, .env-safe) |

**Autoload depends on the name:** the class is `installer` because the dir is `core/installer/`
(loader resolves `core/<class>/class.<class>.php`); `common::get_json()` loads
`core/installer/installer_json.php` from `get_class($this)`; the front-end loads
`core/installer/js/installer.js` from the **model** `'installer'` (it must `export const installer`).
Keep class name, dir, `installer_json.php`, JS module, and the model/type string in sync — they were
all renamed together from the old `install` (autoload, `get_json`, and the front-end all key off the name).

**Front-end:** `installer.js` (lifecycle: init→build→render→destroy; `build` calls
`get_install_context`) mixes in `render_install.js` (the wizard DOM). CSS `core/installer/css/install.less`
(`@import`ed by `core/page/css/main.less`; wrapper class hardcoded `.install`).

## Install API (pre-auth window)

The wizard calls JSON-RPC actions that **bypass login** (listed in `dd_manager` `$no_login_needed_actions`):
`start`, `get_install_context`, `install`. The `install` action (`dd_utils_api::install`, also in
`API_ACTIONS`) dispatches by `options->action`: `to_update`, `test_db_connection`,
`test_diffusion_connection`, `check_directories`, **`persist_config`**, `verify_active_config`,
`install_db_from_default_file`, `install_hierarchies`, **`set_root_pw`**, and **`install_finish`**
(→ `installer::set_install_status('installed')`, which **seals** the install). `get_install_context`
→ `dd_core_api`/`dd_utils_api` build `new installer()` and
return `installer::get_structure_context()`. Security: CSRF **is** enforced in the install window,
but CSRF ≠ access control — `persist_config`/`set_root_pw` are open pre-auth by design (a fresh,
not-yet-sealed install only; a token-file/IP-allowlist is a deferred decision).

## The install-status gate

`dd_core_api` `start`: if `!defined('DEDALO_TEST_INSTALL') || DEDALO_TEST_INSTALL===true`, and
`DEDALO_INSTALL_STATUS !== 'installed'`, it returns the install context (model `installer`) so the
client boots the wizard instead of the app. After install, status is sealed in `../private/state.php`;
set `DEDALO_TEST_INSTALL=false` to skip the check on every start.

## sample.env

`sample_env_renderer::render()` (`core/base/config/class.sample_env_renderer.php`) renders the
documented reference from the **config catalog** (`core/base/config/catalog/domains/*.php`).
`installer_setup_manager::persist_config` writes it to `../private/sample.env` on **every** Save
config (default perms; render guarded so it never blocks the install). Same renderer backs the dev
CLI `php dev/gen_sample_env.php` (`--stdout` to print). A `DEDALO_*` var is **ignored unless it has a
catalog entry** in `core/base/config/catalog/domains/*.php` (it never becomes a constant otherwise).

## Common mistakes

- **`../private/` not writable** → wizard cannot create it / "Save config" fails. Make the dir one
  level above the install root writable by the web/php user.
- **Editing a config file** → there is none in v7. Pre-authoring is optional: `gen_sample_env.php`
  → copy `../private/sample.env` → `../private/.env` → edit. Resolve config from runtime `DEDALO_*`
  constants, not the legacy `config_db.inc`.
- **Assuming localhost DB** → install must work with a **remote** PostgreSQL; use PGPASSWORD +
  `-h/-p` + `system::get_pg_bin_path()` for every PG CLI shell-out.
- **MariaDB in PHP config** → PHP never connects to MariaDB; it's Bun-only (`diffusion/api/v1/.env`).
- **Renaming the installer unit** → it touches class + dir + `installer_json.php` + `installer.js` +
  model string together (autoload/get_json/front-end all key off the name).

## Key files

- `core/installer/` — façade + 8 managers + `installer_json.php` + `js/` + `css/`
- `core/api/v1/common/class.dd_utils_api.php` (`install` dispatcher) · `class.dd_core_api.php` (`start`/`get_install_context`) · `class.dd_manager.php` (`$no_login_needed_actions`)
- `core/base/config/class.sample_env_renderer.php` · `dev/gen_sample_env.php`
- `install/class.migration_committer.php` — atomic config-write commit layer used by `persist_config`
- `install/db/` (schema seeds, `*.pgsql.gz`) · `install/import/` (hierarchies)
- Tests: `test/server/install/` (DB-gated) · `test/server/unit/installer_*_Test.php` + `sample_env_renderer_Test.php` (config-free)
- Docs: `docs/install/index.md` · `docs/config/administration.md`
