/**
 * CONFIG CATALOG — domain: db
 *
 * GENERATED SCAFFOLD (probe_emit_catalog.ts). Hand-edit from here on.
 */

import type { CatalogEntry } from '../catalog_types.ts';

export const DB_KEYS = {
	DB_HOST: {
		required: true,
		installGate: true,
		installSentinel: 'localhost',
		type: 'string',
		scope: 'operator',
		default: 'localhost',
		heading: 'Dédalo hostname connection',
		typeLabel: 'string',
		doc: `This parameter defines the hostname of the server that is running the database. By default Dédalo uses \`localhost\`, because the database and the web server typically run on the same machine — but it is possible to point this at a separate database server.

\`\`\`bash
DB_HOST="localhost"
\`\`\``,
	},
	DB_NAME: {
		required: true,
		installGate: true,
		installSentinel: 'dedalo_install_placeholder',
		placeholder: { value: 'dedalo_mydatabase' },
		type: 'string',
		scope: 'operator',
		default: 'dedalo_install_placeholder',
		heading: 'Dédalo database name',
		typeLabel: 'string',
		doc: `This parameter defines the name of the database in PostgreSQL.

\`\`\`bash
DB_NAME="dedalo_XXX"
\`\`\``,
	},
	DB_PASSWORD: {
		placeholder: { value: 'mypassword', emptyIsValid: true },
		type: 'string',
		scope: 'secret',
		default: '',
		heading: 'Dédalo database password',
		typeLabel: 'string',
		doc: `This parameter defines the password of the database user.

\`\`\`bash
DB_PASSWORD="my_password"
\`\`\``,
	},
	DB_POOL_ACQUIRE_TIMEOUT_MS: {
		type: 'number',
		scope: 'operator',
		default: 0,
		heading: 'Database connection acquire timeout',
		typeLabel: 'int',
		doc: `How long (in milliseconds) a request waits for a free database connection when the
pool is fully in use, before it gives up with an error. The default \`0\` means *wait
forever*.

Setting it — \`30000\` is a sensible production value — turns pool exhaustion from a
silent, indefinite hang into a loud, diagnosable error. It does not make the server
slower: it only bounds how long it is willing to be stuck.

\`\`\`bash
DB_POOL_ACQUIRE_TIMEOUT_MS=30000
\`\`\``,
	},
	DB_POOL_MAX: {
		type: 'number',
		scope: 'operator',
		default: 10,
		heading: 'Database connection pool size',
		typeLabel: 'int',
		doc: `The maximum number of PostgreSQL connections this process keeps open. Default \`10\`,
minimum \`1\`.

The limit is **per process**, and a Dédalo installation runs more than one: the server
itself, plus one process per concurrent publication runner
(\`DEDALO_DIFFUSION_MAX_RUNNERS\`), plus background workers. All of them together must
stay below the PostgreSQL server's own \`max_connections\` (typically 100). With the
defaults — a server and two runners — the installation uses at most 30 connections,
which leaves ample room. Raise this only when the database server has the connections
to spare.

\`\`\`bash
DB_POOL_MAX=10
\`\`\``,
	},
	DB_PORT: {
		type: 'number',
		scope: 'operator',
		default: 5432,
		heading: 'Dédalo database host port connection',
		typeLabel: 'int',
		doc: `This parameter defines the host port of the server that is running the database. By default Dédalo uses the default PostgreSQL \`5432\` port.

\`\`\`bash
DB_PORT=5432
\`\`\``,
	},
	DB_STATEMENT_TIMEOUT_MS: {
		type: 'number',
		scope: 'operator',
		default: 0,
		heading: 'Database statement timeout',
		typeLabel: 'int',
		doc: `The maximum time (in milliseconds) any single database statement may run before
PostgreSQL cancels it. The default \`0\` means no limit.

**A production installation should set it** — \`60000\` (one minute) is the recommended
value: one runaway query must not be able to occupy a connection forever and starve
every other user. Choose a value comfortably above your slowest legitimate operation;
if searches on very large sections are part of daily work, measure them first (see
\`DEDALO_SLOW_QUERY_MS\`).

\`\`\`bash
DB_STATEMENT_TIMEOUT_MS=60000
\`\`\``,
	},
	DB_USER: {
		required: true,
		installGate: true,
		installSentinel: 'dedalo',
		placeholder: { value: 'myusername' },
		type: 'string',
		scope: 'operator',
		default: 'dedalo',
		heading: 'Dédalo database username',
		typeLabel: 'string',
		doc: `This parameter defines the name of the user who can administer the database. This user must be an administrator or owner of the database, Dédalo must be able to create, update and select all tables and records.

\`\`\`bash
DB_USER="my_username"
\`\`\``,
	},
	DEDALO_PG_BIN_PATH: {
		type: 'string',
		scope: 'operator',
		default: undefined,
		heading: 'Path to the database binary',
		typeLabel: 'string',
		doc: `This parameter defines the directory holding the PostgreSQL client binaries
(\`psql\`, \`pg_dump\`, \`pg_restore\`) used for maintenance tasks and backups. When
unset, Dédalo probes common Homebrew install locations (newest version first)
and falls back to resolving the binary name from \`PATH\`.

\`\`\`bash
DEDALO_PG_BIN_PATH="/usr/lib/postgresql/16/bin/"
\`\`\``,
	},
	SEARCH_LATE_ROW_LOOKUP_OFFSET: {
		type: 'number',
		scope: 'operator',
		default: 1000,
		heading: 'Deep pagination rewrite threshold',
		typeLabel: 'int',
		doc: `From this list offset on, default-ordered section searches are rewritten to a
"late row lookup": the wanted page of record ids is found on an index-only scan first,
and only those rows' full data is fetched. Same rows, same order — measured ~70×
faster at offset 300000 on a 438k-record section, because a plain \`OFFSET\` makes
PostgreSQL read and discard every skipped row's data columns.

Shallow pages keep the plain query (the rewrite would gain nothing there). Set \`-1\`
to disable the rewrite entirely.

\`\`\`bash
SEARCH_LATE_ROW_LOOKUP_OFFSET=1000
\`\`\``,
	},
	TM_COUNT_CACHE_TTL_MS: {
		type: 'number',
		scope: 'operator',
		default: 30000,
		heading: 'Time machine total cache lifetime',
		typeLabel: 'int',
		doc: `The unfiltered time-machine browse shows a total that costs a full count of the
(typically huge, append-only) \`matrix_time_machine\` table. That total is cached and
invalidated on every save this engine performs; this key is the freshness backstop
(in milliseconds) for rows inserted by anything else. Default \`30000\` (30 s). Set
\`0\` to disable the cache and count exactly on every request — the right setting for
parity test environments.

\`\`\`bash
TM_COUNT_CACHE_TTL_MS=30000
\`\`\``,
	},
	DEDALO_SLOW_QUERY_MS: {
		type: 'number',
		scope: 'operator',
		default: 0,
		heading: 'Slow query',
		typeLabel: 'int',
		doc: `This parameter defines the time limit for query calls: if a query takes longer than this value, Dédalo logs a warning line naming the slow statement. Set to \`0\` (the default) to disable slow-query logging.

\`\`\`bash
DEDALO_SLOW_QUERY_MS=1200
\`\`\``,
	},
	PHP_API_BASE_URL: {
		type: 'string',
		scope: 'test_seam',
		default: undefined,
		heading: 'Reference-engine API endpoint (test seam)',
		typeLabel: 'string',
		doc: `Not an administrator setting, and not a live integration: no part of the running
engine calls this endpoint. It is one of three keys used only by the developers' parity
test harness, which can replay recorded responses of the legacy reference engine and
compare them against this engine's. Unset on every installation — the harness defaults
to replaying a frozen, credential-free fixture store instead.`,
	},
	PHP_API_PASSWORD: {
		type: 'string',
		scope: 'test_seam',
		default: undefined,
		heading: 'Reference-engine API password (test seam)',
		typeLabel: 'string',
		doc: `Not an administrator setting. The password half of the credentials the developers'
parity test harness would use against a legacy reference installation (the companion of
the reference-engine API endpoint key above). The running engine never reads it; leave
it unset.`,
	},
	PHP_API_USERNAME: {
		type: 'string',
		scope: 'test_seam',
		default: undefined,
		heading: 'Reference-engine API username (test seam)',
		typeLabel: 'string',
		doc: `Not an administrator setting. The username half of the credentials the developers'
parity test harness would use against a legacy reference installation (the companion of
the reference-engine API endpoint key above). The running engine never reads it; leave
it unset.`,
	},
} as const satisfies Record<string, CatalogEntry>;
