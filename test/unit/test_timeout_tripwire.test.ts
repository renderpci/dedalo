/**
 * THE PER-TEST TIMEOUT HAS ONE VALUE, AND EVERY `bun test` INVOCATION CARRIES IT
 * (DEC-12, 2026-08-25).
 *
 * WHAT THIS GUARDS. `scripts/lib/test_flags.ts` exports TEST_TIMEOUT_MS = 30000
 * and TEST_TIMEOUT_FLAG = "--timeout=30000". Every TypeScript site that spawns
 * `bun test` imports the constant, but package.json (JSON has no imports), the
 * CI shell tiers (`scripts/ci/hermetic.sh`, `scripts/ci/db_tier.sh`) and the
 * self-hosted workflow YAMLs carry the LITERAL — a hand copy. A hand-copied
 * constant is exactly the drift this codebase tripwires: edit TEST_TIMEOUT_MS
 * and, without this gate, five call sites silently keep running under the old
 * number, each one a different answer to "what is the suite's timeout?". Every
 * literal's comment promises this gate exists; this file is that promise kept.
 *
 * THE MEASURED INCIDENT. Until 2026-08-25 the number lived in bunfig.toml as
 * `[test] timeout = 30000` — and Bun 1.4.0 (the version pinned in .bun-version)
 * SILENTLY IGNORES that key. Proven in a sandbox: a test that sleeps 8 s under
 * that exact bunfig died at 5001.50 ms with "this test timed out after 5000ms";
 * the same test run as `bun test --timeout=30000` passed in 8.01 s. Only the
 * CLI flag is honoured, and Bun prints no warning about the unread key. The
 * repo spent its recorded history measuring baselines under a 5000 ms cap
 * nobody chose, ~375 test files grew per-test `, 30000)` workaround arguments,
 * and at least one long-standing "race flake" was never a race (the
 * `dd_diffusion_api … crash recovery` gate fired at 5001.33 ms against its own
 * 15000 ms internal deadline). Rule 1 below keeps the dead key from coming
 * back: a re-added `timeout =` in bunfig.toml is a second source of truth that
 * nothing reads today and that a FUTURE Bun might start reading — either way a
 * stated-but-unenforced invariant, which DEC-12 forbids.
 *
 * THE DAEMON EXEMPTION (ratified decision 3(b), verified against the files on
 * disk 2026-08-25). The two isolated publication packages run `bun test` BARE,
 * on purpose, at four sites (DAEMON_EXEMPT below): publication/site_builder has
 * NO bunfig.toml AT ALL, and publication/server_api/v2's declares only
 * install/coverage/run keys — neither ever chose a 30000 timeout, so unlike the
 * root suite they are not losing a number they picked. Their green baselines
 * (253 tests in server_api/v2) were measured under Bun's built-in 5000 ms cap;
 * widening them on no evidence would silently LOOSEN a gate. The exemption is
 * named, reasoned and LIVE: an exempt site that disappears, or that gains the
 * flag, is red — the decision gets revisited, never rots. And rule 5 pins the
 * exemption's own premise: the day a daemon bunfig declares a `timeout` key,
 * "they never chose one" stops being true and this gate says so.
 *
 * WHAT THIS DOES NOT PROVE, stated plainly:
 *  - It proves the flag is PRESENT and equal to the constant, not that 30000 ms
 *    is the right number, nor that any test finishes inside it.
 *  - The TS scan convicts only the two shapes that actually EXECUTE — the Bun
 *    shell template ($`bun test …`) and the spawn argv (['bun','test',…]).
 *    A `bun test` inside an ordinary quoted string is PROSE printed to a human
 *    (scripts/vendor_fetch.ts's "next steps" text, test_db_setup's ready
 *    banner) and is deliberately not censused; the one load-bearing string,
 *    parity_census's TIER_COMMAND, gets its own targeted assertion instead.
 *  - It cannot see a computed invocation (argv assembled from variables it does
 *    not recognise); no such site exists today, and the anti-vacuity floor
 *    means a refactor that hides ALL invocations from the scan is red, not
 *    green.
 *  - It does not re-run the sandbox measurement: that Bun 1.4.0 ignores the
 *    bunfig key is a recorded fact of the pinned version, re-checkable the day
 *    the pin moves, not something this gate proves on every run.
 */

