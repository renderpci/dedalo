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

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { sql } from '../../src/core/db/postgres.ts';
import type { Principal } from '../../src/core/security/permissions.ts';
import { resolvePrincipal } from '../../src/core/security/permissions.ts';
import type { ToolActionContext, ToolResponse } from '../../src/core/tools/module.ts';
import { exportGridUnified } from '../../src/diffusion/export/index.ts';
import { toolExportGetExportGrid } from '../../tools/tool_export/server/tool_export.ts';

// Fixture detection at COLLECTION time (top-level await), so missing fixtures
// gate the tests via test.if → reported SKIP — never a silent fake PASS
// (the old `if (!hasData) return;` pattern made 17 empty green tests).
let principal!: Principal;
let hasData = false;
try {
	const probe = (await sql`
		SELECT
			(SELECT count(*) FROM matrix WHERE section_tipo = 'numisdata6' AND section_id IN (1,2,75)) AS coins,
			(SELECT count(*) FROM matrix WHERE section_tipo = 'numisdata3' AND section_id IN (1,2)) AS types
	`) as { coins: string | number; types: string | number }[];
	hasData = Number(probe[0]?.coins) >= 3 && Number(probe[0]?.types) >= 2;
	principal = await resolvePrincipal(-1);
} catch {
	hasData = false;
}
if (!hasData) {
	console.warn(
		'[diffusion_export_unified] numisdata fixtures unavailable — export gate SKIPPED on this install',
	);
}

/** Fixture-gated test: SKIP (visibly) when the numisdata fixtures are absent. */
const testIfData = test.if(hasData);

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
	const buffered = bufferedResponse.result as {
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
	expect(JSON.stringify(direct.result)).toBe(JSON.stringify(bufferedResponse.result));
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
	section_tipo: 'numisdata6',
	component_tipo: 'numisdata16',
	model: 'component_input_text',
	name: 'Ceca',
};
const TOPONIMO = {
	section_tipo: 'numisdata6',
	component_tipo: 'numisdata585',
	model: 'component_autocomplete_hi',
	name: 'Topónimo',
};
const CULTURA = {
	section_tipo: 'numisdata6',
	component_tipo: 'numisdata20',
	model: 'component_autocomplete_hi',
	name: 'Cultura',
};
const PORTAL163 = {
	section_tipo: 'numisdata6',
	component_tipo: 'numisdata163',
	model: 'component_portal',
	name: 'Referencias',
};
const HOP_CECA_PORTAL = {
	section_tipo: 'numisdata3',
	component_tipo: 'numisdata30',
	model: 'component_portal',
	name: 'Ceca',
};
const REF3 = {
	section_tipo: 'numisdata3',
	component_tipo: 'numisdata52',
	model: 'component_input_text',
	name: 'Ref',
};

describe('P6 export — unified engine protocol + stream/buffered duality', () => {
	testIfData(
		'value format: single-hop literals + hierarchical autocomplete',
		async () => {
			await assertExportInvariants(
				baseOptions('numisdata6', 'value', [ddo([CECA]), ddo([TOPONIMO])], ['1', '75']),
			);
		},
		60000,
	);

	testIfData(
		'value format: portal-heavy column set',
		async () => {
			await assertExportInvariants(
				baseOptions(
					'numisdata6',
					'value',
					[ddo([PORTAL163]), ddo([CECA]), ddo([CULTURA])],
					['2', '75'],
				),
			);
		},
		60000,
	);

	testIfData(
		'value format: dataframe-bearing main (numisdata34@15657)',
		async () => {
			await assertExportInvariants(
				baseOptions(
					'numisdata3',
					'value',
					[
						ddo([
							{ section_tipo: 'numisdata3', component_tipo: 'numisdata34', name: 'numisdata34' },
						]),
						ddo([
							{ section_tipo: 'numisdata3', component_tipo: 'numisdata77', name: 'numisdata77' },
						]),
					],
					['15657'],
				),
			);
		},
		60000,
	);

	testIfData(
		'value_with_parents on (global + per-ddo)',
		async () => {
			await assertExportInvariants(
				baseOptions(
					'numisdata6',
					'value',
					[ddo([CECA]), ddo([TOPONIMO], { value_with_parents: true })],
					['1', '75'],
					{ value_with_parents: true },
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
						baseOptions('numisdata6', 'grid_value', [ddo([CECA]), ddo([CULTURA])], ['2', '75'], {
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
		'dedalo_raw: dataframe fixture (numisdata3@15657)',
		async () => {
			await assertExportInvariants(
				baseOptions(
					'numisdata3',
					'dedalo_raw',
					[
						ddo([
							{ section_tipo: 'numisdata3', component_tipo: 'numisdata34', name: 'numisdata34' },
						]),
						ddo([
							{ section_tipo: 'numisdata3', component_tipo: 'numisdata77', name: 'numisdata77' },
						]),
					],
					['15657'],
				),
			);
		},
		60000,
	);

	testIfData(
		'dedalo_raw: literal + relation + portal columns (numisdata6)',
		async () => {
			await assertExportInvariants(
				baseOptions(
					'numisdata6',
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
			`multi-hop value: numisdata30 → ${leaf.component_tipo}`,
			async () => {
				await assertExportInvariants(
					baseOptions('numisdata3', 'value', [ddo([HOP_CECA_PORTAL, leaf])], ['1', '2']),
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
						'numisdata3',
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
		// The body of the handler must be a single delegation to the engine.
		expect(source).toMatch(
			/export async function toolExportGetExportGrid\(context: ToolActionContext\): Promise<ToolResponse> \{\s*\n\s*return exportGridUnified\(context\);\s*\n\}/,
		);
		// The deleted kill-switch must not regrow.
		expect(source).not.toContain('DEDALO_EXPORT_UNIFIED');
		// No SQL/resolver machinery may live in the tool file again.
		expect(source).not.toContain('buildSearchSql');
		expect(source).not.toContain('resolveCellValue');
	});
});
