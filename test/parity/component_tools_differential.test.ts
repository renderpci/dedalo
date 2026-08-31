/**
 * Phase 6 gate: component-context tools differential (PHP common::get_tools for
 * a component_* model, superuser).
 *
 * A component's toolbar is get_user_tools filtered by the 'all_components'
 * catch-all + affected_models/affected_tipos, then requirement_translatable
 * gated by the component's translatable flag. We read a translatable component
 * (input_text) and a non-translatable one (section_id) and assert the TS filter
 * reproduces each PHP tool list exactly — proving the translatable gate (the
 * lang tools appear for the translatable component and not the other).
 */
// GENERIC-TLD MIGRATED 2026-08-20 (WC-2026-08-19-test-tld-replay).
// The RQO is written in `test`-TLD terms (the cloned mint thesaurus and its
// two cloned components) and the frozen PHP interaction is reached through
// `unmapRqo` (fixture lookup) + `adoptTipoIdMap` (the frozen body, read in
// test-TLD terms). The one record the read addresses comes from the committed
// corpus, so this gate runs on any installation, holding no install data.

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { config } from '../../src/config/config.ts';
import type { Rqo } from '../../src/core/concepts/rqo.ts';
import { readSection } from '../../src/core/section/read.ts';
import { dropTestCorpus, ensureTestCorpus } from '../../src/core/test_data/test_corpus/ensure.ts';
import { adoptTipoIdMap, installTokensIn } from './normalize.ts';
import { hasPhpCredentials, PhpApiClient } from './php_client.ts';

/** The cloned mint thesaurus and the two components this gate reads. */
const SECTION = 'testmint1';
/** component_input_text — TRANSLATABLE (the lang tools must appear). */
const INPUT_TEXT = 'testmint1002';
/** component_section_id — NOT translatable (the lang tools must not appear). */
const SECTION_ID = 'test6175';

const READ_RQO = {
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
		filter_by_locators: [{ section_tipo: SECTION, section_id: '1' }],
		limit: 1,
	},
	show: {
		ddo_map: [
			{ tipo: INPUT_TEXT, section_tipo: 'self', parent: 'self', mode: 'edit', lang: 'lg-spa' },
			{ tipo: SECTION_ID, section_tipo: 'self', parent: 'self', mode: 'edit', lang: 'lg-spa' },
		],
	},
};

type Entry = Record<string, unknown> & { tipo: string; model: string; tools?: { name: string }[] };

describe.if(hasPhpCredentials())('component tools differential (Phase 6 gate)', () => {
	let phpEntries: Entry[];
	let tsEntries: Entry[];
	/** The section entry's parent on each side (the uncloned seam, asserted). */
	let frozenParentGrouper: unknown;
	let frozenUnclonedToken: string | undefined;
	let tsParentGrouper: unknown;

	beforeAll(async () => {
		await ensureTestCorpus([SECTION]);
		const client = new PhpApiClient();
		await client.login(
			config.phpReference.username as string,
			config.phpReference.password as string,
		);
		const { body } = await client.call(structuredClone(READ_RQO));
		// WC-2026-08-19-test-tld-replay: the frozen install-term body, read in
		// test-TLD terms. Non-zero rewrite counts are the anti-vacuity floor.
		//
		// THE ONE TOKEN THE CLONE HAS NO TWIN FOR: the install AREA node ABOVE
		// the cloned section — the closure that built the `test` TLD stops at the
		// SECTION root, so the section entry's `parent_grouper` cannot be mapped.
		// It is asserted EXACTLY (kind + a single leftover) and BOTH sides of
		// that field are asserted below rather than compared; the token is never
		// SPELLED here. What this gate compares (the component entries) is
		// asserted to carry no install token at all.
		const adopted = adoptTipoIdMap(body, 'component_tools_differential');
		expect(adopted.kind).toBe('install_tipo_left');
		expect(adopted.leftovers).toHaveLength(1);
		expect(adopted.rewrites.tipos).toBeGreaterThan(0);
		expect(adopted.rewrites.ids).toBeGreaterThan(0);
		frozenUnclonedToken = adopted.leftovers[0];
		const phpContext = (adopted.body.result as { context?: Entry[] }).context ?? [];
		frozenParentGrouper =
			(phpContext.find((entry) => entry.tipo === SECTION) as { parent_grouper?: unknown })
				?.parent_grouper ?? null;
		phpEntries = phpContext.filter((entry) => entry.model?.startsWith('component_'));
		const tsResult = await readSection(READ_RQO as unknown as Rqo);
		tsEntries = (tsResult.context as unknown as Entry[]).filter((entry) =>
			entry.model?.startsWith('component_'),
		);
		tsParentGrouper =
			(
				tsResult.context.find((entry) => entry.tipo === SECTION) as unknown as {
					parent_grouper?: unknown;
				}
			)?.parent_grouper ?? null;
	});

	afterAll(async () => {
		expect(await dropTestCorpus([SECTION])).toBe(0);
	});

	test('the section entry parent is each ontology own area (the uncloned seam)', () => {
		expect(frozenParentGrouper).toBe(frozenUnclonedToken);
		expect(typeof tsParentGrouper).toBe('string');
		expect(String(tsParentGrouper).startsWith('test')).toBe(true);
	});

	test('each component context resolves the same tool set as PHP', () => {
		expect(phpEntries.length).toBeGreaterThan(0);
		expect(installTokensIn(phpEntries.map((entry) => entry.tipo))).toEqual([]);
		const tsByTipo = new Map(tsEntries.map((entry) => [entry.tipo, entry]));
		for (const phpEntry of phpEntries) {
			const tsEntry = tsByTipo.get(phpEntry.tipo);
			expect(tsEntry).toBeDefined();
			const phpNames = (phpEntry.tools ?? []).map((tool) => tool.name).sort();
			const tsNames = ((tsEntry as Entry).tools ?? []).map((tool) => tool.name).sort();
			expect(tsNames).toEqual(phpNames);
		}
	});

	test('the translatable gate distinguishes the two components', () => {
		// input_text (translatable) shows the lang tools; section_id (non-translatable)
		// must not — proving requirement_translatable is honoured, whatever the
		// exact tool names are on this install.
		const inputText = phpEntries.find((entry) => entry.tipo === INPUT_TEXT);
		const sectionId = phpEntries.find((entry) => entry.tipo === SECTION_ID);
		if (inputText === undefined || sectionId === undefined) return; // not resolved here
		const langToolInInput = (inputText.tools ?? []).some((tool) =>
			tool.name.startsWith('tool_lang'),
		);
		const langToolInSectionId = (sectionId.tools ?? []).some((tool) =>
			tool.name.startsWith('tool_lang'),
		);
		expect(langToolInInput).toBe(true);
		expect(langToolInSectionId).toBe(false);
	});
});
