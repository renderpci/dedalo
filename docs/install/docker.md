# Docker

> See also: [Installation hub](index.md) · [Installer reference](installer_reference.md) · [Production install](production.md) · [Trial](quickstart.md) · [The web server site](reverse_proxy.md) · [Troubleshooting](troubleshooting.md)

The Docker route installs Dédalo as a compose stack on one host: the engine, PostgreSQL and nginx in containers, the data in Docker volumes. It is the same architecture the [Production route](production.md) builds natively — the engine on a unix socket, PostgreSQL behind it, a web server in front with TLS and **the engine-enforced media gate**. The installer builds the whole stack for you; this page explains how to run it, what each step does, and how to operate the stack afterwards.

!!! info "Docker or Trial"
    The [Trial route](quickstart.md) runs the *simple* stack: plain HTTP and no media protection, for an evaluation. This page is the *full* stack, for a collection that is going to be used.

## What you need

- **Docker Engine and the Compose v2 plugin, 2.24.4 or newer** (`docker compose`; the legacy standalone `docker-compose` v1 cannot read the stack's profiles and health-gated dependencies, and an older plugin cannot read the installer's override). The installer checks these and tells you how to fix what is missing; it never installs Docker or changes group membership. To install them:
    - **Ubuntu:** `sudo apt install docker.io docker-compose-v2 docker-buildx`.
    - **Debian and the RHEL family** (RHEL, AlmaLinux, Rocky): Docker's own repository, as [docs.docker.com/engine/install](https://docs.docker.com/engine/install/) describes for each distribution. On the RHEL family that procedure first removes the `podman`, `buildah` and `runc` packages the system ships.
    - **macOS:** Docker Desktop.

    **Podman, and `podman-docker`, are not supported**: the stack relies on Docker's compose plugin, its volume ownership and its restart policies.
