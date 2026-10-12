# Production install

> See also: [Installation hub](index.md) · [Installer reference](installer_reference.md) · [The web server site](reverse_proxy.md) · [Several instances on one host](multi_instance.md) · [Troubleshooting](troubleshooting.md) · [Upgrading](upgrading.md)

The Production route is the recommended way to run Dédalo for a museum, an archive or any institution. The installer turns a clean server into a running, TLS-protected, supervised and backed-up **instance**: one named Dédalo with its own user, database, media, socket, units and web site. This page explains how to run it, what each step does, and how to check or repair each step by hand.

The installer is the procedure. The sections on each step are reference for system administrators: what to look at, and what the installer has already done. They are not a second way to install.

## Overview

The engine is a single long-lived **Bun** process, run by systemd as the instance's own user. It listens on a **unix socket**. The web server (nginx or Apache) owns TCP and TLS, serves the published client files and the media bytes, and enforces media access control. PostgreSQL 18 on the same host is the system of record.

Everything the installer creates is named after the **instance name** you choose (`<i>` below — for example `prado`):

| Path or name | What |
| --- | --- |
| `ded_<i>` | the system user and group the instance runs as (no login shell) |
| `/home/ded_<i>/dedalo/` | the release tree (an extracted release, not a git clone) |
| `/home/ded_<i>/private/` | the private directory (`0700`): `.env` (`0600`), the session store, the state file, the engine's install record |
| `/home/ded_<i>/backups/` | the backups (the default `--backup-dir`) and the code-update backups (`backups/code`) |
| `/srv/dedalo/<i>/` | the web site's root (`0750`) |
| `/srv/dedalo/<i>/dedalo/media/` | `MEDIA_PATH`: originals, derivatives and the media-gate files (`0750`, never world-readable) |
| `/srv/dedalo/<i>/client/` | the client the engine publishes at every start; the web server serves it from here |
| `/run/dedalo-<i>/dedalo_ts.sock` | the engine's socket (systemd `RuntimeDirectory`) |
| `dedalo_<i>` | the database, owned by the role `ded_<i>` (peer authentication, no password) |
| `dedalo-ts@<i>` | the engine's systemd unit, with its watchdog, rollback, restart and backup units |
| `/opt/dedalo/bun/<pin>/bun` | the Bun runtime at the release's pin, **owned by root** and shared by the instances on that pin |
| `/opt/dedalo/instances/<i>/bin/` | the root-owned copies of the scripts root-run units execute |
| `/var/lib/dedalo-install/<i>/` | the installer's record of the host steps (`0700`, root) |

