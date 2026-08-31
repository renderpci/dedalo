/**
 * Phase 6 gate: tool_export.get_export_grid vs live PHP — the flat export
 * table. ROW VALUES are the parity target (the export-atoms leaf contract):
 * every cell must equal PHP's flat display string, including a
 * portal-resolved label. Columns compare on the stable identity fields
 * (key/label/cell_type/i); the enriched path internals stay PHP-side detail.
 *
 * @twinned-by   test/unit/tool_export_native.test.ts
 */
// GENERIC-TLD MIGRATED 2026-08-19 (WC-2026-08-19-tools-gates-test-tld).
// Every section and component below is either a phase-2 clone in the generic
// `test` TLD (src/core/test_data/test_tld_tipo_map.json) or SEED-SHIPPED
// ontology spelled through `seed()` — the media section and its two components,
// which every installation carries. The RQOs are written in test-TLD terms,
// `unmapRqo` finds the frozen interactions under the install addresses PHP
// answered, and `adoptTipoIdMap` reads the bodies back in test terms. The
// exported RECORDS come from the committed test corpus.
//
// MEASURED 2026-08-19 after the migration: 1 pass / 14 fail, and NOT ONE of the
// reds is a TLD binding — every one is CORPUS ABSENCE. A tool_export response is
// a flat grid of DISPLAY STRINGS, so it reveals no storable component data:
// scripts/derive_test_corpus.ts can only reconstruct a record from a body that
// exposes its data, and it refuses these gates' records as `never_revealed` (68
// of them, tagged `tool_export*` in test_corpus/refused.json). What survives is
// whatever ANOTHER gate revealed — so the rows compare almost cell for cell and
// diverge exactly where the corpus is thin: thesaurus labels the terms sections
// do not carry, the media records rsc170/32891 + /32900 the image cells read,
// and the partially reconstructed stored value behind the dedalo_raw case. WHAT
// IT NEEDS: those records in the corpus (a derive that can source them, or a
// built situation that authors them). Nothing in this file can close it, and no
// assertion was relaxed to hide it.
//
// TS-NATIVE TWIN (DEC-14b, 2026-08-23): test/unit/tool_export_native.test.ts
// pins the flat-grid rules on a BUILT chain (test/helpers/zzbib_export_chain.ts
// — 'rows'→'value' normalization, multi-hop leaf walk, dedalo_raw wrapper,
// media img URL cells); the NDJSON protocol lives in
// test/unit/diffusion_export_unified.test.ts. This file stays as the FROZEN
// RECORD: only its bodies still pin the multi-target autocomplete_hi thesaurus
// explosion and the install-record display strings. Map row:
// engineering/ORACLE_HARVEST.md § Generic-TLD replacement map.

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { config } from '../../src/config/config.ts';
import { dispatchRqo } from '../../src/core/api/dispatch.ts';
import { resolvePrincipal } from '../../src/core/security/permissions.ts';
import { createSession, getSession } from '../../src/core/security/session_store.ts';
import { dropTestCorpus, ensureTestCorpus } from '../../src/core/test_data/test_corpus/ensure.ts';
import { adoptTipoIdMap } from './normalize.ts';
import { hasPhpCredentials, PhpApiClient } from './php_client.ts';

/** A SEED-SHIPPED tipo, spelled out of the install-TLD census's token grammar. */
const seed = (tld: string, id: number): string => `${tld}${id}`;

/** The media section every installation ships, its image and its name field. */
const MEDIA_SECTION = seed('rsc', 170);
const MEDIA_IMAGE = seed('rsc', 29);
const MEDIA_NAME = seed('rsc', 25);

/**
 * The corpus scope this gate owns: the two cloned sections it exports from, the
 * media section its image cells read, and the thesauri the autocomplete_hi
 * cells resolve their labels through (without them every hierarchy cell exports
 * empty and the row compare reddens).
 */
const CORPUS_SCOPE = [
	'testmint1',
	'test6099',
	MEDIA_SECTION,
	'testcult1',
	'testterr1',
	'test7374',
] as const;

/**
 * The FROZEN grid, read in test-TLD terms
 * (WC-2026-08-19-tools-gates-test-tld). The floors are anti-vacuity checks:
 * every one of these responses names the exported section, its components and
 * the record addresses of the rows it returned, so a transform that stopped
 * rewriting could not stay above them.
 */
