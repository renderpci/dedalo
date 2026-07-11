# Database connection

> See also: [How configuration works](administration.md) · [Settings reference](config.md) · [What changed in v7](whats_changed_v7.md)

Dédalo v7 connects to **two** databases, both configured in `../private/.env`:

- **PostgreSQL** — the work system: every record, the ontology, users. Required.
- **MariaDB / MySQL** — the diffusion (publication) target. Optional, and written
  only by the [diffusion engine](../diffusion/native_engine.md).

There is no `config_db.php` in v7.

```bash
# ../private/.env — PostgreSQL (the work system)
DB_NAME=dedalo
DB_HOST=localhost
DB_PORT=5432
DB_USER=dedalo
DB_PASSWORD=…
```

The v6 names (`DEDALO_DATABASE_CONN`, `DEDALO_HOSTNAME_CONN`, `DEDALO_USERNAME_CONN`,
`DEDALO_PASSWORD_CONN`, `DEDALO_DB_PORT_CONN`) are still honored as fallbacks, so a
migrated `.env` works unchanged.

---

## Work system database variables

The database of the work system is the internal and main source of the data. In this database, Dédalo will manage the data in JSON format, all the relationships are active and calculated in each call and the data must be processed and rendered by calling the ontology. All abstraction layers are active and all data must be interpreted.

---

### Path to the database binary

../private/.env

DEDALO_PG_BIN_PATH `string`

This parameter defines the path to binaries of the database. It will use to do maintenance tasks or backups with the database tools. For postgreSQL the psql binaries is located at specific version.

```bash
DEDALO_PG_BIN_PATH="/usr/lib/postgresql/xx/bin/"
```

---

### Dédalo hostname connection

../private/.env

DB_HOST `string`

This parameter defines the hostname of the server that is running the database. By default Dédalo uses 'localhost' as hostname, because the database server and php / apache server run in the same machine, but is possible change this configuration to run postgreSQL in other server machine.

```bash
DB_HOST="localhost"
```

---

### Dédalo database host port connection

../private/.env

DB_PORT `int`

This parameter defines the host port of the server that is running the database. By default Dédalo uses the default postgreSQL '5432' port.

```bash
DB_PORT=5432
```

---

### Dédalo database name

../private/.env

DB_NAME `string`

This parameter defines the name of the database in PostgreSQL.

```bash
DB_NAME="dedalo_XXX"
```

---

### Dédalo database username

../private/.env

DB_USER `string`

This parameter defines the name of the user who can administer the database. This user must be an administrator or owner of the database, Dédalo must be able to create, update and select all tables and records.

```bash
DB_USER="my_username"
```

---

### Dédalo database password

../private/.env

DB_PASSWORD `string`

This parameter defines the password of the database user.

```bash
DB_PASSWORD="my_password"
```

---

### Slow query

../private/.env

DEDALO_SLOW_QUERY_MS `int`

This parameter define the time limit to query calls, if the query done to database is higher that the value of this parameter, Dédalo will alert in php log and will try to index this query. By default this parameter is set to 1200 ms (1,2 seconds).

```bash
DEDALO_SLOW_QUERY_MS=1200
```

---

## Diffusion system database (MariaDB)

The diffusion system database is the external, flat (publication) copy of the data, stored in MariaDB/MySQL: only public data is exported, relationships are pre-resolved, and the result is standard SQL tables/rows/columns.

Every MariaDB operation — publish, delete, backup — is performed by the [diffusion engine](../diffusion/native_engine.md) built into the work server. There are **no `MYSQL_DEDALO_*` constants** in Dédalo config anymore.

Configure the MariaDB connection with the `DEDALO_DIFFUSION_DB_*` keys in `../private/.env`:

| key | meaning |
| --- | --- |
| `DEDALO_DIFFUSION_DB_HOST` | MariaDB host (e.g. `localhost`) |
| `DEDALO_DIFFUSION_DB_PORT` | MariaDB port (e.g. `3306`) |
| `DEDALO_DIFFUSION_DB_USER` | MariaDB user (must have write permissions) |
| `DEDALO_DIFFUSION_DB_PASSWORD` | MariaDB password |
| `DEDALO_DIFFUSION_DB_SOCKET` | optional UNIX socket (default `/tmp/mysql.sock`); when set it is used instead of host/port |

The target database names come from the diffusion ontology (`database` node labels), and the databases must be **pre-created** — a missing database is a loud configuration error, never an auto-create. Create the database and its user with full privileges, e.g.:

```sql
CREATE USER 'username'@'localhost' IDENTIFIED BY 'password';
GRANT ALL PRIVILEGES ON `web_dedalo`.* TO 'username'@'localhost';
```

See [the diffusion engine → Configuration](../diffusion/native_engine.md#configuration) for the full key set (resolve levels, output languages, runner concurrency).

> The standalone **publication server** (`publication/server_api/`) is a separate deployable with its **own** read-only database config and still defines `MYSQL_DEDALO_*` in its `server_config_api.php` — see [server_config_api](../diffusion/publication_api/server_config_api.md). That is independent of this work install's database settings.
