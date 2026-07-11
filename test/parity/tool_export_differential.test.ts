/**
 * Phase 6 gate: tool_export.get_export_grid vs live PHP — the flat export
 * table. ROW VALUES are the parity target (the export-atoms leaf contract):
 * every cell must equal PHP's flat display string, including a
 * portal-resolved label. Columns compare on the stable identity fields
 * (key/label/cell_type/i); the enriched path internals stay PHP-side detail.
 */

import { beforeAll, describe, expect, test } from 'bun:test';
import { config } from '../../src/config/config.ts';
import { dispatchRqo } from '../../src/core/api/dispatch.ts';
import { resolvePrincipal } from '../../src/core/security/permissions.ts';
import { createSession, getSession } from '../../src/core/security/session_store.ts';
import { PhpApiClient, hasPhpCredentials } from './php_client.ts';

const EXPORT_RQO = {
	action: 'tool_request',
	dd_api: 'dd_tools_api',
	prevent_lock: true,
	source: { typo: 'source', model: 'tool_export', action: 'get_export_grid' },
	options: {
		section_tipo: 'numisdata6',
		model: 'section',
		data_format: 'rows',
		breakdown: 'default',
		ar_ddo_to_export: [
			{
				path: [
					{
						section_tipo: 'numisdata6',
						component_tipo: 'numisdata16',
						model: 'component_input_text',
						name: 'Ceca',
					},
				],
			},
			{
				path: [
					{
						section_tipo: 'numisdata6',
						component_tipo: 'numisdata585',
						model: 'component_autocomplete_hi',
						name: 'Topónimo',
					},
				],
			},
		],
		sqo: {
			section_tipo: ['numisdata6'],
			limit: 0,
			offset: 0,
			filter_by_locators: [
				{ section_tipo: 'numisdata6', section_id: '1' },
				{ section_tipo: 'numisdata6', section_id: '75' },
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
	if (!hasPhpCredentials()) return;
	const php = new PhpApiClient();
	await php.login(config.phpReference.username as string, config.phpReference.password as string);
	phpGrid =
		(
			(await php.call(structuredClone(EXPORT_RQO) as Record<string, unknown>)).body as {
				result?: Grid;
			}
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
	tsGrid = ((tsResult.body as { result?: Grid }).result ?? {}) as Grid;
});

describe.if(hasPhpCredentials())('tool_export grid differential', () => {
	test('meta total + row VALUES match PHP exactly', () => {
		if (!hasPhpCredentials()) return;
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
		if (!hasPhpCredentials()) return;
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
// numisdata20 (autocomplete_hi): record 2 targets terr1 AND utoponymy1.
const GRID_VALUE_RQO = (breakdown: string): Record<string, unknown> => ({
	action: 'tool_request',
	dd_api: 'dd_tools_api',
	prevent_lock: true,
	source: { typo: 'source', model: 'tool_export', action: 'get_export_grid' },
	options: {
		section_tipo: 'numisdata6',
		model: 'section',
		data_format: 'grid_value',
		breakdown,
		ar_ddo_to_export: [
			{
				path: [
					{
						section_tipo: 'numisdata6',
						component_tipo: 'numisdata16',
						model: 'component_input_text',
						name: 'Ceca',
					},
				],
			},
			{
				path: [
					{
						section_tipo: 'numisdata6',
						component_tipo: 'numisdata20',
						model: 'component_autocomplete_hi',
						name: 'Cultura',
					},
				],
			},
		],
		sqo: {
			section_tipo: ['numisdata6'],
			limit: 0,
			offset: 0,
			filter_by_locators: [
				{ section_tipo: 'numisdata6', section_id: '2' },
				{ section_tipo: 'numisdata6', section_id: '75' },
			],
		},
	},
});

describe.if(hasPhpCredentials())('tool_export grid_value breakdown differential', () => {
	for (const breakdown of ['default', 'rows', 'columns']) {
		test(`breakdown '${breakdown}' rows + columns match PHP`, async () => {
			if (!hasPhpCredentials()) return;
			const php = new PhpApiClient();
			await php.login(
				config.phpReference.username as string,
				config.phpReference.password as string,
			);
			const phpResult =
				((await php.call(GRID_VALUE_RQO(breakdown))).body as { result?: Grid }).result ?? {};

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
				).body as { result?: Grid }
			).result ?? {}) as Grid;

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
		if (!hasPhpCredentials()) return;
		const rqo = GRID_VALUE_RQO('default');
		(rqo.options as Record<string, unknown>).ndjson_stream = true;

		const php = new PhpApiClient();
		await php.login(config.phpReference.username as string, config.phpReference.password as string);
		const phpRaw = await php.callRaw(structuredClone(rqo));
		expect(phpRaw.contentType ?? '').toContain('application/x-ndjson');
		const phpLines = phpRaw.text
			.split('\n')
			.filter((line) => line.trim() !== '')
			.map((line) => JSON.parse(line) as Record<string, unknown>);

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
// {dedalo_data:{dato, dataframe}} (numisdata34@15657 is the frame fixture).
describe.if(hasPhpCredentials())('tool_export dedalo_raw differential', () => {
	const cases = [
		{
			section: 'numisdata3',
			components: ['numisdata34', 'numisdata77'],
			ids: ['15657'],
		},
		{
			section: 'numisdata6',
			components: ['numisdata16', 'numisdata20', 'numisdata163'],
			ids: ['2', '75'],
		},
	];
	for (const testCase of cases) {
		test(`${testCase.section} raw cells match PHP byte-for-byte`, async () => {
			if (!hasPhpCredentials()) return;
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
				((await php.call(structuredClone(rqo))).body as { result?: Grid }).result ?? {};

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
				).body as { result?: Grid }
			).result ?? {}) as Grid;

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
// fields_separator (numisdata20 ', ', numisdata163 ' | '); iri values carry
// their dd560 label ('…, Zenon'); date ranges render 'start <> end'.
describe.if(hasPhpCredentials())('tool_export multi-hop path differential', () => {
	const leaves = [
		{ component_tipo: 'numisdata16', model: 'component_input_text' },
		{ component_tipo: 'numisdata20', model: 'component_autocomplete_hi' },
		{ component_tipo: 'numisdata163', model: 'component_portal' },
	];
	for (const leaf of leaves) {
		test(`numisdata30 → ${leaf.component_tipo} rows match PHP byte-for-byte`, async () => {
			if (!hasPhpCredentials()) return;
			const rqo = {
				action: 'tool_request',
				dd_api: 'dd_tools_api',
				prevent_lock: true,
				source: { typo: 'source', model: 'tool_export', action: 'get_export_grid' },
				options: {
					section_tipo: 'numisdata3',
					model: 'section',
					data_format: 'value',
					breakdown: 'default',
					ar_ddo_to_export: [
						{
							path: [
								{
									section_tipo: 'numisdata3',
									component_tipo: 'numisdata30',
									model: 'component_portal',
									name: 'Ceca',
								},
								{ section_tipo: 'numisdata6', ...leaf, name: leaf.component_tipo },
							],
						},
					],
					sqo: {
						section_tipo: ['numisdata3'],
						limit: 0,
						offset: 0,
						filter_by_locators: [
							{ section_tipo: 'numisdata3', section_id: '1' },
							{ section_tipo: 'numisdata3', section_id: '2' },
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
				((await php.call(structuredClone(rqo))).body as { result?: Grid }).result ?? {};

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
				).body as { result?: Grid }
			).result ?? {}) as Grid;

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

// grid_value MULTI-HOP atoms: a 2-hop path (numisdata30 → numisdata20) —
// the index VECTOR places atoms per breakdown: 'default' explodes the FIRST
// indexed level into sub-rows and suffixes deeper levels ('|1' columns);
// 'rows' explodes every level vertically; 'columns' suffixes every level at
// height 1. Column keys chain every declared step + the resolved leaf target.
describe.if(hasPhpCredentials())('tool_export grid_value multi-hop differential', () => {
	for (const breakdown of ['default', 'rows', 'columns']) {
		test(`multi-hop breakdown '${breakdown}' matches PHP`, async () => {
			if (!hasPhpCredentials()) return;
			const rqo = {
				action: 'tool_request',
				dd_api: 'dd_tools_api',
				prevent_lock: true,
				source: { typo: 'source', model: 'tool_export', action: 'get_export_grid' },
				options: {
					section_tipo: 'numisdata3',
					model: 'section',
					data_format: 'grid_value',
					breakdown,
					ar_ddo_to_export: [
						{
							path: [
								{
									section_tipo: 'numisdata3',
									component_tipo: 'numisdata52',
									model: 'component_input_text',
									name: 'Ref',
								},
							],
						},
						{
							path: [
								{
									section_tipo: 'numisdata3',
									component_tipo: 'numisdata30',
									model: 'component_portal',
									name: 'Ceca',
								},
								{
									section_tipo: 'numisdata6',
									component_tipo: 'numisdata20',
									model: 'component_autocomplete_hi',
									name: 'Cultura',
								},
							],
						},
					],
					sqo: {
						section_tipo: ['numisdata3'],
						limit: 0,
						offset: 0,
						filter_by_locators: [
							{ section_tipo: 'numisdata3', section_id: '1' },
							{ section_tipo: 'numisdata3', section_id: '2' },
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
				((await php.call(structuredClone(rqo))).body as { result?: Grid }).result ?? {};
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
				).body as { result?: Grid }
			).result ?? {}) as Grid;

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
		if (!hasPhpCredentials()) return;
		const rqo = {
			action: 'tool_request',
			dd_api: 'dd_tools_api',
			prevent_lock: true,
			source: { typo: 'source', model: 'tool_export', action: 'get_export_grid' },
			options: {
				section_tipo: 'rsc170',
				model: 'section',
				data_format: 'value',
				breakdown: 'default',
				ar_ddo_to_export: [
					{
						path: [
							{
								section_tipo: 'rsc170',
								component_tipo: 'rsc29',
								model: 'component_image',
								name: 'Imagen',
							},
						],
					},
					{
						path: [
							{
								section_tipo: 'rsc170',
								component_tipo: 'rsc25',
								model: 'component_input_text',
								name: 'Nombre',
							},
						],
					},
				],
				sqo: {
					section_tipo: ['rsc170'],
					limit: 0,
					offset: 0,
					filter_by_locators: [
						{ section_tipo: 'rsc170', section_id: '32891' },
						{ section_tipo: 'rsc170', section_id: '32900' },
					],
				},
			},
		};
		const php = new PhpApiClient();
		await php.login(config.phpReference.username as string, config.phpReference.password as string);
		const phpResult =
			((await php.call(structuredClone(rqo))).body as { result?: Grid }).result ?? {};
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
			).body as { result?: Grid }
		).result ?? {}) as Grid;

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
