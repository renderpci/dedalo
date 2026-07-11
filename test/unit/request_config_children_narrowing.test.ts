/**
 * Caller-children NARROWING of an element's request_config (PHP get_subdatum
 * children-injection, class.common.php:2598-2681): when the CALLER's ddo_map
 * declares descendants for a subdatum-capable element (a section_list
 * re-declaring a portal's subcolumns, or a client-sent show map), those
 * descendants REPLACE the element's own show.ddo_map — first dedalo config item
 * only; empty children leave the element's ontology map standing.
 *
 * Live corpus anchor: oh1's section_list oh7 declares the oh25 portal column
 * WITH children rsc62/rsc63/rsc35 (parent:'oh25'), while oh25's own ontology
 * ddo_map is [rsc20, rsc19, rsc23, rsc62, rsc36, rsc35] — the narrowed show map
 * and the portal sort leaf (order path step 2) must both follow the caller.
 */

import { describe, expect, test } from 'bun:test';
import type { Ddo } from '../../src/core/concepts/ddo.ts';
import { sql } from '../../src/core/db/postgres.ts';
import { runWithRequestLangs } from '../../src/core/resolve/request_lang.ts';
import { buildStructureContext } from '../../src/core/resolve/structure_context.ts';
import { collectCallerDescendants, readSection } from '../../src/core/section/read.ts';

// DB reachability probe (tool_import_files convention): only a genuinely
// unreachable DB downgrades the corpus drives to a visible SKIP.
let hasDb = false;
try {
	await sql`SELECT 1`;
	hasDb = true;
} catch {
	console.warn('[request_config_children_narrowing] DB unavailable — corpus drives SKIPPED');
}

const ddo = (tipo: string, parent: string, extra: Record<string, unknown> = {}): Ddo =>
	({ tipo, parent, section_tipo: 'xx1', mode: 'list', ...extra }) as unknown as Ddo;

describe('collectCallerDescendants (PHP $get_children_recursive)', () => {
	test('collects recursively — child then its own descendants, order-preserving', () => {
		const map = [
			ddo('p1', 'xx1'),
			ddo('c1', 'p1'),
			ddo('g1', 'c1'), // grandchild lands in the SAME flat list
			ddo('c2', 'p1'),
			ddo('other', 'xx1'),
		];
		expect(collectCallerDescendants(map, 'p1').map((d) => d.tipo)).toEqual(['c1', 'g1', 'c2']);
	});

	test('no descendants → empty (the element keeps its own ontology map)', () => {
		const map = [ddo('p1', 'xx1'), ddo('other', 'xx1')];
		expect(collectCallerDescendants(map, 'p1')).toEqual([]);
	});

	test('a malformed cyclic map terminates instead of recursing forever', () => {
		const map = [ddo('a', 'p1'), ddo('b', 'a'), ddo('a', 'b')];
		expect(collectCallerDescendants(map, 'p1').map((d) => d.tipo)).toEqual(['a', 'b']);
	});
});

describe.if(hasDb)('caller-children narrowing (oh25 corpus)', () => {
	const withLangs = <T>(fn: () => Promise<T>): Promise<T> =>
		runWithRequestLangs({ applicationLang: 'lg-spa', dataLang: 'lg-spa' }, fn);

	test('caller children REPLACE the portal show map; sort leaf follows (oh7 → oh25)', async () => {
		const entry = await withLangs(() =>
			buildStructureContext({
				tipo: 'oh25',
				sectionTipo: 'oh1',
				mode: 'list',
				lang: 'lg-spa',
				permissions: 1,
				parent: 'oh1',
				rqoChildrenDdos: [
					{ tipo: 'rsc62', parent: 'oh25', section_tipo: 'rsc167' },
					{ tipo: 'rsc63', parent: 'oh25', section_tipo: 'rsc167' },
					{ tipo: 'rsc35', parent: 'oh25', section_tipo: 'rsc167' },
				],
			}),
		);
		const config = entry?.request_config as
			| { api_engine: string; show: { ddo_map: { tipo: string }[] } | null }[]
			| undefined;
		expect(config?.[0]?.show?.ddo_map.map((d) => d.tipo)).toEqual(['rsc62', 'rsc63', 'rsc35']);
		// The order path's portal leaf reads the NARROWED map (PHP portal
		// get_order_path consumes the injected instance config, :404).
		const path = entry?.path as { component_tipo: string; section_tipo: string }[];
		expect(path.map((s) => s.component_tipo)).toEqual(['oh25', 'rsc62']);
		expect(path[1]?.section_tipo).toBe('rsc167');
	});

	test('no caller children → the element own ontology map stands (rsc20 leads)', async () => {
		const entry = await withLangs(() =>
			buildStructureContext({
				tipo: 'oh25',
				sectionTipo: 'oh1',
				mode: 'list',
				lang: 'lg-spa',
				permissions: 1,
				parent: 'oh1',
			}),
		);
		const config = entry?.request_config as
			| { show: { ddo_map: { tipo: string }[] } | null }[]
			| undefined;
		expect(config?.[0]?.show?.ddo_map[0]?.tipo).toBe('rsc20');
	});

	test('the full list read narrows server-side (first load sends no ddo_map)', async () => {
		const result = await withLangs(() =>
			readSection({
				dd_api: 'dd_core_api',
				action: 'read',
				prevent_lock: true,
				source: {
					model: 'section',
					tipo: 'oh1',
					section_tipo: 'oh1',
					mode: 'list',
					lang: 'lg-spa',
					action: 'search',
				},
				sqo: { section_tipo: ['oh1'], limit: 1, offset: 0 },
			} as never),
		);
		const oh25 = (
			result.context as {
				tipo: string;
				request_config?: { show: { ddo_map: { tipo: string }[] } | null }[];
				path?: { component_tipo: string }[];
			}[]
		).find((e) => e.tipo === 'oh25');
		expect(oh25).toBeDefined();
		expect(oh25?.request_config?.[0]?.show?.ddo_map.map((d) => d.tipo)).toEqual([
			'rsc62',
			'rsc63',
			'rsc35',
		]);
		expect(oh25?.path?.map((s) => s.component_tipo)).toEqual(['oh25', 'rsc62']);
	});
});
