# Configuration

> **⚠️ Dédalo v7 changed the configuration model.** Configuration and secrets now live **outside the web root** in `../private/` (`.env`, plus an optional per-host `.env.<host>`), and `config/config.php` is only a loader — there are no `config_*.php` files to rename or edit in place.
>
> **▶ Start here: [Configuration Administrator Guide](administration.md)** — the complete v7 flow, `.env` syntax, fallback chain, per-host configs, secrets, and migrating a v6 install.
>
> _The page below describes the legacy v6 file-based setup, kept for reference (and for sites still on v6)._

Dédalo keeps its installation settings in four config files under `./dedalo/config/`. This hub explains what each file is for and links to the page that documents its parameters.

| File | Purpose |
| --- | --- |
| `config.php` | Main system configuration: entity, languages, media formats, paths. |
| `config_db.php` | Database connections (PostgreSQL for the work system, MariaDB/MySQL for diffusion). |
| `config_areas.php` | Which areas are allowed or denied. |
| `config_core.php` | Installation state, written by Dédalo itself — you do not edit it manually. |

These are static files that you maintain by hand: they hold your database credentials and other settings specific to your installation. Dédalo never overwrites them on an automatic update — so when you upgrade, review the matching `sample.*` files to apply any new or removed settings yourself.

## Configuration pages

- **[Global config file (`config.php`)](config.md)** — paths, salt, locale, sessions, cache, languages, media, backups and more.
- **[Database config file (`config_db.php`)](config_db.md)** — work-system (PostgreSQL) and diffusion-system (MariaDB/MySQL) connection variables.
- **[Areas config file (`config_areas.php`)](config_areas.md)** — allow/deny access to ontology areas.
- **[Thesaurus dependencies](thesaurus_dependeces.md)** — which thesauri each catalogue model (tld) requires.
- **[Media protection](media_protection.md)** — web-server-enforced access control for media files (optional).
- **[Search configuration and access control](search.md)** — search constants and the client-SQO trust boundary (optional).

> Note: You will need review the "sample" files of the new versions to add or remove the changes specify in the new version. Dédalo will not change your specific configuration files when it's updated automatically.

## Rename Dédalo configuration files

In the installation process you will has rename the sample files to active files, removing the "sample_" text of the filename. If you not did this step complete it before config your installation.

When Dédalo is downloaded from GitHub, every config file ships with a `sample.` prefix. Before you configure your installation, rename each one to its active name by removing the prefix.

### Rename global Dédalo config file

./dedalo/config/config.php

This is the main config for the whole Dédalo system. Use it to configure the entity, the languages used in the projects, the media formats and the directories.

1. Locate the file into the directory: ../httpdocs/dedalo/config/

    ```shell
    cd ../httpdocs/dedalo/config/
    ```

2. Rename the sample.config.php to config.php

    ```shell
    mv sample.config.php config.php
    ```

### Dédalo DB config file

./dedalo/config/config_db.php

This config file sets Dédalo's database connections. It configures both the PostgreSQL and the MySQL connections: PostgreSQL is used for the work system, and MySQL is used to publish data.

1. Locate the file into the directory: ../httpdocs/dedalo/config/

    ```shell
    cd ../httpdocs/dedalo/config/
    ```

2. Rename the sample.config_db.php to config_db.php

    ```shell
    mv sample.config_db.php config_db.php
    ```

### Dédalo Areas config file

./dedalo/config/config_areas.php

This config file sets which Dédalo areas can be accessed or denied. An area is a top-level group of information — any "cultural field" of the research, such as Oral Memory or Archaeological heritage. Allowing or denying access to an area allows or removes access to all the sections it contains.

1. Locate the file into the directory: ../httpdocs/dedalo/config/

    ```shell
    cd ../httpdocs/dedalo/config/
    ```

2. Rename the sample.config_areas.php to config_areas.php

    ```shell
    mv sample.config_areas.php config_areas.php
    ```

### Dédalo core config file

./dedalo/config/config_core.php

Dédalo uses this config file to set and read the installation state. You do not need to change it manually.

1. Locate the file into the directory: ../httpdocs/dedalo/config/

    ```shell
    cd ../httpdocs/dedalo/config/
    ```

2. Rename the sample.config_core.php to config_core.php

    ```shell
    mv sample.config_core.php config_core.php
    ```

## Set up the configuration files

Every config file has its own parameters that you set to match your project environment.

1. Changing parameters of global [Dédalo configuration file](./config.md#changing-parameters-of-global-dédalo-config-file).
2. Changing parameters of [database configuration file](./config_db.md#changing-parameters-of-dédalo-database-config-file).
   1. Work system [configuration](./config_db.md#work-system-database-variables)
   2. Diffusion system [configuration](./config_db.md#diffusion-system-database-variables)
3. Changing parameters of [areas configuration file](./config_areas.md#changing-parameters-of-dédalo-areas-config-file).
4. Implement all [thesaurus dependencies](thesaurus_dependeces.md).
5. Optional: configure the [media protection (media file access control)](./media_protection.md).
6. Optional: review [search configuration and access control](./search.md).
