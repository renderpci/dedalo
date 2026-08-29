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
import { TEST_TIMEOUT_FLAG } from './test_flags.ts';

export const REPO_ROOT = join(import.meta.dir, '..', '..');

/** The tier under ratchet. One string, so a re-point is one edit. */
export const TIER_PATH = 'test/parity';

/**
 * The exact command the census runs (also quoted in failure messages).
 *
 * THE TIMEOUT IS PART OF THE MEASURE. Bun 1.4.0 ignores bunfig.toml's
 * `[test] timeout`, so a bare `bun test` runs under the built-in 5000 ms cap
 * while `bun run test` (and verify, and the CI tiers) now pass 30000 ms. If the
 * census kept the 5000 ms cap, the frozen parity floor and a developer's own run
 * would disagree about which parity tests are red — a slow gate would be red in
 * the ratchet and green on the desk, which makes the ratchet a liar. Same
 * constant, one import: scripts/lib/test_flags.ts.
 */
export const TIER_COMMAND = `bun test ${TIER_PATH} ${TEST_TIMEOUT_FLAG}`;

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
 * freshly.
 *
 * THE ADDRESSING MUST BE STRIPPED TOO — and keeping it was the whole bug
 * (diagnosed 2026-08-24). `test/preload/test_database.ts` REWRITES `DB_NAME` to
 * the suite database. So when the parent is itself `bun test`, the child inherits
 * `DB_NAME=<app>_test` and `testDatabaseName()` derives `<app>_test_test` — a
 * database that does not exist. Every DB-backed parity gate then dies, some at
 * module scope, which is exactly the recorded signature: a flood of reds the
 * standalone run does not have, PLUS frozen ones reported as "no longer failing"
 * because their file never reported at all. `test_media_root.ts` doubles
 * identically; the stray `../private/test_media/<app>_test_test/` tree those runs
 * left behind is that bug's debris.
 *
 * That is why stripping the six seams alone never closed the gap: the offending
 * keys were in the KEPT set, protected by the reasoning below — which is sound
 * about the goal and wrong about the mechanism. Refusing to touch an
 * installation is enforced by the child's OWN preloads, which unconditionally
 * repoint away from the app DB and arm the media-marker guard. It was never the
 * inherited env doing it. An operator's explicit `DEDALO_TEST_DATABASE` survives
 * the strip and short-circuits the derivation, so that path is unchanged.
 *
 * `ORACLE_MODE` is PINNED rather than defaulted: it only defaults to `fixtures`,
 * so a shell that once ran a harvest would silently make the census measure a
 * different tier than the baseline was frozen against.
 *
 * EXPORTED because `scripts/test_baseline.ts` spawns child `bun test` runs with
 * exactly the same launch-context hazard (a parent test run's rewritten DB_NAME
 * derives `<app>_test_test` in the child) and must strip exactly the same keys.
 * One list, one strip function — a seam added here protects both spawners; a
 * second copy would drift the day the next seam key lands.
 */
export const PER_RUN_SEAMS = [
	'DEDALO_SESSION_DB_PATH',
	'DEDALO_TEST_SKIP_CANONICAL_RESTORE',
	'DEDALO_TEST_DB_DISABLE',
	'DIFFUSION_ACTIVITY_TABLE',
	'DIFFUSION_JOBS_TABLE',
	'DEDALO_TS_STATE_PATH',
	// The addressing keys: inherited from a parent `bun test` these are ALREADY
	// the suite's, and re-deriving on top of them doubles the `_test` suffix.
	'DB_NAME',
	'DEDALO_DATABASE_CONN',
	'DEDALO_TEST_MEDIA_ROOT',
] as const;

export function childEnv(): Record<string, string | undefined> {
	const env: Record<string, string | undefined> = { ...process.env };
	for (const key of PER_RUN_SEAMS) delete env[key];
	env.ORACLE_MODE = 'fixtures';
	// The marker the recursion guard in `runTier` reads. Set on the CHILD, so a census
	// that spawns a tier containing its own caller is refused one level down instead of
	// forking forever.
	env.DEDALO_TIER_CENSUS_RUNNING = '1';
	return env;
}

export function runParityTier(): ParityRun {
	return runTier([TIER_PATH]);
}

/**
 * Run ANY tier under the JUnit reporter and parse it. Generalized from
 * `runParityTier` when the unit tier needed the same measure (P0-1, 2026-08-29) —
 * one runner, so the seam-stripping (`childEnv`) and the timeout can never differ
 * between two tiers that are both meant to be ratcheted the same way.
 */
export function runTier(paths: string[]): ParityRun {
	// RECURSION GUARD. A tier whose `paths` include `test/unit` measures the very
	// directory every gate lives in, so a gate that CALLS this — the natural
	// `unit_baseline_tripwire` twin of `parity_baseline_tripwire` — would spawn a child
	// `bun test test/unit`, which runs that gate again, which spawns another: unbounded,
	// at roughly five minutes per level. The parity tier is safe only by accident of
	// layout (its paths are `test/parity` while its gate lives in `test/unit`), so the
	// guard belongs here rather than in either instance.
	//
	// Found by adversarial review 2026-08-29, before such a gate was written.
	if (process.env.DEDALO_TIER_CENSUS_RUNNING === '1') {
		throw new Error(
			`tier_census: refusing to run \`bun test ${paths.join(' ')}\` from inside a tier census that is already running. A tier whose paths contain the directory its own gate lives in would recurse without bound; if you are writing that gate, it must read the frozen baseline rather than re-measure the tier.`,
		);
	}
	const dir = mkdtempSync(join(tmpdir(), 'dedalo-tier-census-'));
	const outfile = join(dir, 'tier.junit.xml');
	try {
		const proc = Bun.spawnSync(
			[
				'bun',
				'test',
				...paths,
				TEST_TIMEOUT_FLAG,
				'--reporter=junit',
				`--reporter-outfile=${outfile}`,
			],
			{ cwd: REPO_ROOT, stdout: 'pipe', stderr: 'pipe', env: childEnv() },
		);
		let xml: string;
		try {
			xml = readFileSync(outfile, 'utf8');
		} catch {
			throw new Error(
				`tier_census: \`bun test ${paths.join(' ')} ${TEST_TIMEOUT_FLAG}\` wrote no JUnit report (exit ${proc.exitCode}). The tier did not run; the census refuses to report an empty result set.\n--- stderr tail ---\n${proc.stderr.toString().split('\n').slice(-25).join('\n')}`,
			);
		}
		const run = parseJunit(xml);
		if (run.totals.tests === 0) {
			throw new Error(
				`tier_census: \`bun test ${paths.join(' ')} ${TEST_TIMEOUT_FLAG}\` reported ZERO test cases (exit ${proc.exitCode}) — the tier is not being measured. Fix the runner, never the floor.`,
			);
		}
		return run;
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}
