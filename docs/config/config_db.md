# Changing parameters of Dédalo database config file

> **⚠️ Dédalo v7 — database settings moved to `../private/.env`.** There is no longer a `config/config_db.php`. The **PostgreSQL** work-system connection now lives in **`../private/.env`** by the same `DEDALO_*` constant names — the **password (`DEDALO_PASSWORD_CONN`) is a secret** in the top section; host/database/user/port are general config below it. A socket connection with no TCP port is written as `DEDALO_DB_PORT_CONN=null`. See the **[Configuration Administrator Guide](administration.md)**. The reference below still explains each setting's meaning.
>
> **MariaDB/MySQL is no longer configured in PHP.** The diffusion database is owned exclusively by the Bun diffusion engine — PHP never connects to it and defines no `MYSQL_DEDALO_*` constants. Its connection lives in the Bun engine's own env file **`diffusion/api/v1/.env`** (`DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `DB_SOCKET`) — see the **[Diffusion system database section below](#diffusion-system-database-mariadb)**.

./dedalo/config/config_db.php

1. Locate the file into the directory: ../httpdocs/dedalo/config/

    ```shell
    cd ../httpdocs/dedalo/config/
    ```

2. Edit the config_db.php

    ```shell
    nano config_db.php
    ```

3. Locate and change the PROPERTY with the proper configuration.

## Work system database variables

The database of the work system is the internal and main source of the data. In this database, Dédalo will manage the data in JSON format, all the relationships are active and calculated in each call and the data must be processed and rendered by calling the ontology. All abstraction layers are active and all data must be interpreted.

---

### Dédalo database type

./dedalo/config/config_db.php

DEDALO_DB_TYPE `string`

This parameter defines the typology of the database that Dédalo will use for the work system. By default Dédalo use PostgreSQL database.

```php
define('DEDALO_DB_TYPE' , 'postgresql');
```

---

### Path to the database binary

./dedalo/config/config_db.php

DB_BIN_PATH `string`

This parameter defines the path to binaries of the database. It will use to do maintenance tasks or backups with the database tools. For postgreSQL the psql binaries is located at specific version.

```php
define('DB_BIN_PATH' , '/usr/lib/postgresql/xx/bin/');
```

---

### Path to the php binary

./dedalo/config/config_db.php

PHP_BIN_PATH `string`

This parameter defines the path to php binaries. It will use to do maintenance tasks or execute scripts in the terminal.

```php
define('PHP_BIN_PATH' , '/usr/bin/php');
```

---

### Dédalo hostname connection

./dedalo/config/config_db.php

DEDALO_HOSTNAME_CONN `string`

This parameter defines the hostname of the server that is running the database. By default Dédalo uses 'localhost' as hostname, because the database server and php / apache server run in the same machine, but is possible change this configuration to run postgreSQL in other server machine.

```php
define('DEDALO_HOSTNAME_CONN' , 'localhost');
```

---

### Dédalo database host port connection

./dedalo/config/config_db.php

DEDALO_DB_PORT_CONN `int`

This parameter defines the host port of the server that is running the database. By default Dédalo uses the default postgreSQL '5432' port.

```php
define('DEDALO_DB_PORT_CONN' , 5432);
```

---

### Dédalo database socket connection

./dedalo/config/config_db.php

DEDALO_SOCKET_CONN `null or string`

This parameter defines whether the database connection uses a UNIX socket instead of TCP. By default Dédalo does not use the socket connection (null).

```php
define('DEDALO_SOCKET_CONN' , null);
```

---

### Dédalo database name

./dedalo/config/config_db.php

DEDALO_DATABASE_CONN `string`

This parameter defines the name of the database in PostgreSQL.

```php
define('DEDALO_DATABASE_CONN' , 'dedalo_XXX');
```

---

### Dédalo database username

./dedalo/config/config_db.php

DEDALO_USERNAME_CONN `string`

This parameter defines the name of the user who can administer the database. This user must be an administrator or owner of the database, Dédalo must be able to create, update and select all tables and records.

