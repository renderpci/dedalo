# Database connection

> See also: [How configuration works](administration.md) · [Settings reference](config.md) · [What changed in v7](whats_changed_v7.md)

Dédalo v7 connects to **two** databases, both configured in `../private/.env`:

- **PostgreSQL** — the work system: every record, the ontology, users. Required.
- **MariaDB / MySQL** — the diffusion (publication) target. Optional, and written
  only by the [diffusion engine](../diffusion/native_engine.md).

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

This parameter defines the directory holding the PostgreSQL client binaries
(`psql`, `pg_dump`, `pg_restore`) used for maintenance tasks and backups. When
unset, Dédalo probes common Homebrew install locations (newest version first)
and falls back to resolving the binary name from `PATH`.

```bash
DEDALO_PG_BIN_PATH="/usr/lib/postgresql/16/bin/"
```

---

### Dédalo hostname connection

../private/.env

DB_HOST `string`

This parameter defines the hostname of the server that is running the database. By default Dédalo uses `localhost`, because the database and the web server typically run on the same machine — but it is possible to point this at a separate database server.

```bash
DB_HOST="localhost"
```

---

### Dédalo database host port connection

../private/.env

DB_PORT `int`

This parameter defines the host port of the server that is running the database. By default Dédalo uses the default PostgreSQL `5432` port.

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

This parameter defines the time limit for query calls: if a query takes longer than this value, Dédalo logs a warning line naming the slow statement. Set to `0` (the default) to disable slow-query logging.

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

> The standalone **publication server** (`publication/server_api/`) is a separate, legacy deployable with its **own** read-only database config, which still defines `MYSQL_DEDALO_*` constants — see [server_config_api](../diffusion/publication_api/server_config_api.md). That is independent of this work install's database settings.
