/**
 * THE LEASE-FENCE CENSUS — every write to a diffusion job row carries the epoch
 * (PUB-13), or is an enumerated, reasoned exemption.
 *
 * THE INVARIANT. A diffusion job row can be claimed more than once: the sweeper
 * requeues a run whose heartbeat went stale and a later claim hands the row to a
 * new runner while the old process may still be alive. The lease is therefore
 * `(job_id, attempt)` — `attempt` is stamped by the claim and survives the
 * requeue — and every write a LEASE HOLDER makes is fenced with
 * `AND attempt = $epoch AND state = 'running'`, so the loser of a re-claim
 * writes nothing (behaviour: queue_fence_native).
 *
 * WHY A CENSUS AND NOT A LIST. The behavioural gate proves the five mutators
 * that exist today refuse a revoked lease. It cannot see the SIXTH one somebody
 * adds next year — a new `SET totals = …` helper keyed on job_id alone is
 * exactly the defect this row closed, and it would be green under every
 * behavioural gate in the tree. So the census is TOTAL and DERIVED: it walks
 * every `.ts` under src/ and tools/, finds every DML statement addressed to the
 * jobs table wherever it lives, and demands the epoch predicate or an entry in
 * the exemption map below. The map is SHRINK-ONLY — an unused entry fails.
 *
 * THE SECOND LEG — THE EPOCH MUST BE MONOTONIC. A fence predicate is only worth
 * the uniqueness of the value it compares. If any statement can RESET `attempt`,
 * a later claim re-issues an epoch a slow-but-alive runner from an earlier claim
 * still holds (an ABA on the counter): both fence legs match for the loser and
 * every write it makes lands on the live run. That is not hypothetical — the
 * admin requeue used to `SET attempt = 0`, and it was measured writing a loser's
 * heartbeat, progress and terminal result over a live run through a fully fenced
 * mutator. So the census also reads the SET clause of every job-row statement
 * and demands that the only assignment to `attempt` anywhere in the tree is a
 * FORWARD increment (`attempt + n`). Retry budget belongs to `max_attempts`.
 *
 * ANTI-VACUITY. The scan carries a corpus floor (files walked, statements
 * found, table-touching files), the five fenced mutators are pinned by name so
 * an exemption cannot be used to launder one of them, and the checker itself is
 * run against a PLANTED offender: a synthetic module holding an unfenced UPDATE
 * must be reported, or the checker is measuring nothing.
 *
 * The argv leg is here too because it is the same law: the epoch reaches the
 * runner PROCESS on its command line and is never re-read from the row (a
 * re-read is a second race), so a runner invoked without `--epoch` must refuse
 * to start rather than default to "whatever the row says now".
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stripComments } from '../helpers/strip_comments.ts';
import { WRITE_PATH_CORPUS_FLOOR, writePathSourceFiles } from '../helpers/write_path_corpus.ts';

const REPO_ROOT = new URL('../../', import.meta.url).pathname;

/**
 * Corpus floors — a scan that shrank to nothing must fail, not pass. The file
 * floor is the SHARED lister's own floor: this gate does not choose its roots,
 * it takes the write-path corpus (src/ + tools/ + scripts/), so widening that
 * corpus widens this census with it and cannot drift away from the gates that
 * share it.
 */
const FILE_FLOOR = WRITE_PATH_CORPUS_FLOOR;
const STATEMENT_FLOOR = 10;

/**
 * Writes that are NOT lease-holder writes, each with the reason it cannot carry
 * an epoch. SHRINK-ONLY: an entry naming a function that no longer holds an
 * unfenced statement fails this gate.
 */
