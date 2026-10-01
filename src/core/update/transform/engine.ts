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
 *
 * STOPPABLE AND SINGLE-FLIGHT (OPS-6/PERF-11 r3). A file's unit runs with the
 * statement ceiling lifted and holds the row locks of every row it rewrote until
 * its COMMIT, so an execute must be ENDABLE: `run.signal` (the widget's job signal
 * — a stop, a shutdown) reaches withMaintenanceTransaction, which cancels the
 * running statement and rolls the file back; the signal is checked again before
 * COMMIT and before each next file, which is then reported "not run". Only one
 * execute runs at a time: each file's unit first takes the transaction-scoped
 * advisory try-lock TRANSFORM_RUN_LOCK_KEY (any process, any widget), and a
 * refused file stops the run — never queued behind the other run's row locks,
 * never retried. The widget door adds the in-process claim (claimTransformRun)
 * that refuses a second submit before a job is created (move_common.ts).
 *
 * A FAILED FILE IS NEVER "ROLLED BACK" ON A GUESS (OPS-6/PERF-11 review). A
 * failure can strike DURING COMMIT (a lost connection, the pool force-closed at
 * shutdown), when PostgreSQL may already have committed the file — and a
 * move_locator file is not idempotent, so a re-run on a false "nothing was
 * applied" moves its locators twice. So every executed file that fails (save a
 * run-lock refusal, raised before any write) is classified by ITS OWN
 * transaction's status (postgres.ts outcomeOfFailedUnit, the update engine's
 * classifier): committed → reported applied, its deltas counted; aborted →
 * rolled back; unreadable → OUTCOME UNKNOWN, and the run stops. The checkpoint's
 * transaction-ended-mid-unit verdict is PARTIALLY applied, and stops the run.
 * Gate: test/unit/transform_run_native.test.ts.
 */

import {
	type FailedUnitOutcome,
	isTransactionEndedMidUnit,
	MAINTENANCE_LOCK_TIMEOUT,
	outcomeOfFailedUnit,
	sql,
	withMaintenanceTransaction,
} from '../../db/postgres.ts';
import { DedaloError } from '../../errors/index.ts';
import type { MoveWidgetId } from './definitions.ts';
import { listDefinitionFiles, loadDefinitionFile } from './definitions.ts';
import { TransformRecorder, type TransformReport } from './report.ts';

/** One executor: apply (or dry-run) one definition file's items. */
export type TransformExecutor = (items: unknown, recorder: TransformRecorder) => Promise<void>;

/**
 * The single-flight advisory key of an EXECUTED transform file (transaction
 * scoped, taken first in every file's unit). A sibling of
 * update/engine.ts UPDATE_ENGINE_LOCK_KEY (7_020_926_002) and
 * install/db/migrate.ts ONLINE_MIGRATION_LOCK_KEY (7_020_926_001).
 */
export const TRANSFORM_RUN_LOCK_KEY = 7_020_926_003;

/**
 * The in-process execute claim (move_common.ts takes it before submitting the
 * job, releases it when the job's worker settles or the job ends unstarted).
 * Ops state, never request identity.
 */
let transformRunClaimed = false;

/**
 * Claim the one execute slot of this process: the release function, or null when
 * an execute is already claimed. The release is idempotent.
 */
export function claimTransformRun(): (() => void) | null {
	if (transformRunClaimed) return null;
	transformRunClaimed = true;
	let released = false;
	return () => {
		if (released) return;
		released = true;
		transformRunClaimed = false;
	};
}

/** What a run is handed by its caller (the widget job). */
export interface TransformRun {
	/** The job's abort signal: a stop / shutdown cancels the running file. */
	signal?: AbortSignal;
	/**
	 * Injected `pg_xact_status(<xid>)` read (tests); default the dedicated-
	 * connection read (outcomeOfFailedUnit).
	 */
	readXactStatus?: (xid: string) => Promise<string | null>;
}

/**
 * A file's outcome for the run loop: keep going, or stop the run — refused by
 * the run lock, or a file whose outcome is not a clean apply/rollback (partial,
 * unknown). An ABORT needs no outcome of its own: the loop reads the fired
 * signal before the next file.
 */
type FileOutcome = 'continue' | 'refused' | 'uncertain';

/** The stop wording ("the transform was <stop> before it started") of a stopping outcome. */
const STOP_WORDING: Readonly<Record<Exclude<FileOutcome, 'continue'>, string>> = {
	refused: 'refused',
	uncertain: "stopped (an earlier file's outcome is uncertain)",
};

/** The coordinates marker of refusedByRunLock (an executor's own conflict is not it). */
const RUN_LOCK_RULE = 'transform_run_lock';

