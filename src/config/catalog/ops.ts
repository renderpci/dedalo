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

The engine's restore door (\`bun scripts/restore.ts <artifact>\`, run with the engine stopped) is
the way back: it proves the artifact by a full read, restores it in one transaction beside the
current database and swaps the two by name. Each run writes its report to a \`restores/\`
directory inside this one.

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
		// (!) This entry used to describe a LOGIN-TRIGGERED BACKUP: "Dedalo check in every
		// user login if the last backup exceed this time lapse, in affirmative case, it will
		// create new one." That was v6's behaviour, inherited as prose and never as code.
		// Verified 2026-08-30 by reading the whole login path: nothing in the TS engine
		// starts a backup, on login or on any other event. So the sentence told an operator
		// that setting this key gave them periodic backups, when the only thing that makes a
		// backup on a schedule is `deploy/dedalo-backup.service` + `.timer` -- an operator
		// who trusted the manual had NO backups at all. Documenting what the key does is the
		// fix; implementing a multi-GB pg_dump on somebody's login is not (a nightly timer is
		// the right owner of that work, and it already exists).
		//
		// The two live readers, verified 2026-08-30 (kept HERE rather than in the rendered
		// prose: config.md is the operator's manual and internal paths are noise there) —
		// `backupFreshness` in src/core/update/preconditions.ts, which turns this into the
		// waivable `update.refused` of a code update and into the update panel's
		// `backup_fresh` line (src/core/update/status.ts); and the non-forced branch of
		// `initBackupSequence` (src/core/area_maintenance/backup.ts), whose only engine
		// caller — the make_backup widget — always forces, so it does not fire today.
		doc: `This parameter is the **freshness threshold**, in hours, applied to database backups: it
decides when an existing backup is judged too old. It schedules NOTHING — no engine event, a
user login included, ever starts a backup.

Making the backups is the operating system's job — a nightly timer, described under
[Backups](../management/backup.md). What this value decides, verified against the code on
2026-08-30, is:

- **Whether a code update may proceed.** Applying a code release is REFUSED when the newest
  dump in the backup directory is older than this many hours, or when there is none at all:
  a code swap's rollback contract leans on there being a database to come back to. The
  operator can waive the refusal explicitly, and the update panel shows the same verdict
  before they start.
- **Whether the maintenance "Make backup" button would skip.** It never does today: that
  button always forces a dump, so the throttle it belongs to is not reached.

Age is judged by the newest backup file's modification time. Keep the value in step with how
often the nightly job actually runs — set it below the real interval and the updater refuses
on an installation that is backing up perfectly well.

