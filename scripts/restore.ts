/**
 * ============================================================================
 * RESTORE — the ONE CLI door for a DATA restore
 * (src/core/area_maintenance/restore_door.ts, audit 2026-08-26 S-7).
 * ============================================================================
 *
 * Drives the engine-owned restore procedure against the configured database:
 * full-read verification of the artifact, zero-connection check, one-transaction
 * restore into a sidecar, atomic rename swap, the post-restore reconcile plan
 * (src/core/reconcile/post_restore.ts), a journal under
 * `<DEDALO_BACKUP_DIR>/restores/`. Every refusal names its phase and leaves the
 * target untouched. The whole order lives in engineering/PRODUCTION.md §6.1.
 *
 * THE ENGINE MUST BE STOPPED FIRST (and its watchdog timer): the door refuses
 * while any backend holds the target, and it cannot stop a service it does not
 * see. It stamps maintenance mode in ts_state.json; lift it after reading the
 * report.
 *
 * USAGE:
 *
 *     bun scripts/restore.ts <artifact> [--database <name>] [--drop-previous] [--json]
 *
 *   --database        restore this database instead of the configured one
 *                     (connection user/host/port stay the configured ones).
 *                     This is a REHEARSAL: the artifact is verified, restored
 *                     and swapped in, but the reconcile plan does NOT run and
 *                     maintenance mode is NOT stamped — both belong to the
 *                     configured database (the plan runs through the engine's
 *                     pool, which is bound to it; the stamp is read by the
 *                     engine serving it). The row counts in the target are the
 *                     rehearsal's verdict.
 *   --drop-previous   drop `<db>_pre_restore_<stamp>` after a successful swap
 *                     (default: keep it — a second full copy on the volume,
 *                     yours to prune)
 *   --maintenance-db  the database admin statements connect through
 *                     (default `postgres`)
 *   --json            print the report as JSON
 *
 * Exit status: 0 = restored, reconcile plan reported nothing held (or a
 * rehearsal restored); 2 = restored but the plan HELD drift for an operator
 * decision (read `held` / `failed`); 1 = refused or failed (the target is
 * untouched; the message says which phase).
 */

// Side-effect: registers the component-model lookup the ontology resolver
// requires (the reconcile plan runs the registry; standalone scripts must do
// what the server entrypoint does).
import '../src/core/components/registry.ts';
import { runRestoreDoor } from '../src/core/area_maintenance/restore_door.ts';
import { DedaloError } from '../src/core/errors/dedalo_error.ts';
import { connFromConfig } from '../src/core/install/pg_exec.ts';

function usage(message?: string): never {
	if (message !== undefined) console.error(`error: ${message}\n`);
	console.error(
		'usage: bun scripts/restore.ts <artifact> [--database <name>] [--drop-previous] [--maintenance-db <name>] [--json]',
	);
	process.exit(1);
}

const VALUE_FLAGS = new Set(['--database', '--maintenance-db']);
const SWITCHES = new Set(['--drop-previous', '--json']);

interface Arguments {
	artifact: string;
	values: Map<string, string>;
	switches: Set<string>;
}

/**
 * Positional parse: a value flag consumes the token after it, so
 * `--database mydb <artifact>` cannot mistake `mydb` for the artifact.
 */
function parseArguments(argv: string[]): Arguments {
	const values = new Map<string, string>();
	const switches = new Set<string>();
	const positional: string[] = [];
	for (let i = 0; i < argv.length; i++) {
		const token = argv[i] as string;
		if (VALUE_FLAGS.has(token)) {
			const value = argv[i + 1];
			if (value === undefined || value.startsWith('--')) usage(`${token} needs a value`);
			values.set(token, value);
			i += 1;
		} else if (SWITCHES.has(token)) {
			switches.add(token);
		} else if (token.startsWith('--')) {
			usage(`unknown flag ${token}`);
		} else {
			positional.push(token);
		}
	}
	if (positional.length !== 1) usage('exactly one artifact path is required');
	return { artifact: positional[0] as string, values, switches };
}

async function main(): Promise<number> {
	const { artifact, values, switches } = parseArguments(process.argv.slice(2));
	const json = switches.has('--json');
	const database = values.get('--database');
	const maintenanceDatabase = values.get('--maintenance-db');
	const connection = connFromConfig();
	if (database !== undefined) connection.database = database;

	const report = await runRestoreDoor({
		artifact,
		connection,
		dropPrevious: switches.has('--drop-previous'),
		...(maintenanceDatabase === undefined ? {} : { maintenanceDatabase }),
	});
	if (json) {
		console.log(JSON.stringify(report, null, 2));
	} else {
		console.log(
			`restored '${report.target}' from ${report.artifact.filePath} (${report.artifact.size} bytes, ${report.artifact.reason})${
				report.mode === 'rehearsal'
					? ` — REHEARSAL (the configured database is '${report.configured_database}')`
					: ''
			}`,
		);
		console.log(`pg_restore: ${report.pg_restore.duration_ms} ms, one transaction, exit 0`);
		console.log(
			report.previous === null
				? report.previous_dropped
					? 'previous database: dropped (--drop-previous)'
					: 'previous database: none (the target did not exist)'
				: `previous database kept as '${report.previous}' — a full second copy; drop it when the restore is accepted`,
		);
		if (report.reconcile === null) {
			console.log(
				'reconcile plan: NOT RUN and maintenance mode NOT stamped — a rehearsal of another database; both belong to the configured one (read the row counts in the target)',
			);
		}
		for (const step of report.reconcile?.steps ?? []) {
			const verdict =
				step.error !== null
					? `FAILED ${step.error}`
					: `drift ${step.report?.drift ?? 0}, applied ${step.report?.applied ?? 0}`;
			console.log(
				`reconcile ${step.name.padEnd(18)} ${step.apply ? 'APPLY  ' : 'DRY-RUN'} ${verdict}`,
			);
		}
		if (report.reconcile !== null && report.reconcile.held.length > 0)
			console.log(
				`HELD for your decision: ${report.reconcile.held.join(', ')} (bun scripts/reconcile.ts run <name> --apply)`,
			);
		if (report.reconcile !== null && report.reconcile.failed.length > 0)
			console.log(`reconcile steps that threw: ${report.reconcile.failed.join(', ')}`);
		console.log(`journal: ${report.journal_path}`);
		if (report.maintenance_mode_stamped)
			console.log(
				'maintenance mode is ON (ts_state.json) — lift it from the maintenance area once the report is read',
			);
	}
	if (report.reconcile === null) return 0;
	return report.reconcile.held.length === 0 && report.reconcile.failed.length === 0 ? 0 : 2;
}

let status: number;
try {
	status = await main();
} catch (error) {
	if (error instanceof DedaloError) {
		console.error(`${error.code}: ${error.message}`);
	} else {
		console.error(error);
	}
	status = 1;
}
process.exit(status);
