# Apache Configuration for Dédalo with PHP 8.5

## Introduction

This documentation provides a comprehensive guide to configure a production-ready Apache web server for Dédalo with PHP 8.5, HTTP/2 support, and Let's Encrypt SSL certificates. This is only a reference of the configuration that can be used to deploy Dédalo on a production server, but you can change it according to your needs and requirements.

## Table of Contents

1. [System Requirements](#system-requirements)
2. [Certbot installation](#certbot-installation)
3. [Directory Structure Setup](#directory-structure-setup)
4. [Configuration Files](#configuration-files)
5. [SSL/TLS Setup with Let's Encrypt](#ssltls-setup-with-lets-encrypt)
6. [PHP Configuration](#php-configuration)
7. [Testing and Verification](#testing-and-verification)
8. [Troubleshooting](#troubleshooting)

## System Requirements

-   Apache 2.4+
-   PHP 8.5+
-   Ubuntu 22.04 LTS or later
-   At least 32GB RAM recommended

## Certbot installation

Install Certbot to obtain a SSL certificate for Dédalo website.

```bash
# Update package lists
sudo apt update

# Install Certbot for SSL
sudo snap install --classic certbot

# Prepare the Certbot command
sudo ln -s /snap/bin/certbot /usr/bin/certbot
```

### Configure PHP

```bash
# Verify PHP version
php -v

# Expected output:
# PHP 8.5.x (cli) (built: ...)

# Test PHP processing
echo "<?php phpinfo(); ?>" | sudo tee /var/www/dedalo.dev/httpdocs/info.php

# Restart services
sudo systemctl restart apache2 php8.5-fpm

```

## Directory Structure Setup

Before configuring Apache, you need to set up the proper directory structure with correct user permissions:

Typically, Dédalo home is the home of the GNU/Linux `dedalo_user`, the home will be accessed by PHP but NOT for Apache, because in the GNU/Linux `dedalo_user` will be stored sessions and `.pgpass` and `backups` directories and files with a sensible and private data.

A typical directory tree could be:

```tree
/
├── var/www/dedalo.dev
│   └── /httpdocs
│       └── /dedalo
│           ├── /config
│           ├── /core
│           ├── /docs
│           ├── /install
│           ├── /media
│           ├── /publication
│           ├── /shared
│           ├── /test
│           └── /tools
├── /var/www/dedalo.dev/sessions
├── /var/www/dedalo.dev/backups
├── /var/www/dedalo.dev/logs
└── /var/www/dedalo.dev/temp
```

But you can change it as you needs respecting this structure of paths, for example the Dédalo GNU/Linux home can be located in `/home/<user>/<project_name>` and `sessions` directory will be stored there and `httpdocs` will be into `/home/<user>/<project_name>/httpdocs`.

### Manual directory creation (optional)

If you want, you can create the Dédalo directory structure manually, but it's not necessary. You can change it for your needs.

```bash
# Create the main dedalo user
sudo useradd --home /var/www/dedalo.dev --shell /bin/sh --ingroup www-data dedalo_user

# Create the directory structure based on Dédalo config
sudo mkdir -p /var/www/dedalo.dev/httpdocs
sudo mkdir -p /var/www/dedalo.dev/sessions
sudo mkdir -p /var/www/dedalo.dev/backups
sudo mkdir -p /var/www/dedalo.dev/logs
sudo mkdir -p /var/www/dedalo.dev/temp

# Set ownership - main dedalo user owns the home directory
sudo chown dedalo_user:root /var/www/dedalo.dev

# Set permissions for httpdocs (Apache can read/write)
sudo chmod 755 /var/www/dedalo.dev/httpdocs
sudo chmod 750 /var/www/dedalo.dev/sessions
sudo chmod 750 /var/www/dedalo.dev/backups
sudo chmod 750 /var/www/dedalo.dev/logs
sudo chmod 750 /var/www/dedalo.dev/temp

# Set permissions for the main directory
sudo chmod 755 /var/www/dedalo.dev

# Set proper ownership for sessions, backups, logs and temp directories (only PHP can access)
sudo chown -R dedalo_user:root /var/www/dedalo.dev/sessions
sudo chown -R dedalo_user:root /var/www/dedalo.dev/backups
sudo chown -R dedalo_user:root /var/www/dedalo.dev/logs
sudo chown -R dedalo_user:root /var/www/dedalo.dev/temp
```

## Configuration Files

### About the log directory

By default, Ubuntu stores logs in the `/var/logs/` directory. This works well if your server is used by only one virtual host. However, if you have more than one virtual host, the logs will be stored in a different directory.

In such cases, you need to specify the logs for PHP and Apache to point to a specific directory within your virtual hosts.

This configuration is more straightforward than the default because all information related to Dédalo is stored in the `dedalo_user` home directory. Therefore, the configuration for Apache and PHP includes this information.

It is also recommended to configure automatic log rotation (by default every day).

### Virtual Host Configuration with HTTP/2 and PHP 8.5

Create file: `/etc/apache2/sites-available/dedalo.dev.conf`

```bash
nano /etc/apache2/sites-available/dedalo.dev.conf
```

And set the configuration as you needs, for example:

```conf
<VirtualHost *:80>
    ServerName dedalo.dev
    Redirect permanent / https://dedalo.dev/
</VirtualHost>

<VirtualHost *:443>
    ServerName dedalo.dev
    DocumentRoot "/var/www/dedalo.dev/httpdocs"
    ErrorLog  "/var/www/dedalo.dev/logs/error_log"

    SSLEngine on
    SSLCertificateFile "/etc/letsencrypt/live/dedalo.dev/fullchain.pem"
    SSLCertificateKeyFile "/etc/letsencrypt/live/dedalo.dev/privkey.pem"
    Include /etc/letsencrypt/options-ssl-apache.conf

    # HTTP/2 Configuration
    Protocols h2 http/1.1
    SSLProtocol TLSv1.3

    <Directory "/var/www/dedalo.dev/httpdocs">
        Options Indexes FollowSymLinks
        AllowOverride All
        Require all granted

        # PHP 8.5-FPM Proxy Pass
        <FilesMatch \.php$>
            SetHandler "proxy:unix(/var/run/php/php8.5-fpm.sock)|fcgi://localhost"
        </FilesMatch>
    </Directory>

    # Security Headers
    Header always set Strict-Transport-Security "max-age=31536000; includeSubDomains"
    Header always set X-Content-Type-Options "nosniff"
    Header always set X-Frame-Options "SAMEORIGIN"
</VirtualHost>
```

## SSL/TLS Setup with Let's Encrypt

### Obtain Let's Encrypt SSL Certificate

```bash
# Obtain certificate (interactively)
sudo certbot --apache -d dedalo.dev

# Or for non-interactive mode:
sudo certbot certonly --webroot -w /var/www/dedalo.dev -d dedalo.dev

# Auto-renewal setup
sudo crontab -l | { cat; echo "0 12 * * * certbot renew --quiet"; } | sudo crontab -
```

## PHP Configuration

### PHP-FPM Process Manager Settings (Optional)

```bash
nano /etc/php/8.5/fpm/pool.d/dedalo.dev
```

Change the pool with your configuration as you need, for example:

```ini
[dedalo.dev]
user = dedalo_user
group = www-data
listen = /var/run/php/php8.5-fpm.sock
listen.owner = dedalo_user
listen.group = www-data
pm = dynamic
pm.max_children = 50
pm.start_servers = 5
pm.min_spare_servers = 5
pm.max_spare_servers = 35
slowlog = /var/www/dedalo.dev/logs/php-fpm-slow.log
php_admin_flag[log_errors] = on
php_admin_value[error_log] = /var/www/dedalo.dev/logs/php_error_log
```

## Testing and Verification

```bash
# Test configuration syntax
sudo apachectl configtest

# Enable site and modules
sudo a2ensite dedalo.conf

# Restart Apache
sudo systemctl restart apache2

# Verify HTTP/2 support
curl -I --http2 https://dedalo.dev

# Expected response:
# HTTP/2 200
```

### Verification Commands

```bash
# Check Apache modules
apache2ctl -M | grep -E "ssl|http2|proxy"

# Check PHP version
curl -s http://dedalo.dev/info.php | grep "PHP Version"

# Check SSL configuration
sslscan dedalo.dev:443

# Check HTTP/2 support
curl -I --http2 https://dedalo.dev
```

## Troubleshooting

### Common Issues and Solutions

1. **Apache not starting after SSL configuration**

    - Check certificate paths are correct
    - Verify file permissions: `sudo chmod 644 /etc/letsencrypt/live/dedalo.dev/fullchain.pem`

2. **PHP not processing**

    - Ensure `mod_proxy_fcgi` is enabled
    - Check PHP-FPM service status: `sudo systemctl status php8.5-fpm`

3. **HTTP/2 not working**
    - Verify Apache version >= 2.4.17
    - Ensure SSL is properly configured

### Useful Logs for Debugging

```bash
# Apache error log
sudo tail -f /var/log/apache2/error.log

# Apache access log
sudo tail -f /var/log/apache2/access.log

# PHP-FPM log
sudo tail -f /var/www/dedalo.dev/logs/error_log
```
