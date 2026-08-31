/**
 * Phase 4g gate: ontology-driven default ddo_map — a section read with NO
 * explicit show (the real client's boot section read) must derive the same
 * component set as PHP and produce matching context + data.
 */
// GENERIC-TLD MIGRATED 2026-08-19 (WC-2026-08-19-test-tld-replay).
// The RQO is written in `test`-TLD terms (numisdata6 → testmint1, the cloned
// mint thesaurus) and the frozen PHP interaction is reached through `unmapRqo`
// (fixture lookup) + `adoptTipoIdMap` (the frozen body, read in test-TLD
// terms). The one record the read addresses comes from the committed corpus.

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { config } from '../../src/config/config.ts';
import type { Rqo } from '../../src/core/concepts/rqo.ts';
import { readSection } from '../../src/core/section/read.ts';
import { dropTestCorpus, ensureTestCorpus } from '../../src/core/test_data/test_corpus/ensure.ts';
import { adoptTipoIdMap, installTokensIn } from './normalize.ts';
import { hasPhpCredentials, PhpApiClient } from './php_client.ts';

/** The cloned mint thesaurus (the install's numisdata6 twin). */
const SECTION = 'testmint1';

const NO_SHOW_RQO = {
	action: 'read',
	dd_api: 'dd_core_api',
	prevent_lock: true,
	source: {
		model: 'section',
		tipo: SECTION,
		section_tipo: SECTION,
		mode: 'list',
		lang: 'lg-spa',
		action: 'search',
	},
	sqo: {
		section_tipo: [SECTION],
		filter_by_locators: [{ section_tipo: SECTION, section_id: '2' }],
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
	/** The section entry's parent, on each side (the uncloned seam, asserted). */
	let frozenParentGrouper: unknown;
	let tsParentGrouper: unknown;
	/** The single install token the walk could not map (never spelled here). */
	let frozenUnclonedToken: string | undefined;

	beforeAll(async () => {
		await ensureTestCorpus([SECTION]);
		const client = new PhpApiClient();
		await client.login(
			config.phpReference.username as string,
			config.phpReference.password as string,
		);
		const { body } = await client.call(structuredClone(NO_SHOW_RQO));
		// WC-2026-08-19-test-tld-replay: the frozen install-term body, read in
		// test-TLD terms. Non-zero rewrite counts are the anti-vacuity floor — a
		// body that needed no rewrite would not be the migrated one.
		//
		// THE ONE TOKEN THE CLONE HAS NO TWIN FOR: the install AREA node ABOVE
		// the cloned section — the closure that built the `test` TLD stops at the
		// SECTION root, so the section entry's `parent_grouper` cannot be mapped.
		// It is asserted EXACTLY (kind + a single leftover), it is asserted to
		// live ONLY in that field, and BOTH sides of that field are asserted
		// below rather than compared — the context_differential precedent. The
		// token is never SPELLED here: a test file that names an install tipo
		// binds it. What this gate compares (the derived component SET) is
		// asserted to carry no install token at all.
		const adopted = adoptTipoIdMap(body, 'default_ddo_map_differential');
		expect(adopted.kind).toBe('install_tipo_left');
		expect(adopted.leftovers).toHaveLength(1);
		expect(adopted.rewrites.tipos).toBeGreaterThan(0);
		expect(adopted.rewrites.ids).toBeGreaterThan(0);
		const phpResult = adopted.body.result as {
			context: Record<string, unknown>[];
			data: Record<string, unknown>[];
		};
		expect(installTokensIn(phpResult.context.map((entry) => entry.tipo))).toEqual([]);
		expect(installTokensIn(phpResult.data)).toEqual([]);
		frozenParentGrouper = phpResult.context[0]?.parent_grouper ?? null;
		frozenUnclonedToken = adopted.leftovers[0];
		phpContextTipos = phpResult.context.map((entry) => entry.tipo as string);
		phpDataTipos = [
			...new Set(
				phpResult.data.filter((item) => item.tipo !== SECTION).map((item) => item.tipo as string),
			),
		];

		const tsResult = await readSection(NO_SHOW_RQO as unknown as Rqo);
		tsContextTipos = tsResult.context.map((entry) => entry.tipo);
		tsParentGrouper =
			(tsResult.context[0] as unknown as { parent_grouper?: unknown })?.parent_grouper ?? null;
		tsDataTipos = [
			...new Set(
				(tsResult.data as Record<string, unknown>[])
					.filter((item) => item.tipo !== SECTION)
					.map((item) => item.tipo as string),
			),
		];
	});

	afterAll(async () => {
		expect(await dropTestCorpus([SECTION])).toBe(0);
	});

	test('the section entry parent is each ontology own area (the uncloned seam)', () => {
		// The frozen body names the INSTALL area; the clone root is parented by
		// its own TLD root. Neither is a divergence — both are asserted, so the
		// seam cannot hide a wrong value on either side.
		expect(frozenParentGrouper).toBe(frozenUnclonedToken);
		expect(typeof tsParentGrouper).toBe('string');
		expect(String(tsParentGrouper).startsWith('test')).toBe(true);
	});

	test('derived context component set matches PHP (identity + order)', () => {
		expect(tsContextTipos.length).toBeGreaterThan(1); // section + columns
		expect(tsContextTipos).toEqual(phpContextTipos);
	});

	test('derived data component set matches PHP', () => {
		expect(new Set(tsDataTipos)).toEqual(new Set(phpDataTipos));
	});
});
