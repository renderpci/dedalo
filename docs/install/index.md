# Installation

Dédalo is used to manage cultural properties as archeological, ethnological, documentary heritage, memory and oral history. Dédalo is a client -  server application, before install it, you will need an internet server with a Linux SO, with static ip, and a stable internet connection.

In this installation manual you will see how you can prepare your server before install Dédalo.

## 1. Minimum and recommended server

Dédalo uses a NoSQL architecture, an abstraction model controlled by his ontology that requires intense calculations in real time. The data format is not defined in the database and is calculated in the execution time. Besides, Dédalo creates audiovisual editions in real time when the users and visitors search in the inventory. All of these features make intense use of the processor and RAM.

For the space to store all data and media, it depends on every project. Before buying or renting a server, think about the amount of data of your project and future growth. It's very normal that the projects manage thousands or hundred thousand records and images, pdfs or audiovisual files and millions of data relations and editions. Cultural catalogues managed with Dédalo stored all data around the cultural properties and it requires a large RAID system.

Recommended server:

OS:

- Minimal: Ubuntu 20.04 LTS/ Rocky 8 / RedHat 8
- Recommended:  Ubuntu 22.04 LTS / Rocky 9 / RedHat 9

> Note: if you want, you can use other OS as MacOs or Windows, their could be fine to develop or test it, but we do not recommended these options for production.

Hardware:

- Processor: 8 processors with 3+GHZ
- RAM: minimal 16GB / recommended: 32 GB
- HD for OS: 100GB+ for the system in RAID 10 (SSD)
- HD for data: 1TB+ for the data in RAD 10 (if is possible SSD)

Network:

- Ip stable
- minimal: 500mb/s / recommended: 1gpbs
- domain
- SSL certificated

Backup:

- 2 full copies (2 retention copies)

> Note: We recommend using an external backup system, in another building of the server facilities to preserve data from physical problems such as fire or flood.
> Dédalo creates a backup of the database automatically, it prepares the backup file to be copied to the backup system, but, for the media files you will need to configure your server to copy these files manually.

## 2. Installation options

Instead install you can use our "ready to use" virtual machine with all installed and configured.

### 2.1. Ready-to-use Virtual Machine for V6

Then, you can use our V6 ready-to-use Virtual Machine for development:

[Dedalo V6](./install_help.md#v6-ready-to-use-virtual-machine-for-development)

> Note: we do not recommended use this machine as production system, it could be fine to develop or learn about Dédalo. If you want to use it you will need change all passwords because are public.

### 2.2. Video-guide for V6 installation

Then, you can follow the steps in the V6 installation video:
[Dedalo V6 installation video on Ubuntu](./install_help.md#video-guide-for-v6-installation)

### 2.3. Manual installation

Then, install Dédalo manually, commands are for Ubuntu 22.04 (only as references, you can use other GNU/Linux):

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

        Install PHP 8.3

        ```shell
        sudo apt install php8.3 php8.3-cli php8.3-common php8.3-mysql php8.3-pgsql php8.3-gd php8.3-mbstring php8.3-xml php8.3-pspell php8.3-tidy php8.3-bcmath php8.3-imap php8.3-soap php8.3-opcache php8.3-fpm php8.3-zip php8.3-curl
        ```

    2. Install Apache and activate the modules.

        ```shell
        sudo apt install apache2 libapache2-mod-fcgid
        ```

        Active modules

        ```shell
        sudo a2enconf php8.3-fpm
        sudo a2enmod actions fcgid alias proxy_fcgi
        sudo a2enmod ssl
        sudo a2enmod headers
        sudo a2enmod http2
        sudo a2enmod rewrite
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

    5. Create '.pgpass' file, it will be used to create backups or update ontology.

        !!! note "about `.pgpass` file"
            Dédalo use default `.pgpass` access to postgreSQL command tools.

            Note that `.pgpass` file has your postgreSQL credentials to access your database.
            Please read the [PostgreSQL documentation about this file.](https://www.postgresql.org/docs/current/libpq-pgpass.html)

        ```shell
        nano .pgpass
        chmod 0600 ~/.pgpass
        ```

5. Configuration.
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

6. Open Dédalo in the browser.
7. Follow the instructions.
8. Once the installation process is done, log in and head to the Development Area. There, update the Ontology and register all tools.
9. Create an admin user.
10. Log out and log in with the admin user.
11. Create Users and Projects as you need.

### 2.4. Options

If you want to install Dédalo for Oral Memory or manage audiovisual files you can considered to install the h264 module to cut audiovisual files.

Follow the instructions [here](install_h264_module.md)