function adoptFrozen<T>(body: T, tipos: 'rewritten' | 'none' = 'rewritten'): T {
	const adopted = adoptTipoIdMap(body, 'tool_export_differential');
	expect(adopted.matched).toBe(true);
	// `none` is the SEED-SHIPPED case (the media export names rsc ontology only,
	// which every installation carries): the zero is asserted exactly, so the day
	// such a body starts carrying an install tipo the count moves and this
	// reddens instead of the transform silently absorbing it.
	if (tipos === 'none') expect(adopted.rewrites.tipos).toBe(0);
	else expect(adopted.rewrites.tipos).toBeGreaterThan(0);
	return adopted.body;
}

const EXPORT_RQO = {
	action: 'tool_request',
	dd_api: 'dd_tools_api',
	prevent_lock: true,
	source: { typo: 'source', model: 'tool_export', action: 'get_export_grid' },
	options: {
		section_tipo: 'testmint1',
		model: 'section',
		data_format: 'rows',
		breakdown: 'default',
		ar_ddo_to_export: [
			{
				path: [
					{
						section_tipo: 'testmint1',
						component_tipo: 'testmint1002',
						model: 'component_input_text',
						name: 'Ceca',
					},
				],
			},
			{
				path: [
					{
						section_tipo: 'testmint1',
						component_tipo: 'testmint1023',
						model: 'component_autocomplete_hi',
						name: 'Topónimo',
					},
				],
			},
		],
		sqo: {
			section_tipo: ['testmint1'],
			limit: 0,
			offset: 0,
			filter_by_locators: [
				{ section_tipo: 'testmint1', section_id: '1' },
				{ section_tipo: 'testmint1', section_id: '75' },
			],
		},
	},
};

type Grid = {
	meta?: Record<string, unknown>;
	columns?: Record<string, unknown>[];
	rows?: Record<string, unknown>[];
};

let phpGrid: Grid = {};
let tsGrid: Grid = {};

beforeAll(async () => {
	await ensureTestCorpus([...CORPUS_SCOPE]);
	if (!hasPhpCredentials()) return;
	const php = new PhpApiClient();
	await php.login(config.phpReference.username as string, config.phpReference.password as string);
	phpGrid =
		(
			adoptFrozen(
				(await php.call(structuredClone(EXPORT_RQO) as Record<string, unknown>)).body,
			) as { result?: Grid }
		).result ?? {};

	const token = createSession(-1, 'root', true);
	const session = getSession(token);
	const principal = await resolvePrincipal(-1);
	const tsResult = await dispatchRqo(
		structuredClone(EXPORT_RQO) as never,
		{
			requestId: 't',
			clientIp: '127.0.0.1',
			session,
			csrfCandidate: session?.csrfToken ?? null,
			principal,
		} as never,
	);
	tsGrid = ((tsResult.body as { data?: Grid }).data ?? {}) as Grid;
});

afterAll(async () => {
	expect(await dropTestCorpus([...CORPUS_SCOPE])).toBe(0);
});

describe.if(hasPhpCredentials())('tool_export grid differential', () => {
	test('meta total + row VALUES match PHP exactly', () => {
		expect(tsGrid.meta?.total).toBe(phpGrid.meta?.total as number);
		expect(phpGrid.rows?.length ?? 0).toBeGreaterThan(0);
		// Rows: rec/sub/c must be byte-equal (the flat values are the contract).
		const strip = (row: Record<string, unknown>): Record<string, unknown> => ({
			rec: row.rec,
			sub: row.sub,
			c: row.c,
		});
		expect((tsGrid.rows ?? []).map(strip)).toEqual((phpGrid.rows ?? []).map(strip));
	});

	test('columns match on the stable identity fields', () => {
		const stable = (column: Record<string, unknown>): Record<string, unknown> => ({
			t: column.t,
			i: column.i,
			key: column.key,
			cell_type: column.cell_type,
		});
		expect((tsGrid.columns ?? []).map(stable)).toEqual((phpGrid.columns ?? []).map(stable));
	});
});

