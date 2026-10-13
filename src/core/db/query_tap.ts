/**
 * THE QUERY TAP — the one place a statement is TIMED, and the one place a test
 * can COUNT the statements a piece of work issues (OPS-13, S-12).
 *
 * WHY IT EXISTS. The slow-query log (DEDALO_SLOW_QUERY_MS) used to live inside
 * `runOnPool`, the pooled branch of the `sql` proxy in postgres.ts. Every
 * statement issued INSIDE a transaction — that is, the whole write path — took
 * the other branch, which returned the transaction executor's query RAW and
 * UNTIMED, and so did every statement on a `sql.reserve()`d connection. The
 * setting reported as live while measuring less than half of the engine.
 * `observeStatement` is that timing tail, factored out and called from ALL
 * THREE lanes, so the log finally means what its name says.
 *
 * WHY AsyncLocalStorage, NOT A MODULE COUNTER. A counter at module scope is
 * process-wide state in a persistent runtime: two concurrent requests would
 * share it, and a budget assertion would measure whatever else the server
 * happened to be doing (spec §4 — and it would need a module_state_tripwire
 * allowlist entry). The tap is an ALS FRAME instead: it exists only inside
 * `runWithQueryTap`, it is inherited by exactly the async work that scope
 * awaits, and it needs no allowlist.
 *
 * ARMING. Caller attribution costs a stack capture per statement, so the tap
 * opens only on a DEVELOPMENT posture (DEDALO_DEV_MODE) or in the test suite
 * (DEDALO_TEST_MEDIA_ROOT — the key that both repoints and arms the suite media
 * root). On a production installation `runWithQueryTap` REFUSES: a budget
 * assertion that silently measures nothing is worse than no assertion.
 * `observeStatement` itself is unconditional — the timing tail is the
 * production behaviour — and does its (cheap) tap bookkeeping only while a
 * frame is open.
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { config } from '../../config/config.ts';
import { readEnv } from '../../config/env.ts';
import { DedaloError } from '../errors/dedalo_error.ts';

/** Which connection a statement ran on. Named in the slow-query line. */
export type StatementLane = 'pooled' | 'transaction' | 'reserved';

/** Statements slower than this warn-log, 0 = off (DEDALO_SLOW_QUERY_MS). */
const SLOW_QUERY_MS = config.ops.slowQueryMs;

/** Stack frames of the tap's own plumbing, never the caller being attributed. */
const TAP_INTERNAL_FRAME = /src\/core\/db\/(postgres|query_tap)\.ts|node:internal|bun:/;

/** Caller frames kept per statement — enough to place a call, not a full trace. */
const CALLER_FRAMES = 3;

/**
 * Distinct call sites a single frame remembers. A long-running scope (an import
 * of thousands of rows) would otherwise grow the map without bound; past the
 * cap the count still rises, under one overflow key, so the TOTAL is never
 * wrong — only the attribution is truncated.
 */
const MAX_CALL_SITES = 200;
const OVERFLOW_CALL_SITE = '(further call sites beyond the attribution cap)';

interface QueryTapFrame {
	label: string;
	count: number;
	byLane: Record<StatementLane, number>;
	callers: Map<string, CallSiteTally>;
}

/** One call site's tally: statements, and the rows they returned. */
interface CallSiteTally {
	count: number;
	/** Most rows ONE statement of this call site returned (0 for non-row results). */
	maxRows: number;
	/** Rows all its statements returned together. */
	sumRows: number;
}

const tapStore = new AsyncLocalStorage<QueryTapFrame>();

/** What a tap scope measured. */
export interface QueryTapReport {
	label: string;
	/** Statements executed inside the scope, all three lanes together. */
	count: number;
	byLane: Record<StatementLane, number>;
	/**
	 * Call sites, most statements first: `{ frames, count, maxRows, sumRows }` —
	 * rows = the length of a statement's row array (0 for a command without rows),
	 * so a gate can bound how much ONE statement carried into the process.
	 */
	callers: { frames: string; count: number; maxRows: number; sumRows: number }[];
}

/** True when the current async context is inside a `runWithQueryTap` scope. */
export function queryTapActive(): boolean {
	return tapStore.getStore() !== undefined;
}

/**
 * True when this posture may open a tap scope: a development server, or the
 * test suite (whose preload sets DEDALO_TEST_MEDIA_ROOT before any module
 * reads config). Read through readEnv — never process.env (S2-21).
 */
