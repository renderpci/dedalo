# Configuration & bootstrap architecture

Dédalo uses a **layered configuration architecture**. The main entry file
(`config/config.php`) is a thin orchestrator; all the work happens in
`config/bootstrap/`, which loads flat `key=value` text layers, coerces each
value to its declared type, merges the layers (last one wins, override only the
deltas), validates them, and then emits the legacy `DEDALO_*` constants that the
rest of the codebase consumes.

This means:

* Configuration values live in plain, version-controllable text (`*.env`), not
  scattered across a 950-line PHP file.
* Secrets (DB passwords, salt, tokens) live in `/private/.env`, **outside the
  web root** and never in version control.
* The same `DEDALO_*` constants are still defined exactly as before, so existing
  code keeps working unchanged.

---

## File map

```
config/
  config.php                 Entry point: duplicity guard + require kernel (copy of sample.config.php)
  bootstrap/
    kernel.php               Deterministic boot sequence (the orchestrator)
    paths.php                Computed path / host constants (from __DIR__ / $_SERVER)
    schema.php               Manifest: key -> type, constant, flags  (the "visual map")
    class.dd_config.php      Registry: parse, coerce, merge, validate, emit
    class.dd_config_state.php Atomic writer for config_core.php (install/maintenance state)
    dev/                     Verification tools (snapshot / diff / lint)
  defaults.env               Canonical declarative defaults (version-controlled, NO secrets)
  profiles/<name>.env        Optional per-environment / per-entity overlays (deltas only)
  config_db.php              Legacy DB connection (optional once moved to /private/.env)
  config_core.php            Auto-managed runtime state (generated; do not edit by hand)

/private/                    OUTSIDE the web root (sibling of the install root)
  .env                       Real per-deployment values + secrets (never committed)
  hosts.map                  Optional host -> profile map (multi-entity / multi-env)
  config.local.php           Optional PHP escape hatch: install-specific custom
                             constants / computed paths (replaces config.inc)
```

The kernel also applies process-global side effects from the resolved values:
`date_default_timezone_set(DEDALO_TIMEZONE)`, `setlocale(LC_ALL, DEDALO_LOCALE)`
and `mb_internal_encoding('UTF-8')`.

### Media directory & `config.local.php`

* `DEDALO_MEDIA_SUBDIR` (default `/media`) sets the media folder under the install
  root — e.g. `/media_<entity>` for a per-entity media tree. The kernel derives
  `DEDALO_MEDIA_PATH`/`_URL` (and the upload/export/watermark paths) from it.
* `/private/config.local.php` is included last by the kernel and may define any
  install-specific constant or computed path that does not fit the declarative
  model. Use `if (!defined(...))` to override, or plain `define()` to add. This
  is the small, explicit replacement for the legacy 800-line `config.inc`.

---

## Layer precedence

Configuration is resolved by merging layers from lowest to highest priority. A
higher layer only needs to list the keys it changes; everything else falls
through.

```
defaults.env  <  profiles/<profile>.env  <  /private/.env  <  real environment variables
   (shipped)        (optional, in repo)        (secrets, out of webroot)   (containers / php-fpm pools)
```

* **`defaults.env`** — the canonical baseline shipped with Dédalo. Contains the
  default value of every declarative constant. No secrets.
* **`profiles/<profile>.env`** — optional overlay selected per environment or
  entity (see *Profiles & host selection*). List only the values that differ.
* **`/private/.env`** — the real values for this deployment: secrets plus any
  non-secret override. Highest-priority file. Lives outside the web root and is
  never version-controlled. Start from `config/.env.dist`.
* **Real environment variables** — a process environment variable whose name
  matches a schema key wins over every file (ideal for containers / systemd /
  php-fpm pools).

---

## Authoring values: `key=value`

Every layer is a flat text file:

```ini
# comment
DEDALO_TIMEZONE=Europe/Madrid          # string (bare, no quotes needed)
DEDALO_MAX_ROWS_PER_PAGE=10            # int
DEDALO_LOCK_COMPONENTS=true            # bool: true/false
DEDALO_AV_STREAMER=null                # null
DEDALO_APPLICATION_LANGS={"lg-eng":"English","lg-spa":"Castellano"}   # json
DEDALO_MEDIA_ACCESS_MODE=false         # enum: false | private | publication
```

