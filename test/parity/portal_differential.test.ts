/**
 * Phase 4c gate: PORTAL subdatum differential — the TS portal expansion vs
 * live PHP for the same RQO (portal numisdata163 → rsc332 bibliography, child
 * ddo rsc473 text_area).
 *
 * Compared: the portal's own item (paginated locator page + pagination.total)
 * and the child items (identity, order, entries, stamps row_section_id +
 * parent_tipo=portal).
 */

import { beforeAll, describe, expect, test } from 'bun:test';
import { config } from '../../src/config/config.ts';
import type { Rqo } from '../../src/core/concepts/rqo.ts';
import { readSectionRows } from '../../src/core/section/read.ts';
import { adoptEntriesArrayContract } from './normalize.ts';
import { PhpApiClient, hasPhpCredentials } from './php_client.ts';

const READ_RQO = {
	action: 'read',
	dd_api: 'dd_core_api',
	prevent_lock: true,
	source: {
		model: 'section',
		tipo: 'numisdata6',
		section_tipo: 'numisdata6',
		mode: 'list',
		lang: 'lg-spa',
		action: 'search',
	},
	// Record 2 has 22 bibliography locators — a real pagination case.
	sqo: {
		section_tipo: ['numisdata6'],
		filter_by_locators: [{ section_tipo: 'numisdata6', section_id: '2' }],
		limit: 1,
		offset: 0,
	},
	show: {
		ddo_map: [
			{ tipo: 'numisdata163', section_tipo: 'self', parent: 'self', mode: 'list' },
			{
				tipo: 'rsc473',
				section_tipo: 'rsc332',
				parent: 'numisdata163',
				mode: 'list',
				lang: 'lg-spa',
			},
		],
	},
};

function itemsOf(data: Record<string, unknown>[], tipo: string): Record<string, unknown>[] {
	return data.filter((item) => item.tipo === tipo);
}

describe.if(hasPhpCredentials())('portal subdatum differential (Phase 4c gate)', () => {
	let phpData: Record<string, unknown>[];
	let tsData: Record<string, unknown>[];

	beforeAll(async () => {
		if (!hasPhpCredentials()) return;
		const client = new PhpApiClient();
		await client.login(
			config.phpReference.username as string,
			config.phpReference.password as string,
		);
		const { body } = await client.call(structuredClone(READ_RQO));
		// DEC-02 / WIRE_CONTRACT.md WC-001: assert the adopted `entries: []`
		// empty contract (PHP's `entries: null` is the fossil shape at this seam).
		phpData = adoptEntriesArrayContract((body.result as { data: Record<string, unknown>[] }).data);
		tsData = (await readSectionRows(READ_RQO as unknown as Rqo)) as unknown as Record<
			string,
			unknown
		>[];
	});

	test('portal item: paginated locator page + pagination total match', () => {
		if (!hasPhpCredentials()) return;
		const phpPortal = itemsOf(phpData, 'numisdata163')[0] as Record<string, unknown>;
		const tsPortal = itemsOf(tsData, 'numisdata163')[0] as Record<string, unknown>;
		expect(tsPortal).toBeDefined();
		expect(phpPortal).toBeDefined();
		expect(tsPortal.entries).toEqual(phpPortal.entries);
		const phpPagination = phpPortal.pagination as { total: number; limit: number };
		const tsPagination = tsPortal.pagination as { total: number; limit: number };
		expect(tsPagination.total).toBe(phpPagination.total);
		expect(tsPagination.limit).toBe(phpPagination.limit);
	});

	test('child items: identity, order, entries and subdatum stamps match', () => {
		if (!hasPhpCredentials()) return;
		const phpChildren = itemsOf(phpData, 'rsc473');
		const tsChildren = itemsOf(tsData, 'rsc473');
		expect(tsChildren.length).toBe(phpChildren.length);
		for (let index = 0; index < phpChildren.length; index++) {
			const phpChild = phpChildren[index] as Record<string, unknown>;
			const tsChild = tsChildren[index] as Record<string, unknown>;
			expect(tsChild.section_tipo).toBe(phpChild.section_tipo);
			expect(Number(tsChild.section_id)).toBe(Number(phpChild.section_id));
			expect(tsChild.entries).toEqual(phpChild.entries ?? null);
			expect(Number(tsChild.row_section_id)).toBe(Number(phpChild.row_section_id));
			expect(tsChild.parent_tipo).toBe(phpChild.parent_tipo);
		}
	});
});
