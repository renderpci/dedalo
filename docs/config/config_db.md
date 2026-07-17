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

<!-- BEGIN GENERATED — src/config/catalog/ · regenerate: bun run config:gen -->

## Work system database variables {#db}

### Dédalo hostname connection

DB_HOST `string`

This parameter defines the hostname of the server that is running the database. By default Dédalo uses `localhost`, because the database and the web server typically run on the same machine — but it is possible to point this at a separate database server.

```bash
DB_HOST="localhost"
```

*Default: localhost*

---

### Dédalo database name

DB_NAME `string`

This parameter defines the name of the database in PostgreSQL.

```bash
DB_NAME="dedalo_XXX"
```

*Default: dedalo_install_placeholder*

---

### Dédalo database password

DB_PASSWORD `string`

This parameter defines the password of the database user.

```bash
DB_PASSWORD="my_password"
```

*Default: (empty)*

---

### Database connection acquire timeout

DB_POOL_ACQUIRE_TIMEOUT_MS `int`

How long (in milliseconds) a request waits for a free database connection when the
pool is fully in use, before it gives up with an error. The default `0` means *wait
forever*.

Setting it — `30000` is a sensible production value — turns pool exhaustion from a
silent, indefinite hang into a loud, diagnosable error. It does not make the server
slower: it only bounds how long it is willing to be stuck.

```bash
DB_POOL_ACQUIRE_TIMEOUT_MS=30000
```

*Default: 0*

---

### Database connection pool size

DB_POOL_MAX `int`

The maximum number of PostgreSQL connections this process keeps open. Default `10`,
minimum `1`.

The limit is **per process**, and a Dédalo installation runs more than one: the server
itself, plus one process per concurrent publication runner
(`DEDALO_DIFFUSION_MAX_RUNNERS`), plus background workers. All of them together must
stay below the PostgreSQL server's own `max_connections` (typically 100). With the
defaults — a server and two runners — the installation uses at most 30 connections,
which leaves ample room. Raise this only when the database server has the connections
to spare.

```bash
DB_POOL_MAX=10
```

*Default: 10*

---

### Dédalo database host port connection

DB_PORT `int`

This parameter defines the host port of the server that is running the database. By default Dédalo uses the default PostgreSQL `5432` port.

```bash
DB_PORT=5432
```

*Default: 5432*

---

### Database statement timeout

DB_STATEMENT_TIMEOUT_MS `int`

The maximum time (in milliseconds) any single database statement may run before
PostgreSQL cancels it. The default `0` means no limit.

**A production installation should set it** — `60000` (one minute) is the recommended
value: one runaway query must not be able to occupy a connection forever and starve
every other user. Choose a value comfortably above your slowest legitimate operation;
if searches on very large sections are part of daily work, measure them first (see
`DEDALO_SLOW_QUERY_MS`).

```bash
DB_STATEMENT_TIMEOUT_MS=60000
```

*Default: 0*

---

### Dédalo database username

DB_USER `string`

This parameter defines the name of the user who can administer the database. This user must be an administrator or owner of the database, Dédalo must be able to create, update and select all tables and records.

```bash
DB_USER="my_username"
```

*Default: dedalo*

---

### Path to the database binary

DEDALO_PG_BIN_PATH `string`

This parameter defines the directory holding the PostgreSQL client binaries
(`psql`, `pg_dump`, `pg_restore`) used for maintenance tasks and backups. When
unset, Dédalo probes common Homebrew install locations (newest version first)
and falls back to resolving the binary name from `PATH`.

```bash
DEDALO_PG_BIN_PATH="/usr/lib/postgresql/16/bin/"
```

*Default: (unset)*

---

### Deep pagination rewrite threshold

SEARCH_LATE_ROW_LOOKUP_OFFSET `int`

From this list offset on, default-ordered section searches are rewritten to a
"late row lookup": the wanted page of record ids is found on an index-only scan first,
and only those rows' full data is fetched. Same rows, same order — measured ~70×
faster at offset 300000 on a 438k-record section, because a plain `OFFSET` makes
PostgreSQL read and discard every skipped row's data columns.

Shallow pages keep the plain query (the rewrite would gain nothing there). Set `-1`
to disable the rewrite entirely.

```bash
SEARCH_LATE_ROW_LOOKUP_OFFSET=1000
```

*Default: 1000*

---

### Time machine total cache lifetime

TM_COUNT_CACHE_TTL_MS `int`

