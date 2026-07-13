# Production install (Ubuntu 24.04)

> See also: [Installation hub](index.md) · [Reverse proxy and TLS](reverse_proxy.md) · [Installer reference](installer_reference.md) · [Troubleshooting](troubleshooting.md) · [Upgrading](upgrading.md)

This is the main bare-metal guide: sixteen steps from a clean Ubuntu 24.04 LTS
server to a running, TLS-protected, supervised Dédalo instance. Every command is
meant to be run as `root` (or under `sudo`) unless it is explicitly prefixed with
`sudo -u dedalo`.

The engine is a single long-lived **Bun** process. It listens on a **unix
socket**; a reverse proxy owns TCP, TLS, the client static files and the media
bytes. PostgreSQL is the system of record.

!!! info "Other distributions"
    RHEL, Rocky, AlmaLinux and Fedora follow the same sixteen steps with
    different package names, a different PostgreSQL repository, SELinux and
    firewalld. The deltas are in **[RHEL-based systems](install_rhel.md)** —
    read this page first, then that one.

## The layout this guide builds

```text
/opt/dedalo/master_dedalo/     the repo (git clone) — the artifact
/opt/dedalo/private/           ../private — .env (0600), sessions, state, backups
/opt/dedalo/.bun/bin/bun       the pinned runtime
/srv/dedalo/media/             MEDIA_PATH — originals + derivatives + markers
user/group: dedalo
```

Two properties of this layout are load-bearing, and both are checked by the
installer:

- **`private/` is a sibling of the repo**, one level above it. It is never
  inside the served tree, and it holds every secret. The installer creates it
  (`0700`) — so `/opt/dedalo/` must be **writable by the service user**.
- **`MEDIA_PATH` is absolute and independent of the repo.** It can live on its
  own volume; media is by far the largest thing you will store.

## 1. Service user and directory tree

```shell
adduser --system --group --home /opt/dedalo --shell /usr/sbin/nologin dedalo
mkdir -p /opt/dedalo /srv/dedalo/media
chown dedalo:dedalo /opt/dedalo /srv/dedalo/media
chmod 0755 /opt/dedalo
```

!!! warning "The parent of the repo must be writable by the service user"
    The installer creates `../private/` itself. If `/opt/dedalo/` is not
    writable by `dedalo`, the pre-flight check fails with
    `Private config directory is not creatable/writable`.

## 2. Base OS packages

```shell
apt update
apt install -y git unzip gzip file ca-certificates curl
```

`git` and `unzip` are not only for you: the in-app code-update subsystem shells
out to them. `file` is the fallback MIME sniffer for ambiguous uploads.

## 3. Media toolchain

```shell
apt install -y ffmpeg imagemagick poppler-utils ocrmypdf
```

| Tool | Used for |
| --- | --- |
| `ffmpeg` / `ffprobe` | audiovisual transcoding, posterframes, probing |
| `qt-faststart` | moves the MP4 index to the front so video starts before it finishes downloading |
| ImageMagick | image derivatives, thumbnails, colour-space conversion |
| `pdftotext`, `pdftohtml`, `pdfinfo` (poppler) | PDF text extraction and page rendering |
| `ocrmypdf` | optional automatic OCR of uploaded PDFs |

!!! note "ImageMagick 6 is supported"
    Ubuntu 24.04 ships **ImageMagick 6**, which provides `convert` and
    `identify` but **no `magick` binary**. This is fine: the image engine probes
    for `magick` first and falls back to `convert`/`identify` when it is absent
    (`resolveMagick()` in `src/core/media/engine/imagemagick.ts`). Nothing to
    configure.

Binaries are resolved from a platform base directory (`/usr/bin` on Linux) and
each one can be overridden individually. Check `qt-faststart` in particular — it
is not always in the same package:

```shell
command -v ffmpeg ffprobe qt-faststart convert identify pdftotext ocrmypdf
```