```php
define('DEDALO_USERNAME_CONN' , 'my_username');
```

---

### Dédalo database password

./dedalo/config/config_db.php

DEDALO_PASSWORD_CONN `string`

This parameter defines the password of the database user.

```php
define('DEDALO_PASSWORD_CONN' , 'my_password');
```

---

### Dédalo database information

./dedalo/config/config_db.php

DEDALO_INFORMATION `string`

This parameter defines global information of the database and it will use as HASH to encrypt the users passwords. This parameter can change before install, but, when the installation is finished and root pw was set, you can not change this parameter, because it is using to encrypt system.

```php
define('DEDALO_INFORMATION' , 'Dédalo for Cultural Heritage of my entity, version 6');
```

---

### Dédalo information key

./dedalo/config/config_db.php

DEDALO_INFO_KEY `string`

This parameter defines key of the database and it will use as HASH to encrypt the users passwords. This parameter can change before install, but, when the installation is finished and root pw was set, you can not change this parameter, because it is using to encrypt system.

```php
define('DEDALO_INFO_KEY', DEDALO_ENTITY);
```

---

### Slow query

./dedalo/config/config_db.php

SLOW_QUERY_MS `int`

This parameter define the time limit to query calls, if the query done to database is higher that the value of this parameter, Dédalo will alert in php log and will try to index this query. By default this parameter is set to 1200 ms (1,2 seconds).

```php
define('SLOW_QUERY_MS' , 1200);
```

---

### Dédalo database management

./dedalo/config/config_db.php

DEDALO_DB_MANAGEMENT `string`

This parameter defines if Dédalo will run management tasks automatically, as vacuum or backups. By default this parameter is active (true), when the management of the database is deactivate, all maintenance tasks need to be run manually or with external processes. This parameter could disable management task when server database is outside of the server with Dedalo, php and Apache.

```php
define('DEDALO_DB_MANAGEMENT' , true);
```

---

## Diffusion system database (MariaDB)

The diffusion system database is the external, flat (publication) copy of the data, stored in MariaDB/MySQL: only public data is exported, relationships are pre-resolved, and the result is standard SQL tables/rows/columns.

In Dédalo v7 **PHP does not connect to MariaDB at all.** Every MariaDB operation — publish, delete, backup — is performed by the [Bun diffusion engine](../diffusion/dd_diffusion_api_and_bun.md); PHP reaches it through the diffusion API client. There are therefore **no `MYSQL_DEDALO_*` constants** in Dédalo config anymore.

Configure the MariaDB connection in the Bun engine's own environment file instead:

`diffusion/api/v1/.env`

| key | meaning |
| --- | --- |
| `DB_HOST` | MariaDB host (e.g. `localhost`) |
| `DB_PORT` | MariaDB port (e.g. `3306`) |
| `DB_USER` | MariaDB user (must have write permissions) |
| `DB_PASSWORD` | MariaDB password |
| `DB_NAME` | main diffusion database (e.g. `web_dedalo`) |
| `DB_SOCKET` | optional UNIX socket; when set it is used instead of `DB_HOST`/`DB_PORT` |

On a fresh install the install wizard collects these values, validates the connection once, and writes this file for you. The diffusion database and its user must exist with full privileges, e.g.:

```sql
CREATE USER 'username'@'localhost' IDENTIFIED BY 'password';
GRANT ALL PRIVILEGES ON `web_dedalo`.* TO 'username'@'localhost';
```

See the [multiple diffusion databases](../diffusion/diffusion_multiple_databases.md) guide and the [Bun diffusion engine](../diffusion/dd_diffusion_api_and_bun.md) docs.

> The standalone **publication server** (`publication/server_api/`) is a separate deployable with its **own** read-only database config and still defines `MYSQL_DEDALO_*` in its `server_config_api.php` — see [server_config_api](../diffusion/publication_api/server_config_api.md). That is independent of this work install's database settings.
