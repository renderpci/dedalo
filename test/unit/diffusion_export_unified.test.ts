/**
 * P6 export gate (DIFFUSION_PLAN D8) — the unified export engine
 * (src/diffusion/export) over REAL data.
 *
 * HISTORY: this gate was born as the A/B byte-equality keystone between the
 * legacy in-tool walker and the unified engine. The legacy walker was DELETED
 * 2026-07-08 (its ledgered deletion) when the deep-breakdown rebuild made the
 * unified engine the single implementation — the legacy math mis-placed
 * multi-hop grid_value atoms (suffix collisions, unaligned rows, no
 * fill_the_gaps, single-field relation leaves). CORRECTNESS versus the PHP
 * oracle is pinned by test/parity/tool_export_differential.test.ts and
 * test/parity/tool_export_breakdown_differential.test.ts; THIS gate keeps the
 * offline invariants:
 *
 *   (a) STREAM ≡ BUFFERED — the NDJSON byte stream and the buffered envelope
 *       come from the same generator and must carry the same lines;
 *   (b) protocol shape — meta first, every row cell references an
 *       already-emitted col ordinal, 'end' is last and its columns array is a
 *       permutation of the emitted col ordinals (the display order);
 *   (c) the tools handler is a pure facade over the unified engine (source
 *       tripwire — no second implementation can regrow in the tool dir).
 *
 * READ-ONLY: every request is a read; no tables are touched.
 */
// Migrated to the generic `test` TLD 2026-08-19: the fixtures are the phase-2
// `test`-TLD twins (src/core/test_data/test_tld_tipo_map.json) and the RECORDS
// are provisioned by this gate itself (ensure/dropTestCorpus) instead of read
// off whatever install the database happens to hold. The collection-time probe
// now asks for the ONTOLOGY of those sections — records without definitions
// cannot be exported, and a database built before the clone landed must SKIP
// (visibly), never go red.
//
// TWO DEFECTS THIS GATE WAS HIDING, both fixed 2026-08-19. (1) The probe bound
// its scope as `tipo = ANY(${array})`, which this driver stringifies — Postgres
// answered `malformed array literal`, the try/catch turned that into
// `hasData = false`, and all 18 fixture-gated tests SKIPPED even on a database
// holding the definitions. A probe whose failure mode is "skip everything" is
// indistinguishable from a passing gate, which is exactly what it looked like.
// (2) Once they ran, they read `response.result` — the PHP-era mirror retired by
// WC-2026-08-16-error-envelope-compat-removal. `ToolResponse` IS the v2 envelope,
// so the payload is `data`.
//
// THE SIX RED CASES, AND WHAT THEY ACTUALLY WERE (closed 2026-08-22). The
// dataframe-bearing main and every multi-hop case exported rows whose cells
// were all EMPTY. The note here used to blame an empty `show.ddo_map` on the
// seed twin; that was a MISDIAGNOSIS — those maps are fully populated. The gap
// was one level further out: the chains resolve INTO NEIGHBOUR SECTIONS whose
// records the corpus does not hold (the main's autocomplete reads `test6810`,
// the hierarchical leaf reads a thesaurus record, the portal leaf targets
// `rsc332`), and the record the hop actually lands on — `testmint1/75` — has no
// value for `testmint1006` at all. Sections that exist as DEFINITIONS and hold
// no RECORDS: an export of nothing, indistinguishable from an export that
// stopped descending.
//
// Not fixable in the corpus, which is DERIVED and never authored
// (`derive_test_corpus.ts` refuses rather than guesses), so those neighbours
// cannot be typed in without inventing data. Those cases now run on a BUILT
// chain instead (test/helpers/zzexp_export_chain.ts) — which is the law's
// answer and the stronger gate: the chain is CLOSED, every hop lands on a real
// record and every leaf holds a value, so an empty cell can only mean the
// engine stopped walking. The corpus cases that never needed a neighbour keep
// their breadth over real derived data, and stay.

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { sql } from '../../src/core/db/postgres.ts';
import type { Principal } from '../../src/core/security/permissions.ts';
import { resolvePrincipal } from '../../src/core/security/permissions.ts';
import { dropSituation, ensureSituation } from '../../src/core/test_data/situations/situation.ts';
import { dropTestCorpus, ensureTestCorpus } from '../../src/core/test_data/test_corpus/ensure.ts';
import type { ToolActionContext, ToolResponse } from '../../src/core/tools/module.ts';
import { exportGridUnified } from '../../src/diffusion/export/index.ts';
import { toolExportGetExportGrid } from '../../tools/tool_export/server/tool_export.ts';
import {
	ZZEXP_DATAFRAME_MAIN,
	ZZEXP_HOP,
	ZZEXP_LEAF_LITERAL,
	ZZEXP_LEAF_PORTAL,
	ZZEXP_LEAF_RELATION,
	ZZEXP_LITERAL,
	ZZEXP_MAIN_SECTION,
	ZZEXP_RECORD_IDS,
	ZZEXP_SITUATION,
	ZZEXP_TARGET_SECTION,
} from '../helpers/zzexp_export_chain.ts';