// grid_value: per-locator atom explosion — breakdown rows/default (sub-rows)
// and columns ('|n'-suffixed columns, height 1). The multi-target fixture is
// testmint1006 (autocomplete_hi): record 2 targets terr1 AND utoponymy1.
const GRID_VALUE_RQO = (breakdown: string): Record<string, unknown> => ({
	action: 'tool_request',
	dd_api: 'dd_tools_api',
	prevent_lock: true,
	source: { typo: 'source', model: 'tool_export', action: 'get_export_grid' },
	options: {
		section_tipo: 'testmint1',
		model: 'section',
		data_format: 'grid_value',
		breakdown,
		ar_ddo_to_export: [
			{
				path: [
					{
						section_tipo: 'testmint1',
						component_tipo: 'testmint1002',
						model: 'component_input_text',
						name: 'Ceca',
					},
				],
			},
			{
				path: [
					{
						section_tipo: 'testmint1',
						component_tipo: 'testmint1006',
						model: 'component_autocomplete_hi',
						name: 'Cultura',
					},
				],
			},
		],
		sqo: {
			section_tipo: ['testmint1'],
			limit: 0,
			offset: 0,
			filter_by_locators: [
				{ section_tipo: 'testmint1', section_id: '2' },
				{ section_tipo: 'testmint1', section_id: '75' },
			],
		},
	},
});

describe.if(hasPhpCredentials())('tool_export grid_value breakdown differential', () => {
	for (const breakdown of ['default', 'rows', 'columns']) {
		test(`breakdown '${breakdown}' rows + columns match PHP`, async () => {
			const php = new PhpApiClient();
			await php.login(
				config.phpReference.username as string,
				config.phpReference.password as string,
			);
			const phpResult =
				(adoptFrozen((await php.call(GRID_VALUE_RQO(breakdown))).body) as { result?: Grid })
					.result ?? {};

			const token = createSession(-1, 'root', true);
			const session = getSession(token);
			const principal = await resolvePrincipal(-1);
			const tsResult = ((
				(
					await dispatchRqo(
						GRID_VALUE_RQO(breakdown) as never,
						{
							requestId: 't',
							clientIp: '127.0.0.1',
							session,
							csrfCandidate: session?.csrfToken ?? null,
							principal,
						} as never,
					)
				).body as { data?: Grid }
			).data ?? {}) as Grid;

			expect(tsResult.meta?.total).toBe(phpResult.meta?.total as number);
			expect(tsResult.meta?.data_format).toBe('grid_value');
			expect(phpResult.rows?.length ?? 0).toBeGreaterThan(0);
			const stripRow = (row: Record<string, unknown>): Record<string, unknown> => ({
				rec: row.rec,
				sub: row.sub,
				c: row.c,
			});
			expect((tsResult.rows ?? []).map(stripRow)).toEqual((phpResult.rows ?? []).map(stripRow));
			const stableColumn = (column: Record<string, unknown>): Record<string, unknown> => ({
				t: column.t,
				i: column.i,
				key: column.key,
				group: column.group,
				after: column.after,
				cell_type: column.cell_type,
			});
			expect((tsResult.columns ?? []).map(stableColumn)).toEqual(
				(phpResult.columns ?? []).map(stableColumn),
			);
		}, 60000);
	}
});

// NDJSON streaming: the protocol lines (meta, interleaved col*/row*, end)
// must match PHP's application/x-ndjson stream line-for-line on the stable
// fields (line ORDER pins the col-before-first-use interleaving).
describe.if(hasPhpCredentials())('tool_export ndjson_stream differential', () => {
	test('grid_value stream lines match PHP', async () => {
		const rqo = GRID_VALUE_RQO('default');
		(rqo.options as Record<string, unknown>).ndjson_stream = true;

		const php = new PhpApiClient();
		await php.login(config.phpReference.username as string, config.phpReference.password as string);
		const phpRaw = await php.callRaw(structuredClone(rqo));
		expect(phpRaw.contentType ?? '').toContain('application/x-ndjson');
		// The stream is adopted LINE BY LINE — the frozen text is one JSON object
		// per line, and the transform is a body transform.
		const phpLines = adoptFrozen(
			phpRaw.text
				.split('\n')
				.filter((line) => line.trim() !== '')
				.map((line) => JSON.parse(line) as Record<string, unknown>),
		);

		const token = createSession(-1, 'root', true);
		const session = getSession(token);
		const principal = await resolvePrincipal(-1);
		const tsOutcome = await dispatchRqo(
			structuredClone(rqo) as never,
			{
				requestId: 't',
				clientIp: '127.0.0.1',
				session,
				csrfCandidate: session?.csrfToken ?? null,
				principal,
			} as never,
		);
		// S2-34: ndjson_stream now answers through the outcome.stream seam (bytes
		// as produced) instead of one buffered body.ndjson string.
		expect(tsOutcome.stream).toBeInstanceOf(ReadableStream);
		const ndjson = await new Response(tsOutcome.stream as ReadableStream<Uint8Array>).text();
		const tsLines = ndjson
			.split('\n')
			.filter((line) => line.trim() !== '')
			.map((line) => JSON.parse(line) as Record<string, unknown>);

		const stable = (line: Record<string, unknown>): Record<string, unknown> => {
			switch (line.t) {
				case 'col':
					return {
						t: line.t,
						i: line.i,
						key: line.key,
						group: line.group,
						after: line.after,
						cell_type: line.cell_type,
					};
				default:
					// meta / row / end compare in full.
					return line;
			}
		};
		expect(phpLines.length).toBeGreaterThan(3);
		expect(tsLines.map(stable)).toEqual(phpLines.map(stable));
	}, 60000);
});