export function queryTapArmed(): boolean {
	if (readEnv('DEDALO_DEV_MODE') === 'true') return true;
	const testMediaRoot = readEnv('DEDALO_TEST_MEDIA_ROOT');
	return testMediaRoot !== undefined && testMediaRoot.trim() !== '';
}

/** The caller's own frames, with the tap's and the runtime's plumbing removed. */
function captureCallSite(): string {
	const stack = new Error().stack ?? '';
	const frames = stack
		.split('\n')
		.slice(1)
		.map((line) => line.trim())
		.filter((line) => line.length > 0 && !TAP_INTERNAL_FRAME.test(line));
	if (frames.length === 0) return '(no caller frame outside the db layer)';
	return frames.slice(0, CALLER_FRAMES).join(' <- ');
}

function recordStatement(
	frame: QueryTapFrame,
	lane: StatementLane,
	callSite: string,
	rows: number,
): void {
	frame.count++;
	frame.byLane[lane]++;
	const key = frame.callers.has(callSite)
		? callSite
		: frame.callers.size >= MAX_CALL_SITES
			? OVERFLOW_CALL_SITE
			: callSite;
	const tally = frame.callers.get(key) ?? { count: 0, maxRows: 0, sumRows: 0 };
	tally.count++;
	tally.maxRows = Math.max(tally.maxRows, rows);
	tally.sumRows += rows;
	frame.callers.set(key, tally);
}

/**
 * Execute ONE statement under the tap: time it, warn-log it when it exceeds
 * DEDALO_SLOW_QUERY_MS, and count it into the ambient tap frame if one is open.
 *
 * `describeQuery` is lazy — the text is built only when a line actually fires.
 * The lane is named in the warn line because with all three lanes finally
 * measured, an in-transaction statement would otherwise be indistinguishable
 * from the pooled ones an operator already knows.
 */
export async function observeStatement<T>(
	lane: StatementLane,
	describeQuery: () => string,
	execute: () => Promise<T>,
): Promise<T> {
	const frame = tapStore.getStore();
	// Attribution costs a stack capture, so it happens ONLY with a scope open.
	const callSite = frame === undefined ? '' : captureCallSite();
	const startedAt = performance.now();
	// Rows the statement returned (0 for a command without rows, or a failure),
	// read in `finally` — a local holder, never module state.
	const returned = { rows: 0 };
	try {
		const result = await execute();
		returned.rows = Array.isArray(result) ? result.length : 0;
		return result;
	} finally {
		const elapsedMs = performance.now() - startedAt;
		if (SLOW_QUERY_MS > 0 && elapsedMs >= SLOW_QUERY_MS) {
			console.warn(
				`[db] slow query ${Math.round(elapsedMs)}ms (threshold ${SLOW_QUERY_MS}ms, lane ${lane}): ${describeQuery()}`,
			);
		}
		if (frame !== undefined) recordStatement(frame, lane, callSite, returned.rows);
	}
}

/**
 * Run `work` with a query tap open and report every statement it issued.
 *
 * REFUSES on an unarmed posture rather than reporting a zero: a caller asks
 * this question to assert on the answer, and an answer that cannot be wrong is
 * not an answer.
 */
export async function runWithQueryTap<T>(
	label: string,
	work: () => Promise<T>,
): Promise<{ result: T; report: QueryTapReport }> {
	if (!queryTapArmed()) {
		throw new DedaloError('internal.invariant', {
			message:
				`query tap "${label}" was opened on a posture that does not arm it. The tap is a ` +
				'development/test instrument: set DEDALO_DEV_MODE=true, or run under the test suite ' +
				'(DEDALO_TEST_MEDIA_ROOT). It never opens on a production installation, and it never ' +
				'silently reports a zero.',
		});
	}
	const frame: QueryTapFrame = {
		label,
		count: 0,
		byLane: { pooled: 0, transaction: 0, reserved: 0 },
		callers: new Map(),
	};
	const result = await tapStore.run(frame, work);
	const callers = [...frame.callers.entries()]
		.map(([frames, tally]) => ({ frames, ...tally }))
		.sort((a, b) => b.count - a.count);
	return {
		result,
		report: { label: frame.label, count: frame.count, byLane: { ...frame.byLane }, callers },
	};
}
