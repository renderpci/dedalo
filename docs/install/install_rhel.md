# Installing on RHEL-based systems

> See also: [Production install](production.md) · [Reverse proxy and TLS](reverse_proxy.md) · [Troubleshooting](troubleshooting.md)

This page is a **delta**, not a second manual. Follow the
[production install](production.md) — the fifteen steps, the layout, the
configuration, the verification — and substitute the commands below where they
differ. Four things change: the package manager and package names, the PostgreSQL
repository, SELinux, and firewalld.

Applies to **RHEL 9+, Rocky Linux 9, AlmaLinux 9 and Fedora**.

## What changes

| Step in [production](production.md) | On RHEL |
| --- | --- |
| 2 · base packages | `dnf`, and EPEL for some tools |
| 3 · media toolchain | `ffmpeg` needs RPM Fusion; the package is `ImageMagick` |
| 4 · PostgreSQL 18 | the PGDG **RPM** repository, and `dnf -qy module disable postgresql` |
| 5 · pinned Bun | identical |
| 6–9 · code, database, installer, `.env` | identical |
| 10–11 · media gate, proxy | identical, **plus SELinux contexts** |
| 12 · systemd | identical, **plus SELinux for the socket** |
| everything else | identical |

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

dnf install -y ffmpeg ImageMagick poppler-utils ocrmypdf
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

    Declare them in `../private/.env`:

    ```dotenv
    DEDALO_PG_BIN_PATH=/usr/pgsql-18/bin
    ```

    …and export the same value for the install command itself, since `.env` does
    not exist yet at that point:

    ```shell
    sudo -u dedalo \
      DEDALO_PG_BIN_PATH=/usr/pgsql-18/bin \
      DEDALO_INSTALL_ROOT_PASSWORD='the-root-password' \
      MEDIA_PATH=/srv/dedalo/media \
      /opt/dedalo/.bun/bin/bun run scripts/install.ts …
    ```

Create the empty database and role exactly as in
[step 7](production.md#7-create-the-database-and-role-empty), using
`sudo -u postgres /usr/pgsql-18/bin/psql`.

## 5. Firewall (firewalld)

```shell
firewall-cmd --permanent --add-service=http
firewall-cmd --permanent --add-service=https
firewall-cmd --reload
```

Do **not** open the database port, and do **not** open a port for the engine:
production serving is over a unix socket, and the proxy is the only thing that
should be reachable from outside.

## 6. SELinux

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
and the web-server user added to the `dedalo` group.

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

## 7. The web server

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

Steps 5, 6, 8, 9, 10, 13, 14, 15 and 16 of the
[production install](production.md) apply **verbatim**. The engine does not know
which distribution it is running on.
