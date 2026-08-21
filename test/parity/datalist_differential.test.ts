/**
 * Phase 6d gate: select-family datalist in edit mode — a radio_button's edit
 * item must carry the same datalist options as live PHP (get_list_of_values).
 */
// GENERIC-TLD MIGRATED 2026-08-19 (WC-2026-08-19-test-tld-replay).
// The RQO is written in `test`-TLD terms (numisdata6 → testmint1, numisdata266
// → testmint1017) and the frozen PHP interaction is reached through `unmapRqo`
// (fixture lookup) + `adoptTipoIdMap` (the frozen body, read in test-TLD
// terms). The addressed record comes from the committed corpus.

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { config } from '../../src/config/config.ts';
import type { Rqo } from '../../src/core/concepts/rqo.ts';
import { readSectionRows } from '../../src/core/section/read.ts';
import { dropTestCorpus, ensureTestCorpus } from '../../src/core/test_data/test_corpus/ensure.ts';
import { adoptTipoIdMap, installTokensIn, normalizeSectionIdTypes } from './normalize.ts';
import { hasPhpCredentials, PhpApiClient } from './php_client.ts';

/** The cloned mint thesaurus and its cloned select-family component. */
const SECTION = 'testmint1';
const COMPONENT = 'testmint1017';

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
		filter_by_locators: [{ section_tipo: SECTION, section_id: '2' }],
		limit: 1,
	},
	show: {
		ddo_map: [
			{ tipo: COMPONENT, section_tipo: 'self', parent: 'self', mode: 'edit', lang: 'lg-spa' },
		],
	},
};

describe.if(hasPhpCredentials())('select datalist differential (Phase 6d gate)', () => {
	let phpDatalist: Record<string, unknown>[];
	let tsDatalist: Record<string, unknown>[];

	beforeAll(async () => {
		await ensureTestCorpus([SECTION]);
		if (!hasPhpCredentials()) return;
		const client = new PhpApiClient();
		await client.login(
			config.phpReference.username as string,
			config.phpReference.password as string,
		);
		const { body } = await client.call(structuredClone(EDIT_RQO));
		// WC-2026-08-19-test-tld-replay: the frozen install-term body, read in
		// test-TLD terms.
		//
		// THE ONE TOKEN THE CLONE HAS NO TWIN FOR: the install AREA node ABOVE
		// the cloned section (the closure that built the `test` TLD stops at the
		// section root), carried by `context[0].parent_grouper`. This gate
		// compares `data[]` only — the context shape is context_differential's
		// subject, and that gate asserts both sides of this seam explicitly. The
		// reduction is PROVED, not trusted, and WITHOUT naming the install token
		// (a test file that spells one binds it): exactly one token survives, it
		// IS the section entry's parent, and the COMPARED subtree carries none.
		const adopted = adoptTipoIdMap(body, 'datalist_differential');
		expect(adopted.kind).toBe('install_tipo_left');
		expect(adopted.leftovers).toHaveLength(1);
		expect(
			(adopted.body.result as { context: Record<string, unknown>[] }).context[0]?.parent_grouper,
		).toBe(adopted.leftovers[0]);
		expect(adopted.rewrites.tipos).toBeGreaterThan(0);
		expect(adopted.rewrites.ids).toBeGreaterThan(0);
		expect(
			installTokensIn((adopted.body.result as { data: Record<string, unknown>[] }).data),
		).toEqual([]);
		const phpItem = (adopted.body.result as { data: Record<string, unknown>[] }).data.find(
			(item) => item.tipo === COMPONENT,
		);
		// WC-2026-08-10-section-id-int-canonical: address keys compared by VALUE
		// on BOTH sides — the datalist options carry a `value` LOCATOR, and the
		// frozen store keeps the PHP-era numeric strings.
		phpDatalist = normalizeSectionIdTypes((phpItem?.datalist as Record<string, unknown>[]) ?? []);

		const tsItems = (await readSectionRows(EDIT_RQO as unknown as Rqo)) as unknown as Record<
			string,
			unknown
		>[];
		const tsItem = tsItems.find((item) => item.tipo === COMPONENT);
		tsDatalist = normalizeSectionIdTypes((tsItem?.datalist as Record<string, unknown>[]) ?? []);
	});

	afterAll(async () => {
		expect(await dropTestCorpus([SECTION])).toBe(0);
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
