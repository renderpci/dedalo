# Troubleshooting an install

> See also: [Production install](production.md) · [Reverse proxy and TLS](reverse_proxy.md) · [Installer reference](installer_reference.md) · [Dev quickstart](dev_quickstart.md)

Symptom first. Each entry names the cause and the fix. If your symptom is not
here, start with the two things that answer most questions:

```shell
journalctl -u dedalo-ts -n 100 -o cat            # the engine's own words
curl --fail --unix-socket /run/dedalo/dedalo_ts.sock http://localhost/health
```

| Symptom | Jump to |
| --- | --- |
| The installer stops on a `psql` complaint | [Installing](#installing) |
| `Database is not empty … restore refused` | [Installing](#installing) |
| The server refuses to boot | [Booting](#booting) |
| The server serves the install wizard instead of the app | [Booting](#booting) |
| The wizard resumes on an install that is already finished | [Booting](#booting) |
| The wizard is a `404`, or refuses your address | [Booting](#booting) |
| `502` from the proxy | [Serving](#serving) |
| nginx will not start | [Serving](#serving) |
| A big export dies after about a minute | [Serving](#serving) |
| Uploads fail with `413` | [Serving](#serving) |
| Nobody can log in, and there is no error | [Using it](#using-it) |
| Media `404`s | [Media](#media) |
| Media is served to everyone | [Media](#media) |
| `MEDIA_HTACCESS_ADDONS` rules do not appear | [Media](#media) |
| Uploads produce no thumbnail | [Media](#media) |

## Installing

### `PostgreSQL client (psql) not found`

**Cause.** The pre-flight check could not resolve a `psql` binary. The installer,
the seed restore, the hierarchy import and the backup widget all shell out to it,
so this is a hard gate.

**Fix.** Install the client package (`postgresql-client-18`), or point at it:

```dotenv
DEDALO_PG_BIN_PATH=/usr/lib/postgresql/18/bin
```

### The install fails part way through, with a connection error

**Cause.** Very often: **`psql` is older than the server.** An older client
refuses to connect to a newer server, and a machine with several major versions
installed can easily resolve the wrong one.

**Fix.** Check both, then pin the client with `DEDALO_PG_BIN_PATH`:

```shell
psql --version
sudo -u postgres psql -c 'SHOW server_version;'
```

### `Database is not empty (matrix_users already exists) — restore refused`

**Cause.** Exactly what it says. The installer restores **into** a database and
never clobbers an existing install. It probes for the `matrix_users` table.

**Fix.** Point at an empty database, or drop and re-create this one — but be
certain first, because a populated `matrix_users` means *somebody already
installed here*.

```sql
DROP DATABASE dedalo_main;
CREATE DATABASE dedalo_main WITH ENCODING='UTF8' OWNER=dedalo_user;
```

### `Private config directory is not creatable/writable`

**Cause.** The installer creates `../private/` — a sibling of the repo. The
directory **one level above the repo** is not writable by the service user.

**Fix.** `chown dedalo:dedalo /opt/dedalo` (the parent, not the repo). In a
container, this is what `DEDALO_PRIVATE_DIR` is for — see [Docker](docker.md).

## Booting

### `Missing required config key 'DB_NAME'` (or `ENTITY`, `DB_HOST`, `DB_USER`)

**Cause.** A **partial** configuration. The four keys `ENTITY`, `DB_NAME`,
`DB_HOST`, `DB_USER` are all-or-nothing: with **none** of them set, the server
boots into install mode; with **some** of them set, it is misconfigured and says
so. This is deliberate — a half-configured server must not quietly fall back to
install mode against a real database.

**Fix.** Set all four (they are written by the installer, under their
`DEDALO_*_CONN` spellings), or none.

### The server serves the install wizard instead of the application

**Cause.** It booted with none of those four keys set, so it is in **install
mode**. Almost always: it is not reading the `.env` you think it is.

**Fix.** The file must be at `../private/.env`, one level above the repo — or
wherever `DEDALO_PRIVATE_DIR` points. Confirm:

```shell
sudo -u dedalo cat /opt/dedalo/private/.env | head -5
journalctl -u dedalo-ts | grep 'INSTALL MODE'
```

If the four keys **are** set and being read, this is not install mode — see the
next entry.

### The wizard resumes on an install that is already finished

**Cause.** The install was never **sealed**. `install_finish` is what writes
`install_status: 'sealed'`; until it runs the status stays `configured`, and a
`configured` instance deliberately re-mounts the wizard on every reload rather
than dropping to a login form (that is what lets a mid-install reload resume
instead of stranding you on a login with no schema and no root user). Abandon the
wizard one step before the end — close the tab, restart the server — and it
resumes forever, even though the database is fully built.

Recognise it by the state file **plus** a configured `.env`:

```shell
grep install_status ../private/ts_state.json     # "configured", not "sealed"
```

**Fix.** Reopen the wizard and let it run to **Finish**, which calls
`install_finish`. It refuses to seal unless the root user exists with a password
set, so it will tell you if a step really is outstanding. To seal from the shell
instead — same guard, same result — run from the repo root:

```shell
bun -e "import {installFinish} from './src/core/install/finish.ts'; console.log(await installFinish())"
```

The seal applies immediately (the state file is read fresh on every request; no
restart), but **reload the browser page**: the wizard is already mounted in the
open page's JavaScript and only goes away when the client calls `start` again.

### `Config key 'DEDALO_PREFIX_TIPOS' is RETIRED`

**Cause.** A **retired** key is not an alias: it configures nothing. Left in
place it would silently fall back to the replacement key's default, so the server
refuses to boot instead.

**Fix.** Rename the line in `../private/.env`:

```dotenv
ACTIVE_ONTOLOGY_TLDS=dd,rsc,oh,ich,lg,hierarchy
```

### Crash loop right after the wizard's *Save config*

**Cause.** The language configuration is mandatory and the written `.env` is
missing it, so every boot dies on:

```text
Config key 'DEDALO_APPLICATION_LANGS' must be a non-empty JSON object map
```

The wizard collects the languages on the **Entity** step; a hand-written `.env`
has to carry them itself.

**Fix.** Ensure all four keys are present:

```dotenv
DEDALO_APPLICATION_LANGS={"lg-spa":"Castellano","lg-eng":"English"}
DEDALO_PROJECTS_DEFAULT_LANGS=["lg-spa","lg-eng"]
DEDALO_APPLICATION_LANGS_DEFAULT=lg-spa
DEDALO_DATA_LANG_DEFAULT=lg-spa
```

### `FATAL: another server instance is already listening on … — refusing to steal its socket`

**Cause.** The double-start guard. A pre-existing socket file is **probed with a
connection**; if something answers, a second instance would silently orphan the
first, so it exits `1` instead.

**Fix.** Stop the running instance, or point `SERVER_UNIX_SOCKET` elsewhere. A
*stale* socket file (nothing listening) is removed automatically — this error
only fires when something really is alive on it.

### The wizard is a `404`

**Cause.** The instance is **sealed**. Sealing is terminal: the entire install
surface answers `404` from then on, across restarts, from any address.

**Fix.** None, and that is the point. A sealed instance is an installed instance
— log in. (If you truly need to re-install: empty database, empty private
directory, start again.)

### The wizard refuses your address

**Cause.** `DEDALO_INSTALL_ALLOWED_IPS` is set and your address is not in it.

**Fix.** Add it. And note that **`loopback` will not match behind a reverse
proxy**: the address is resolved from the trusted `X-Forwarded-For` hop, so name
the real client address.

### The boot fails with `core module warm-up: N module(s) failed to evaluate`

**Cause.** A module in the engine's core graph failed to evaluate. The server
evaluates the whole graph **before** it listens, and a failure is fatal by design
— a visible crash loop beats a server that serves identical failures for the rest
of its life.

**Fix.** This is a code defect, not a configuration one. The log names the
modules. Roll back to the previous ref ([upgrading](upgrading.md#rollback)) and
report it.

## Serving

### Every request is a `502`

**Cause.** The proxy cannot connect to the unix socket. Connecting to a unix
socket needs **write** permission on the socket file, and with the default umask
the engine creates it `srwxr-xr-x` — owner only. The proxy runs as `www-data` or
`nginx`.

**Fix.**

```ini
# dedalo-ts.service
UMask=0007
RuntimeDirectory=dedalo
RuntimeDirectoryMode=0750
```

```shell
usermod -aG dedalo www-data      # nginx: usermod -aG dedalo nginx
systemctl restart dedalo-ts nginx
ls -l /run/dedalo/dedalo_ts.sock # → srwxrwx--- dedalo dedalo
```

Also confirm the paths agree: `SERVER_UNIX_SOCKET` in `.env`, the `upstream` in
the proxy configuration, and the watchdog unit's `--unix-socket`.

### nginx: `unknown "dedalo_auth_key" variable`

**Cause.** You included the generated media **server** rules but not the
generated **map** file. A `map` cannot live inside `server{}`, so it ships as a
separate file that must be included at `http{}` scope.

**Fix.** Include both, or neither:

```nginx
include /srv/dedalo/media/dedalo_media_protection_map.nginx.conf;   # http{} scope
include /srv/dedalo/media/dedalo_media_protection.nginx.conf;       # server{} scope
```

### nginx: `pcre2_compile() failed: missing closing parenthesis`

**Cause.** A known defect in the generated `publication`-mode rules: the rule-B
`location` regex is emitted **unquoted** and contains `{2,12}`, which nginx's
configuration lexer reads as a block delimiter.

**Fix.** Quote that one regex. See
[reverse proxy → nginx](reverse_proxy.md#nginx).

### nginx: `open() … dedalo_media_protection.nginx.conf failed`

**Cause.** The engine has not written the rule files yet. It writes them at boot
— but only when a media access mode is configured.

**Fix.** Set `DEDALO_MEDIA_ACCESS_MODE`, start the engine once, then reload
nginx. Bring the proxy up with the two `include` lines commented out if you need
the site before then.

### A large export or a long tool action dies after about a minute

**Cause.** The proxy's read timeout is lower than the engine's idle timeout, so
the proxy hangs up first.

**Fix.** `proxy_read_timeout 300s;` (nginx) or `ProxyTimeout 300` (Apache) —
at least `SERVER_IDLE_TIMEOUT_S` (255).

### The assistant chat or a diffusion progress stream stalls

**Cause.** The proxy is buffering a streaming response.

**Fix.** `proxy_buffering off;` on the API location.

### Uploads fail with `413 Request Entity Too Large`

**Cause.** nginx's `client_max_body_size` defaults to **1 MB**, and the client
uploads in ~4 MB chunks.

**Fix.** `client_max_body_size 300m;` (Apache's default is unlimited — nothing to
do there).

### `/health` answers `503 {"db":"down"}`

**Cause.** PostgreSQL is unreachable or the connection pool is wedged. The health
check is deliberately *not* liveness-only — monitoring must go red when the
database is down, not only when the process dies.

**Fix.** Check PostgreSQL, then the pool: `DB_POOL_MAX` is **per process**, and
the engine plus every diffusion runner plus the RAG drain all draw against
PostgreSQL's `max_connections`. Watch `db_pool_waits` on
`GET /api/v1/counters`.

### `/health` answers `503 {"process":"poisoned"}`

**Cause.** A module in the graph failed at request time and its failure is cached
for the life of the process. The engine latches this and reports it so that the
watchdog recycles the process rather than serving identical failures forever.

**Fix.** The watchdog restarts it within 30 seconds. It is a code defect —
capture the log and report it.

## Using it

### Nobody can log in, and there is no error message

**Cause.** `SESSION_COOKIE_SECURE` defaults to **true**, so the browser discards
the session cookie over plain `http://`. The login *succeeds*; the cookie is
thrown away; the next request arrives with no session; you land back on the login
form.

**Fix.** Serve over **TLS**. That is the real fix, and the only fix on a server.

On a local development machine only:

```dotenv
SESSION_COOKIE_SECURE=false
```

!!! danger
    Never set this to `false` anywhere a real user can reach. The media-auth
    cookie inherits the same attribute, so you would also be shipping a working
    media authorisation value in cleartext.

## Media

### A logged-in user gets `404` for every media file

**Cause.** Rule A failed. Either the browser is not sending the
`dedalo_media_auth` cookie, or the marker file it names does not exist under
`<media>/.publication/auth/`.

**Fix.**

1. **Log out and log in again.** The markers are (re)written at every login, so
   this self-heals a wiped media directory or a fresh deploy.
2. Check the marker store exists and is readable by the web server:

    ```shell
    ls -l /srv/dedalo/media/.publication/auth/
    ```

3. Check the cookie is present in the browser's request. It is `HttpOnly` and
   `SameSite=Lax` — media embedded **cross-site** will not carry it, by design.
4. If it is `Secure` but you are on plain HTTP, see the login entry above.

### An anonymous visitor gets `404` for a published record's media

**Cause.** Rule B did not match. Three candidates, in order of likelihood:

1. **The record is not published.** The marker
   `<media>/.publication/pub/{section_tipo}_{section_id}` is written by the
   diffusion engine when you publish. No marker, no access.
2. **The quality folder is not public.** Only the configured public qualities are
   readable anonymously, and **master qualities can never be made public** — the
   `original` and `modified` folders are filtered out no matter what you
   configure.
3. **The file name does not parse.** Rule B identifies the record from the file
   *name*. A file renamed outside Dédalo's naming grammar simply never matches,
   and stays login-only. That is deliberate; do not loosen it.

### Every media file `404`s, for everybody, and nginx looks fine

**Cause.** The **root rule**. The generated nginx locations carry no `root` and
no `alias`; they inherit the server's `root`, which must resolve
`/dedalo/<media dir>/…` onto `MEDIA_PATH`.

**Fix.** See [reverse proxy → the root rule](reverse_proxy.md#the-root-rule).
With the canonical layout it is `root /srv;`.

### Media is served to *everyone* (Apache)

**Cause.** The generated `.htaccess` is being ignored — silently, and open.

**Fix.** The media directory needs `AllowOverride All` (or at least
`FileInfo Options`) and `mod_rewrite` enabled. This one line is the entire gate
on Apache.

### My `MEDIA_HTACCESS_ADDONS` rules are not in the generated `.htaccess`

**Cause.** The value is not valid JSON, so it was refused. The boot log says so:

```text
[config] MEDIA_HTACCESS_ADDONS must be a JSON array of strings — ignoring the value.
```

Almost always this is **backslash escaping**. The key holds a JSON array, so every
backslash in an Apache regex has to be doubled:

```ini
# wrong — natural Apache syntax, but invalid JSON
MEDIA_HTACCESS_ADDONS=["RewriteCond %{REMOTE_ADDR} ^10\.0\.","RewriteRule ^ - [L]"]

# right — backslashes doubled for JSON
MEDIA_HTACCESS_ADDONS=["RewriteCond %{REMOTE_ADDR} ^10\\.0\\.","RewriteRule ^ - [L]"]
```

**Fix.** Correct the escaping and restart. Only your addon lines were dropped — the
access gate itself is unaffected and stayed closed, which is the intended failure
direction: a malformed addon must never become half a directive inside a live
`.htaccess` (that would make Apache reject the whole media directory).

### An uploaded image produces no derivative and no thumbnail

**Cause.** ImageMagick is not installed, or its binaries cannot be resolved.

**Fix.**

```shell
command -v magick convert identify
```

Either is fine — the engine probes for `magick` first and falls back to
`convert`/`identify`, which is what Ubuntu 24.04 ships. If they live somewhere
unusual, set `DEDALO_BINARY_BASE`, or the individual keys
(`DEDALO_MAGICK_PATH`, `DEDALO_IDENTIFY_PATH`).

### Video uploads work, but playback does not start until the file has downloaded

**Cause.** `qt-faststart` is missing, so the MP4 index is still at the end of the
file.

**Fix.** Install it (it ships with `ffmpeg` on most distributions) or point at
it: `DEDALO_AV_FASTSTART_PATH=/usr/local/bin/qt-faststart`.

### Unpublishing a record does not take effect

**Cause.** The web server is caching the `stat()` of the publication marker.

**Fix.** `open_file_cache off;` on the media locations (or
`open_file_cache_valid` ≤ 2 s). Behind a CDN, purge the record's media paths on
unpublish — the origin denies immediately, downstream caches do not.
