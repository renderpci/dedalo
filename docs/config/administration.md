# Dédalo v7 — Configuration Administrator Guide

> How Dédalo v7 loads its configuration, where every value lives, and how you change it.
> If you're coming from v6 (the `config_*.php` files), see **[Migrating from v6](#9-migrating-a-v6-install)**.

---

## 1. In one minute

- There is **one source of truth for defaults**: the **catalog** (`core/base/config/catalog/domains/*.php`) — every setting, its type, and its default.
- Your **per-install values and secrets live OUTSIDE the web root**, in `../private/` (one level above the install).
- `config/config.php` is just a **thin loader** — it has no values, and you never edit it.
- You change settings by editing **`../private/.env`** (by the familiar `DEDALO_*` names), then reloading php-fpm.

```
Want to change a setting?  →  edit ../private/.env  →  reload php-fpm.   That's it.
```

---

## 2. Where everything lives

```mermaid
flowchart TB
    subgraph WEB["🌐 web-served install root (e.g. served at /v7/)"]
        ENTRY["config/config.php<br/>(loader only — never edit)"]
        CATALOG["core/base/config/catalog/domains/*.php<br/>(defaults + types + docs — the reference)"]
    end
    subgraph PRIV["🔒 ../private/  (NOT web-served, chmod 600)"]
        ENV[".env<br/>secrets + general config ← you edit this"]
        ENVHOST[".env.&lt;host&gt;<br/>per-host overrides (optional)"]
        STATE["state.php<br/>install state"]
        PASS["passthrough.php<br/>custom defines"]
        LOCAL["config.local.php<br/>optional PHP config (advanced)"]
    end
    ENTRY -->|reads| ENV
    ENTRY -->|reads if present| ENVHOST
    ENTRY -->|reads| STATE
    ENTRY -->|reads| PASS
    ENTRY -->|reads if present| LOCAL
    ENTRY -->|compiles| CATALOG
```

| File | Web-served? | What it holds | You edit it? |
|---|---|---|---|
| `config/config.php` | yes (but only *executes*) | the loader — no values | **never** |
| `core/base/config/catalog/domains/*.php` | yes (executes) | every setting: name, type, **default**, one-line doc | only to add a *new* setting or change a *global default* |
| `../private/.env` | **no** | **secrets + your general config** | **yes — this is your main file** |
| `../private/.env.<host>` | **no** | per-host overrides | yes, optional |
| `../private/state.php` | **no** | install state (info key, maintenance mode) | rarely |
| `../private/passthrough.php` | **no** | custom `define()`s not in the catalog | rarely |
| `../private/config.local.php` | **no** | optional PHP config for complex/computed values | optional (advanced) |

> **Secrets are never in the web tree.** The `config/` directory contains only `config.php` + a deny rule. Add the matching web-server rule for defence in depth:
> - Apache: a `config/.htaccess` with `Deny from all` (already present).
> - NGINX: `location ^~ /v7/config/ { deny all; return 404; }` (adjust the mount).

---

## 3. The fallback chain (precedence)

Every setting is resolved by walking these layers from the bottom up — **each layer overrides the ones below it**:

```mermaid
flowchart TB
    A["1 ▪ Catalog default<br/>core/base/config/catalog/domains/*.php"]
    B["2 ▪ config.local.php (optional PHP)"]
    C["3 ▪ .env (shared)"]
    D["4 ▪ .env.&lt;host&gt; (this host)"]
    E["5 ▪ real process environment (export DEDALO_…)"]
    A --> B --> C --> D --> E
    E --> R(["✅ effective value"])
    style A fill:#eef
    style E fill:#efe
```

**Plain English:** start from the catalog default; if `config.local.php` sets it, that wins; if `.env` sets it, that wins; if `.env.<host>` sets it, that wins; and a real shell environment variable always wins over everything (12-factor style).

> Most installs only use **layer 1 (defaults) + layer 3 (`.env`)**, plus **layer 4 (`.env.<host>`)** for per-environment differences. Layers 2 and 5 are there when you need them.

### Worked example — `SHOW_DEBUG_PROFILER` (catalog default `false`)

| Where it's set | Effective value on host `localhost` |
|---|---|
| nothing set it | `false` (catalog default) |
| `.env`: `SHOW_DEBUG_PROFILER=true` | `true` |
| `.env`: `…=true` **and** `.env.localhost`: `…=false` | `false` (host wins) |
| above **and** shell: `export SHOW_DEBUG_PROFILER=1` | `true` (process env wins) |

---

## 4. How to change a setting

