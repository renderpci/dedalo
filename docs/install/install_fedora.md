# Installation on RHEL-based systems

> See also: [Installation](index.md) · [Apache configuration](apache_configuration.md)

Dédalo can be installed on various RHEL-based distributions, including:
- Red Hat Enterprise Linux 9+
- Rocky Linux 9
- AlmaLinux 9
- Fedora Workstation/Server

This guide provides distribution-specific installation instructions.

## System requirements

### OS
- **Supported Distributions**: 
  - RHEL 9.2+ (with CodeReady Builder repository)
  - Rocky Linux 9.x
  - AlmaLinux 9.x
  - Fedora 38-40
- **Note**: Some packages may require additional repositories on RHEL-based systems.

### Hardware
- **Processor**: 8-core CPU with 3+ GHz
- **RAM**: Minimum 16 GB / Recommended: 64 GB
- **Storage**: 
  - OS: 100+ GB (RAID 10 preferred)
  - Data: 1 TB+ (RAID 10 for media files)

### Network
- Stable IP address
- 500 Mbps+ connection speed
- SSL certificate installed

## Installation steps

### 1. System update and base packages

```bash
# Update system packages
sudo dnf update -y

# Install essential development tools
sudo dnf groupinstall "Development Tools" -y
sudo dnf install wget curl git unzip zip tar make zlib-devel bzip2-devel openssl-devel ncurses-devel sqlite-devel readline-devel xz-devel libffi-devel -y
```

### 2. Web server and PHP installation

```bash
# Install EPEL repository (for Rocky/Alma)
sudo dnf install epel-release -y

# Install Remi repository for newer PHP versions
sudo dnf install https://rpms.remirepo.net/enterprise/remi-release-9.rpm -y
sudo dnf module enable php:remi-8.4 -y

# Install Apache and PHP
sudo dnf install httpd mod_ssl php php-cli php-common php-pdo php-mysqlnd php-pgsql php-gd php-mbstring php-xml php-pspell php-tidy php-bcmath php-imap php-soap php-opcache php-fpm php-zip php-curl -y

# Configure PHP for large file handling and sufficient memory
sudo sed -i 's/;date.timezone =.*/date.timezone = UTC/' /etc/php.ini
sudo sed -i 's/upload_max_filesize = 2M/upload_max_filesize = 16G/' /etc/php.ini
sudo sed -i 's/post_max_size = 8M/post_max_size = 16G/' /etc/php.ini
sudo sed -i 's/;memory_limit = .*/memory_limit = 4096M/' /etc/php.ini

# Verify PHP configuration
php -r "echo ini_get('upload_max_filesize') . PHP_EOL;"
# Enable and start Apache
sudo systemctl enable --now httpd
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --reload
```

### 3. Database installation

#### PostgreSQL
```bash
# Install PostgreSQL
sudo dnf install postgresql-server postgresql-contrib -y

# Initialize database with custom configuration
sudo postgresql-setup --initdb --unit postgresql

# Configure memory settings (edit postgresql.conf)
sudo sed -i 's/#shared_buffers =.*/shared_buffers = 4GB/' /var/lib/pgsql/data/postgresql.conf
sudo sed -i 's/#work_mem =.*/work_mem = 128MB/' /var/lib/pgsql/data/postgresql.conf
sudo sed -i 's/#maintenance_work_mem =.*/maintenance_work_mem = 512MB/' /var/lib/pgsql/data/postgresql.conf
sudo sed -i 's/#effective_cache_size =.*/effective_cache_size = 8GB/' /var/lib/pgsql/data/postgresql.conf

# Enable and start service
sudo systemctl enable --now postgresql
# Secure installation
sudo /usr/bin/postgresql-upgrade-15-to-16  # Adjust version as needed
```

#### MariaDB (Alternative)

