/**
 * Phase 4g gate: ontology-driven default ddo_map — a section read with NO
 * explicit show (the real client's boot section read) must derive the same
 * component set as PHP and produce matching context + data.
 */

import { beforeAll, describe, expect, test } from 'bun:test';
import { config } from '../../src/config/config.ts';
import type { Rqo } from '../../src/core/concepts/rqo.ts';
import { readSection } from '../../src/core/section/read.ts';
import { PhpApiClient, hasPhpCredentials } from './php_client.ts';

const NO_SHOW_RQO = {
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
	sqo: {
		section_tipo: ['numisdata6'],
		filter_by_locators: [{ section_tipo: 'numisdata6', section_id: '2' }],
		limit: 1,
		offset: 0,
	},
	// no `show` — the server derives the ddo_map from the ontology
};

describe.if(hasPhpCredentials())('default ddo_map differential (Phase 4g gate)', () => {
	let phpContextTipos: string[];
	let phpDataTipos: string[];
	let tsContextTipos: string[];
	let tsDataTipos: string[];

	beforeAll(async () => {
		if (!hasPhpCredentials()) return;
		const client = new PhpApiClient();
		await client.login(
			config.phpReference.username as string,
			config.phpReference.password as string,
		);
		const { body } = await client.call(structuredClone(NO_SHOW_RQO));
		const phpResult = body.result as {
			context: Record<string, unknown>[];
			data: Record<string, unknown>[];
		};
		phpContextTipos = phpResult.context.map((entry) => entry.tipo as string);
		phpDataTipos = [
			...new Set(
				phpResult.data
					.filter((item) => item.tipo !== 'numisdata6')
					.map((item) => item.tipo as string),
			),
		];

		const tsResult = await readSection(NO_SHOW_RQO as unknown as Rqo);
		tsContextTipos = tsResult.context.map((entry) => entry.tipo);
		tsDataTipos = [
			...new Set(
				(tsResult.data as Record<string, unknown>[])
					.filter((item) => item.tipo !== 'numisdata6')
					.map((item) => item.tipo as string),
			),
		];
	});

	test('derived context component set matches PHP (identity + order)', () => {
		if (!hasPhpCredentials()) return;
		expect(tsContextTipos.length).toBeGreaterThan(1); // section + columns
		expect(tsContextTipos).toEqual(phpContextTipos);
	});

	test('derived data component set matches PHP', () => {
		if (!hasPhpCredentials()) return;
		expect(new Set(tsDataTipos)).toEqual(new Set(phpDataTipos));
	});
});