The layout follows one rule, by role. **`/home/ded_<i>/` is the instance directory**: owned by `ded_<i>`, it holds the release tree, the private directory and the backups, and an in-app code update renames the release tree only inside it (`/home` stays root's). **What root-started units run** — the runtime and the root-run scripts — lives in root-owned directories under `/opt/dedalo/`, outside every instance directory. A [host set up by hand](manual_host.md#the-layout) follows the same rule with its own paths.

Several instances can share one host; each runs the installer with its own name. See [Several instances on one host](multi_instance.md).

### Mandatory: a supervisor that declares itself

Dédalo must run under a process manager that **restarts it** and **declares `DEDALO_SUPERVISED=true` in the process environment**. A code update replaces the tree and then exits the server with code `75`, so that the supervisor boots the new code; without a declared supervisor the [code update panel](../management/updates/updating_code.md) refuses every update (*No supervisor declared*) rather than leave the server dead.

| Launch method | Where the declaration is |
| --- | --- |
| this route's `dedalo-ts@<i>` unit | `Environment="DEDALO_SUPERVISED=true"`, with `Restart=always` and `SuccessExitStatus=75` — written by the installer |
| the compose stacks | the `dedalo` service's `environment:` |
| a [host set up by hand](manual_host.md) | its unit, `deploy/dedalo-ts.service` |
| development | `bun run start:supervised` or `bun run dev`; plain `bun run start` is unsupervised |

A `DEDALO_SUPERVISED` line in `.env` is **ignored**: that file is read by every launch method, the unsupervised `bun run start` included.

## Before you start

**A supported system.** Ubuntu 26.04 LTS, Debian 13, or RHEL, Rocky Linux or AlmaLinux 10, with systemd. The installer supports the newest release of each and refuses anything else, before it changes anything. You run it as root.

**The bootstrap's tools.** `curl`, `unzip` and `sha256sum`, which `install.sh` needs before the installer can install anything: `apt-get install curl unzip coreutils` or `dnf install curl unzip coreutils`. See [Get Dédalo](index.md#get-dedalo).

**An instance name.** A lowercase letter, then lowercase letters, digits or `_`, at most 28 characters. It becomes the user `ded_<i>`, the database `dedalo_<i>` and every path above, and cannot be changed later.

**The public address.** A fully qualified name (not `localhost`, not an IP address) whose DNS points at this server. It goes into the site file and the certificate.

**The certificate.**

| Choice | What you need |
| --- | --- |
| **Let's Encrypt** (default) | the name resolves publicly to this server, port 80 is reachable from the internet (the HTTP-01 challenge), and an email address for expiry notices |
| **Your institution's certificate** | the fullchain and the key as files on this server. They must name the address, be valid now (a warning under 30 days) and pair with each other. The installer uses them where they are and never copies or changes them |

A local certificate authority is never offered on this route.

**The web server.** nginx (at least 1.25.1) or Apache. The installer uses the one already installed, installs nginx when there is none, and writes **one site file** for this instance. It never edits another site, the default site or the global configuration.

**The database.** By default (`--db-mode create`) the installer creates the role and the database on this host's PostgreSQL 18. With `--db-mode existing` it uses a database you created, which must be empty.

**The media access mode.** Media is served **by the web server**, but the **access rules are generated by Dédalo**. Decide which readers the web server lets through:

| `DEDALO_MEDIA_ACCESS_MODE` | Who can read a media file |
| --- | --- |
| *(unset)* | the `publication` default — fail-closed |
| `private` | logged-in Dédalo users only |
| `publication` | logged-in users **plus** anonymous readers of *published* records, in *public quality* folders only |
| `false` | everybody: the media tree is served openly, with no gate at all |

Three facts about the gate you cannot guess:

- **No Dédalo process is ever in the media byte path.** Authorisation is a single `stat()` performed by the web server, which is why `sendfile`, HTTP `Range` and the H.264 `?start=` clipping still work on multi-gigabyte files.
- **The gate fails closed as `404`, never `403`.** The existence of unpublished media is not disclosed.
- **Master qualities can never be made public.** The `original` and `modified` folders are filtered out of the public list whatever you configure.

How the two rules work is in [The web server site](reverse_proxy.md#how-the-media-gate-decides).

## Run the installer

From the release of Dédalo ([Get Dédalo](index.md#get-dedalo)), as root:

```shell
sudo sh install.sh
```

Choose **Production** on the first screen and type the instance name there (`--plain` asks the same questions one per line). Give no other flag: any answer flag, `--route` and `--instance` included, makes the run headless — see the headless form below. The screens ask, in order:

| Screen | What it asks |
| --- | --- |
| **Install type** | the route and the instance name |
| **System check** | nothing: it shows what this host has. A failed row must be fixed before the install |
| **Database** | the database mode (create or existing), and for an existing database its host, port, socket, name, user and password. Defaults follow the instance name |
| **Identity** | the institution's short code (`entity`) and full name, the locale and the time zone. The time zone stamps every database timestamp; the install fingerprint can never change later |
| **Web server & TLS** | nginx or Apache, the HTTP and HTTPS ports, the public address, the certificate (Let's Encrypt and its email, or the paths of your files) |
| **Services** | the media root, the socket, the media access mode and the backup directory. The defaults are the layout above |
| **Ontologies** | the domain ontologies: Oral history (`oh`) is built in and pre-ticked; others come from the update server, with the ontologies they declare. Also whether to use the official update servers |
| **Thesauri** | the thesauri the chosen ontologies declare, pre-ticked. No country's toponymy is pre-selected. The thesauri are created empty: only `lg` and the country toponymies carry terms |
| **Languages** | the interface and data languages |
| **Publication** | optional: a MariaDB publication target (tested, or kept untested by typing `yes`) |
| **Mail** | optional: an SMTP relay for password recovery (tested the same way) |
| **Administrator** | the `root` password, typed twice and checked against the password policy |
| **Review plan** | everything that will happen — see below |

The same install runs headless, for automation. Give the answers as flags or as an answers file and the root password through the environment, never on the command line:

```shell
read -rsp 'New root password: ' DEDALO_INSTALL_ROOT_PASSWORD; echo; export DEDALO_INSTALL_ROOT_PASSWORD
sudo --preserve-env=DEDALO_INSTALL_ROOT_PASSWORD sh install.sh -- \
  --route production --instance prado --entity prado \
  --server-name dedalo.example.org --letsencrypt-email it@example.org --execute
unset DEDALO_INSTALL_ROOT_PASSWORD
```

Every flag, the answers file and `--plan` (a dry run that changes nothing) are in the [installer reference](installer_reference.md#command-line-flags).

## The Review

Nothing has changed on the host until you type `yes` at the Review. It shows the answers, the ontologies in install order, the thesauri, the `.env` key names, and **every command each host step will run, exactly as it will run** — the run executes this same list, and a resume refuses a step whose commands have changed since. Read it: it is the whole change to the host.

`write <path>` (or **w** on the full screen) saves your answers as an answers file, with no secret in it, instead of installing.

## The steps

The installer runs the steps below in order. Each one is recorded in `/var/lib/dedalo-install/<i>/` before and after it runs. If a step fails, the installer stops, says why, and prints the two ways on:

```shell
sudo sh install.sh --route production --instance <i> --resume                               # fix the cause, then continue
sudo sh install.sh --route production --instance <i> --abort --confirm-database dedalo_<i>   # undo this install
```

`--resume` verifies every step already recorded as done, and runs the rest. `--abort` undoes, in reverse order, only what this install created. Neither ever touches something that existed before the install. Both are described in full in the [installer reference](installer_reference.md#resuming-an-install-resume).

On every step below, **Verify** is what you can check by hand, and **Repair** is what to do when that check fails.

### `host_preflight` — the System check

Measures the host and **refuses, before any change**, everything a later step would trip on: an unsupported system, no systemd, not root, nginx older than 1.25.1, anything already using this instance's names (the user, the database or role, the unit, its drop-ins, the site file, the socket, the nginx `upstream` and rate-limit zone names), **any instance directory that already exists** (the installer never takes over a directory), a web-server configuration it cannot read, the address already served by another site on these ports, a non-standard port held by another program, another PostgreSQL major version on the database port, and an institution certificate that does not check out. It reads the firewall state (ufw or firewalld) and **tells** you what it sees; it never changes the firewall.

It changes nothing, so it has no undo. Then it freezes what it measured and the command list of every later step.

- **Verify:** the refusal sentence lists every problem at once.
- **Repair:** resolve each, then run the same command again — nothing was written, so it starts fresh. Open ports 80 and 443 yourself if the firewall report shows them closed. See [Troubleshooting › The System check refuses](troubleshooting.md#the-production-system-check-refuses).

### `host_packages` — packages and repositories

Installs only what the host is missing: PostgreSQL 18 (server, client, contrib), the media toolchain, the archive tools (`git`, `unzip`, `gzip`, `file`, `curl`, `rsync`, `ca-certificates`), the web server when there is none, `certbot` for Let's Encrypt, and the SELinux management tools on the RHEL family. It adds the repositories they need:

| System | Repositories |
| --- | --- |
| Ubuntu 26.04 | none — PostgreSQL 18 ships with the release |
| Debian 13 | the PostgreSQL project's repository (PGDG) |
| RHEL / Rocky / AlmaLinux 10 | EPEL (ImageMagick, certbot), CodeReady Builder, RPM Fusion free (FFmpeg), PGDG. `ocrmypdf` is optional there: a failure to install it only warns |

The media toolchain, and what each tool is for:

| Tool | Used for |
| --- | --- |
| `ffmpeg` / `ffprobe` | audiovisual transcoding, posterframes, probing |
| `qt-faststart` | moves the MP4 index to the front so a video starts before it has downloaded |
| ImageMagick | image derivatives, thumbnails, colour-space conversion |
| `pdftotext`, `pdftohtml`, `pdfinfo` (poppler) | PDF text extraction and page rendering |
| `ocrmypdf` | optional automatic OCR of uploaded PDFs |
| `rsvg-convert` (librsvg) | thumbnails of SVG records — the only vector rasterizer Dédalo uses |

ImageMagick can render SVG only through a coder that Dédalo's hardened ImageMagick policy disables, because that coder is a long-standing remote-code-execution vector. Vector rendering therefore goes through `rsvg-convert`, which parses SVG and nothing else.

Packages and repositories are **shared host state**: `--abort` tells you what this install added and never removes it (removing a repository would leave its packages without security updates).

- **Verify:** `command -v ffmpeg ffprobe qt-faststart pdftotext rsvg-convert`, and `psql --version` (18). If `qt-faststart` lives elsewhere, set `DEDALO_AV_FASTSTART_PATH` in `.env`. For OCR in another language, install its Tesseract pack (`tesseract-ocr-spa`…); without it OCR falls back to English.
- **Repair:** a failed download or a locked package manager: fix it, then `--resume`.

### `host_identity` — the instance user and directories

Creates the system user and group `ded_<i>` (no login shell, no skeleton files) and every directory in the [layout](#overview) at its mode: the home, `private` (`0700`), the backups, `/srv/dedalo/<i>` and the media root (`0750`), and the root-owned `/opt/dedalo/…` directories (`0755`). A shared directory that already exists (`/srv/dedalo` or `/opt/dedalo` on a host with other instances) is used as it is and never re-moded.

- **Verify:** `getent passwd ded_<i>`; `stat -c '%a %U:%G %n' /home/ded_<i>/private /srv/dedalo/<i>/dedalo/media` shows `700` and `750`, owned by `ded_<i>`.
- **Repair:** `--resume`. `--abort` removes the directories it created while they are empty, and the user with its home — unless the user still runs processes or backups remain in its home, which it keeps and tells you about (a removed user id could be given to a later account, which would then read them).

### `host_runtime` — Bun, the release and the root-run scripts

- **Bun** at the release's pin, **owned by root**, in `/opt/dedalo/bun/<pin>/`. It is taken only from a zip whose sha256 equals the release's committed `.bun-sha256` row — the bootstrap's verified cache. The unit runs it as the instance, but the instance can never replace what it runs.
- **The release** extracted into `/home/ded_<i>/dedalo`, owned by the instance, and its dependencies installed as the instance (`bun install --frozen-lockfile --production`).
- **The root-run scripts** — backup, watchdog, rollback, alert and media-rule scripts — copied root-owned (`0755`) to `/opt/dedalo/instances/<i>/bin/`, outside the code tree: a code update moves the whole tree aside, and the rollback has to work exactly when the tree is missing.

!!! danger "Never `bun upgrade` on a production server"
    The engine is coupled to version-specific runtime behaviour — JSONB parameter inference in `Bun.sql` above all — and a silent drift there is a data-corruption class, not a performance regression. The server echoes its runtime at boot and warns loudly when it does not match the pin. The rationale is in `engineering/PRODUCTION.md` §1.

- **Verify:** `/opt/dedalo/bun/<pin>/bun --version` equals `cat /home/ded_<i>/dedalo/.bun-version`; `stat -c '%U %n' /opt/dedalo/bun/<pin>/bun` is `root`; `ls /opt/dedalo/instances/<i>/bin/`.
- **Repair:** `--resume`. `--abort` removes the release and the scripts, and Bun only when no other instance uses that pin.

### `host_database` — the role and the database

With `--db-mode create`, it creates the role `ded_<i>` (LOGIN, **no password** — peer authentication over the local socket `/var/run/postgresql`, so no database password exists at rest) and the database `dedalo_<i>` it owns (UTF8, from `template0`). Then it checks that the instance user reaches its database by peer, and that the three extensions the seed needs (`btree_gin`, `pg_trgm`, `unaccent`) are available. With `--db-mode existing` it does nothing; the engine step probes your database with the password you gave.

- **Verify:** `sudo -u ded_<i> psql -h /var/run/postgresql -d dedalo_<i> -c 'SELECT current_user'` prints `ded_<i>` with no password asked.
- **Repair:** a cluster whose `pg_hba.conf` refuses local peer connections is reported, not edited — `pg_hba.conf` is global configuration. Allow `local all all peer` (the distribution default), reload PostgreSQL, then `--resume`. `--abort` drops only a role and database this install created, only when the database is empty, and only with `--confirm-database`.

### `host_engine` — the engine steps, as the instance user

The engine steps — the database seed, the ontologies, the thesauri, the root password, the tool registration — run in **one child process, as the instance user**, in the instance's own tree:

```shell
runuser -u ded_<i> -- /opt/dedalo/bun/<pin>/bun run scripts/install.ts --request-stdin --execute --events-jsonl
```

The answers and the secrets travel as one JSON object on its standard input — never on a command line, never in a file. The child keeps its own record in `/home/ded_<i>/private/install/` and writes `/home/ded_<i>/private/.env`. What each engine step does is in the [installer reference](installer_reference.md#what-the-installer-does-in-order).

- **Verify:** `cd /home/ded_<i>/dedalo && sudo -u ded_<i> /opt/dedalo/bun/<pin>/bun run scripts/install.ts --status --json` prints `"outcome":"complete"`.
- **Repair:** `--resume` resumes the child too. `--abort` runs the child's own `--abort` first, which resets the database to empty — and refuses a completed (sealed) install.

### `host_units` — the systemd units

Writes the shared template units from `deploy/systemd/` into `/etc/systemd/system/` (one copy per host), and this instance's drop-ins (`/etc/systemd/system/<unit>@<i>.service.d/10-dedalo-install.conf`: the pinned runtime, the client publish directory, the backup store lines). Then `systemctl daemon-reload` and `systemctl enable dedalo-ts@<i>` — **not** started, and with **no** watchdog or backup timer yet. A template that already exists with other contents is refused, never overwritten.

| Unit | What it does |
| --- | --- |
| `dedalo-ts@<i>.service` | the server: `RuntimeDirectory=dedalo-<i>`, `UMask=0007`, `Restart=always`, `SuccessExitStatus=75`, `RestartPreventExitStatus=78`, `Environment="DEDALO_SUPERVISED=true"` |
| `dedalo-ts-watchdog@<i>.timer` + `.service` | every 30 s, `/health` over the socket; on failure it restarts the server, or rolls back a code update that has not been confirmed yet |
| `dedalo-ts-restart@<i>.service` | the restart helper the watchdog fires |
| `dedalo-ts-rollback@<i>.service` | rolls a failed code update back to the previous tree; does nothing when no update is pending |
| `dedalo-backup@<i>.service` + `.timer` | the nightly backup set, run as the instance |
| `dedalo-backup-site-builder@<i>.service` | the site-builder store, run as root in its own unit (only with `--backup-site-builder`) |
| `dedalo-backup-alert@<i>.service` | reports a failed backup |

Why both `Restart=always` and the watchdog: the server reads its configuration **once**, at boot, so a configuration change needs a restart, and any crash must bring the process back — `Restart=always` does that. The watchdog catches a different class: *process alive, service dead* (database down, pool wedged), which `Restart=always` cannot see. systemd's own `WatchdogSec` needs `sd_notify`, which the runtime does not speak, so the timer stands in.

The unit declares `DEDALO_SUPERVISED=true` — [why that is mandatory](#mandatory-a-supervisor-that-declares-itself).

- **Verify:** `systemctl cat dedalo-ts@<i>` shows the template and the drop-in; `systemctl is-enabled dedalo-ts@<i>` is `enabled`.
- **Repair:** `--resume`. `--abort` removes the drop-ins, and the templates when no other instance uses them.

### `host_selinux` — SELinux on the RHEL family

Runs only on the RHEL family with SELinux enforcing or permissive; elsewhere it does nothing. It labels what the web server reads or connects to:

| Path | Type |
| --- | --- |
| `/var/run/dedalo-<i>(/.*)?` (the socket) | `httpd_var_run_t` |
| `/srv/dedalo/<i>(/.*)?` (media and the published client) | `httpd_sys_content_t` |
| `/var/lib/dedalo-install/acme/<i>(/.*)?` (the Let's Encrypt challenge root) | `httpd_sys_content_t` |

It then loads one host-wide policy module, `dedalo_engine` (`deploy/selinux/dedalo_engine.cil.tpl`), at priority 400. The module gives the engine **its own domain**: systemd starts the pinned runtime (labelled `dedalo_engine_exec_t`) into `dedalo_engine_t`, and the web server may connect to the unix sockets of that domain **only**. A rule naming the generic service domain would let the web server reach every other unconfined service's socket on the host. After loading the module it relabels the runtime (`restorecon -F`). No SELinux boolean is changed.

- **Verify:** `semodule -l | grep dedalo_engine`; `stat -c %C /opt/dedalo/bun/<pin>/bun` contains `dedalo_engine_exec_t`; `ls -Zd /srv/dedalo/<i>`.
- **Repair:** `--resume`. A module named `dedalo_engine` that this installer did not write is refused, not replaced. `--abort` removes this instance's contexts, and the module when no other instance uses it.

### `host_first_boot` — the first start

Starts `dedalo-ts@<i>` and waits, with progress, for `/health` on the socket to answer `200` **and** for every database migration to be recorded. Under SELinux it also reads the running engine's domain and refuses a first boot whose engine is not in `dedalo_engine_t` (it would answer on its socket, but never through the site).

- **Verify:**

    ```shell
    systemctl status dedalo-ts@<i> --no-pager      # active (running), not activating (auto-restart)
    ls -l /run/dedalo-<i>/dedalo_ts.sock          # srwxrwx--- ded_<i> ded_<i>
    curl --fail --unix-socket /run/dedalo-<i>/dedalo_ts.sock http://localhost/health
    # {"result":"ok","entity":"<entity>","db":"ok",…}
    ```

- **Repair:** read `journalctl -u dedalo-ts@<i> -n 50`, fix the cause, then `--resume`. `--abort` stops the unit.

### `host_watchdog` — arm the watchdog

Enables `dedalo-ts-watchdog@<i>.timer`, and only now: a watchdog armed before the first boot completed would kill it mid-migration.

- **Verify:** `systemctl is-active dedalo-ts-watchdog@<i>.timer` is `active`.
- **Repair:** `--resume`. `--abort` disarms it.

### `host_web_http` — the plain-HTTP site (Let's Encrypt only)

Writes the first stage of the site file: a plain-HTTP server with the Let's Encrypt challenge root (`/var/lib/dedalo-install/acme/<i>/`) and the redirect to HTTPS, so the certificate authority can prove the address before any certificate exists. The web server's user joins the group `ded_<i>` (it reaches the socket and reads media and client through that group). On Apache it **checks** the modules the site needs (`ssl headers http2 rewrite proxy proxy_http`) and, when one is missing, stops with the exact command to enable it; it never enables a module itself. The configuration is tested before the reload, and a reload applies every pending change of the web server's configuration, which the Review says next to the command.

- **Verify:** `curl -I http://<address>/` answers with a redirect to `https://`.
- **Repair:** for the Apache modules, run the command the message prints (`a2enmod … && systemctl reload apache2` on Debian and Ubuntu), then `--resume`. `--abort` removes the site file.

### `host_tls` — the certificate

- **Let's Encrypt:** `certbot certonly --webroot` against the challenge root, as the certificate `dedalo-<i>`, with a deploy hook that reloads the web server, and the distribution's renewal timer enabled (`certbot.timer`; `certbot-renew.timer` on the RHEL family). `--letsencrypt-staging` (headless only) uses the staging authority: the install completes with a certificate browsers do not trust, and the closing *To do on this host* list prints the `certbot` command that replaces it with a real one.
- **Your institution's files:** checked again (the address, the expiry, the key) and used where they are.

On the RHEL family the web server must be able to read your certificate files: keep them under `/etc/pki/tls` or label them `cert_t`.

- **Verify:** `certbot certificates --cert-name dedalo-<i>`; `systemctl is-enabled certbot.timer`.
- **Repair:** a failed Let's Encrypt request is almost always DNS or port 80 — see [Troubleshooting › Let's Encrypt](troubleshooting.md#lets-encrypt-fails). Then `--resume`. `--abort` deletes only a certificate this install issued.

### `host_web_site` — the full site

Writes the full site file — HTTPS, the API routes to the socket, the published client, the media gate — tests the configuration and reloads. A failed test puts the files back as they were, so the web server is never left with a configuration it would refuse. What the file contains, and why, is in [The web server site](reverse_proxy.md).

| Web server | Site file |
| --- | --- |
| nginx | `/etc/nginx/conf.d/dedalo-<i>.conf` |
| Apache (Debian, Ubuntu) | `/etc/apache2/sites-available/dedalo-<i>.conf`, enabled with `a2ensite` |
| Apache (RHEL family) | `/etc/httpd/conf.d/dedalo-<i>.conf` |

On nginx the media rules the engine generates are not included from the media tree: they are copied, validated, into the root-owned `/etc/nginx/dedalo/<i>/`, and one host-wide file, `/etc/nginx/conf.d/dedalo-00-media-map.conf`, includes the media map.

- **Verify:** `nginx -t` (or `apachectl -t`); `curl --fail https://<address>/health`.
- **Repair:** `--resume`. `--abort` removes the site file, the rule copies and the web user's group membership.

### `host_public_probe` — the instance through its public address

Checks from the host what an outside browser gets: `/health` answers `200` over HTTPS with a verified certificate chain, and, with the media gate on, the marker store `/dedalo/media/.publication/auth/` and an unpublished probe file both answer `404` to an anonymous request. It connects to `127.0.0.1` with the server name, so split-horizon DNS or a router without hairpin NAT cannot fail a correct install. It retries every 2 s for up to 90 s while the reload settles.

- **Verify:** from another machine, `curl --fail https://<address>/health` and `curl -I https://<address>/dedalo/media/.publication/auth/` (`404`).
- **Repair:** see [Troubleshooting › The public probe fails](troubleshooting.md#the-public-probe-fails). It changes nothing, so it has no undo.

### `host_backup_verify` — the first backup, verified

Runs the backup set once (`systemctl start --wait dedalo-backup@<i>`) and verifies the **outcome**: a `LAST_OK` marker written by this run listing every expected store with exit `0`, no `BACKUP_FAILED` marker, and the unit's effective environment carrying the full expected store list. With `--backup-site-builder`, the root-run site-builder unit is run and verified the same way. Only then does it enable the nightly `dedalo-backup@<i>.timer`.

- **Verify:** `systemctl list-timers 'dedalo-backup@*'`; `cat /home/ded_<i>/backups/state/LAST_OK`.
- **Repair:** read `journalctl -u dedalo-backup@<i>`, fix the store that failed, then `--resume`. `--abort` disables the timer and keeps the backups.

## Done

The Done screen shows the generated `DEDALO_SALT_STRING` **once** — keep it with your backups — and what comes next. The instance is running under systemd and starts at boot; the watchdog and the nightly backup are armed.

Open `https://<address>/dedalo/core/page/` and log in as **`root`**. Then follow [After the install](index.md#after-the-install): an admin user, users and projects, the thesauri and toponymies you need (from Maintenance), and a restore test of the backups.

```shell
systemctl status dedalo-ts@<i>
journalctl -u dedalo-ts@<i> -f
```

## After the install

### Tuning `.env`

The installer wrote `/home/ded_<i>/private/.env` (the keys are [listed in the reference](installer_reference.md#what-privateenv-does-and-does-not-get)). The instance is fully configured to boot; the operational tuning is yours. Edit the file as the instance user, then `systemctl restart dedalo-ts@<i>` — configuration is read once, at boot.

!!! danger "`.env` is append-only, documented keys only"
    Add a line for a new key, or change a value on its existing line — never a second line for a key that is already there, and never delete one. Every key is documented in the [configuration reference](../config/index.md).

```dotenv
# --- Serving ---
SERVER_IDLE_TIMEOUT_S=255        # runtime max; the web server's read timeout must be >= this
TRUSTED_PROXY_HOPS=1             # count of proxies that append X-Forwarded-For

# --- Database pool (per process) ---
DB_POOL_MAX=10                   # budget the SUM across processes against max_connections
DB_STATEMENT_TIMEOUT_MS=60000    # 0 (off) by default — caps one runaway query

# --- Observability ---
DEDALO_ACCESS_LOG=true
DEDALO_SLOW_REQUEST_MS=5000
```

`DB_POOL_MAX` deserves a second look on a busy host: the server, each diffusion runner and the RAG drain all draw from PostgreSQL's `max_connections`, and so does every other instance on the host.

### Changing the media access mode

Set `DEDALO_MEDIA_ACCESS_MODE` in `.env` and restart the engine, which regenerates the rule files in `MEDIA_PATH`. On nginx, refresh the validated copies the site includes (the installer prints this command on Done):

```shell
sudo /opt/dedalo/instances/<i>/bin/dedalo-media-rules.sh --source /srv/dedalo/<i>/dedalo/media \
  --dest /etc/nginx/dedalo/<i> --reload /usr/sbin/nginx nginx
```

A copy that fails the nginx configuration test is put back. Apache reads the generated `.htaccess` on every request and needs nothing.

### Adding a domain ontology later

The installation carries the core ontologies and the domain ontologies you chose. To add one later (for example `tch`):

1. In *Maintenance › Update ontology*, put its code **and the codes of the ontologies it requires** in the list and import them. The panel imports exactly the codes in the list. *Fetch list* shows what the master declares.
2. Add the same codes to `ACTIVE_ONTOLOGY_TLDS` in `.env` — inside the JSON list on its existing line — so every later update refreshes them.
3. Restart the server.

See [Updating ontology](../management/updates/updating_ontology.md#which-tlds-are-updated).

### Optional subsystems

All four are **off by default**.

**Diffusion (publication)** publishes records to a MariaDB target database for a public website. The installer writes its keys when you fill in the *Publication* screen (`--diffusion --mysql-*`), but no code creates the target database:

```sql
CREATE DATABASE web_prado CHARACTER SET utf8mb4;
GRANT ALL ON web_prado.* TO 'dedalo_pub'@'localhost';
```

A missing or ungranted target database is a loud configuration error, not something the engine papers over. Details: [the diffusion engine](../diffusion/native_engine.md).

**RAG (semantic search)** needs a pgvector database whose base schema you apply by hand from the [RAG cookbook](../core/ai/rag_cookbook.md); once it exists, the per-model partitions and the index queue are created automatically. Then set `DEDALO_RAG_ENABLED=true` and `DEDALO_RAG_DB_NAME`.

**The AI assistant** is disabled unless a model is configured — see [assistant install](../core/ai/assistant/install.md).

**H.264 real-time clipping** needs a web-server module — see [H.264 streaming module](install_h264_module.md).

## Verify, then harden

Walk the whole path once, in order. Each line is a real failure mode if it does not pass.

- [ ] `curl --fail --unix-socket /run/dedalo-<i>/dedalo_ts.sock http://localhost/health` → `200` with `"db":"ok"`.
- [ ] `curl --fail https://<address>/health` → the same `200`, **through the web server**.
- [ ] `https://<address>/dedalo/core/page/` serves the login form over TLS.
- [ ] Log in as the admin user. The menu renders.
- [ ] Create a record in a section, save it, reload — the value persists.
- [ ] Upload an image. The **derivative and the thumbnail** appear (ImageMagick resolved, the media root is writable).
- [ ] Search for the record you created.
- [ ] `GET /api/v1/counters` as a global admin returns request, pool, queue and memory counters. Anyone else gets a `404`, which is correct.
- [ ] `systemctl reboot`, then repeat the health checks. The service, the socket and the site must all come back on their own.

These are the installed defaults. Check that nothing has changed them, because each is a real hole:

| Setting | Production value | Why |
| --- | --- | --- |
| `SERVER_TCP_PORT` | **unset** | the TCP listener is a development convenience; production is socket-only |
| `DEDALO_DEV_MODE` | `false` | dev mode exposes the browser test harness and unminified client libraries |
| `DEDALO_DEBUG_API_ERRORS` | `false` | otherwise exception text is echoed to the client |
| `MEDIA_DEV_ROUTE_ENABLED` | **unset** | setting it to `true` forces the engine's development media route on for every listener, the socket included — serving media with **no per-record access control** |
| `SESSION_COOKIE_SECURE` | `true` (the default) | requires TLS — a browser drops a `Secure` cookie over plain HTTP |
| `/home/ded_<i>/private/.env` | `0600`, owned by `ded_<i>` | it holds every secret |
| `/home/ded_<i>/private/` | `0700` | it holds the session store and the media-auth store |
| `/home/ded_<i>/` | owned by `ded_<i>` | an in-app code update renames the release tree inside it; its parent `/home` stays root's |
| `/opt/dedalo` and everything under it | owned by root | a root-run unit must never execute a file the instance can replace |

!!! note "There is no install surface to close"
    The install **seals** the instance. No install page or install API exists: a server whose instance is not installed (or whose `.env` is gone, or whose install did not finish) refuses to start with exit code `78` and one `[boot] REFUSED — …` line, and the unit does not restart it. See [the installer reference](installer_reference.md#a-server-that-is-not-installed-refuses-to-start).

## What the installer does not do after the install

The installer installs; it does not maintain. It refuses to run over a sealed instance, and `--abort` never takes a completed install apart (on a live instance it undoes only the host steps after `host_engine`, and `--resume` puts them back). Three things are therefore manual today, with no installer support:

- **The root-run scripts** in `/opt/dedalo/instances/<i>/bin/` are not refreshed by an in-app code update, which runs as the instance. When a release changes a script under `deploy/`, its release notes say so.
- **A new Bun pin.** The code update panel refuses a release whose `.bun-version` differs from the running runtime, and the runtime is root-owned at `/opt/dedalo/bun/<pin>/`.
- **Removing an instance.** There is no command that removes a completed instance.

See [Upgrading](upgrading.md) for what the in-app code update does cover.
