/**
 * GENERIC-TLD TRIPWIRE — the set of GATE files that bind a specific-install
 * ontology TLD may only SHRINK.
 *
 * ── WHAT IT GUARDS ───────────────────────────────────────────────────────────
 * AGENTS.md hard rules (2026-08-19): a test uses the generic `test` TLD and
 * BUILDS the situation it tests (src/core/test_data/situations); it never
 * binds a specific install's TLD (`numisdata`, `rsc`, `oh`, `tch`, `tchi`,
 * `ich`, `mdcat`, `zenon`, `dmm`, `cult`…). Such a gate is green on the machine
 * that holds that install's records and red on every other — the parity tier
 * was 208-red on the suite DB for exactly this reason (2026-08-18), and that
 * noise hid a real regression (WC-034 addendum, `search_options`).
 *
 * On adoption day 307 of 722 test files bound an install TLD. A flat gate
 * cannot pass; this is a SHRINK-ONLY RATCHET on the FILE SET, frozen in
 * engineering/generic_tld_baseline.json: a listed file may only lose TLDs or
 * leave the list; an unlisted file may bind NONE.
 *
 * ── ONE IMPLEMENTATION OF THE MEASURE ────────────────────────────────────────
 * This gate COMPUTES NOTHING. It imports scripts/lib/tld_census.ts (the
 * measure) through scripts/generic_tld_baseline.ts (the generator / drift
 * checker). A second implementation would make the ratchet worthless.
 *
 * ── THE RULES (mirrored from error_throw_ratchet) ─────────────────────────────
 *  1. SHRINK-ONLY: no file may bind a TLD its entry does not list; no new file
 *     may bind any. The generator REFUSES to absorb growth without
 *     `--allow-regression`; the commit message must say why.
 *  2. STALENESS = FAILURE: a file now binding fewer TLDs than its entry, or an
 *     entry for a file that is gone, is RED — otherwise the ratchet loosens
 *     silently. The one fix: `bun run scripts/generic_tld_baseline.ts`.
 *  3. NEW FILES BIND NOTHING: frozen debt is a legacy fact; new debt is a choice.
 *  4. ANTI-VACUITY: a floor on files scanned, and the token grammar is
 *     self-tested (a comment must NOT count, a string binding MUST).
 *  5. INVARIANT SANITY: `test`, `dd`, `hierarchy`, `ontology`, `ontologytype`,
 *     `lg` can never be denied — a careless INSTALL_TLDS addition cannot flip
 *     the whole suite red.
 *
 * ── HOW TO LOWER THE COUNT ───────────────────────────────────────────────────
 * Rebuild the test on the generic TLD: declare its structure as a situation
 * (`situation({tld:'zz…', nodes, records})`, ensure/drop), or use the
 * playground `test3` for what it already carries; then re-run the generator
 * and commit the JSON with the change. Never edit the JSON by hand; never add
 * a file to get green.
 *
 * ── THE MEASURED TREES (widened 2026-08-22) ──────────────────────────────────
 * `test/**\/*.test.ts` (unit + parity), `client/dedalo/test/client/js/**\/*.js`
 * (the browser suite) and `src/core/test_data/**\/*.ts` (the test-data writers)
 * — SCAN_ROOTS in scripts/lib/tld_census.ts. The last two were added after a
 * client gate (`test_additional_text_area.js`) was found binding the `dmm`
 * install's demo ontology, propped up by a `src/core/test_data` fixture that
 * PROVISIONED it, both invisible to a census that only looked at `*.test.ts`.
 * A census that cannot see a tree is not evidence about that tree.
 *
 * ── HONEST LIMITATIONS ───────────────────────────────────────────────────────
 *  - It measures TIPO tokens (`<tld><digits>`), comments blanked. A test that
 *    reaches an install's records through a helper WITHOUT naming a tipo is
 *    outside it (a helper is scanned only if it lives in a measured tree).
 *  - INSTALL_TLDS is a KNOWN list, grow-only. An install TLD nobody has named
 *    yet is not denied until it is added there.
 *  - `fixtures/` path segments are excluded everywhere (they are data, reached
 *    through gates), as is `node_modules`.
 *  - A CONSTRUCTED token is invisible: `'numis' + 'data1'`, `` `numis${'data1'}` ``
 *    and `seed('rsc', 170)` all produce an install tipo the scan cannot see.
 *    That is deliberate — the migrated gates use `seed()` to say "this is a
 *    SEED-SHIPPED reference, not an install binding", and three parity gates
 *    build a token whose bytes are part of a frozen fixture they must match.
 *    But it is a door: `seed('numisdata', 6)` would sail through. The rule the
 *    census cannot enforce, and a reviewer must: `seed()` is for the
 *    seed-shipped TLDs (rsc, dd, hierarchy, ontology, ontologytype, lg) ONLY.
 *  - A STRUCTURAL binding through a shared helper is invisible for the same
 *    reason as the first bullet, and there are live instances: the observer
 *    gates measure census-clean while reaching `on1`/`rsc205`/`rsc387` at
 *    runtime through `test/helpers/observer_term_seed.ts`. So a "N files bind"
 *    answer is N TEXTUAL bindings, never a count of gates that touch an
 *    install's shape.
 *
 * ── THE DATA SIDE (added 2026-08-25) ─────────────────────────────────────────
 * The law has TWO surfaces: what the tests NAME (the source ratchet above) and
 * what the suite database HOLDS. Until 2026-08-25 only the first was enforced,
 * and that is exactly how 7.4 GiB of records no test could name — 150
 * glob-installed country hierarchies, 97.6% of the 7612 MB fixture — sat
 * inside the suite database while this gate reported green: an invariant
 * enforced on one of its two surfaces is half a tripwire. The last describe
 * block therefore asks the DATABASE: every distinct `matrix_hierarchy`
 * section_tipo must belong to the generic families (the INVARIANT_TLDS —
 * test/dd/hierarchy/ontology/ontologytype/lg — or a zz* scratch head) or to
 * the DERIVED hierarchy allowlist (scripts/lib/hierarchy_allowlist.ts — the
 * SAME symbol scripts/test_db_setup.ts installs from, imported, never
 * re-typed).
 *
 * PENDING STATE, and which option was chosen. The suite fixture on this
 * workstation predates the allowlist (built by the old glob; the 907 s rebuild
 * has not run), so this assertion IS RED today, deliberately. Of the two
 * honest shapes — gate it behind "the allowlist is in force", or bind now with
 * a failure message that says the fixture predates it — the SECOND was chosen:
 * any "in force" detector would be derived from the same installed set being
 * asserted (circular), and a detector-gated skip would also skip a FUTURE
 * regression back to the glob. So the failure message itself distinguishes the
 * two red classes: a vendored geo TLD is "stale fixture, rebuild with
 * `bun run test:db:setup`"; anything else is a REAL data-side law violation
 * (an install's records inside the suite fixture). Neither is weakened into a
 * skip, and the classifier has its own positive controls below.
 *
 * HERMETIC — for the SOURCE tiers: filesystem reads of tracked source, no
 * network, no clock. The DATA tier reads the suite database READ-ONLY (one
 * SELECT DISTINCT) and SKIPS LOUDLY via `describe.if(DB_READY)` when there is
 * no Postgres — an explicit bun SKIP plus a warn naming the build command,
 * never a silent pass. Nothing here writes a row anywhere.
 *
 * Registered in engineering/TRIPWIRES.md + scripts/verify.ts.
 */