// Fixture detection at COLLECTION time (top-level await), so missing fixtures
// gate the tests via test.if → reported SKIP — never a silent fake PASS
// (the old `if (!hasData) return;` pattern made 17 empty green tests).
/** The two corpus sections this gate exports (provisioned in beforeAll). */
const CORPUS_SCOPE = ['testmint1', 'test6099'];

let principal!: Principal;
let hasData = false;
try {
	// The ONTOLOGY is the fixture that cannot be provisioned from here: the
	// phase-2 `test`-TLD definitions land with `bun run test:db:setup`.
	// `= ANY(${array})` does NOT bind here — the driver stringifies the array and
	// Postgres answers `malformed array literal`, which the catch below turned
	// into a silent 18-test SKIP even on a database that HELD the definitions
	// (measured 2026-08-19: 8474 `test*` nodes present, gate skipped anyway).
	// `string_to_array` binds ONE text parameter, which does work.
	const probe = (await sql`
		SELECT count(*)::int AS n
		  FROM dd_ontology
		 WHERE tipo = ANY(string_to_array(${CORPUS_SCOPE.join(',')}, ','))
	`) as { n: number }[];
	hasData = Number(probe[0]?.n) >= CORPUS_SCOPE.length;
	principal = await resolvePrincipal(-1);
} catch {
	hasData = false;
}
if (!hasData) {
	console.warn(
		'[diffusion_export_unified] the phase-2 `test` TLD ontology is absent — export gate SKIPPED (run `bun run test:db:setup`)',
	);
}

/** Fixture-gated test: SKIP (visibly) when the test-TLD definitions are absent. */
const testIfData = test.if(hasData);

beforeAll(async () => {
	if (hasData) await ensureTestCorpus(CORPUS_SCOPE);
	// The BUILT chain does not depend on the phase-2 clone, so it is not gated
	// on `hasData` — it is this gate's own structure, and it either builds or
	// the file fails loudly.
	await ensureSituation(ZZEXP_SITUATION);
});
afterAll(async () => {
	if (hasData) expect(await dropTestCorpus(CORPUS_SCOPE)).toBe(0);
	expect(await dropSituation(ZZEXP_SITUATION)).toBe(0);
});

const contextOf = (options: Record<string, unknown>): ToolActionContext =>
	({ principal, userId: -1, options, background: false }) as ToolActionContext;

type ProtocolLine = { t: string; i?: number; sub?: number; c?: Record<string, unknown> } & Record<
	string,
	unknown
>;

/**
 * Run one fixture through BOTH forms via the tools facade and assert:
 * stream ≡ buffered lines, protocol-shape invariants, non-vacuous rows.
 */
