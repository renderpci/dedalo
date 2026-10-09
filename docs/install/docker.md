# Running Dédalo in containers

> See also: [Installation hub](index.md) · [Simple install](quickstart.md) · [Production install](production.md) · [Reverse proxy and TLS](reverse_proxy.md) · [Installer reference](installer_reference.md) · [Troubleshooting](troubleshooting.md)

!!! tip "Want it in one command instead?"
    [Simple install](quickstart.md) brings up a complete instance with
    `./install.sh`, using `docker-compose.simple.yml` — HTTPS included, via
    Let's Encrypt or a local certificate authority. The one thing it does not set
    up is **media access control**, so it suits a collection that is public
    anyway or an internal instance. This page is the full stack: the same
    architecture plus the engine-enforced media gate.

The repo ships a `Dockerfile`, a `docker-compose.yml` and the reference proxy
configuration `deploy/nginx.conf`. Together they stand up the same architecture
the [bare-metal guide](production.md) builds — engine on a unix socket,
PostgreSQL behind it, a proxy in front — with four container-specific problems
solved.

This page is the whole procedure: what the files are, [where the image comes
from](#choose-where-the-image-comes-from), how to check your Docker, the install
itself — by [CLI](#path-a-install-with-the-one-shot-cli) or by [browser
wizard](#path-b-install-with-the-browser-wizard) — how to verify it, and how to
[update it](#upgrading).
Read [the four problems](#the-four-container-problems) first if you plan to
change anything in the compose file: they are where every container deployment of
Dédalo goes wrong.

## The files, and where they live

Everything is in the repo, at its root. **Every command on this page runs from
the directory that holds `docker-compose.yml`** — the `master_dedalo` checkout.

| Path | What it is | Do you edit it? |
| --- | --- | --- |
| `Dockerfile` | the engine image: pinned Bun, `psql` 18, the media toolchain. Dédalo publishes it built and signed ([where the image comes from](#choose-where-the-image-comes-from)); you build from it only if you choose to | only to change the runtime pin |
| `docker-compose.yml` | the stack: services, volumes, ops environment. It names the engine image as `${DEDALO_IMAGE}:${DEDALO_VERSION}` and never builds it | **yes** — it is your deployment's configuration |
| `deploy/compose.build.yml` | the build override: add `-f deploy/compose.build.yml` to build the image here, from this checkout, instead of pulling it | no |
| `.dedalo.env` | the stack's own environment, read by compose (`--env-file .dedalo.env`) and by the host tools: the database credentials and [where the image comes from](#the-dedaloenv-keys). **You write it** in [step 2](#step-2-choose-the-database-credentials) and [step 5](#step-5-get-the-image) (on the simple stack `./install.sh` writes it). Never committed, never inside the image | **yes** — once; afterwards only the image updater changes it, and only `DEDALO_VERSION` |
| `deploy/dedalo-image-update.sh` | the code update of a container install: backup, new image, health check, automatic rollback — [upgrading](#upgrading) | no — you run it |
| `deploy/dedalo-image-updater.sh` | the optional host updater, which runs the update the code-update panel requested — [the host updater](#the-host-updater-optional) | no — you install it, if you want it |
| `.dockerignore` | the build-context policy: the whole root is denied, only the tracked entries the image needs are let back in, and secret-shaped names are denied at every depth. **Generated** — `bun run context:gen` | no |
| `deploy/nginx.conf` | the reference proxy config, bind-mounted into the `nginx` container | **yes** — domain, certificate paths, the two `include` lines |
| `deploy/certs/` | your TLS certificate and key. **Does not exist in a fresh clone — `deploy/dedalo-tls-rotate.sh` creates it.** Never committed, and never inside the image: `deploy/` is excluded from the build context, and nothing in a container reads it | **yes** |
| `.bun-version` | the runtime pin. The `Dockerfile` base tag must match it | no |
| `scripts/install.ts` | the headless installer, run **once**, inside the container | no |
| `client/` | the browser client's source. The image carries its own copy, and the engine **publishes** that copy into the `client` volume every time it starts; `nginx` serves it from there, never from your checkout | no |

There is no build step and no dependency-fetch step for the client: the engine
runs TypeScript directly, and the client it publishes is the one of the image it
runs. That is the point of publishing it: the browser client and the engine speak
an exact protocol, so a client from a different version — a checkout at one
release behind an image of the next — breaks pages in ways that look like engine
bugs. With the client in the image, they always change together.

### Two places: your host and the containers

Every path on this page lives in one of two places, and confusing them is the
most common way a first install goes wrong.

| Where | Paths | How you reach them |
| --- | --- | --- |
| **The host** — your checkout | `docker-compose.yml`, `.dedalo.env`, `deploy/nginx.conf`, `deploy/certs/` | an ordinary editor, from the checkout directory (`cd …/master_dedalo`) |
| **Inside the containers** — Docker volumes | `/srv/dedalo/media`, `/private`, `/backups`, `/run/dedalo`, `/srv/dedalo/client` | `docker compose --env-file .dedalo.env exec <service> …` only |

- `/srv/dedalo/` **does not exist on the host**, and it should not. When
  `deploy/nginx.conf` says `include /srv/dedalo/media/…`, that is a path *inside
  the nginx container*. You only edit the line on the host; nginx resolves it in
  the container.
- To look inside a volume, go through a container:
  `docker compose --env-file .dedalo.env exec nginx ls -l /srv/dedalo/media/`. The raw volume data sits
  under `/var/lib/docker/volumes/dedalo_media/_data/` (root only) — never edit
  it there.
- **Every `nginx` command goes through the container**:
  `docker compose --env-file .dedalo.env exec nginx nginx -t`. A plain `nginx -t` tests the *host's*
  nginx, if it has one — a different server with a different configuration.
  `open() "/run/nginx.pid" failed (13: Permission denied)` is the tell: you are
  talking to the host's nginx.
- Not sure where the checkout is? `docker compose ls` prints the full path of
  every running stack's compose file.

## The stack

| Service | Image | Role |
| --- | --- | --- |
| `postgres` | `postgres:18` | the system of record |
| `dedalo` | `${DEDALO_IMAGE}:${DEDALO_VERSION}` — a published image, or one built here from `Dockerfile` (`oven/bun:<pinned>-debian`) | the engine; publishes its client into the `client` volume at every start |
| `backup` | the same image as `dedalo` | the scheduled backups ([backups](#backups-from-a-container)) |
| `nginx` | `nginx:alpine` | TCP, TLS, client statics (from the `client` volume), **the media gate** |
| `mariadb` | `mariadb:11` — profile `diffusion` | the publication target |
| `pgvector` | `pgvector/pgvector:pg18` — profile `rag` | the vector store |

The two optional services are behind compose profiles, so they do **not** start
unless you ask for them:

```shell
docker compose --env-file .dedalo.env --profile diffusion up -d      # MariaDB publication target
docker compose --env-file .dedalo.env --profile rag up -d            # pgvector store
```

The image is **not** a thin Bun image. It must also carry:

- **a `psql` client that is not older than the PostgreSQL server** (18) — the
  installer, the seed restore, the hierarchy import and the backup widget all
  shell out to it, and an older client refuses to connect to a newer server. The
  Dockerfile adds the PostgreSQL project's repository for exactly this;
- **the media toolchain** (`ffmpeg`, ImageMagick, poppler, `ocrmypdf`) — without
  it, uploads produce no derivatives and no thumbnails.

Both are why the image is large and a local build is slow. That is the correct
trade: an image without them installs, then fails at the first upload.

## Choose where the image comes from

Dédalo publishes the engine image — built once per release, signed, and identical
byte for byte wherever it is published — to its own registry and to two public
mirrors. You choose where your installation takes it from, and that choice is
recorded in `.dedalo.env`: every later update comes from the same place.

| Your choice | What happens | Good for |
| --- | --- | --- |
| **One of Dédalo's registries** (below) | the stack **pulls** the published image; with `cosign` on the host, its signature is checked first | almost every installation — no build on your server |
| **A registry of your own** | you mirror the published image into it; the stack pulls from there | an institution that keeps every image it runs in its own registry |
| **A local build** | the stack builds the image here, from this checkout, with `-f deploy/compose.build.yml` | development, an air-gapped host, a modified image — and any version no registry publishes |

### Dédalo's registries

The list is kept in the repository (`engineering/image_registries.json`) and this
table is generated from it. The **primary** registry is the one Dédalo runs
itself; the **mirrors** carry the same images on public infrastructure. *Not yet
available* means Dédalo does not publish there yet: no address is given, and
neither `./install.sh` nor the update tools offer it.

<!-- BEGIN GENERATED — engineering/image_registries.json · regenerate: bun run registries:gen -->
| Registry | Repository | Role | Status |
|---|---|---|---|
| Dédalo registry (gitdedalo) | — | primary | not yet available — The OCI registry on the gitdedalo host has not been stood up yet (it needs TLS, authenticated push and anonymous pull); until then this entry names no address. |
| GitHub Container Registry | `ghcr.io/dedalia-org/dedalo` | mirror | available |
| Docker Hub | `docker.io/dedalia/dedalo` | mirror | available |
<!-- END GENERATED -->

A registry being available does not mean every version is on it: images are
published per **release**. The tags follow the code server's release names:

| Tag | What it is |
| --- | --- |
| `X.Y.Z` (for example `7.0.1`) | a release. Immutable: once published, a release tag always names the same image |
| `X.Y.Z-dev` | a developer image of unreleased work, built on demand. It is rebuilt in place — never use it in production |

There is no `latest` tag, on purpose: an installation always names the version it
runs. `./install.sh` checks which registries publish your checkout's version and
offers those first; when none does, it builds locally.

### Checking the signature

Every published image is signed by Dédalo's release workflow with
[Sigstore](https://www.sigstore.dev/) keyless signing: there is no key to
distribute, and the signature records which workflow, in which repository, built
the image. With [`cosign`](https://docs.sigstore.dev/cosign/system_config/installation/)
installed on the host, check an image before you run it:

```shell
cosign verify \
  --certificate-identity-regexp '^https://github\.com/dedalia-org/dedalo/\.github/workflows/image-release\.yml@refs/(tags/v[0-9]+\.[0-9]+\.[0-9]+|heads/master)$' \
  --certificate-oidc-issuer 'https://token.actions.githubusercontent.com' \
  <repository>:<version>
```

`<repository>` is one from the table above. Set `DEDALO_IMAGE_VERIFY=cosign` in
`.dedalo.env` and the update script runs exactly this check on every image it
pulls, and refuses one that fails it. It also checks that the signed image says it
**is** the version you asked for (its `org.opencontainers.image.version` label):
a signature alone only proves Dédalo built the image, not which release it is,
and a registry that served an older signed release under a newer tag would
otherwise move your installation backwards; `./install.sh` sets it for you when you
choose one of Dédalo's registries and `cosign` is installed.

### A registry of your own

Copy the published image into your registry **keeping its digest** — a copy that
re-packs the image is no longer the image Dédalo signed. Either of these copies a
release as it is, for both architectures:

```shell
# image only
docker buildx imagetools create --tag registry.example.org/heritage/dedalo:7.0.1 \
  <repository>:7.0.1

# image AND its signature (the signature check above then works on your copy)
cosign copy <repository>:7.0.1 registry.example.org/heritage/dedalo:7.0.1
```

Then answer `./install.sh`'s question with *Another registry* and type
`registry.example.org/heritage/dedalo`, or write it as `DEDALO_IMAGE` yourself.
Verification is then yours to decide: keep `DEDALO_IMAGE_VERIFY=cosign` only if
you copied the signature too, otherwise set it to `none`. Mirror each new release
before you update to it.

### A local build

Building here needs no registry at all — it needs this checkout and the network
to fetch the base image, the system packages and the JavaScript dependencies.
The first build is slow (the media toolchain is a large download) and parks
several gigabytes of build cache (`docker builder prune -af` reclaims it once the
build is done). Updates rebuild from the release's git tag, so the checkout must
keep its git remote.

```shell
docker compose -f docker-compose.yml -f deploy/compose.build.yml --env-file .dedalo.env build dedalo
```

The override adds the build to the `dedalo` service only; the `backup` service
runs the same image. Everyday commands (`up`, `logs`, `stop`) do not need the
override — the built image is already on this host.

### The `.dedalo.env` keys

Both stacks read the same five keys. `./install.sh` writes them on the simple
stack; on this page you write them in [step 5](#step-5-get-the-image).

| Key | Value | Example |
| --- | --- | --- |
| `DEDALO_COMPOSE_FILE` | the stack file in this directory | `docker-compose.yml` (this page) or `docker-compose.simple.yml` |
| `DEDALO_IMAGE` | the repository, **without** a tag | a repository from the table above, yours, or `localhost/dedalo` for a local build |
| `DEDALO_VERSION` | the version this installation runs — the image tag | `7.0.1`, or `7.0.1-dev` |
| `DEDALO_IMAGE_MODE` | `pull` (a registry) or `build` (a local build) | `pull` |
| `DEDALO_IMAGE_VERIFY` | `cosign` (check Dédalo's signature on every pull) or `none` | `cosign` |

`DEDALO_VERSION` is a **pin**: the stack runs exactly that version until the
[image updater](#upgrading) moves it, and nothing else rewrites the file. The one
time you edit it by hand is [a rollback after a green update](#rolling-back-by-hand). A
compose command without `--env-file .dedalo.env` falls back to
`localhost/dedalo:local` — an image that does not exist — and fails loudly rather
than run something you did not choose.

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
- **Run `docker` without `sudo`.** `sudo` starts the command with a clean
  environment and as another user: the variables you export in [step
  2](#step-2-choose-the-database-credentials) do not reach it, and whatever it
  writes in the checkout (`.dedalo.env`, the checkout a local build moves) ends up
  owned by root.
  The [host updater](#the-host-updater-optional) also runs as the checkout's owner,
  through the `docker` group. Join the group once instead:

    ```shell
    sudo usermod -aG docker "$USER"
    newgrp docker                    # or log out and back in
    docker run --rm hello-world      # now works without sudo
    ```

    Membership of `docker` is root-equivalent — exactly what `sudo docker`
    already was.
- **Docker Desktop (macOS/Windows):** the checkout must be inside a shared path,
  or the bind mounts of `deploy/nginx.conf` and `deploy/certs/` arrive empty. Fine for
  evaluation; for production use Linux — see the note in the
  [installation hub](index.md).

### Check the host

```shell
sudo ss -tlnp | grep -E ':(80|443)\b'   # both must be FREE — the proxy publishes them
docker system df                        # room for the image and the volumes?
df -h /var/lib/docker
hostname -I                             # this machine's address — note it for step 4
```

- **Ports 80 and 443 must be free.** A host web server already listening there
  is the single most common `docker compose up` failure:
  `failed to bind host port 0.0.0.0:80/tcp: address already in use`. The `ss`
  line names the process (`sudo` is what makes it show the name); on Ubuntu it
  is usually `apache2` or `nginx` installed with the system. Either:

    1. **Stop it** — the right answer when nothing else on the machine needs it:

        ```shell
        sudo systemctl disable --now apache2     # or nginx
        ```

    2. **Or move the stack to other ports** with an override file next to
       `docker-compose.yml` — compose reads `docker-compose.override.yml`
       automatically, and you leave the shipped file untouched:

        ```yaml title="docker-compose.override.yml"
        services:
          nginx:
            ports: !override
              - "8080:80"
              - "8443:443"
        ```

        `!override` needs Compose 2.24.4 or newer; without it the ports are
        *added* to the shipped ones and the bind still fails. Confirm with
        `docker compose --env-file .dedalo.env config nginx | grep -A8 ports`. Then browse to
        `https://<address>:8443/dedalo/` directly: the plain-HTTP port only
        redirects to `https://<address>/`, which drops the port. For a
        production machine that must keep its own web server, put Dédalo behind
        it instead (see [reverse proxy](reverse_proxy.md)).
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
    proxy container runs as a different user. The engine therefore grants the
    socket its `0666` itself, right after it starts listening; the rest of the
    process runs under the image's `umask 0027`. The socket volume is shared
    with the proxy and with nothing else.

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

!!! warning "The proxy reads media through the engine's GROUP"
    The engine runs as `bun` (uid/gid `1000`) under `umask 0027`, so every media
    file it writes is `640` inside `750` directories: owner and group may read,
    the world may not. nginx's workers run as `nginx` (uid `101`), so the shipped
    stacks put that user into a gid-`1000` group **inside the nginx container,
    before nginx starts** — the `addgroup` calls at the head of the service's
    `command:`. Keep them if you replace the command.

    `group_add: ["1000"]` does **not** do this: it reaches only the root master
    process, and each worker rebuilds its groups from `/etc/group` when it drops
    to `nginx`. And never "fix" a `403` with `chmod o+r`: it makes media
    world-readable and the next upload is `403` again. This is the same model as
    the bare-metal unit (`UMask=0007` plus the web-server user in the `dedalo`
    group).

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
cd dedalo
ls docker-compose.yml Dockerfile deploy/nginx.conf     # you are in the right place
```

### Step 2 — Choose the database credentials

The `postgres` service reads three variables. `POSTGRES_PASSWORD` has no default
and compose **refuses to start without it** — that is deliberate. Choose them,
export them for this session (the installer in step 7 is given them), and write
them into `.dedalo.env`, the stack's own environment file:

```shell
export POSTGRES_DB=dedalo_main
export POSTGRES_USER=dedalo_user
export POSTGRES_PASSWORD='a-long-random-password'
( umask 077 && printf 'POSTGRES_DB=%s\nPOSTGRES_USER=%s\nPOSTGRES_PASSWORD=%s\n' \
    "$POSTGRES_DB" "$POSTGRES_USER" "$POSTGRES_PASSWORD" > .dedalo.env )
```

Use letters, digits, `-` and `_` in the password: compose expands a `$` inside
this file. The file is readable only by you — it holds the database password.

**Every compose command from here on carries `--env-file .dedalo.env`.** That is
what makes the credentials and the image choice of step 5 reach compose in every
session — an `export` lives only in **this** shell, and a new terminal, an SSH
reconnect or `sudo` (see [Check your Docker](#check-your-docker)) starts without
it. The same file is what the [image updater](#upgrading) reads, so an update run
from another session — or by the [host updater](#the-host-updater-optional) —
uses the same database and the same image source. `POSTGRES_DB` and
`POSTGRES_USER` are the dangerous pair: they have defaults, so when they go
missing nothing fails — you silently get a database with a different name and
owner from the ones the installer was told.

!!! warning "`.dedalo.env`, never `.env`"
    Do not name the file `.env`, and do not create a `.env` at the repo root at
    all. Compose would read it on its own — but so would the engine's own
    configuration loader, from the container's working directory. `.dedalo.env`
    is read only when a command names it.

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
(see [TLS](#tls)). **One script issues every certificate this stack uses**,
`deploy/dedalo-tls-rotate.sh` — the same one `./install.sh` calls, and the same
one you will run to rotate. Do not hand-roll a pair with `openssl`: two
generators drift in SAN, lifetime and file permissions the first time one of
them is fixed, and the hand-rolled one has no archive step, so a re-run
overwrites the material you may still need.

For a LAN or a trial, issue a local certificate authority. Use the name or IP
staff will actually type in the browser — a certificate whose SAN does not match
is rejected outright. On a virtual machine that is the VM's own address
(`hostname -I` inside it), not `localhost`:

```shell
deploy/dedalo-tls-rotate.sh --mode local-ca --host dedalo.example.org --no-reload
```

`--no-reload` because the stack is not up yet. It writes
`deploy/certs/{privkey.pem,fullchain.pem}` plus the authority
`dedalo-local-ca.{key,pem}`, sets the keys to `600`, and prints the CA file with
its SHA-256 fingerprint — that file is the one you install on every staff
computer.

If your institution already issues certificates, install them instead of
generating one:

```shell
deploy/dedalo-tls-rotate.sh --mode existing \
  --cert /path/fullchain.pem --key /path/privkey.pem --no-reload
```

For a public domain, bind-mount your certbot tree instead — [TLS](#tls) below.

!!! danger "Never commit or copy key material into the repo tree"
    `deploy/certs/` is ignored by git and excluded from the container build
    context, so the key you just created cannot reach an image, a release
    archive or a push. That containment is mechanical, and it only holds for
    material **inside `deploy/certs/`**. A key parked somewhere else in the
    checkout is a different matter: it can travel. If one already has,
    [rotate it](#rotating-tls-material).

### Step 5 — Get the image

Decide [where the image comes from](#choose-where-the-image-comes-from), record
it in `.dedalo.env`, and get it. The version is the one this checkout declares;
the host library prints it:

```shell
bash -c '. deploy/dedalo-image-lib.sh && dedalo_checkout_version .'    # e.g. 7.0.1
```

In the blocks below, replace `<repository>` and `<version>` with the values
themselves **before** you run them; the five keys are explained in [the
`.dedalo.env` keys](#the-dedaloenv-keys).

**Pull a published image** — the repository from [Dédalo's
registries](#dedalos-registries) (or [your own](#a-registry-of-your-own)), at that
version:

```shell
cat >> .dedalo.env <<'ENV'
DEDALO_COMPOSE_FILE=docker-compose.yml
DEDALO_IMAGE=<repository>
DEDALO_VERSION=<version>
DEDALO_IMAGE_MODE=pull
DEDALO_IMAGE_VERIFY=cosign
ENV
docker compose --env-file .dedalo.env pull dedalo backup
```

Then [check its signature](#checking-the-signature) — or write
`DEDALO_IMAGE_VERIFY=none` if you will not install `cosign`. *manifest unknown*
means that registry does not publish that version: pick another registry, or
build.

**Or build it here** from this checkout:

```shell
cat >> .dedalo.env <<'ENV'
DEDALO_COMPOSE_FILE=docker-compose.yml
DEDALO_IMAGE=localhost/dedalo
DEDALO_VERSION=<version>
DEDALO_IMAGE_MODE=build
DEDALO_IMAGE_VERIFY=none
ENV
docker compose -f docker-compose.yml -f deploy/compose.build.yml --env-file .dedalo.env build dedalo
```

Slow the first time: the media toolchain and the PostgreSQL client are a large
apt transaction. Re-builds after a source change reuse the dependency layer.

The Dockerfile is multi-stage and both paths give you `production` — production
dependencies only. There is one other target, `dev`, which is that same image
with the devDependencies put back (the browser test harness and the LESS
compiler); it exists for a development box and is not part of any install path.
It is never published, and the build override does not select it: a dev overlay
sets it, or a plain `docker build --target dev .`. That overlay also sets
`DEDALO_DEV_MODE=true`, and the test harness needs BOTH — the serving guard
refuses a dev-only library outside dev mode however present its files are.

??? tip "Check the runtime pin if the build behaves oddly"
    ```shell
    cat .bun-version
    grep '^FROM' Dockerfile
    ```
    The two must agree. The engine also warns loudly at boot when they do not.
    A published image always carries a matching pair.

### Step 6 — Start the database alone

```shell
docker compose --env-file .dedalo.env up -d postgres
docker compose --env-file .dedalo.env ps          # wait for postgres → healthy
```

This creates an **empty database owned by the role**, which is exactly the
installer's precondition: it restores *into* a database, refuses a non-empty
one, and never creates one itself. The role owning the database is also what
lets the seed create its extensions.

### Step 7 — Run the installer, once

```shell
docker compose --env-file .dedalo.env run --rm \
  -e DEDALO_INSTALL_ROOT_PASSWORD='the-root-password' dedalo \
  bun run scripts/install.ts \
    --db-name "$POSTGRES_DB" --db-user "$POSTGRES_USER" \
    --db-password "$POSTGRES_PASSWORD" --db-host postgres \
    --entity myentity --entity-label 'My Institution' \
    --locale es-ES --timezone Europe/Madrid \
    --langs lg-eng,lg-spa --app-lang lg-eng --data-lang lg-eng \
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
- `--langs` is the installation's languages — the interface languages users
  can switch to **and** the tabs every translatable field gets — and
  `--app-lang` and `--data-lang` must be among them. The values shown are the
  defaults (English + Spanish, English for both), so the three flags can be
  left out.
- No `--hierarchies`: the shared default set of optional thesauri (today Spain,
  `es`) is imported and activated. `--hierarchies none` skips it, a list such as
  `--hierarchies es,fr` replaces it, and you can always
  [install hierarchies later](../management/install_new_hierarchies.md). The
  Languages thesaurus (`lg`) is not on that list: it is activated together with
  the database on every install.
- The installer writes `ONTOLOGY_SERVERS` and `CODE_SERVERS` naming the official
  Dédalo update server — where ontology updates and release information come
  from. Add `--no-update-servers` for an air-gapped instance (both written as
  `[]`). On this stack a new **code** release still arrives as a new image, as
  described in [upgrading](#upgrading); that is unchanged.
- No `--ontologies`: the default domain ontology, Oral history (`oh`), is
  installed from the copy built into the image, so this works offline. Name the
  domains you catalogue instead — `--ontologies oh,tch`, for instance — and the
  installer downloads them (with the ontologies they declare as dependencies)
  from the update server before it touches the database. An air-gapped instance
  can install more than `oh` from a copied ontology export with
  `--ontology-source <dir|archive>` (mount it into the container). See
  [Domain ontologies](installer_reference.md#domain-ontologies).

Every flag is in the [installer reference](installer_reference.md). The run ends
by verifying an actual root login — if it prints success, the instance is real.

The installer prints one `→` line per step. **Where it stopped decides what you
do next:**

- **Before `→ restore database from seed`** (pre-flight, database connection,
  write `.env`, directories, ontology files): nothing is in the database yet. Fix the cause and
  run the same command again — the `.env` it already wrote is reused, and the
  secrets it generated are kept.
- **At or after `→ restore database from seed`:** see the danger box below.

!!! danger "Past the seed restore, this step is not repeatable"
    The seed restore refuses a non-empty database. If the install fails at or
    after it, do not re-run it against the same volumes: destroy them
    (`docker compose --env-file .dedalo.env down -v` — **this deletes the data**) and start from step 6.

!!! note "`install failed` at `→ directories`, naming `/backups/db`"
    The `backups` volume is owned by root, so the installer (user `bun`) cannot
    write to it. Images built before 2026-10-08 created that volume root-owned.
    Get a current image ([step 5](#step-5-get-the-image)) and run step 7
    again: Docker gives an empty volume the ownership of the image's directory,
    so a current image heals it. Without one, one command does the same:
    `docker compose --env-file .dedalo.env run --rm --no-deps --user root dedalo chown -R bun:bun /backups`.

### Step 8 — Start the whole stack

```shell
docker compose --env-file .dedalo.env up -d
docker compose --env-file .dedalo.env ps
```

`postgres` and `dedalo` should report *healthy*. `nginx` has no healthcheck —
check it with `docker compose --env-file .dedalo.env logs nginx`, and read its **PORTS** column: it
must show `0.0.0.0:80->80/tcp, 0.0.0.0:443->443/tcp` (or your override's
ports). An **empty** PORTS column means nothing is published and no browser can
reach the stack — usually a broken `docker-compose.override.yml`. Fix it, then
`docker compose --env-file .dedalo.env up -d --force-recreate nginx`.

**The engine's healthcheck also acts.** It is not a bare `curl` but
`scripts/ops/container_watchdog.sh`, which probes `/health` over the socket,
reports *unhealthy* to `docker compose ps` exactly as a bare probe would, and
after **three consecutive red probes 30 seconds apart** sends `SIGTERM` to the
engine so it drains and `restart: unless-stopped` recycles the container. That is
the consumer of the 503 the engine emits when its process is poisoned, its pool
is wedged or the database is gone — Docker Engine itself never restarts an
unhealthy container. It escalates only after the container has answered green at
least once, so an instance still sitting on the browser wizard (no database yet,
so `/health` is red) is left alone. Budget roughly 90 seconds for a recycle here,
not the 30 seconds of the systemd deployment.

### Step 9 — Confirm the engine answers

```shell
docker compose --env-file .dedalo.env exec dedalo curl --fail --unix-socket /run/dedalo/dedalo_ts.sock \
  http://localhost/health                       # {"result":"ok","db":"ok"}
curl -k -I https://localhost/dedalo/core/page/  # 200 through the proxy
```

A 502 here is almost always the socket permissions ([problem
2](#2-the-socket-is-invisible-across-containers)); a connection refused is nginx
crash-looping — read its log.

**Then from the computer you will actually work on.** Open
`https://<address>/dedalo/` — always `https://`, always the `/dedalo/` path.
Plain HTTP only redirects, and a login over it cannot work ([TLS](#tls)). The
address depends on where Docker runs:

| Docker runs on | `<address>` is |
| --- | --- |
| a server, or a VM with a **bridged** network | the machine's own IP — `hostname -I` on it — or its DNS name |
| a VM with a **NAT** network (the VirtualBox / UTM / Parallels default) | `localhost:<port>`, after you forward a host port to the VM's 443 in the hypervisor's network settings |
| Docker Desktop on your own computer | `localhost` |

`192.168.65.x` is Docker Desktop's **internal** network, not an address of your
machine: a browser pointed at it is refused. If the curl above answers inside the
machine but your browser cannot connect, the problem is the network path to the
machine (or the PORTS column above), not Dédalo.

With the local certificate authority from step 4, the browser warns until you
install `dedalo-local-ca.pem` on that computer.

### Step 10 — Turn the media gate on

Until this step, **no media file is served**: the shipped `deploy/nginx.conf`
has the gate's two `include` lines commented out, so every `/dedalo/media/…`
request is a `404` — uploads work, the files are on disk, and the browser still
shows nothing. That is the safe failure ([problem
3](#3-the-engine-writes-the-media-rules-the-proxy-reads-them)); this step ends
it.

**1. Check that the engine wrote the rule files** on its first boot:

```shell
docker compose --env-file .dedalo.env exec dedalo ls -l /srv/dedalo/media/dedalo_media_protection.nginx.conf \
                                /srv/dedalo/media/dedalo_media_protection_map.nginx.conf
```

Both must be there. (These paths are inside the containers — see [two
places](#two-places-your-host-and-the-containers). On the host you edit only
`deploy/nginx.conf`.)

**2. Uncomment both `include` lines** in `deploy/nginx.conf`, on the host, from
the checkout directory. Both or neither — the server-scope file uses a variable
the `map` file defines. One command does both (on macOS, write `sed -i ''`):

```shell
sed -i -E 's|^([[:space:]]*)#[[:space:]]*(include /srv/dedalo/media/dedalo_media_protection(_map)?\.nginx\.conf;)|\1\2|' deploy/nginx.conf
```

Or by hand (`nano deploy/nginx.conf`, search with `Ctrl+W` for
`dedalo_media_protection`): delete the leading `# ` from the line near the top
(`…_map.nginx.conf`, `http{}` scope) and from the one inside `server{}`. Leave
the commented `# location /dedalo/media/ {` block alone — that is the
*unprotected* alternative.

Check the result — both lines, no `#`:

```shell
grep -n 'include /srv/dedalo/media' deploy/nginx.conf
```

```text
34:include /srv/dedalo/media/dedalo_media_protection_map.nginx.conf;
103:	include /srv/dedalo/media/dedalo_media_protection.nginx.conf;
```

**3. Recreate the proxy** — recreate, not `reload`:

```shell
docker compose --env-file .dedalo.env up -d --force-recreate nginx
docker compose --env-file .dedalo.env exec nginx nginx -t
```

!!! warning "Why `reload` is not enough after editing `deploy/nginx.conf`"
    The file is bind-mounted as a **single file**, and Docker pins a single-file
    mount to the file's inode. `nano`, `vim` and `sed -i` all save by writing a
    new file and renaming it over the old one — a new inode — so the container
    keeps the **old** text, and `nginx -s reload` re-reads the old text.
    Recreating the container mounts the current file. This applies to **every**
    later edit of `deploy/nginx.conf`, not only this one.

**4. Confirm the running nginx has the gate:**

```shell
docker compose --env-file .dedalo.env exec nginx nginx -T 2>/dev/null \
  | grep -n -E 'dedalo_media_protection|location .*/dedalo/media'
```

The two `include` lines must appear **without** `#`, followed by several
generated `location … /dedalo/media…` blocks. A `#` in front of them means the
container is still serving the old file: go back to 3.

### Step 11 — Prove media is actually served

Log in, upload a file to a record, and open it. A `404` has four possible
causes, because the gate answers `404` both for a file that does not exist and
for a request it refuses. Check them in this order:

1. **The gate is not loaded** — step 10.4 shows commented `include` lines.
2. **The file does not exist yet.** The upload stores the `original`; the
   derivatives (`av/404/…`, the 404-pixel video the player asks for, and the
   image thumbnails) are produced afterwards by a background job. Compare:

    ```shell
    docker compose --env-file .dedalo.env exec nginx ls -l /srv/dedalo/media/av/original/ /srv/dedalo/media/av/404/
    ```

    The original present and the derivative missing is a transcoding problem —
    read `docker compose --env-file .dedalo.env logs dedalo`, not the proxy.
3. **The browser has no media cookie.** Access is granted by the
   `dedalo_media_auth` cookie, set at **login**, matching a file in
   `/srv/dedalo/media/.publication/auth/`. A session opened before the gate was
   on, or in another browser, does not carry it: log out and log in again.
4. **The proxy `root` and `MEDIA_PATH` disagree** — the root rule documented at
   the top of `deploy/nginx.conf`. The gate looks perfectly healthy when this is
   wrong, which is what makes it confusing.

A **403** is a different problem: nginx's workers are not in the engine's group
([problem 3](#3-the-engine-writes-the-media-rules-the-proxy-reads-them)).

### Step 12 — Log in and seal the deployment

1. Open `https://<your-domain>/dedalo/core/page/` and log in as `root`.
2. Create an **admin user**; keep `root` for emergencies.
3. Continue with [after the install](index.md#after-the-install): users and
   projects, hierarchies, and **backups**.

## Path B — install with the browser wizard

Same engine, driven from a browser. It replaces Path A's steps 6–7 only:
**steps 1–5 are identical** (source, credentials, domain, TLS, image), and once
the wizard says *Finish* you rejoin Path A at [step
10](#step-10-turn-the-media-gate-on).

The wizard's own screens — Diagnostics, Database, Entity, Diffusion, Outbound
email, Save config, Verify, Directories, Install database, Root password,
Hierarchies, Tools, Finish — are documented once, in the [installer
reference](installer_reference.md#the-browser-wizard). What follows is only what
containers change.

### B1 — Name the address you will install from

A fresh instance has no users, so **every install action is reachable without a
login** until you press *Finish*. Path A never opens that window; Path B does,
and `docker compose up` publishes ports 80 and 443 in the same breath.

The engine closes that window for you: with `DEDALO_INSTALL_ALLOWED_IPS` unset,
the wizard answers **the local machine and nobody else**. In a container that is
nobody at all — nginx forwards your browser's real address, which is never the
loopback of the engine's namespace — so Path B does not work until you say who
you are. Set it in the `dedalo` service's `environment:` **before** the stack
ever comes up (the shipped compose file already passes the variable through, so
exporting it — or adding `DEDALO_INSTALL_ALLOWED_IPS=…` to `.dedalo.env` — is
enough):

In the same shell you will run `docker compose up -d` from (B2), replacing
`203.0.113.10` with the address **you** will browse from:

```shell
export DEDALO_INSTALL_ALLOWED_IPS=203.0.113.10
```

Check that compose picked it up before going on:

```shell
docker compose config | grep DEDALO_INSTALL_ALLOWED_IPS
```

The export lives only in that shell: a new terminal needs it again. To set it
permanently instead, edit the `dedalo` service's `environment:` in the compose
file:

```yaml
environment:
  DEDALO_INSTALL_ALLOWED_IPS: "203.0.113.10"     # the address YOU will browse from
```

A value is a comma list of four possible things: `loopback`, a literal address,
a range such as `10.0.0.0/24`, or `any`. If the wizard refuses you anyway, its
message names the address the engine saw — add that one. Behind the nginx
container it is rarely the address you would guess (Docker Desktop: `192.168.65.1`;
a Linux bridge: a gateway such as `172.18.0.1`).

!!! warning "`loopback` will not match behind the proxy"
    The address is resolved from the trusted `X-Forwarded-For` hop — and the
    compose file sets `TRUSTED_PROXY_HOPS: "1"` for exactly this — so behind the
    nginx container the caller is never the loopback address. Naming `loopback`
    locks **you** out while leaving nobody else out. Name the real client
    address, or the range your workstations sit in.

    `any` opens the surface to every address. It is the one spelling that does
    that, it is never a default, and it is the wrong choice for anything with a
    public port — use it only when a firewall already stands in front, and drop
    it the moment the instance is sealed.

### B2 — Bring the stack up on an empty `private` volume

Install mode is not a flag; it is the **absence of `/private/.env`**. So this
only works on a first run, or after you have destroyed the volume.

```shell
docker compose --env-file .dedalo.env up -d
docker compose --env-file .dedalo.env logs dedalo | grep 'INSTALL MODE'
```

You want to see the engine announce it:

```text
[boot] INSTALL MODE — no database configured yet (../private/.env absent).
Serving the install wizard at /dedalo/core/page/.
```

No such line means `.env` already exists and you are looking at a normal boot —
the wizard will not appear. Check with
`docker compose --env-file .dedalo.env exec dedalo cat /private/.env`.

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
docker compose --env-file .dedalo.env logs -f dedalo      # watch it exit and come straight back
```

Leave the browser tab open. The wizard survives the restart: the **Verify**
button retries, and even a full page reload resumes the wizard rather than
dropping to a login form. The state that makes this work is `install_status` in
`/private/ts_state.json`.

!!! danger "A container that does not come back was never supervised"
    If you removed `restart: unless-stopped`, the engine exits at *Save config*
    and stays down — the install hangs there with `.env` written and nothing
    serving. Restore the policy and `docker compose --env-file .dedalo.env up -d`; the wizard resumes.

### B5 — Finish, and confirm the surface is sealed

Work through Verify → Directories → Install database → Root password → log in →
Hierarchies → Tools → **Finish**. *Finish* is refused unless a root user with a
password actually exists, so a half-built instance cannot be sealed.

Once sealed, the whole install surface answers `404` permanently, and
`DEDALO_INSTALL_ALLOWED_IPS` has no further job — drop it (and if you wrote
`any`, drop it now rather than later).

```shell
docker compose --env-file .dedalo.env exec dedalo cat /private/ts_state.json   # install_status: "sealed"
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

!!! note "Both compose stacks declare `DEDALO_SUPERVISED: \"true\"`"
    `restart: unless-stopped` is what brings the engine back after a planned
    exit, so the `dedalo` service's `environment:` says so with
    `DEDALO_SUPERVISED: "true"` — in `docker-compose.yml` and in
    `docker-compose.simple.yml`. Keep it if you write your own stack. It belongs in
    the compose file, never in `/private/.env`: the engine reads this key from the
    process environment only and ignores it in `.env`. On an image install the
    [code update panel](../management/updates/updating_code.md) does not swap the
    code tree in place — a new release arrives as a new image. The panel shows
    which, and the command that installs it, as described in
    [upgrading](#upgrading).

The `dedalo` service also declares where its image came from
(`DEDALO_CONTAINER_IMAGE`, `DEDALO_CONTAINER_IMAGE_MODE`, mirrored from
`.dedalo.env`) and where it publishes its client (`DEDALO_CLIENT_PUBLISH_DIR`).
Keep all three: the panel reads the first two, and without the third nginx serves
an empty `client` volume.

To read what the installer actually wrote:

```shell
docker compose --env-file .dedalo.env exec dedalo cat /private/.env
```

## TLS

`deploy/nginx.conf` expects a certificate at
`/etc/letsencrypt/live/dedalo.example.org/`. The compose file bind-mounts
`./deploy/certs` there.

- **Real deployment:** bind-mount your certbot tree instead, and change the
  `server_name` and the certificate paths in `deploy/nginx.conf`. Renewal
  happens on the host; reload the proxy afterwards
  (`docker compose --env-file .dedalo.env exec nginx nginx -s reload`).
- **Local trial:** the local authority from [step 4](#step-4-provide-a-tls-certificate).

TLS is not optional even locally: `SESSION_COOKIE_SECURE` defaults to `true`, so
over plain HTTP the browser discards the session cookie and **nobody can log in**.

### Rotating TLS material

Same script, same arguments — rotation is not a different procedure from the
first issue, which is exactly why there is only one generator:

```shell
# a new local authority and a new site certificate
deploy/dedalo-tls-rotate.sh --mode local-ca --host dedalo.example.org \
  --compose-file docker-compose.yml

# a replacement certificate from your institution
deploy/dedalo-tls-rotate.sh --mode existing \
  --cert /path/fullchain.pem --key /path/privkey.pem \
  --compose-file docker-compose.yml
```

Pass `--compose-file docker-compose.yml` on this page's full stack (the script
defaults to the simple stack) so it can reload the proxy for you; it tells you
when it could not, and `docker compose --env-file .dedalo.env exec nginx nginx -s reload` finishes the
job. **The full stack's proxy does not reload itself**, so until you reload it,
it keeps serving the old certificate.

What the script does, and why each part matters:

- **It archives first.** Everything in `deploy/certs/` moves to
  `deploy/certs/rotated-<UTC stamp>/` (mode `700`, never overwritten) before
  anything new is written, so a rotation interrupted halfway can be put back.
- **Each authority carries its issue stamp** in its subject
  (`CN=Dedalo local CA <stamp>`). Two entries both called "Dedalo local CA" are
  indistinguishable in a Windows or macOS trust store, and rotating away from a
  compromised authority means being able to say **which** entry to delete.
- **Install the new CA on every computer, then delete the old entry.** Until the
  old one is gone, a certificate signed with the old key is still trusted there —
  which is the whole point of rotating. The script prints the per-platform steps.

!!! warning "An image built before 2026-08-28 may contain your CA private key"
    Until then the image copied the whole build context, and `./install.sh`
    writes `deploy/certs/` **before** it builds. Any image built on such a host
    carries `dedalo-local-ca.key` — the private key of an authority you were told
    to install into the Trusted Root store of every computer that uses Dédalo.
    Whoever holds it can mint a browser-trusted certificate for any hostname, on
    all of those machines, and it travels wherever the image travels: a registry,
    a `docker save` tarball, a copy handed to a supplier.

    Treat it as compromised — it cannot be un-distributed. Rotate as above,
    install the new CA everywhere and **delete the old entry**, rotate
    `POSTGRES_PASSWORD` in `.dedalo.env`, then rebuild and re-distribute the
    image from a current checkout. Confirm the rebuild is clean:

    ```shell
    docker run --rm --user 0 <image> ls /opt/dedalo/master_dedalo/deploy
    # expected: "No such file or directory" — deploy/ is not in the image at all
    ```

    The full operator procedure, including the database-password step, is
    §13 of `engineering/PRODUCTION.md` in the repo.

## Day-to-day operation

```shell
docker compose --env-file .dedalo.env logs -f dedalo        # follow the engine
docker compose --env-file .dedalo.env restart dedalo        # after an ops env change
docker compose --env-file .dedalo.env exec dedalo bash      # a shell in the engine container
docker compose --env-file .dedalo.env stop                  # stop, keep the data
docker compose --env-file .dedalo.env down                  # remove containers, KEEP the volumes
docker compose --env-file .dedalo.env down -v               # remove the volumes too — DESTROYS the instance
```

A configuration change in `docker-compose.yml` needs `docker compose --env-file .dedalo.env up -d`
(recreate), not `restart` — `restart` reuses the existing container and its
old environment. An edit of `deploy/nginx.conf` needs
`docker compose --env-file .dedalo.env up -d --force-recreate nginx`: a `reload` can keep serving the
old file (see [step 10](#step-10-turn-the-media-gate-on)).

## Backups from a container

The [four stores](production.md#13-backups) do not change; only the way you reach
them does. Volume names are prefixed with the compose project name (`dedalo`, set
by `name:` in the compose file) — confirm with `docker volume ls`.

```shell
# 1. The matrix database.
docker compose --env-file .dedalo.env exec -T postgres \
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

A container installation updates by replacing its **image** — the code lives
inside it, so there is no tree to swap. One script does the whole update, from
the stack directory (the one holding `.dedalo.env`):

```shell
./deploy/dedalo-image-update.sh --version 7.0.2
```

The version is a release the code server lists — the
[code update panel](../management/updates/updating_code.md) shows them, with their
release notes and this exact command — or a `X.Y.Z-dev` developer image. What the
script does, in order, each step refusing before the next one changes anything:

1. **Reads `.dedalo.env`** to know where the image comes from — the repository,
   pull or build, whether to check the signature. If the file does not say, it
   prints the exact lines to add and stops (see [an installation from before the
   image pin](#an-installation-from-before-the-image-pin)).
2. **Checks the version**: it must move forward from the pinned `DEDALO_VERSION`
   (the same version only for a `-dev` image), and the running engine must agree
   it is the next step on the upgrade path — the rule the panel applies on any
   other installation.
3. **Takes a database backup** through the stack's `backup` service and checks it
   is readable (`/backups/db/<time>.<database>.postgresql_pre-image-update.custom.backup`). There is no update without it;
   `--no-backup` waives it, and is never the default.
4. **Keeps the running image** under a `rollback-<time>` tag.
5. **Gets the new image**: `pull` mode pulls `<DEDALO_IMAGE>:<version>` and, with
   `DEDALO_IMAGE_VERIFY=cosign`, refuses it unless Dédalo's signature checks out;
   `build` mode checks out the release tag `v<version>` in this checkout and builds
   it with `deploy/compose.build.yml`.
6. **Re-pins `DEDALO_VERSION`** in `.dedalo.env` — the only line it changes.
7. **Recreates `dedalo` and `backup`** — never `postgres` or `nginx` — and waits for
   the engine's healthcheck, up to 15 minutes (`--health-timeout`), since boot
   migrations on a large database take time. While they run, `docker compose ps`
   may already show the engine as *unhealthy* (Docker gives up waiting after about
   two minutes); the script keeps waiting until the engine answers or the 15
   minutes are over. It stops waiting early only if the engine process crashes and
   restarts.
8. **Healthy**: done, and only the newest rollback tag is kept. **Not healthy**:
   it puts the previous image back under its old version, re-pins it, brings it
   up and waits again, and says *rolled back* — or, if even that is not healthy,
   *rollback failed* with the path of the backup it took.

It exits `0` only when the new version is up and healthy.

- **Boot migrations run automatically** when the engine starts. There is no
  separate migrate step. A rollback across a release that added a migration may
  need the database backup the script took.
- **The seed is never re-applied.** The restore refuses a non-empty database, and
  after the first install the database is not empty. An update cannot clobber
  your data by re-running the installer.
- **The client follows the image.** The new engine publishes its own client into
  the `client` volume before it serves, so the browser never gets a client from
  another version. Reload open pages after an update.
- **Host-side files come from your checkout, not from the image**: `deploy/`, the
  compose files, the proxy configuration. When a release's notes say they
  changed, `git pull` the checkout as well (in `pull` mode the script does not
  touch it).
- **One update at a time**: a second run while one is in progress refuses.

The full upgrade procedure, including what to read before a major version, is in
[upgrading](upgrading.md).

### Rolling back by hand

The script rolls back on its own only while the update is running. If a problem
shows up later — the update went green, and a day after you find a regression —
go back by hand. The script itself refuses to move to an older version, so this is
the one time you edit `DEDALO_VERSION` yourself:

1. **Make sure the old image is on this host.** `docker image ls <DEDALO_IMAGE>`
   lists it as `<DEDALO_IMAGE>:<previous version>`. If that tag is gone, the last
   update kept the image it replaced as `rollback-<time>`: put the version back on
   it with `docker tag <DEDALO_IMAGE>:rollback-<time> <DEDALO_IMAGE>:<previous version>`.
   In `pull` mode you can also just pull `<DEDALO_IMAGE>:<previous version>` again.
2. **Re-pin it**: set `DEDALO_VERSION=<previous version>` in `.dedalo.env`.
3. **In `build` mode, return the checkout** to where it was before the update
   (the script left it detached at `v<new version>`): `git checkout master` (or
   your branch), so the next update starts from a normal checkout.
4. **Restore the database only if the newer release migrated it** in a way the
   older one cannot read (its release notes say so) — and before the older
   engine starts on it. Stop the engine
   (`docker compose --env-file .dedalo.env stop dedalo`), then restore the dump
   the update took, `/backups/db/<time>.<database>.postgresql_pre-image-update.custom.backup`
   in the `backups` volume, with the engine's restore door as described in
   [restore a backup](../management/backup.md#restore-a-backup-for-the-work-system).
   Everything recorded since that update is lost with it.
5. **Recreate the engine** — and only it and the backup service:

    ```shell
    docker compose --env-file .dedalo.env up -d --no-build dedalo backup
    ```

### An installation from before the image pin

Stacks from before 2026-10 built their image with a bare `docker compose build`
and have no image keys in `.dedalo.env` (the full stack may have no `.dedalo.env`
at all). The current compose files no longer build on their own, so such an
installation needs the keys once — the script refuses with these exact lines
until they are there. For an installation that built its image here, add:

```shell
DEDALO_COMPOSE_FILE=docker-compose.yml
DEDALO_IMAGE=localhost/dedalo
DEDALO_VERSION=7.0.1
DEDALO_IMAGE_MODE=build
DEDALO_IMAGE_VERIFY=none
```

`DEDALO_COMPOSE_FILE` is `docker-compose.simple.yml` on the simple stack, and
`DEDALO_VERSION` is the version this checkout declares (the script prints it).
(On the full stack, also the three `POSTGRES_*` lines of [step
2](#step-2-choose-the-database-credentials).) Then build once under the new name
and recreate the engine:

```shell
docker compose -f docker-compose.yml -f deploy/compose.build.yml --env-file .dedalo.env build dedalo
docker compose --env-file .dedalo.env up -d
```

From then on, `./deploy/dedalo-image-update.sh` updates it. The first update from
an image built before the update channel existed needs
`--skip-version-check`: that image cannot answer the version question yet. To
move to a published image instead, set `DEDALO_IMAGE` to a registry from
[the table](#dedalos-registries) and `DEDALO_IMAGE_MODE=pull` before that update.

### The host updater (optional)

With the host updater installed, the *Update code* panel offers **Request this
update** instead of only showing the command: an administrator chooses the
release in the browser, and the host runs the same script within about a minute.
It is **off by default**, and the update works the same without it.

```shell
sudo ./deploy/dedalo-image-updater.sh install-units
```

That writes `/etc/systemd/system/dedalo-image-updater.service` and `.timer` with
this stack's path in them, and starts the timer: one pass a minute, run as the
owner of the checkout (who must be in the `docker` group; `--user` names another
account). `print-units` shows the two files without installing anything. The
stack path must be plain — no spaces or quotes.

Each pass tells the engine it is alive (the panel shows *Host updater: running*),
then looks for a request. When it finds one, it re-checks it on the host — a
version tag, never a downgrade from the pinned version — and runs
`./deploy/dedalo-image-update.sh --version <version>` with its backup, health
check and rollback. The outcome appears in the panel (*updated*, *rolled back*,
…). A pass that finds nothing to do does nothing.

What it may and may not do:

- **The panel only asks for a version.** The repository, pull or build, signature
  checking and every flag come from `.dedalo.env` and the script — the engine
  cannot choose them, and it is never given access to Docker. A request still
  needs the superuser, maintenance mode and the normal upgrade path.
- **Never onto developer images from a release.** A request for an `X.Y.Z-dev`
  image is accepted only when the installation already runs one. Moving a
  release installation onto unreleased code is something you do on the host
  yourself, once: `./deploy/dedalo-image-update.sh --version X.Y.Z-dev`.
- **Never without a backup.** The host updater never waives the backup or the
  version check.
- **An interrupted update is reported, not repeated.** If the host restarts in
  the middle, the next pass records the request as *interrupted*; request it
  again from the panel once you have looked at why.

On a host without systemd (a NAS, for instance), run the pass from the
checkout owner's crontab instead:

```shell
* * * * * cd /path/to/master_dedalo && ./deploy/dedalo-image-updater.sh >>/path/to/dedalo-image-updater.log 2>&1
```

To turn it off:

```shell
sudo ./deploy/dedalo-image-updater.sh uninstall-units
```

The panel then shows the host updater as *not heard from recently* and goes back
to showing the command.

## Verify

```shell
docker compose --env-file .dedalo.env ps                       # every service healthy
docker compose --env-file .dedalo.env exec dedalo curl --fail --unix-socket /run/dedalo/dedalo_ts.sock \
  http://localhost/health               # {"result":"ok","db":"ok"}
curl -k -I https://localhost/dedalo/core/page/
docker compose --env-file .dedalo.env logs -f dedalo
```

## When it does not work

Container-specific symptoms; everything else is in
[troubleshooting](troubleshooting.md).

| Symptom | Cause | Fix |
| --- | --- | --- |
| `required variable POSTGRES_PASSWORD is missing a value` | the command has no `--env-file .dedalo.env`, or `.dedalo.env` lacks the credentials | [step 2](#step-2-choose-the-database-credentials) |
| `pull access denied for localhost/dedalo`, or *No such image: localhost/dedalo* | the installation builds its image here (`DEDALO_IMAGE_MODE=build`) and that version was never built on this host — or the command has no `--env-file .dedalo.env` and fell back to the defaults | build it — [a local build](#a-local-build) — or add the flag |
| `manifest unknown` (or *not found*) pulling a Dédalo image | that registry does not publish that version — no release image yet, a typo, or a `-dev` tag nobody built | pick a version from the panel's list, another registry, or [build it here](#a-local-build) |
| `dedalo-image-update.sh` refuses: `.dedalo.env does not say where this installation's image comes from` | an installation from before the image pin | [add the keys once](#an-installation-from-before-the-image-pin) |
| The panel shows the host updater as *not heard from recently* | its timer stopped, Docker or the host is down, or it was uninstalled | `systemctl status dedalo-image-updater.timer` and `journalctl -u dedalo-image-updater` — [the host updater](#the-host-updater-optional) |
| Pages break in odd ways right after an update | a browser tab still holds the previous client | reload the page; the engine republishes the client of its own image at every start |
| `failed to bind host port 0.0.0.0:80/tcp: address already in use` | a web server on the host already holds port 80 or 443 | [check the host](#check-the-host) |
| `install failed` at `→ directories`, naming `/backups/db` | the `backups` volume is root-owned (images built before 2026-10-08) | [step 7](#step-7-run-the-installer-once) |
| The browser cannot connect at all; `docker compose ps` shows an **empty** PORTS column for `nginx` | nothing is published — usually a broken `docker-compose.override.yml` | [step 8](#step-8-start-the-whole-stack) |
| The browser cannot connect, PORTS look right | the wrong address (`192.168.65.x` is Docker Desktop's internal network), or a NAT VM without port forwarding | [step 9](#step-9-confirm-the-engine-answers) |
| `nginx -t`: `open() "/run/nginx.pid" failed (13: Permission denied)` | you ran the **host's** nginx, not the container's | `docker compose --env-file .dedalo.env exec nginx nginx -t` — [two places](#two-places-your-host-and-the-containers) |
| Uploads work but every media file is a **404** | the gate is not on: the `include` lines are still commented — in the file, or only in the running container after a `reload` | [step 10](#step-10-turn-the-media-gate-on), then [step 11](#step-11-prove-media-is-actually-served) |
| Every request is a **502** | the proxy cannot write to the socket | the socket volume must be shared, and the engine must grant the socket `0666` itself — [problem 2](#2-the-socket-is-invisible-across-containers) |
| `nginx` restarts forever | missing certificate, or one `include` uncommented without the other | [step 4](#step-4-provide-a-tls-certificate), [step 10](#step-10-turn-the-media-gate-on) |
| `nginx -t`: `pcre2_compile() failed` | a rule file generated before 2026-07-12 left the rule-B regex unquoted | quote it — [reverse proxy](reverse_proxy.md#nginx) |
| The wizard appears after a successful install | `/private` is not on a volume, so `.env` was lost | [problem 1](#1-private-has-no-parent-to-live-in) |
| The wizard never appears — normal login instead | `/private/.env` already exists, so the engine is not in install mode | [B2](#b2-bring-the-stack-up-on-an-empty-private-volume) |
| Newly uploaded media is a **403**, older media serves | nginx's workers are not in the engine's group | keep the `addgroup` calls in nginx's `command:` — [problem 3](#3-the-engine-writes-the-media-rules-the-proxy-reads-them) |
| The install surface 403s from your browser | the key is unset (the default is the local machine only), your address is not in `DEDALO_INSTALL_ALLOWED_IPS`, or you named `loopback` behind the proxy. The refusal names the address the engine saw — add that one | [B1](#b1-name-the-address-you-will-install-from) |
| The wizard hangs at *Save config*, engine down | no restart policy — the engine exits there by design | [B4](#b4-survive-the-restart-at-save-config) |
| Every media file 404s, gate loaded | the derivative is not produced yet, the browser has no media cookie, or proxy `root` and `MEDIA_PATH` disagree | [step 11](#step-11-prove-media-is-actually-served) |
| Uploads fail with **413** | `client_max_body_size` | already 300m in the shipped config — check you did not replace it |
| Login "succeeds" but bounces back to the form | plain HTTP, and `SESSION_COOKIE_SECURE` is on | [TLS](#tls) |
