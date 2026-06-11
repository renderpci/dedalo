# Database Configuration Reference

All database configuration is managed through the `/private/.env` file. The old `config/config_db.php` file is no longer used — it is automatically migrated to `.env` on first boot.

## How to change a database configuration value

1. Locate the `.env` file in the `/private/` directory

    ```shell
    nano /private/.env
    ```

2. Find (or add) the KEY and set the proper value

    ```ini
    DEDALO_DATABASE_CONN=dedalo_my_entity
    DEDALO_USERNAME_CONN=my_username
    DEDALO_PASSWORD_CONN=my_password
    ```

3. Save the file — changes take effect on the next request

> Database constants not present in `.env` fall back to their defaults defined in `bootstrap.php`. You only need to set values that differ from the defaults.

---

## PostgreSQL (work system)

The database of the work system is the internal and main source of the data. In this database, Dédalo will manage the data in JSON format, all the relationships are active and calculated in each call and the data must be processed and rendered by calling the ontology. All abstraction layers are active and all data must be interpreted.

---

### Dédalo database type

DEDALO_DB_TYPE `string` *computed*

This parameter defines the typology of the database that Dédalo will use for the work system. Always `'postgresql'` in v7. Not configurable via `.env`.

---

### Path to the database binary

DB_BIN_PATH `string`

This parameter defines the path to binaries of the database. It will be used for maintenance tasks or backups with the database tools. For PostgreSQL the psql binaries are located at a specific version path.

```ini
DB_BIN_PATH=/usr/lib/postgresql/xx/bin/
```

> Default: `/usr/bin/`

---

### Path to the PHP binary

PHP_BIN_PATH `string`

This parameter defines the path to PHP binaries. It will be used for maintenance tasks or to execute scripts in the terminal.

```ini
PHP_BIN_PATH=/usr/bin/php
```

> Default: `/usr/bin/php`

---

### Dédalo hostname connection

DEDALO_HOSTNAME_CONN `string`

This parameter defines the hostname of the server that is running the database. By default Dédalo uses the PostgreSQL socket directory (`/var/run/postgresql`) because the database server and PHP/Apache server run on the same machine, but it is possible to change this configuration to run PostgreSQL on another server machine.

Common values:

| Value | Use case |
| --- | --- |
| `/var/run/postgresql` | Default Linux socket directory |
| `/tmp` | macOS Homebrew PostgreSQL socket |
| `localhost` | TCP connection (use with `DEDALO_DB_PORT_CONN`) |
| `db.example.com` | Remote database server |

```ini
DEDALO_HOSTNAME_CONN=/var/run/postgresql
```

> **Security-critical**: This value MUST be explicitly set in `.env`.
> Default: `/var/run/postgresql`

---

### Dédalo database host port connection

DEDALO_DB_PORT_CONN `int`

This parameter defines the host port of the server that is running the database. By default Dédalo uses the default PostgreSQL '5432' port. Set to empty or omit when using socket connections.

```ini
DEDALO_DB_PORT_CONN=5432
```

> Default: not set (uses socket)

---

### Dédalo database socket connection

DEDALO_SOCKET_CONN `null or string`

This parameter defines if the connection to the database will use a UNIX socket instead of TCP. By default Dédalo does not use an explicit socket connection (null) — the socket path is derived from `DEDALO_HOSTNAME_CONN`.

```ini
DEDALO_SOCKET_CONN=
```

> Default: not set

---

### Dédalo database name

DEDALO_DATABASE_CONN `string`

This parameter defines the name of the database in PostgreSQL.

```ini
DEDALO_DATABASE_CONN=dedalo_my_entity
```

> **Security-critical**: This value MUST be explicitly set in `.env`.
> Default: `dedalo7_development`

---

### Dédalo database username

DEDALO_USERNAME_CONN `string`

This parameter defines the name of the user who can administer the database. This user must be an administrator or owner of the database; Dédalo must be able to create, update and select all tables and records.

```ini
DEDALO_USERNAME_CONN=my_username
```

> **Security-critical**: This value MUST be explicitly set in `.env`.
> Default: `postgres`

---

### Dédalo database password

DEDALO_PASSWORD_CONN `string`

This parameter defines the password of the database user.

```ini
DEDALO_PASSWORD_CONN=my_password
```

> **Security-critical**: This value MUST be explicitly set in `.env`.
> Default: `postgres`

---

### Dédalo database information

DEDALO_INFORMATION `string`

This parameter defines global information of the database and it will be used as a HASH to encrypt the users' passwords. This parameter can be changed before install, but when the installation is finished and root password was set, you **cannot** change this parameter, because it is used in the encryption system.

```ini
DEDALO_INFORMATION=Dédalo for Cultural Heritage of my entity, version 7
```

> **Security-critical**: This value MUST be explicitly set in `.env`.
> Default: `Dédalo development install`

---

### Dédalo information key

DEDALO_INFO_KEY `string`

