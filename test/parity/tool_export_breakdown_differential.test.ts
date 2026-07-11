/**
 * tool_export DEEP-BREAKDOWN differential vs live PHP — the oracle gate of
 * the 2026-07-08 export_tabulator rebuild (multi-author bibliography export).
 *
 * Corpus: 3-hop export paths (bibliography portal → rsc368 Publication →
 * rsc140 Title / rsc224 Date / rsc139 Authorship) on real records whose
 * publications have MULTIPLE authors, so every placement rule the legacy TS
 * math got wrong is load-bearing here:
 *   - per-SEGMENT '|n' suffix keys ('...rsc368|1.rsc205_rsc140') — the
 *     collision-free rule ('columns'/'default' modes);
 *   - the item TREE (max-aligned axes): author rows nest under their
 *     publication and title/date FILL DOWN the span ('rows' mode +
 *     fill_the_gaps on/off);
 *   - relation-leaf fan-out into ALL request_config children (rsc139 →
 *     rsc86 Surname AND rsc85 Name — one column each);
 *   - deterministic column order (sort_key/shorter-first/seq), ' N+1' label
 *     suffixes, ar_labels alternation, 'after' hints, and the 'end' line's
 *     AUTHORITATIVE display order;
 *   - value format: ddos sharing the SAME top component dedupe into ONE
 *     column (PHP register-by-key; later non-empty flats overwrite).
 *
 * PROJECTION = the contract: columns compare on
 * {i, key, group, label, ar_labels, cell_type, model, after}; rows are
 * byte-equal on {rec, sub, c}; 'end' on its columns order. The enriched
 * `path` payload internals stay PHP-side detail (as in the base
 * tool_export_differential).
 *
 * (!) PHP LIVE DEFECT (not gated, ledgered): get_export_grid 500s with
 * "Call to a member function set_locator() on null" when a ddo's first path
 * step is NOT a component of the exported section; TS skips such ddos per
 * PHP's own get_record_atoms guard. A 500 cannot be pinned differentially.
 *
 * READ-ONLY: every request is a read; no scratch records needed.
 */

import { beforeAll, describe, expect, test } from 'bun:test';
import { config } from '../../src/config/config.ts';
import { dispatchRqo } from '../../src/core/api/dispatch.ts';
import { resolvePrincipal } from '../../src/core/security/permissions.ts';
import { createSession, getSession } from '../../src/core/security/session_store.ts';
import { PhpApiClient, hasPhpCredentials } from './php_client.ts';

type Grid = {
	meta?: Record<string, unknown>;
	columns?: Record<string, unknown>[];
	rows?: Record<string, unknown>[];
	end?: Record<string, unknown> | null;
};

/** The two bibliography corpora: portal tipo differs per section. */
const CORPUS = [
	{
		name: 'numisdata6 §2 (Mint, 22 refs, multi-author pubs)',
		section: 'numisdata6',
		id: '2',
		portal: 'numisdata163',
	},
	{
		name: 'numisdata3 §1490 (Type, 3 refs, 2-author pub)',
		section: 'numisdata3',
		id: '1490',
		portal: 'numisdata75',
	},
] as const;

const COMBOS: { format: string; breakdown: string; fill: boolean }[] = [
	{ format: 'value', breakdown: 'default', fill: true },
	{ format: 'grid_value', breakdown: 'default', fill: true },
	{ format: 'grid_value', breakdown: 'default', fill: false },
	{ format: 'grid_value', breakdown: 'rows', fill: true },
	{ format: 'grid_value', breakdown: 'rows', fill: false },
	{ format: 'grid_value', breakdown: 'columns', fill: true },
	{ format: 'dedalo_raw', breakdown: 'default', fill: true },
];