If `qt-faststart` is missing or lives elsewhere, set its absolute path in the
`.env` you write in step 9:

```dotenv
DEDALO_AV_FASTSTART_PATH=/usr/local/bin/qt-faststart
```

??? tip "Extra OCR languages"
    `ocrmypdf` needs a Tesseract language pack per language you want to
    recognise (`apt install tesseract-ocr-spa tesseract-ocr-cat …`). Without the
    pack, OCR silently falls back to English.

## 4. PostgreSQL 18

Install the server **and the client tools** from the PostgreSQL project's own
repository (PGDG), using a modern `signed-by` keyring:

```shell
apt install -y curl ca-certificates
install -d /usr/share/postgresql-common/pgdg
curl -fsSL -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc \
  https://www.postgresql.org/media/keys/ACCC4CF8.asc
echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" \
  > /etc/apt/sources.list.d/pgdg.list
apt update
apt install -y postgresql-18 postgresql-client-18
```

!!! warning "`psql` is a hard requirement, and it must not be older than the server"
    The installer, the database restore, the hierarchy import and the backup
    widget all shell out to `psql` / `pg_dump`. A **missing** client fails the
    pre-flight check outright; an **older** client refuses to connect to a newer
    server, which surfaces as a confusing mid-install failure.

    The resolver (`src/core/install/pg_bin.ts`) looks at `DEDALO_PG_BIN_PATH`
    first, then a small set of version-suffixed locations, then `$PATH`. On a
    box that carries several major versions, pin the right one explicitly:

    ```dotenv
    DEDALO_PG_BIN_PATH=/usr/lib/postgresql/18/bin
    ```

Verify both halves agree:

```shell
psql --version          # must be >= the server
sudo -u postgres psql -c 'SELECT version();'
```

## 5. The pinned Bun runtime

The runtime version is **pinned** in `.bun-version` and in `package.json`
(`engines.bun`). Read the pin from the repo you are about to clone — do not copy
a version number out of a document:

```shell
# at the time of writing: 1.3.9
BUN_VERSION=1.3.9
curl -fsSL https://bun.sh/install | BUN_INSTALL=/opt/dedalo/.bun bash -s "bun-v${BUN_VERSION}"
chown -R dedalo:dedalo /opt/dedalo/.bun
/opt/dedalo/.bun/bin/bun --version
```

!!! danger "Never run `bun upgrade` on a production box"
    The engine is coupled to version-specific runtime behaviour — JSONB
    parameter inference in `Bun.sql` above all. A silent drift there is a
    **data-corruption class**, not a performance regression. The server echoes
    its runtime at boot and warns loudly when it does not match the pin.

    Consequences you must honour:

    - the systemd unit's `ExecStart` points at the **absolute pinned path**
      (`/opt/dedalo/.bun/bin/bun`), never at a floating `bun` on `$PATH`;
    - upgrading the runtime is a deliberate act: change the pin, run the test
      suite, deploy. See [Upgrading](upgrading.md).

    The rationale is written up in `engineering/PRODUCTION.md` §1.

## 6. Get the code

```shell
sudo -u dedalo git clone <your-dedalo-remote> /opt/dedalo/master_dedalo
cd /opt/dedalo/master_dedalo
sudo -u dedalo /opt/dedalo/.bun/bin/bun install --frozen-lockfile --production
```

`--frozen-lockfile` refuses to silently resolve a different dependency tree than
the one that was tested. `--production` skips the dev dependencies (the test
harness and the linters).

!!! note "A clone is self-contained — there is no sync step and no fetch step"
    The browser libraries the client loads (Leaflet, three.js, D3, CKEditor,
    the PDF viewer…) ship **with the repo**: they come either from
    `bun install` (`node_modules/`) or from the committed `vendor/` tree, and
    they are served through an explicit allowlist
    (`src/core/client_libs/registry.ts`). Nothing is downloaded at install time,
    nothing is copied into place, nothing can be half-built.

    Only the *dev-only* libraries (the browser test harness) are dev
    dependencies, and they are gated behind `DEDALO_DEV_MODE` — so
    `--production` is safe.