const EXEMPTIONS: Readonly<Record<string, string>> = {
	enqueueDiffusionJob:
		'INSERT: the row does not exist yet, so no lease can exist either; the target-uniqueness index is its guard.',
	claimNextQueuedJob:
		'The epoch ISSUER: this statement is what increments attempt. Its guard is state = queued under FOR UPDATE SKIP LOCKED plus the admission advisory lock.',
	sweepStaleJobs:
		'The epoch REVOKER: it takes the row back from a lost runner. Guarded by state = running plus a stale heartbeat. It deliberately does NOT check runner.pid — a runner on another host has no pid here — because the epoch fence, not pid liveness, is what stops the loser writing.',
	finalizeQueuedJob:
		'Terminal transition of a row that was never claimed (the owner-scoped cancel of a QUEUED job). No runner ever owned it, so there is no lease; the guard is state = queued.',
	requestCancel:
		'Server-side control plane: sets the cancel FLAG on the caller own active job (owner-scoped, state in queued|running). It never writes run state or progress — the runner honours the flag under its own lease.',
	requeueTerminalJob:
		'Admin revive of a TERMINAL row (failed|cancelled|interrupted); the state guard is what proves no live lease is being disturbed. It grants the retry budget FORWARD (max_attempts = attempt + n) and may never rewind the epoch — the monotonicity leg below is what holds it to that.',
	purgeTerminalJobs:
		'Housekeeping DELETE of aged terminal rows (state terminal + finished_at past the cutoff): there is nothing running to fence.',
	deleteJobsForTests:
		'Test-only hard delete of rows a suite created, by explicit id list; never reachable from production code.',
};

/** The lease-holder writes, pinned so no exemption can quietly absorb one. */
const MUST_BE_FENCED = [
	'recordRunnerPid',
	'heartbeatJob',
	'updateJobProgress',
	'checkpointJob',
	'finishJob',
];

interface DmlStatement {
	file: string;
	fn: string;
	verb: string;
	sql: string;
	fenced: boolean;
	/** RHS of every assignment to `attempt` in this statement's SET clause. */
	epochAssignments: string[];
}

/**
 * The TOTAL scope, derived from the shared write-path lister, never a hand list
 * and never a walk root chosen here: every non-test `.ts` of the engine and the
 * tool packages (and of scripts/, where a one-off "fix the queue" mutator is
 * exactly the kind of write this fence exists for). Absolute paths, so the
 * attribution below can keep slicing REPO_ROOT off.
 */
function sourceFiles(): string[] {
	return writePathSourceFiles()
		.map((relative) => join(REPO_ROOT, relative))
		.sort();
}

/**
 * DML addressed to an INTERPOLATED table identifier. The identifier is resolved
 * against the module's aliases below rather than pinned to the literal spelling
 * `${DIFFUSION_JOBS_TABLE}`: a mutator written as
 * `const T = DIFFUSION_JOBS_TABLE; … UPDATE "${T}" …` is the same write and must
 * not escape the census by renaming its own reference.
 */
const DML = /(INSERT INTO|UPDATE|DELETE FROM)\s+"\$\{([A-Za-z0-9_]+)\}"/g;

/**
 * Every local name that refers to the jobs table in one module: the imported
 * constant plus any `const x = <alias>` chain assigned from it (to a fixpoint).
 * Honest limit: a table name COMPUTED at runtime (string concatenation, a
 * lookup) is out of scope here — that is a SQL-confinement violation of its own
 * and is where sql_confinement_tripwire, not this census, is the door.
 */
