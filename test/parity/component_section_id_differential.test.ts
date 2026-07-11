/**
 * component_section_id EDIT-mode data gate (user-reported 2026-07-04: the
 * numisdata15 field — model component_section_id — rendered blank in edit
 * mode). PHP's get_data() is mode-agnostic: it always returns the record's
 * OWN section_id (never JSONB-stored data), so it must short-circuit before
 * the generic literal resolver in emitDdoData, which looks for a JSONB
 * column this model has none of.
 *
 * Anchor: numisdata6 §3, child numisdata15 (component_section_id).
 */

import { beforeAll, describe, expect, test } from 'bun:test';
import { config } from '../../src/config/config.ts';
import type { Rqo } from '../../src/core/concepts/rqo.ts';
import { readSection } from '../../src/core/section/read.ts';
import { PhpApiClient, hasPhpCredentials } from './php_client.ts';

const SECTION = 'numisdata6';
const SECTION_ID = 3;
const COMPONENT = 'numisdata15';

const EDIT_RQO = {
	action: 'read',
	dd_api: 'dd_core_api',
	prevent_lock: true,
	source: {
		model: 'section',
		tipo: SECTION,
		section_tipo: SECTION,
		mode: 'edit',
		lang: 'lg-spa',
		action: 'search',
	},
	sqo: {
		section_tipo: [SECTION],
		limit: 1,
		offset: 0,
		filter_by_locators: [{ section_tipo: SECTION, section_id: String(SECTION_ID) }],
	},
};

describe.if(hasPhpCredentials())(
	'component_section_id EDIT data differential (numisdata15)',
	() => {
		let phpItem: Record<string, unknown> | undefined;
		let tsItem: Record<string, unknown> | undefined;

		beforeAll(async () => {
			if (!hasPhpCredentials()) return;
			const client = new PhpApiClient();
			await client.login(
				config.phpReference.username as string,
				config.phpReference.password as string,
			);
			const { body } = await client.call(structuredClone(EDIT_RQO));
			const phpData = (body.result as { data?: Record<string, unknown>[] })?.data ?? [];
			phpItem = phpData.find((item) => item.tipo === COMPONENT);

			const tsResult = await readSection(structuredClone(EDIT_RQO) as unknown as Rqo);
			const tsData = tsResult.data as Record<string, unknown>[];
			tsItem = tsData.find((item) => item.tipo === COMPONENT);
		});

		test('entries carry the record own section_id, not null', () => {
			if (!hasPhpCredentials()) return;
			expect(phpItem?.entries).toEqual([SECTION_ID]);
			expect(tsItem?.entries).toEqual([SECTION_ID]);
		});

		test('identity/envelope fields match PHP exactly', () => {
			if (!hasPhpCredentials()) return;
			expect(tsItem).toBeDefined();
			expect(tsItem?.section_id).toEqual(phpItem?.section_id);
			expect(tsItem?.section_tipo).toEqual(phpItem?.section_tipo);
			expect(tsItem?.mode).toEqual(phpItem?.mode);
			expect(tsItem?.lang).toEqual(phpItem?.lang);
			expect(tsItem?.from_component_tipo).toEqual(phpItem?.from_component_tipo);
			expect(tsItem?.row_section_id).toEqual(phpItem?.row_section_id);
			expect(tsItem?.parent_tipo).toEqual(phpItem?.parent_tipo);
		});
	},
);