The bootstrap parses and **types** each value according to `schema.php` — you do
not need to quote strings or guess types. JSON is used for arrays/objects.

---

## The schema manifest (`config/bootstrap/schema.php`)

The schema is the single source of truth that correlates each `.env` key with
its type and the constant it emits. One aligned row per key:

```php
// key                          type     const(=key)             default flags
'DEDALO_MAX_ROWS_PER_PAGE'  => ['int',   'DEDALO_MAX_ROWS_PER_PAGE', null, []],
'DEDALO_MEDIA_ACCESS_MODE'  => ['enum',  'DEDALO_MEDIA_ACCESS_MODE', null, ['enum:false|private|publication']],
'DEDALO_PASSWORD_CONN'      => ['string','DEDALO_PASSWORD_CONN',     null, ['secret','sentinel:mypassword'], 'secrets'],
```

* **type**: `string | int | float | bool | json | enum`
* **flags**: `required`, `secret`, `sentinel:VALUE`, `enum:a|b|c`
* **phase**: `main` (default) or `secrets` (emitted after `config_db.php`)

Because the key, type, default and constant all line up in one table, missing or
inconsistent definitions are easy to spot — and the lint tool enforces it.

---

## Declarative vs computed constants

Two classes of constant, kept apart on purpose:

* **Declarative** (credentials, entity identity, feature flags, quality
  defaults, language/server lists) → live in the `key=value` layers + schema.
* **Computed** (paths from `__DIR__`/host, constants derived from other
  constants, request-scoped language/debug) → stay in PHP:
  * `config/bootstrap/paths.php` — `DEDALO_ROOT_PATH`, all `*_PATH`/`*_URL`,
    `DEDALO_MEDIA_PATH`, host/protocol, sessions/backups paths.
  * `config/bootstrap/kernel.php` — media-derived paths, `DEDALO_ENTITY_LABEL`,
    `DEDALO_CACHE_MANAGER`, session start, debug flags, request-scoped languages,
    and post-`dd_tipos` constants.

---

## Secrets (`/private/.env`)

Database credentials, the crypto salt and internal tokens belong in
`/private/.env`, outside the web root:

```bash
cp config/.env.dist ../private/.env      # adjust to your /private dir
nano ../private/.env
```

```ini
DEDALO_SALT_STRING=a_long_random_unique_string
DEDALO_DB_PASSWORD=...
DEDALO_USERNAME_CONN=...
DEDALO_PASSWORD_CONN=...
MYSQL_DEDALO_PASSWORD_CONN=...
```

**Backward compatibility.** DB connection constants are emitted in a `secrets`
phase *after* `config_db.php` is included, with `if (!defined())`. So:

* Existing installs keep their `config/config_db.php` and nothing changes — the
  values it defines win.
* New installs can leave the secret lines out of `config_db.php` and set them in
  `/private/.env` instead.

The SEC-094 sentinel guard still refuses sample-default secrets when
`DEDALO_ENFORCE_SECRET_SENTINELS=true`.

The `/private` directory resolves to `dirname(DEDALO_ROOT_PATH, 1) . '/private'`
(the sibling of the install root, where `config.inc`, `sessions/` and
`backups/` already live). Override with the `DEDALO_PRIVATE_DIR` environment
variable.

---

## Profiles & host selection

Profiles replace the legacy per-entity `switch($_SERVER['SERVER_NAME'])` in
`/private/config.inc` with declarative data.

The active profile is resolved as:

```
DEDALO_PROFILE / DEDALO_ENV env var  >  /private/hosts.map[HTTP_HOST]  >  none
```

* Set `DEDALO_PROFILE` (or `DEDALO_ENV`) in the server / php-fpm pool / shell,
  **or**
* Provide `/private/hosts.map` mapping hosts to profile names (copy
  `config/hosts.map.sample`):

  ```ini
  archive.example.org=archive
  pre.example.org=archive_pre
  localhost=dev
  *=production
  ```