function jobsTableAliases(source: string): Set<string> {
	const aliases = new Set(['DIFFUSION_JOBS_TABLE']);
	const ASSIGNMENT = /\b(?:const|let|var)\s+([A-Za-z0-9_]+)\s*(?::[^=;]+)?=\s*([A-Za-z0-9_]+)\s*;/g;
	for (let grew = true; grew; ) {
		grew = false;
		ASSIGNMENT.lastIndex = 0;
		for (let hit = ASSIGNMENT.exec(source); hit !== null; hit = ASSIGNMENT.exec(source)) {
			const [, name, from] = hit;
			if (name !== undefined && from !== undefined && aliases.has(from) && !aliases.has(name)) {
				aliases.add(name);
				grew = true;
			}
		}
	}
	return aliases;
}
const FUNCTION_DECLARATION = /(?:export\s+)?(?:async\s+)?function\s+([A-Za-z0-9_]+)\s*\(/g;
const EPOCH_PREDICATE = /attempt\s*=\s*\$\d/;
/** `attempt = …` (never `max_attempts = …`) — assignments only, read from SET. */
const EPOCH_ASSIGNMENT = /(?:^|[^\w.])attempt\s*=\s*([^,\n]+)/g;
/** The ONLY legal RHS: a forward increment. Anything else rewinds the epoch. */
const FORWARD_INCREMENT = /^(?:[A-Za-z0-9_]+\.)?attempt\s*\+\s*\d+$/;

/**
 * The SET clause of one statement — everything between `SET` and the `WHERE`
 * that follows it. The fence predicate (`attempt = $2::int`) lives in the WHERE
 * and must never be read as an assignment.
 */
function setClause(statement: string): string {
	const set = /\bSET\b/.exec(statement);
	if (set === null) return '';
	const rest = statement.slice(set.index + set[0].length);
	const where = /\bWHERE\b/.exec(rest);
	return where === null ? rest : rest.slice(0, where.index);
}

function epochAssignmentsIn(statement: string): string[] {
	const found: string[] = [];
	const clause = setClause(statement);
	EPOCH_ASSIGNMENT.lastIndex = 0;
	for (let hit = EPOCH_ASSIGNMENT.exec(clause); hit !== null; hit = EPOCH_ASSIGNMENT.exec(clause)) {
		found.push((hit[1] ?? '').trim());
	}
	return found;
}

/** Every DML statement addressed to the jobs table in one module. */
function statementsIn(file: string, rawSource: string): DmlStatement[] {
	const source = stripComments(rawSource);
	const aliases = jobsTableAliases(source);
	const found: DmlStatement[] = [];
	DML.lastIndex = 0;
	for (const match = { current: DML.exec(source) }; match.current !== null; ) {
		if (!aliases.has(match.current[2] ?? '')) {
			match.current = DML.exec(source);
			continue;
		}
		const at = match.current.index;
		// The statement is the enclosing template literal.
		const open = source.lastIndexOf('`', at);
		const close = source.indexOf('`', at);
		const statement =
			open === -1 || close === -1 ? source.slice(at, at + 400) : source.slice(open, close);
		// Attribute it to the nearest preceding function declaration.
		let fn = '(top level)';
		FUNCTION_DECLARATION.lastIndex = 0;
		for (
			let declaration = FUNCTION_DECLARATION.exec(source);
			declaration !== null && declaration.index < at;
			declaration = FUNCTION_DECLARATION.exec(source)
		) {
			fn = declaration[1] ?? fn;
		}
		found.push({
			file,
			fn,
			verb: match.current[1] ?? '',
			sql: statement,
			fenced: EPOCH_PREDICATE.test(statement),
			epochAssignments: epochAssignmentsIn(statement),
		});
		match.current = DML.exec(source);
	}
	return found;
}

const FILES = sourceFiles();
const STATEMENTS: DmlStatement[] = [];
for (const file of FILES) {
	const source = readFileSync(file, 'utf8');
	if (!source.includes('DIFFUSION_JOBS_TABLE')) continue;
	STATEMENTS.push(...statementsIn(file.slice(REPO_ROOT.length), source));
}

describe('the scan saw a real tree', () => {
	test(`at least ${FILE_FLOOR} source files walked under the write-path roots`, () => {
		expect(FILES.length).toBeGreaterThanOrEqual(FILE_FLOOR);
	});

	test(`at least ${STATEMENT_FLOOR} DML statements addressed to the jobs table`, () => {
		expect(STATEMENTS.length).toBeGreaterThan(STATEMENT_FLOOR);
	});

	test('every statement was attributed to a named function, none to top level', () => {
		expect(STATEMENTS.filter((statement) => statement.fn === '(top level)')).toEqual([]);
	});
});

describe('every job-row write carries the epoch, or a reasoned exemption', () => {
	test('TOTAL: no unfenced DML outside the enumerated exemptions', () => {
		const offenders = STATEMENTS.filter(
			(statement) => !statement.fenced && EXEMPTIONS[statement.fn] === undefined,
		).map((statement) => `${statement.file} ${statement.fn} (${statement.verb})`);
		expect(
			offenders,
			"A write to a diffusion job row must be fenced on the lease (AND attempt = $epoch AND state = 'running') or be added to EXEMPTIONS with the reason it cannot be. See PUB-13 / WC-2026-09-05-diffusion-lease-epoch-fence.",
		).toEqual([]);
	});

	test('the five lease-holder mutators are fenced (an exemption may not launder one)', () => {
		for (const name of MUST_BE_FENCED) {
			const statements = STATEMENTS.filter((statement) => statement.fn === name);
			expect(statements.length, `${name} holds no job-row DML — was it renamed?`).toBeGreaterThan(
				0,
			);
			for (const statement of statements) {
				expect(statement.fenced, `${name} lost its epoch predicate`).toBe(true);
			}
			expect(EXEMPTIONS[name], `${name} may never be exempted`).toBeUndefined();
		}
	});

	test('a fenced statement also pins the state, so a terminal row is closed to its own lease', () => {
		for (const statement of STATEMENTS.filter((entry) => entry.fenced)) {
			expect(statement.sql, `${statement.fn} fences the epoch but not the state`).toContain(
				"state = 'running'",
			);
		}
	});

	test('EXEMPTIONS is shrink-only — every entry still names an unfenced statement', () => {
		const unfenced = new Set(
			STATEMENTS.filter((statement) => !statement.fenced).map((statement) => statement.fn),
		);
		const stale = Object.keys(EXEMPTIONS).filter((name) => !unfenced.has(name));
		expect(stale, 'stale exemption(s): the code no longer needs them, so delete them').toEqual([]);
	});

	test('every exemption reason is a real sentence, not a placeholder', () => {
		for (const [name, reason] of Object.entries(EXEMPTIONS)) {
			expect(reason.length, `${name} reason is too short to be one`).toBeGreaterThan(60);
			expect(reason.endsWith('.'), `${name} reason is not a sentence`).toBe(true);
		}
	});
});

describe('the epoch is monotonic — nothing in the tree rewinds `attempt`', () => {
	test('the claim is the only assigner, and it only increments', () => {
		const assigning = STATEMENTS.filter((statement) => statement.epochAssignments.length > 0);
		// Floor: if the column were renamed and the scan found nothing, this leg
		// would be vacuously green.
		expect(
			assigning.map((statement) => statement.fn).sort(),
			'the epoch must be assigned by claimNextQueuedJob and by nothing else',
		).toEqual(['claimNextQueuedJob']);
	});

	test('TOTAL: every assignment to `attempt` is a forward increment', () => {
		const offenders = STATEMENTS.flatMap((statement) =>
			statement.epochAssignments
				.filter((rhs) => !FORWARD_INCREMENT.test(rhs))
				.map((rhs) => `${statement.file} ${statement.fn}: attempt = ${rhs}`),
		);
		expect(
			offenders,
			'`attempt` is the LEASE EPOCH: rewinding it re-issues an epoch a slow runner from an earlier claim may still hold, and the fence then matches for the loser (PUB-13 ABA). Grant retry budget with max_attempts instead.',
		).toEqual([]);
	});

	test('the budget column is the one that may be reset, and it is not the epoch', () => {
		const requeue = STATEMENTS.find((statement) => statement.fn === 'requeueTerminalJob');
		expect(requeue, 'requeueTerminalJob holds no job-row DML — was it renamed?').toBeDefined();
		expect(setClause(requeue?.sql ?? '')).toContain('max_attempts');
		expect(requeue?.epochAssignments ?? []).toEqual([]);
	});

	test('anti-vacuity: a planted reset is reported and a planted increment is not', () => {
		const planted = [
			'export async function rewindEpoch(jobId: string): Promise<void> {',
			'  await sql.unsafe(`UPDATE "${DIFFUSION_JOBS_TABLE}"',
			"   SET state = 'queued', attempt = 0, max_attempts = 3",
			'   WHERE job_id = $1`, [jobId]);',
			'}',
			'export async function bumpEpoch(jobId: string): Promise<void> {',
			'  await sql.unsafe(`UPDATE "${DIFFUSION_JOBS_TABLE}" jobs',
			"   SET state = 'running', attempt = jobs.attempt + 1",
			'   WHERE job_id = $1`, [jobId]);',
			'}',
			'export async function fencedWrite(lease: JobLease): Promise<void> {',
			'  await sql.unsafe(`UPDATE "${DIFFUSION_JOBS_TABLE}" SET heartbeat_at = now()',
			"   WHERE job_id = $1 AND attempt = $2::int AND state = 'running' RETURNING job_id`, []);",
			'}',
		].join('\n');
		const scanned = statementsIn('planted.ts', planted);
		expect(scanned.length).toBe(3);
		const bad = scanned.filter((statement) =>
			statement.epochAssignments.some((rhs) => !FORWARD_INCREMENT.test(rhs)),
		);
		expect(bad.map((statement) => statement.fn)).toEqual(['rewindEpoch']);
		expect(scanned[1]?.epochAssignments).toEqual(['jobs.attempt + 1']);
		// the WHERE-clause fence predicate is NOT an assignment
		expect(scanned[2]?.epochAssignments).toEqual([]);
		expect(scanned[2]?.fenced).toBe(true);
	});
});

describe('anti-vacuity — the checker is run against a planted offender', () => {
	const PLANTED = [
		'import { DIFFUSION_JOBS_TABLE } from "./schema.ts";',
		'export async function stampSomethingNew(jobId: string): Promise<void> {',
		'  await sql.unsafe(`UPDATE "${DIFFUSION_JOBS_TABLE}" SET totals = totals || $2::jsonb WHERE job_id = $1`, [jobId, {}]);',
		'}',
		'export async function stampSomethingFenced(lease: JobLease): Promise<void> {',
		'  await sql.unsafe(`UPDATE "${DIFFUSION_JOBS_TABLE}" SET totals = totals || $3::jsonb',
		"   WHERE job_id = $1 AND attempt = $2::int AND state = 'running' RETURNING job_id`, []);",
		'}',
	].join('\n');

	test('an unfenced new mutator is reported; its fenced twin is not', () => {
		const scanned = statementsIn('planted.ts', PLANTED);
		expect(scanned.length).toBe(2);
		const unfenced = scanned.filter((statement) => !statement.fenced);
		expect(unfenced.map((statement) => statement.fn)).toEqual(['stampSomethingNew']);
		// and it is NOT in the exemption map, so the TOTAL test above would fail on it
		expect(EXEMPTIONS.stampSomethingNew).toBeUndefined();
	});

	test('an ALIASED table reference does not escape the census', () => {
		const aliased = [
			'import { DIFFUSION_JOBS_TABLE } from "./schema.ts";',
			'const T = DIFFUSION_JOBS_TABLE;',
			'export async function sneakyStamp(jobId: string): Promise<void> {',
			'  await sql.unsafe(`UPDATE "${T}" SET totals = $2::jsonb WHERE job_id = $1`, [jobId, {}]);',
			'}',
		].join('\n');
		const scanned = statementsIn('planted.ts', aliased);
		expect(scanned.map((statement) => statement.fn)).toEqual(['sneakyStamp']);
		expect(scanned[0]?.fenced).toBe(false);
		// a DIFFERENT table interpolated in the same shape is NOT this census
		const otherTable = [
			'import { DIFFUSION_JOBS_TABLE } from "./schema.ts";',
			'export async function eventsWrite(): Promise<void> {',
			'  await sql.unsafe(`INSERT INTO "${DIFFUSION_JOB_EVENTS_TABLE}" (job_id) VALUES ($1)`, []);',
			'}',
		].join('\n');
		expect(statementsIn('planted.ts', otherTable)).toEqual([]);
	});

	test('a comment mentioning the predicate cannot fence a statement', () => {
		const commented = [
			'export async function pretend(jobId: string): Promise<void> {',
			'  // this one is safe because attempt = $2 somewhere else',
			'  await sql.unsafe(`UPDATE "${DIFFUSION_JOBS_TABLE}" SET heartbeat_at = now() WHERE job_id = $1`, [jobId]);',
			'}',
		].join('\n');
		expect(statementsIn('planted.ts', commented)[0]?.fenced).toBe(false);
	});
});

describe('the epoch reaches the runner process on its argv, never by re-reading the row', () => {
	const runnerPath = join(REPO_ROOT, 'src/diffusion/runner.ts');

	async function runnerExit(argv: string[]): Promise<number> {
		const probe = Bun.spawn([process.execPath, 'run', runnerPath, ...argv], {
			cwd: REPO_ROOT,
			stdout: 'ignore',
			stderr: 'pipe',
			env: { ...process.env },
		});
		return await probe.exited;
	}

	test('a runner invoked WITHOUT --epoch refuses to start', async () => {
		expect(await runnerExit(['--job', '00000000-0000-4000-8000-000000000000'])).toBe(2);
	}, 60_000);

	test('a runner invoked with a non-integer --epoch refuses to start', async () => {
		expect(
			await runnerExit(['--job', '00000000-0000-4000-8000-000000000000', '--epoch', 'later']),
		).toBe(2);
	}, 60_000);

	// The other half — that the SCHEDULER actually passes it — is measured, not
	// spelled: diffusion_actions.test.ts drives diffuse → schedulerTick → a REAL
	// spawned runner process → 'completed'. A scheduler that omitted --epoch
	// would exit(2) at the two probes above and that end-to-end gate turns red.
});
