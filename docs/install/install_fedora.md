# Installation on RHEL-based Systems

Dédalo can be installed on various RHEL-based distributions including:
- Red Hat Enterprise Linux 9+
- Rocky Linux 9
- AlmaLinux 9
- Fedora Workstation/Server

This guide provides distribution-specific installation instructions.

## System Requirements

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

## Installation Steps

### 1. System Update and Base Packages

```bash
# Update system packages
sudo dnf update -y

# Install essential development tools
sudo dnf groupinstall "Development Tools" -y
sudo dnf install wget curl git unzip zip tar make zlib-devel bzip2-devel openssl-devel ncurses-devel sqlite-devel readline-devel xz-devel libffi-devel -y
```

### 2. Web Server and PHP Installation

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

### 3. Database Installation

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

### 4. Media Processing Tools

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

### 5. Download and Configure Dédalo

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

# Create .pgpass file
echo "*:*:*:dedalo_user:YourSecurePassword" > ~/.pgpass
chmod 600 ~/.pgpass
```

### 6. Configuration Files

```bash
cd /path/to/dedalo/config/

# Rename sample configuration files
mv sample.config.php config.php
mv sample.config_db.php config_db.php
mv sample.config_core.php config_core.php
mv sample.config_areas.php config_areas.php

# Edit configuration files as needed
nano config.php        # Set DEDALO_ENTITY, paths, etc.
nano config_db.php     # Database connection details
nano config_core.php   # Core settings
nano config_areas.php  # Areas configuration
```

### 7. Complete the Installation

```bash
# Restart web server
sudo systemctl restart httpd

# Open browser and navigate to your server IP
# Follow the on-screen installation instructions

# After installation:
# 1. Log in as admin
# 2. Go to Development Area
# 3. Update Ontology
# 4. Register all tools
```

## Troubleshooting

### Common Issues:

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
