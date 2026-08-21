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
// SIX CASES ARE STILL RED, and they are a corpus gap, not a binding: the
// dataframe-bearing main and every multi-hop case (test6113 → testmint1006 /
// testmint1014, and the three grid_value breakdowns) export rows with EMPTY
// cells. Same root cause as the tool_export parity family: the chain's config
// lives in the install's ontology, and the seed's twin carries an empty
// `show.ddo_map`, so the export never descends. Left red on purpose — the fix
// is a `test`-TLD twin of that chain, not a weaker assertion here.

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { sql } from '../../src/core/db/postgres.ts';
import type { Principal } from '../../src/core/security/permissions.ts';
import { resolvePrincipal } from '../../src/core/security/permissions.ts';
import { dropTestCorpus, ensureTestCorpus } from '../../src/core/test_data/test_corpus/ensure.ts';
import type { ToolActionContext, ToolResponse } from '../../src/core/tools/module.ts';
import { exportGridUnified } from '../../src/diffusion/export/index.ts';
import { toolExportGetExportGrid } from '../../tools/tool_export/server/tool_export.ts';

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
});
afterAll(async () => {
	if (hasData) expect(await dropTestCorpus(CORPUS_SCOPE)).toBe(0);
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
async function assertExportInvariants(options: Record<string, unknown>): Promise<void> {
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

// Fixture ddos (mined from test/parity/tool_export_differential.test.ts).
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
const HOP_CECA_PORTAL = {
	section_tipo: 'test6099',
	component_tipo: 'test6113',
	model: 'component_portal',
	name: 'Ceca',
};
const REF3 = {
	section_tipo: 'test6099',
	component_tipo: 'test6134',
	model: 'component_input_text',
	name: 'Ref',
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

	testIfData(
		'value format: dataframe-bearing main (test6117@15657)',
		async () => {
			await assertExportInvariants(
				baseOptions(
					'test6099',
					'value',
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

	for (const leaf of [CECA, CULTURA, PORTAL163]) {
		testIfData(
			`multi-hop value: test6113 → ${leaf.component_tipo}`,
			async () => {
				await assertExportInvariants(
					baseOptions('test6099', 'value', [ddo([HOP_CECA_PORTAL, leaf])], ['1', '2']),
				);
			},
			60000,
		);
	}

	for (const breakdown of ['default', 'rows', 'columns']) {
		testIfData(
			`grid_value multi-hop breakdown '${breakdown}'`,
			async () => {
				await assertExportInvariants(
					baseOptions(
						'test6099',
						'grid_value',
						[ddo([REF3]), ddo([HOP_CECA_PORTAL, CULTURA])],
						['1', '2'],
						{ breakdown },
					),
				);
			},
			60000,
		);
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