import { describe, expect, test } from 'bun:test';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { TEST_TIMEOUT_FLAG, TEST_TIMEOUT_MS } from '../../scripts/lib/test_flags.ts';

const ROOT = join(import.meta.dir, '..', '..');
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');

// The ONE value, derived from the imported constant — never re-typed. Every
// literal in the census below is compared against THIS string, so editing
// TEST_TIMEOUT_MS reddens every stale copy at once.
const EXPECTED_FLAG = `--timeout=${TEST_TIMEOUT_MS}`;

/**
 * The named daemon exemption (see header). Keyed file + signature substring:
 * the signature must still be present in the file (the exemption is LIVE — a
 * removed site is a stale row, red) and the line carrying it must still be
 * flagless (a site that gained the flag no longer needs excusing, red too).
 */
const DAEMON_EXEMPT: ReadonlyArray<{ file: string; signature: string; reason: string }> = [
	{
		file: 'scripts/ci/hermetic.sh',
		signature: 'bun install --frozen-lockfile && bunx tsc --noEmit && bun test',
		reason:
			'daemon_gate(): runs each publication package IN its own directory under its own ' +
			'bunfig; neither bunfig ever declared 30000 and both baselines were cut under the ' +
			'built-in 5000 ms cap — widening on no evidence silently loosens the gate.',
	},
	{
		file: 'scripts/verify.ts',
		signature: 'cd publication/site_builder && bunx tsc --noEmit && bun test',
		reason:
			'site_builder stage: same package, same cut-under-5000ms baseline as the ' +
			'hermetic.sh daemon_gate site; the two comments cross-reference each other.',
	},
	{
		file: 'package.json',
		signature: 'cd publication/server_api/v2 && bunx tsc --noEmit && bun test',
		reason:
			'test:publication script — the developer entry point to the SAME daemon suite ' +
			'hermetic.sh daemon_gate runs; a flag here and not there would make the local run ' +
			'and CI disagree about the cap.',
	},
	{
		file: 'package.json',
		signature: 'cd publication/site_builder && bunx tsc --noEmit && bun test',
		reason:
			'test:sitebuilder script — developer entry point to the site_builder daemon suite; ' +
			'same rationale as test:publication.',
	},
];

const isExempt = (file: string, line: string) =>
	DAEMON_EXEMPT.some((e) => e.file === file && line.includes(e.signature));

// ---------------------------------------------------------------------------
// Matchers. Plain in-file functions that rule 4's positive controls drive
// directly — a matcher proven against a planted good AND bad line cannot go
// quietly vacuous.
// ---------------------------------------------------------------------------