function buildRqo(
	corpus: (typeof CORPUS)[number],
	format: string,
	breakdown: string,
	fill: boolean,
	/** true = ONE single-step ddo [portal] — the tool-UI shape: the whole
	 * chain resolves through the leaf fan-out (own request_config recursion,
	 * nested rsc368 → its OWN map, NOT the portal map's 'self' children —
	 * the 2026-07-08 map-owner fix). */
	singleStepPortal = false,
): Record<string, unknown> {
	const STEP_PORTAL = {
		section_tipo: corpus.section,
		component_tipo: corpus.portal,
		model: 'component_portal',
		name: 'Bibliography',
	};
	if (singleStepPortal) {
		return {
			action: 'tool_request',
			dd_api: 'dd_tools_api',
			prevent_lock: true,
			source: { typo: 'source', model: 'tool_export', action: 'get_export_grid' },
			options: {
				section_tipo: corpus.section,
				model: 'section',
				data_format: format,
				breakdown,
				fill_the_gaps: fill,
				ar_ddo_to_export: [{ path: [STEP_PORTAL] }],
				sqo: {
					section_tipo: [corpus.section],
					limit: 0,
					offset: 0,
					filter_by_locators: [{ section_tipo: corpus.section, section_id: corpus.id }],
				},
			},
		};
	}
	const STEP_PUB = {
		section_tipo: 'rsc332',
		component_tipo: 'rsc368',
		model: 'component_autocomplete',
		name: 'Publication',
	};
	return {
		action: 'tool_request',
		dd_api: 'dd_tools_api',
		prevent_lock: true,
		source: { typo: 'source', model: 'tool_export', action: 'get_export_grid' },
		options: {
			section_tipo: corpus.section,
			model: 'section',
			data_format: format,
			breakdown,
			fill_the_gaps: fill,
			ar_ddo_to_export: [
				{
					path: [
						STEP_PORTAL,
						STEP_PUB,
						{
							section_tipo: 'rsc205',
							component_tipo: 'rsc140',
							model: 'component_input_text',
							name: 'Title',
						},
					],
				},
				{
					path: [
						STEP_PORTAL,
						STEP_PUB,
						{
							section_tipo: 'rsc205',
							component_tipo: 'rsc224',
							model: 'component_date',
							name: 'Date',
						},
					],
				},
				{
					path: [
						STEP_PORTAL,
						STEP_PUB,
						{
							section_tipo: 'rsc205',
							component_tipo: 'rsc139',
							model: 'component_autocomplete',
							name: 'Authorship',
						},
					],
				},
			],
			sqo: {
				section_tipo: [corpus.section],
				limit: 0,
				offset: 0,
				filter_by_locators: [{ section_tipo: corpus.section, section_id: corpus.id }],
			},
		},
	};
}

const colProjection = (column: Record<string, unknown>): Record<string, unknown> => ({
	i: column.i,
	key: column.key,
	group: column.group,
	label: column.label,
	ar_labels: column.ar_labels,
	cell_type: column.cell_type,
	model: column.model,
	after: column.after,
});
const rowProjection = (row: Record<string, unknown>): Record<string, unknown> => ({
	rec: String(row.rec),
	sub: row.sub,
	c: row.c,
});

let php: PhpApiClient;
let session: ReturnType<typeof getSession>;
let principal: Awaited<ReturnType<typeof resolvePrincipal>>;

beforeAll(async () => {
	if (!hasPhpCredentials()) return;
	php = new PhpApiClient();
	await php.login(config.phpReference.username as string, config.phpReference.password as string);
	const token = createSession(-1, 'root', true);
	session = getSession(token);
	principal = await resolvePrincipal(-1);
});

