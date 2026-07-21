# Multiple instances on one server (multi-domain hosting)

> See also: [Production install](production.md) · [Reverse proxy and TLS](reverse_proxy.md) · [Installer reference](installer_reference.md) · [Upgrading](upgrading.md)

One engine process serves **exactly one entity and one database**. It reads its
configuration once, at boot, into a frozen singleton — there is no per-request
switch of entity or database. So hosting several domains on one server does not
mean one bigger process: it means **several independent instances**, each a
complete production install, running side by side behind one shared reverse proxy.

This page is the **delta on top of [Production install](production.md)**, not a
replacement for it. Do that page once per domain; this page tells you the two
things it does not: **what must be unique per instance**, and **how to template
systemd** so each new domain is a single `systemctl enable` away.

!!! info "When you do NOT need this"
    A single installation is already multi-user and multi-project: many users,
    many research projects, one ontology and one database, isolated by
    permissions. That is not multi-instance. Reach for a second instance only when
    you need a **separate domain with its own database, its own media, and its own
    login realm** — a distinct customer, a distinct collection that shares nothing.

## What one instance owns

Two engine processes on one box are safe **only if every row below differs**. The
first five are the real isolation boundary; get any of them wrong and two
instances collide.

| Per instance — must be unique | Why | Where it lives |
| --- | --- | --- |
| `private/` directory | holds `.env` (every secret), the session store `dedalo_ts_sessions.sqlite`, `ts_state.json`, and the backups | `<repo>/../private` by default, or `DEDALO_PRIVATE_DIR` |
| `SERVER_UNIX_SOCKET` | the engine **refuses to boot** if a live instance already answers on the socket; the default `/tmp/dedalo_ts.sock` collides | that instance's `.env` |
| PostgreSQL database + role | the system of record; the installer refuses a non-empty database | `DB_NAME` / `DB_USER` |
| `MEDIA_PATH` | the media tree, and the generated web-server rule files that gate it | that instance's `.env` |
| Linux user + group | the ownership boundary that keeps one instance out of another's secrets and media | you create it |
| `ACTIVE_ONTOLOGY_TLDS` | the ontology domains active in this install | that instance's `.env` |
| systemd service + proxy vhost | one service and one `server{}` + `upstream` per domain | see below |

Two components are **shared and trusted**, one each for the whole box:

- **The reverse proxy** — it terminates TLS for every domain and is the media gate
  for every instance. It must be able to read each instance's socket, client tree
  and media tree (see [the group step](#shared-to-both)).
- **The PostgreSQL cluster** — one server, one database + role per instance. That
  per-database split is the data isolation boundary.

!!! danger "Never point two instances at one `private/` directory"
    They would share the session store, `ts_state.json` and the socket path — a
    silent corruption, not a clean error. One repo clone per instance makes each
    `../private` distinct automatically. If you ever share a single checkout,
    every instance **must** set a distinct `DEDALO_PRIVATE_DIR`.

## The isolation model, stated plainly

Each instance is one long-lived process supervised by systemd, running as **its own
service user**. The security boundary between two domains is therefore ordinary
filesystem ownership: instance A's `.env` is mode `0600` owned by user `ded_a`, and
user `ded_b`'s process cannot read it.

**For separate customers, give each domain its own Linux user and group.** It is
not required for the engine to *run* — one shared service user works when every
domain belongs to the same operator — but a per-customer user is what confines a
compromised process, or a tool that shells out, to that one tenant's files.

## Layout per instance

A home-per-instance layout keeps everything a tenant owns under one tree:

```text
/home/ded_<site>/master_dedalo/    the repo clone            (WorkingDirectory)
/home/ded_<site>/private/          ../private                (.env 0600, sessions, state, backups)
/home/ded_<site>/.bun/bin/bun      the pinned runtime        (per instance → independent upgrades)
/srv/dedalo/<site>/media/          MEDIA_PATH                (own path, often its own volume)
/run/dedalo-<site>/dedalo_ts.sock  the unix socket           (systemd RuntimeDirectory)
user/group: ded_<site>
```

The `/opt/dedalo/…` tree of the [production guide](production.md) is only a default.
A user home works identically — the structural rules are unchanged: the directory
**above** the repo must be writable by the service user (the installer creates
`../private/` there), and the socket, database and media path must be unique.

## 1. One-time host preparation

Do these once for the whole server, not per domain:

- Base packages, the media toolchain, PostgreSQL 18 (server **and** client), nginx
  and certbot — exactly steps 2–4 of [Production install](production.md).
- Install the **systemd template units** from the next section once. The reference
  units in `deploy/` are single-instance; the templates below let one unit file
  drive every domain.

## 2. Systemd template units

A template unit (`name@.service`) is instantiated per domain with `%i` — here, the
site name. Because each domain has its own clone, the engine resolves its own
`../private` from `WorkingDirectory`; no `DEDALO_PRIVATE_DIR` is needed.

`/etc/systemd/system/dedalo-ts@.service`:

```ini
[Unit]
Description=Dedalo TS server (Bun) — %i
After=network.target postgresql.service
Wants=postgresql.service

[Service]
Type=simple
User=ded_%i
Group=ded_%i
WorkingDirectory=/home/ded_%i/master_dedalo
ExecStart=/home/ded_%i/.bun/bin/bun run src/server.ts
RuntimeDirectory=dedalo-%i            # creates /run/dedalo-%i, owned by the service user
RuntimeDirectoryMode=0750
UMask=0007                            # socket srwxrwx--- so the proxy group can connect
Restart=always
RestartSec=3
SuccessExitStatus=75                  # the installer's planned-restart exit code
TimeoutStopSec=30
KillSignal=SIGTERM
StandardOutput=journal
StandardError=journal
SyslogIdentifier=dedalo-%i
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
```

!!! warning "No `EnvironmentFile=`, on purpose"
    The engine reads its own `../private/.env`. Pointing systemd's `EnvironmentFile=`
    at the same file is redundant and actively harmful: systemd's parser mangles the
    raw-JSON values (for example `DEDALO_APPLICATION_LANGS={"lg-spa":"Castellano"}`).
    Set `SERVER_UNIX_SOCKET=/run/dedalo-<site>/dedalo_ts.sock` in each instance's
    `.env` so it matches `RuntimeDirectory=dedalo-%i`.

Template the remaining reference units the same way (`%i` throughout):

| Template unit | Derived from | Key change |
| --- | --- | --- |
| `dedalo-ts-watchdog@.service` + `.timer` | `deploy/dedalo-ts-watchdog.*` | health-check `--unix-socket /run/dedalo-%i/dedalo_ts.sock`; `OnFailure=dedalo-ts-restart@%i.service` |
| `dedalo-ts-restart@.service` | `deploy/dedalo-ts-restart.service` | `ExecStart=/usr/bin/systemctl restart dedalo-ts@%i.service` |
| `dedalo-backup@.service` + `.timer` | `deploy/dedalo-backup.*` | `User=ded_%i`, `EnvironmentFile=/home/ded_%i/private/.env`; it dumps `$DB_NAME` and rsyncs `$MEDIA_PATH` + `/home/ded_%i/private/` |

## 3. Provision a domain

Repeat this block per customer. `SITE` is a short slug (`site1`, `archivo_x`).

```shell
SITE=site1

# Service user and directories
adduser --system --group --home /home/ded_$SITE --shell /usr/sbin/nologin ded_$SITE
mkdir -p /srv/dedalo/$SITE/media
chown ded_$SITE:ded_$SITE /srv/dedalo/$SITE/media

# The pinned runtime, per instance. Read the pin from the repo — do not hardcode.
sudo -u ded_$SITE bash -c \
  'curl -fsSL https://bun.sh/install | BUN_INSTALL=$HOME/.bun bash -s bun-v1.3.9'

# The code
sudo -u ded_$SITE git clone <your-dedalo-remote> /home/ded_$SITE/master_dedalo
cd /home/ded_$SITE/master_dedalo
sudo -u ded_$SITE /home/ded_$SITE/.bun/bin/bun install --frozen-lockfile --production
```

Create this instance's **empty** database and owner role (one per site — see
[Production install](production.md) step 7):

```shell
sudo -u postgres psql <<SQL
CREATE USER dedalo_${SITE} PASSWORD 'a-long-random-password';
CREATE DATABASE dedalo_${SITE} WITH ENCODING='UTF8' OWNER=dedalo_${SITE};
SQL
```

Run the CLI installer as the service user, then append the production block to
this instance's `.env` (see [Production install](production.md) steps 8–9), with
the **unique** values:

```dotenv
SERVER_UNIX_SOCKET=/run/dedalo-site1/dedalo_ts.sock
MEDIA_PATH=/srv/dedalo/site1/media
DEDALO_MEDIA_ACCESS_MODE=publication
ACTIVE_ONTOLOGY_TLDS=dd,rsc,oh,ich,lg,hierarchy
```

Then enable the three timers/services for this instance:

```shell
systemctl enable --now dedalo-ts@site1 \
                       dedalo-ts-watchdog@site1.timer \
                       dedalo-backup@site1.timer
```

## Reverse proxy: one virtual host per domain

Follow [Reverse proxy and TLS](reverse_proxy.md) for the load-bearing details (the
root rule, the media rule files, the timeouts). Per domain you add **one virtual
host**, pointing at **this instance's** socket and `MEDIA_PATH`. Use whichever web
server you already run — nginx and Apache both work.

### nginx

Add one `upstream`, one `server{}`, and the http-scope media map include:

```nginx
# http{} scope — this instance's generated map:
include /srv/dedalo/site1/media/dedalo_media_protection_map.nginx.conf;
upstream dedalo_site1 { server unix:/run/dedalo-site1/dedalo_ts.sock; }

server {
    listen 443 ssl; http2 on;
    server_name site1.example.org;
    ssl_certificate     /etc/letsencrypt/live/site1.example.org/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/site1.example.org/privkey.pem;

    root /srv/dedalo/site1;            # THE ROOT RULE: root + /dedalo/media/… == MEDIA_PATH
    client_max_body_size 300m;

    include /srv/dedalo/site1/media/dedalo_media_protection.nginx.conf;
    open_file_cache off;

    location ~ ^/(api/v1/|dedalo/core/api/) {
        proxy_pass http://dedalo_site1;
        proxy_buffering off;
        proxy_read_timeout 300s;
        proxy_set_header Host            $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
    location /dedalo/lib/                            { proxy_pass http://dedalo_site1; }
    location /dedalo/tools/                          { proxy_pass http://dedalo_site1; }
    location /dedalo/core/tools_common/              { proxy_pass http://dedalo_site1; }
    location = /dedalo/core/component_text_area/tag/ { proxy_pass http://dedalo_site1; }
    location /dedalo/install/import/ontology/        { proxy_pass http://dedalo_site1; }

    location /dedalo/ {
        alias /home/ded_site1/master_dedalo/client/dedalo/;
        etag on;
        add_header Cache-Control "no-cache";
    }
    location = / { return 302 /dedalo/core/page/; }
    location   / { return 404; }
}
```

### Apache

Enable the modules once for the box (`a2enmod ssl headers http2 rewrite proxy
proxy_http`), then add one `<VirtualHost>` per domain. The `ProxyPass` rules must
come **before** the aliases, and `Alias /dedalo/media` before `Alias /dedalo` — the
first match wins. Every path points at **this instance's** socket, media and clone:

```apache
<VirtualHost *:443>
    ServerName site1.example.org
    Protocols h2 http/1.1

    SSLEngine on
    SSLCertificateFile    /etc/letsencrypt/live/site1.example.org/fullchain.pem
    SSLCertificateKeyFile /etc/letsencrypt/live/site1.example.org/privkey.pem
    Include /etc/letsencrypt/options-ssl-apache.conf

    ProxyPreserveHost On
    ProxyTimeout 300                # >= SERVER_IDLE_TIMEOUT_S (255)

    # --- API + dynamic routes → THIS instance's socket -------------------------
    ProxyPass /api/v1/                              unix:/run/dedalo-site1/dedalo_ts.sock|http://localhost/api/v1/
    ProxyPass /dedalo/core/api/                     unix:/run/dedalo-site1/dedalo_ts.sock|http://localhost/dedalo/core/api/
    ProxyPass /dedalo/lib/                          unix:/run/dedalo-site1/dedalo_ts.sock|http://localhost/dedalo/lib/
    ProxyPass /dedalo/tools/                        unix:/run/dedalo-site1/dedalo_ts.sock|http://localhost/dedalo/tools/
    ProxyPass /dedalo/core/tools_common/            unix:/run/dedalo-site1/dedalo_ts.sock|http://localhost/dedalo/core/tools_common/
    ProxyPass /dedalo/core/component_text_area/tag/ unix:/run/dedalo-site1/dedalo_ts.sock|http://localhost/dedalo/core/component_text_area/tag/
    ProxyPass /dedalo/install/import/ontology/      unix:/run/dedalo-site1/dedalo_ts.sock|http://localhost/dedalo/install/import/ontology/

    # --- Media: the generated .htaccess lives inside THIS instance's MEDIA_PATH -
    Alias /dedalo/media /srv/dedalo/site1/media
    <Directory /srv/dedalo/site1/media>
        # WITHOUT AllowOverride the generated .htaccess is ignored — silently, and
        # OPEN. This single line is the whole media gate on Apache.
        AllowOverride All
        Options -Indexes -ExecCGI
        Require all granted
    </Directory>

    # --- Client static files, from THIS instance's clone -----------------------
    Alias /dedalo /home/ded_site1/master_dedalo/client/dedalo
    <Directory /home/ded_site1/master_dedalo/client/dedalo>
        Options -Indexes
        AllowOverride None
        Require all granted
    </Directory>

    Header always set Strict-Transport-Security "max-age=31536000; includeSubDomains"
    Header always set X-Content-Type-Options "nosniff"
    Header always set X-Frame-Options "SAMEORIGIN"
</VirtualHost>
```

### Shared to both

Give the proxy user membership of **each** instance's group so it can connect to
that socket and read that client and media tree — the proxy is the shared gate, so
being in every group is expected:

```shell
usermod -aG ded_site1 www-data     # nginx on RHEL: usermod -aG ded_site1 nginx
systemctl reload apache2           # or: systemctl reload nginx
```

Issue a certificate per domain: `certbot --apache -d site1.example.org` (or
`--nginx`; or one certificate with `-d` repeated).

## Pitfalls specific to running several instances

- **Socket collision.** Never leave `SERVER_UNIX_SOCKET` at its default — two
  instances at `/tmp/dedalo_ts.sock` mean the second refuses to boot. Give each a
  path under its own `RuntimeDirectory`.
- **`DB_POOL_MAX` is per process.** Budget the **sum** across all instances — plus
  each diffusion runner and RAG drain — against PostgreSQL's `max_connections`,
  not each instance in isolation.
- **Both nginx media includes, or none** (nginx). The map file (http scope) defines
  a variable the server-scope file needs; include one without the other and nginx
  refuses to start. This is per instance, so it is easy to half-wire the third
  domain.
- **`AllowOverride All` on every media `<Directory>`** (Apache). Without it that
  instance's generated `.htaccess` is ignored **silently** and its whole media tree
  is world-readable. Easy to forget on the third vhost.
- **Wrong media root reads as a 404.** The proxy path to media must resolve to
  **this instance's** `MEDIA_PATH` (nginx `root + /dedalo/<media dir>/…`; Apache the
  `Alias`). A mismatch 404s every media file while the access gate itself works —
  see [Reverse proxy and TLS](reverse_proxy.md).

## Verify each domain

Run this per instance after enabling it:

- [ ] `curl --fail --unix-socket /run/dedalo-site1/dedalo_ts.sock http://localhost/health`
      → `200` with `"db":"ok"`.
- [ ] `https://site1.example.org/dedalo/core/page/` serves the login form over TLS.
- [ ] Log in, create + save + reload a record; upload an image — the derivative and
      thumbnail appear.
- [ ] `curl -I -H 'Range: bytes=0-99' https://site1.example.org/dedalo/media/image/thumb/<file>.jpg`
      → `206` (proof nothing is in the media byte path).
- [ ] As `ded_site1`, confirm `/home/ded_site2/private/.env` is **not** readable —
      the tenant boundary holds.
- [ ] `systemctl reboot`; every instance, socket and vhost come back on their own.

## Upgrading one domain at a time

Because each instance is its own clone with its own pinned runtime, you upgrade
them **independently**: run the [upgrade procedure](upgrading.md) against one
instance's tree, verify it, then move to the next. Nothing forces every domain
onto the same version at the same moment.