// dedalo_raw: the UNRESOLVED stored value per cell as a JSON string with the
// dedalo_data wrapper; a main with dataframe entries ships
// {dedalo_data:{dato, dataframe}} (test6117@15657 is the frame fixture).
describe.if(hasPhpCredentials())('tool_export dedalo_raw differential', () => {
	const cases = [
		{
			section: 'test6099',
			components: ['test6117', 'test6157'],
			ids: ['15657'],
		},
		{
			section: 'testmint1',
			components: ['testmint1002', 'testmint1006', 'testmint1014'],
			ids: ['2', '75'],
		},
	];
	for (const testCase of cases) {
		test(`${testCase.section} raw cells match PHP byte-for-byte`, async () => {
			const rqo = {
				action: 'tool_request',
				dd_api: 'dd_tools_api',
				prevent_lock: true,
				source: { typo: 'source', model: 'tool_export', action: 'get_export_grid' },
				options: {
					section_tipo: testCase.section,
					model: 'section',
					data_format: 'dedalo_raw',
					breakdown: 'default',
					ar_ddo_to_export: testCase.components.map((component) => ({
						path: [{ section_tipo: testCase.section, component_tipo: component, name: component }],
					})),
					sqo: {
						section_tipo: [testCase.section],
						limit: 0,
						offset: 0,
						filter_by_locators: testCase.ids.map((id) => ({
							section_tipo: testCase.section,
							section_id: id,
						})),
					},
				},
			};
			const php = new PhpApiClient();
			await php.login(
				config.phpReference.username as string,
				config.phpReference.password as string,
			);
			const phpResult =
				(adoptFrozen((await php.call(structuredClone(rqo))).body) as { result?: Grid }).result ??
				{};

			const token = createSession(-1, 'root', true);
			const session = getSession(token);
			const principal = await resolvePrincipal(-1);
			const tsResult = ((
				(
					await dispatchRqo(
						structuredClone(rqo) as never,
						{
							requestId: 't',
							clientIp: '127.0.0.1',
							session,
							csrfCandidate: session?.csrfToken ?? null,
							principal,
						} as never,
					)
				).body as { data?: Grid }
			).data ?? {}) as Grid;

			const stripRow = (row: Record<string, unknown>): Record<string, unknown> => ({
				rec: row.rec,
				sub: row.sub,
				c: row.c,
			});
			expect(phpResult.rows?.length ?? 0).toBeGreaterThan(0);
			expect((tsResult.rows ?? []).map(stripRow)).toEqual((phpResult.rows ?? []).map(stripRow));
			const stableColumn = (column: Record<string, unknown>): Record<string, unknown> => ({
				t: column.t,
				i: column.i,
				key: column.key,
				cell_type: column.cell_type,
				model: column.model,
			});
			expect((tsResult.columns ?? []).map(stableColumn)).toEqual(
				(phpResult.columns ?? []).map(stableColumn),
			);
		}, 60000);
	}
});