/** A line-comment-aware "does this LINE run `bun test`" test for shell/YAML. */
function shellLineInvokesBunTest(rawLine: string): boolean {
	// Drop a whole-line or trailing `#` comment. A `#` inside quotes is not a
	// comment in shell, but no censused line quotes one; the conservative cut
	// only risks a MISS on such a line, and the anti-vacuity floor bounds how
	// many misses the scan can absorb before going red.
	const code = rawLine.replace(/(^|\s)#.*$/, '');
	return /\bbun test\b/.test(code);
}

/** Compliance for one invocation line: carries the ONE flag value. */
function lineCarriesFlag(line: string): boolean {
	return line.includes(EXPECTED_FLAG) || line.includes('TEST_TIMEOUT_FLAG');
}

/** Strip TS block + line comments (string-blind, adequate for these files). */
function stripTsComments(src: string): string {
	return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
}

type Invocation = { file: string; line: string; compliant: boolean; exempt: boolean };

/**
 * Census the two TS shapes that EXECUTE `bun test`:
 *  (a) the Bun shell template — $`…bun test…` (verify.ts, both stages);
 *  (b) the spawn argv — 'bun' followed by 'test' as adjacent array entries
 *      (oracle_harvest single-line, parity_census multi-line), judged on a
 *      forward WINDOW because the flag entry sits lines below the 'bun'.
 */
function censusTsFile(file: string, src: string): Invocation[] {
	const out: Invocation[] = [];
	const stripped = stripTsComments(src);
	// (a) shell templates — the template is single-line at both live sites; a
	// multi-line template would be missed here and caught by the floor.
	for (const line of stripped.split('\n')) {
		if (/\$`[^`]*\bbun test\b/.test(line)) {
			out.push({
				file,
				line: line.trim(),
				compliant: lineCarriesFlag(line),
				exempt: isExempt(file, line),
			});
		}
	}
	// (b) argv shape, cross-line: judge a 400-char forward window from the
	// match — wide enough to cover parity_census's one-entry-per-line argv,
	// narrow enough that a flag in an UNRELATED later statement cannot acquit.
	const argvRe = /['"]bun['"]\s*,\s*['"]test['"]/g;
	for (const m of stripped.matchAll(argvRe)) {
		const window = stripped.slice(m.index, m.index + 400);
		out.push({
			file,
			line: (window.split('\n')[0] ?? '').trim(),
			compliant: window.includes(EXPECTED_FLAG) || window.includes('TEST_TIMEOUT_FLAG'),
			exempt: isExempt(file, window),
		});
	}
	return out;
}

/** Recursive file listing under a repo-relative root, filtered by extension. */
function filesUnder(rel: string, exts: string[]): string[] {
	const out: string[] = [];
	const walk = (abs: string) => {
		for (const name of readdirSync(abs)) {
			const p = join(abs, name);
			if (statSync(p).isDirectory()) {
				if (name === 'node_modules') continue;
				walk(p);
			} else if (exts.some((e) => name.endsWith(e))) {
				out.push(relative(ROOT, p));
			}
		}
	};
	walk(join(ROOT, rel));
	return out;
}

/** The full census: every `bun test` invocation the scan can see, repo-wide. */
function censusAll(): Invocation[] {
	const out: Invocation[] = [];

	// package.json scripts — parsed, not grepped: only script VALUES can run.
	const pkg = JSON.parse(read('package.json')) as { scripts: Record<string, string> };
	for (const [name, cmd] of Object.entries(pkg.scripts)) {
		if (/\bbun test\b/.test(cmd)) {
			out.push({
				file: 'package.json',
				line: `${name}: ${cmd}`,
				compliant: cmd.includes(EXPECTED_FLAG),
				exempt: isExempt('package.json', cmd),
			});
		}
	}

	// Shell scripts + workflow YAMLs + .gitlab-ci.yml — line-based.
	const lineFiles = [
		...filesUnder('scripts', ['.sh']),
		...filesUnder('.github/workflows', ['.yml', '.yaml']),
		...filesUnder('.github/workflows-selfhosted', ['.yml', '.yaml']),
		'.gitlab-ci.yml',
	];
	for (const file of lineFiles) {
		for (const line of read(file).split('\n')) {
			if (shellLineInvokesBunTest(line)) {
				out.push({
					file,
					line: line.trim(),
					compliant: lineCarriesFlag(line),
					exempt: isExempt(file, line),
				});
			}
		}
	}

	// TypeScript under scripts/ — the two executing shapes only (see header).
	for (const file of filesUnder('scripts', ['.ts'])) {
		out.push(...censusTsFile(file, read(file)));
	}

	return out;
}

describe('test_timeout_tripwire: one timeout value, carried everywhere it runs', () => {
	// Rule 0 — the two exported forms agree with each other. If TEST_TIMEOUT_FLAG
	// were ever hand-edited away from TEST_TIMEOUT_MS the whole census would be
	// comparing against a lie.
	test('TEST_TIMEOUT_FLAG is derived from TEST_TIMEOUT_MS', () => {
		expect(TEST_TIMEOUT_FLAG).toBe(EXPECTED_FLAG);
		expect(Number.isInteger(TEST_TIMEOUT_MS) && TEST_TIMEOUT_MS > 0).toBe(true);
	});

	// Rule 1 — bunfig.toml declares NO live `timeout` key. Bun 1.4.0 ignores it
	// (5001.50 ms kill vs 8.01 s pass — see header), so a re-added key is a
	// stated-but-unenforced invariant today and a SECOND source of truth the day
	// a future Bun starts honouring it.
	test('bunfig.toml has no live timeout key (comments may narrate, never declare)', () => {
		const lines = read('bunfig.toml').split('\n');
		const live = lines.filter((l) => /^\s*timeout\s*=/.test(l));
		expect(
			live,
			'bunfig.toml declares a `timeout` key. Bun 1.4.0 silently ignores it; the number ' +
				'lives in scripts/lib/test_flags.ts and travels on the CLI. Delete the key.',
		).toEqual([]);
		// Positive control for THIS matcher: a planted live key is caught, a
		// commented one is not.
		expect(/^\s*timeout\s*=/.test('timeout = 30000')).toBe(true);
		expect(/^\s*timeout\s*=/.test('# timeout = 30000')).toBe(false);
	});

	// Rule 2 — the census: every non-exempt invocation carries the ONE value.
	test('every bun test invocation carries the flag from scripts/lib/test_flags.ts', () => {
		const census = censusAll();
		const offenders = census.filter((i) => !i.compliant && !i.exempt);
		expect(
			offenders.map((i) => `${i.file}: ${i.line}`),
			`bun test invocation(s) without ${EXPECTED_FLAG}. Bun 1.4.0 ignores bunfig's ` +
				'[test] timeout, so a flagless run silently reverts to the built-in 5000 ms ' +
				'cap. Import TEST_TIMEOUT_FLAG (TS) or copy the literal with a source-of-truth ' +
				'comment (shell/JSON/YAML) — or, for a genuinely separate suite, add a ' +
				'DAEMON_EXEMPT-style named exemption HERE with its reason.',
		).toEqual([]);

		// A compliant-AND-exempt site is a contradiction: the exemption row is
		// stale, the site adopted the flag — delete the row so the census owns it.
		const overExcused = census.filter((i) => i.compliant && i.exempt);
		expect(
			overExcused.map((i) => `${i.file}: ${i.line}`),
			'exempt site now carries the flag — its DAEMON_EXEMPT row is stale, delete it',
		).toEqual([]);
	});

	// Rule 3 — anti-vacuity floor. Measured 2026-08-25: 12 invocations —
	// package.json ×3 (test, test:publication, test:sitebuilder), hermetic.sh ×2
	// (tripwire run + daemon_gate), db_tier.sh ×1, nightly.yml ×1,
	// selfhosted.yml ×1, verify.ts ×2 (runTestFiles + site_builder stage),
	// oracle_harvest.ts ×1 (argv), parity_census.ts ×1 (argv). A scan finding
	// fewer than 10 has lost sight of real call sites and is itself the defect.
	test('the census floor holds — an emptied or blinded scan is red, not green', () => {
		const census = censusAll();
		expect(census.length).toBeGreaterThanOrEqual(10);
		// The four daemon rows are exactly the exempt population.
		expect(census.filter((i) => i.exempt).length).toBe(DAEMON_EXEMPT.length);
	});

	// Rule 4 — positive controls: the matcher convicts a planted bare line and
	// acquits a planted compliant one, in every censused shape.
	test('positive controls: the matcher rejects a flagless line and accepts a flagged one', () => {
		// Shell/YAML shape.
		const bare = 'bun test foo.test.ts';
		const flagged = `bun test ${EXPECTED_FLAG} foo.test.ts`;
		expect(shellLineInvokesBunTest(bare)).toBe(true);
		expect(lineCarriesFlag(bare)).toBe(false);
		expect(shellLineInvokesBunTest(flagged)).toBe(true);
		expect(lineCarriesFlag(flagged)).toBe(true);
		// Comment lines are prose, not invocations.
		expect(shellLineInvokesBunTest('# run `bun test` to see it')).toBe(false);
		// TS shell-template shape.
		const tsBare = censusTsFile('ctl.ts', 'await $`bun test test/unit/x.test.ts`.quiet();');
		expect(tsBare.length).toBe(1);
		expect(tsBare[0]?.compliant).toBe(false);
		const tsFlag = censusTsFile('ctl.ts', 'await $`bun test ${TEST_TIMEOUT_FLAG} x`.quiet();');
		expect(tsFlag.length).toBe(1);
		expect(tsFlag[0]?.compliant).toBe(true);
		// TS argv shape, flag entries lines below the match.
		const argvBare = censusTsFile('ctl.ts', "Bun.spawnSync(['bun', 'test',\n 'x.test.ts']);");
		expect(argvBare.length).toBe(1);
		expect(argvBare[0]?.compliant).toBe(false);
		const argvFlag = censusTsFile(
			'ctl.ts',
			"Bun.spawnSync(['bun', 'test',\n TEST_TIMEOUT_FLAG,\n 'x.test.ts']);",
		);
		expect(argvFlag.length).toBe(1);
		expect(argvFlag[0]?.compliant).toBe(true);
		// A `bun test` inside plain prose text is not an argv/template shape.
		expect(
			censusTsFile('ctl.ts', "console.log('Next: bun test test/unit/x.test.ts');").length,
		).toBe(0);
	});

	// Rule 5 — the daemon exemption is LIVE and its premise still holds.
	test('every DAEMON_EXEMPT row names a real, still-flagless site with a reason', () => {
		for (const e of DAEMON_EXEMPT) {
			const src = read(e.file);
			expect(
				src.includes(e.signature),
				`${e.file}: exempt signature gone — the site moved or died; update or delete the row:\n  ${e.signature}`,
			).toBe(true);
			const line = src.split('\n').find((l) => l.includes(e.signature)) ?? '';
			expect(
				lineCarriesFlag(line),
				`${e.file}: exempt site now carries the flag — delete its DAEMON_EXEMPT row`,
			).toBe(false);
			expect(e.reason.length).toBeGreaterThan(40); // substantive, never a stub
		}
		// The premise: neither daemon package's bunfig declares a timeout — as of
		// 2026-08-25 site_builder has NO bunfig file and server_api/v2's declares
		// only install/coverage/run keys. The day one grows a `timeout` key, "they
		// never chose a number" is false and the exemption must be re-decided, not
		// silently kept. An ABSENT bunfig satisfies the premise trivially.
		for (const bunfig of [
			'publication/site_builder/bunfig.toml',
			'publication/server_api/v2/bunfig.toml',
		]) {
			if (!existsSync(join(ROOT, bunfig))) continue; // no file = no declared timeout
			const live = read(bunfig)
				.split('\n')
				.filter((l) => /^\s*timeout\s*=/.test(l));
			expect(
				live,
				`${bunfig} now declares a timeout — the DAEMON_EXEMPT rationale is stale, revisit decision 3(b)`,
			).toEqual([]);
		}
	});

	// Rule 6 — the one load-bearing STRING: parity_census's TIER_COMMAND is what
	// its error messages tell a developer to run, and Lane A deliberately put the
	// flag in it so the census and a developer's reproduction agree. A drifted
	// TIER_COMMAND would send a human to re-measure under the WRONG cap.
	test('parity_census TIER_COMMAND interpolates TEST_TIMEOUT_FLAG', () => {
		const src = stripTsComments(read('scripts/lib/parity_census.ts'));
		const decl = src.split('\n').find((l) => l.includes('TIER_COMMAND ='));
		expect(decl, 'scripts/lib/parity_census.ts: TIER_COMMAND declaration not found').toBeDefined();
		expect(decl as string).toContain('${TEST_TIMEOUT_FLAG}');
	});
});