async function assertExportInvariants(
	options: Record<string, unknown>,
	/**
	 * How many columns this fixture MUST emit, all of them carrying at least one
	 * atom. Given only for the BUILT chain, whose content is known — see the
	 * floor below for why the number and not just "all emitted ones".
	 */
	expectColumns?: number,
): Promise<void> {
	const bufferedResponse: ToolResponse = await toolExportGetExportGrid(
		contextOf(structuredClone(options)),
	);
	// `ToolResponse` IS the v2 envelope (src/core/tools/module.ts: ApiEnvelope) —
	// the payload lives in `data`, and a top-level `result` is FORBIDDEN
	// (WC-2026-08-16-error-envelope-compat-removal). This gate still read
	// `result`, which the broken skip-probe above had been hiding.
	const buffered = bufferedResponse.data as {
		meta: ProtocolLine;
		columns: ProtocolLine[];
		rows: ProtocolLine[];
		end: ProtocolLine | null;
	};

	const streamResponse: ToolResponse = await toolExportGetExportGrid(
		contextOf({ ...structuredClone(options), ndjson_stream: true }),
	);
	expect(streamResponse.stream).toBeInstanceOf(ReadableStream);
	expect(String(streamResponse.streamContentType ?? '')).toContain('application/x-ndjson');
	const ndjson = await new Response(streamResponse.stream as ReadableStream<Uint8Array>).text();
	const lines = ndjson
		.split('\n')
		.filter((line) => line !== '')
		.map((line) => JSON.parse(line) as ProtocolLine);

	// (b) protocol shape on the STREAM
	expect(lines[0]?.t).toBe('meta');
	expect(lines[lines.length - 1]?.t).toBe('end');
	const seenOrdinals = new Set<number>();
	for (const line of lines) {
		if (line.t === 'col') {
			seenOrdinals.add(line.i as number);
		} else if (line.t === 'row') {
			for (const ordinal of Object.keys(line.c ?? {})) {
				expect(seenOrdinals.has(Number(ordinal))).toBe(true);
			}
		}
	}
	const end = lines[lines.length - 1] as unknown as {
		columns: number[];
		rows: number;
		records: number;
	};
	expect([...(end.columns ?? [])].sort((a, b) => a - b)).toEqual(
		[...seenOrdinals].sort((a, b) => a - b),
	);
	expect(end.rows).toBe(lines.filter((line) => line.t === 'row').length);

	// (a) stream ≡ buffered: same meta/col/row/end line objects, same order.
	expect(JSON.stringify(lines[0])).toBe(JSON.stringify(buffered.meta));
	expect(JSON.stringify(lines.filter((line) => line.t === 'col'))).toBe(
		JSON.stringify(buffered.columns),
	);
	expect(JSON.stringify(lines.filter((line) => line.t === 'row'))).toBe(
		JSON.stringify(buffered.rows),
	);
	expect(JSON.stringify(end)).toBe(JSON.stringify(buffered.end));

	// Keep the gate honest: the fixture must actually produce rows with data.
	expect(buffered.rows.length).toBeGreaterThan(0);
	expect((buffered.meta as { total?: number }).total ?? 0).toBeGreaterThan(0);
	expect(buffered.rows.some((row) => Object.keys(row.c ?? {}).length > 0)).toBe(true);

	// PER-COLUMN floor, on the BUILT chain, whose content is known (see the
	// header). The floor above is per-ROW, and that is how the six multi-hop
	// cases stayed "non-vacuous" for months while the column under test emitted
	// NOTHING: a sibling literal column filled the row and the assertion passed.
	//
	// It is a COUNT, not just "every emitted column is filled", because a column
	// that resolves to nothing is not emitted EMPTY — it is not emitted at all,
	// so a check over the ordinals actually seen goes vacuous exactly when it
	// matters. Measured 2026-08-22 by pointing the chain's hop at a non-existent
	// record: the three `value` cases lose every cell and the ROW floor catches
	// them, but the three grid cases still emit their literal column, still fill
	// a row, and still have every EMITTED column filled — they pass both weaker
	// checks and only the count reddens them. With the count, all six.
	// Two narrower offenders confirm the leaves: removing the dataframe main's
	// target record reddens that one case, and emptying the portal leaf's
	// locators reddens the hop → portal case.
	if (expectColumns !== undefined) {
		expect(seenOrdinals.size, 'a declared column was not emitted at all').toBe(expectColumns);
		const filled = new Set<number>();
		for (const row of buffered.rows) {
			for (const ordinal of Object.keys(row.c ?? {})) filled.add(Number(ordinal));
		}
		expect(
			[...seenOrdinals].filter((ordinal) => !filled.has(ordinal)),
			'a column was emitted but produced no atom in any row — the walk stopped short',
		).toEqual([]);
	}

	// (c) facade equivalence: direct engine call produces the same envelope.
	const direct = await exportGridUnified(contextOf(structuredClone(options)));
	expect(JSON.stringify(direct.data)).toBe(JSON.stringify(bufferedResponse.data));
}

const ddo = (
	steps: { section_tipo: string; component_tipo: string; model?: string; name?: string }[],
	extra: Record<string, unknown> = {},
): Record<string, unknown> => ({ path: steps, ...extra });

const sqoOf = (sectionTipo: string, ids: string[]): Record<string, unknown> => ({
	section_tipo: [sectionTipo],
	limit: 0,
	offset: 0,
	filter_by_locators: ids.map((id) => ({ section_tipo: sectionTipo, section_id: id })),
});

const baseOptions = (
	sectionTipo: string,
	dataFormat: string,
	ddos: Record<string, unknown>[],
	ids: string[],
	extra: Record<string, unknown> = {},
): Record<string, unknown> => ({
	section_tipo: sectionTipo,
	model: 'section',
	data_format: dataFormat,
	breakdown: 'default',
	ar_ddo_to_export: ddos,
	sqo: sqoOf(sectionTipo, ids),
	...extra,
});

