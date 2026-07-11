# Installation

> See also: [Installing the TypeScript/Bun server (TS-native)](ts_native_install.md) · [Apache configuration](apache_configuration.md) · [Install on RHEL-based systems](install_fedora.md) · [Configuration](../config/index.md)

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

        > **v7 note:** MariaDB is used only by the optional [diffusion (publication) engine](../diffusion/native_engine.md). You still install the MariaDB **server** here, but its **connection** is configured with the `DEDALO_DIFFUSION_DB_*` keys in the TS server's `../private/.env`, not in any PHP config file.

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

6.  Dédalo configuration

    > **TS/Bun rewrite note:** this whole guide documents the classic **PHP** application. The coexisting TypeScript/Bun rewrite server (`src/server.ts`) now has its **own install process** — it no longer needs this PHP wizard. It provisions an empty PostgreSQL database itself (schema + core ontology from a bundled seed), sets the `root` password, and writes its own *separate* `../private/.env` (never shared with the PHP install's `private/`). See **[Installing the TypeScript/Bun server](ts_native_install.md)** for the full guide (browser wizard **or** headless CLI), and [STATUS.md](../../rewrite/STATUS.md) for what the rewrite currently covers.

    **In v7 there are no config files to rename or edit during installation.** The web-served `config/` directory holds only the loader `config/bootstrap.php` and sample templates — there is nothing to copy. All per-install values and secrets live **outside the web root** in a `../private/` directory (a *sibling* of the install root), and the browser **install wizard writes them for you** in the next step (auto-generating the secrets).

    The only thing to prepare is that the wizard can create `../private/`: make sure the directory **one level above** your Dédalo install root is **writable by the PHP/web user**. The installer creates `../private/` (`chmod 0700`) and writes `.env` / `state.php` there. For example, if Dédalo lives at `/var/www/httpdocs/dedalo`, the installer creates `/var/www/httpdocs/private/`.

    > **Advanced (optional):** instead of the wizard you can pre-author `../private/.env` by hand — run `php dev/gen_sample_env.php` to write the documented `../private/sample.env`, copy it to `../private/.env`, and edit it. See the **[Configuration Administrator Guide](../config/administration.md)** for the full model (the `.env` file, per-host `.env.<host>` overrides, secrets, and the settings catalog).
    >
    > **MariaDB/MySQL** is only used by the optional **diffusion** (publication) subsystem. In the TS server the diffusion engine is built in, and its MariaDB connection is configured with the `DEDALO_DIFFUSION_DB_*` keys in the TS server's own `../private/.env`. See [the diffusion engine](../diffusion/native_engine.md#configuration) docs.

7.  Open Dédalo in your browser.

    Because the installation is not yet sealed, the **install wizard** starts automatically and walks you through these steps:

    1. **Diagnostics** — environment checks (PHP version, PostgreSQL, required extensions, writable paths).
    2. **Database** — the PostgreSQL connection: the database and user you created in step 4.
    3. **Entity** — your `DEDALO_ENTITY` name and locale.
    4. **Diffusion** *(optional)* — enable the MariaDB publication (diffusion) target and test its connection.
    5. **Save config** — the wizard writes `../private/.env` and `../private/state.php` (including the diffusion connection settings if you enabled diffusion), **auto-generating the secrets** (`DEDALO_SALT_STRING`). You never edit a config file.
    6. **Directories** — creates the media / sessions / backups directories.
    7. **Install Dédalo DDBB** — loads the database schema into your PostgreSQL database.
    8. **Set root password** — choose the `root` user password.
    9. **Login** and **Install hierarchies** — log in and import the base ontology hierarchies.
    10. **Done!** — the install is sealed (`DEDALO_INSTALL_STATUS=installed`, written to `../private/state.php`) and the wizard no longer runs.

8.  Log in and head to the Development Area. There, update the Ontology and register all tools.
9.  Create an admin user.
10. Log out and log in with the admin user.
11. Create Users and Projects as you need.

### 2.4. Options

If you want to install Dédalo for Oral Memory or manage audiovisual files you can considered to install the h264 module to cut audiovisual files.

Follow the instructions [here](install_h264_module.md)
