# Developer quickstart

> See also: [Installation hub](index.md) · [Installer reference](installer_reference.md) · [Troubleshooting](troubleshooting.md) · [Production install](production.md)

A working Dédalo on your laptop in about ten minutes. This is a **development** setup: plain HTTP, a TCP listener, no reverse proxy, no systemd — `bun run dev` is its own restart loop (it declares `DEDALO_SUPERVISED=true`). Do not run it this way on a server — for that, see [production](production.md).

## 1. What you need

| | macOS (Homebrew) | Debian/Ubuntu |
| --- | --- | --- |
| Bun (**the pinned version**) | `curl -fsSL https://bun.sh/install \| bash -s "bun-v$(cat .bun-version)"` | same |
| PostgreSQL 18 + `psql` | `brew install postgresql@18` | `apt install postgresql-18 postgresql-client-18` |
| Media tools | `brew install ffmpeg imagemagick poppler ocrmypdf librsvg` | `apt install ffmpeg imagemagick poppler-utils ocrmypdf librsvg2-bin` |

!!! note "macOS binary base"
    Media binaries are looked up under `/opt/homebrew/bin` on macOS and `/usr/bin` on Linux, automatically. Override the base with `DEDALO_BINARY_BASE`, or any single binary with its own key (`DEDALO_AV_FFMPEG_PATH`, `DEDALO_MAGICK_PATH`, …). On an Intel Mac, Homebrew installs to `/usr/local/bin` — set `DEDALO_BINARY_BASE=/usr/local/bin`.

!!! note "Several PostgreSQL versions installed?"
    `psql` must not be older than the server. A version-suffixed Homebrew install is detected automatically, newest first. If you have a stranger layout, point at it explicitly with `DEDALO_PG_BIN_PATH=/opt/homebrew/opt/postgresql@18/bin`.

## 2. Clone and install dependencies

```shell
git clone <your-dedalo-remote> ~/dev/dedalo/master_dedalo
cd ~/dev/dedalo/master_dedalo
bun install
```

That is the whole setup. The browser libraries the client loads ship **with the repo** — from `node_modules/` or from the committed `vendor/` tree. Nothing is fetched or copied at install time.

!!! note "The private directory is a sibling of the repo"
    The installer will create `~/dev/dedalo/private/` — one level **above** the repo. Make sure that directory is writable (it will be, if you cloned into a directory you own).

## 3. Create an empty database

```shell
createdb dedalo_dev
```

Or, if you want an explicit role:

```sql
CREATE USER dedalo_user PASSWORD 'dev';
CREATE DATABASE dedalo_dev WITH ENCODING='UTF8' OWNER=dedalo_user;
```

The installer restores **into** this database and refuses a non-empty one. It never creates the database itself.

## 4. Run the installer

```shell
DEDALO_INSTALL_ROOT_PASSWORD='dev-root-password' \
bun run scripts/install.ts \
  --db-name dedalo_dev \
  --db-user "$(whoami)" \
  --db-host /tmp \
  --entity dev \
  --langs lg-spa,lg-eng --app-lang lg-eng --data-lang lg-spa
```

No `--media-path`: the media root defaults to `../private/media` (see step 5). To keep it elsewhere, add `--media-path "$HOME/dev/dedalo/media"`; the installer creates that directory and writes it to `.env` as `MEDIA_PATH`. Setting `MEDIA_PATH=…` in front of the command does not work: the installer would probe that directory, but `.env` would not get it, and the server would use the default.

`--db-host /tmp` uses the local unix socket, so no password is needed — Homebrew's PostgreSQL puts its socket there (the installer's own default is `localhost`). On a Homebrew PostgreSQL your own user is a superuser, which is why `--db-user "$(whoami)"` just works.

With no `--hierarchies`, the shared default set of optional thesauri (today `es`) is installed; `--hierarchies none` makes the install faster. The Languages thesaurus is activated with the database either way. With no `--ontologies`, the default domain ontology, Oral history (`oh`), is installed from the copy built into the repo — no network needed; `--ontologies oh,tch` downloads `tch` and what it declares as dependencies from the update server. The `.env` it writes points `ONTOLOGY_SERVERS` and `CODE_SERVERS` at the official Dédalo update server (add `--no-update-servers` to leave both empty) and lists the installed ontologies in `ACTIVE_ONTOLOGY_TLDS`.

It ends with `✔ install complete — root login verified`, and names the supervised ways to start the server (step 6).

## 5. Configure the dev listener

The installer writes the database, entity, language, secret, update-server and active-ontology keys (and `MEDIA_PATH`, `SERVER_UNIX_SOCKET`, `DEDALO_MEDIA_ACCESS_MODE` when you pass their flags) — you add the rest. Two of them are not optional on a laptop:

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
    Unset, `MEDIA_PATH` **derives** to `../private/media` (`config.media.rootPath`) — outside the code tree, so a code update never carries it away — and the engine serves media itself on the dev listener — session-gated — because there is no web server in front of it here. Set `MEDIA_PATH` only to put the media tree somewhere else. In production media is served by the web server from generated rule files, and the engine's fallback is structurally unreachable (the socket never serves media): see [media protection](../config/media_protection.md).