/** The refusal a file's unit raises when another execute holds the run lock. */
function refusedByRunLock(): DedaloError {
	return new DedaloError('resource.conflict', {
		message: 'transform refused: another move_* transform holds TRANSFORM_RUN_LOCK_KEY',
		publicMessage: 'Another move_* transform is running',
		coordinates: { rule: RUN_LOCK_RULE },
	});
}

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
	run: TransformRun = {},
): Promise<TransformReport> {
	const options = (rawOptions ?? {}) as TransformRunOptions;
	const dryRun = options.dry_run !== false; // default + anything non-false = dry run
	const selected = selectedFileNames(options.files_selected);
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
	const recorder = new TransformRecorder(dryRun);
	await runSelectedFiles(widget, selected, executor, recorder, run);
	return recorder.toReport(
		`${widget}${dryRun ? ' (no rollback for locator moves — dry run first)' : ''}`,
	);
}

/** The string entries of the operator's `files_selected` (anything else selects nothing). */
function selectedFileNames(filesSelected: unknown): string[] {
	if (!Array.isArray(filesSelected)) return [];
	return filesSelected.filter((name) => typeof name === 'string') as string[];
}

/**
 * Run the selected files in order. Once the run is aborted (before a file, or
 * during one) or refused by the run lock, every remaining file is reported
 * "not run" — none of them started.
 */
async function runSelectedFiles(
	widget: MoveWidgetId,
	selected: string[],
	executor: TransformExecutor,
	recorder: TransformRecorder,
	run: TransformRun,
): Promise<void> {
	const available = new Set(listDefinitionFiles(widget).map((file) => file.file_name));
	let stopped: string | null = null;
	for (const fileName of selected) {
		stopped ??= await abortedBefore(run.signal);
		if (stopped !== null) {
			recorder.error(`${fileName}: not run — the transform was ${stopped} before it started`);
			continue;
		}
		const content = loadSelectedFile(widget, available, fileName, recorder);
		if (content === undefined) continue;
		const outcome = await runDefinitionFile(fileName, content, executor, recorder, run);
		if (outcome !== 'continue') stopped = STOP_WORDING[outcome];
	}
}

/** A selected file's content, or undefined (reported) when it is not the widget's or unparsable. */
function loadSelectedFile(
	widget: MoveWidgetId,
	available: Set<string>,
	fileName: string,
	recorder: TransformRecorder,
): unknown {
	if (!available.has(fileName)) {
		recorder.error(`definition file not found in ${widget}: ${fileName}`);
		return undefined;
	}
	const content = loadDefinitionFile(widget, fileName);
	if (content === null) {
		recorder.error(`unparsable definition file: ${fileName}`);
		return undefined;
	}
	return content;
}

/** The stop wording when the signal already fired, else null. */
async function abortedBefore(signal: AbortSignal | undefined): Promise<string | null> {
	return signal?.aborted === true ? `aborted (${await abortCause(signal)})` : null;
}

/** Why the run's signal fired (the job manager's cause), for the report lines. */
async function abortCause(signal: AbortSignal | undefined): Promise<string> {
	const { jobAbortInfo } = await import('../../media/jobs.ts');
	return jobAbortInfo(signal)?.cause ?? 'aborted';
}

/**
 * The CURRENT attempt of an executed file (a lock retry starts a new one): its
 * transaction id — what a failure is classified by — and, once its work
 * finished (COMMIT is about to be sent), its deltas.
 */
interface FileAttempt {
	xid: string | undefined;
	finished: TransformRecorder | undefined;
}

/**
 * Run ONE definition file. A dry run records straight into the run's recorder.
 * An execute is one atomic, lock-retried, abortable maintenance unit (see the
 * header) that first takes the run lock; a file that still fails gets ONE error
 * line naming it and what its transaction did (recordFileFailure). A rolled-back
 * or committed failure never aborts the run: the next file still runs. A
 * run-lock refusal or an uncertain outcome stops it; an abort, the fired signal.
 */
