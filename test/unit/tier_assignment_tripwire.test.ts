/**
 * TIER ASSIGNMENT — every test FILE has at least one EXECUTING home on a CI tier.
 *
 * P0-1 of the 2026-08-26 deep audit, gate 3 of 3. The three answer the same question at
 * three depths: `ci_workflow_tripwire` rule 3c asks "is every declared TRIPWIRE assigned
 * to a tier", `tier_execution_tripwire` asks "does the tier script actually run the array
 * it declares", and this one asks the question neither of them could see —
 * "does every test file belong to a tier AT ALL?"
 *
 * IT WAS NOT HYPOTHETICAL. Measured 2026-08-26: 803 test files existed, and 118 of them
 * were named in a tier array (85 hermetic + 33 db_tier). The other 685 — 85% of the
 * suite, including every DB-backed native gate written after the arrays stopped being
 * curated — executed on NO tier in CI. They were not failing; they were not running. A
 * gate nobody runs is a comment with an assertion in it, and the only signal that a
 * subsystem had lost its coverage was that nothing ever went red.
 *
 * THE FIX THAT THIS GATE HOLDS OPEN is that a tier may claim files two ways, and this
 * census accepts both:
 *
 *   1. BY NAME — the `*_TRIPWIRES=( … )` bash arrays in `scripts/ci/*.sh`. Explicit
 *      per-file membership, still the right shape for the hermetic tier, where the point
 *      is precisely that the list is short and credless.
 *   2. BY DIRECTORY — a {@link TierSpec}'s `paths`, which are the paths its runner hands
 *      to `bun test`. `UNIT_TIER` claims `test/unit` + `test/integration`, `PARITY_TIER`
 *      claims `test/parity`, and each runs under its shrink-only red baseline
 *      (scripts/lib/red_baseline.ts) so a whole-directory tier can block despite having
 *      frozen reds.
 *
 * WHY THE SPECS AND NOT THE SHELL. Directory coverage is read from the TierSpec exports,
 * never by re-parsing the stage lines in `db_tier.sh`. The spec is the same declaration
 * the runner consumes, so the census and the execution cannot disagree: repoint
 * `UNIT_TIER.paths` and this gate follows it in the same commit. Parsing the shell would
 * have made this file a second, drifting copy of the tier definition — and a census that
 * disagrees with the runner reports coverage that does not exist, which is the failure it
 * was written to end.
 *
 * BOTH HALVES ARE DERIVED, NEVER ENUMERATED. The arrays are found by scanning
 * `scripts/ci/` for `*_TRIPWIRES=(` (same rule as the sibling gate); the specs are found
 * by scanning `scripts/` for `export const <NAME>: TierSpec` and importing it. A third
 * tier — a new array, or a new baseline-ratcheted directory — joins this census on the
 * day it lands, with no edit here.
 *
 * THE HEALTHY STATE OF {@link NO_TIER_EXEMPT} IS EMPTY, and it is empty today. It exists
 * so that putting a test file deliberately outside CI is a written decision with a name
 * on it, not an omission; it is shrink-only and stale entries are red in both directions.
 */

import { describe, expect, test } from 'bun:test';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import type { TierSpec } from '../../scripts/lib/red_baseline.ts';

const ROOT = resolve(import.meta.dir, '../..');
const CI_DIR = join(ROOT, 'scripts/ci');
const SCRIPTS_DIR = join(ROOT, 'scripts');
const TEST_DIR = join(ROOT, 'test');

/**
 * Test files deliberately on NO tier. Each entry is a decision: the file exists, is a
 * `*.test.ts`, and is knowingly not executed by CI — say WHY, in a sentence a stranger
 * can act on. EMPTY IS THE HEALTHY STATE; the map is shrink-only ({@link EXEMPT_COUNT}),
 * and an entry that names a missing file, or a file that a tier has since claimed, fails
 * this gate rather than quietly rotting into fake coverage.
 */
const NO_TIER_EXEMPT: Record<string, string> = {};

/** PINNED. Shrink-only: this may go DOWN, never up. */
const EXEMPT_COUNT = 0;

/**
 * Anti-vacuity floor on the WALK. Measured 2026-08-29: 805 files (723 unit, 78 parity,
 * 4 integration). Well below it, so churn never trips it — but a walk that silently
 * stopped descending cannot pass by finding nothing. Fix the walk, never the floor.
 */
const TEST_FILE_FLOOR = 700;

