/**
 * Phase 6 gate: PORTAL SUBDATUM IN EDIT MODE — the relation-component
 * foundation (rewrite/core/components/portal_subdatum_edit.md) vs live PHP.
 *
 * (a) SECTION EDIT READ with a portal column (numisdata3/4 → numisdata77,
 *     3 coins): the portal item (paginated locators, sqo_config limit 9,
 *     pagination.total = full count) plus the per-locator subdatum — child
 *     modes (declared edit / stamped list), langs, stamps
 *     (from_component_tipo / row_section_id), and the NESTED portal
 *     recursion (numisdata164/165 re-enter with their own configs and emit
 *     rsc29 at their rsc170 targets) — all byte-compared in order.
 *
 * (b) GET_DATA OFFSET PAGING (the client paginator rqo): page 2
 *     (limit 5, offset 5) of a 1189-locator portal — paginated_key
 *     continuity (5…9), pagination {total, limit, offset} and the expanded
 *     children of the paged targets, byte-compared.
 */

import { beforeAll, describe, expect, test } from 'bun:test';
import { config } from '../../src/config/config.ts';
import { dispatchRqo } from '../../src/core/api/dispatch.ts';
import { resolvePrincipal } from '../../src/core/security/permissions.ts';
import { createSession, getSession } from '../../src/core/security/session_store.ts';
import { adoptEntriesArrayContract } from './normalize.ts';
import { PhpApiClient, hasPhpCredentials } from './php_client.ts';

let php: PhpApiClient;
let tsContext: Record<string, unknown>;

/** Normalize one data item to the comparison surface. */
function normalize(items: Record<string, unknown>[]): Record<string, unknown>[] {
	return items
		.filter((item) => item.typo !== 'sections')
		.map((item) => ({
			tipo: item.tipo,
			section_tipo: item.section_tipo,
			section_id: String(item.section_id),
			mode: item.mode,
			lang: item.lang,
			from_component_tipo: item.from_component_tipo,
			row_section_id: String(item.row_section_id ?? ''),
			parent_tipo: item.parent_tipo ?? null,
			entries: item.entries ?? null,
			pagination: item.pagination ?? null,
		}));
}

async function phpData(rqo: Record<string, unknown>): Promise<Record<string, unknown>[]> {
	const body = (await php.call(structuredClone(rqo))).body as {
		result?: { data?: Record<string, unknown>[] };
	};
	// DEC-02 / WIRE_CONTRACT.md WC-001: assert the adopted `entries: []` empty
	// contract (PHP's `entries: null` is the fossil shape at this seam).
	return adoptEntriesArrayContract(normalize(body.result?.data ?? []));
}

async function tsData(rqo: Record<string, unknown>): Promise<Record<string, unknown>[]> {
	const body = (await dispatchRqo(structuredClone(rqo) as never, tsContext as never)).body as {
		result?: { data?: Record<string, unknown>[] };
	};
	return normalize(body.result?.data ?? []);
}

beforeAll(async () => {
	if (!hasPhpCredentials()) return;
	php = new PhpApiClient();
	await php.login(config.phpReference.username as string, config.phpReference.password as string);
	const token = createSession(-1, 'root', true);
	const session = getSession(token);
	const principal = await resolvePrincipal(-1);
	tsContext = {
		requestId: 't',
		clientIp: '127.0.0.1',
		session,
		csrfCandidate: session?.csrfToken ?? null,
		principal,
	};
}, 60000);

