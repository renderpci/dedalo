/**
 * Shared machinery of the move_* migration widgets (move_lang / move_locator /
 * move_tld / move_to_portal / move_to_table): the static explanation body
 * (byte-equal to PHP) + the TS-owned definition-file listing + the
 * ownership-gated transform EXECUTE (UPDATE_PROCESS Phase 5, WC-025).
 *
 * DRY RUN IS REQUIRED before an execute: the client passes
 * `{files_selected, dry_run}`; `dry_run` must be exactly false to mutate, and
 * the response reports the deltas either way. Definition files live under the
 * TS-owned config.ops.transformDefinitionsDir (never the PHP tree).
 */

import { DedaloError } from '../../errors/index.ts';
import type { Principal } from '../../security/permissions.ts';
import {
	engineDenied,
	failAction,
	gated,
	type WidgetHandler,
	type WidgetModule,
	type WidgetResponse,
	type WidgetSpec,
} from './support.ts';

export const MOVE_WIDGET_BODIES: Record<string, string> = {
	move_lang:
		'Convert map items (e.g., hierarchy89) between translatable and non-translatable components (or vice-versa).<br>\n\t\t\t\t\t   Uses JSON file definitions located in /dedalo/core/base/transform_definition_files/move_lang.<br>\n\t\t\t\t\t   Note: This process can be very time-consuming, as it iterates through all relevant records in the database.',
	move_locator:
		'Move locator defined map items from source (ex. rsc194) to target (ex. rsc197) adding new section_id based in the last section_id of destiny.<br>\n\t\t\t\t\t   Uses JSON file definitions located in /dedalo/core/base/transform_definition_files/move_locator.<br>\n\t\t\t\t\t   Note: this can be a very long process because it has to go through all the records in all the tables.',
	move_tld:
		'Move TLD defined map items from source (ex. numisdata279) to target (ex. tchi1).<br>\n\t\t\t\t\t   Uses JSON file definitions located in /dedalo/core/base/transform_definition_files/move_tld.<br>\n\t\t\t\t\t   Note: this can be a very long process because it has to go through all the records in all the tables.',
	move_to_portal:
		'Move data from a section to another linked section and link together with a portal (e.g. "Use and function" components behind qdp443 to section rsc1340).<br>\n\t\t\t\t\t   Uses JSON file definitions located in /dedalo/core/base/transform_definition_files/move_to_portal.<br>\n\t\t\t\t\t   Note: this can be a very long process because it has to go through all the records in all the tables.',
	move_to_table:
		'Move data from a table to another (e.g. move utoponymy1 to matrix_hierarchy).<br>\n\t\t\t\t\t   Uses JSON file definitions located in /dedalo/core/base/transform_definition_files/move_to_table.<br>',
};

/** Resolve one widget's executor (lazy — avoids loading the whole engine per boot). */
export async function executorFor(
	id: string,
): Promise<
	(
		items: unknown,
		recorder: import('../../update/transform/report.ts').TransformRecorder,
	) => Promise<void>
> {
	switch (id) {
		case 'move_tld': {
			const { executeChangesInTipos } = await import('../../update/transform/tipos.ts');
			return executeChangesInTipos;
		}
		case 'move_locator': {
			const { executeChangesInLocators } = await import('../../update/transform/locators.ts');
			return executeChangesInLocators;
		}
		case 'move_to_portal': {
			const { executePortalize } = await import('../../update/transform/portalize.ts');
			return executePortalize;
		}
		case 'move_to_table': {
			const { executeMoveToTable } = await import('../../update/transform/tables.ts');
			return executeMoveToTable;
		}
		case 'move_lang': {
			const { executeMoveLang } = await import('../../update/transform/lang.ts');
			return executeMoveLang;
		}
		default:
			throw new Error(`no transform executor for ${id}`);
	}
}

/**
 * COVERAGE-EXEMPT for execution (coverage plan §5.1; the reason is registered in
 * engineering/crap_coverage_exempt.json, which test/unit/crap_complexity_ratchet.test.ts
 * gates against this marker): the body is the static catalog lookup plus
 * `listDefinitionFiles`.
 *
 * LEDGER — coverage plan §4.4 D20: the `?? ''` fallback below is DEAD. All five
 * `buildMoveWidget` call sites pass ids that ARE keys of `MOVE_WIDGET_BODIES`
 * (`move_lang` included — checked, since a missing key would have made the
 * fallback live), so no input reaches it. It is UNREACHABLE BY CONSTRUCTION,
 * not merely untested. What KEEPS it dead — and the one non-vacuous claim this
 * function carries — IS GATED: test/unit/move_widget_registry_native.test.ts
 * asserts, in both directions, that every registered move_* id is both an
 * `executorFor` switch arm and a `MOVE_WIDGET_BODIES` key.
 */
function moveWidgetGetValue(widget: string): WidgetHandler {
	return async () => {
		const { listDefinitionFiles } = await import('../../update/transform/definitions.ts');
		const files = listDefinitionFiles(
			widget as import('../../update/transform/definitions.ts').MoveWidgetId,
		);
		return { data: { body: MOVE_WIDGET_BODIES[widget] ?? '', files } };
	};
}