import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { Glob } from 'bun';
import {
	BASELINE_PATH,
	computeDrift,
	FIX_COMMAND,
	formatDrift,
	loadBaseline,
} from '../../scripts/generic_tld_baseline.ts';
import { deriveHierarchyAllowlist } from '../../scripts/lib/hierarchy_allowlist.ts';
import {
	census,
	deniedTldsIn,
	INSTALL_TLDS,
	INVARIANT_TLDS,
	REPO_ROOT,
	SCAN_ROOTS,
	scannedFileCount,
} from '../../scripts/lib/tld_census.ts';
import { sql } from '../../src/core/db/postgres.ts';
import { SYNTHETIC_HIERARCHY_TLDS } from '../../src/core/test_data/synthetic_hierarchy_constants.ts';
import { DB_READY } from '../helpers/db_ready.ts';

const RESULTS = census();
const BASELINE = loadBaseline();
const DRIFT = computeDrift(RESULTS, BASELINE);

const WHY =
	"A test must use the generic `test` TLD and BUILD the situation it tests (src/core/test_data/situations) — a gate bound to one install's records is green on one machine and red everywhere else (AGENTS.md hard rules 2026-08-19).";

describe('generic_tld ratchet — install-TLD bindings in tests may only shrink', () => {
	test('no test file binds an install TLD its frozen entry does not list (unlisted files bind none)', () => {
		expect(
			DRIFT.regressions,
			`NEW INSTALL-TLD BINDINGS in test files. ${WHY}\n${formatDrift({ ...DRIFT, stale: [], summary: [], vacuity: [] })}\n` +
				`Two legitimate answers, and only two: rebuild the test on the generic TLD (situation() / test3), or RAISE the entry DELIBERATELY — run \`${FIX_COMMAND} --allow-regression\` (a plain \`${FIX_COMMAND}\` REFUSES growth), commit ${BASELINE_PATH} in the same change, and state in the commit message WHY the test must bind that install. Never add a file to get green.`,
		).toEqual([]);

		expect(
			DRIFT.summary,
			`FROZEN DEBT MISMATCH: the baseline summary disagrees with the measurement.\n${formatDrift({ ...DRIFT, regressions: [], stale: [], vacuity: [] })}\n` +
				`If it GREW, a new binding was added — rebuild that test generically. If it FELL, the change improved things: re-freeze with \`${FIX_COMMAND}\`.`,
		).toEqual([]);
	});

	test('ratchet stays honest — no stale entries above reality, none for files that are gone', () => {
		expect(
			DRIFT.stale,
			`STALE BASELINE ENTRIES in ${BASELINE_PATH} — a too-wide entry silently loosens the ratchet.\n${formatDrift({ ...DRIFT, regressions: [], summary: [], vacuity: [] })}\n` +
				`The one command that fixes this: \`${FIX_COMMAND}\` — then commit ${BASELINE_PATH} with the change that improved the test.`,
		).toEqual([]);
	});

	test('anti-vacuity — the scan saw a real corpus', () => {
		expect(
			DRIFT.vacuity,
			formatDrift({ ...DRIFT, regressions: [], stale: [], summary: [] }),
		).toEqual([]);
		expect(scannedFileCount()).toBeGreaterThan(300);
	});

	test('every measured tree is real and contributes files', () => {
		// A root that matches NOTHING silently un-measures a whole tree — exactly
		// the hole this gate had until 2026-08-22. Each root must see files.
		for (const { root, glob } of SCAN_ROOTS) {
			const seen = [...new Glob(glob).scanSync({ cwd: join(REPO_ROOT, root) })].length;
			expect(
				seen,
				`measured tree ${root}/${glob} matched NO file — the root moved or the glob broke. Fix the scanner, never the root list.`,
			).toBeGreaterThan(0);
		}
	});

	test('the client suite and the test-data writers ARE measured', () => {
		// Named explicitly: a future narrowing of SCAN_ROOTS back to `test/` would
		// re-open the door the dmm "map of grapes" binding walked through.
		const roots = SCAN_ROOTS.map((entry) => entry.root);
		expect(roots).toContain('client/dedalo/test/client/js');
		expect(roots).toContain('src/core/test_data');
	});
});

