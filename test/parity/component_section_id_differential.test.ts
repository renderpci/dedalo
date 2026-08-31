/**
 * component_section_id EDIT-mode data gate (user-reported 2026-07-04: the
 * numisdata15 field — model component_section_id — rendered blank in edit
 * mode). PHP's get_data() is mode-agnostic: it always returns the record's
 * OWN section_id (never JSONB-stored data), so it must short-circuit before
 * the generic literal resolver in emitDdoData, which looks for a JSONB
 * column this model has none of.
 *
 * Anchor: the cloned mint thesaurus §3, child component_section_id.
 */
// GENERIC-TLD MIGRATED 2026-08-19 (WC-2026-08-19-test-tld-replay).
// The RQO is written in `test`-TLD terms (numisdata6 → testmint1, numisdata15
// → testmint1001) and the frozen PHP interaction is reached through `unmapRqo`
// (fixture lookup) + `adoptTipoIdMap` (the frozen body, read in test-TLD
// terms). The addressed record comes from the committed corpus.

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { config } from '../../src/config/config.ts';
import type { Rqo } from '../../src/core/concepts/rqo.ts';
import { readSection } from '../../src/core/section/read.ts';
import { dropTestCorpus, ensureTestCorpus } from '../../src/core/test_data/test_corpus/ensure.ts';
import { adoptTipoIdMap, installTokensIn, normalizeSectionIdTypes } from './normalize.ts';
import { hasPhpCredentials, PhpApiClient } from './php_client.ts';

const SECTION = 'testmint1';
const SECTION_ID = 3;
const COMPONENT = 'testmint1001';

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
	'component_section_id EDIT data differential (testmint1001)',
	() => {
		let phpItem: Record<string, unknown> | undefined;
		let tsItem: Record<string, unknown> | undefined;

		beforeAll(async () => {
			await ensureTestCorpus([SECTION]);
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
			// the cloned section (the closure that built the `test` TLD stops at
			// the section root), carried by `context[0].parent_grouper`. This
			// gate compares `data[]` only — the context shape is
			// context_differential's subject, and that gate asserts both sides of
			// this seam explicitly. The reduction is PROVED, not trusted, and
			// WITHOUT naming the install token (a test file that spells one binds
			// it): exactly one token survives, it IS the section entry's parent,
			// and the COMPARED subtree carries none.
			const adopted = adoptTipoIdMap(body, 'component_section_id_differential');
			expect(adopted.kind).toBe('install_tipo_left');
			expect(adopted.leftovers).toHaveLength(1);
			expect(
				(adopted.body.result as { context?: Record<string, unknown>[] })?.context?.[0]
					?.parent_grouper,
			).toBe(adopted.leftovers[0]);
			expect(adopted.rewrites.tipos).toBeGreaterThan(0);
			expect(adopted.rewrites.ids).toBeGreaterThan(0);
			expect(
				installTokensIn((adopted.body.result as { data?: Record<string, unknown>[] })?.data ?? []),
			).toEqual([]);
			// WC-2026-08-10-section-id-int-canonical: address keys compared by VALUE on BOTH sides (fixtures keep the PHP-era numeric strings).
			const phpData = normalizeSectionIdTypes(
				(adopted.body.result as { data?: Record<string, unknown>[] })?.data ?? [],
			);
			phpItem = phpData.find((item) => item.tipo === COMPONENT);

			const tsResult = await readSection(structuredClone(EDIT_RQO) as unknown as Rqo);
			const tsData = normalizeSectionIdTypes(tsResult.data as Record<string, unknown>[]);
			tsItem = tsData.find((item) => item.tipo === COMPONENT);
		});

		afterAll(async () => {
			expect(await dropTestCorpus([SECTION])).toBe(0);
		});

		test('entries carry the record own section_id, not null', () => {
			expect(phpItem?.entries).toEqual([SECTION_ID]);
			expect(tsItem?.entries).toEqual([SECTION_ID]);
		});

		test('identity/envelope fields match PHP exactly', () => {
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