- **Your user in the `docker` group**, so the daemon answers without `sudo`: `sudo usermod -aG docker "$USER"`, then log out and in again (or run `newgrp docker` in the shell you install from). `sudo` would start the installer as another user, and whatever it writes in the checkout would end up owned by root. Membership of `docker` is root-equivalent — exactly what `sudo docker` already was.
- **`git`**, to get the checkout ([Get Dédalo](index.md#get-dedalo)) and, with a local build, to update it later. Minimal RHEL-family images do not have it: `sudo dnf install git`.
- **About 8 GiB free** under Docker's root directory (`df -h /var/lib/docker`): the engine image is about 2.5 GB, PostgreSQL about 0.7 GB, and a local build parks about 3 GB of build cache. Below that the database restore fails part-way, so the installer refuses first.
- **Ports 80 and 443 free** on the host (`sudo ss -tlnp | grep -E ':(80|443)\b'`), or other ports chosen on the *Containers* screen. A host web server already listening there is the most common failure.
- **The address**: a fully qualified name (`dedalo.museum.example`), never `localhost` or an IP address — the installer refuses both. It names the site and the certificate, so it is the address everyone opens.
- **The certificate**: for Let's Encrypt, that name resolving publicly to this host and port 80 reachable from the internet; for a local certificate authority, that name resolving on the staff computers (internal DNS, or a hosts entry on each one); for your institution's certificate, its fullchain and key files, **issued by a CA this host trusts**. The install's last step checks the site with this host's `curl`, against the system trust store, so a certificate from an internal CA needs that CA installed on the host first — Debian and Ubuntu: copy it to `/usr/local/share/ca-certificates/<name>.crt` and run `sudo update-ca-certificates`; the RHEL family: copy it to `/etc/pki/ca-trust/source/anchors/` and run `sudo update-ca-trust`. The System check refuses a chain the host does not trust, and names its issuer.
- **`cosign`** on the host to verify an official image's signature. Without it, choose a local build.

!!! warning "Published ports bypass the host firewall"
    Docker writes its own packet-filter rules (nftables or iptables) for every published port, ahead of the host firewall's: a port the stack publishes is reachable from the network even when `firewalld` or `ufw` does not allow it. To restrict who reaches the stack, either publish on one address only — in `docker-compose.yml`, `"127.0.0.1:${DEDALO_HTTPS_PORT:-443}:443"` instead of `"${DEDALO_HTTPS_PORT:-443}:443"` (behind a proxy on the same host, for instance) — or filter in Docker's `DOCKER-USER` chain, which it consults before its own rules ([Docker and the firewall](https://docs.docker.com/engine/network/packet-filtering-firewalls/)).

## Run the installer

From the checkout of Dédalo ([Get Dédalo](index.md#get-dedalo)), as yourself:

```shell
sh install.sh
```

Choose **Docker** on the first screen (`--plain` asks the same questions one per line). Give no other flag: any answer flag, `--route` included, makes the run headless, and a headless run takes every answer from its flags or an answers file ([Command-line flags](installer_reference.md#command-line-flags)). The screens ask, in order:

| Screen | What it asks |
| --- | --- |
| **Install type** | the route |
| **System check** | nothing: it shows Docker, Compose and the free disk. A failed row must be fixed first |
| **Image** | where the image comes from: an **official** Dédalo registry (verified with `cosign`), a registry of your **own**, or a local **build** from this checkout. Its version is always the installer's own — see [where the image comes from](#choose-where-the-image-comes-from) |
| **TLS & address** | the public address, and the certificate: **Let's Encrypt** (with its email), a **local certificate authority**, or your institution's **files** |
| **Containers** | the published HTTP and HTTPS ports (`80` and `443`) |
| **Identity** | the institution's short code and full name, the install fingerprint (**Information** and **Info key** — keep the defaults unless you are moving a v6 installation), the locale and the time zone |
| **Ontologies**, **Thesauri**, **Languages** | the domain ontologies (Oral history, `oh`, built in), the declared thesauri (created empty: only `lg` and the country toponymies carry terms), the languages |
| **Publication**, **Mail** | optional MariaDB publication target and SMTP relay — tested inside the container during the install |
| **Administrator** | the `root` password |
| **Review plan** | everything that will happen, and every command |

The database name and user (`dedalo`), the media root and the socket are fixed by the stack. The database password is **generated** during the install and never shown. The screens do not ask the media access mode: the stack takes its default (`publication`). A headless run can set it with `--media-access-mode`; later, set `DEDALO_MEDIA_ACCESS_MODE` in `.dedalo.env` and recreate the `dedalo` service.

At the Review, nothing has changed yet. It lists the answers, the steps and **every command each step will run**. Type `yes` to install, or `write <path>` to save the answers as an answers file (no secret in it) for `sh install.sh --answers <file>` later. A run from an answers file is headless and asks nothing, so it takes the `root` password from the environment (`DEDALO_INSTALL_ROOT_PASSWORD`) or from standard input (`--secrets-stdin`, one JSON object) — see [Secrets](installer_reference.md#secrets).

## What the installer writes

Everything stays in the checkout and in Docker:

| Path | What it is |
| --- | --- |
| `.dedalo.env` | the stack's environment (`0600`): the database credentials with the generated password, the TLS decision (`DEDALO_NGINX_CONF`, `SESSION_COOKIE_SECURE`, `DEDALO_CERT_MOUNT`), the published ports (`DEDALO_HTTP_PORT`, `DEDALO_HTTPS_PORT`), the media access mode when you gave one, and [where the image comes from](#the-dedaloenv-keys). Never committed, never inside the image |
| `compose.override.yaml` | what the stack file cannot say through a variable: with Let's Encrypt, the renewal service and its volumes; otherwise an empty override |
| `deploy/nginx.docker.generated.conf` | the full stack's site: the same routes, headers and media gate as a production site, with **both media includes on** |
| `deploy/certs/` | the certificate nginx mounts (`/etc/dedalo/certs` in the container) — the local CA's, or a copy of your institution's files (key `0600`). Let's Encrypt keeps its certificate in the `dedalo_letsencrypt` volume |
| `.dedalo-install/` | the installer's record of this install, for `--resume` and `--abort` |
| volumes `dedalo_*` | the data: `dedalo_pgdata` (the database), `dedalo_media`, `dedalo_private` (`.env`, sessions, state), `dedalo_backups`, `dedalo_client` (derived: republished at every start), `dedalo_socket`; with Let's Encrypt, `dedalo_letsencrypt` |

The engine's own configuration is not in `.dedalo.env`: it is `/private/.env`, inside the `private` volume, written by the engine steps.

## The steps

| Step | What it does | Verify by hand |
| --- | --- | --- |
| `stack_preflight` | refuses, before anything is pulled or written: Docker or Compose v2 missing, a daemon this user cannot reach, under 8 GiB free, a Dédalo instance already here (the `dedalo_private` volume), stack files of an earlier install (`.dedalo.env`, `compose.override.yaml`), an image version that is not the installer's, an official image without `cosign`, an institution certificate that does not check out | the refusal names each problem |
| `stack_image` | pulls the image and verifies its `cosign` signature and its version label — or builds it here with `--image-source build`, printing each build step as it starts (a first build takes about 5 minutes on a fast machine, 15 or more on 2 CPUs). The verified digest is pinned: a re-pull between the check and the run is refused | `docker image ls <image>` |
| `stack_tls` | Let's Encrypt (certbot in its own container, `--standalone` on port 80, before nginx exists), a local CA (`deploy/dedalo-tls-rotate.sh --mode local-ca`), or your files copied into `deploy/certs` | `ls deploy/certs`, or `docker volume ls \| grep letsencrypt` |
| `stack_files` | writes `.dedalo.env`, `compose.override.yaml` and the generated nginx site | the three files exist; `.dedalo.env` is `0600` |
| `stack_database` | starts PostgreSQL and waits for `pg_isready` | `ddc ps postgres` is *healthy* |
| `stack_engine` | runs the engine steps inside a throw-away container (`run --rm -T dedalo bun run scripts/install.ts --request-stdin --execute --events-jsonl`): the seed, the ontologies, the thesauri, the tools, the `root` password. Answers and secrets go on its standard input, never as `-e` (an environment value shows in `docker inspect`) | `ddc run --rm -T dedalo bun run scripts/install.ts --status --json` prints `"outcome":"complete"` |
| `stack_up` | starts the engine first, waits for its `/health` (by then it has written the media rule files nginx includes), then the rest of the stack — and waits for nginx to stay up: running, not restarting, `nginx -t` passing. If it does not, the step fails with nginx's own `[emerg]` line | `ddc ps`: `postgres` and `dedalo` *healthy*, `nginx` *Up* |
| `stack_health` | `/health` on the engine's socket, then through nginx over HTTPS with a verified chain, and the media gate: the marker store and an unpublished probe file both answer `404` to an anonymous request. A failed probe says why (`the certificate chain is not trusted by this host`, `nothing answers on that port`) | [Verify](#verify) |

`ddc` in this table is the compose command with the stack's three files — see [Day-to-day operation](#day-to-day-operation).

If a step fails, the installer stops and prints how to go on:

```shell
sh install.sh --route docker --resume                              # fix the cause, then continue
sh install.sh --route docker --abort --confirm-database dedalo     # undo this install
```

`--abort` stops the stack and removes only what this install created: the files it wrote, the certificates it made, and the volumes it created (the database volume only with `--confirm-database`). The images are kept, and the abort names them (`postgres:18`, `nginx:alpine`, the Dédalo image) with the `docker image rm` command that reclaims the space. A **completed** install is a live instance: `--abort` then undoes only the steps after `stack_engine` — it removes the `dedalo`, `nginx` and `backup` containers (and `certbot`), while PostgreSQL keeps running with the data — and `--resume` starts them again. See [Resume and abort](installer_reference.md#resuming-an-install-resume).

A `--resume` runs in line mode, not on the full screen, and asks again on the terminal for the secrets the remaining steps need.

When the install completes, open `https://<address>/dedalo/` (add `:<port>` for a non-standard HTTPS port) and log in as **`root`**. With a local certificate authority, the browser warns until you install `deploy/certs/dedalo-local-ca.pem` on that computer. Then continue with [after the install](index.md#after-the-install).

The run that completes the install shows the generated `DEDALO_SALT_STRING` once, on a terminal. Keep it with your backups. A `--resume` that completes the install shows it too. If you did not see it (its output went to a file — the end of the run then prints this command), read it from the `private` volume:

```shell
docker compose -f docker-compose.yml -f compose.override.yaml --env-file .dedalo.env exec dedalo grep DEDALO_SALT_STRING /private/.env
```

## The stack

| Service | Image | Role |
| --- | --- | --- |
| `postgres` | `postgres:18` | the system of record |
| `dedalo` | `${DEDALO_IMAGE}:${DEDALO_VERSION}` — a published image, or one built here from `Dockerfile` | the engine; publishes its client into the `client` volume at every start |
| `backup` | the same image as `dedalo` | the scheduled backups ([backups](#backups-from-a-container)) |
| `nginx` | `nginx:alpine` | TCP, TLS, client statics (from the `client` volume), **the media gate** |
| `mariadb` | `mariadb:11` — profile `diffusion` | the publication target |
| `pgvector` | `pgvector/pgvector:pg18` — profile `rag` | the vector store |

The two optional services are behind compose profiles, so they do **not** start unless you ask for them (`ddc --profile diffusion up -d`, `ddc --profile rag up -d`).

The image is **not** a thin Bun image. It also carries a `psql` client that is not older than the PostgreSQL server (an older client refuses to connect to a newer server) and the media toolchain (`ffmpeg`, ImageMagick, poppler, `ocrmypdf`). Both are why the image is large and a local build is slow — and why an image without them would install, then fail at the first upload.

The engine publishes the client of the image it runs into the `client` volume, and nginx serves it from there, never from your checkout. The browser client and the engine speak an exact protocol, so a client from another version breaks pages in ways that look like engine bugs; with the client in the image, they always change together.

### Two places: your host and the containers

Every path on this page lives in one of two places, and confusing them is the most common way to get lost.

| Where | Paths | How you reach them |
| --- | --- | --- |
| **The host** — your checkout | `docker-compose.yml`, `.dedalo.env`, `compose.override.yaml`, `deploy/nginx.docker.generated.conf`, `deploy/certs/` | an ordinary editor, from the checkout directory |
| **Inside the containers** — Docker volumes | `/srv/dedalo/media`, `/private`, `/backups`, `/run/dedalo`, `/srv/dedalo/client` | `ddc exec <service> …` only |

- `/srv/dedalo/` **does not exist on the host**, and it should not. Look inside a volume through a container: `ddc exec nginx ls -l /srv/dedalo/media/`. Never edit the raw volume data under `/var/lib/docker/volumes/`.
- **Every `nginx` command goes through the container**: `ddc exec nginx nginx -t`. A plain `nginx -t` tests the *host's* nginx, if it has one. `open() "/run/nginx.pid" failed (13: Permission denied)` is the tell.
- Not sure where the checkout is? `docker compose ls` prints the path of every running stack's compose file.

## Why the stack is built this way

Four container-specific problems shape the compose file. Read them before you change it: they are where container deployments of Dédalo go wrong.

### 1. The private directory has no parent to live in

Dédalo keeps every secret in a private directory that is a sibling of the code. Inside an image there is no writable parent directory above the code. **Solved by `DEDALO_PRIVATE_DIR=/private`** on a named volume: both the configuration reader and the installer honour that variable, so the whole tree moves together — `.env`, the session store, `ts_state.json`.

!!! danger "No volume, no secrets"
    Without a volume at `/private`, the `.env` the installer writes dies with the container, and the next start refuses (`not installed`, exit `78`) in front of a database that is no longer empty — an install you cannot repeat.

### 2. The socket is invisible across containers

Production serving is socket-only, and a socket in the container's private `/tmp` is invisible to the nginx container. **Solved by relocating the socket to a shared volume** (`SERVER_UNIX_SOCKET=/run/dedalo/dedalo_ts.sock`, the `socket` volume mounted in both). Connecting to a unix socket needs **write** permission on it, and the nginx container runs as another user, so the engine grants the socket `0666` itself right after it starts listening; the socket volume is shared with nginx and nothing else.

!!! tip "Never publish the TCP listener"
    `SERVER_TCP_PORT` adds a TCP listener, but on the container's own loopback (`127.0.0.1`, the `SERVER_TCP_HOST` default): no other container reaches it. Only with `SERVER_TCP_HOST=0.0.0.0` as well does the engine answer on `dedalo:3600` inside the network. If you ever set both, **never add a `ports:` mapping for it**: a published TCP port bypasses nginx — and with it TLS and the entire media gate.

### 3. The engine writes the media rules; nginx reads them

Media access control is enforced by the **web server**, using rule files the **engine generates** into `MEDIA_PATH`. So both containers mount the same media volume: the engine read-write (it writes the rules and the marker store), nginx read-only. The generated site includes **both** rule files where the engine wrote them — `/srv/dedalo/media/dedalo_media_protection_map.nginx.conf` at `http{}` scope and `/srv/dedalo/media/dedalo_media_protection.nginx.conf` in the server — which is why the installer starts the engine first and nginx only once the engine has written them. With the media access mode off, the engine writes no rule file and the site includes neither.

!!! warning "nginx reads media through the engine's group"
    The engine runs as `bun` (uid/gid `1000`) under `umask 0027`, so every media file is `640` inside `750` directories. nginx's workers run as `nginx`, so the stack puts that user into a gid-`1000` group inside the nginx container before nginx starts — the `addgroup` calls at the head of the service's `command:`. Keep them if you replace the command. `group_add: ["1000"]` does **not** do this (it reaches only the master process), and never "fix" a `403` with `chmod o+r`: it makes media world-readable.

### 4. Installing: once, from the terminal

The engine steps run in a throw-away container before the stack starts, so no install surface is ever served (there is none: a server that is not installed refuses to start, exit `78`). Docker's `restart: unless-stopped` has no per-exit-code exception, so a `dedalo` container started by hand before the install restarts about once a minute, printing that refusal each time.

## Choose where the image comes from

Dédalo publishes the engine image — built once per release, signed, and identical byte for byte wherever it is published — to its own registry and to public mirrors. The Image screen (or `--image-source`) chooses where this installation takes it from, and the choice is recorded in `.dedalo.env`: every later update comes from the same place.

| Choice | What happens | Good for |
| --- | --- | --- |
| **`official`** | the stack pulls the published image from one of Dédalo's registries; its signature is verified with `cosign` | almost every installation — no build on your server |
| **`custom`** (`--image-repository`) | the stack pulls from a registry of your own, trusted as pulled | an institution that keeps every image it runs in its own registry |
| **`build`** | the image is built here, from this checkout's last commit (committed files only, so it reports the release version and the commit date, like the production route) | an air-gapped host, a modified image, a version no registry publishes |

Whatever the source, the image's version must be the installer's own (or its `-dev` tag): the engine steps run inside the image with this installer's request format.

### Dédalo's registries

The list is kept in the repository (`engineering/image_registries.json`) and this table is generated from it. The **primary** registry is the one Dédalo runs itself; the **mirrors** carry the same images on public infrastructure. *Not yet available* means Dédalo does not publish there yet: no address is given, and neither the installer nor the update tools offer it.

<!-- BEGIN GENERATED — engineering/image_registries.json · regenerate: bun run registries:gen -->
| Registry | Repository | Role | Status |
|---|---|---|---|
| Dédalo registry (gitdedalo) | — | primary | not yet available — The OCI registry on the gitdedalo host has not been stood up yet (it needs TLS, authenticated push and anonymous pull); until then this entry names no address. |
| GitHub Container Registry | `ghcr.io/dedalia-org/dedalo` | mirror | available |
| Docker Hub | `docker.io/dedalia/dedalo` | mirror | available |
<!-- END GENERATED -->

Images are published per **release**. The tags follow the code server's release names:

| Tag | What it is |
| --- | --- |
| `X.Y.Z` (for example `7.0.1`) | a release. Immutable: once published, a release tag always names the same image |
| `X.Y.Z-dev` | a developer image of unreleased work, built on demand and rebuilt in place — never use it in production |

There is no `latest` tag, on purpose: an installation always names the version it runs.

### Checking the signature

Every published image is signed by Dédalo's release workflow with [Sigstore](https://www.sigstore.dev/) keyless signing: there is no key to distribute, and the signature records which workflow, in which repository, built the image. The installer and the image updater run this check; you can run it yourself:

```shell
cosign verify \
  --certificate-identity-regexp '^https://github\.com/dedalia-org/dedalo/\.github/workflows/image-release\.yml@refs/(tags/v[0-9]+\.[0-9]+\.[0-9]+|heads/master)$' \
  --certificate-oidc-issuer 'https://token.actions.githubusercontent.com' \
  <repository>:<version>
```

The update script also checks that the signed image says it **is** the version you asked for (its `org.opencontainers.image.version` label): a signature alone only proves Dédalo built the image, not which release it is.

### A registry of your own

Copy the published image into your registry **keeping its digest** — a copy that re-packs the image is no longer the image Dédalo signed:

```shell
# image only
docker buildx imagetools create --tag registry.example.org/heritage/dedalo:7.0.1 \
  <repository>:7.0.1

# image AND its signature
cosign copy <repository>:7.0.1 registry.example.org/heritage/dedalo:7.0.1
```

Then install with `--image-source custom --image-repository registry.example.org/heritage/dedalo`. Mirror each new release before you update to it.

### A local build

Building here needs this checkout and the network to fetch the base image, the system packages and the JavaScript dependencies. The first build is slow and parks several gigabytes of build cache (`docker builder prune -af` reclaims it once the build is done). Updates rebuild from the release's git tag, so the checkout must keep its git remote.

### The `.dedalo.env` keys

The image half of `.dedalo.env` is the contract the image updater reads:

| Key | Value | Example |
| --- | --- | --- |
| `DEDALO_COMPOSE_FILE` | the stack file in this directory | `docker-compose.yml` (`docker-compose.simple.yml` on the trial route) |
| `DEDALO_IMAGE` | the repository, **without** a tag | a repository from the table above, yours, or `localhost/dedalo` for a local build |
| `DEDALO_VERSION` | the version this installation runs — the image tag | `7.0.1`, or `7.0.1-dev` |
| `DEDALO_IMAGE_MODE` | `pull` (a registry) or `build` (a local build) | `pull` |
| `DEDALO_IMAGE_VERIFY` | `cosign` (check Dédalo's signature on every pull) or `none` | `cosign` |

`DEDALO_VERSION` is a **pin**: the stack runs exactly that version until the [image updater](#upgrading) moves it. The one time you edit it by hand is [a rollback after a green update](#rolling-back-by-hand).

## Configuration

Process environment wins over `/private/.env`, so the compose file is the place for **operations** keys (pool sizes, timeouts, the access log), and the installer owns the rest inside the volume. The full key catalogue is the [configuration reference](../config/index.md).

!!! note "Both compose stacks declare `DEDALO_SUPERVISED: \"true\"`"
    `restart: unless-stopped` is what brings the engine back after a planned exit, so the `dedalo` service's `environment:` declares it. Keep it if you write your own stack, and never put it in `/private/.env`: the engine reads this key from the process environment only. On an image install the [code update panel](../management/updates/updating_code.md) does not swap the code in place — a new release arrives as a new image, as described in [upgrading](#upgrading).

The `dedalo` service also declares where its image came from (`DEDALO_CONTAINER_IMAGE`, `DEDALO_CONTAINER_IMAGE_MODE`, mirrored from `.dedalo.env`) and where it publishes its client (`DEDALO_CLIENT_PUBLISH_DIR`). Keep all three: the panel reads the first two, and without the third nginx serves an empty `client` volume.

To read what the installer wrote:

```shell
ddc exec dedalo cat /private/.env
```

## TLS

The certificate nginx serves is the one `stack_tls` provided:

- **Let's Encrypt:** issued into the `dedalo_letsencrypt` volume; the `certbot` service in `compose.override.yaml` renews it through the running nginx, which reloads every six hours to pick renewals up.
- **A local certificate authority or your institution's files:** in `deploy/certs/`, mounted at `/etc/dedalo/certs`.

TLS is not optional on this route: `SESSION_COOKIE_SECURE` is `true`, so over plain HTTP the browser discards the session cookie and nobody can log in.

!!! note "The local CA: one step on each staff computer"
    A local certificate authority is trusted only where you install it, so until you do, browsers warn about the site. Install `deploy/certs/dedalo-local-ca.pem` on each computer that uses Dédalo. That authority's **private key** is the most powerful secret this install creates: whoever holds it can mint a certificate those computers trust, for any hostname. It stays in `deploy/certs/` — never committed, never inside an image. If it may have escaped, rotate it.

### Rotating TLS material

The same script that issued the local CA rotates it, so the first issue and every rotation cannot drift:

```shell
# a new local authority and a new site certificate
deploy/dedalo-tls-rotate.sh --mode local-ca --host dedalo.example.org \
  --compose-file docker-compose.yml

# a replacement certificate from your institution
deploy/dedalo-tls-rotate.sh --mode existing \
  --cert /path/fullchain.pem --key /path/privkey.pem \
  --compose-file docker-compose.yml
```

Pass `--compose-file docker-compose.yml` (the script defaults to the simple stack) so it can reload nginx for you; it tells you when it could not, and `ddc exec nginx nginx -s reload` finishes the job.

- **It archives first.** Everything in `deploy/certs/` moves to `deploy/certs/rotated-<UTC stamp>/` (mode `700`, never overwritten) before anything new is written, so an interrupted rotation can be put back.
- **Each authority carries its issue stamp** in its subject (`CN=Dedalo local CA <stamp>`), so you can tell which entry to delete from a trust store.
- **Install the new CA on every computer, then delete the old entry.** Until the old one is gone, a certificate signed with the old key is still trusted there.

!!! warning "An image built before 2026-08-28 may contain your CA private key"
    Until then the image copied the whole build context, which could include `deploy/certs/`. Any image built on such a host may carry `dedalo-local-ca.key`. Treat it as compromised: rotate as above, install the new CA everywhere and delete the old entry, rotate `POSTGRES_PASSWORD`, then rebuild and re-distribute the image from a current checkout. A clean image has no `deploy/` at all:

    ```shell
    docker run --rm --user 0 <image> ls /opt/dedalo/master_dedalo/deploy
    # expected: "No such file or directory"
    ```

    The full procedure, including the database-password step, is §13 of `engineering/PRODUCTION.md` in the repo.

## Day-to-day operation

Every compose command carries the stack file, the installer's override and the environment file. Compose does not load `compose.override.yaml` beside `docker-compose.yml` on its own, and without `--env-file .dedalo.env` it resolves the built-in defaults instead of your install's — no TLS, no image pin. Define a shell function once, and every command on this page uses it:

```shell
ddc() { docker compose -f docker-compose.yml -f compose.override.yaml --env-file .dedalo.env "$@"; }
```

The function exists only in the shell that defined it: add the line to your `~/.bashrc` to keep it. (It is `ddc`, not `dc`, because `dc` is a calculator many systems install.)

```shell
ddc ps                        # every service, and its health
ddc logs -f dedalo            # follow the engine
ddc restart dedalo            # after an ops env change that needs no recreate
ddc exec dedalo bash          # a shell in the engine container
ddc stop                      # stop, keep the data
ddc down                      # remove the containers, KEEP the volumes
ddc down -v                   # remove the volumes too — DESTROYS the instance
```

A change in `docker-compose.yml` needs `ddc up -d` (recreate), not `restart` — `restart` reuses the existing container and its old environment.

**The engine's healthcheck also acts.** It is `scripts/ops/container_watchdog.sh`: it probes `/health` over the socket, reports *unhealthy* to `ddc ps`, and after **three consecutive red probes 30 seconds apart** sends `SIGTERM` to the engine so it drains and `restart: unless-stopped` recycles the container. Docker Engine itself never restarts an unhealthy container. It escalates only after the container has answered green at least once.

## Backups from a container

The stores do not change; only the way you reach them does (the [backup](../management/backup.md) page lists them). Volume names carry the compose project prefix `dedalo_` — confirm with `docker volume ls`.

```shell
# 1. The matrix database.
ddc exec -T postgres sh -c 'pg_dump -F c -b -U "$POSTGRES_USER" "$POSTGRES_DB"' > backup_$(date +%F).custom

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

A container installation updates by replacing its **image** — the code lives inside it, so there is no tree to swap. One script does the whole update, from the checkout:

```shell
./deploy/dedalo-image-update.sh --version 7.0.2
```

The version is a release the code server lists — the [code update panel](../management/updates/updating_code.md) shows them, with their release notes and this exact command — or a `X.Y.Z-dev` developer image. What the script does, each step refusing before the next one changes anything:

1. **Reads `.dedalo.env`** to know where the image comes from. If the file does not say, it prints the exact lines to add and stops (see [an installation from before the image pin](#an-installation-from-before-the-image-pin)).
2. **Checks the version**: it must move forward from the pinned `DEDALO_VERSION` (the same version only for a `-dev` image), and the running engine must agree it is the next step on the upgrade path.
3. **Takes a database backup** through the stack's `backup` service and checks it is readable (`/backups/db/<time>.<database>.postgresql_pre-image-update.custom.backup`). There is no update without it; `--no-backup` waives it, and is never the default.
4. **Keeps the running image** under a `rollback-<time>` tag.
5. **Gets the new image**: `pull` mode pulls `<DEDALO_IMAGE>:<version>` and, with `DEDALO_IMAGE_VERIFY=cosign`, refuses it unless the signature checks out; `build` mode checks out the release tag `v<version>` in this checkout and builds it.
6. **Re-pins `DEDALO_VERSION`** in `.dedalo.env` — the only line it changes.
7. **Recreates `dedalo` and `backup`** — never `postgres` or `nginx` — and waits for the engine's healthcheck, up to 15 minutes (`--health-timeout`), since boot migrations on a large database take time.
8. **Healthy**: done, and only the newest rollback tag is kept. **Not healthy**: it puts the previous image back under its old version, re-pins it, brings it up and says *rolled back* — or, if even that is not healthy, *rollback failed* with the path of the backup it took.

It exits `0` only when the new version is up and healthy.

- **Boot migrations run automatically** when the engine starts. A rollback across a release that added a migration may need the database backup the script took.
- **The seed is never re-applied.** The restore refuses a non-empty database.
- **The client follows the image.** Reload open pages after an update.
- **Host-side files come from your checkout, not from the image**: `deploy/`, the compose files. When a release's notes say they changed, update the checkout as well.
- **One update at a time**: a second run while one is in progress refuses.

### Rolling back by hand

The script rolls back on its own only while the update is running. If a problem shows up later, go back by hand — the script refuses to move to an older version, so this is the one time you edit `DEDALO_VERSION` yourself:

1. **Make sure the old image is on this host.** `docker image ls <DEDALO_IMAGE>` lists it. If its version tag is gone, the last update kept it as `rollback-<time>`: `docker tag <DEDALO_IMAGE>:rollback-<time> <DEDALO_IMAGE>:<previous version>`. In `pull` mode you can also pull the previous version again.
2. **Re-pin it**: set `DEDALO_VERSION=<previous version>` in `.dedalo.env`.
3. **In `build` mode, return the checkout** to your branch (the script left it detached at `v<new version>`).
4. **Restore the database only if the newer release migrated it** in a way the older one cannot read (its release notes say so), before the older engine starts on it: `ddc stop dedalo`, then restore the dump the update took with the engine's restore door, as in [restore a backup](../management/backup.md#restore-a-backup-for-the-work-system). Everything recorded since that update is lost with it.
5. **Recreate the engine** — and only it and the backup service: `ddc up -d --no-build dedalo backup`.

### An installation from before the image pin

Stacks from before 2026-10 built their image with a bare `docker compose build` and have no image keys in `.dedalo.env`. Such an installation needs the keys once — the script refuses with these exact lines until they are there. For an installation that built its image here:

```shell
DEDALO_COMPOSE_FILE=docker-compose.yml
DEDALO_IMAGE=localhost/dedalo
DEDALO_VERSION=7.0.1
DEDALO_IMAGE_MODE=build
DEDALO_IMAGE_VERIFY=none
```

`DEDALO_VERSION` is the version this checkout declares (the script prints it). Then build once under the new name and recreate the engine:

```shell
docker compose -f docker-compose.yml -f deploy/compose.build.yml --env-file .dedalo.env build dedalo
docker compose -f docker-compose.yml --env-file .dedalo.env up -d
```

The first update from an image built before the update channel existed needs `--skip-version-check`: that image cannot answer the version question yet.

### The host updater (optional)

With the host updater installed, the *Update code* panel offers **Request this update** instead of only showing the command: an administrator chooses the release in the browser, and the host runs the same script within about a minute. It is **off by default**.

```shell
sudo ./deploy/dedalo-image-updater.sh install-units
```

That writes `/etc/systemd/system/dedalo-image-updater.service` and `.timer` with this stack's path in them, and starts the timer: one pass a minute, run as the owner of the checkout (who must be in the `docker` group; `--user` names another account). `print-units` shows the two files without installing anything.

- **The panel only asks for a version.** The repository, pull or build, signature checking and every flag come from `.dedalo.env` and the script; the engine is never given access to Docker. A request still needs the superuser, maintenance mode and the normal upgrade path.
- **Never onto developer images from a release.** A request for an `X.Y.Z-dev` image is accepted only when the installation already runs one.
- **Never without a backup.** The host updater never waives the backup or the version check.
- **An interrupted update is reported, not repeated.** Request it again from the panel once you have looked at why.

On a host without systemd (a NAS, for instance), run the pass from the checkout owner's crontab instead:

```shell
* * * * * cd /path/to/master_dedalo && ./deploy/dedalo-image-updater.sh >>/path/to/dedalo-image-updater.log 2>&1
```

To turn it off: `sudo ./deploy/dedalo-image-updater.sh uninstall-units`.

## Verify

```shell
ddc ps                                                   # postgres, dedalo, backup healthy; nginx Up
ddc exec dedalo curl --fail --unix-socket /run/dedalo/dedalo_ts.sock http://localhost/health
curl --fail https://<address>/health                     # through nginx
curl -I https://<address>/dedalo/media/.publication/auth/   # 404: the marker store is never served
ddc exec nginx nginx -T 2>/dev/null | grep -n -E '^\s*include .*dedalo_media_protection'
```

`nginx` shows *Up*, never *healthy*: it has no healthcheck. The last line must print the two media includes — `dedalo_media_protection_map.nginx.conf` and `dedalo_media_protection.nginx.conf`, both under `/srv/dedalo/media/`. Then log in, upload an image, and open it: the derivative and its thumbnail appear.

Open `https://<address>/dedalo/` from the computer you will actually work on, where `<address>` is the name you installed with: the certificate names that name only, so the machine's IP address or `localhost` gives a certificate error. The name must resolve to the machine running Docker from that computer — through DNS, or a hosts entry pointing at the server, the bridged VM, or `127.0.0.1` with Docker Desktop (add `:<port>` when you published another HTTPS port or forward one to a NAT VM). `192.168.65.x` is Docker Desktop's internal network, not an address of your machine.

## When it does not work

Container-specific symptoms; installer refusals are in [Troubleshooting › Docker and trial refusals](troubleshooting.md#docker-and-trial-refusals), and everything else in [troubleshooting](troubleshooting.md).

| Symptom | Cause | Fix |
| --- | --- | --- |
| `required variable POSTGRES_PASSWORD is missing a value` | the command has no `--env-file .dedalo.env` | use the [`ddc` function](#day-to-day-operation) |
| `stack_up`: `nginx did not stay up (…)` | nginx refuses its configuration; the sentence quotes its `[emerg]` line | fix what the line names, then `--resume` |
| `stack_health`: `expected 200, got 000 — the certificate chain is not trusted by this host` | the certificate's CA is not in this host's trust store | install the CA on the host (see [what you need](#what-you-need)), then `--resume` |
| `pull access denied for localhost/dedalo`, or *No such image* | the installation builds its image here and that version was never built on this host — or the command has no `--env-file .dedalo.env` | build it — [a local build](#a-local-build) — or add the flag |
| `manifest unknown` pulling a Dédalo image | that registry does not publish that version | pick a version from the panel's list, another registry, or a local build |
| `dedalo-image-update.sh` refuses: `.dedalo.env does not say where this installation's image comes from` | an installation from before the image pin | [add the keys once](#an-installation-from-before-the-image-pin) |
| The panel shows the host updater as *not heard from recently* | its timer stopped, Docker or the host is down, or it was uninstalled | `systemctl status dedalo-image-updater.timer`, `journalctl -u dedalo-image-updater` |
| Pages break in odd ways right after an update | a browser tab still holds the previous client | reload the page |
| `failed to bind host port 0.0.0.0:80/tcp: address already in use` | a web server on the host already holds port 80 or 443 | stop it, or install with other ports |
| `nginx -t`: `open() "/run/nginx.pid" failed (13: Permission denied)` | you ran the **host's** nginx | `ddc exec nginx nginx -t` |
| Every request is a **502** | nginx cannot write to the socket | the socket volume must be shared — [problem 2](#2-the-socket-is-invisible-across-containers) |
| The `dedalo` container restarts about once a minute; its log says `[boot] REFUSED — not installed` | `/private` is not on a volume, or the stack was started before the install | [problem 1](#1-the-private-directory-has-no-parent-to-live-in); otherwise run the installer |
| Newly uploaded media is a **403**, older media serves | nginx's workers are not in the engine's group | keep the `addgroup` calls in nginx's `command:` — [problem 3](#3-the-engine-writes-the-media-rules-nginx-reads-them) |
| Every media file **404s** for a logged-in user | the derivative is not produced yet, or the browser has no media cookie (log out and in again) | [Troubleshooting › Media](troubleshooting.md#media) |
| Uploads fail with **413** | `client_max_body_size` | the generated site sets it; check you did not replace it |
| Login "succeeds" but bounces back to the form | plain HTTP, and `SESSION_COOKIE_SECURE` is on | reach the site over `https://` |