/**
 * The OPEN (owned) transform run — dry-run mandatory before an execute.
 *
 * A DRY RUN is inline (runDryInline): it writes nothing and holds no lock, and
 * its report is the response. AN EXECUTE IS A JOB (submitExecuteJob,
 * OPS-6/PERF-11 r3), never inline. Gate: test/unit/transform_run_native.test.ts
 * drives both through the real widget door with a fake executor.
 */
function moveWidgetRun(id: string): WidgetHandler {
	return async (options, principal): Promise<WidgetResponse> => {
		const widget = id as MoveWidgetId;
		const executor = await executorFor(id);
		return options.dry_run === false
			? submitExecuteJob(widget, options, executor, principal)
			: runDryInline(widget, options, executor);
	};
}

type MoveWidgetId = import('../../update/transform/definitions.ts').MoveWidgetId;
type TransformExecutor = import('../../update/transform/engine.ts').TransformExecutor;
type TransformReport = import('../../update/transform/report.ts').TransformReport;

/** A transform report's diagnostic fields, as the widget renders them generically. */
function reportExtend(report: TransformReport): Record<string, unknown> {
	return { dry_run: report.dryRun, counts: report.counts, sample: report.sample };
}

/**
 * The inline DRY RUN. A refused/failed run throws with the transform's own
 * sentence; a successful one keeps msg/errors and the diagnostic fields.
 */
async function runDryInline(
	widget: MoveWidgetId,
	options: Record<string, unknown>,
	executor: TransformExecutor,
): Promise<WidgetResponse> {
	const { runTransform } = await import('../../update/transform/engine.ts');
	const report = await runTransform(widget, options, executor);
	if (!report.ok) {
		failAction(
			report.errors.length === 0 ? report.msg : `${report.msg} (${report.errors.join('; ')})`,
		);
	}
	return {
		data: report.ok,
		msg: report.msg,
		...(report.errors.length === 0 ? {} : { errors: report.errors }),
		extend: reportExtend(report),
	};
}

/**
 * The EXECUTE, as a maintenance-lane job. Each file is one lock-holding unit
 * with the statement ceiling lifted, so the run must be endable: the job's
 * signal (the operator's stop, a shutdown) cancels the running file and rolls it
 * back (engine.ts). NO deadline (deadlineMs 0): a clock firing mid-file rolls
 * back a file whose rerun meets the same clock — update_data_version's reason.
 * The response is `{pid, pfile}` at once (the widget polls
 * dd_utils_api:get_process_status); the job's final `data` is the report
 * `{result, msg, errors, dry_run, counts, sample}`. SINGLE-FLIGHT: a second
 * execute while one is claimed is refused (`resource.conflict`) before any job
 * exists; across processes the engine's per-file run lock refuses it.
 */
async function submitExecuteJob(
	widget: MoveWidgetId,
	options: Record<string, unknown>,
	executor: TransformExecutor,
	principal: Principal,
): Promise<WidgetResponse> {
	const { claimTransformRun, runTransform } = await import('../../update/transform/engine.ts');
	const release = claimTransformRun();
	if (release === null) {
		throw new DedaloError('resource.conflict', {
			message: `${widget} refused: another move_* transform is running in this process`,
			publicMessage: 'Another move_* transform is running',
		});
	}
	const { mediaJobs } = await import('../../media/jobs.ts');
	try {
		const record = mediaJobs.submit(
			widget,
			async ({ signal }) => {
				const report = await runTransform(widget, options, executor, { signal });
				return {
					result: report.ok,
					msg: report.msg,
					errors: report.errors,
					...reportExtend(report),
				};
			},
			{
				// Operator work on stored data: the maintenance lane (PERF-11).
				lane: 'maintenance',
				deadlineMs: 0,
				// The report samples name records: the status stream is owner-scoped.
				userId: principal.userId,
				// The claim is freed on the job's FIRST terminal transition: for a
				// started job that is when its worker SETTLES (a stop included — its
				// file already rolled back), for one stopped while still queued it is
				// at once (its worker never runs). Idempotent.
				onTerminal: release,
			},
		);
		return {
			data: true,
			msg: `OK. Running ${widget} ${process.pid}`,
			extend: { pid: process.pid, pfile: `${record.id}.json`, dry_run: false },
		};
	} catch (error) {
		release();
		throw error;
	}
}

/**
 * Build one move_* widget module (spec + ownership-gated transform EXECUTE +
 * definition panel). Closed (coexisting) keeps the frozen engine_denied; open
 * runs the transform engine (dry-run first — WC-025).
 */
export function buildMoveWidget(id: string, spec: WidgetSpec): WidgetModule {
	return {
		spec,
		apiActions: {
			[id]: gated(
				`${id}.${id}`,
				engineDenied(`${id}.${id}`, 'the bulk transform is driven by PHP-tree definition files'),
				moveWidgetRun(id),
			),
		},
		// A bulk transform of stored records: maintenance (PERF-11). The inline
		// DRY RUN reads every row under this door scope; an EXECUTE is a detached
		// job whose files each declare their own unit (engine.ts
		// runDefinitionFile — atomic, lock-retried, abortable), so the lane's
		// lock-wait bound rolls a file back whole — it never splits one.
		unboundedActions: [id],
		getValue: moveWidgetGetValue(id),
	};
}
