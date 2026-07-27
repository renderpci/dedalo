# Running Dédalo in containers

> See also: [Installation hub](index.md) · [Simple install](quickstart.md) · [Production install](production.md) · [Reverse proxy and TLS](reverse_proxy.md) · [Installer reference](installer_reference.md) · [Troubleshooting](troubleshooting.md)

!!! tip "Want it in one command instead?"
    [Simple install](quickstart.md) brings up a complete instance with
    `./install.sh` or a single `docker compose up -d`, using
    `docker-compose.simple.yml`. It trades away TLS and media access control to
    get there, so it suits a machine on your own network only. This page is the
    full stack, and it is what a public server needs.

The repo ships a `Dockerfile`, a `docker-compose.yml` and the reference proxy
configuration `deploy/nginx.conf`. Together they stand up the same architecture
the [bare-metal guide](production.md) builds — engine on a unix socket,
PostgreSQL behind it, a proxy in front — with four container-specific problems
solved.

This page is the whole procedure: what the files are, how to check your Docker,
the install itself — by [CLI](#path-a-install-with-the-one-shot-cli) or by
[browser wizard](#path-b-install-with-the-browser-wizard) — and how to verify it.
Read [the four problems](#the-four-container-problems) first if you plan to
change anything in the compose file: they are where every container deployment of
Dédalo goes wrong.

## The files, and where they live

Everything is in the repo, at its root. **Every command on this page runs from
the directory that holds `docker-compose.yml`** — the `master_dedalo` checkout.

| Path | What it is | Do you edit it? |
| --- | --- | --- |
| `Dockerfile` | the engine image: pinned Bun, `psql` 18, the media toolchain | only to change the runtime pin |
| `docker-compose.yml` | the stack: services, volumes, ops environment | **yes** — it is your deployment's configuration |
| `.dockerignore` | keeps host artefacts (`node_modules`, `private`, `media`) out of the build context | no |
| `deploy/nginx.conf` | the reference proxy config, bind-mounted into the `nginx` container | **yes** — domain, certificate paths, the two `include` lines |
| `deploy/certs/` | your TLS certificate and key. **Does not exist in a fresh clone — you create it** | **yes** |
| `.bun-version` | the runtime pin. The `Dockerfile` base tag must match it | no |
| `scripts/install.ts` | the headless installer, run **once**, inside the container | no |
| `client/` | the browser client, bind-mounted read-only into `nginx` | no |

There is no build step and no dependency-fetch step for the client: a clone is
self-contained, and the engine runs TypeScript directly.

## The stack

| Service | Image | Role |
| --- | --- | --- |
| `postgres` | `postgres:18` | the system of record |
| `dedalo` | built from `Dockerfile` (`oven/bun:<pinned>-debian`) | the engine |
| `nginx` | `nginx:alpine` | TCP, TLS, client statics, **the media gate** |
| `mariadb` | `mariadb:11` — profile `diffusion` | the publication target |
| `pgvector` | `pgvector/pgvector:pg18` — profile `rag` | the vector store |

The two optional services are behind compose profiles, so they do **not** start
unless you ask for them:

```shell
docker compose --profile diffusion up -d      # MariaDB publication target
docker compose --profile rag up -d            # pgvector store
```

The image is **not** a thin Bun image. It must also carry:

- **a `psql` client that is not older than the PostgreSQL server** (18) — the
  installer, the seed restore, the hierarchy import and the backup widget all
  shell out to it, and an older client refuses to connect to a newer server. The
  Dockerfile adds the PostgreSQL project's repository for exactly this;
- **the media toolchain** (`ffmpeg`, ImageMagick, poppler, `ocrmypdf`) — without
  it, uploads produce no derivatives and no thumbnails.

Both are why the build is slow and the image is large. That is the correct
trade: an image without them installs, then fails at the first upload.

## Before you start

### Check your Docker

```shell
docker --version                 # Docker Engine
docker compose version           # v2 or newer
docker info                      # daemon reachable? errors here = daemon not running
docker run --rm hello-world      # end-to-end smoke test: pull + run
```

- **Compose v2 or newer.** Every command here is `docker compose` — the Compose
  **plugin**, a subcommand of `docker`. What does not work is the legacy
  standalone `docker-compose` **v1** binary: the compose file uses service
  profiles and health-gated `depends_on`. Any major from 2 upwards is fine, so
  read the version as a floor, not as a match.
- **The daemon must be running.** `docker info` failing with *cannot connect to
  the Docker daemon* means the service is stopped (`systemctl start docker`) or
  your user is not in the `docker` group.
- **Docker Desktop (macOS/Windows):** the checkout must be inside a shared path,
  or the bind mounts of `deploy/nginx.conf` and `client/` arrive empty. Fine for
  evaluation; for production use Linux — see the note in the
  [installation hub](index.md).

### Check the host

```shell
ss -tlnp | grep -E ':(80|443)\b'    # both must be FREE — the proxy publishes them
docker system df                    # room for the image and the volumes?
df -h /var/lib/docker
```

- **Ports 80 and 443 must be free.** A host web server already listening there
  is the single most common `docker compose up` failure. Stop it, or put Dédalo
  behind it (see [reverse proxy](reverse_proxy.md)).
- **Size the disk for the media, not for the records.** The `media` volume holds
  the originals *and* every derivative, and it is the thing that grows. On a
  real deployment, back it with a volume driver or a bind mount on the large
  filesystem — a default named volume lives under `/var/lib/docker`.
- **Time and locale are the container's, not the host's.** The installer's
  `--timezone` is what stamps every database timestamp; set it deliberately.

## The four container problems

### 1. `../private/` has no parent to live in

Dédalo keeps every secret in a `private/` directory that is a **sibling of the
repo**. Inside an image there is no writable parent directory above the code.

**Solved by `DEDALO_PRIVATE_DIR=/private`** on a named volume. Both the
configuration **read** side and the installer **write** side honour that
variable, so the whole tree moves together — `.env`, the session store,
`ts_state.json`, the backups.

!!! danger "No volume, no secrets"
    Without a volume at `/private`, the `.env` the installer writes dies with the
    container, and the next start comes up in install mode against a database
    that is no longer empty — an install you cannot finish and cannot repeat.

### 2. The socket is invisible across containers

Production serving is socket-only, and the default socket path (`/tmp/…`) lives
in the container's **private** `/tmp`. The proxy container cannot see it.

**Solved by relocating the socket to a shared volume:**

```yaml
environment:
  SERVER_UNIX_SOCKET: /run/dedalo/dedalo_ts.sock
volumes:
  - socket:/run/dedalo        # mounted in the proxy container too
```

!!! warning "Socket permissions are the number-one cause of a 502"
    Connecting to a unix socket requires **write** permission on the socket file.
    With the default umask the engine creates it owner-writable only, and the
    proxy container runs as a different user. The image's entrypoint therefore
    starts the server under `umask 0000`; the socket volume is shared with the
    proxy and with nothing else.

??? tip "The escape hatch: `SERVER_TCP_PORT`"
    You can set `SERVER_TCP_PORT` and have the proxy talk to `dedalo:3600` over
    the internal network instead. It works, and it costs you production parity.
    If you do it: **never add a `ports:` mapping for it.** A published TCP port
    bypasses the proxy — and with it, TLS *and* the entire media access gate.

### 3. The engine writes the media rules; the proxy reads them

Media access control is enforced by the **web server**, using rule files the
**engine generates** into `MEDIA_PATH`. So both containers must mount the same
media volume:

```yaml
dedalo:
  volumes: [ media:/srv/dedalo/media ]        # writes the rules + the marker store
nginx:
  volumes: [ media:/srv/dedalo/media:ro ]     # reads them, and serves the bytes
```

!!! note "The gate is wired in two moves, and the shipped config is the safe one"
    `deploy/nginx.conf` needs two `include`s of generated files — one at `http{}`
    scope (the cookie-sanitising `map`), one inside the media `server{}`. Those
    files do not exist until the engine has booted **with a media access mode
    set**, which is why the compose file sets
    `DEDALO_MEDIA_ACCESS_MODE=publication` by default.

    The config therefore ships with **both lines commented out**: nginx starts,
    and `/dedalo/media/` simply 404s — media is not served at all, which is the
    safe failure. You uncomment both after the engine's first boot ([step
    10](#step-10-turn-the-media-gate-on)). **Both or neither**: the server-scope
    file uses a variable the `map` defines, so including one without the other
    makes nginx refuse to start.

    A media mode of *unset* means "no gate": the engine writes no rules, the
    includes stay commented forever, and you are serving your media tree to the
    world by decision rather than by accident.

### 4. Installing: one shot, or the wizard

Two front ends drive the same install engine. Pick one **before** you bring the
stack up, because they diverge at the very first `docker compose up`.

| | [Path A — the one-shot CLI](#path-a-install-with-the-one-shot-cli) | [Path B — the browser wizard](#path-b-install-with-the-browser-wizard) |
| --- | --- | --- |
| Install runs in | a throwaway `docker compose run` container | the long-lived `dedalo` service |
| Restart mid-install | none | **yes** — the engine exits after *Save config* |
| Pre-auth window on the network | never opened | open until you press *Finish* |
| Good for | servers, orchestration, anything repeatable | a first look, or when you want the diagnostics panel |

**Path A is the recommendation for anything reachable from a network.** It never
serves the install surface at all. Path B is the same engine with a UI in front,
and it needs one extra precaution — the pre-auth window — plus a supervisor,
which in compose is `restart: unless-stopped`.

## Path A — install with the one-shot CLI

Start to finish. Steps 1–11 are the install; step 12 is the first login.

### Step 1 — Get the source

```shell
git clone <your-dedalo-remote> dedalo
cd dedalo/master_dedalo
ls docker-compose.yml Dockerfile deploy/nginx.conf     # you are in the right place
```

### Step 2 — Choose the database credentials

The `postgres` service reads three variables. `POSTGRES_PASSWORD` has no default
and compose **refuses to start without it** — that is deliberate.

```shell
export POSTGRES_DB=dedalo_main
export POSTGRES_USER=dedalo_user
export POSTGRES_PASSWORD='a-long-random-password'
```

!!! warning "Do not create a `.env` at the repo root"
    Compose would read it for variable substitution — but so would the engine's
    own configuration loader, from the container's working directory. Export the
    variables in your shell, or keep them in a file elsewhere and pass
    `docker compose --env-file <somewhere-else> …` to **every** command below.

### Step 3 — Set your domain and the ops keys

Two edits, both in files you own:

1. `deploy/nginx.conf` — replace `dedalo.example.org` in the two `server_name`
   lines. Leave it in the two certificate paths for now, or change the compose
   file's `./deploy/certs:/etc/letsencrypt/live/dedalo.example.org:ro` mount to
   match — the path in the config and the mount target must agree.
2. `docker-compose.yml` — the `dedalo` service's `environment:` block is your
   ops surface: pool sizes, timeouts, the access log, the media mode. Leave
   `DEDALO_PRIVATE_DIR`, `SERVER_UNIX_SOCKET` and `MEDIA_PATH` alone unless you
   have read [the four problems](#the-four-container-problems).

### Step 4 — Provide a TLS certificate

nginx will not start without one, and neither will a login work over plain HTTP
(see [TLS](#tls)). For a local trial, a self-signed pair is enough:

```shell
mkdir -p deploy/certs
openssl req -x509 -newkey rsa:2048 -nodes -days 365 \
  -keyout deploy/certs/privkey.pem -out deploy/certs/fullchain.pem \
  -subj "/CN=localhost"
```

For a real deployment, bind-mount your certbot tree instead — [TLS](#tls) below.

### Step 5 — Build the image

```shell
docker compose build
```

Slow the first time: the media toolchain and the PostgreSQL client are a large
apt transaction. Re-builds after a source change reuse the dependency layer.

??? tip "Check the runtime pin if the build behaves oddly"
    ```shell
    cat .bun-version
    grep '^FROM' Dockerfile
    ```
    The two must agree. The engine also warns loudly at boot when they do not.

### Step 6 — Start the database alone

```shell
docker compose up -d postgres
docker compose ps          # wait for postgres → healthy
```

This creates an **empty database owned by the role**, which is exactly the
installer's precondition: it restores *into* a database, refuses a non-empty
one, and never creates one itself. The role owning the database is also what
lets the seed create its extensions.

### Step 7 — Run the installer, once

```shell
docker compose run --rm \
  -e DEDALO_INSTALL_ROOT_PASSWORD='the-root-password' dedalo \
  bun run scripts/install.ts \
    --db-name "$POSTGRES_DB" --db-user "$POSTGRES_USER" \
    --db-password "$POSTGRES_PASSWORD" --db-host postgres \
    --entity mib --entity-label 'My Institution' \
    --locale es-ES --timezone Europe/Madrid \
    --langs lg-spa,lg-eng --app-lang lg-spa --data-lang lg-spa \
    --hierarchies es,lg \
    --media-path /srv/dedalo/media \
    --socket /run/dedalo/dedalo_ts.sock \
    --media-access-mode publication
```

What each part is doing:

- `run --rm` runs a **one-off** container from the `dedalo` service definition,
  so it inherits the same volumes (`/private`, the media tree) and the same
  environment. The install therefore lands on the volumes the long-lived service
  will use, and the container is discarded.
- `--db-host postgres` is the compose **service name** — the engine reaches the
  database over the internal network, not over a published port.
- The root password goes in the **environment**, never in argv: an argv is
  visible in `ps` and lands in your shell history.
- `--media-path`, `--socket` and `--media-access-mode` are persisted into
  `/private/.env`, so the file describes the deployment on its own. The compose
  environment sets the same three at runtime and wins either way — passing them
  keeps the two in agreement.
- `--hierarchies` both **imports and activates** each thesaurus. Skip it and you
  can [install hierarchies later](../management/install_new_hierarchies.md).

Every flag is in the [installer reference](installer_reference.md). The run ends
by verifying an actual root login — if it prints success, the instance is real.

!!! danger "This step is not repeatable"
    The seed restore refuses a non-empty database. If the install fails halfway,
    do not re-run it against the same volumes: destroy them
    (`docker compose down -v` — **this deletes the data**) and start from step 6.

### Step 8 — Start the whole stack

```shell
docker compose up -d
docker compose ps
```

`postgres` and `dedalo` should report *healthy*. `nginx` has no healthcheck —
check it with `docker compose logs nginx`.

### Step 9 — Confirm the engine answers

```shell
docker compose exec dedalo curl --fail --unix-socket /run/dedalo/dedalo_ts.sock \
  http://localhost/health                       # {"result":"ok","db":"ok"}
curl -k -I https://localhost/dedalo/core/page/  # 200 through the proxy
```

A 502 here is almost always the socket permissions ([problem
2](#2-the-socket-is-invisible-across-containers)); a connection refused is nginx
crash-looping — read its log.

### Step 10 — Turn the media gate on

The engine wrote the rule files on its first boot. Check, then wire them in:

```shell
docker compose exec dedalo ls -l /srv/dedalo/media/dedalo_media_protection.nginx.conf \
                                /srv/dedalo/media/dedalo_media_protection_map.nginx.conf
```

Both present? Uncomment **both** `include` lines in `deploy/nginx.conf` (the
`map` one at `http{}` scope near the top, the media one inside the `server{}`),
then reload:

```shell
docker compose exec nginx nginx -t          # syntax + the includes resolve
docker compose exec nginx nginx -s reload
```

The file is bind-mounted, so the edit is visible to the container immediately —
no rebuild.

!!! warning "Known defect: quote the rule-B location regex"
    In `publication` mode the generated file emits one **unquoted** regex
    containing `{2,12}`, which nginx's lexer truncates — `nginx -t` fails with
    `pcre2_compile() failed`. It is one edit, documented in
    [reverse proxy](reverse_proxy.md#nginx). The generated file is only rewritten
    when its embedded `# config-hash:` line stops matching, and quoting does not
    change the hash, so the fix survives.

### Step 11 — Prove media is actually served

Upload a file through the interface, then request it. A `404` on a file you can
see in the record means the proxy `root` and `MEDIA_PATH` disagree — the root
rule is documented at the top of `deploy/nginx.conf`, and the gate itself still
looks healthy when this is wrong, which is what makes it confusing.

### Step 12 — Log in and seal the deployment

1. Open `https://<your-domain>/dedalo/core/page/` and log in as `root`.
2. Create an **admin user**; keep `root` for emergencies.
3. Continue with [after the install](index.md#after-the-install): users and
   projects, hierarchies, and **backups**.

## Path B — install with the browser wizard

Same engine, driven from a browser. It replaces Path A's steps 6–7 only:
**steps 1–5 are identical** (source, credentials, domain, TLS, build), and once
the wizard says *Finish* you rejoin Path A at [step
10](#step-10-turn-the-media-gate-on).

The wizard's own screens — Diagnostics, Database, Entity, Diffusion, Outbound
email, Save config, Verify, Directories, Install database, Root password,
Hierarchies, Tools, Finish — are documented once, in the [installer
reference](installer_reference.md#the-browser-wizard). What follows is only what
containers change.

### B1 — Close the pre-auth window first

A fresh instance has no users, so **every install action is reachable without a
login** until you press *Finish*. Path A never opens that window; Path B does,
and `docker compose up` publishes ports 80 and 443 in the same breath. So set the
allowlist in the `dedalo` service's `environment:` **before** the stack ever
comes up:

```yaml
environment:
  DEDALO_INSTALL_ALLOWED_IPS: "203.0.113.10"     # the address YOU will browse from
```

!!! warning "`loopback` will not match behind the proxy"
    The address is resolved from the trusted `X-Forwarded-For` hop — and the
    compose file sets `TRUSTED_PROXY_HOPS: "1"` for exactly this — so behind the
    nginx container the caller is never the loopback address. Naming `loopback`
    locks **you** out while leaving nobody else out. Name the real client
    address.

    Unset the key entirely and the surface is **open** — that is the development
    default, and it is the wrong choice for anything with a public port.

### B2 — Bring the stack up on an empty `private` volume

Install mode is not a flag; it is the **absence of `/private/.env`**. So this
only works on a first run, or after you have destroyed the volume.

```shell
docker compose up -d
docker compose logs dedalo | grep 'INSTALL MODE'
```

You want to see the engine announce it:

```text
[boot] INSTALL MODE — no database configured yet (../private/.env absent).
Serving the install wizard at /dedalo/core/page/.
```

No such line means `.env` already exists and you are looking at a normal boot —
the wizard will not appear. Check with
`docker compose exec dedalo cat /private/.env`.

In install mode the engine skips every database-dependent boot step, so
`postgres` starting healthy is all the database needs to do at this point.

### B3 — Run the wizard, with the container's answers

Open `https://<your-domain>/dedalo/core/page/`. Three fields are
container-specific:

| Wizard field | What to enter | Why |
| --- | --- | --- |
| Database **host** | `postgres` | the compose **service name**. `localhost` is the engine's own container and there is no database in it |
| Database **name** / **user** / **password** | your `POSTGRES_DB` / `POSTGRES_USER` / `POSTGRES_PASSWORD` | the `postgres` service already created exactly this, empty and owned by the role |
| Port | `5432` | the internal network port — it is not published, and does not need to be |

!!! warning "The compose environment overrides what you type"
    Process environment wins over `/private/.env`. The compose file already sets
    `MEDIA_PATH`, `SERVER_UNIX_SOCKET` and `DEDALO_MEDIA_ACCESS_MODE`, so
    whatever the wizard writes for those three, **the compose values are what the
    engine runs with**. Change them in `docker-compose.yml`, not in the wizard —
    otherwise `.env` and the running configuration disagree, which is a debugging
    trap rather than a failure.

### B4 — Survive the restart at *Save config*

Configuration is read once, at boot. So *Save config* writes `.env` and then
**exits the process** — deliberately, so it can come back with the real
configuration. `restart: unless-stopped` is what brings it back; it is the
compose equivalent of systemd's `Restart=always`, and it restarts on the planned
exit code the same way it restarts on a crash.

```shell
docker compose logs -f dedalo      # watch it exit and come straight back
```

Leave the browser tab open. The wizard survives the restart: the **Verify**
button retries, and even a full page reload resumes the wizard rather than
dropping to a login form. The state that makes this work is `install_status` in
`/private/ts_state.json`.

!!! danger "A container that does not come back was never supervised"
    If you removed `restart: unless-stopped`, the engine exits at *Save config*
    and stays down — the install hangs there with `.env` written and nothing
    serving. Restore the policy and `docker compose up -d`; the wizard resumes.

### B5 — Finish, and confirm the surface is sealed

Work through Verify → Directories → Install database → Root password → log in →
Hierarchies → Tools → **Finish**. *Finish* is refused unless a root user with a
password actually exists, so a half-built instance cannot be sealed.

Once sealed, the whole install surface answers `404` permanently, and
`DEDALO_INSTALL_ALLOWED_IPS` has no further job — you can leave it or drop it.

```shell
docker compose exec dedalo cat /private/ts_state.json   # install_status: "sealed"
```

### B6 — Rejoin Path A

The engine has now booted with a media access mode and written its rule files.
Continue at [step 10 — turn the media gate on](#step-10-turn-the-media-gate-on),
then [step 11](#step-11-prove-media-is-actually-served). Media is **not served**
until you do: the `include` lines are still commented out.

## Configuration

Process environment wins over `/private/.env`, so the compose file is the right
place for **operations** keys (pool sizes, timeouts, the access log, the media
mode) and the installer owns the rest inside the volume. The full key catalogue
is the [configuration reference](../config/index.md).

To read what the installer actually wrote:

```shell
docker compose exec dedalo cat /private/.env
```

## TLS

`deploy/nginx.conf` expects a certificate at
`/etc/letsencrypt/live/dedalo.example.org/`. The compose file bind-mounts
`./deploy/certs` there.

- **Real deployment:** bind-mount your certbot tree instead, and change the
  `server_name` and the certificate paths in `deploy/nginx.conf`. Renewal
  happens on the host; reload the proxy afterwards
  (`docker compose exec nginx nginx -s reload`).
- **Local trial:** the self-signed pair from [step 4](#step-4-provide-a-tls-certificate).

TLS is not optional even locally: `SESSION_COOKIE_SECURE` defaults to `true`, so
over plain HTTP the browser discards the session cookie and **nobody can log in**.

## Day-to-day operation

```shell
docker compose logs -f dedalo        # follow the engine
docker compose restart dedalo        # after an ops env change
docker compose exec dedalo bash      # a shell in the engine container
docker compose stop                  # stop, keep the data
docker compose down                  # remove containers, KEEP the volumes
docker compose down -v               # remove the volumes too — DESTROYS the instance
```

A configuration change in `docker-compose.yml` needs `docker compose up -d`
(recreate), not `restart` — `restart` reuses the existing container and its
old environment.

## Backups from a container

The [four stores](production.md#13-backups) do not change; only the way you reach
them does. Volume names are prefixed with the compose project name (`dedalo`, set
by `name:` in the compose file) — confirm with `docker volume ls`.

```shell
# 1. The matrix database.
docker compose exec -T postgres \
  pg_dump -F c -b -U "$POSTGRES_USER" "$POSTGRES_DB" > backup_$(date +%F).custom

# 2. The RAG vector database (profile `rag`), if enabled — same shape.

# 3. The media ORIGINALS. The `original` quality is the source of truth every
#    derivative is rebuilt from; derivatives need no backup.
docker run --rm -v dedalo_media:/media -v "$PWD:/out" alpine \
  tar czf /out/media_$(date +%F).tgz -C /media .

# 4. The private volume — .env secrets, session store, ts_state.json. Small, and
#    without it a restored database is an instance you cannot start.
docker run --rm -v dedalo_private:/private -v "$PWD:/out" alpine \
  tar czf /out/private_$(date +%F).tgz -C /private .
```

!!! warning "A backup that has never been restored is a hypothesis"
    Restore-test into a scratch stack at least quarterly.

## Upgrading

```shell
git pull
docker compose build
docker compose up -d
```

- **Boot migrations run automatically** when the engine starts. There is no
  separate migrate step.
- **The seed is never re-applied.** The restore refuses a non-empty database, and
  after the first install the database is not empty. An upgrade cannot clobber
  your data by re-running the installer.
- **Check the runtime pin.** The `Dockerfile`'s base tag and the repo's
  `.bun-version` must agree; the engine warns loudly at boot when they do not.

The full upgrade procedure, including rollback, is in [upgrading](upgrading.md).

## Verify

```shell
docker compose ps                       # every service healthy
docker compose exec dedalo curl --fail --unix-socket /run/dedalo/dedalo_ts.sock \
  http://localhost/health               # {"result":"ok","db":"ok"}
curl -k -I https://localhost/dedalo/core/page/
docker compose logs -f dedalo
```

## When it does not work

Container-specific symptoms; everything else is in
[troubleshooting](troubleshooting.md).

| Symptom | Cause | Fix |
| --- | --- | --- |
| `POSTGRES_PASSWORD` error before anything starts | the variable is not exported | [step 2](#step-2-choose-the-database-credentials) |
| Every request is a **502** | the proxy cannot write to the socket | the socket volume must be shared, and the engine started under `umask 0000` — [problem 2](#2-the-socket-is-invisible-across-containers) |
| `nginx` restarts forever | missing certificate, or one `include` uncommented without the other | [step 4](#step-4-provide-a-tls-certificate), [step 10](#step-10-turn-the-media-gate-on) |
| `nginx -t`: `pcre2_compile() failed` | the unquoted rule-B regex | quote it — [step 10](#step-10-turn-the-media-gate-on) |
| The wizard appears after a successful install | `/private` is not on a volume, so `.env` was lost | [problem 1](#1-private-has-no-parent-to-live-in) |
| The wizard never appears — normal login instead | `/private/.env` already exists, so the engine is not in install mode | [B2](#b2-bring-the-stack-up-on-an-empty-private-volume) |
| The install surface 404s from your browser | your address is not in `DEDALO_INSTALL_ALLOWED_IPS`, or you named `loopback` | [B1](#b1-close-the-pre-auth-window-first) |
| The wizard hangs at *Save config*, engine down | no restart policy — the engine exits there by design | [B4](#b4-survive-the-restart-at-save-config) |
| Every media file 404s, gate looks healthy | proxy `root` and `MEDIA_PATH` disagree | the root rule at the top of `deploy/nginx.conf` |
| Uploads fail with **413** | `client_max_body_size` | already 300m in the shipped config — check you did not replace it |
| Login "succeeds" but bounces back to the form | plain HTTP, and `SESSION_COOKIE_SECURE` is on | [TLS](#tls) |
