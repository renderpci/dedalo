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
 */

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
			result: false,
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
		try {
			await executor(content, recorder);
		} catch (error) {
			recorder.error(`${fileName}: ${(error as Error).message}`);
		}
	}

	return recorder.toReport(
		`${widget}${dryRun ? ' (no rollback for locator moves — dry run first)' : ''}`,
	);
}
