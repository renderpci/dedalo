# Changing parameters of Dédalo database config file

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

This parameter defines the connection to the database will use a UNIX socket instead tcp. By default Dédalo do not uses the socket connection (null)

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

## Diffusion system database variables

The diffusion system database is the external and copy version of the data. In diffusion database Dédalo will export only the data that can be public and it will stored in flat format, the relationships will be calculated previously and resolved before store in rows (data will be previously resolved with its value without the data abstraction layer). The result is a SQL standard format of tables, rows and columns.

---

### Dédalo hostname connection for MariaDB or MySQL

./dedalo/config/config_db.php

MYSQL_DEDALO_HOSTNAME_CONN `string`

This parameter defines the hostname of the server that is running the database.

By default Dédalo do not uses tcp connection for the diffusion database. Database server and php / apache server could run in the same machine, but is possible that MariaDB or MySQL can run in other server machine.

```php
define('MYSQL_DEDALO_HOSTNAME_CONN', 'hostname');
```

---

### Dédalo database username for MySQL

./dedalo/config/config_db.php

MYSQL_DEDALO_USERNAME_CONN `string`

This parameter defines the name of the user who can administer the database. This user must be an administrator or owner of the database, Dédalo must be able to create, update, delete and select all tables and records.

```php
define('MYSQL_DEDALO_USERNAME_CONN', 'username');
```

---

### Dédalo database password for MySQL

./dedalo/config/config_db.php

MYSQL_DEDALO_PASSWORD_CONN `string`

This parameter defines the password of the database user.

```php
define('MYSQL_DEDALO_PASSWORD_CONN', 'password');
```

---

### Dédalo database information for MySQL

./dedalo/config/config_db.php

MYSQL_DEDALO_DATABASE_CONN `string`

This parameter specifies the primary database name for MariaDB/MySQL. Note that the Diffusion ontology definition will override this value.

All ontology-defined databases must:

- Use the same connection parameters as specified here
- Grant full access permissions to the user [MYSQL_DEDALO_USERNAME_CONN](#dédalo-database-username-for-mysql).

```php
define('MYSQL_DEDALO_DATABASE_CONN' , 'web_dedalo');
```

All Diffusion databases must be created with full privileges for the configured user, as shown below:

```sql
CREATE USER'dedalo_write'@'localhost' IDENTIFIED BY ''
GRANT ALL PRIVILEGES ON `web\_dedalo`.* TO 'username'@'localhost'
```

See the multiple [diffusion databases](../diffusion/diffusion_multiple_databases.md) documentation.

---

### Dédalo database port host for MySQL

./dedalo/config/config_db.php

MYSQL_DEDALO_DB_PORT_CONN `int`

This parameter defines the host port of the server that is running the database. By default Dédalo uses default MySQL '3306' port.

```php
define('DEDALO_DB_PORT_CONN' , 3306);
```

---

### Dédalo database socket connection for MySQL

./dedalo/config/config_db.php

MYSQL_DEDALO_SOCKET_CONN `null || string`

This parameter defines the connection to the database will use a UNIX socket instead tcp. By default Dédalo uses the socket connection for the diffusion database (MariaDB or MySQL)

```php
define('MYSQL_DEDALO_SOCKET_CONN', '/tmp/mysql.sock');
```