## 7. Create the database and role — empty

The installer **restores into** a database; it does **not** create one, and it
**refuses a non-empty one** (it probes for `matrix_users` and stops if the table
already exists — an existing install is never clobbered).

```shell
sudo -u postgres psql <<'SQL'
CREATE USER dedalo_user PASSWORD 'a-long-random-password';
CREATE DATABASE dedalo_main WITH ENCODING='UTF8' OWNER=dedalo_user;
COMMENT ON DATABASE dedalo_main IS 'Dédalo: cultural heritage and memory management';
SQL
```

!!! warning "The role must be able to `CREATE EXTENSION`"
    The seed creates `btree_gin`, `pg_trgm` and `unaccent` in the target
    database. Making the role the **database owner**, as above, is the simplest
    way to grant that. If your policy forbids it, have a superuser create the
    three extensions in the empty database beforehand.

!!! note "No `~/.pgpass` needed"
    Dédalo threads `PGPASSWORD` into every `psql` / `pg_dump` subprocess and
    passes `-h/-p` explicitly, so local and remote databases work the same way.
    A `~/.pgpass` file is still honoured by libpq if you prefer it (leave the
    password empty in the configuration and rely on peer/trust auth).

## 8. Run the installer

The installer has two front ends driving one engine: a headless CLI and a
browser wizard. **On a server, use the CLI** — it needs no restart, no exposed
pre-auth surface, and it ends by verifying a real login.

```shell
cd /opt/dedalo/master_dedalo
sudo -u dedalo \
  DEDALO_INSTALL_ROOT_PASSWORD='the-root-password' \
  MEDIA_PATH=/srv/dedalo/media \
  /opt/dedalo/.bun/bin/bun run scripts/install.ts \
    --db-name dedalo_main \
    --db-user dedalo_user \
    --db-password 'a-long-random-password' \
    --db-host localhost --db-port 5432 \
    --entity mib --entity-label 'My Institution' \
    --locale es-ES --timezone Europe/Madrid \
    --langs lg-spa,lg-eng --app-lang lg-spa --data-lang lg-spa \
    --hierarchies es,lg
```

!!! danger "Never put the root password on the command line"
    `--root-password` exists, but an argv is visible in `ps` and lands in your
    shell history. Pass **`DEDALO_INSTALL_ROOT_PASSWORD`** in the environment
    instead, as above.

!!! note "Why `MEDIA_PATH` is exported for this command"
    The installer's directory step creates and write-probes the media root — but
    only if it knows where it is, and at this point nothing has been written to
    `.env` yet. Exporting `MEDIA_PATH` for the install command makes the media
    root part of the pre-flight instead of a surprise at first upload.

Expected output:

```text
Dédalo TS install — entity 'mib', db 'dedalo_main'

→ pre-flight checks
→ database connection
→ write ../private/.env
  generated DEDALO_SALT_STRING = ****
→ directories
→ restore database from seed
→ set root password
→ import hierarchies: es, lg
→ register tools
→ seal install
→ verify root login

✔ install complete — root login verified. Start the server with `bun run start`.
```

Do **not** start the server yet — the configuration is not finished.

The full flag list, what each step does, and what the seed contains are in the
**[installer reference](installer_reference.md)**.

## 9. Finish the configuration

!!! danger "This is the step that is easy to miss"
    The installer writes `../private/.env` **from scratch**: the database
    connection, the entity and locale, the languages and the generated secret —
    and **nothing else**. It also renames any pre-existing `.env` to
    `.env.bak.<timestamp>`.

    Therefore:

    - **`MEDIA_PATH`, `SERVER_UNIX_SOCKET` and every operations key are NOT
      written by the installer.** You append them now.
    - **Anything you hand-added to `.env` *before* running the installer is
      lost.** Configure after, never before.

Append the production block:

```shell
sudo -u dedalo tee -a /opt/dedalo/private/.env >/dev/null <<'ENV'

# --- Serving -------------------------------------------------------------
SERVER_UNIX_SOCKET=/run/dedalo/dedalo_ts.sock
SERVER_IDLE_TIMEOUT_S=255
SERVER_SHUTDOWN_GRACE_MS=10000
TRUSTED_PROXY_HOPS=1

# --- Database pool -------------------------------------------------------
DB_POOL_MAX=10
DB_POOL_ACQUIRE_TIMEOUT_MS=30000
DB_STATEMENT_TIMEOUT_MS=60000
DEDALO_SLOW_QUERY_MS=1000

# --- Observability -------------------------------------------------------
DEDALO_ACCESS_LOG=true
DEDALO_SLOW_REQUEST_MS=5000

# --- Media ---------------------------------------------------------------
MEDIA_PATH=/srv/dedalo/media
DEDALO_MEDIA_ACCESS_MODE=publication

# --- Ontology ------------------------------------------------------------
ACTIVE_ONTOLOGY_TLDS=dd,rsc,oh,ich,lg,hierarchy

# --- Hardening (defaults shown; state them anyway) -----------------------
DEDALO_DEV_MODE=false
DEDALO_DEBUG_API_ERRORS=false
MEDIA_DEV_ROUTE_ENABLED=false
SESSION_COOKIE_SECURE=true
ENV
chmod 0600 /opt/dedalo/private/.env
```

!!! note "`.env` is append-only, and documented keys only"
    Treat the file as a ledger: add keys, never rewrite it by hand. Every key
    is documented in `../private/sample.env` (the generated census) and in the
    [configuration reference](../config/index.md).

Notes on the values above:

- **`SERVER_UNIX_SOCKET`** — the default is `/tmp/dedalo_ts.sock`. A path under
  `/run/dedalo/` survives `PrivateTmp` hardening and is easier to reason about
  in permissions terms. Create the directory (step 12 does it with
  `RuntimeDirectory=`).
- **`SERVER_IDLE_TIMEOUT_S=255`** is the maximum the runtime accepts, and it is
  the default. It matters because the **proxy read timeout must be at least this
  large**, or a slow export dies one hop earlier. See
  [reverse proxy](reverse_proxy.md).
- **`DB_POOL_MAX`** is *per process*. Budget it against PostgreSQL's
  `max_connections`: the server plus each diffusion runner plus the RAG drain
  all draw from the same pool ceiling.
- **`DB_STATEMENT_TIMEOUT_MS`** is `0` (off) by default. Set it: one runaway
  query must not hold a connection forever.
- **`ACTIVE_ONTOLOGY_TLDS`** is the list of ontology top-level domains active in
  this install. Leave it out and the ontology-update panel only offers the two
  core namespaces.

## 10. Media access control

Media is served **by the web server**, not by Dédalo — but the **access rules
are generated by Dédalo**. Decide the mode now, because the proxy configuration
in step 11 depends on it.

| `DEDALO_MEDIA_ACCESS_MODE` | Who can read a media file |
| --- | --- |
| *(unset)* | everyone — the media tree is world-readable |
| `private` | logged-in Dédalo users only (rule A) |
| `publication` | logged-in users (rule A) **plus** anonymous readers of *published* records, in the *public quality* folders only (rule B) |

**Rule A — the back-office cookie.** When a user logs in, the engine sets a
fixed-name cookie, `dedalo_media_auth`, whose value rotates daily. The value is
also written as a zero-byte marker file under `<media>/.publication/auth/`. The
web server authorises a request by checking that the file named by the cookie
exists. Today's and yesterday's values are both valid, so nobody is logged out
of media at midnight.