describe.if(hasPhpCredentials())('tool_export deep-breakdown differential', () => {
	for (const corpus of CORPUS) {
		for (const combo of COMBOS) {
			const tag = `${corpus.name} — ${combo.format}/${combo.breakdown}${combo.fill ? '' : ' fill_the_gaps=false'}`;
			test(tag, async () => {
				if (!hasPhpCredentials()) return;
				const rqo = buildRqo(corpus, combo.format, combo.breakdown, combo.fill);

				const phpGrid = ((
					(await php.call(structuredClone(rqo) as Record<string, unknown>)).body as {
						result?: Grid;
					}
				).result ?? {}) as Grid;

				const tsResult = await dispatchRqo(
					structuredClone(rqo) as never,
					{
						requestId: 'breakdown-diff',
						clientIp: '127.0.0.1',
						session,
						csrfCandidate: session?.csrfToken ?? null,
						principal,
					} as never,
				);
				const tsGrid = ((tsResult.body as { result?: Grid }).result ?? {}) as Grid;

				// Non-vacuous: the corpus must produce columns AND rows on PHP.
				expect(phpGrid.columns?.length ?? 0).toBeGreaterThan(0);
				expect(phpGrid.rows?.length ?? 0).toBeGreaterThan(0);

				// Columns: identity + labels + order hints.
				expect((tsGrid.columns ?? []).map(colProjection)).toEqual(
					(phpGrid.columns ?? []).map(colProjection),
				);
				// Rows: byte-equal cells.
				expect((tsGrid.rows ?? []).map(rowProjection)).toEqual(
					(phpGrid.rows ?? []).map(rowProjection),
				);
				// End: the AUTHORITATIVE display order.
				expect(tsGrid.end?.columns ?? null).toEqual(phpGrid.end?.columns ?? null);
				// Meta total.
				expect(tsGrid.meta?.total).toBe(phpGrid.meta?.total as number);
			}, 60000);
		}
	}

	// WC-008 DIVERGENCE PIN (deliberate, user-approved 2026-07-08): a
	// SINGLE-step [portal] ddo (the tool-UI shape — the portal dragged WITHOUT
	// expanding) exports COMPACT per-reference cells on TS: ONE base column,
	// each referenced record's FULL flat info in ONE cell, exploded by row
	// (default/rows) or by '|n' column (columns). PHP instead fans out into
	// deep field columns — that resolution stays available on TS by dragging
	// the EXPANDED child components (the multi-step paths gated above). Both
	// behaviors are asserted (asymmetric pin, DEC-02/DEC-15).
	for (const corpus of CORPUS) {
		for (const breakdown of ['default', 'rows', 'columns']) {
			test(`${corpus.name} — WC-008 single-step portal COMPACT grid_value/${breakdown}`, async () => {
				if (!hasPhpCredentials()) return;
				const rqo = buildRqo(corpus, 'grid_value', breakdown, true, true);
				const phpGrid = ((
					(await php.call(structuredClone(rqo) as Record<string, unknown>)).body as {
						result?: Grid;
					}
				).result ?? {}) as Grid;
				const tsResult = await dispatchRqo(
					structuredClone(rqo) as never,
					{
						requestId: 'breakdown-diff',
						clientIp: '127.0.0.1',
						session,
						csrfCandidate: session?.csrfToken ?? null,
						principal,
					} as never,
				);
				const tsGrid = ((tsResult.body as { result?: Grid }).result ?? {}) as Grid;

				// PHP side of the pin: the oracle FANS OUT — multi-segment keys.
				expect(phpGrid.columns?.length ?? 0).toBeGreaterThan(1);
				expect((phpGrid.columns ?? []).some((column) => String(column.key).includes('.'))).toBe(
					true,
				);

				// TS side: COMPACT — every column is the portal base key (+ '|n'
				// in columns mode), single segment, no fan-out chains.
				const baseKey = `${corpus.section}_${corpus.portal}`;
				const tsColumns = tsGrid.columns ?? [];
				expect(tsColumns.length).toBeGreaterThan(0);
				for (const column of tsColumns) {
					expect(String(column.key).startsWith(baseKey)).toBe(true);
					expect(String(column.key)).not.toContain('.');
				}
				if (breakdown === 'columns') {
					// one column per reference, one row per record
					expect(tsColumns.length).toBeGreaterThan(1);
					expect(String(tsColumns[1]?.key)).toBe(`${baseKey}|1`);
					expect((tsGrid.rows ?? []).every((row) => row.sub === 0)).toBe(true);
				} else {
					// one base column, one row per reference
					expect(tsColumns.length).toBe(1);
					expect((tsGrid.rows ?? []).length).toBeGreaterThan(1);
				}
				// The feature itself: a reference's FULL info lands in ONE cell —
				// author AND title of the same publication share a cell string.
				const allCells = (tsGrid.rows ?? []).flatMap((row) =>
					Object.values((row.c ?? {}) as Record<string, string>).map(String),
				);
				expect(allCells.some((cell) => cell.includes('Amela') && cell.includes('Luis'))).toBe(true);
			}, 60000);
		}
	}

	test('value format dedupes same-top-component ddos into ONE column (PHP register-by-key)', async () => {
		if (!hasPhpCredentials()) return;
		const rqo = buildRqo(CORPUS[1], 'value', 'default', true);
		const tsResult = await dispatchRqo(
			structuredClone(rqo) as never,
			{
				requestId: 'breakdown-diff',
				clientIp: '127.0.0.1',
				session,
				csrfCandidate: session?.csrfToken ?? null,
				principal,
			} as never,
		);
		const tsGrid = ((tsResult.body as { result?: Grid }).result ?? {}) as Grid;
		// Three ddos share the numisdata75 top component → one column.
		expect(tsGrid.columns?.length).toBe(1);
		expect(tsGrid.columns?.[0]?.key).toBe('numisdata3_numisdata75');
	});
});