1. **Find the setting** in the catalog. Open the relevant file in `core/base/config/catalog/domains/` and read the `const:` (the `DEDALO_*` name), `type:`, and `default:`. Example:
   ```php
   new config_key(path: 'db.hostname', const: 'DEDALO_HOSTNAME_CONN', type: 'string', default: 'localhost', ...)
   ```
2. **Set it in `../private/.env`** by its constant name:
   ```ini
   DEDALO_HOSTNAME_CONN=127.0.0.1
   ```
3. **Reload php-fpm** so PHP re-reads the files. If you changed a **database or diffusion** value, also restart the Bun engine.

### Value formats by type

```ini
# string  — unquoted if simple; single-quote if it has spaces/specials
DEDALO_HOSTNAME_CONN=localhost
DEDALO_AV_FFMPEG_SETTINGS='-movflags +faststart -preset slow'

# bool    — true / false  (also accepts 1/0, yes/no, on/off)
SHOW_DEBUG_PROFILER=true

# int
DEDALO_BACKUP_TIME_RANGE=8

# null    — the literal word `null`  (e.g. a DB socket connection with no TCP port)
DEDALO_DB_PORT_CONN=null

# list / map  — JSON, single-quoted (readable, no escaping needed)
API_WEB_USER_CODE_MULTIPLE='[{"db_name":"web","code":"abc","api_ui":null}]'
DEDALO_PROJECTS_DEFAULT_LANGS='["lg-eng","lg-spa"]'
```

> **Quoting rules** (so values read back exactly):
> - simple tokens (letters, digits, `_ / . : @ + -`) → no quotes needed;
> - anything with spaces/JSON/special chars → wrap in **single quotes** `'…'` (literal, no escaping);
> - only if the value itself contains a single quote, use double quotes and escape `\"` and `\\`.
> - a trailing ` # comment` is stripped — put `#`-containing values in single quotes.

---

## 5. Per-host / per-environment configuration

Keep one shared `.env` and add a small `.env.<host>` for each environment that differs.

```mermaid
flowchart LR
    REQ["incoming request / CLI run"] --> H{"detect host"}
    H -->|web| HH["Host header<br/>(e.g. my-local-domain)"]
    H -->|CLI| CE["DEDALO_ENV var,<br/>else machine hostname"]
    HH --> PICK
    CE --> PICK
    PICK["load ../private/.env<br/>then ../private/.env.&lt;host&gt;"] --> DONE(["host values win"])
```

**Example layout:**
```ini
# ../private/.env                 — shared by every host
DEDALO_DATABASE_CONN=dedalo7
DEDALO_NOTIFICATIONS=false

# ../private/.env.localhost       — local dev
DEDALO_HOSTNAME_CONN=localhost
SHOW_DEBUG_PROFILER=true

# ../private/.env.my-local-domain — another dev box
DEDALO_HOSTNAME_CONN=db.local
DEDALO_NOTIFICATIONS=true
```

- **Web requests** pick the file by the `Host:` header (`my-local-domain` → `.env.my-local-domain`).
- **CLI / cron** has no Host header, so set the env var: `DEDALO_ENV=localhost php sometool.php` (otherwise it falls back to the machine hostname).
- An unknown/missing host simply means "no host file" — the shared `.env` applies. A spoofed `Host` can only ever *miss* (it can't load a file that isn't in `../private/`).

---

## 6. Secrets

Secrets live in the top section of `../private/.env`:

```ini
# Dédalo v7 secrets — chmod 600. Never commit.
DEDALO_SALT_STRING='…'
DEDALO_PASSWORD_CONN='…'
MYSQL_DEDALO_PASSWORD_CONN='…'
DEDALO_DIFFUSION_INTERNAL_TOKEN='…'
```

- **⚠️ Never change `DEDALO_SALT_STRING`** on an existing install — it is used to encrypt/decrypt stored passwords; changing it makes every stored credential unreadable.
- `.env` must be **`chmod 600`** and outside the web root (it is, in `../private/`). **Never commit it.**
- Secrets that are structured (e.g. `API_WEB_USER_CODE_MULTIPLE`, `CODE_SERVERS`, `ONTOLOGY_SERVERS`) are stored as **single-quoted JSON** and decoded automatically.

---

## 7. The catalog — your settings reference

`core/base/config/catalog/domains/` is the full, typed list of everything you can configure, grouped by domain:

| File | Domain |
|---|---|
| `paths.php` | install paths + URLs (mostly **derived** — see below) |
| `identity.php` | entity, salt, host |
| `db.php` | PostgreSQL + MySQL connection |
| `runtime.php` | session handler, cache, debug, backups |
| `lang.php`, `defaults.php` | languages, project defaults |
| `media_image.php`, `media_av.php`, `media_docs.php` | media engines + tool paths |
| `features.php` | feature flags |
| `diffusion.php`, `areas.php`, `state.php` | diffusion, areas, install state |

Each entry shows the constant, type, default, and a one-line doc:
```php
new config_key(path: 'features.lock_components', const: 'DEDALO_LOCK_COMPONENTS', type: 'bool', default: true,
    doc: 'Set lock components function when users are editing fields.'),
```

**Derived values** (paths, URLs, the media tool binaries) are *computed at boot* from a few inputs — you don't set them directly. To change them, change the input:
- URLs follow the request mount (e.g. `/v7`);
- media path = `<root>/media/media_<entity>`;
- binary tool paths derive from the platform (macOS `/opt/homebrew/bin`, Linux `/usr/bin`) or `DEDALO_BINARY_BASE_PATH`.

> Edit the catalog only to **add a brand-new setting** or change a **default for all installs** — never for per-install values (that's what `.env` is for).

---

## 8. The `config.local.php` escape-hatch (advanced)

`.env` is flat text — perfect for scalars, flags, and JSON. For **deeply nested or computed** config, you can drop an optional PHP file at `../private/config.local.php` that returns a `dot.path => value` array:

```php
<?php
return [
    'features.entity_menu_skip_tipos' => ['dd123', 'dd456'],
    // computed example:
    'runtime.backup_time_range' => (date('N') >= 6) ? 1 : 8,
];
```

It sits **below `.env`** in precedence (so `.env`/`.env.<host>` can still override it). The automatic migration does **not** create it — it's purely optional.

---

## 9. Migrating a v6 install

The migration tool reads your v6 `config_*.php` files and writes the v7 layout. It is **safe and reversible** — it never touches anything until you pass `--yes`, and it backs up every file first.

```bash
# 1. Preview the plan (writes nothing)
php install/migrate_config_v7.php --dry-run

# 2. Confirm the migrated config reproduces your live config EXACTLY
php install/validate_migration.php        # must print:  faithful: YES

# 3. Write the v7 files (../private/.env + state.php + passthrough.php + Bun .env), with backups
php install/migrate_config_v7.php --yes

# 4. Flip: back up config.php, swap in the v7 loader, reload php-fpm, verify in a browser
cp config/config.php config/config.php.bak
cp <the v7 shim> config/config.php
```

What it produces:
- **`../private/.env`** — secrets **and** general config (the non-default overrides), by constant name.
- **`../private/state.php`**, **`../private/passthrough.php`**, and the **Bun engine `.env`**.
- It does **not** write `config.local.php`.

> `validate_migration` boots both your real v6 config and the migrated v7 surface and diffs them — it is the gate that catches anything that didn't migrate cleanly (custom defines, runtime-computed values, non-standard paths). Reconcile whatever it flags, re-run until **`faithful: YES`**, then flip. The `*_URL` constants depend on the request mount and are verified in the browser, not in CLI.

---

## 10. Troubleshooting & rollback

| Symptom | Fix |
|---|---|
| A change didn't take effect | **Reload php-fpm** (clears the opcode cache of the `.env`/loader). |
| Diffusion / DB change didn't take effect | Also **restart the Bun engine** (it has its own `.env`). |
| A value reads as `''` or `0` when you meant "none" | Use the literal **`null`**: `KEY=null`. |
| JSON value looks broken | Wrap it in **single quotes**; ensure it's a single line. |
| Login/session fails after a config change | Check `DEDALO_SESSION_HANDLER` + `DEDALO_SESSION_SAVE_PATH` (e.g. a redis socket path). |
| Need to undo the v7 flip | Restore `config/config.php` from your backup + reload php-fpm; the v6 files are in your migration backup. |

**Quick sanity check from the CLI** (boots config and prints a value):
```bash
php -r 'include "config/config.php"; echo DEDALO_DATABASE_CONN, "\n";'
```

---

## Appendix — boot order (for the curious)

```mermaid
flowchart LR
    P0["error handlers"] --> P3["load .env + .env.host"] --> P4["compile catalog + overrides"] --> P6["emit DEDALO_* constants"] --> P65["secrets + state"] --> PT["passthrough"] --> FN["core_functions / autoloader / logger / dd_tipos / version"] --> P12["locale / timezone"] --> P13["session (web)"] --> P14["request/user values (web + CLI)"]
```

The compiled catalog + your overrides become the legacy `DEDALO_*` constants (via `compat_shim`), so all existing code keeps working unchanged.