**Rule B — the publication markers.** An anonymous visitor may read a file only
when (a) it sits in a **public quality folder** and (b) the record it belongs to
is **published**. The record identity is parsed out of the *file name* — Dédalo's
media file names end in `…{component_tipo}_{section_tipo}_{section_id}[_lg-xxx].{ext}` —
and the web server checks for a marker at
`<media>/.publication/pub/{section_tipo}_{section_id}`, maintained by the
diffusion engine.

Three operator facts you cannot guess and must not forget:

- **No Dédalo process is ever in the media byte path.** Authorisation is a
  single `stat()` performed by the web server itself, which is why `sendfile`,
  HTTP `Range` and the H.264 `?start=` clipping still work on multi-gigabyte
  files.
- **The gate fails closed as `404`, never `403`.** The existence of unpublished
  media is not disclosed.
- **Master qualities can never be made public.** The `original` / `modified`
  folders are filtered out of the public list no matter what you configure.

Optional keys:

```dotenv
# Which quality folders rule B may serve. Unset = derived from this install's
# quality catalogue (the delivery qualities + thumbs + posterframes + subtitles).
DEDALO_MEDIA_PUBLIC_QUALITIES=["image/thumb","image/1.5MB","av/404","av/posterframe","av/subtitles","pdf/web"]

# Raw extra Apache directives appended to the generated rules (JSON array).
MEDIA_HTACCESS_ADDONS=[]
```

The definition of the whole subsystem lives in `engineering/MEDIA_PROTECTION.md`;
the administrator-facing view is [media protection](../config/media_protection.md).
**Wiring it into the web server is [the next step](reverse_proxy.md)** — and it is
not optional: an unwired gate serves the whole media tree to the world.

## 11. Reverse proxy and TLS

Production serving is **unix-socket-only**. The proxy owns TCP and TLS, serves
the client static files and the media bytes, and forwards the API and the
dynamic routes to the socket.

→ **[Reverse proxy and TLS](reverse_proxy.md)** (nginx and Apache, certbot, the
generated media rules, the timeouts that matter). Come back here when the proxy
answers on 443.

## 12. Supervision with systemd

Reference units ship in the repo under `deploy/`:

| Unit | What it does |
| --- | --- |
| `dedalo-ts.service` | the server; `Restart=always`, journald capture, SIGTERM drain |
| `dedalo-ts-watchdog.service` + `.timer` | every 30 s, `curl --fail` on `/health` over the socket; restarts the server on failure |
| `dedalo-ts-restart.service` | the restart helper the watchdog fires |
| `dedalo-backup.service` + `.timer` | the nightly backup set |

Copy them and substitute the placeholders:

| Placeholder | This guide's value |
| --- | --- |
| `DEDALO_USER` | `dedalo` |
| `WorkingDirectory` | `/opt/dedalo/master_dedalo` |
| `ExecStart` bun path | `/opt/dedalo/.bun/bin/bun` |
| `EnvironmentFile` | `/opt/dedalo/private/.env` |
| watchdog `--unix-socket` | `/run/dedalo/dedalo_ts.sock` |
| backup paths | `/opt/dedalo/private/backups/…`, `/srv/dedalo/media` |

```shell
cp /opt/dedalo/master_dedalo/deploy/dedalo-ts*.service \
   /opt/dedalo/master_dedalo/deploy/dedalo-ts*.timer \
   /opt/dedalo/master_dedalo/deploy/dedalo-backup.* /etc/systemd/system/
# edit the placeholders, then:
systemctl daemon-reload
systemctl enable --now dedalo-ts.service
systemctl enable --now dedalo-ts-watchdog.timer
systemctl enable --now dedalo-backup.timer
```

Add these three lines to `dedalo-ts.service` so the socket directory exists and
the reverse proxy can actually reach the socket:

```ini
RuntimeDirectory=dedalo
RuntimeDirectoryMode=0750
UMask=0007
```