// Multi-hop export paths: the export-atoms recursion — the column is the
// FIRST step; the value walks each hop's locators to the leaf. Separators:
// first indexed level ' | ', deeper levels the component's declared
// fields_separator (testmint1006 ', ', testmint1014 ' | '); iri values carry
// their dd560 label ('…, Zenon'); date ranges render 'start <> end'.
describe.if(hasPhpCredentials())('tool_export multi-hop path differential', () => {
	const leaves = [
		{ component_tipo: 'testmint1002', model: 'component_input_text' },
		{ component_tipo: 'testmint1006', model: 'component_autocomplete_hi' },
		{ component_tipo: 'testmint1014', model: 'component_portal' },
	];
	for (const leaf of leaves) {
		test(`test6113 → ${leaf.component_tipo} rows match PHP byte-for-byte`, async () => {
			const rqo = {
				action: 'tool_request',
				dd_api: 'dd_tools_api',
				prevent_lock: true,
				source: { typo: 'source', model: 'tool_export', action: 'get_export_grid' },
				options: {
					section_tipo: 'test6099',
					model: 'section',
					data_format: 'value',
					breakdown: 'default',
					ar_ddo_to_export: [
						{
							path: [
								{
									section_tipo: 'test6099',
									component_tipo: 'test6113',
									model: 'component_portal',
									name: 'Ceca',
								},
								{ section_tipo: 'testmint1', ...leaf, name: leaf.component_tipo },
							],
						},
					],
					sqo: {
						section_tipo: ['test6099'],
						limit: 0,
						offset: 0,
						filter_by_locators: [
							{ section_tipo: 'test6099', section_id: '1' },
							{ section_tipo: 'test6099', section_id: '2' },
						],
					},
				},
			};
			const php = new PhpApiClient();
			await php.login(
				config.phpReference.username as string,
				config.phpReference.password as string,
			);
			const phpResult =
				(adoptFrozen((await php.call(structuredClone(rqo))).body) as { result?: Grid }).result ??
				{};

			const token = createSession(-1, 'root', true);
			const session = getSession(token);
			const principal = await resolvePrincipal(-1);
			const tsResult = ((
				(
					await dispatchRqo(
						structuredClone(rqo) as never,
						{
							requestId: 't',
							clientIp: '127.0.0.1',
							session,
							csrfCandidate: session?.csrfToken ?? null,
							principal,
						} as never,
					)
				).body as { data?: Grid }
			).data ?? {}) as Grid;

			const stripRow = (row: Record<string, unknown>): Record<string, unknown> => ({
				rec: row.rec,
				sub: row.sub,
				c: row.c,
			});
			expect(phpResult.rows?.length ?? 0).toBeGreaterThan(0);
			expect((tsResult.rows ?? []).map(stripRow)).toEqual((phpResult.rows ?? []).map(stripRow));
			// Column identity = the FIRST path step.
			expect((tsResult.columns ?? [])[0]?.key).toBe((phpResult.columns ?? [])[0]?.key as string);
		}, 60000);
	}
});

