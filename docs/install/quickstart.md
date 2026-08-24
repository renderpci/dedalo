# Simple install

> See also: [Installation hub](index.md) · [Docker (full stack)](docker.md) · [Production install](production.md) · [Troubleshooting](troubleshooting.md)

A complete, working Dédalo on one machine, in one command. Everything is installed for you — database, media tools, web server — and you finish either by answering a few questions in the terminal or by filling a form in your browser.

This page is for an institution that wants Dédalo **on its own network**: a museum, an archive, a research group. It is not a cut-down Dédalo — it is the same engine, the same data, the same features. What it leaves out is the hardening a public server needs, and that is the whole of the difference.

**HTTPS is set up for you**, whichever way you install: a Let's Encrypt certificate if the machine has a public domain name, or a local certificate authority if it lives on your own network with no public name. Plain HTTP is available, but only as a deliberate choice for a throwaway trial.

!!! danger "Media is served without access control"
    The one thing this install does not set up is **media access control**: every image, document and recording is readable by anyone who can reach the server, without logging in. TLS protects those files in transit; it does not decide who may fetch them.

    That is fine for a collection that is public anyway, or an instance only your staff can reach. It is **wrong for a restricted fonds, an embargoed deposit, or personal data**. For those, use the [full container stack](docker.md) or the [production install](production.md), which add the engine-enforced media gate.

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

- **Ports 80 and 443 must be free.** A web server already running here is the one thing that will stop you. Port 80 stays in use even with HTTPS: it redirects to `https://`, and it is how Let's Encrypt proves you still control the domain at each renewal.
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

**The first question is how people will reach this Dédalo**, because that decides the certificate:

| Answer | What happens | Choose it when |
| --- | --- | --- |
| **1. A public domain name** *(default)* | a **Let's Encrypt** certificate, renewed automatically, trusted by every browser with no warning | the name resolves publicly to this machine and port 80 is reachable from the internet |
| **2. Only our local network** | a **local certificate authority** is created here; real encryption, and no warning on machines where you install the CA file | there is no public domain — the usual case for a museum LAN |
| **3. I already have a certificate** | your files are copied in and used | your institution issues certificates, or you have a wildcard |
| **4. No HTTPS** | plain HTTP, and it asks you to confirm | a throwaway trial on a laptop, never for real records |

Option 1 fails fast if the name does not point here, and offers a Let's Encrypt **staging** dry run first so a misconfiguration does not burn your rate limit.

Then it asks for:

| Question | What it means | If unsure |
| --- | --- | --- |
| Short code for your institution | an internal identifier, letters and digits | `dedalo` |
| Full name | shown on the login screen | your institution's name |
| Working languages | Dédalo language codes, comma-separated | `lg-eng,lg-spa` |
| Thesauri to install now | controlled vocabularies to load | `none` — you can add them later |
| Locale, time zone | the time zone stamps every record | your own |
| Password for root | the administrator account | choose a strong one and store it |

Then it builds the image (slow the first time — it is downloading the media toolchain), starts PostgreSQL, installs Dédalo, and starts the server. The database password is generated for you; nobody ever needs to type it.

When it finishes, open the `https://…` address it prints and log in as **root** with the password you chose. There was never a moment when an unauthenticated visitor could have reached the installer.

!!! note "Option 2: one step on each staff computer"
    A local certificate authority is trusted only where you install it, so until you do, browsers warn about the site. The script prints the path to `deploy/certs/dedalo-local-ca.pem` and how to install it on Windows, macOS and Linux. Until then the connection is still encrypted — the browser simply cannot vouch for who is on the other end.

!!! note "It refuses to run twice"
    Installing again would mean restoring the seed into a database that is no longer empty, which the engine refuses — a second install is never a repair. To start over you must destroy the data first: `docker compose -f docker-compose.simple.yml down -v`.

## Path 2 — browser wizard

```shell
./install.sh --wizard
```