> **v7 note:** MariaDB is the *publication* target only — the work data lives in PostgreSQL. Install the MariaDB **server**, and configure the diffusion connection with the `DEDALO_DIFFUSION_DB_*` keys in `../private/.env` (see [The diffusion engine → Configuration](../diffusion/native_engine.md#configuration)). Target databases are pre-created by the administrator; the engine never creates them.

```bash
# Install MariaDB repository
sudo dnf install https://downloads.mariadb.com/MariaDB/mariadb_repo_setup -y
sudo mariadb-repo-setup --mariadb-server-version=10.6

# Install MariaDB server
sudo dnf install mariadb-server -y

# Start and enable service
sudo systemctl enable --now mariadb

# Secure installation
sudo mysql_secure_installation
```

### 4. Media processing tools

```bash
# Install RPM Fusion repository for multimedia codecs
sudo dnf install https://mirrors.rpmfusion.org/free/fedora/rpmfusion-free-release-$(rpm -E %fedora).noarch.rpm https://mirrors.rpmfusion.org/nonfree/fedora/rpmfusion-nonfree-release-$(rpm -E %fedora).noarch.rpm -y
sudo dnf upgrade --refresh

# Install FFmpeg and codecs
sudo dnf install ffmpeg ffmpeg-plugins-free ffmpeg-codecs -y

# Verify installation
ffmpeg -version
# Install ImageMagick for image manipulation
sudo dnf install ImageMagick -y

# Install PDF tools
sudo dnf install poppler-utils ocrmypdf -y

# Optional: Additional languages for OCR
sudo dnf install ocrmypdf-lang-* -y
```

### 5. Download and configure Dédalo

```bash
# Download Dédalo
wget https://github.com/renderpci/dedalo/archive/master.zip
unzip master.zip
mv dedalo-master dedalo

# Set permissions
sudo chown -R apache:apache /path/to/dedalo
sudo chmod -R 755 /path/to/dedalo

# Create database (PostgreSQL example)
sudo -u postgres psql <<EOF
CREATE USER dedalo_user PASSWORD 'YourSecurePassword';
CREATE DATABASE dedalo_production WITH ENCODING='UTF8' OWNER=dedalo_user;
COMMENT ON DATABASE dedalo_production IS 'Dédalo: Cultural Heritage Management System';
\q
EOF

# No .pgpass file is required: Dédalo authenticates the PostgreSQL command-line
# tools via the PGPASSWORD env var taken from DEDALO_PASSWORD_CONN (set in the
# config step below), which works for a local or remote database alike.
# A ~/.pgpass file is still honored by libpq as a fallback if you prefer it:
#   echo "*:*:*:dedalo_user:YourSecurePassword" > ~/.pgpass
#   chmod 600 ~/.pgpass
```

### 6. Configuration (v7)

> **TS/Bun rewrite note:** this guide installs the classic **PHP** application. The coexisting TypeScript/Bun rewrite server (`src/server.ts`) now has its **own** install process — a browser wizard and a headless CLI that provision an empty PostgreSQL database (schema + core ontology from a bundled seed), set the `root` password, and write its own *separate* `../private/.env`. It no longer needs the PHP wizard. See **[Installing the TypeScript/Bun server](ts_native_install.md)** and [STATUS.md](../../rewrite/STATUS.md) for current TS coverage.

**There are no config files to rename or edit.** In v7 the web-served `config/` directory holds only the loader `config/bootstrap.php`; all per-install values and secrets live outside the web root in `../private/`, and the browser **install wizard writes them for you** in the next step (auto-generating the secrets).

Just make sure the directory **one level above** the install root is writable by the PHP/web user — the installer creates `../private/` (`chmod 0700`) and writes `.env` / `state.php` there.

```bash
# e.g. install at /var/www/html/dedalo  →  installer creates /var/www/html/private/
# ensure the parent dir is writable by the web/PHP user (apache / nginx / php-fpm)
sudo chown apache:apache /var/www/html        # adjust to your web user
```

> **Advanced:** instead of the wizard you can pre-author `../private/.env` by hand — run `php dev/gen_sample_env.php` (writes `../private/sample.env`), copy it to `../private/.env`, and edit. See the [Configuration Administrator Guide](../config/administration.md).
>
> **MariaDB** is only for the optional **diffusion** subsystem — configured with the `DEDALO_DIFFUSION_DB_*` keys in `../private/.env`; the work server itself stores all work data in PostgreSQL.

### 7. Complete the installation

```bash
# Restart web server
sudo systemctl restart httpd
```

Open a browser at your server's address. Because the install is not yet sealed, the **install wizard** starts automatically: it collects the configuration (PostgreSQL connection, entity, optional diffusion), writes `../private/.env` + `state.php`, installs the database schema and base hierarchies, and lets you set the `root` password — then seals the install. See the [Ubuntu install guide](index.md#23-manual-installation) for the full step-by-step list.

After installation:

1. Log in as `root`.
2. Go to the Development Area, update the Ontology and register all tools.
3. Create an admin user, then log out and log in as that admin.

## Troubleshooting

### Common issues

**1. PHP modules not loading:**
```bash
php -m | grep pgsql
ls /etc/php.d/*pgsql*.ini
```

**2. Database connection errors:**
```bash
psql -U dedalo_user -d dedalo_production
tail -f /var/log/postgresql-*/*.log
```

**3. Permission issues:**
```bash
ls -ld /path/to/dedalo
sudo chown -R apache:apache /path/to/dedalo
```

## Notes

- Fedora uses `dnf` package manager instead of `apt`
- SELinux may need configuration for proper operation
- Firewall settings are critical for web server access
- Always use strong passwords for database and admin accounts