describe('generic_tld ratchet — the measure is what it claims', () => {
	// The vectors are BUILT, not spelled: a literal 'numisdata6' in this file
	// would itself be a binding by the census's own rule (it caught exactly that
	// on first run — the gate measures its own source, as it should).
	const tipo = (tld: string, n: number) => `${tld}${n}`;
	const NUMIS = tipo('numis' + 'data', 6);
	const RSC = tipo('r' + 'sc', 170);
	const TCHI = tipo('tc' + 'hi', 1);

	test('token grammar: a string binding counts, a comment does not, an allowed TLD does not', () => {
		expect(
			deniedTldsIn(`const s = '${NUMIS}'; const r = "${RSC}"; sqo.section_tipo = '${TCHI}';`),
		).toEqual({ ['numis' + 'data']: [NUMIS], ['r' + 'sc']: [RSC], ['tc' + 'hi']: [TCHI] });
		expect(
			deniedTldsIn(`// never use ${NUMIS} here\n/* ${RSC} was the old way */\nconst t = 'test3';`),
		).toEqual({});
		expect(
			deniedTldsIn(
				`const a = 'test3', b = 'dd6', c = 'hierarchy1', d = 'zzsit1', e = 'testgeoa1';`,
			),
		).toEqual({});
		// A bare TLD word is prose, not a binding.
		expect(deniedTldsIn(`const why = 'the ${'numis' + 'data'} install';`)).toEqual({});
		// Word boundaries: an identifier that merely CONTAINS a tipo does not bind.
		expect(deniedTldsIn(`const my_${RSC}_thing = 1; const ${RSC}x = 2;`)).toEqual({});
	});

	test('invariant TLDs can never be denied', () => {
		for (const tld of INVARIANT_TLDS) expect(INSTALL_TLDS.has(tld)).toBe(false);
		expect(/^zz/.test([...INSTALL_TLDS].join(' '))).toBe(false);
		for (const tld of INSTALL_TLDS) expect(tld.startsWith('zz')).toBe(false);
	});

	test('INSTALL_TLDS is sorted (grow-only, reviewable diffs)', () => {
		const list = [...INSTALL_TLDS];
		expect(list).toEqual([...list].sort());
	});
});

