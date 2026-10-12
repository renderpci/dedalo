# A host set up by hand

> See also: [Migrating a v6 install to v7](migrating_from_v6.md) · [Production install](production.md) · [The web server site](reverse_proxy.md) · [Upgrading](upgrading.md)

This page is for one case only: a host the installer cannot set up, because it already runs Dédalo — a v6 installation [migrated to v7](migrating_from_v6.md) in place, whose user, media tree and database already exist. The migration adopts that host and never runs the installer, so the host's services are set up by hand, as described here.

!!! warning "A new install uses the installer"
    On a new host, run the installer ([Production install](production.md)). It does everything on this page — with a root-owned runtime, a per-instance layout, a verified first backup and a refusal on every clash — and it is the only procedure the manual supports for a new install. A host set up by hand is not an installer instance: the installer's resume, abort and instance registry know nothing about it.

## The layout

The reference units under `deploy/` are written for this single-instance layout. Every command below uses it; on an adopted host, substitute the paths that host already has.

```text
/opt/dedalo/                   root-owned (0755)
/opt/dedalo/master_dedalo/     the code — owned by the service user
/opt/dedalo/private/           the private directory: .env (0600), sessions, state — owned by the service user (0700)
/opt/dedalo/backups/           the backups — owned by the service user
/opt/dedalo/bin/               root-owned copies of the scripts root-run units execute
/opt/dedalo/.bun/bin/bun       the pinned runtime — root-owned
/srv/dedalo/media/             MEDIA_PATH — owned by the service user
/run/dedalo/dedalo_ts.sock     the socket (systemd RuntimeDirectory)
user/group: dedalo
```

Three properties are load-bearing:

- **The private directory is a sibling of the code**, one level above it, never inside the served tree. The engine derives its path from the location of the code it runs (or from `DEDALO_PRIVATE_DIR`).
- **`/opt/dedalo` itself stays root-owned.** The service user owns only the code, `private/` and `backups/` below it. A user who owns the parent can rename `bin/` and put their own scripts where root runs them.
- **`MEDIA_PATH` is absolute and independent of the code**, often on its own volume.

## Prepare the host

