# Installing on RHEL-based systems

> See also: [Production install](production.md) · [Reverse proxy and TLS](reverse_proxy.md) · [Troubleshooting](troubleshooting.md)

This page is a **delta**, not a second manual. Follow the
[production install](production.md) — the fifteen steps, the layout, the
configuration, the verification — and substitute the commands below where they
differ. Four things change: the package manager and package names, the PostgreSQL
repository (and with it the PostgreSQL service name), SELinux, and firewalld.

Applies to **RHEL 9+, Rocky Linux 9, AlmaLinux 9 and Fedora**.

## What changes

| Step in [production](production.md) | On RHEL |
| --- | --- |
| 2 · base packages | `dnf`, and EPEL for some tools |
| 3 · media toolchain | `ffmpeg` needs RPM Fusion; the package is `ImageMagick` |
| 4 · PostgreSQL 18 | the PGDG **RPM** repository, and `dnf -qy module disable postgresql` |
| 5 · pinned Bun | identical |
| 6 · code | identical |
| 7 · database and role | identical, with the PGDG `psql` (`/usr/pgsql-18/bin/psql`) |
| 8 · installer | the same answers and the same `.env` keys (`ONTOLOGY_SERVERS` and `CODE_SERVERS` included), **plus `DEDALO_PG_BIN_PATH`** for the PGDG client binaries — [below](#5-run-the-installer-step-8) |
| 9 · `.env` tuning | identical |
| 10 · systemd | the PostgreSQL unit is `postgresql-18.service`, not `postgresql.service` — [the unit below](#6-the-systemd-unit-step-10) — **plus SELinux for the socket** |
| 11 · proxy, media gate | Apache is `httpd`, nginx comes from EPEL, **plus SELinux contexts** |
| 12–15 · first login, backups, optional subsystems, verification | identical |

## 1. Service user and directories (step 1)

```shell
useradd --system --home-dir /opt/dedalo --shell /sbin/nologin dedalo
mkdir -p /opt/dedalo /srv/dedalo/media
chown dedalo:dedalo /opt/dedalo /srv/dedalo/media
chmod 0755 /opt/dedalo
```

## 2. Base packages (step 2)

```shell
dnf install -y epel-release
dnf install -y git unzip gzip file ca-certificates curl tar
```

## 3. Media toolchain (step 3)

`ffmpeg` is not in the base repositories — RPM Fusion carries it.

```shell
# Rocky / AlmaLinux / RHEL 9
dnf install -y \
  https://mirrors.rpmfusion.org/free/el/rpmfusion-free-release-9.noarch.rpm \
  https://mirrors.rpmfusion.org/nonfree/el/rpmfusion-nonfree-release-9.noarch.rpm
crb enable          # CodeReady Builder (on RHEL: subscription-manager repos --enable …)

# Fedora
# dnf install -y \
#   https://mirrors.rpmfusion.org/free/fedora/rpmfusion-free-release-$(rpm -E %fedora).noarch.rpm \
#   https://mirrors.rpmfusion.org/nonfree/fedora/rpmfusion-nonfree-release-$(rpm -E %fedora).noarch.rpm

dnf install -y ffmpeg ImageMagick poppler-utils ocrmypdf librsvg2-tools
```

!!! warning "The package is `ImageMagick`, with capitals"
    `dnf install imagemagick` fails. And the RHEL 9 package is **ImageMagick 6**:
    it provides `convert` and `identify` but no `magick` binary. That is
    supported — the engine probes for `magick` first and falls back
    automatically. Nothing to configure.

Verify the binaries the engine will look for under `/usr/bin`:

```shell
command -v ffmpeg ffprobe qt-faststart convert identify pdftotext ocrmypdf
```

If `qt-faststart` is absent, set `DEDALO_AV_FASTSTART_PATH` in `.env` once you
have it.

## 4. PostgreSQL 18 (step 4)

The distribution ships an older PostgreSQL as a module, and it wins over PGDG
unless you disable it.

```shell
dnf install -y https://download.postgresql.org/pub/repos/yum/reporpms/EL-9-x86_64/pgdg-redhat-repo-latest.noarch.rpm
dnf -qy module disable postgresql

dnf install -y postgresql18-server postgresql18

/usr/pgsql-18/bin/postgresql-18-setup initdb
systemctl enable --now postgresql-18
```

!!! warning "The client binaries are not on `$PATH`"
    PGDG installs them under `/usr/pgsql-18/bin/`, which is not on the default
    path — so the installer's pre-flight check reports **`psql` not found**, or,
    worse, resolves an *older* client from elsewhere and fails mid-install.

    `DEDALO_PG_BIN_PATH` names that directory. The installer needs it in its
    environment (`.env` does not exist yet), and the server and the backup job
    need it in `.env` afterwards — both are in [the next section](#5-run-the-installer-step-8).

Create the empty database and role exactly as in
[step 7](production.md#7-create-the-database-and-role-empty), using
`sudo -u postgres /usr/pgsql-18/bin/psql`.

## 5. Run the installer (step 8)

The same command as [production step 8](production.md#8-run-the-installer), with
one more variable carried into it. The passwords are read silently, never typed
literally, and the serving keys are flags, so the installer persists them:

```shell
read -rsp 'Database password: '  DB_PASSWORD;                  echo
read -rsp 'New root password:  '  DEDALO_INSTALL_ROOT_PASSWORD; echo
export DB_PASSWORD DEDALO_INSTALL_ROOT_PASSWORD DEDALO_PG_BIN_PATH=/usr/pgsql-18/bin

cd /opt/dedalo/master_dedalo
sudo -u dedalo --preserve-env=DB_PASSWORD,DEDALO_INSTALL_ROOT_PASSWORD,DEDALO_PG_BIN_PATH \
  /opt/dedalo/.bun/bin/bun run scripts/install.ts \
    --db-name dedalo_main \
    --db-user dedalo_user \
    --db-password "$DB_PASSWORD" \
    --db-host localhost \
    --db-port 5432 \
    --media-path /srv/dedalo/media \
    --media-access-mode publication \
    --socket /run/dedalo/dedalo_ts.sock \
    --entity institution \
    --entity-label 'My Institution' \
    --locale es-ES \
    --timezone Europe/Madrid \
    --langs lg-eng,lg-spa \
    --app-lang lg-eng \
    --data-lang lg-eng

unset DB_PASSWORD DEDALO_INSTALL_ROOT_PASSWORD DEDALO_PG_BIN_PATH
```

`DEDALO_PG_BIN_PATH` is not an install answer, so the installer does not write it.
Append it to the `.env` the installer just created; it keeps the key on any
later run:

```shell
sudo -u dedalo tee -a /opt/dedalo/private/.env >/dev/null <<'ENV'
DEDALO_PG_BIN_PATH=/usr/pgsql-18/bin
ENV
```

Without it the server finds no `pg_dump` for its backups, and the nightly backup
job does not find it either.

## 6. The systemd unit (step 10)

Step 10 is the same procedure: install `dedalo-code-rollback.sh` and
`dedalo-ts-watchdog.sh` into `/opt/dedalo/bin/`, copy the units, replace the
placeholders, enable. One line differs. The shipped `dedalo-ts.service` orders
itself after `postgresql.service`, and PGDG names its service `postgresql-18`.
Left as shipped, `After=` and `Wants=` name a unit that does not exist, systemd
ignores them, and at boot Dédalo races PostgreSQL. This is the complete unit for
this layout, as `/etc/systemd/system/dedalo-ts.service`; the reasons for each line
are in the comments of `deploy/dedalo-ts.service`:

```ini
[Unit]
Description=Dedalo TS server (Bun)
After=network.target postgresql-18.service
Wants=postgresql-18.service
# the health watchdog comes with the server
Wants=dedalo-ts-watchdog.timer
# 5 starts per 5 min: planned restarts never exhaust it, a hot crash loop does
StartLimitIntervalSec=300
StartLimitBurst=5
# start limit exhausted = a new code tree that never boots: roll it back
OnFailure=dedalo-ts-rollback.service

[Service]
Type=simple
User=dedalo
Group=dedalo
WorkingDirectory=/opt/dedalo/master_dedalo
# the pinned runtime, never a floating `bun` on PATH
ExecStart=/opt/dedalo/.bun/bin/bun run src/server.ts
# creates /run/dedalo on every start; SERVER_UNIX_SOCKET lives under it
RuntimeDirectory=dedalo
RuntimeDirectoryMode=0750
# socket srwxrwx---: the web-server user reaches it through the dedalo group
UMask=0007
Restart=always
RestartSec=3
# exit 75 is a planned restart (installer, code update or restore): not a failure
SuccessExitStatus=75
# systemd restarts this process: the code update panel requires the declaration
Environment=DEDALO_SUPERVISED=true
TimeoutStopSec=30
KillSignal=SIGTERM
# signal the server only: diffusion runners finish their job across a restart
KillMode=process
StandardOutput=journal
StandardError=journal
SyslogIdentifier=dedalo-ts
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
Also=dedalo-ts-watchdog.timer
```

`Environment=DEDALO_SUPERVISED=true` must stay in the unit: a `DEDALO_SUPERVISED`
line in `/opt/dedalo/private/.env` is ignored. The other units (`dedalo-ts-watchdog`,
`dedalo-ts-restart`, `dedalo-ts-rollback`, `dedalo-backup`) do not name the
PostgreSQL service and are used as shipped, with the placeholders replaced.

To keep the shipped file instead, override only the ordering with a drop-in
(`systemctl edit dedalo-ts`). `After=` and `Wants=` add to the shipped values, so
the reference to `postgresql.service` stays but is ignored, and the drop-in
supplies the real one:

```ini
[Unit]
After=postgresql-18.service
Wants=postgresql-18.service
```

## 7. Firewall (firewalld)

```shell
firewall-cmd --permanent --add-service=http
firewall-cmd --permanent --add-service=https
firewall-cmd --reload
```

Do **not** open the database port, and do **not** open a port for the engine:
production serving is over a unix socket, and the proxy is the only thing that
should be reachable from outside.

## 8. SELinux

SELinux is enforcing by default, and it is why a configuration that is correct on
Ubuntu can still answer `502` and `403` here. Three things need attention.

### The web server must be allowed to connect out

```shell
setsebool -P httpd_can_network_connect 1
```

### The unix socket must be reachable by the web server

Put the socket in a systemd `RuntimeDirectory` (as
[step 10](production.md#10-run-the-engine-under-systemd) does) and label it:

```shell
semanage fcontext -a -t httpd_var_run_t '/run/dedalo(/.*)?'
restorecon -Rv /run/dedalo
```

The *permission* half of that step still applies too: `UMask=0007` in the unit,
and the web-server user added to the `dedalo` group. So does the unit's
`Environment=DEDALO_SUPERVISED=true`, which tells the engine systemd will restart
it after a code update: it must stay in the unit — a `DEDALO_SUPERVISED` line in
`/opt/dedalo/private/.env` is ignored.

### The media tree and the client tree must be readable by the web server

```shell
semanage fcontext -a -t httpd_sys_content_t '/srv/dedalo/media(/.*)?'
semanage fcontext -a -t httpd_sys_content_t '/opt/dedalo/master_dedalo/client(/.*)?'
restorecon -Rv /srv/dedalo/media /opt/dedalo/master_dedalo/client
```

!!! note "The media tree is *written* by the engine and *read* by the web server"
    The engine writes the generated rule files and the marker store into
    `MEDIA_PATH`; the web server only ever reads them. `httpd_sys_content_t` is
    therefore the right label — the engine writes as `dedalo`, unconstrained by
    `httpd_*` policy.

!!! tip "When something is denied and you cannot see why"
    ```shell
    ausearch -m AVC -ts recent
    ```

    Read the denial before reaching for `setenforce 0`. Turning SELinux off makes
    the symptom disappear and leaves you with a server you cannot reproduce.

## 9. The web server (step 11)

nginx is in EPEL. Apache's service is `httpd` (not `apache2`), its modules live
in `/etc/httpd/conf.modules.d/` and its vhosts in `/etc/httpd/conf.d/`.
Otherwise the [reverse proxy](reverse_proxy.md) page applies unchanged —
including the generated media rule files, the root rule, and the timeouts.

```shell
dnf install -y nginx                 # or: dnf install -y httpd mod_ssl
systemctl enable --now nginx

dnf install -y certbot python3-certbot-nginx     # or python3-certbot-apache
certbot --nginx -d dedalo.example.org
```

## Everything else

Steps 5, 6, 9, 12, 13, 14 and 15 of the [production install](production.md)
apply **verbatim**. Steps 7, 8, 10 and 11 apply with the deltas above. The engine
does not know which distribution it is running on.
