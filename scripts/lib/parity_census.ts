/**
 * PARITY TIER CENSUS — the ONE measure of which parity tests fail today.
 *
 * It RUNS the tier (`bun test test/parity`, ~7 s, credless: ORACLE_MODE
 * defaults to `fixtures`) under bun's JUnit reporter and parses the report
 * into a per-file, per-TEST-NAME result set. Nothing else in the repo may
 * measure this: the generator (scripts/parity_baseline.ts) and the gate
 * (test/unit/parity_baseline_tripwire.test.ts) both import from here, because
 * a second implementation of the measure makes the ratchet worthless.
 *
 * WHY A SUBPROCESS. The tier's reds are the observable fact being frozen, and
 * the only honest way to know them is to run it. Parsing bun's own JUnit output
 * (rather than re-implementing a runner) keeps the key identical to what bun
 * prints: `<describe> > <describe> > <test name>`, per file.
 *
 * NOT hermetic: it executes the parity tier, which reads the frozen fixture
 * store and, for some gates, the suite database. It never writes the baseline.
 */

import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const REPO_ROOT = join(import.meta.dir, '..', '..');

/** The tier under ratchet. One string, so a re-point is one edit. */
export const TIER_PATH = 'test/parity';

/** The exact command the census runs (also quoted in failure messages). */
export const TIER_COMMAND = `bun test ${TIER_PATH}`;

/** Status of one test case, as JUnit reports it. */
export type CaseStatus = 'pass' | 'fail' | 'skip';

export interface ParityCase {
	/** Repo-relative file, e.g. `test/parity/count_differential.test.ts`. */
	file: string;
	/** Full name path: describe chain + test name, ' > '-joined (bun's own display form). */
	name: string;
	status: CaseStatus;
}

export interface ParityRun {
	cases: ParityCase[];
	/** Distinct files that reported at least one case. */
	files: string[];
	totals: { tests: number; pass: number; fail: number; skip: number };
}

// ── JUnit parsing ────────────────────────────────────────────────────────────
// bun emits nested <testsuite> elements (file → describe → describe …) with
// <testcase> leaves; a failing case carries a <failure> child, a skipped one a
// <skipped> child. We only need the nesting names + those two markers, so a
// tag scanner is enough — and it cannot be fooled by the assertion diffs dumped
// inside <failure>, because those live in CDATA/text, never in a tag position.

const TAG = /<(\/?)(testsuites|testsuite|testcase|failure|skipped|error)\b([^>]*)>/g;

function attr(raw: string, key: string): string | undefined {
	// JUnit attribute values are XML-escaped; only the entities bun emits matter.
	const m = new RegExp(`\\b${key}="([^"]*)"`).exec(raw);
	const value = m?.[1];
	if (value === undefined) return undefined;
	return value
		.replaceAll('&lt;', '<')
		.replaceAll('&gt;', '>')
		.replaceAll('&quot;', '"')
		.replaceAll('&apos;', "'")
		.replaceAll('&amp;', '&');
}

/**
 * Parse a bun JUnit report into cases. Exported so the gate can prove the
 * measure SEES a failure (anti-vacuity), without running the tier twice.
 */
export function parseJunit(xml: string): ParityRun {
	const cases: ParityCase[] = [];
	// Stack of open <testsuite> names. The OUTERMOST one is the file; the rest
	// are the describe chain.
	const suites: string[] = [];
	let currentFile = '';
	let open: ParityCase | null = null;

	TAG.lastIndex = 0;
	for (let m = TAG.exec(xml); m !== null; m = TAG.exec(xml)) {
		const closing = m[1] ?? '';
		const tag = m[2] ?? '';
		const rawAttrs = (m[3] ?? '').trimEnd();
		const isClose = closing === '/';
		// `[^>]*` swallows the trailing slash of a self-closing tag — take it back.
		const isSelf = rawAttrs.endsWith('/');
		const raw = isSelf ? rawAttrs.slice(0, -1) : rawAttrs;

		if (tag === 'testsuite') {
			if (isClose) {
				suites.pop();
				if (suites.length === 0) currentFile = '';
				continue;
			}
			const name = attr(raw, 'name') ?? '';
			if (suites.length === 0) currentFile = attr(raw, 'file') ?? name;
			suites.push(name);
			continue;
		}

		if (tag === 'testcase') {
			if (isClose) {
				if (open !== null) cases.push(open);
				open = null;
				continue;
			}
			// suites[0] is the file-level wrapper — its name is the path, not a describe.
			const path = [...suites.slice(1), attr(raw, 'name') ?? ''].filter((s) => s.length > 0);
			const parsed: ParityCase = {
				file: currentFile,
				name: path.join(' > '),
				status: 'pass',
			};
			if (isSelf) cases.push(parsed);
			else open = parsed;
			continue;
		}

		if (open !== null && !isClose) {
			if (tag === 'failure' || tag === 'error') open.status = 'fail';
			else if (tag === 'skipped') open.status = 'skip';
		}
	}

	const files = [...new Set(cases.map((c) => c.file))].sort();
	return {
		cases,
		files,
		totals: {
			tests: cases.length,
			pass: cases.filter((c) => c.status === 'pass').length,
			fail: cases.filter((c) => c.status === 'fail').length,
			skip: cases.filter((c) => c.status === 'skip').length,
		},
	};
}