/** One ddo path step on the BUILT chain (the `name` is the column label). */
const chainStep = (
	sectionTipo: string,
	componentTipo: string,
	model?: string,
): { section_tipo: string; component_tipo: string; model?: string; name: string } =>
	model === undefined
		? { section_tipo: sectionTipo, component_tipo: componentTipo, name: componentTipo }
		: { section_tipo: sectionTipo, component_tipo: componentTipo, model, name: componentTipo };

/** baseOptions over the built chain's two main records. */
const chainOptions = (
	dataFormat: string,
	ddos: Record<string, unknown>[],
	extra: Record<string, unknown> = {},
): Record<string, unknown> =>
	baseOptions(
		ZZEXP_MAIN_SECTION,
		dataFormat,
		ddos,
		ZZEXP_RECORD_IDS.map((id) => String(id)),
		extra,
	);

// Fixture ddos (mined from test/parity/tool_export_differential.test.ts).
// The two that described the multi-hop chain (the `test6113` hop and its `Ref`
// literal) are GONE with the cases that used them — the corpus cannot close
// that chain, and a fixture kept for tests that no longer exist is just a
// second, unverified description of the ontology.
const CECA = {
	section_tipo: 'testmint1',
	component_tipo: 'testmint1002',
	model: 'component_input_text',
	name: 'Ceca',
};
const TOPONIMO = {
	section_tipo: 'testmint1',
	component_tipo: 'testmint1023',
	model: 'component_autocomplete_hi',
	name: 'Topónimo',
};
const CULTURA = {
	section_tipo: 'testmint1',
	component_tipo: 'testmint1006',
	model: 'component_autocomplete_hi',
	name: 'Cultura',
};
const PORTAL163 = {
	section_tipo: 'testmint1',
	component_tipo: 'testmint1014',
	model: 'component_portal',
	name: 'Referencias',
};

describe('P6 export — unified engine protocol + stream/buffered duality', () => {
	testIfData(
		'value format: single-hop literals + hierarchical autocomplete',
		async () => {
			await assertExportInvariants(
				baseOptions('testmint1', 'value', [ddo([CECA]), ddo([TOPONIMO])], ['1', '75']),
			);
		},
		60000,
	);

	testIfData(
		'value format: portal-heavy column set',
		async () => {
			await assertExportInvariants(
				baseOptions(
					'testmint1',
					'value',
					[ddo([PORTAL163]), ddo([CECA]), ddo([CULTURA])],
					['2', '75'],
				),
			);
		},
		60000,
	);

	// BUILT CHAIN (see the header): the install twin's equivalent read into
	// `test6810`, a section the corpus holds no records for.
	test('value format: dataframe-bearing main (built chain)', async () => {
		await assertExportInvariants(
			chainOptions('value', [
				ddo([chainStep(ZZEXP_MAIN_SECTION, ZZEXP_DATAFRAME_MAIN)]),
				ddo([chainStep(ZZEXP_MAIN_SECTION, ZZEXP_LITERAL)]),
			]),
			2,
		);
	}, 60000);

	// WC-049: value_with_parents is PER-DDO only and grid_value only — the
	// legacy request-global option is ignored, and the value format never grows
	// parents columns. Emission content is pinned by
	// tool_export_parents_native.test.ts (test3 playground); here the flag only
	// has to keep the protocol invariants intact in both formats.
	testIfData(
		'value_with_parents per-ddo: protocol invariants hold (value + grid_value)',
		async () => {
			await assertExportInvariants(
				baseOptions(
					'testmint1',
					'value',
					[ddo([CECA]), ddo([TOPONIMO], { value_with_parents: true })],
					['1', '75'],
					{ value_with_parents: true }, // ignored (WC-049)
				),
			);
			await assertExportInvariants(
				baseOptions(
					'testmint1',
					'grid_value',
					[ddo([CECA]), ddo([TOPONIMO], { value_with_parents: true })],
					['1', '75'],
				),
			);
		},
		60000,
	);

	for (const breakdown of ['default', 'rows', 'columns']) {
		for (const fillTheGaps of [true, false]) {
			testIfData(
				`grid_value breakdown '${breakdown}' fill_the_gaps=${fillTheGaps}`,
				async () => {
					await assertExportInvariants(
						baseOptions('testmint1', 'grid_value', [ddo([CECA]), ddo([CULTURA])], ['2', '75'], {
							breakdown,
							fill_the_gaps: fillTheGaps,
						}),
					);
				},
				60000,
			);
		}
	}

	testIfData(
		'dedalo_raw: dataframe fixture (test6099@15657)',
		async () => {
			await assertExportInvariants(
				baseOptions(
					'test6099',
					'dedalo_raw',
					[
						ddo([{ section_tipo: 'test6099', component_tipo: 'test6117', name: 'test6117' }]),
						ddo([{ section_tipo: 'test6099', component_tipo: 'test6157', name: 'test6157' }]),
					],
					['15657'],
				),
			);
		},
		60000,
	);

	testIfData(
		'dedalo_raw: literal + relation + portal columns (testmint1)',
		async () => {
			await assertExportInvariants(
				baseOptions(
					'testmint1',
					'dedalo_raw',
					[ddo([CECA]), ddo([CULTURA]), ddo([PORTAL163])],
					['2', '75'],
				),
			);
		},
		60000,
	);

	// BUILT CHAIN: one case per LEAF KIND a hop can land on — literal, relation
	// and portal. The corpus twin could only ever satisfy the literal one: its
	// hop lands on `testmint1/75`, which holds no value for the relation leaf and
	// whose portal leaf points at a section with no records.
	for (const [kind, leafTipo] of [
		['literal', ZZEXP_LEAF_LITERAL],
		['relation', ZZEXP_LEAF_RELATION],
		['portal', ZZEXP_LEAF_PORTAL],
	] as [string, string][]) {
		test(`multi-hop value: hop → ${kind} leaf (built chain)`, async () => {
			await assertExportInvariants(
				chainOptions('value', [
					ddo([
						chainStep(ZZEXP_MAIN_SECTION, ZZEXP_HOP, 'component_portal'),
						chainStep(ZZEXP_TARGET_SECTION, leafTipo),
					]),
				]),
				1,
			);
		}, 60000);
	}

	// BUILT CHAIN: the deep-breakdown math (suffix placement, row alignment,
	// fill_the_gaps) is what this trio is for, and it needs a multi-hop column
	// that actually produces atoms — which is precisely what the corpus twin
	// could not supply.
	for (const breakdown of ['default', 'rows', 'columns']) {
		test(`grid_value multi-hop breakdown '${breakdown}' (built chain)`, async () => {
			await assertExportInvariants(
				chainOptions(
					'grid_value',
					[
						ddo([chainStep(ZZEXP_MAIN_SECTION, ZZEXP_LITERAL)]),
						ddo([
							chainStep(ZZEXP_MAIN_SECTION, ZZEXP_HOP, 'component_portal'),
							chainStep(ZZEXP_TARGET_SECTION, ZZEXP_LEAF_RELATION),
						]),
					],
					{ breakdown },
				),
				2,
			);
		}, 60000);
	}
});