async function runDefinitionFile(
	fileName: string,
	content: unknown,
	executor: TransformExecutor,
	recorder: TransformRecorder,
	run: TransformRun,
): Promise<FileOutcome> {
	const attempt: FileAttempt = { xid: undefined, finished: undefined };
	try {
		if (recorder.dryRun) {
			await executor(content, recorder);
			return 'continue';
		}
		const applied = await withMaintenanceTransaction(
			async (unit) => {
				attempt.xid = unit.xid; // each attempt (a lock retry starts one) records its own
				const [lock] = (await sql.unsafe('SELECT pg_try_advisory_xact_lock($1::bigint) AS locked', [
					TRANSFORM_RUN_LOCK_KEY,
				])) as { locked: boolean }[];
				if (lock?.locked !== true) throw refusedByRunLock();
				const deltas = recorder.fork();
				await executor(content, deltas);
				// An abort that landed after the last statement still rolls back,
				// and a COMMIT that slipped through the executor is caught here.
				await unit.checkpoint();
				attempt.finished = deltas;
				return deltas;
			},
			{ lockTimeout: MAINTENANCE_LOCK_TIMEOUT, signal: run.signal },
		);
		recorder.absorb(applied);
		return 'continue';
	} catch (error) {
		return recordFileFailure(fileName, error, recorder, run, attempt);
	}
}

/**
 * A file that failed: ONE error line naming it and what its transaction did. A
 * run-lock refusal (raised before any write) stops the run; the checkpoint's
 * transaction-ended-mid-unit verdict is PARTIALLY applied and stops it; every
 * other failure of an execute — the executor's, a lock wait past its retries, a
 * failed COMMIT, an abort — is classified by the attempt's own transaction
 * (outcomeOfFailedUnit): rolled back and committed let the next file run (a
 * committed file's deltas are counted), unknown stops the run.
 */
async function recordFileFailure(
	fileName: string,
	error: unknown,
	recorder: TransformRecorder,
	run: TransformRun,
	attempt: FileAttempt,
): Promise<FileOutcome> {
	const aborted = run.signal?.aborted === true;
	const decided = recordDecidedFailure(fileName, error, recorder, aborted);
	if (decided !== undefined) return decided;
	const why = aborted ? `aborted (${await abortCause(run.signal)})` : (error as Error).message;
	const outcome = await outcomeOfFailedUnit(attempt.xid, {
		label: 'transform',
		readStatus: run.readXactStatus,
	});
	return reportFailedFile(fileName, why, outcome, recorder, attempt, error);
}

/**
 * The failures whose outcome needs no transaction read: a dry run's (no
 * transaction), a run-lock refusal (raised before any write), a transaction
 * that ended mid-unit (PARTIAL by definition). Undefined for every other one.
 */
function recordDecidedFailure(
	fileName: string,
	error: unknown,
	recorder: TransformRecorder,
	aborted: boolean,
): FileOutcome | undefined {
	if (recorder.dryRun) {
		recorder.error(`${fileName}: ${(error as Error).message}`);
		return 'continue';
	}
	if (!aborted && isRunLockRefusal(error)) {
		recorder.error(
			`${fileName}: refused — another move_* transform is running; nothing of this file was applied`,
		);
		return 'refused';
	}
	if (!isTransactionEndedMidUnit(error)) return undefined;
	const { xid_before: before, xid_now: now } = error.coordinates ?? {};
	console.error(`[transform] ${fileName}: a statement ended its transaction mid-unit:`, error);
	recorder.error(
		`${fileName}: PARTIALLY applied — a statement ended the file's transaction mid-unit (xact ${before} → ${now}): what ran before it persisted and what ran after it autocommitted; inspect the data before re-running it (a locator move is not idempotent)`,
	);
	return 'uncertain';
}

/** Whether `error` is refusedByRunLock's refusal (an executor's own conflict is not). */
function isRunLockRefusal(error: unknown): boolean {
	return error instanceof DedaloError && error.coordinates?.rule === RUN_LOCK_RULE;
}

/** The error line of a failed execute, by its transaction's outcome (see recordFileFailure). */
function reportFailedFile(
	fileName: string,
	why: string,
	outcome: FailedUnitOutcome,
	recorder: TransformRecorder,
	attempt: FileAttempt,
	error: unknown,
): FileOutcome {
	if (outcome === 'rolled_back') {
		recorder.error(`${fileName}: ${why} — rolled back: nothing of this file was applied`);
		return 'continue';
	}
	const xact = attempt.xid === undefined ? '' : ` [xact ${attempt.xid}]`;
	console.error(`[transform] ${fileName}${xact} failed; its transaction is ${outcome}:`, error);
	if (outcome === 'committed') {
		// COMMIT is sent only once the work finished, so its deltas are the file's.
		if (attempt.finished !== undefined) recorder.absorb(attempt.finished);
		recorder.error(
			`${fileName}: ${why} — but PostgreSQL reports its transaction COMMITTED: this file WAS applied; do not re-run it`,
		);
		return 'continue';
	}
	recorder.error(
		`${fileName}: ${why} — outcome UNKNOWN: its COMMIT may have landed and its transaction's status could not be read back; inspect the data before re-running it (a locator move is not idempotent)`,
	);
	return 'uncertain';
}
