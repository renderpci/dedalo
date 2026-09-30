/**
 * move_* transform ENGINE runner (UPDATE_PROCESS Phase 5) — the shared entry
 * every move_* widget's open branch calls. Loads the operator-selected
 * definition files, dispatches each to its executor under one TransformRecorder
 * (dry run reports the would-be deltas; execute applies them), and returns the
 * merged report.
 *
 * PHP parity: the backend-activity log and Time Machine are SUPPRESSED during a
 * transform run (the moved data's TM history is rewritten in place, not
 * re-created). On the TS side that suppression is scoped through this runner:
 * executors write via the matrix primitives directly (no TM snapshot) and the
 * relation-search index / counters are maintained explicitly where PHP does.
 *
 * DRY RUN is REQUIRED before an execute (WC-025): the client must pass
 * `dry_run: false` explicitly to mutate; absent/true = report only.
 *
 * ONE DEFINITION FILE = ONE ATOMIC UNIT (OPS-6/PERF-11). An executed file runs
 * inside `withMaintenanceTransaction`: one transaction on the maintenance lane,
 * under the MAINTENANCE_LOCK_TIMEOUT lock-wait bound, retried WHOLE on a lock
 * timeout (55P03). The executors issue many statements per file — a move_tld
 * rename is one UPDATE per matrix table, then the Time Machine tail, the
 * generation and counter carries, the embedded-tipo rewrite. As bare autocommit
 * statements on the bounded lane, a lock wait (a concurrent editor's row lock,
 * an index build's SHARE lock) aborted them part-way with the earlier tables
 * already COMMITTED under the new tipo: a section split between two tipos, a
 * locator move half-applied — with no undo, and a crash or a constraint failure
 * mid-file did the same. Now a file applies whole or not at all, and the report
 * says which. Its deltas are recorded into a per-ATTEMPT recorder merged only
 * on COMMIT, so a discarded attempt never reports writes that did not persist.
 * Gate: test/unit/maintenance_door_unbounded_native.test.ts (move_tld held past
 * the bound on its TM row) + test/unit/transform_run_native.test.ts.
 * A DRY RUN writes nothing and stays out of any transaction.
 */

import { MAINTENANCE_LOCK_TIMEOUT, withMaintenanceTransaction } from '../../db/postgres.ts';
import type { MoveWidgetId } from './definitions.ts';
import { listDefinitionFiles, loadDefinitionFile } from './definitions.ts';
import { TransformRecorder, type TransformReport } from './report.ts';

/** One executor: apply (or dry-run) one definition file's items. */
export type TransformExecutor = (items: unknown, recorder: TransformRecorder) => Promise<void>;

export interface TransformRunOptions {
	/** The definition file names the operator selected (must be a subset of the widget's dir). */
	files_selected?: unknown;
	/** MUST be exactly false to mutate; anything else = dry run (WC-025). */
	dry_run?: unknown;
}

/**
 * Run a widget's transform over the selected definition files. `executor` is
 * the per-widget executor (portalize/tipos/locators/tables/lang). Refuses a
 * file not present in the widget's confined dir.
 */
export async function runTransform(
	widget: MoveWidgetId,
	rawOptions: unknown,
	executor: TransformExecutor,
): Promise<TransformReport> {
	const options = (rawOptions ?? {}) as TransformRunOptions;
	const dryRun = options.dry_run !== false; // default + anything non-false = dry run
	const recorder = new TransformRecorder(dryRun);

	const available = new Set(listDefinitionFiles(widget).map((file) => file.file_name));
	const selected = Array.isArray(options.files_selected)
		? (options.files_selected.filter((name) => typeof name === 'string') as string[])
		: [];
	if (selected.length === 0) {
		return {
			ok: false,
			dryRun,
			msg: 'Error. No definition files selected',
			errors: ['files_selected is required'],
			counts: {},
			sample: [],
		};
	}

	for (const fileName of selected) {
		if (!available.has(fileName)) {
			recorder.error(`definition file not found in ${widget}: ${fileName}`);
			continue;
		}
		const content = loadDefinitionFile(widget, fileName);
		if (content === null) {
			recorder.error(`unparsable definition file: ${fileName}`);
			continue;
		}
		await runDefinitionFile(fileName, content, executor, recorder);
	}

	return recorder.toReport(
		`${widget}${dryRun ? ' (no rollback for locator moves — dry run first)' : ''}`,
	);
}

/**
 * Run ONE definition file. A dry run records straight into the run's recorder.
 * An execute is one atomic, lock-retried maintenance unit (see the header); a
 * file that still fails is ROLLED BACK — its attempt's deltas are dropped (none
 * of them persisted) and one error line names the file. An executor error never
 * aborts the run: the next file still runs.
 */
async function runDefinitionFile(
	fileName: string,
	content: unknown,
	executor: TransformExecutor,
	recorder: TransformRecorder,
): Promise<void> {
	try {
		if (recorder.dryRun) {
			await executor(content, recorder);
			return;
		}
		const applied = await withMaintenanceTransaction(
			async () => {
				const attempt = recorder.fork();
				await executor(content, attempt);
				return attempt;
			},
			{ lockTimeout: MAINTENANCE_LOCK_TIMEOUT },
		);
		recorder.absorb(applied);
	} catch (error) {
		recorder.error(
			`${fileName}: ${(error as Error).message}${
				recorder.dryRun ? '' : ' — rolled back: nothing of this file was applied'
			}`,
		);
	}
}