The resolved profile loads `config/profiles/<profile>.env`, inserted between
`defaults.env` and `/private/.env`. Adding an entity/environment is a new data
file, not a new code branch.

---

## Runtime state (`config_core.php`)

`config/config_core.php` holds auto-managed runtime state and is **generated** —
do not edit it by hand:

```php
define('DEDALO_INSTALL_STATUS', 'installed');
define('DEDALO_MAINTENANCE_MODE_CUSTOM', false);
define('DEDALO_NOTIFICATION_CUSTOM', false);
define('DEDALO_MEDIA_ACCESS_MODE_CUSTOM', 'publication');
```

It is written by `config/bootstrap/class.dd_config_state.php`, which regenerates
the whole file atomically (temp file + `rename()` under an advisory lock, then
`opcache_invalidate()`). This replaces the previous in-place `preg_replace` on
live PHP source, which could half-write executable code under a concurrent read.
A structured `config/state.json` sidecar is written alongside as the canonical
record. The install/maintenance toggles (`install_config_manager::set_install_status`,
`area_maintenance::set_config_core`) keep their validation and root-user
authorization; only the file-write mechanism changed.

---

## Request-scoped values & persistent workers

A few values are **request-scoped**: `DEDALO_APPLICATION_LANG`,
`DEDALO_DATA_LANG`, `SHOW_DEBUG`, `SHOW_DEVELOPER`. As PHP constants they freeze
on the first request — fine for classic PHP-FPM (one request per process), but
under a persistent worker (`DEDALO_RR_WORKER`) the first request's value would
bleed into every later request.

For worker-safe code, read these live instead of the frozen constant:

```php
dd_config::request('application_lang');   // not DEDALO_APPLICATION_LANG
dd_config::request('data_lang');
dd_config::request('show_debug');
dd_config::request('show_developer');
```

The kernel logs a one-time warning in worker mode so the hazard is visible until
call sites adopt the resolver.

---

## Validation & dev tools

All tools live in `config/bootstrap/dev/` and run from the install root.

**Lint** — cross-checks `schema.php` ↔ `defaults.env` ↔ emitted constants
(orphan keys, undefined keys, duplicates, bad types/enums, emit gaps):

```shell
php config/bootstrap/dev/lint_config.php
```

**Constant snapshot / diff** — proves a change does not alter the emitted
constant contract (the parity gate used when modifying the bootstrap):

```shell
php config/bootstrap/dev/snapshot_constants.php config/config.php > /tmp/before.json
# ... make changes ...
php config/bootstrap/dev/snapshot_constants.php config/config.php > /tmp/after.json
php config/bootstrap/dev/diff_constants.php /tmp/before.json /tmp/after.json
```

`diff_constants.php` accepts `--ignore NAME,NAME` to exclude the intentionally
request-scoped constants under worker mode.

---

## Adding a new configuration value

1. Add a row to `config/bootstrap/schema.php` (key, type, constant, flags).
2. Add the default to `config/defaults.env` (unless it is a secret).
3. Run `php config/bootstrap/dev/lint_config.php` — it must stay clean.
4. Override per deployment in `/private/.env` or a profile as needed.

For a **computed** value (depends on a path or another constant), add it to
`config/bootstrap/paths.php` or `kernel.php` instead of the schema.

---

## Boot order (summary)

`config/config.php` → `config/bootstrap/kernel.php`:

1. `paths.php` — computed path/host constants
2. `version.inc`, `logger`, `core_functions.php`
3. registry boot + emit **main** (declarative; profile + `/private/.env` layers)
4. `config_core.php` (runtime state)
5. `config_db.php` + emit **secrets** (DB constants not already defined)
6. secret sentinel guard (SEC-094)
7. `dd_tipos.php`
8. derived constants (media paths, entity label, cache manager)
9. session start (skipped under `DEDALO_RR_WORKER`)
10. `SHOW_DEBUG` / `SHOW_DEVELOPER`
11. class loader
12. activity logger
13. request-scoped languages
14. post-`dd_tipos` constants (`DEDALO_FILTER_SECTION_TIPO_DEFAULT`)
