# Simple install

> See also: [Installation hub](index.md) · [Docker (full stack)](docker.md) · [Production install](production.md) · [Troubleshooting](troubleshooting.md)

A complete, working Dédalo on one machine, in one command. Everything is installed for you — database, media tools, web server — and you finish either by answering a few questions in the terminal or by filling a form in your browser.

This page is for an institution that wants Dédalo **on its own network**: a museum, an archive, a research group. It is not a cut-down Dédalo — it is the same engine, the same data, the same features. What it leaves out is the hardening a public server needs, and that is the whole of the difference.

!!! danger "Not for a server on the internet"
    This install has **no HTTPS** and **no media access control**. Passwords travel in clear text, and anyone who can reach the machine can read every image, document and recording in it without logging in.

    That is an acceptable trade on a machine only your own network reaches. It is not acceptable on a public address. If your Dédalo will be reachable from the internet, use the [full container stack](docker.md) or the [production install](production.md) instead — they add TLS and the engine-enforced media gate, and they are not much longer.

## What you need

Docker, and nothing else. No database to install, no Bun runtime, no `ffmpeg` — they all live inside the image.

**On Linux you do not have to install Docker first.** If it is missing, stopped, or your user cannot reach it, [path 1](#path-1-guided-terminal) detects which of the three it is and offers to fix it — showing the exact commands and asking before it runs anything as root. On macOS it cannot: install [Docker Desktop](https://docs.docker.com/desktop/) yourself, start it, and run the script after.

To check by hand first:

```shell
docker --version                 # Docker Engine
docker compose version           # v2 or newer
docker info                      # daemon reachable? errors here = daemon not running
```

Then get the code, and stay in that directory:

```shell
git clone <your-dedalo-remote> dedalo
cd dedalo/master_dedalo
```

Two things about the machine itself:

- **Port 80 must be free.** A web server already running here is the one thing that will stop you.
- **About 8 GB of free disk.** Measured on a clean Ubuntu 26.04 box: the engine image is ~2.5 GB (the media toolchain and the PostgreSQL client dominate it), `postgres:18` is ~0.7 GB, `nginx:alpine` ~0.1 GB, and the build parks a further ~3 GB of cache that you can only reclaim **after** it finishes, with `docker builder prune -af`. Below that floor the install dies part-way through the database restore with `No space left on device`. `install.sh` checks this for you.

!!! note "`docker info` fails with *permission denied*"
    Your user is not in the `docker` group — standard Docker setup, not a Dédalo step. [Path 1](#path-1-guided-terminal) offers to do this for you and then re-enters itself so the new group applies immediately. By hand it needs a fresh login:

    ```shell
    sudo usermod -aG docker "$USER"
    newgrp docker           # or log out and back in
    ```

## Choose how you answer the questions

The installer needs the same handful of answers either way. You choose where you give them.

| | [Path 1 — guided](#path-1-guided-terminal) | [Path 2 — browser wizard](#path-2-browser-wizard) |
| --- | --- | --- |
| You answer in | the terminal | a web form |
| Commands to type | **one** | **one** |
| Install surface exposed | never | until you press *Finish* |
| Good for | most people | when a form is easier than prompts, or you want the diagnostics panel |

Both produce exactly the same instance. Path 1 is the recommendation, because
nothing unauthenticated is ever served.

## Path 1 — guided (terminal)

```shell
./install.sh
```

It asks for:

| Question | What it means | If unsure |
| --- | --- | --- |
| Short code for your institution | an internal identifier, letters and digits | `dedalo` |
| Full name | shown on the login screen | your institution's name |
| Working languages | Dédalo language codes, comma-separated | `lg-eng,lg-spa` |
| Thesauri to install now | controlled vocabularies to load | `none` — you can add them later |
| Locale, time zone | the time zone stamps every record | your own |
| Password for root | the administrator account | choose a strong one and store it |

Then it builds the image (slow the first time — it is downloading the media toolchain), starts PostgreSQL, installs Dédalo, and starts the server. The database password is generated for you; nobody ever needs to type it.

When it finishes, open the address it prints:

```text
http://localhost/dedalo/core/page/
```

Log in as **root** with the password you chose. There was never a moment when an unauthenticated visitor could have reached the installer.

!!! note "It refuses to run twice"
    Installing again would mean restoring the seed into a database that is no longer empty, which the engine refuses — a second install is never a repair. To start over you must destroy the data first: `docker compose -f docker-compose.simple.yml down -v`.

## Path 2 — browser wizard

```shell
docker compose -f docker-compose.simple.yml up -d
```

Then open `http://localhost/dedalo/core/page/`. Because nothing is configured yet, the engine serves the **install wizard** instead of a login form, and you answer the same questions there. The screens are described in the [installer reference](installer_reference.md#the-browser-wizard).

At the **database** step, enter these — they are what the stack just created:

| Field | Value |
| --- | --- |
| Host | `postgres` |
| Port | `5432` |
| Database | `dedalo` |
| User | `dedalo` |
| Password | `dedalo` |

!!! note "Why such a plain database password"
    The database port is never published: only the other containers on the internal network can reach it. Set `POSTGRES_DB`, `POSTGRES_USER` and `POSTGRES_PASSWORD` in your environment before `up -d` if you want your own, and enter those in the wizard instead.

At **Save config** the engine writes its configuration and restarts itself — that is deliberate, configuration is read once at boot. Leave the tab open: the **Verify** button retries, and even a reload resumes the wizard. Work through to **Finish**, which is refused unless the root account really exists.

!!! warning "The wizard is reachable without a login until you finish it"
    A fresh instance has no users, so until you press *Finish* anyone who can reach port 80 can drive the installer. On a trusted network for the few minutes this takes, that is usually fine. If it is not, either use path 1, or restrict it by address first — add to the `dedalo` service's `environment:` in `docker-compose.simple.yml`:

    ```yaml
    DEDALO_INSTALL_ALLOWED_IPS: "192.168.1.50"     # the machine you browse from
    ```

    Name the real address of your workstation. `loopback` will **not** work: the request arrives through nginx, so the engine sees your actual address, not the local one.

## After the install

1. Create a normal **administrator** user and keep `root` for emergencies.
2. Add your [users and projects](../management/users_and_permissions.md).
3. Install the [hierarchies](../management/install_new_hierarchies.md) your collection needs, if you skipped them.
4. **Set up backups** — [backup](../management/backup.md). Three things matter here: the database, the media originals, and the `private` volume (your secrets — without it a restored database is an instance you cannot start). A database dump alone is not a backup.

## Everyday commands

```shell
docker compose -f docker-compose.simple.yml ps          # is it running?
docker compose -f docker-compose.simple.yml logs -f dedalo
docker compose -f docker-compose.simple.yml stop        # stop, keep everything
docker compose -f docker-compose.simple.yml up -d       # start again
```

To back up, and to update to a newer Dédalo, the container procedures are the same as the full stack's: [backups](docker.md#backups-from-a-container) and [upgrading](docker.md#upgrading) — substituting `-f docker-compose.simple.yml` in each command.

## What exactly is missing, and how to add it later

Two files differ from the full stack: `docker-compose.simple.yml` and `deploy/nginx.simple.conf`. Between them they drop three things.

| Missing | Consequence | Where it comes back |
| --- | --- | --- |
| **TLS** | passwords and session cookies cross the network in clear text. `SESSION_COOKIE_SECURE` is set to `false`, because a browser silently discards a `Secure` cookie over `http://` and nobody could log in | [TLS](docker.md#tls) |
| **Media access control** | `deploy/nginx.simple.conf` serves the media tree openly — no per-record and no per-project checks, no login required | [the media gate](docker.md#3-the-engine-writes-the-media-rules-the-proxy-reads-them) |
| **A domain** | the proxy answers on any name, so there is nothing to configure and nothing that verifies who you are | [step 3](docker.md#step-3-set-your-domain-and-the-ops-keys) |

**Moving up is additive, not a reinstall.** The volume names are the same as the full stack's, so the database, the media and the secrets stay exactly where they are. You add a certificate, set `DEDALO_MEDIA_ACCESS_MODE`, switch the proxy to `deploy/nginx.conf`, and wire the [media gate](docker.md#step-10-turn-the-media-gate-on). Follow [Docker](docker.md) from step 3 onward; skip its install steps, because your instance is already installed.

## When it does not work

| Symptom | Cause | Fix |
| --- | --- | --- |
| `port is already allocated` | something else is on port 80 | stop it, or change the `ports:` mapping in `docker-compose.simple.yml` |
| The wizard appears when you expected a login | nothing is configured yet — this is path 2 working | fill it in, or run `./install.sh` on a clean stack |
| A login form appears when you expected the wizard | the instance is already installed | log in; to start over, `down -v` first |
| Login seems to work, then returns to the form | `SESSION_COOKIE_SECURE` got turned back on without TLS | leave it `false` on plain HTTP |
| `./install.sh` says an instance already exists | the `dedalo_private` volume is there from an earlier run | `down -v` to destroy it, or keep the instance you have |

Everything else: [troubleshooting](troubleshooting.md).
