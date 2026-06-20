# Installation

> See also: [Apache configuration](apache_configuration.md) · [Install on RHEL-based systems](install_fedora.md) · [Configuration](../config/index.md)

Dédalo manages cultural properties such as archaeological, ethnological and documentary heritage, memory and oral history. It is a client–server application, so before installing it you will need an internet server running Linux, with a static IP and a stable internet connection.

This manual shows how to prepare your server and install Dédalo.

## 1. Minimum and recommended server

Dédalo uses a NoSQL architecture, an abstraction model controlled by his ontology that requires intense calculations in real time. The data format is not defined in the database and is calculated in the execution time. Besides, Dédalo creates audiovisual editions in real time when the users and visitors search in the inventory. All of these features make intense use of the processor and RAM.

For the space to store all data and media, it depends on every project. Before buying or renting a server, think about the amount of data of your project and future growth. It's very normal that the projects manage thousands or hundred thousand records and images, pdfs or audiovisual files and millions of data relations and editions. Cultural catalogues managed with Dédalo stored all data around the cultural properties and it requires a large RAID system.

Recommended server:

OS:

- Minimal: Ubuntu 22.04 LTS/ Rocky 9 / RedHat 9
- Recommended:  Ubuntu 24.04 LTS / Rocky 9 / RedHat 9

> Note: if you want, you can use other OS as MacOs or Windows, their could be fine to develop or test it, but we do not recommended these options for production.

Hardware:

- Processor: 8 processors with 3+GHZ
- RAM: minimal 32GB / recommended: 64 GB
- HD for OS: 150GB+ for the system in RAID 10 (SSD)
- HD for data: 1TB+ for the data in RAID 10 (SSD if possible)

Network:

- Stable IP
- minimal: 500mb/s / recommended: 1gbps
- domain
- SSL certificate

Backup:

- 2 full copies (2 retention copies)

> Note: We recommend using an external backup system, in another building of the server facilities to preserve data from physical problems such as fire or flood.
> Dédalo creates a backup of the database automatically, it prepares the backup file to be copied to the backup system, but, for the media files you will need to configure your server to copy these files manually.

## 2. Installation options

Instead of installing from scratch, you can use our ready-to-use virtual machine, which comes fully installed and configured.

### 2.1. Ready-to-use virtual machine for V7

TODO

> Note: we do not recommend using this machine as a production system; it is fine for developing or learning about Dédalo. If you use it, change all passwords, because they are public.

### 2.2. Video guide for V7 installation

