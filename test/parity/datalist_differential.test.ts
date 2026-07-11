/**
 * Phase 6d gate: select-family datalist in edit mode — a radio_button's edit
 * item must carry the same datalist options as live PHP (get_list_of_values).
 */

import { beforeAll, describe, expect, test } from 'bun:test';
import { config } from '../../src/config/config.ts';
import type { Rqo } from '../../src/core/concepts/rqo.ts';
import { readSectionRows } from '../../src/core/section/read.ts';
import { PhpApiClient, hasPhpCredentials } from './php_client.ts';

const EDIT_RQO = {
	action: 'read',
	dd_api: 'dd_core_api',
	prevent_lock: true,
	source: {
		model: 'section',
		tipo: 'numisdata6',
		section_tipo: 'numisdata6',
		mode: 'edit',
		lang: 'lg-spa',
		action: 'search',
	},
	sqo: {
		section_tipo: ['numisdata6'],
		filter_by_locators: [{ section_tipo: 'numisdata6', section_id: '2' }],
		limit: 1,
	},
	show: {
		ddo_map: [
			{ tipo: 'numisdata266', section_tipo: 'self', parent: 'self', mode: 'edit', lang: 'lg-spa' },
		],
	},
};

describe.if(hasPhpCredentials())('select datalist differential (Phase 6d gate)', () => {
	let phpDatalist: Record<string, unknown>[];
	let tsDatalist: Record<string, unknown>[];

	beforeAll(async () => {
		if (!hasPhpCredentials()) return;
		const client = new PhpApiClient();
		await client.login(
			config.phpReference.username as string,
			config.phpReference.password as string,
		);
		const { body } = await client.call(structuredClone(EDIT_RQO));
		const phpItem = (body.result as { data: Record<string, unknown>[] }).data.find(
			(item) => item.tipo === 'numisdata266',
		);
		phpDatalist = (phpItem?.datalist as Record<string, unknown>[]) ?? [];

		const tsItems = (await readSectionRows(EDIT_RQO as unknown as Rqo)) as unknown as Record<
			string,
			unknown
		>[];
		const tsItem = tsItems.find((item) => item.tipo === 'numisdata266');
		tsDatalist = (tsItem?.datalist as Record<string, unknown>[]) ?? [];
	});

	test('datalist options match PHP (value/label/section_id/hide, label-sorted)', () => {
		if (!hasPhpCredentials()) return;
		expect(tsDatalist.length).toBe(phpDatalist.length);
		expect(tsDatalist.length).toBeGreaterThan(0);
		// Compare as sets keyed by section_id (order is label-sorted on both).
		const norm = (d: Record<string, unknown>[]) =>
			d
				.map((o) => ({
					value: o.value,
					label: o.label,
					section_id: String(o.section_id),
					hide: o.hide ?? [],
				}))
				.sort((a, b) => Number(a.section_id) - Number(b.section_id));
		expect(norm(tsDatalist)).toEqual(norm(phpDatalist));
	});
});