It asks the **certificate** question above and nothing else, sets HTTPS up, starts everything, and stops. Then you open the `https://…` address it prints and answer the rest in the browser: because nothing is configured yet, the engine serves the **install wizard** instead of a login form. The screens are described in the [installer reference](installer_reference.md#the-browser-wizard).

!!! warning "TLS comes first here, and that is not an accident"
    The wizard sends the root password **you are about to choose** across the network. Over plain HTTP anyone on the same switch reads it. So the certificate is set up before the wizard is served, not as a step inside it.

At the **database** step, enter the values the script prints:

| Field | Value |
| --- | --- |
| Host | `postgres` |
| Port | `5432` |
| Database | `dedalo` |
| User | `dedalo` |
| Password | *(generated — the script prints it, and it is in `.dedalo.env`)* |

You never need that password again after the wizard: the database port is not published, so only the other containers can reach it.

At **Save config** the engine writes its configuration and restarts itself — that is deliberate, configuration is read once at boot. Leave the tab open: the **Verify** button retries, and even a reload resumes the wizard. Work through to **Finish**, which is refused unless the root account really exists.

??? tip "The no-certificate variant"
    Running the compose file directly still works and needs no certificate — plain HTTP, for a quick look on a laptop:

    ```shell
    docker compose -f docker-compose.simple.yml up -d
    ```

    Then `http://localhost/dedalo/core/page/`, with database `dedalo` / user `dedalo` / password `dedalo`. Set `POSTGRES_DB`, `POSTGRES_USER` and `POSTGRES_PASSWORD` in your environment first to change them. Do not use this for real records.

!!! warning "The wizard is reachable without a login until you finish it — so say who you are"
    A fresh instance has no users, so until you press *Finish* anyone the engine admits can drive the installer. That is why the engine admits almost nobody by default: with `DEDALO_INSTALL_ALLOWED_IPS` unset the wizard answers **the local machine only**, and in a container that means nobody, because the request arrives through nginx and the engine sees your workstation's real address. So the browser wizard needs the address named before it will answer — add it to the `dedalo` service's `environment:` in `docker-compose.simple.yml`:

    ```yaml
    DEDALO_INSTALL_ALLOWED_IPS: "192.168.1.50"     # the machine you browse from
    ```

    Name the real address of your workstation (a range such as `10.0.0.0/24` also works). `loopback` will **not** work here, for the same reason. `any` admits every address — only behind a firewall, and never left in place after *Finish*. HTTPS stops the password being readable in transit; it does not stop someone else opening the wizard.

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

The simple stack is `docker-compose.simple.yml` plus one of the two proxy configurations in `deploy/`. Against the full stack it drops exactly two things.

| Missing | Consequence | Where it comes back |
| --- | --- | --- |
| **Media access control** | the proxy serves the media tree openly — no per-record and no per-project checks, no login required. This is the one that matters | [the media gate](docker.md#3-the-engine-writes-the-media-rules-the-proxy-reads-them) |
| **The optional subsystems** | no MariaDB publication target and no pgvector store; those compose profiles exist only in the full file | [the stack](docker.md#the-stack) |

TLS is **not** on that list any more: the simple install sets it up, and `SESSION_COOKIE_SECURE` stays `true` unless you explicitly choose the no-HTTPS mode.

**Moving up is additive, not a reinstall.** The volume names are the same as the full stack's, so the database, the media and the secrets stay exactly where they are. You set `DEDALO_MEDIA_ACCESS_MODE`, switch the proxy to `deploy/nginx.conf`, and wire the [media gate](docker.md#step-10-turn-the-media-gate-on). Follow [Docker](docker.md) from step 3 onward; skip its install steps, because your instance is already installed.

## When it does not work

| Symptom | Cause | Fix |
| --- | --- | --- |
| `port is already allocated` | something else is on port 80 or 443 | stop it, or change the `ports:` mapping in `docker-compose.simple.yml` |
| The certificate request fails | the domain does not resolve to this machine, or port 80 is not reachable from the internet | re-run and pick option 2, or fix DNS and the firewall first |
| "Your connection is not private" | option 2: this computer does not trust your local CA yet | install `deploy/certs/dedalo-local-ca.pem` — the script prints how |
| The wizard appears when you expected a login | nothing is configured yet — this is path 2 working | fill it in, or run `./install.sh` on a clean stack |
| A login form appears when you expected the wizard | the instance is already installed | log in; to start over, `down -v` first |
| Login seems to work, then returns to the form | `SESSION_COOKIE_SECURE` is `true` but the page is plain HTTP — the browser discards the cookie | reach it over `https://`, or re-run and choose a certificate option |
| `./install.sh` says an instance already exists | the `dedalo_private` volume is there from an earlier run | `down -v` to destroy it, or keep the instance you have |

Everything else: [troubleshooting](troubleshooting.md).
