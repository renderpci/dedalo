/**
 * CONFIG CATALOG — domain: ops
 *
 * GENERATED SCAFFOLD (probe_emit_catalog.ts). Hand-edit from here on.
 */

import type { CatalogEntry } from '../catalog_types.ts';

export const OPS_KEYS = {
	DEDALO_ACCESS_LOG: {
		type: 'boolean',
		scope: 'operator',
		default: false,
		heading: 'Defining the access log',
		typeLabel: 'bool',
		doc: `With \`true\`, the engine writes **one JSON line per API request** to its standard output:
timestamp, request id, user id, the API class and action that was called, the response status
and the duration in milliseconds. A service manager captures it with the rest of the service
log, so it can be filtered and parsed with the usual tools.

Off by default: it is a line per request, and on a busy installation that is a lot of lines.
Turn it on when you need to see who called what — a suspicious edit, a user reporting an error
they cannot reproduce — and turn it off again afterwards.

Slow requests are warn-logged whatever this is set to (see \`DEDALO_SLOW_REQUEST_MS\`), so you
do not need the access log merely to notice that something is slow.

\`\`\`bash
DEDALO_ACCESS_LOG=false
\`\`\``,
	},
	DEDALO_BACKUP_DIR: {
		type: 'string',
		scope: 'operator',
		default: undefined,
		heading: 'Defining the database backups directory',
		typeLabel: 'string',
		doc: `Where the database dumps produced by the maintenance backup tool (and by a scheduled
nightly backup job) are written. Unset, they go to \`backups/db\` inside the private directory,
next to the configuration file and the session store.

Set it to move the dumps onto another volume: a backup that lives on the same disk as the
database it came from is not a backup. The directory must be writable by the user the engine
runs as, and it must never sit inside the tree the web server publishes — a dump is a complete,
unprotected copy of your data.

Remember that the database dump is only one piece: the media originals and the private directory
have to be copied too, or a restore will bring back records that point at files that no longer
exist. This key is distinct from \`DEDALO_BACKUP_PATH\`, which is where a code update stages the
previous code tree.

\`\`\`bash
DEDALO_BACKUP_DIR="/srv/backups/dedalo/db"
\`\`\``,
	},
	DEDALO_BACKUP_PATH: {
		type: 'string',
		scope: 'operator',
		default: undefined,
		heading: 'Defining backups directory',
		typeLabel: 'string',
		doc: `This parameter defines the directory a code update stages the previous tree into
before swapping in a new release, so a failed update can be rolled back. Keep it
outside the served tree for security. Defaults to \`<install>/../backups/code\`.
This is distinct from \`DEDALO_BACKUP_DIR\`, which sets the directory for database
backups (see [Database connection](config_db.md)).

\`\`\`bash
DEDALO_BACKUP_PATH="/srv/dedalo/backups/code"
\`\`\``,
	},
	DEDALO_BACKUP_TIME_RANGE: {
		type: 'number',
		scope: 'operator',
		default: 8,
		heading: 'Defining backup time range',
		typeLabel: 'int',
		doc: `This parameter defines the time lapse between backup copies in hours. Dédalo check in every user login if the last backup exceed this time lapse, in affirmative case, it will create new one.

\`\`\`bash
DEDALO_BACKUP_TIME_RANGE=8
\`\`\``,
	},
	DEDALO_DEBUG_API_ERRORS: {
		type: 'string',
		scope: 'operator',
		default: undefined,
		heading: 'Defining debug detail for API errors',
		typeLabel: 'bool',
		typeSuffix: '(optional; development only)',
		doc: `When a request fails unexpectedly, the client is answered with a generic message and a
**request id**, while the exception text stays on the server, logged under that same id. This
is deliberate: the raw text of an error can carry query fragments, filesystem paths and internal
identifiers, and the request id is what lets you find the full story in the log without handing
any of it to the caller.

Set \`DEDALO_DEBUG_API_ERRORS=true\` and the exception text is **also** echoed in the response.
It is a convenience while developing, and a gift to an attacker anywhere else — every failed
request becomes a free description of your internals.

Unset (off) is the default and the only correct value on a shared or public installation.

\`\`\`bash
DEDALO_DEBUG_API_ERRORS=true
\`\`\``,
	},
	DEDALO_DEV_MODE: {
		type: 'boolean',
		scope: 'operator',
		default: false,
		heading: 'Defining development mode',
		typeLabel: 'bool',
		doc: `Marks this installation as a development server. With \`true\`, logged-in users get the
debug and developer surfaces in the interface (the extra inspection panels), the client is told
it is talking to a development server so it takes the no-cache path instead of the offline
service-worker one, and the readable, non-minified versions of the client libraries are served.
The configuration widget in the maintenance area reports the mode it resolved, so you can always
check what a running server thinks it is.

Default \`false\`, the production posture. Never \`true\` on a shared or public installation: the
developer surfaces expose internal structure that ordinary users have no business seeing.

The real environment wins over the configuration file, so a single development run can be marked
without editing anything:

\`\`\`bash
DEDALO_DEV_MODE=true bun run dev
\`\`\``,
	},
	DEDALO_SLOW_REQUEST_MS: {
		type: 'number',
		scope: 'operator',
		default: 5000,
		heading: 'Defining the slow request threshold',
		typeLabel: 'int',
		doc: `Any API request that takes longer than this, in milliseconds, is warn-logged with its
duration, the API call, the request id and the user — and counted, so the count also shows up in
the server counters. This happens whether or not the access log is on.

Default \`5000\` (5 seconds): slow enough that a healthy installation stays quiet, fast enough to
notice a query that has started to degrade. Lower it while hunting a latency problem; raise it if
one genuinely heavy operation is flooding the log with noise you have already accounted for. Set
\`0\` to disable the warning entirely.

\`\`\`bash
DEDALO_SLOW_REQUEST_MS=5000
\`\`\``,
	},
	UPDATE_LOG_FILE: {
		type: 'string',
		scope: 'operator',
		default: undefined,
		heading: 'Update log file',
		typeLabel: 'string',
		doc: `Defines the directory path to store the update log.

The maintenance update process uses the update log to store the status of each update task. This log is useful to know what happens in the update process. If the update fails, you can consult the last status to restore the update process at this last point.

Defaults to \`update.log\` inside \`../private\`. If you move it elsewhere, keep the
directory private and outside the served tree.

\`\`\`bash
UPDATE_LOG_FILE="/srv/dedalo/private/update.log"
\`\`\``,
	},
} as const satisfies Record<string, CatalogEntry>;