!!! danger "`SESSION_COOKIE_SECURE` defaults to **true** — you cannot log in until you set it to `false`"
    A `Secure` cookie is dropped by the browser over plain `http://`. The login request succeeds, the server sets the cookie, the browser throws it away, and the next request arrives with no session — so you land back on the login form with no error message worth reading. This is the single most common "my dev install is broken" report, and it is one line of configuration.

    Never set it to `false` anywhere a real user can reach.

The other keys:

- **`SERVER_TCP_PORT`** — the engine always listens on a unix socket; a browser cannot. This opens an extra TCP listener for development. Leave it **unset in production**.
- **`DEDALO_DEV_MODE=true`** — serves the browser test harness and the dev-only libraries.
- **`DEDALO_DEBUG_API_ERRORS=true`** — echoes exception text to the client instead of only a request id. Very useful locally; a disclosure hole anywhere else.

## 6. Run it

```shell
bun run dev          # watch mode; `bun run start:supervised` runs it without the watchers
```

`bun run dev` runs two watchers together: the server (reloading on TypeScript changes, and restarting itself if the install wizard asks for a fresh process) and the stylesheet compiler (recompiling the affected CSS whenever you save a `.less`). Ctrl-C stops both. If you are editing styles, read [Building the CSS](../core/ui/css_architecture.md#building-the-css) first — the compiled `.css` is committed, and it must not be hand-edited.

!!! note "Which scripts are supervised"
    `bun run dev`, `bun run dev:server` and `bun run start:supervised` restart the server when it asks for a fresh process, so each **declares** `DEDALO_SUPERVISED=true` in its own command line. Plain `bun run start` restarts nothing and deliberately declares nothing: the [code update panel](../management/updates/updating_code.md) refuses to swap code under it rather than leave the server dead. Do not put `DEDALO_SUPERVISED` in `../private/.env` — every launch method reads that file, so the engine ignores the key there.

```text
Dédalo TS server listening on unix socket /tmp/dedalo_ts.sock (entity: dev)
Dédalo TS dev listener on http://localhost:3600/dedalo/core/page/
```

Open **`http://localhost:3600/dedalo/core/page/`** and log in as `root` with the
password you set in step 4.

## 7. Run the tests

The suite has its **own database** — it never reads or writes the one your app uses:

```shell
bun run test:db:setup   # once (and after a schema/seed change)
bun test                # picks it up automatically
```

`test:db:setup` builds `<your_db>_test` from files vendored in this repo, **through the installer's own steps**: the core-only install seed and the default domain ontology (`oh`, from the vendored file) exactly as a fresh installation gets them, then the suite's own fixtures — the generic `test` ontology, the canonical `test3` playground records, the hierarchies the tests reference and the registered tools. Nothing is copied from your install.

!!! info "Why a separate database"
    Running the suite against the application's database made the tests depend on that install's data — on a fresh install 183 of 2039 unit tests failed — and let them WRITE to it: one gate provisioned a scratch ontology node and **deleted a real one** on its way out. Tests get their own database; the app's is not theirs to touch.

    If the test DB is missing, `bun test` says so and names the command that builds it; it never falls back to your application's database, so a DB-backed gate fails with `database "…_test" does not exist`. `DEDALO_TEST_DATABASE` overrides the name; `DEDALO_TEST_DB_DISABLE=true` (process environment only) opts out and runs against the configured database.

## Where the test3 playground lives

The canonical **`test3` playground section** — sample records covering every component model, the section the component reference pages document against — is **not** part of an installation: your dev install has the core ontologies and `oh`, nothing else. The playground lives in the suite database. To click around in it, serve that database with its own login:

```shell
bun run test:db:setup        # once
bun run test:client:server   # the suite server, kept alive for browsing (Ctrl-C stops it)
```

## Everyday commands

| Command | What |
| --- | --- |
| `bun run dev` | the server in watch mode **and** the LESS watcher, together (supervised) |
| `bun run dev:server` | the server in watch mode only (supervised) |
| `bun run start:supervised` | the server with no watcher (supervised: restarts on exit `75`) |
| `scripts/dev_instance.sh` | a second instance beside the first, on its own port and socket (`scripts/dev_instance.sh --help`) |
| `bun run css:build` | compile the LESS once (needed if you edited a `.less` without `dev` running) |
| `bun test test/unit/…` | targeted unit gates (the whole suite takes minutes) |
| `bun run test:client` | the browser client suite; it starts its own server on the suite database (step 7) and stops it |
| `bunx tsc --noEmit` | type check |
| `bun run lint` | the linter |
| `bun run scripts/verify.ts` | the pre-merge gate: typecheck, lint, all tripwires, neighbours |

## When something does not work

- **Cannot log in, no error** → `SESSION_COOKIE_SECURE=false`. See above.
- **`address already in use` / the server exits 1 at boot** → another instance is already listening on `/tmp/dedalo_ts.sock`. The double-start guard probes the socket and refuses to steal it. Stop the other one, or point `SERVER_UNIX_SOCKET` somewhere else.
- **The server serves the install wizard instead of the app** → it booted with none of the four required keys set, so it is in install mode. It is not reading your `.env` — check that it is at `../private/.env`, one level above the repo.
- Everything else → [troubleshooting](troubleshooting.md).