// ── THE DATA SIDE — what the suite database HOLDS (header: "THE DATA SIDE") ──

/**
 * The tipo's TLD head is its leading alphabetic run (`'es'` from a geo tipo,
 * `'test'` from `'test3'`) — the same unit every census in this file measures.
 * PURE, so the positive controls below can feed it synthetic corpora.
 */
function hierarchyTldViolations(
	observedTipos: readonly string[],
	allowedTlds: ReadonlySet<string>,
): string[] {
	const violations: string[] = [];
	for (const tipo of observedTipos) {
		const head = /^[a-z]+/.exec(tipo)?.[0] ?? '';
		if (head.startsWith('zz')) continue; // scratch situations — torn down by their owners
		if (allowedTlds.has(head)) continue;
		violations.push(tipo);
	}
	return violations.sort();
}

// Derived ONCE — the same symbol scripts/test_db_setup.ts installs from.
// deriveHierarchyAllowlist() throws on an empty scan (its own anti-vacuity),
// so a broken derivation reddens this file at load, never greens it.
const HIERARCHY_ALLOWLIST = deriveHierarchyAllowlist();
const DATA_ALLOWED_TLDS: ReadonlySet<string> = new Set([
	...INVARIANT_TLDS,
	...HIERARCHY_ALLOWLIST.tlds,
]);

if (!DB_READY) {
	console.warn(
		'[generic_tld] DATA-side assertion SKIPPED — no suite Postgres reachable. The source-side ratchet above still ran; build the database with: bun run test:db:setup',
	);
}

describe('generic_tld data side — the classifier is what it claims (positive controls)', () => {
	// Tokens are BUILT, never spelled: a literal install tipo here would be a
	// source-side binding by this file's own census, and a literal `<geo>1`
	// would feed the hierarchy allowlist's raw-text evidence scan — the gate
	// must never keep a hierarchy installed by naming it.
	const NUMIS = `${'numis'}${'data6'}`;
	const GEO_ES = `${'e'}${'s1'}`;
	const SCRATCH = `${'z'}${'zsit1'}`;

	test('an install tipo is convicted; generic families and the allowlist are not', () => {
		const allowed = new Set(['test', 'dd', 'es']);
		expect(hierarchyTldViolations([NUMIS], allowed)).toEqual([NUMIS]);
		expect(hierarchyTldViolations(['test3', 'dd15', SCRATCH, GEO_ES], allowed)).toEqual([]);
	});

	test('ANTI-VACUITY: an emptied allowlist turns RED, never green', () => {
		// A broken derivation (or a gutted INVARIANT_TLDS) must convict even the
		// generic playground — the failure direction is loud, not permissive.
		expect(hierarchyTldViolations(['test3', GEO_ES], new Set())).toEqual([GEO_ES, 'test3']);
	});

	test('the derived allowlist is alive and carries its permanent floor', () => {
		// `lg` is the engine-hardwired languages thesaurus (select_lang's lg1,
		// import_csv's pinned id 17344) and can NEVER leave the derivation — if it
		// does, the scan broke. The synthetic `test*` hierarchies are what the
		// fixture GENERATES (they replaced the volume-bound es import 2026-08-25,
		// when search_late_row_lookup migrated onto testgeoa1); they ride `tlds`
		// unconditionally, so their absence also means the module is broken.
		expect(HIERARCHY_ALLOWLIST.tlds.length).toBeGreaterThan(0);
		expect(HIERARCHY_ALLOWLIST.tlds).toContain('lg');
		for (const tld of SYNTHETIC_HIERARCHY_TLDS) {
			expect(HIERARCHY_ALLOWLIST.tlds).toContain(tld);
		}
		expect(HIERARCHY_ALLOWLIST.vendored.length).toBeGreaterThan(100);
		// CEILING, not just a floor: a derivation that marks EVERY vendored TLD
		// referenced has reproduced the glob it replaced (the allowlist module's
		// own header calls that outcome vacuous) — the data assertion below would
		// then pass against any pile of geo records. Strictly fewer than all.
		expect(HIERARCHY_ALLOWLIST.tlds.length).toBeLessThan(HIERARCHY_ALLOWLIST.vendored.length);
	});
});