You can follow the steps in the V7 installation video:
[Dédalo V7 installation video on Ubuntu](./install_help.md#video-guide-for-v6-installation)

### 2.3. Manual installation

To install Dédalo manually, use the following commands. They are for Ubuntu 24.04 (as a reference only — you can use another GNU/Linux distribution):

1. Download official LTS version of [Ubuntu Server](https://ubuntu.com/download/server).
2. Install Ubuntu Server and all dependencies.
    1. Install PHP

        Usually Dédalo use the last version of PHP.
        To get the latest version of PHP you will need to install the PPA repository.

        ```shell
        sudo apt install ca-certificates apt-transport-https software-properties-common lsb-release
        sudo add-apt-repository ppa:ondrej/php
        sudo apt update
        ```

        Install PHP 8.5

        ```shell
        sudo apt install php8.5 php8.5-cli php8.5-common php8.5-mysql php8.5-pgsql php8.5-gd php8.5-mbstring php8.5-xml php8.5-pspell php8.5-tidy php8.5-bcmath php8.5-imap php8.5-soap php8.5-opcache php8.5-fpm php8.5-zip php8.5-curl
        ```

        ??? tip "PHP 8.4"

            ```shell
            sudo apt install php8.4 php8.4-cli php8.4-common php8.4-mysql php8.4-pgsql php8.4-gd php8.4-mbstring php8.4-xml php8.4-pspell php8.4-tidy php8.4-bcmath php8.4-imap php8.4-soap php8.4-opcache php8.4-fpm php8.4-zip php8.4-curl
            ```

    2. Install Apache and activate the modules.

        ```shell
        sudo apt install apache2 libapache2-mod-fcgid
        ```

        Activate modules

        ```shell
        sudo a2enconf php8.5-fpm
        sudo a2enmod actions fcgid alias proxy_fcgi
        sudo a2enmod ssl
        sudo a2enmod headers
        sudo a2enmod http2
        sudo a2enmod rewrite
        ```

        ??? tip "PHP 8.3"

            Replace the previous `a2enconf` with:

            ```shell
            sudo a2enconf php8.3-fpm
            ```

    3. Install PostgreSQL

        Get the official repository:

        ```shell
        sudo sh -c 'echo "deb https://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list'
        wget --quiet -O - https://www.postgresql.org/media/keys/ACCC4CF8.asc | sudo apt-key add -
        ```

        Install it.

        ```shell
        sudo apt-get update
        sudo apt-get -y install postgresql
        ```

    4. Install MariaDB or MySQL

        Get the repository of the LTS version

        ```shell
        sudo apt install wget apt-transport-https
        wget https://r.mariadb.com/downloads/mariadb_repo_setup
        echo "30d2a05509d1c129dd7dd8430507e6a7729a4854ea10c9dcf6be88964f3fdc25  mariadb_repo_setup" | sha256sum -c -
        chmod +x mariadb_repo_setup
        sudo ./mariadb_repo_setup
        ```

        Install it.

        ```shell
        sudo apt-get update
        sudo apt-get install mariadb-server
        ```

        Run the secure installation to remove default configuration.

        ```shell
        sudo mariadb-secure-installation
        ```

    5. Install ffmpeg

        ```shell
        sudo apt install ffmpeg
        ```

    6. Install ImageMagick

        ```shell
        sudo apt install imagemagick
        ```

    7. Install PDF tools

        ```shell
        sudo apt install poppler-utils
        ```

        > Optional: if you want you can use xpdf utils instead poppler.

        ```shell
        wget https://dl.xpdfreader.com/xpdf-tools-linux-4.05.tar.gz
        tar xpvf xpdf-tools-linux-4.05.tar.gz
        sudo mv xpdf-tools-linux-4.05/bin64/pdf* /usr/local/bin
        ```

        > Optional: you can use the OCR library if you wish. This will allow to process PDF files automatically after uploading.

         ```shell
        sudo apt install ocrmypdf
         ```

        !!!note About using multiple languages for OCR
            If you want to install additional languages for OCR processing, please read the official instructions [here.](https://ocrmypdf.readthedocs.io/en/latest/languages.html)

3. Download Dédalo and place it under the httpdocs directory of the web server.

    ```shell
    sudo wget https://github.com/renderpci/dedalo/archive/master.zip
    ```

    Unzip and rename it

    ```shell
    sudo unzip master.zip
    sudo mv dedalo-master dedalo
    ```

    Set the permissions of the 'dedalo' directory according to your Apache and PHP-FPM settings.

4. Create a database in PostgreSQL named `dedalo_xx` (you can change the `xx` as you please).

    1. Enter into `psql`:

        ```shell
        sudo su - postgres
        psql
        ```

    2. Create a Dédalo user:

        ```sql
        CREATE USER dedalo_user PASSWORD 'My_super_Secret_pw';
        ```

    3. Create a Dédalo database and comment it:

        ```sql
        CREATE DATABASE dedalo_xxx
        WITH ENCODING='UTF8'
        OWNER=dedalo_user
        CONNECTION LIMIT=-1
        TABLESPACE=pg_default;
        ```

        ```sql
        COMMENT ON DATABASE dedalo_xxx
        IS 'Dédalo: Cultural Heritage and Memory management system';
        ```

    4. Exit form `psql` and postgres user:

          ```shell
          \q
          exit
          ```

    5. PostgreSQL command-line authentication (backups, ontology update, etc.)

        !!! note "no `.pgpass` required"
            Dédalo authenticates the PostgreSQL command-line tools (`psql`, `pg_dump`,
            `pg_restore`) using the `PGPASSWORD` environment variable, taken from the
            `DEDALO_PASSWORD_CONN` value you set during configuration (next step). This
            works the same whether your database is **local or on a remote server**, so a
            `~/.pgpass` file is **not required**.

            If you prefer, a `~/.pgpass` file is still honored by libpq as a fallback when
            `DEDALO_PASSWORD_CONN` is empty (e.g. peer / trust authentication). To use it:

        ```shell
        nano ~/.pgpass
        chmod 0600 ~/.pgpass
        ```

5.  Apache, PHP configuration

    You can configure Apache and PHP as you wish following your needs. If you need help you can follow [this guide](apache_configuration.md) as reference.

6.  Dédalo Configuration.
    Before changing the config files you will need copy/rename the sample config files removing the word "sample", you can rename or copy this files. Please read the [configuration](../config/index.md) documentation for further explanation on this.

    1. Rename `sample.config.php` to `config.php`.

        ```shell
        cd [...]/dedalo/config/
        mv sample.config.php config.php
        ```

    2. Modify `[...]/dedalo/config/config.php` as you need. Usually, this involves the `DEDALO_ENTITY` string and the OS library paths. Read the [configuration](../config/config.md) documentation.

    3. Rename `sample.config_db.php` to `config_db.php`.

        ```shell
        cd [...]/dedalo/config/
        mv sample.config_db.php config_db.php
        ```

    4. Modify `[...]/dedalo/config/config_db.php` with your database configuration. Read the database [configuration](../config/config_db.md) documentation.

    5. Rename `sample.config_core.php` to `config_core.php`.

        ```shell
        cd [...]/dedalo/config/
        mv sample.config_core.php config_core.php
        ```

    6. Rename `[...]/dedalo/config/sample.config_areas.php` to `[...]/dedalo/config/config_areas.php`.

        ```shell
        cd [...]/dedalo/config/
        mv sample.config_areas.php config_areas.php
        ```

    7. Modify `[...]/dedalo/config/config_areas.php` with your areas configuration. Read the areas [configuration](../config/config_areas.md) documentation.

7. Open Dédalo in the browser.
8. Follow the instructions.
9. Once the installation process is done, log in and head to the Development Area. There, update the Ontology and register all tools.
10. Create an admin user.
11. Log out and log in with the admin user.
12. Create Users and Projects as you need.

### 2.4. Options

If you want to install Dédalo for Oral Memory or manage audiovisual files you can considered to install the h264 module to cut audiovisual files.

Follow the instructions [here](install_h264_module.md)