**The service user** (skip on an adopted host — [the migration](migrating_from_v6.md#prepare-the-v7-host-first) says why):

```shell
sudo adduser --system --group --no-create-home --home /opt/dedalo --shell /usr/sbin/nologin dedalo
sudo install -d -o root -g root -m 0755 /opt/dedalo /opt/dedalo/bin
sudo install -d -o dedalo -g dedalo -m 0700 /opt/dedalo/private
sudo install -d -o dedalo -g dedalo -m 0750 /opt/dedalo/backups /srv/dedalo/media
```

`--group` creates the group `dedalo` too, as the user's primary group. The server unit names only the user (`User=`): with no `Group=` line it runs with that primary group, which owns the socket, and that group is what the web server joins to reach it.

**The packages** are the ones the installer's `host_packages` step installs — the list per system is in [Production › `host_packages`](production.md#host_packages-packages-and-repositories). On Debian and Ubuntu:

```shell
sudo apt install -y git unzip gzip file ca-certificates curl rsync \
  ffmpeg imagemagick poppler-utils ocrmypdf librsvg2-bin \
  postgresql-18 postgresql-client-18
```

PostgreSQL 18 comes from the PostgreSQL project's repository (PGDG) where the release does not ship it. `psql` must not be older than the server: the migration, the database restore and the backups all shell out to it, and an older client refuses to connect to a newer server. On a host with several major versions, pin it with `DEDALO_PG_BIN_PATH=/usr/lib/postgresql/18/bin` in `.env` (`/usr/pgsql-18/bin` on the RHEL family).

**The pinned Bun runtime.** Read the pin from the code you are about to run (`.bun-version`), never from a document, and install it root-owned:

```shell
BUN_VERSION="$(cat /path/to/the/code/.bun-version)"
curl -fsSL https://bun.sh/install | sudo BUN_INSTALL=/opt/dedalo/.bun bash -s "bun-v${BUN_VERSION}"
/opt/dedalo/.bun/bin/bun --version
```

Never `bun upgrade` it: the engine is coupled to version-specific runtime behaviour, and a drift there is a data-corruption class. The unit's `ExecStart` names this absolute path.

**The code**, owned by the service user, with its locked dependencies:

```shell
sudo -u dedalo git clone <your-dedalo-remote> /opt/dedalo/master_dedalo
sudo -u dedalo bash -c 'cd /opt/dedalo/master_dedalo && /opt/dedalo/.bun/bin/bun install --frozen-lockfile --production'
```

The `cd` is part of the command: `sudo -u` keeps the directory you are standing in, so Bun run from elsewhere reports `could not find a package.json file to install from`. `--frozen-lockfile` refuses to resolve a dependency tree other than the tested one; `--production` skips the test harness and the linters.

**The empty database and its role.** The role must own the database (or a superuser must create the extensions `btree_gin`, `pg_trgm` and `unaccent` in it beforehand):

```shell
sudo -u postgres psql <<'SQL'
CREATE USER dedalo_user PASSWORD 'a-long-random-password';
CREATE DATABASE dedalo_main WITH ENCODING='UTF8' OWNER=dedalo_user;
SQL
```

The migration restores into it. Over the local socket (`DB_SOCKET=/var/run/postgresql`), PostgreSQL's peer authentication lets the `dedalo` system user connect as a role of the same name with no password at rest.

## The units

Reference units ship under `deploy/`:

| Unit | What it does |
| --- | --- |
| `dedalo-ts.service` | the server: `RuntimeDirectory=dedalo`, `UMask=0007`, `Restart=always`, `SuccessExitStatus=75`, `RestartPreventExitStatus=78`, `Environment=DEDALO_SUPERVISED=true` |
| `dedalo-ts-watchdog.service` + `.timer` | every 30 s, `/health` over the socket; restarts the server, or rolls back an unconfirmed code update |
| `dedalo-ts-restart.service` | the restart helper the watchdog fires |
| `dedalo-ts-rollback.service` | rolls a failed code update back to the previous tree, as the service user; only the restart runs as root |
| `dedalo-backup.service` + `.timer` | the nightly backup set, run as the service user |
| `dedalo-backup-site-builder.service` | the site-builder store, run as root in its own unit with no `EnvironmentFile`, pulled in by the set |
| `dedalo-backup-alert@.service` | reports a failed backup, run as the service user |

**1 — Install the root-run scripts, and copy the units.** The watchdog, the rollback and the root-run backup units do not run scripts from the code tree: a code update moves the whole tree aside, and the rollback has to work exactly when the tree is missing. They run root-owned copies in `/opt/dedalo/bin/`:

```shell
cd /opt/dedalo/master_dedalo
sudo install -m 0755 deploy/dedalo-code-rollback.sh deploy/dedalo-ts-watchdog.sh \
  deploy/dedalo-backup-step.sh deploy/dedalo-site-builder-backup.sh deploy/dedalo-backup-alert.sh \
  /opt/dedalo/bin/
sudo cp deploy/dedalo-ts*.service deploy/dedalo-ts*.timer deploy/dedalo-backup*.service \
  deploy/dedalo-backup.timer /etc/systemd/system/
```

Without the copies the watchdog fails with `status=203/EXEC` every 30 seconds, and no failed code update is rolled back. A code update does not refresh them: run the `install` line again after an update that changes `deploy/*.sh` (the release notes say when).

**2 — Substitute the placeholders.** The units ship with ALL-CAPS placeholders:

| Placeholder | This layout's value |
| --- | --- |
| `DEDALO_USER` (`User=`) | `dedalo` |
| `WorkingDirectory` | `/opt/dedalo/master_dedalo` |
| `ExecStart` bun path | `/opt/dedalo/.bun/bin/bun` |
| backup `EnvironmentFile` | `/opt/dedalo/private/.env` |
| backup paths | `/opt/dedalo/private/backups/…`, `/opt/dedalo/backups/…` |
| code-update backup root (`--backup-root` in the rollback and watchdog units) | `/opt/dedalo/backups/code` — change both when `DEDALO_BACKUP_PATH` points elsewhere |

Edit each with `systemctl edit --full <unit>`, then check that none is left: `systemctl cat dedalo-ts dedalo-ts-rollback dedalo-backup 'dedalo-backup-alert@x' | grep -n DEDALO_USER` must print nothing. An unsubstituted `User=DEDALO_USER` fails with `status=217/USER` before Bun runs. On the RHEL family the PostgreSQL unit is `postgresql-18.service`, not `postgresql.service`: change `After=` and `Wants=` accordingly.

Never add a root (`+`) line to the backup set: systemd applies its `EnvironmentFile=` — a file the service user writes — to root lines too. The site-builder store is root's, in its own unit.

**3 — Set the socket in `.env`.** `SERVER_UNIX_SOCKET=/run/dedalo/dedalo_ts.sock` must sit under the directory `RuntimeDirectory=dedalo` creates. `/run` is wiped on every reboot; `RuntimeDirectory` recreates it on each start, which a hand-made `mkdir` would not survive.

**4 — Reload and start:**

```shell
sudo systemctl daemon-reload
sudo systemctl enable --now dedalo-ts.service dedalo-ts-watchdog.timer dedalo-backup.timer
systemctl status dedalo-ts --no-pager
curl --fail --unix-socket /run/dedalo/dedalo_ts.sock http://localhost/health
```

## The web server

Write the site for this layout as described in [The web server site › A site written by hand](reverse_proxy.md#a-site-written-by-hand), then add the web server's user to the group `dedalo` and **restart** (not reload) it — supplementary group membership is read when a process starts:

```shell
sudo usermod -aG dedalo www-data      # nginx on the RHEL family: nginx; Apache there: apache
sudo systemctl restart nginx
```

On the RHEL family with SELinux, the installer's contexts and policy module are the reference ([Production › `host_selinux`](production.md#host_selinux-selinux-on-the-rhel-family)).

## Several hand-built instances on one host

An adopted host that already carries several Dédalo installations keeps one unit per installation. Two points are specific to adopted hosts:

- **The user name, the home and the site slug rarely agree** (a user `dedalo_user` with the home `/home/dedalo.dev`). A template unit whose `%i` fills all three cannot express that. Write one ordinary unit per installation, every value spelled out — or keep `%i` for the paths and give each instance its `User=`/`Group=` in a drop-in (`systemctl edit <unit>`).
- **Each instance needs its own group.** An adopted user often has the web server's group as its primary group, and two such instances then have no boundary between them — [the migration's Phase E](migrating_from_v6.md#82-give-the-adopted-user-its-own-group) gives each its own.

!!! warning "The installer's unit names are reserved"
    The installer writes its own template units — `dedalo-ts@.service` and its siblings — into `/etc/systemd/system/`, and refuses a file of the same name with other contents. Do not give hand-written units those names on a host where you may later run the installer for another instance.

Every instance needs its own socket, database and role, `MEDIA_PATH`, private directory and user; `DB_POOL_MAX` is per process, so budget the sum against PostgreSQL's `max_connections`. [Several instances on one host](multi_instance.md) explains why each must differ.
