# Developer quickstart

> See also: [Installation hub](index.md) · [Installer reference](installer_reference.md) · [Troubleshooting](troubleshooting.md) · [Production install](production.md)

A working Dédalo on your laptop in about ten minutes. This is a **development**
setup: plain HTTP, a TCP listener, no reverse proxy, no supervision. Do not run
it this way on a server — for that, see [production](production.md).

## 1. What you need

| | macOS (Homebrew) | Debian/Ubuntu |
| --- | --- | --- |
| Bun (**the pinned version**) | `curl -fsSL https://bun.sh/install \| bash -s "bun-v$(cat .bun-version)"` | same |
| PostgreSQL 18 + `psql` | `brew install postgresql@18` | `apt install postgresql-18 postgresql-client-18` |
| Media tools | `brew install ffmpeg imagemagick poppler ocrmypdf` | `apt install ffmpeg imagemagick poppler-utils ocrmypdf` |

!!! note "macOS binary base"
    Media binaries are looked up under `/opt/homebrew/bin` on macOS and
    `/usr/bin` on Linux, automatically. Override the base with
    `DEDALO_BINARY_BASE`, or any single binary with its own key
    (`DEDALO_AV_FFMPEG_PATH`, `DEDALO_MAGICK_PATH`, …). On an Intel Mac, Homebrew
    installs to `/usr/local/bin` — set `DEDALO_BINARY_BASE=/usr/local/bin`.

!!! note "Several PostgreSQL versions installed?"
    `psql` must not be older than the server. A version-suffixed Homebrew install
    is detected automatically, newest first. If you have a stranger layout, point
    at it explicitly with `DEDALO_PG_BIN_PATH=/opt/homebrew/opt/postgresql@18/bin`.

## 2. Clone and install dependencies

```shell
git clone <your-dedalo-remote> ~/dev/dedalo/master_dedalo
cd ~/dev/dedalo/master_dedalo
bun install
```

That is the whole setup. The browser libraries the client loads ship **with the
repo** — from `node_modules/` or from the committed `vendor/` tree. Nothing is
fetched or copied at install time.

!!! note "The private directory is a sibling of the repo"
    The installer will create `~/dev/dedalo/private/` — one level **above** the
    repo. Make sure that directory is writable (it will be, if you cloned into a
    directory you own).

## 3. Create an empty database

```shell
createdb dedalo_dev
```

Or, if you want an explicit role:

```sql
CREATE USER dedalo_user PASSWORD 'dev';
CREATE DATABASE dedalo_dev WITH ENCODING='UTF8' OWNER=dedalo_user;
```

The installer restores **into** this database and refuses a non-empty one. It
never creates the database itself.

## 4. Run the installer

```shell
DEDALO_INSTALL_ROOT_PASSWORD='dev-root-password' \
MEDIA_PATH="$HOME/dev/dedalo/media" \
bun run scripts/install.ts \
  --db-name dedalo_dev \
  --db-user "$(whoami)" \
  --db-host /tmp \
  --entity dev \
  --langs lg-spa,lg-eng --app-lang lg-eng --data-lang lg-spa
```

`--db-host /tmp` uses the local unix socket, so no password is needed. On a
Homebrew PostgreSQL your own user is a superuser, which is why `--db-user
$(whoami)` just works.

It ends with `✔ install complete — root login verified`.

## 5. Configure the dev listener

The installer writes only the database, entity, language and secret keys — you
add the rest. Two of them are not optional on a laptop:

```shell
cat >> ../private/.env <<'ENV'

# --- Development only ----------------------------------------------------
SERVER_TCP_PORT=3600
DEDALO_DEV_MODE=true
SESSION_COOKIE_SECURE=false
DEDALO_DEBUG_API_ERRORS=true
ENV
```

!!! tip "Media works with no configuration"
    `MEDIA_PATH` **derives** to `<repo>/media` (`config.media.rootPath`), and the engine
    serves media itself on the dev listener — session-gated — because there is no web
    server in front of it here. Set `MEDIA_PATH` only to put the media tree somewhere
    else. In production media is served by the web server from generated rule files, and
    the engine's fallback is structurally unreachable (the socket never serves media):
    see [media protection](../config/media_protection.md).

!!! danger "`SESSION_COOKIE_SECURE` defaults to **true** — you cannot log in until you set it to `false`"
    A `Secure` cookie is dropped by the browser over plain `http://`. The login
    request succeeds, the server sets the cookie, the browser throws it away, and
    the next request arrives with no session — so you land back on the login form
    with no error message worth reading. This is the single most common "my dev
    install is broken" report, and it is one line of configuration.

    Never set it to `false` anywhere a real user can reach.

The other keys:

- **`SERVER_TCP_PORT`** — the engine always listens on a unix socket; a browser
  cannot. This opens an extra TCP listener for development. Leave it **unset in
  production**.
- **`DEDALO_DEV_MODE=true`** — serves the browser test harness and the dev-only
  libraries.
- **`DEDALO_DEBUG_API_ERRORS=true`** — echoes exception text to the client
  instead of only a request id. Very useful locally; a disclosure hole anywhere
  else.

## 6. Run it

```shell
bun run dev          # watch mode; `bun run start` for a plain run
```

```text
Dédalo TS server listening on unix socket /tmp/dedalo_ts.sock (entity: dev)
Dédalo TS dev listener on http://localhost:3600/dedalo/core/page/
```

Open **`http://localhost:3600/dedalo/core/page/`** and log in as `root` with the
password you set in step 4.

## What you get

A fresh install ships the canonical **`test3` playground section** — sample
records covering every component model. It is what the component reference pages
document against, and it is the fastest way to see the editor do something. On a
production install you would delete it; here, keep it.

## Everyday commands

| Command | What |
| --- | --- |
| `bun run dev` | the server, in watch mode |
| `bun test test/unit/…` | targeted unit gates (the whole suite takes minutes) |
| `bun run test:client` | the browser client suite against a `DEDALO_DEV_MODE=true` server |
| `bunx tsc --noEmit` | type check |
| `bun run lint` | the linter |

## When something does not work

- **Cannot log in, no error** → `SESSION_COOKIE_SECURE=false`. See above.
- **`address already in use` / the server exits 1 at boot** → another instance is
  already listening on `/tmp/dedalo_ts.sock`. The double-start guard probes the
  socket and refuses to steal it. Stop the other one, or point
  `SERVER_UNIX_SOCKET` somewhere else.
- **The server serves the install wizard instead of the app** → it booted with
  none of the four required keys set, so it is in install mode. It is not reading
  your `.env` — check that it is at `../private/.env`, one level above the repo.
- Everything else → [troubleshooting](troubleshooting.md).