describe('P6 export — facade seam tripwire', () => {
	const source = readFileSync(
		join(import.meta.dir, '..', '..', 'tools', 'tool_export', 'server', 'tool_export.ts'),
		'utf8',
	);

	test('the handler imports the unified engine module', () => {
		expect(source).toMatch(/from '..\/..\/..\/src\/diffusion\/export\/index.ts'/);
	});

	test('the handler is a PURE facade — no legacy escape, no second build', () => {
		// The invariant is ONE BUILD PATH, not a one-line body: the handler may
		// GATE (SEC-024 §9.2 asserts read on every sqo.section_tipo — PHP does the
		// same, imperatively, because the declarative kind cannot see inside the
		// SQO), but it must never build a grid itself. So: every `return` in the
		// handler is either the single delegation or a refusal envelope.
		const start = source.indexOf(
			'export async function toolExportGetExportGrid(context: ToolActionContext): Promise<ToolResponse> {',
		);
		expect(start).toBeGreaterThan(-1);
		const end = source.indexOf('\n}', start);
		expect(end).toBeGreaterThan(start);
		const body = source.slice(start, end);

		const returns = body.match(/\breturn\b[^;]*/g) ?? [];
		expect(returns.length).toBeGreaterThan(0);
		for (const statement of returns) {
			const isDelegation = statement.includes('exportGridUnified(context)');
			const isRefusal = statement.includes('result: false');
			expect(isDelegation || isRefusal).toBe(true);
		}
		// Exactly ONE delegation, and it is the handler's last statement.
		expect(body.match(/exportGridUnified\(/g)?.length).toBe(1);
		expect(body.trimEnd().endsWith('return exportGridUnified(context);')).toBe(true);

		// The deleted kill-switch must not regrow.
		expect(source).not.toContain('DEDALO_EXPORT_UNIFIED');
		// No SQL/resolver machinery may live in the tool file again.
		expect(source).not.toContain('buildSearchSql');
		expect(source).not.toContain('resolveCellValue');
	});
});