/**
 * Run the parity tier and return its result set.
 *
 * The tier exits non-zero while it has reds — that is the whole premise here —
 * so the exit code is NOT the signal. A missing/empty report IS: it means the
 * runner never got to write one (a crash, a bad path), and the census throws
 * rather than reporting "nothing failed".
 */
/**
 * THE CHILD MUST MEASURE THE SAME TIER THE GENERATOR DOES.
 *
 * This census is spawned from two very different places: a plain
 * `bun run scripts/parity_baseline.ts`, and a GATE running inside `bun test`.
 * `Bun.spawnSync` inherits the parent env, and the unit tier's preload injects
 * PER-RUN seams — a session store path, a canonical-restore SKIP flag, run-scoped
 * diffusion table names. Inherited, those make the child replay against a corpus
 * that was never restored: measured 2026-08-24, the nested run reported 169 reds
 * the standalone run does not have, and 86 of the frozen ones as no longer
 * failing. A baseline is then only valid in the context it was cut in, which is
 * no baseline at all.
 *
 * So the per-run seams are STRIPPED and the child's own preload establishes them
 * freshly. What is deliberately KEPT is the addressing: the suite database
 * connection and the marked test media root, because the child must still refuse
 * to touch an installation.
 *
 * `ORACLE_MODE` is PINNED rather than defaulted: it only defaults to `fixtures`,
 * so a shell that once ran a harvest would silently make the census measure a
 * different tier than the baseline was frozen against.
 */
const PER_RUN_SEAMS = [
	'DEDALO_SESSION_DB_PATH',
	'DEDALO_TEST_SKIP_CANONICAL_RESTORE',
	'DEDALO_TEST_DB_DISABLE',
	'DIFFUSION_ACTIVITY_TABLE',
	'DIFFUSION_JOBS_TABLE',
	'DEDALO_TS_STATE_PATH',
] as const;

function childEnv(): Record<string, string | undefined> {
	const env: Record<string, string | undefined> = { ...process.env };
	for (const key of PER_RUN_SEAMS) delete env[key];
	env.ORACLE_MODE = 'fixtures';
	return env;
}

export function runParityTier(): ParityRun {
	const dir = mkdtempSync(join(tmpdir(), 'dedalo-parity-census-'));
	const outfile = join(dir, 'parity.junit.xml');
	try {
		const proc = Bun.spawnSync(
			['bun', 'test', TIER_PATH, '--reporter=junit', `--reporter-outfile=${outfile}`],
			{ cwd: REPO_ROOT, stdout: 'pipe', stderr: 'pipe', env: childEnv() },
		);
		let xml: string;
		try {
			xml = readFileSync(outfile, 'utf8');
		} catch {
			throw new Error(
				`parity_census: \`${TIER_COMMAND}\` wrote no JUnit report (exit ${proc.exitCode}). The tier did not run; the census refuses to report an empty result set.\n--- stderr tail ---\n${proc.stderr.toString().split('\n').slice(-25).join('\n')}`,
			);
		}
		const run = parseJunit(xml);
		if (run.totals.tests === 0) {
			throw new Error(
				`parity_census: \`${TIER_COMMAND}\` reported ZERO test cases (exit ${proc.exitCode}) — the tier is not being measured. Fix the runner, never the floor.`,
			);
		}
		return run;
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}
