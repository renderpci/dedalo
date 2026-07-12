# Running Dédalo in containers

> See also: [Installation hub](index.md) · [Production install](production.md) · [Reverse proxy and TLS](reverse_proxy.md) · [Installer reference](installer_reference.md)

The repo ships a `Dockerfile`, a `docker-compose.yml` and the reference proxy
configuration `deploy/nginx.conf`. Together they stand up the same architecture
the [bare-metal guide](production.md) builds — engine on a unix socket,
PostgreSQL behind it, a proxy in front — with four container-specific problems
solved. Read those four first: they are where every container deployment of
Dédalo goes wrong.

## The stack

| Service | Image | Role |
| --- | --- | --- |
| `postgres` | `postgres:18` | the system of record |
| `dedalo` | built from `Dockerfile` (`oven/bun:<pinned>-debian`) | the engine |
| `nginx` | `nginx:alpine` | TCP, TLS, client statics, **the media gate** |
| `mariadb` | `mariadb:11` — profile `diffusion` | the publication target |
| `pgvector` | `pgvector/pgvector:pg18` — profile `rag` | the vector store |

The image is **not** a thin Bun image. It must also carry:

- **a `psql` client that is not older than the PostgreSQL server** (18) — the
  installer, the seed restore, the hierarchy import and the backup widget all
  shell out to it, and an older client refuses to connect to a newer server. The
  Dockerfile adds the PostgreSQL project's repository for exactly this;
- **the media toolchain** (`ffmpeg`, ImageMagick, poppler, `ocrmypdf`) — without
  it, uploads produce no derivatives and no thumbnails.

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

!!! note "nginx will crash-loop until the engine has written the rules"
    `deploy/nginx.conf` `include`s two generated files. They do not exist until
    the engine boots **with a media access mode set** — which is why the compose
    file sets `DEDALO_MEDIA_ACCESS_MODE=publication` by default. Until then nginx
    fails to start and `restart: unless-stopped` retries it. That is the intended
    failure: a half-wired gate must never boot half-open.

    A media mode of *unset* means "no gate": the engine writes no rules, nginx
    never starts, and you must remove the two `include` lines yourself — which
    means deciding, explicitly, to serve your media tree to the world.

    There is also a known defect in the generated nginx rules that stops nginx
    from starting in `publication` mode. It is one edit, and it is documented in
    [reverse proxy](reverse_proxy.md#nginx).

### 4. Installing: one shot, or the wizard

**Path A — the one-shot CLI (recommended).** No wizard, no restart, no pre-auth
window ever exposed:

```shell
export POSTGRES_DB=dedalo_main POSTGRES_USER=dedalo_user POSTGRES_PASSWORD='…'

docker compose build
docker compose up -d postgres

docker compose run --rm \
  -e DEDALO_INSTALL_ROOT_PASSWORD='the-root-password' dedalo \
  bun run scripts/install.ts \
    --db-name "$POSTGRES_DB" --db-user "$POSTGRES_USER" \
    --db-password "$POSTGRES_PASSWORD" --db-host postgres \
    --entity mib --entity-label 'My Institution' \
    --langs lg-spa,lg-eng --app-lang lg-spa --data-lang lg-spa \
    --hierarchies es,lg

docker compose up -d
```

The `postgres` service's `POSTGRES_DB` / `POSTGRES_USER` / `POSTGRES_PASSWORD`
create an **empty database owned by the role** — which is exactly the installer's
precondition. The installer restores *into* it, refuses a non-empty one, and
never creates a database itself. The role owning the database is also what lets
the seed create its extensions.

**Path B — the browser wizard.** Bring the stack up with an **empty `private`
volume**: the engine boots in install mode and serves only the wizard.

- `restart: unless-stopped` is the container equivalent of systemd's
  `Restart=always`, and it is what makes the wizard's *Save config* step work at
  all — the process **exits** after writing `.env` so that it can be restarted
  into the real configuration.
- **Set `DEDALO_INSTALL_ALLOWED_IPS` before you publish port 443.** Until the
  instance is sealed, the install surface is reachable **without a login**.

    ```yaml
    environment:
      DEDALO_INSTALL_ALLOWED_IPS: "203.0.113.10"
    ```

    !!! warning "`loopback` will not match behind the proxy"
        The address is resolved from the trusted `X-Forwarded-For` hop, so behind
        the nginx container the caller is never the loopback address. Name the
        real client address, or use Path A.

## Configuration

Process environment wins over `/private/.env`, so the compose file is the right
place for **operations** keys (pool sizes, timeouts, the access log, the media
mode) and the installer owns the rest inside the volume.

!!! warning "Do not create a `.env` at the repo root"
    Compose would read it for variable substitution — but so would the engine's
    own configuration loader, from the container's working directory. Export the
    variables in your shell, or pass `docker compose --env-file <somewhere-else>`.

## TLS

`deploy/nginx.conf` expects a certificate at
`/etc/letsencrypt/live/dedalo.example.org/`. The compose file bind-mounts
`./deploy/certs` there.

- **Real deployment:** bind-mount your certbot tree instead, and change the
  `server_name` and the certificate paths in `deploy/nginx.conf`.
- **Local trial:** drop a self-signed pair in `deploy/certs/`.

    ```shell
    mkdir -p deploy/certs
    openssl req -x509 -newkey rsa:2048 -nodes -days 365 \
      -keyout deploy/certs/privkey.pem -out deploy/certs/fullchain.pem \
      -subj "/CN=localhost"
    ```

TLS is not optional even locally: `SESSION_COOKIE_SECURE` defaults to `true`, so
over plain HTTP the browser discards the session cookie and **nobody can log in**.

## Backups from a container

The [four stores](production.md#14-backups) do not change; only the way you reach
them does.

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