/**
 * One file per covered tree, named literally. The floor above proves the walk found
 * MANY files; these prove it found files in all THREE roots, so a walk that lost a
 * whole directory — the exact shape of "685 files on no tier" — is red here and not
 * silently "covered" by an empty subtree.
 */
const WALK_ANCHORS = [
	'test/unit/tier_execution_tripwire.test.ts',
	'test/parity/activity_read_differential.test.ts',
	'test/integration/diffusion_publish_native.test.ts',
];

// ── the two derivations ──────────────────────────────────────────────────────

interface TierArray {
	file: string;
	name: string;
	entries: string[];
}

/**
 * The entries of a bash array literal, in declaration order.
 *
 * Deliberately a second small parser rather than an import from
 * `tier_execution_tripwire.test.ts`: importing one test file from another RE-REGISTERS
 * its describe blocks in this file's run, so the sibling's verdicts would be reported
 * twice and attributed to the wrong gate. The parsed grammar is four lines of bash and
 * is itself pinned by the sibling.
 */
function arrayEntries(source: string, name: string): string[] {
	const start = source.indexOf(`${name}=(`);
	const end = source.indexOf('\n)', start);
	if (start === -1 || end === -1) return [];
	return source
		.slice(start + name.length + 2, end)
		.split('\n')
		.map((line) => line.replace(/#.*$/, '').trim())
		.filter((line) => line.length > 0);
}

/** DERIVED: every `*_TRIPWIRES=(` array declared by a script in `scripts/ci/`. */
function discoverTierArrays(): TierArray[] {
	const arrays: TierArray[] = [];
	for (const entry of readdirSync(CI_DIR).sort()) {
		if (!entry.endsWith('.sh')) continue;
		const source = readFileSync(join(CI_DIR, entry), 'utf8');
		for (const match of source.matchAll(/^([A-Z0-9_]*TRIPWIRES)=\(/gm)) {
			const name = match[1];
			if (name === undefined) continue;
			arrays.push({ file: `scripts/ci/${entry}`, name, entries: arrayEntries(source, name) });
		}
	}
	return arrays;
}

interface TierSpecEntry {
	module: string;
	exportName: string;
	spec: TierSpec;
}

/**
 * DERIVED: every `export const <NAME>: TierSpec` in `scripts/`, imported for its real
 * `paths`. The source scan comes first so only the modules that actually declare a spec
 * are imported — the other `*_baseline.ts` scripts (crap, error_throw, generic_tld,
 * test_baseline) are unrelated harnesses and must not be executed by this census.
 */
async function discoverTierSpecs(): Promise<TierSpecEntry[]> {
	const found: TierSpecEntry[] = [];
	for (const entry of readdirSync(SCRIPTS_DIR).sort()) {
		if (!entry.endsWith('.ts')) continue;
		const path = join(SCRIPTS_DIR, entry);
		if (!statSync(path).isFile()) continue;
		const source = readFileSync(path, 'utf8');
		const names = [...source.matchAll(/^export const ([A-Za-z0-9_]+): TierSpec\b/gm)]
			.map((match) => match[1])
			.filter((name): name is string => name !== undefined);
		if (names.length === 0) continue;
		const module = (await import(path)) as Record<string, unknown>;
		for (const name of names) {
			const spec = module[name] as TierSpec | undefined;
			if (spec === undefined) continue;
			found.push({ module: `scripts/${entry}`, exportName: name, spec });
		}
	}
	return found;
}

/**
 * IS THIS SPEC ACTUALLY INVOKED BY A TIER? A declared spec is not an executing home.
 *
 * FOUND BY ADVERSARIAL REVIEW, 2026-08-29, and it was the whole gate: the first version
 * granted coverage for the mere EXISTENCE of an `export const X: TierSpec`. Delete the
 * one line in `db_tier.sh` that runs the unit tier and every assertion here still
 * passed — 723 files executing nowhere, reported green by the gate written to make that
 * exact state impossible. Symmetrically, any `scripts/*.ts` exporting a spec with
 * `paths: ['test']` would have granted the entire suite a home with nothing running.
 *
 * So a spec's directory claim counts only when some tier script actually RUNS its
 * module. The module path is the binding: `db_tier.sh` invokes
 * `bun run scripts/unit_baseline.ts --check`, and that string is what this looks for.
 */
function invokedModules(): Set<string> {
	const invoked = new Set<string>();
	for (const entry of readdirSync(CI_DIR).sort()) {
		if (!entry.endsWith('.sh')) continue;
		const source = readFileSync(join(CI_DIR, entry), 'utf8');
		for (const match of source.matchAll(/\b(?:bun run|bun)\s+(scripts\/[A-Za-z0-9_./-]+\.ts)/g)) {
			if (match[1] !== undefined) invoked.add(match[1]);
		}
	}
	return invoked;
}

/** Every `*.test.ts` under `test/`, repo-relative, sorted. */
function walkTests(dir: string, acc: string[] = []): string[] {
	for (const entry of readdirSync(dir).sort()) {
		const path = join(dir, entry);
		if (statSync(path).isDirectory()) walkTests(path, acc);
		else if (path.endsWith('.test.ts')) acc.push(relative(ROOT, path));
	}
	return acc;
}

const TIER_ARRAYS = discoverTierArrays();
const TIER_SPECS = await discoverTierSpecs();
const TEST_FILES = walkTests(TEST_DIR).sort();

/** Union of every file named BY NAME in a tier array. */
const NAMED = new Set(TIER_ARRAYS.flatMap((array) => array.entries));

const INVOKED_MODULES = invokedModules();

/** The specs a CI tier actually runs. A declared-but-uninvoked spec claims nothing. */
const EXECUTING_SPECS = TIER_SPECS.filter((entry) => INVOKED_MODULES.has(entry.module));

/** Union of every directory claimed by an EXECUTING TierSpec's `paths`. */
const CLAIMED_PATHS = EXECUTING_SPECS.flatMap((entry) =>
	entry.spec.paths.map((path) => ({ tier: entry.spec.id, path: path.replace(/\/+$/, '') })),
);

/** The tiers a file executes on — empty means it executes nowhere. */
function homesOf(file: string): string[] {
	const homes: string[] = [];
	for (const array of TIER_ARRAYS) if (array.entries.includes(file)) homes.push(array.name);
	for (const claim of CLAIMED_PATHS) {
		if (file === claim.path || file.startsWith(`${claim.path}/`)) homes.push(claim.tier);
	}
	return homes;
}

const UNCOVERED = TEST_FILES.filter((file) => homesOf(file).length === 0);

describe('the tier-assignment census is not vacuous', () => {
	test('the walk found the suite (a census over nothing proves nothing)', () => {
		// FIRST, and deliberately: without this every assertion below passes over an empty
		// set — the exact silence this gate exists to end, reproduced inside the gate.
		expect(
			TEST_FILES.length,
			`the walk under test/ found only ${TEST_FILES.length} test files`,
		).toBeGreaterThan(TEST_FILE_FLOOR);
		for (const anchor of WALK_ANCHORS) {
			expect(TEST_FILES, `the walk missed ${anchor} — a whole test tree is invisible`).toContain(
				anchor,
			);
		}
	});

	test('both derivations found something', () => {
		// A tier array scan that finds nothing, or a spec scan that imports nothing, would
		// make EVERY file uncovered rather than every file covered — loud either way, but
		// these say which half broke.
		expect(TIER_ARRAYS.map((array) => `${array.file}:${array.name}`)).toContain(
			'scripts/ci/hermetic.sh:HERMETIC_TRIPWIRES',
		);
		expect(TIER_ARRAYS.map((array) => `${array.file}:${array.name}`)).toContain(
			'scripts/ci/db_tier.sh:DB_TIER_TRIPWIRES',
		);
		expect(NAMED.size, 'the tier arrays name no files at all').toBeGreaterThan(50);
		// The two whole-directory tiers, by id. `unit` is the one that ended the 685.
		//
		// `toContain` and not `toEqual`: these are anti-vacuity anchors, not a closed
		// list. An exact pin here would mean a THIRD tier lands RED in this file until
		// somebody edits it — which contradicts the whole point of a derived census and
		// was exactly the contradiction an adversarial reviewer found in the first
		// version (the header promised open-endedness that two `toEqual`s denied).
		const ids = EXECUTING_SPECS.map((entry) => entry.spec.id).sort();
		for (const required of ['parity', 'unit']) {
			expect(
				ids,
				`the ${required} tier is no longer an EXECUTING spec: it is what gives a whole directory an executing home, so losing it orphans that directory`,
			).toContain(required);
		}
		const claimed = CLAIMED_PATHS.map((claim) => claim.path).sort();
		for (const required of ['test/integration', 'test/parity', 'test/unit']) {
			expect(claimed, `no executing tier claims ${required}`).toContain(required);
		}
	});

	test('every declared TierSpec is actually INVOKED by a tier script', () => {
		// A spec that no tier runs is a claim with nothing behind it. Listing it here
		// rather than silently dropping it is deliberate: the dangerous state is a spec
		// that LOOKS like coverage, and the failure must name it.
		const declaredButIdle = TIER_SPECS.filter((entry) => !INVOKED_MODULES.has(entry.module)).map(
			(entry) => `${entry.module} (${entry.exportName})`,
		);
		expect(
			declaredButIdle,
			`TierSpec(s) declared but run by no script in scripts/ci/:\n  ${declaredButIdle.join('\n  ')}\n` +
				'A spec grants its `paths` an executing home only because a tier RUNS it. Either wire it ' +
				'into a tier script (`bun run <module> --check`) or delete it — a spec nothing invokes is ' +
				'coverage on paper.',
		).toEqual([]);
		// And the binding actually resolved, or the filter above is vacuous.
		expect(INVOKED_MODULES.size, 'no tier script invokes any scripts/*.ts').toBeGreaterThan(0);
		expect(INVOKED_MODULES).toContain('scripts/unit_baseline.ts');
		expect(INVOKED_MODULES).toContain('scripts/parity_baseline.ts');
	});
});

describe('every test file has an EXECUTING home on a tier', () => {
	test('no test file executes on no tier', () => {
		const orphans = UNCOVERED.filter((file) => NO_TIER_EXEMPT[file] === undefined);
		expect(
			orphans,
			`Test file(s) that no CI tier executes:\n  ${orphans.join('\n  ')}\n` +
				'A test nobody runs is a comment with an assertion in it. Give each one a home, either:\n' +
				'  (1) BY NAME — add it to a `*_TRIPWIRES=( … )` array in scripts/ci/ (hermetic if it needs no DB);\n' +
				"  (2) BY DIRECTORY — put it under a directory a TierSpec already claims (UNIT_TIER: test/unit, test/integration; PARITY_TIER: test/parity), or add its directory to a spec's `paths`.\n" +
				'Only if it must NOT run in CI does it belong in NO_TIER_EXEMPT, with a written reason.',
		).toEqual([]);
	});

	test('the tier arrays name only files that exist', () => {
		// A renamed or deleted test silently dropping off a tier is "runs nowhere" in
		// another spelling — and bun test exits 0 on a path that matches nothing, so the
		// tier stays green while its gate is gone.
		const missing: string[] = [];
		for (const array of TIER_ARRAYS) {
			for (const entry of array.entries) {
				if (!existsSync(join(ROOT, entry))) missing.push(`${array.file}:${array.name} → ${entry}`);
			}
		}
		expect(
			missing,
			`Tier array entr(ies) naming a file that does not exist:\n  ${missing.join('\n  ')}\n` +
				'The gate was renamed or deleted; fix the array in the same commit.',
		).toEqual([]);
	});
});

describe('the no-tier exemption list is shrink-only and never stale', () => {
	test('every exemption carries a real reason', () => {
		for (const [file, reason] of Object.entries(NO_TIER_EXEMPT)) {
			expect(reason.length, `${file}: the reason is too short to be a reason`).toBeGreaterThan(40);
		}
	});

	test('no exemption names a file that no longer exists', () => {
		const gone = Object.keys(NO_TIER_EXEMPT).filter((file) => !existsSync(join(ROOT, file)));
		expect(
			gone,
			`Exemption(s) for deleted file(s):\n  ${gone.join('\n  ')}\nDrop the row and lower EXEMPT_COUNT.`,
		).toEqual([]);
	});

	test('no exemption names a file that a tier now runs', () => {
		// Staleness the other way: an exemption over a covered file reads as a decision to
		// exclude something CI is in fact executing — the map would then describe a suite
		// that does not exist.
		const covered = Object.keys(NO_TIER_EXEMPT).filter((file) => homesOf(file).length > 0);
		expect(
			covered,
			`Exemption(s) for file(s) a tier now executes:\n  ${covered
				.map((file) => `${file} (on ${homesOf(file).join(', ')})`)
				.join('\n  ')}\nDrop the row and lower EXEMPT_COUNT.`,
		).toEqual([]);
	});

	test('the exemption list is SHRINK-ONLY', () => {
		const count = Object.keys(NO_TIER_EXEMPT).length;
		expect(
			count,
			`NO_TIER_EXEMPT grew (${count} > ${EXEMPT_COUNT}). A new test file gets a tier, not an exemption — an exemption is the decision that CI will never run this gate.`,
		).toBeLessThanOrEqual(EXEMPT_COUNT);
		expect(
			count,
			`NO_TIER_EXEMPT shrank to ${count} — lower EXEMPT_COUNT to match, so the ratchet keeps biting.`,
		).toBe(EXEMPT_COUNT);
	});
});
