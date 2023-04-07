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

<p><a href="https://dedalo.dev/v6" target="_blank">Dedalo V5</a></p>

> Note: we do not recommended use this machine as production system, it could be fine to develop or learn about Dédalo. If you want to use it you will need change all passwords because are public.

### 2.2. Video-guide for V6 installation

Then, you can follow the steps in the V6 installation video:

<p><a href="https://dedalo.dev/v5_install" target="_blank">Dedalo V6 installation video on Ubuntu</a></p>

### 2.3. Manual installation

Then, install Dédalo manually, commands are Ubuntu 22.04 (only as references):

1. Install Ubuntu and all dependeces.

   1. Install PHP

      ```shell
      apt install php8.2 php8.2-cli php8.2-common php8.2-mysql php8.2-pgsql php8.2-gd php8.2-mbstring php8.2-xml php8.2-pspell php8.2-tidy php8.2-bcmath php8.2-imap php8.2-soap php8.2-opcache php8.2-fpm php8.2-zip php8.2-curl
      ```

      > Note: the minimal version for PHP is 8.1 so you could change previous command for it.
      >
   2. Install Apache and activate the mods

      ```shell
      apt install apache2 libapache2-mod-fcgid
      ```

      Active modules

      ```shell
      a2enconf php8.2-fpm
      a2enmod actions fcgid alias proxy_fcgi
      a2enmod ssl
      a2enmod headers
      a2enmod http2
      a2enmod rewrite
      ```

   3. Install PostgreSQL

      Get the official repository:

      ```shell
      sh -c 'echo "deb http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list'
      wget --quiet -O - https://www.postgresql.org/media/keys/ACCC4CF8.asc | sudo apt-key add -
      ```

      Install it.

      ```shell
      apt-get update
      apt-get -y install postgresql
      ```

   4. Install MariaDB or MySQL

      Get the repository of the LTS version

      ```shell
      apt-get install apt-transport-https curl
      curl -o /etc/apt/trusted.gpg.d/mariadb_release_signing_key.asc 'https://mariadb.org/mariadb_release_signing_key.asc'
      sh -c "echo 'deb https://mirrors.n-ix.net/mariadb/repo/10.11/ubuntu jammy main' >>/etc/apt/sources.list"
      ```

      Install it.

      ```shell
      apt-get update
      apt-get install mariadb-server
      ```

      Run the secure installation to remove default configuration.

      ```shell
      mysql_secure_installation
      ```

   5. Install ffmpeg

      ```shell
      apt install ffmpeg
      ```

   6. Install ImageMagick

      ```shell
      apt install imagemagick
      ```

   7. Install PDF tools

      ```shell
      apt install poppler-utils
      ```

      > Optional: if you want you can use xpdf utils instead poppler.
      >

      ```shell
      wget https://dl.xpdfreader.com/xpdf-tools-linux-4.04.tar.gz
      tar xpvf  xpdf-tools-linux-4.03.tar.gz
      mv pdf* /usr/local/bin
      ```

2. Download Dédalo and place it under the httpdocs directory of the web server.

   ```shell
   wget https://github.com/renderpci/dedalo/archive/master.zip
   ```

   Unzip and rename it

   ```shell
   unzip master.zip
   mv dedalo-master dedalo
   ```

3. Create a database in PostgreSQL named `dedalo_xx` (you can change the `xx` as you please).
   Enter into psql

   ```shell
   su - postgres
   psql
   ```

   Create a Dédalo user:

   ```sql
   CREATE USER dedalo_user PASSWORD 'My_super_Secret_pw';
   ```

   Create a Dédalo database and comment it:

   ```sql
   CREATE DATABASE dedalo_xxx
   WITH ENCODING='UTF8'
   OWNER=dedalo_user
   CONNECTION LIMIT=-1
   TABLESPACE=pg_default;

   COMMENT ON DATABASE dedalo_xxx
   IS 'Dédalo: Cultural Heritage and Memory management system';
   ```

4. Rename `sample.config.php` to `config.php`.

   ```shell
   cd [...]/dedalo/config/
   mv sample.config.php config.php
   ```

5. Modify `[...]/dedalo/config/config.php` as you need. Usually, this involves the `DEDALO_ENTITY` string and the OS library paths.
6. Rename `sample.config_db.php` to `config_db.php`.

   ```shell
   cd [...]/dedalo/config/
   mv sample.config_db.php config_db.php
   ```

7. Modify `[...]/dedalo/config/config_db.php` with your database configuration.
8. Rename `sample.config_core.php` to `config_core.php`.

   ```shell
   cd [...]/dedalo/config/
   mv sample.config_core.php config_core.php
   ```

9. Rename `[...]/dedalo/config/sample.config_areas.php` to `[...]/dedalo/config/config_areas.php`.

   ```shell
   cd [...]/dedalo/config/
   mv sample.config_core.php config_core.php
   ```

10. Open Dédalo in the browser.
11. Follow the instructions.
12. Once the installation process is done, log in and head to the Development Area. There, update the Ontology and register all tools.
13. Create an admin user.
14. Log out and log in with the admin user.
15. Create Users and Projects as you need.