\`\`\`bash
DEDALO_BACKUP_TIME_RANGE=8
\`\`\``,
	},
	DEDALO_DEBUG_API_ERRORS: {
		// Binary: the reader is `!== 'true'`, so unset IS false.
		type: 'boolean',
		scope: 'operator',
		default: false,
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
	DEDALO_JOB_DEADLINE_MAINTENANCE_S: {
		type: 'number',
		scope: 'operator',
		default: 21600,
		heading: 'Defining the maintenance job deadline',
		typeLabel: 'int',
		doc: `This parameter defines how long, in seconds, a maintenance job may run before Dédalo cancels it.

Maintenance jobs are the work an administrator starts: a code or data update, a cache rebuild, a
bulk import, a value propagated across records. Six hours by default, which is generous for a
full cache rebuild of a large collection and far more than any update needs. A job that passes
its deadline is asked to stop and its record is marked stopped, so the lane is not held for ever
by work that will never finish.

Set it to \`0\` to switch the deadline off, on an installation whose imports legitimately run
longer than the default. Raise it rather than switching it off if you can name the ceiling: a
deadline is what turns a wedged job into a reported one.

\`\`\`bash
DEDALO_JOB_DEADLINE_MAINTENANCE_S=21600
\`\`\``,
	},
	DEDALO_JOB_DEADLINE_MEDIA_S: {
		type: 'number',
		scope: 'operator',
		default: 0,
		heading: 'Defining the media job deadline',
		typeLabel: 'int',
		doc: `This parameter defines how long, in seconds, a media job may run before Dédalo cancels it.

There is NO deadline by default (\`0\`), and that is deliberate: transcoding a master video is
legitimately hours of work, and a deadline that killed it would be the fault, not the guard.

Set it on an installation that knows its own ceiling — if nothing you hold should ever take more
than two hours to convert, \`7200\` turns a stuck conversion into a reported one instead of a lane
that stays busy for ever. Note that the cancellation reaches the job itself; a conversion program
already running as a separate process finishes its own work, and the fact that it is still
holding its lane is reported in the counters.

\`\`\`bash
DEDALO_JOB_DEADLINE_MEDIA_S=0
\`\`\``,
	},
	DEDALO_JOB_DEADLINE_RAG_S: {
		type: 'number',
		scope: 'operator',
		default: 3600,
		heading: 'Defining the index job deadline',
		typeLabel: 'int',
		doc: `This parameter defines how long, in seconds, an index-building job may run before Dédalo
cancels it.

These are the jobs that compute the semantic index used by assisted search and by object
identification. One hour by default, which comfortably covers a pass over a single group of
records. A job that passes its deadline is asked to stop and its record is marked stopped.

Set it to \`0\` to switch the deadline off, or raise it when you index very large groups in one
go.

\`\`\`bash
DEDALO_JOB_DEADLINE_RAG_S=3600
\`\`\``,
	},
	DEDALO_JOB_DEADLINE_TRANSCRIPTION_S: {
		type: 'number',
		scope: 'operator',
		default: 14400,
		heading: 'Defining the transcription job deadline',
		typeLabel: 'int',
		doc: `This parameter defines how long, in seconds, a transcription job may run before Dédalo
cancels it.

Transcription jobs wait on the speech-to-text service, so they are mostly idle time; four hours
by default, which covers a long interview with room to spare. A batch that runs longer than this
is almost always a service that has stopped answering rather than work still in progress, and
the deadline turns that into a stopped job with a reason instead of a lane held for ever.

Set it to \`0\` to switch the deadline off.

\`\`\`bash
DEDALO_JOB_DEADLINE_TRANSCRIPTION_S=14400
\`\`\``,
	},
	DEDALO_JOB_LANE_MAINTENANCE_CONCURRENCY: {
		type: 'number',
		scope: 'operator',
		default: 2,
		heading: 'Defining maintenance job concurrency',
		typeLabel: 'int',
		doc: `This parameter defines how many maintenance jobs Dédalo will run at the same time.

Background work in Dédalo runs in lanes, and each class of work has its own budget of
simultaneous jobs: media derivatives, transcription, index building and the maintenance work an
administrator starts by hand. The lanes are independent on purpose — a queue of video
transcodes must never be able to hold up the code update you are waiting for.

Maintenance is the administrator's own lane: code and data updates, cache rebuilds, imports,
propagations. Two by default, so that starting an import does not have to wait for a cache
rebuild to finish. Values below 1 are raised to 1.

\`\`\`bash
DEDALO_JOB_LANE_MAINTENANCE_CONCURRENCY=2
\`\`\``,
	},
	DEDALO_JOB_LANE_RAG_CONCURRENCY: {
		type: 'number',
		scope: 'operator',
		default: 2,
		heading: 'Defining index job concurrency',
		typeLabel: 'int',
		doc: `This parameter defines how many index-building jobs Dédalo will run at the same time.

Background work in Dédalo runs in lanes, and each class of work has its own budget of
simultaneous jobs: media derivatives, transcription, index building and the maintenance work an
administrator starts by hand. The lanes are independent on purpose — a queue of video
transcodes must never be able to hold up the code update you are waiting for.

This lane builds the semantic index used by assisted search and object identification. Two by
default. Raise it if you index frequently and the machine has cores to spare; lower it to 1 to
keep the index work out of the way of everything else. Values below 1 are raised to 1.

\`\`\`bash
DEDALO_JOB_LANE_RAG_CONCURRENCY=2
\`\`\``,
	},
	DEDALO_JOB_LANE_TRANSCRIPTION_CONCURRENCY: {
		type: 'number',
		scope: 'operator',
		default: 2,
		heading: 'Defining transcription job concurrency',
		typeLabel: 'int',
		doc: `This parameter defines how many transcription jobs Dédalo will run at the same time.

Background work in Dédalo runs in lanes, and each class of work has its own budget of
simultaneous jobs: media derivatives, transcription, index building and the maintenance work an
administrator starts by hand. The lanes are independent on purpose — a queue of video
transcodes must never be able to hold up the code update you are waiting for.

Transcription jobs spend nearly all their time waiting on the speech-to-text service rather than
using this machine, so their slots are cheap to hold: two by default, which keeps a short
recording from queueing behind a long interview. Raise it if your transcription service handles
several requests at once. Values below 1 are raised to 1.

\`\`\`bash
DEDALO_JOB_LANE_TRANSCRIPTION_CONCURRENCY=2
\`\`\``,
	},
	DEDALO_RECONCILE_SCHEDULER_ENABLED: {
		type: 'boolean',
		scope: 'operator',
		default: true,
		heading: 'Reconcile scheduler',
		typeLabel: 'bool',
		doc: `Whether **this** server runs the scheduled cross-store reconciles by itself: the
boot-class ones once after it starts listening (today: the publication-marker index, which
re-derives the web server's \`pub/\` markers from the per-target truth) and the interval-class
ones on their period. Every outcome is published under \`reconcile\` on \`/api/v1/counters\`
and listed by the **Reconcile** maintenance widget, which — like \`bun scripts/reconcile.ts\` —
keeps working with the scheduler off; only the automatic runs stop.

Enabled by default. Set it to \`false\` on an instance that must not touch a shared store — a
maintenance or smoke-test copy that shares the database or the media tree with the live
installation, where a boot-time repair from the wrong root would do harm.

\`\`\`bash
DEDALO_RECONCILE_SCHEDULER_ENABLED=false
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
