/**
 * Phase 4h gate: component get_data — resolve one portal directly (the
 * "show more" / pagination path). Diffs the portal item's own paged locators
 * + pagination and the expanded child records against live PHP.
 */

import { beforeAll, describe, expect, test } from 'bun:test';
import { config } from '../../src/config/config.ts';
import type { Rqo } from '../../src/core/concepts/rqo.ts';
import { readComponentData } from '../../src/core/section/read.ts';
import { adoptEntriesArrayContract } from './normalize.ts';
import { PhpApiClient, hasPhpCredentials } from './php_client.ts';

const GET_DATA_RQO = {
	action: 'read',
	dd_api: 'dd_core_api',
	prevent_lock: true,
	source: {
		model: 'component_portal',
		tipo: 'numisdata163',
		section_tipo: 'numisdata6',
		section_id: '2',
		mode: 'edit',
		lang: 'lg-spa',
		action: 'get_data',
	},
	sqo: { section_tipo: ['numisdata6'], limit: 5, offset: 0 },
};

describe.if(hasPhpCredentials())('component get_data differential (Phase 4h gate)', () => {
	let phpData: Record<string, unknown>[];
	let tsData: Record<string, unknown>[];

	beforeAll(async () => {
		if (!hasPhpCredentials()) return;
		const client = new PhpApiClient();
		await client.login(
			config.phpReference.username as string,
			config.phpReference.password as string,
		);
		const { body } = await client.call(structuredClone(GET_DATA_RQO));
		// WC-001 (unified []): PHP emits entries:null for empty values; the TS
		// engine emits [] for EVERY model. Rewrite the PHP side only.
		phpData = adoptEntriesArrayContract((body.result as { data: Record<string, unknown>[] }).data);
		tsData = (await readComponentData(GET_DATA_RQO as unknown as Rqo)) as unknown as Record<
			string,
			unknown
		>[];
	});

	test('portal own item: paged locators + pagination total match PHP', () => {
		if (!hasPhpCredentials()) return;
		const phpPortal = phpData.find((item) => item.tipo === 'numisdata163') as Record<
			string,
			unknown
		>;
		const tsPortal = tsData.find((item) => item.tipo === 'numisdata163') as Record<string, unknown>;
		expect(tsPortal).toBeDefined();
		expect(tsPortal.entries).toEqual(phpPortal.entries);
		expect((tsPortal.pagination as { total: number }).total).toBe(
			(phpPortal.pagination as { total: number }).total,
		);
	});

	test('expanded child records match PHP (per-target component set + values)', () => {
		if (!hasPhpCredentials()) return;
		// Compare the child items for the first paged locator's record: same
		// (tipo, section_id, entries) set. PHP may carry extra children we
		// ledger; assert OUR emitted children are a subset that matches PHP.
		const firstTarget = ((tsData.find((i) => i.tipo === 'numisdata163')?.entries as {
			section_id: string;
		}[]) ?? [])[0]?.section_id;
		expect(firstTarget).toBeDefined();

		const key = (item: Record<string, unknown>) => `${item.tipo}|${item.section_id}`;
		const phpChildren = new Map(
			phpData
				.filter((i) => i.tipo !== 'numisdata163' && String(i.section_id) === String(firstTarget))
				.map((i) => [key(i), i.entries ?? null]),
		);
		const tsChildren = tsData.filter(
			(i) => i.tipo !== 'numisdata163' && String(i.section_id) === String(firstTarget),
		);
		expect(tsChildren.length).toBeGreaterThan(0);
		for (const child of tsChildren) {
			expect(phpChildren.has(key(child))).toBe(true);
			expect(child.entries ?? null).toEqual(phpChildren.get(key(child)) ?? null);
		}
	});
});