describe.if(hasPhpCredentials())(
	'portal subdatum in EDIT mode (relation-component foundation)',
	() => {
		test('section edit read: portal item + subdatum + NESTED portal recursion', async () => {
			if (!hasPhpCredentials()) return;
			const rqo = {
				action: 'read',
				dd_api: 'dd_core_api',
				prevent_lock: true,
				options: {},
				source: {
					typo: 'source',
					model: 'section',
					tipo: 'numisdata3',
					section_tipo: 'numisdata3',
					action: 'search',
					mode: 'edit',
					lang: 'lg-spa',
				},
				sqo: {
					section_tipo: ['numisdata3'],
					limit: 1,
					offset: 0,
					filter_by_locators: [{ section_tipo: 'numisdata3', section_id: '4' }],
				},
				show: {
					ddo_map: [
						{ tipo: 'numisdata77', section_tipo: 'numisdata3', parent: 'numisdata3', mode: 'edit' },
					],
				},
			};
			const phpItems = await phpData(rqo);
			const tsItems = await tsData(rqo);

			// the portal item: own-config limit (sqo_config 9), FULL total, page slice
			const portal = phpItems[0] as { pagination?: { total: number; limit: number } };
			expect(portal?.pagination?.limit).toBe(9);
			expect(portal?.pagination?.total).toBe(3);

			// nested portals recursed: rsc29 items exist under numisdata164/165
			expect(
				phpItems.some(
					(item) => item.tipo === 'rsc29' && item.from_component_tipo === 'numisdata164',
				),
			).toBe(true);

			// full ordered byte-compare
			expect(tsItems.length).toBe(phpItems.length);
			for (let index = 0; index < phpItems.length; index++) {
				expect(JSON.stringify(tsItems[index])).toBe(JSON.stringify(phpItems[index]));
			}
		}, 60000);

		test('client-managed paging: custom page, show-all clamp, over-ceiling clamp', async () => {
			if (!hasPhpCredentials()) return;
			// The paginator is CLIENT-driven: sqo.limit/offset come from the user's
			// paging actions. PHP sanitize_client_sqo CLAMPS the limit — show-all
			// (limit 0) and out-of-range values become the 1000 client ceiling.
			const rqoFor = (limit: number, offset: number) => ({
				action: 'read',
				dd_api: 'dd_core_api',
				prevent_lock: true,
				source: {
					typo: 'source',
					type: 'component',
					action: 'get_data',
					model: 'component_portal',
					tipo: 'numisdata77',
					section_tipo: 'numisdata3',
					section_id: '4',
					mode: 'edit',
					lang: 'lg-nolan',
				},
				sqo: {
					section_tipo: ['numisdata4'],
					limit,
					offset,
					filter_by_locators: [{ section_tipo: 'numisdata3', section_id: '4' }],
				},
			});
			for (const [limit, offset, expectedLimit] of [
				[2, 1, 2], // a custom client page
				[0, 0, 1000], // show-all → ceiling clamp
				[5000, 0, 1000], // over-ceiling → clamp
			] as [number, number, number][]) {
				const phpItems = await phpData(rqoFor(limit, offset));
				const tsItems = await tsData(rqoFor(limit, offset));
				const portal = phpItems[0] as { pagination?: { limit: number; offset: number } };
				expect(portal?.pagination?.limit).toBe(expectedLimit);
				expect(portal?.pagination?.offset).toBe(offset);
				expect(tsItems.length).toBe(phpItems.length);
				for (let index = 0; index < phpItems.length; index++) {
					expect(JSON.stringify(tsItems[index])).toBe(JSON.stringify(phpItems[index]));
				}
			}
		}, 60000);

		test('get_data CONTEXT: the resolved child tree (structural subset)', async () => {
			if (!hasPhpCredentials()) return;
			// PHP merges every recursive get_json's structure context (deduped by
			// context_key). Structural-subset comparison per the standing context
			// gate policy (view normalized — PHP's dd_object omits null view).
			const rqo = {
				action: 'read',
				dd_api: 'dd_core_api',
				prevent_lock: true,
				source: {
					typo: 'source',
					type: 'component',
					action: 'get_data',
					model: 'component_portal',
					tipo: 'numisdata77',
					section_tipo: 'numisdata3',
					section_id: '4',
					mode: 'edit',
					lang: 'lg-nolan',
				},
				sqo: {
					section_tipo: ['numisdata4'],
					limit: 2,
					offset: 0,
					filter_by_locators: [{ section_tipo: 'numisdata3', section_id: '4' }],
				},
			};
			const normalizeContext = (entries: Record<string, unknown>[]) =>
				entries.map((entry) => ({
					tipo: entry.tipo,
					section_tipo: entry.section_tipo,
					model: entry.model,
					mode: entry.mode,
					lang: entry.lang,
					parent: entry.parent,
					parent_grouper: entry.parent_grouper ?? null,
					label: entry.label,
					translatable: entry.translatable,
					view: entry.view ?? null,
				}));
			const phpBody = (await php.call(structuredClone(rqo))).body as {
				result?: { context?: Record<string, unknown>[] };
			};
			const tsBody = (await dispatchRqo(structuredClone(rqo) as never, tsContext as never))
				.body as { result?: { context?: Record<string, unknown>[] } };
			const phpContext = normalizeContext(phpBody.result?.context ?? []);
			const tsContextEntries = normalizeContext(tsBody.result?.context ?? []);
			// the resolved tree: portal + 5 config children + the nested rsc29
			expect(phpContext.length).toBe(7);
			expect(tsContextEntries.length).toBe(phpContext.length);
			for (let index = 0; index < phpContext.length; index++) {
				expect(JSON.stringify(tsContextEntries[index])).toBe(JSON.stringify(phpContext[index]));
			}
		}, 60000);

		test('get_data pagination: page 2 (offset 5) of a 1189-locator portal', async () => {
			if (!hasPhpCredentials()) return;
			const rqo = {
				action: 'read',
				dd_api: 'dd_core_api',
				prevent_lock: true,
				source: {
					typo: 'source',
					type: 'component',
					action: 'get_data',
					model: 'component_portal',
					tipo: 'numisdata77',
					section_tipo: 'numisdata3',
					section_id: '17463',
					mode: 'edit',
					lang: 'lg-nolan',
				},
				sqo: {
					section_tipo: ['numisdata4'],
					limit: 5,
					offset: 5,
					filter_by_locators: [{ section_tipo: 'numisdata3', section_id: '17463' }],
				},
			};
			const phpItems = await phpData(rqo);
			const tsItems = await tsData(rqo);

			// portal item: window [5,10), paginated_key continuity, FULL total
			const portal = phpItems[0] as {
				pagination?: { total: number; limit: number; offset: number };
				entries?: { paginated_key?: number }[];
			};
			expect(portal?.pagination).toEqual({ total: 1189, limit: 5, offset: 5 } as never);
			expect((portal?.entries ?? []).map((entry) => entry.paginated_key)).toEqual([5, 6, 7, 8, 9]);

			expect(tsItems.length).toBe(phpItems.length);
			for (let index = 0; index < phpItems.length; index++) {
				expect(JSON.stringify(tsItems[index])).toBe(JSON.stringify(phpItems[index]));
			}
		}, 60000);
	},
);
