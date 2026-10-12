# A host set up by hand

> See also: [Migrating a v6 install to v7](migrating_from_v6.md) · [Production install](production.md) · [The web server site](reverse_proxy.md) · [Upgrading](upgrading.md)

This page is for one case only: a host the installer cannot set up, because it already runs Dédalo — a v6 installation [migrated to v7](migrating_from_v6.md) in place, whose user, media tree and database already exist. The migration adopts that host and never runs the installer, so the host's services are set up by hand, as described here.

!!! warning "A new install uses the installer"
    On a new host, run the installer ([Production install](production.md)). It does everything on this page — with a root-owned runtime, a per-instance layout, a verified first backup and a refusal on every clash — and it is the only procedure the manual supports for a new install. A host set up by hand is not an installer instance: the installer's resume, abort and instance registry know nothing about it.

## The layout

A host's layout is defined by **role**, not by a fixed path. Two directories matter, and you choose where each one lives:

- **The instance directory** — any path, **owned by the service user**. It holds the code (`<instance directory>/master_dedalo`), the private directory (`private/`) and the backups (`backups/`). An in-app [code update](../management/updates/updating_code.md) renames the code tree *inside* this directory and moves the old one into `backups/code` below it, so the service user must be able to write it. Its **parent** can stay root-owned: nothing is ever created or renamed there.
- **The root bin directory** — **owned by root**, **outside** the instance directory. It holds the pinned Bun runtime and the scripts the watchdog, rollback and backup units run. Root never runs a file the service user can replace.

Two worked examples:

| | A single instance | Several instances, one per domain |
| --- | --- | --- |
| instance directory (service user's) | `/opt/dedalo/app/` | `/home/my_domain.org/dedalo/` |
| its parent | `/opt/dedalo/` — root's | `/home/my_domain.org/` — root's |
| the code | `/opt/dedalo/app/master_dedalo/` | `/home/my_domain.org/dedalo/master_dedalo/` |
| the private directory (`.env` `0600`, sessions, state — `0700`) | `/opt/dedalo/app/private/` | `/home/my_domain.org/dedalo/private/` |
| the backups, code-update backups in `backups/code` | `/opt/dedalo/app/backups/` | `/home/my_domain.org/dedalo/backups/` |
| root bin directory: runtime `bun` and root-run scripts | `/opt/dedalo/bin/` | `/usr/local/lib/dedalo/my_domain.org/bin/` |
| service user and group | `dedalo` | one per instance, for example `my_domain` |
| `MEDIA_PATH` | `/srv/dedalo/media/` | `/srv/dedalo/my_domain.org/media/` |
| socket (systemd `RuntimeDirectory`) | `/run/dedalo/dedalo_ts.sock` | one directory per instance (see [several instances](#several-hand-built-instances-on-one-host)) |

The installer follows the same rule: its instance directory is the install folder — `/home/ded_<i>/` by default, or any path given with `--install-dir`, such as `/home/my_domain.org/dedalo` — owned by the service user (`ded_<i>`, or an existing account given with `--service-user`, used as it is); its code is `<install folder>/dedalo/`, and its root bin directory is `/opt/dedalo/instances/<i>/bin/`. See [The install folder and the service account](production.md#the-install-folder-and-the-service-account).

Three properties are load-bearing:

- **The service user owns the instance directory, and root owns everything above the root bin directory.** Without the first, every in-app code update is refused before it downloads anything (*the service user cannot write the instance directory*). Without the second, the service user could rename the bin directory and put its own scripts where root runs them.
- **The private directory is a sibling of the code**, inside the instance directory, never inside the served tree. The engine derives its path from the location of the code it runs (or from `DEDALO_PRIVATE_DIR`).
- **`MEDIA_PATH` is absolute and independent of the code**, often on its own volume.

## Prepare the host

The commands below use the single-instance example; substitute your own paths. **The service user** (skip on an adopted host — [the migration](migrating_from_v6.md#prepare-the-v7-host-first) says why):

```shell
sudo install -d -o root -g root -m 0755 /opt/dedalo /opt/dedalo/bin
sudo adduser --system --group --no-create-home --home /opt/dedalo/app --shell /usr/sbin/nologin dedalo
sudo install -d -o dedalo -g dedalo -m 0750 /opt/dedalo/app /opt/dedalo/app/backups /srv/dedalo/media
sudo install -d -o dedalo -g dedalo -m 0700 /opt/dedalo/app/private
```

On an adopted host whose installation lives in `/home/my_domain.org/dedalo`, that directory is already the instance directory: check that the service user owns it (`stat -c '%U' /home/my_domain.org/dedalo`) and that its code, `private/` and `backups/` are inside it.

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
curl -fsSL https://bun.sh/install | sudo BUN_INSTALL=/opt/dedalo bash -s "bun-v${BUN_VERSION}"
/opt/dedalo/bin/bun --version
```

`BUN_INSTALL` is the parent of the root bin directory: Bun installs itself as `<BUN_INSTALL>/bin/bun`, which is where the server unit's `ExecStart` looks for it. Never `bun upgrade` it: the engine is coupled to version-specific runtime behaviour, and a drift there is a data-corruption class.

**The code**, owned by the service user, with its locked dependencies:

```shell
sudo -u dedalo git clone <your-dedalo-remote> /opt/dedalo/app/master_dedalo
sudo -u dedalo bash -c 'cd /opt/dedalo/app/master_dedalo && /opt/dedalo/bin/bun install --frozen-lockfile --production'
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

**1 — Install the root-run scripts.** The watchdog, the rollback and the backup units do not run scripts from the code tree: a code update moves the whole tree aside, and the rollback has to work exactly when the tree is missing. They run root-owned copies in the root bin directory:

```shell
cd /opt/dedalo/app/master_dedalo
sudo install -m 0755 deploy/dedalo-code-rollback.sh deploy/dedalo-ts-watchdog.sh \
  deploy/dedalo-backup-step.sh deploy/dedalo-db-backup.sh deploy/dedalo-tree-backup.sh \
  deploy/dedalo-site-builder-backup.sh deploy/dedalo-backup-alert.sh \
  /opt/dedalo/bin/
```

Without the copies the watchdog fails with `status=203/EXEC` every 30 seconds, and no failed code update is rolled back. A code update does not refresh them: run the `install` line again after an update that changes `deploy/*.sh` (the release notes say when).

**2 — Render the units for your layout.** The units under `deploy/` name the layout only through three placeholders, so one set of files serves any instance directory:

| Placeholder | What | Single instance | `my_domain.org` |
| --- | --- | --- | --- |
| `DEDALO_USER` | the service user | `dedalo` | `my_domain` |
| `INSTANCE_DIR` | the instance directory (the service user's) | `/opt/dedalo/app` | `/home/my_domain.org/dedalo` |
| `ROOT_BIN_DIR` | the root bin directory (root's, outside the instance directory) | `/opt/dedalo/bin` | `/usr/local/lib/dedalo/my_domain.org/bin` |

Substitute all three while copying the units into place:

```shell
DEDALO_USER=dedalo INSTANCE_DIR=/opt/dedalo/app ROOT_BIN_DIR=/opt/dedalo/bin
cd "$INSTANCE_DIR/master_dedalo"
for unit in deploy/dedalo-ts*.service deploy/dedalo-ts*.timer deploy/dedalo-backup*.service deploy/dedalo-backup.timer; do
  sed -e "s|\<DEDALO_USER\>|$DEDALO_USER|g" -e "s|\<INSTANCE_DIR\>|$INSTANCE_DIR|g" \
      -e "s|\<ROOT_BIN_DIR\>|$ROOT_BIN_DIR|g" "$unit" | sudo tee "/etc/systemd/system/${unit#deploy/}" >/dev/null
done
grep -nE '\<(DEDALO_USER|INSTANCE_DIR|ROOT_BIN_DIR)\>' /etc/systemd/system/dedalo-ts*.service /etc/systemd/system/dedalo-backup*.service
```

The last command must print nothing. An unsubstituted `User=DEDALO_USER` fails with `status=217/USER` before Bun runs. On the RHEL family the PostgreSQL unit is `postgresql-18.service`, not `postgresql.service`: change `After=` and `Wants=` with `systemctl edit --full dedalo-ts`.

The rollback and watchdog units pin the code-update backup root to `INSTANCE_DIR/backups/code`, which is where the engine keeps it unless `DEDALO_BACKUP_PATH` says otherwise. If you set that key, change `--backup-root` in both units to the same directory — inside the instance directory, on the same filesystem as the code; the engine refuses an update whose backup root the service user cannot write.

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

- **Each installation is one instance directory**, for example `/home/my_domain.org/dedalo` and `/home/other_domain.org/dedalo`, each owned by its own service user, each with its own root bin directory (`/usr/local/lib/dedalo/my_domain.org/bin`, …). Render the units once per installation with that installation's three values.
- **The user name, the home and the site slug rarely agree** (a user `dedalo_user` with the home `/home/dedalo.dev`). A template unit whose `%i` fills all three cannot express that. Give each installation's units their own names — for example `dedalo-ts-my_domain.service` — and rename every reference between them in the rendered copies: the `OnFailure=`, `Wants=`, `Requisite=`, `After=` and `Also=` lines, the `--service`, `--socket` and unit arguments of the watchdog and rollback lines, and `RuntimeDirectory=` with the socket under it (`SERVER_UNIX_SOCKET` in that installation's `.env`).
- **Each instance needs its own group.** An adopted user often has the web server's group as its primary group, and two such instances then have no boundary between them — [the migration's Phase E](migrating_from_v6.md#82-give-the-adopted-user-its-own-group) gives each its own.

!!! warning "The installer's unit names are reserved"
    The installer writes its own template units — `dedalo-ts@.service` and its siblings — into `/etc/systemd/system/`, and refuses a file of the same name with other contents. Do not give hand-written units those names on a host where you may later run the installer for another instance.

Every instance needs its own socket, database and role, `MEDIA_PATH`, private directory and user; `DB_POOL_MAX` is per process, so budget the sum against PostgreSQL's `max_connections`. [Several instances on one host](multi_instance.md) explains why each must differ.