!!! warning "The socket's permissions are the number-one cause of a 502"
    Connecting to a unix socket requires **write** permission on the socket file.
    With the default umask (`022`) the server creates it as `srwxr-xr-x` — owner
    only. A proxy running as `www-data` or `nginx` then gets `EACCES`, and every
    request is a `502`.

    `UMask=0007` makes the socket `srwxrwx---`. Then add the web-server user to
    the `dedalo` group so it falls in the "group" bucket:

    ```shell
    usermod -aG dedalo www-data     # nginx: usermod -aG dedalo nginx
    systemctl restart nginx
    ```

    Verify: `ls -l /run/dedalo/dedalo_ts.sock` → `srwxrwx--- dedalo dedalo`.

Health check, straight over the socket:

```shell
curl --fail --unix-socket /run/dedalo/dedalo_ts.sock http://localhost/health
# {"result":"ok","entity":"mib","db":"ok","request_id":"…"}
```

!!! note "Why `Restart=always` is not merely nice to have"
    The server reads its configuration **once**, at boot. The browser wizard's
    *Save config* step therefore writes `.env` and then **exits the process**; a
    supervisor is what brings it back up with the real configuration. Without
    `Restart=always` the wizard appears to hang forever at that step.

    The watchdog timer exists for a different reason: systemd's native
    `WatchdogSec` requires `sd_notify`, which the runtime does not speak. The
    30-second `curl` timer is the equivalent — and it catches the class
    `Restart=always` cannot see: *process alive, service dead* (database down,
    pool wedged, module graph poisoned), all of which turn `/health` red.

## 13. First login and post-install

1. Open `https://your-domain/dedalo/core/page/` and log in as **`root`** with the
   password you set in step 8.
2. Go to the **Development Area** and confirm the tools are registered (the
   installer does this unless you passed `--skip-tools`).
3. Create an **admin user**, log out, log back in as that admin. Keep `root` for
   emergencies.
4. Create your **users and projects** — see
   [users and permissions](../management/users_and_permissions.md).

!!! warning "A fresh install ships demo data"
    The default install path seeds the canonical **`test3` playground section** —
    a small set of sample records used by the test suite and by the component
    documentation. It is harmless, but it is not yours. Delete the `test3`
    section's records from the section list once you no longer need them, or
    hide the section from the menu with `DEDALO_ENTITY_MENU_SKIP_TIPOS`.

!!! note "Importing a hierarchy is not the same as activating a thesaurus"
    `--hierarchies` imports the term and model records and realigns the counters.
    Making a hierarchy a **browsable thesaurus tree** (registering it in the
    hierarchy master and provisioning its virtual sections) is a separate
    post-install step you perform from the thesaurus tools — see
    [installing new hierarchies](../management/install_new_hierarchies.md).
    The core install is complete without it, and selecting no hierarchy at all is
    perfectly valid: the seed already carries the core ontology.

## 14. Backups

**The backup set is four stores.** The matrix database alone is *not* a backup:

1. **The matrix PostgreSQL database** — the schema and every record.
2. **The RAG vector database**, if you enabled RAG — a separate database, a
   separate dump.
3. **The media originals** (`MEDIA_PATH`) — the `original` quality is the source
   of truth every derivative is rebuilt from. Derivatives need no backup.
4. **`../private/`** — the `.env` secrets, the session store, `ts_state.json`.

`deploy/dedalo-backup.service` + `.timer` is the reference nightly job covering
all four. The canonical rules — retention, what is *derived* data and therefore
not worth dumping, and the restore drill — are in `engineering/PRODUCTION.md` §6
and in [backup](../management/backup.md). Do not duplicate them into your own
runbook; link to them.

!!! warning "A backup that has never been restored is a hypothesis"
    Restore-test into a scratch database at least quarterly.

## 15. Optional subsystems

All four are **off by default**. Turn on only what you need.

### Diffusion (publication)

Publishes records to a MariaDB target database for a public website.

```dotenv
DEDALO_DIFFUSION_NATIVE=true
DEDALO_DIFFUSION_DB_HOST=localhost
DEDALO_DIFFUSION_DB_PORT=3306
DEDALO_DIFFUSION_DB_USER=dedalo_pub
DEDALO_DIFFUSION_DB_PASSWORD=…
DEDALO_DIFFUSION_DB_NAME=web_dedalo
```