describe.if(DB_READY)(
	'generic_tld data side — the suite database holds only what the law allows',
	() => {
		test('every matrix_hierarchy section_tipo is generic, scratch, or allowlisted (DELIBERATELY RED until the fixture is rebuilt — see the header)', async () => {
			const rows = (await sql`
			SELECT DISTINCT section_tipo FROM matrix_hierarchy ORDER BY section_tipo
		`) as { section_tipo: string | null }[];
			const observed = rows
				.map((row) => row.section_tipo)
				.filter((tipo): tipo is string => tipo !== null && tipo !== '');

			// Anti-vacuity floor: a rebuilt fixture installs the allowlisted
			// hierarchies, so an EMPTY table means the query or the fixture broke —
			// and an empty scan must never report the law upheld.
			expect(
				observed.length,
				'matrix_hierarchy answered ZERO distinct section_tipo — the suite fixture has no hierarchy data at all (or the query broke). Rebuild: bun run test:db:setup',
			).toBeGreaterThan(0);

			const violations = hierarchyTldViolations(observed, DATA_ALLOWED_TLDS);
			// Two red classes, told apart for the operator (header: "PENDING STATE"):
			// a vendored geo TLD is the pre-allowlist glob's leftover; anything else
			// is an install's records inside the suite fixture — the real law breach.
			const vendored = new Set(HIERARCHY_ALLOWLIST.vendored);
			const heads = new Map<string, number>();
			for (const tipo of violations) {
				const head = /^[a-z]+/.exec(tipo)?.[0] ?? '';
				heads.set(head, (heads.get(head) ?? 0) + 1);
			}
			const stale = [...heads.keys()].filter((head) => vendored.has(head)).sort();
			const foreign = [...heads.keys()].filter((head) => !vendored.has(head)).sort();
			expect(
				foreign.concat(stale.length > 0 ? [`… +${stale.length} stale geo TLDs`] : []),
				`matrix_hierarchy holds section_tipos outside the generic families + the derived allowlist (${violations.length} tipos over ${heads.size} TLDs).\n` +
					(stale.length > 0
						? `STALE FIXTURE (${stale.length} vendored geo TLDs: ${stale.slice(0, 12).join(', ')}${stale.length > 12 ? ', …' : ''}): this database predates the 2026-08-25 hierarchy allowlist — the old setup script glob-installed every vendored country hierarchy. The one fix: rebuild the suite database once with \`bun run test:db:setup\`.\n`
						: '') +
					(foreign.length > 0
						? `LAW VIOLATION (${foreign.length} non-vendored TLDs: ${foreign.join(', ')}): these are records of a specific install (or unknown data) inside the suite fixture — the exact class this gate exists to refuse. Find what wrote them; never widen the allowlist to absorb them.\n`
						: '') +
					'The allowlist is DERIVED (scripts/lib/hierarchy_allowlist.ts) — a test that newly needs a hierarchy earns it by NAMING the tipo, then rebuilding.',
			).toEqual([]);
		});
	},
);