This parameter defines the key of the database and it will be used as a HASH to encrypt the users' passwords. This parameter can be changed before install, but when the installation is finished and root password was set, you **cannot** change this parameter, because it is used in the encryption system.

```ini
DEDALO_INFO_KEY=my_entity
```

> Default: same as `DEDALO_ENTITY`

---

### Slow query

SLOW_QUERY_MS `int`

This parameter defines the time limit for query calls. If a query to the database takes longer than the value of this parameter, Dédalo will alert in the PHP log and will try to index this query.

```ini
SLOW_QUERY_MS=10000
```

> Default: `10000` (10 seconds)

---

### Dédalo database management

DEDALO_DB_MANAGEMENT `bool`

This parameter defines if Dédalo will run management tasks automatically, such as vacuum or backups. By default this parameter is active (true). When the management of the database is deactivated, all maintenance tasks need to be run manually or with external processes. This parameter could disable management tasks when the database server is outside of the server with Dédalo, PHP and Apache.

```ini
DEDALO_DB_MANAGEMENT=true
```

> Default: `true`

---

### Persistent connection

PERSISTENT_CONNECTION `bool`

This parameter defines if Dédalo will use persistent database connections. Persistent connections can improve performance but may consume more resources.

```ini
PERSISTENT_CONNECTION=false
```

> Default: `false`

---

## MySQL / MariaDB (diffusion system)

The diffusion system database is the external and copy version of the data. In the diffusion database Dédalo will export only the data that can be public and it will be stored in flat format; the relationships will be calculated previously and resolved before storing in rows (data will be previously resolved with its value without the data abstraction layer). The result is a SQL standard format of tables, rows and columns.

---

### Dédalo hostname connection for MariaDB or MySQL

MYSQL_DEDALO_HOSTNAME_CONN `string`

This parameter defines the hostname of the server that is running the database.

By default Dédalo does not use TCP connection for the diffusion database. The database server and PHP/Apache server could run on the same machine, but it is possible that MariaDB or MySQL can run on another server machine.

```ini
MYSQL_DEDALO_HOSTNAME_CONN=localhost
```

> **Security-critical**: This value MUST be explicitly set in `.env`.
> Default: `localhost`

---

### Dédalo database username for MySQL

MYSQL_DEDALO_USERNAME_CONN `string`

This parameter defines the name of the user who can administer the database. This user must be an administrator or owner of the database; Dédalo must be able to create, update, delete and select all tables and records.

```ini
MYSQL_DEDALO_USERNAME_CONN=username
```

> **Security-critical**: This value MUST be explicitly set in `.env`.
> Default: `root`

---

### Dédalo database password for MySQL

MYSQL_DEDALO_PASSWORD_CONN `string`

This parameter defines the password of the database user.

```ini
MYSQL_DEDALO_PASSWORD_CONN=password
```

> **Security-critical**: This value MUST be explicitly set in `.env`.
> Default: empty

---

### Dédalo database name for MySQL

MYSQL_DEDALO_DATABASE_CONN `string`

This parameter specifies the primary database name for MariaDB/MySQL. Note that the Diffusion ontology definition will override this value.

All ontology-defined databases must:

- Use the same connection parameters as specified here
- Grant full access permissions to the user [MYSQL_DEDALO_USERNAME_CONN](#dédalo-database-username-for-mysql).

```ini
MYSQL_DEDALO_DATABASE_CONN=web_dedalo
```

> Default: `web_{DEDALO_ENTITY}`

All Diffusion databases must be created with full privileges for the configured user, as shown below:

```sql
CREATE USER 'dedalo_write'@'localhost' IDENTIFIED BY ''
GRANT ALL PRIVILEGES ON `web\_dedalo`.* TO 'username'@'localhost'
```

See the multiple [diffusion databases](../diffusion/diffusion_multiple_databases.md) documentation.

---

### Dédalo database port host for MySQL

MYSQL_DEDALO_DB_PORT_CONN `int`

This parameter defines the host port of the server that is running the database. By default Dédalo uses the default MySQL '3306' port.

```ini
MYSQL_DEDALO_DB_PORT_CONN=3306
```

> Default: not set

---

### Dédalo database socket connection for MySQL

MYSQL_DEDALO_SOCKET_CONN `null || string`

This parameter defines if the connection to the database will use a UNIX socket instead of TCP. By default Dédalo uses the socket connection for the diffusion database (MariaDB or MySQL).

```ini
MYSQL_DEDALO_SOCKET_CONN=/var/run/mysqld/mysqld.sock
```

> Default: `/var/run/mysqld/mysqld.sock`
>
> On macOS Homebrew: `/tmp/mysql.sock`

---

### Path to the MySQL database binary

MYSQL_DB_BIN_PATH `string`

This parameter defines the path to the MySQL/MariaDB binaries directory.

```ini
MYSQL_DB_BIN_PATH=/usr/bin/
```

> Default: `/usr/bin/`