// grid_value MULTI-HOP atoms: a 2-hop path (test6113 → testmint1006) —
// the index VECTOR places atoms per breakdown: 'default' explodes the FIRST
// indexed level into sub-rows and suffixes deeper levels ('|1' columns);
// 'rows' explodes every level vertically; 'columns' suffixes every level at
// height 1. Column keys chain every declared step + the resolved leaf target.
describe.if(hasPhpCredentials())('tool_export grid_value multi-hop differential', () => {
	for (const breakdown of ['default', 'rows', 'columns']) {
		test(`multi-hop breakdown '${breakdown}' matches PHP`, async () => {
			const rqo = {
				action: 'tool_request',
				dd_api: 'dd_tools_api',
				prevent_lock: true,
				source: { typo: 'source', model: 'tool_export', action: 'get_export_grid' },
				options: {
					section_tipo: 'test6099',
					model: 'section',
					data_format: 'grid_value',
					breakdown,
					ar_ddo_to_export: [
						{
							path: [
								{
									section_tipo: 'test6099',
									component_tipo: 'test6134',
									model: 'component_input_text',
									name: 'Ref',
								},
							],
						},
						{
							path: [
								{
									section_tipo: 'test6099',
									component_tipo: 'test6113',
									model: 'component_portal',
									name: 'Ceca',
								},
								{
									section_tipo: 'testmint1',
									component_tipo: 'testmint1006',
									model: 'component_autocomplete_hi',
									name: 'Cultura',
								},
							],
						},
					],
					sqo: {
						section_tipo: ['test6099'],
						limit: 0,
						offset: 0,
						filter_by_locators: [
							{ section_tipo: 'test6099', section_id: '1' },
							{ section_tipo: 'test6099', section_id: '2' },
						],
					},
				},
			};
			const php = new PhpApiClient();
			await php.login(
				config.phpReference.username as string,
				config.phpReference.password as string,
			);
			const phpResult =
				(adoptFrozen((await php.call(structuredClone(rqo))).body) as { result?: Grid }).result ??
				{};
			const token = createSession(-1, 'root', true);
			const session = getSession(token);
			const principal = await resolvePrincipal(-1);
			const tsResult = ((
				(
					await dispatchRqo(
						structuredClone(rqo) as never,
						{
							requestId: 't',
							clientIp: '127.0.0.1',
							session,
							csrfCandidate: session?.csrfToken ?? null,
							principal,
						} as never,
					)
				).body as { data?: Grid }
			).data ?? {}) as Grid;

			const stripRow = (row: Record<string, unknown>): Record<string, unknown> => ({
				rec: row.rec,
				sub: row.sub,
				c: row.c,
			});
			expect(phpResult.rows?.length ?? 0).toBeGreaterThan(0);
			expect((tsResult.rows ?? []).map(stripRow)).toEqual((phpResult.rows ?? []).map(stripRow));
			const stableColumn = (column: Record<string, unknown>): Record<string, unknown> => ({
				t: column.t,
				i: column.i,
				key: column.key,
				group: column.group,
				after: column.after,
			});
			expect((tsResult.columns ?? []).map(stableColumn)).toEqual(
				(phpResult.columns ?? []).map(stableColumn),
			);
		}, 60000);
	}
});

// Media cells: the export value of an image component is the ABSOLUTE URL of
// its default quality (files_info file_path under the configured public
// media base); the column carries cell_type 'img'.
describe.if(hasPhpCredentials())('tool_export media cell differential', () => {
	test('image cells are the 1.5MB quality URLs, byte-equal vs PHP', async () => {
		const rqo = {
			action: 'tool_request',
			dd_api: 'dd_tools_api',
			prevent_lock: true,
			source: { typo: 'source', model: 'tool_export', action: 'get_export_grid' },
			options: {
				section_tipo: MEDIA_SECTION,
				model: 'section',
				data_format: 'value',
				breakdown: 'default',
				ar_ddo_to_export: [
					{
						path: [
							{
								section_tipo: MEDIA_SECTION,
								component_tipo: MEDIA_IMAGE,
								model: 'component_image',
								name: 'Imagen',
							},
						],
					},
					{
						path: [
							{
								section_tipo: MEDIA_SECTION,
								component_tipo: MEDIA_NAME,
								model: 'component_input_text',
								name: 'Nombre',
							},
						],
					},
				],
				sqo: {
					section_tipo: [MEDIA_SECTION],
					limit: 0,
					offset: 0,
					filter_by_locators: [
						{ section_tipo: MEDIA_SECTION, section_id: '32891' },
						{ section_tipo: MEDIA_SECTION, section_id: '32900' },
					],
				},
			},
		};
		const php = new PhpApiClient();
		await php.login(config.phpReference.username as string, config.phpReference.password as string);
		const phpResult =
			(adoptFrozen((await php.call(structuredClone(rqo))).body, 'none') as { result?: Grid })
				.result ?? {};
		const token = createSession(-1, 'root', true);
		const session = getSession(token);
		const principal = await resolvePrincipal(-1);
		const tsResult = ((
			(
				await dispatchRqo(
					structuredClone(rqo) as never,
					{
						requestId: 't',
						clientIp: '127.0.0.1',
						session,
						csrfCandidate: session?.csrfToken ?? null,
						principal,
					} as never,
				)
			).body as { data?: Grid }
		).data ?? {}) as Grid;

		const stripRow = (row: Record<string, unknown>): Record<string, unknown> => ({
			rec: row.rec,
			sub: row.sub,
			c: row.c,
		});
		expect(phpResult.rows?.length ?? 0).toBeGreaterThan(0);
		expect((tsResult.rows ?? []).map(stripRow)).toEqual((phpResult.rows ?? []).map(stripRow));
		expect((tsResult.columns ?? [])[0]?.cell_type).toBe('img');
		expect((phpResult.columns ?? [])[0]?.cell_type).toBe('img');
	}, 60000);
});