The unfiltered time-machine browse shows a total that costs a full count of the
(typically huge, append-only) `matrix_time_machine` table. That total is cached and
invalidated on every save this engine performs; this key is the freshness backstop
(in milliseconds) for rows inserted by anything else. Default `30000` (30 s). Set
`0` to disable the cache and count exactly on every request — the right setting for
parity test environments.

```bash
TM_COUNT_CACHE_TTL_MS=30000
```

*Default: 30000*

---

### Slow query

DEDALO_SLOW_QUERY_MS `int`

This parameter defines the time limit for query calls: if a query takes longer than this value, Dédalo logs a warning line naming the slow statement. Set to `0` (the default) to disable slow-query logging.

```bash
DEDALO_SLOW_QUERY_MS=1200
```

*Default: 0*

---

## Diffusion system database (MariaDB) {#diffusion_db}

The diffusion system database is the external, flat (publication) copy of the data, stored in MariaDB/MySQL: only public data is exported, relationships are pre-resolved, and the result is standard SQL tables/rows/columns.

Every MariaDB operation — publish, delete, backup — is performed by the [diffusion engine](../diffusion/native_engine.md) built into the work server.

### Diffusion target database host

DEDALO_DIFFUSION_DB_HOST `string`

The hostname or IP of the MariaDB/MySQL server that receives the published tables.
Set it when the publication target runs on a different machine than Dédalo, or when it
listens on TCP rather than on a local socket.

Transport precedence is: `DEDALO_DIFFUSION_DB_SOCKET` first, then this host (with
`DEDALO_DIFFUSION_DB_PORT`), and — when neither is set — the default local socket
`/tmp/mysql.sock`. Only the transport is configured here: the target *databases* and
*tables* themselves come from the diffusion ontology.

```bash
DEDALO_DIFFUSION_DB_HOST="localhost"
```

*Default: (unset)*

---

### Diffusion target database password

DEDALO_DIFFUSION_DB_PASSWORD `string`

The password of `DEDALO_DIFFUSION_DB_USER`, the account Dédalo uses to write the
published tables into the target database. This is a **secret**: the shipped template
carries a placeholder only, and a real installation must replace it with the actual
password (or leave it empty when the target authenticates the user by socket instead).

```bash
DEDALO_DIFFUSION_DB_PASSWORD="my_password"
```

*Default: (empty)*

---

### Diffusion target database port

DEDALO_DIFFUSION_DB_PORT `int`

The TCP port of the publication target database. Only used when
`DEDALO_DIFFUSION_DB_HOST` is set (a socket connection ignores it). Defaults to
`3306`, the standard MariaDB/MySQL port.

```bash
DEDALO_DIFFUSION_DB_PORT=3306
```

*Default: 3306*

---

### Diffusion target database socket

DEDALO_DIFFUSION_DB_SOCKET `string`

Path to the local unix socket of the publication target database. Set it when the
target server runs on the same machine as Dédalo and you want to bypass TCP — the
usual production posture, and the fastest one.

It takes precedence over `DEDALO_DIFFUSION_DB_HOST`. When neither key is set, Dédalo
falls back to the conventional socket path `/tmp/mysql.sock`; if your distribution
puts it elsewhere, name it here.

```bash
DEDALO_DIFFUSION_DB_SOCKET="/var/run/mysqld/mysqld.sock"
```

*Default: (unset)*

---

### Diffusion target database username

DEDALO_DIFFUSION_DB_USER `string`

The user account Dédalo connects with to publish into the target database. It must
be able to create and alter the published tables and to insert, update and delete their
rows: the engine provisions the table structure from the diffusion ontology on every
run, so read/write on existing tables is not enough.

```bash
DEDALO_DIFFUSION_DB_USER="my_username"
```

*Default: (empty)*

---

The target database names come from the diffusion ontology (`database` node labels), and the databases must be **pre-created** — a missing database is a loud configuration error, never an auto-create. Create the database and its user with full privileges, e.g.:

```sql
CREATE USER 'username'@'localhost' IDENTIFIED BY 'password';
GRANT ALL PRIVILEGES ON `web_dedalo`.* TO 'username'@'localhost';
```

See [the diffusion engine → Configuration](../diffusion/native_engine.md#configuration) for the full key set (resolve levels, output languages, runner concurrency).

> The standalone **publication server** (`publication/server_api/`) is a separate, legacy deployable with its **own** read-only database config — see [server_config_api](../diffusion/publication_api/server_config_api.md). That is independent of this work install’s database settings.

<!-- END GENERATED -->