!!! warning "You create the target database — the engine never does"
    A missing or ungranted target database is a **loud configuration error**
    (`MissingTargetDatabaseError`), not something the engine papers over.
    Create it and grant the role before enabling diffusion:

    ```sql
    CREATE DATABASE web_dedalo CHARACTER SET utf8mb4;
    GRANT ALL ON web_dedalo.* TO 'dedalo_pub'@'localhost';
    ```

    The installer can write these keys for you (`--diffusion --mysql-*`), but it
    still does not create the database. Details: [the diffusion
    engine](../diffusion/native_engine.md).

### RAG (semantic search)

```dotenv
DEDALO_RAG_ENABLED=true
DEDALO_RAG_DB_NAME=dedalo_rag
```

!!! warning "No code creates the RAG schema"
    The pgvector database, the `vector` extension and the base `rag_embeddings`
    table are **not** created by the engine. The DDL exists in exactly one place
    — the **[RAG cookbook](../core/ai/rag_cookbook.md)** — and you apply it by
    hand. (Once the base schema exists, the per-model partitions and the index
    queue table *are* created automatically.) Skip this and RAG fails at the
    first write.

### AI assistant

The in-app assistant is disabled unless a model is configured. See
[assistant install](../core/ai/assistant/install.md).

### H.264 real-time clipping

Serving audiovisual fragments by time range needs a web-server module. See
[H.264 streaming module](install_h264_module.md).

## 16. Verify, then harden

Walk the whole path once, in order. Each line is a real failure mode if it does
not pass.

- [ ] `curl --fail --unix-socket /run/dedalo/dedalo_ts.sock http://localhost/health`
      → `200` with `"db":"ok"`.
- [ ] `https://your-domain/dedalo/core/page/` serves the login form over TLS.
- [ ] Log in as the admin user. The menu renders.
- [ ] Create a record in a section, save it, reload — the value persists.
- [ ] Upload an image. The **derivative and the thumbnail** appear (this proves
      ImageMagick resolved and the media root is writable).
- [ ] Search for the record you created.
- [ ] `GET /api/v1/counters` as a global admin returns request, pool, queue and
      memory counters. (Anyone else gets a `404` — that is correct.)
- [ ] `systemctl reboot`, then repeat the health check. The service, the socket
      and the proxy must all come back on their own.

Hardening recap — verify each, because each is a real hole:

| Setting | Production value | Why |
| --- | --- | --- |
| `SERVER_TCP_PORT` | **unset** | the TCP listener is a development convenience; production is socket-only |
| `DEDALO_DEV_MODE` | `false` | dev mode exposes the browser test harness and developer payloads |
| `DEDALO_DEBUG_API_ERRORS` | `false` | otherwise exception text is echoed to the client |
| `MEDIA_DEV_ROUTE_ENABLED` | **unset** | unset is already safe: the engine media fallback answers only on the TCP dev listener (unset in production) and only while protection is unconfigured. Setting it to `true` FORCES it on for every listener — the socket included — serving media with **no per-record ACL** and bypassing the generated rules entirely |
| `DEDALO_INSTALL_ALLOWED_IPS` | set, while unsealed | the install surface is pre-auth until the instance is sealed |
| `SESSION_COOKIE_SECURE` | `true` (the default) | requires TLS — the browser drops a `Secure` cookie over plain HTTP |
| `../private/.env` | `0600`, owned by `dedalo` | it holds every secret |
| `../private/` | `0700` | it holds the session store and the media-auth store |

!!! note "After a successful install the wizard is gone"
    `install_finish` **seals** the instance (`install_status: sealed` in
    `ts_state.json`). From then on the whole install surface answers `404` —
    including on a restart, and including from an allowed IP. There is no way to
    re-open it accidentally.
