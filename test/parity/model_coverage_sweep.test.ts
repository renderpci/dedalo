/**
 * MODEL COVERAGE SWEEP (pre-Phase-6 measurement): replay a read for ONE
 * data-bearing component of EVERY model family present in the cloned coin/mint
 * sections, and diff the data items against live PHP.
 *
 * Purpose: measure exactly which of the component models the GENERIC pipeline
 * (column map + lang slice + truncation + relation passthrough) already
 * serves with parity, and which need per-model work in Phase 6. Divergent
 * models are REPORTED (ledger) — the assertion only locks the models already
 * known good, so the sweep never rots while still surfacing regressions.
 */
// GENERIC-TLD MIGRATED 2026-08-19 (WC-2026-08-19-test-tld-replay).
// Every swept section/component is named in `test`-TLD terms (the cloned mint
// section testmint1, the cloned type/coin sections test6099/test6323, and the
// SEED-SHIPPED media sections rsc170/rsc205 which every installation ships);
// `unmapRqo` finds the frozen install-term interaction and `adoptTipoIdMap`
// reads its body back in test terms. The records come from the committed
// corpus, so the sweep runs on any installation holding no install data.

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { config } from '../../src/config/config.ts';
import type { Rqo } from '../../src/core/concepts/rqo.ts';
import { readSectionRows } from '../../src/core/section/read.ts';
import { dropTestCorpus, ensureTestCorpus } from '../../src/core/test_data/test_corpus/ensure.ts';
import { adoptEntriesArrayContract, adoptTipoIdMap, normalizeSectionIdTypes } from './normalize.ts';
import { hasPhpCredentials, PhpApiClient } from './php_client.ts';

/** A SEED-SHIPPED tipo, spelled out of the install-TLD census's token grammar. */
const seed = (tld: string, id: number): string => `${tld}${id}`;

/** The cloned sections this sweep reads, plus the seed-shipped media sections. */
const MINT = 'testmint1';
const TYPES = 'test6099';
const MEDIA = seed('rsc', 170);
const BIBLIO = seed('rsc', 205);

/**
 * The corpus this gate owns: the four swept sections PLUS the sections whose
 * records the swept components POINT AT — a component_select/autocomplete list
 * value is the LABEL of the target record, so without the target section the
 * item resolves empty and the model would be "measured" against nothing.
 */
const CORPUS_SCOPE = [MINT, TYPES, MEDIA, BIBLIO, 'testcatalogs1', 'test6810', 'test6100'];

/**
 * ── MEASURED 2026-08-19, AND STILL RED. READ THIS BEFORE RETUNING ANYTHING ──
 *
 * On the generic corpus the sweep measures 11/16 byte-equal. The five that
 * diverge do so for ONE reason, and it is not the engine:
 *
 *   component_autocomplete  test6117 is ABSENT from all three test6099 corpus
 *                           records (`component_sources` has no entry) — the
 *                           frozen store never showed that component's value.
 *   component_select        resolves on record 1 (the catalog target above);
 *                           records 2 and 3 do not carry the component.
 *   component_html_text     resolves on record 1 (source `raw`); records 2 and
 *                           3 do not carry it.
 *   component_pdf           no rsc205 corpus record carries rsc209, and the
 *                           84 MB source PDF is not in the suite media kit.
 *   component_image         record 1 matches on every FIELD except file_size /
 *                           file_time — which describe the FILE ON DISK in the
 *                           suite media root, not the record; records 2 and 3
 *                           do not carry the component.
 *
 * The corpus is DERIVED from the frozen store (scripts/derive_test_corpus.ts):
 * it holds a component only where some frozen body revealed it. Closing this
 * red is corpus work in the deriver, NOT a change here — do not shrink
 * KNOWN_GOOD, do not drop rows from SWEEP, and do not compare "only the
 * records that happen to carry the component": each of those turns a
 * measurement into a self-fulfilling one.
 */

/** One data-bearing component per model family (verified via SQL). */
const SWEEP: { model: string; tipo: string; section: string }[] = [
	// test6117/test6099 (the install's numisdata34/numisdata3): every record in
	// the limit-3 window carries real relation data (verified via jsonb_each
	// probe 2026-07-07). The former fixture (numisdata1338 under numisdata6) was
	// DEGENERATE BY CONSTRUCTION — numisdata1338's ontology parent is
	// numisdata126, so projecting it on a numisdata6 read yields zero items on
	// BOTH engines and the model was
	// "certified matched" on an empty-vs-empty compare since birth (audit
	// 2026-07-07; the non-empty floor below is what exposed it).
	{ model: 'component_autocomplete', tipo: 'test6117', section: TYPES },
	{ model: 'component_autocomplete_hi', tipo: 'testmint1006', section: MINT },
	{ model: 'component_date', tipo: 'testmint1033', section: MINT },
	{ model: 'component_geolocation', tipo: 'testmint1015', section: MINT },
	{ model: 'component_html_text', tipo: 'testmint1004', section: MINT },
	{ model: 'component_input_text', tipo: 'testmint1027', section: MINT },
	{ model: 'component_iri', tipo: 'testmint1032', section: MINT },
	{ model: 'component_portal', tipo: 'testmint1028', section: MINT },
	{ model: 'component_publication', tipo: 'testmint1021', section: MINT },
	{ model: 'component_radio_button', tipo: 'testmint1017', section: MINT },
	{ model: 'component_relation_related', tipo: 'testmint1030', section: MINT },
	{ model: 'component_text_area', tipo: 'testmint1003', section: MINT },
	// second wave: seed-shipped media sections carrying models the mint lacks
	{ model: 'component_image', tipo: seed('rsc', 29), section: MEDIA },
	{ model: 'component_svg', tipo: seed('rsc', 855), section: MEDIA },
	{ model: 'component_pdf', tipo: seed('rsc', 209), section: BIBLIO },
	{ model: 'component_select', tipo: 'test6323', section: TYPES },
];

/**
 * Models already verified byte-equal — the locked baseline (measured, then
 * locked). The divergent relation-family models need LIST-VALUE label
 * resolution (PHP resolves locators to display strings via the datalist,
 * e.g. radio_button → ["Pendiente"]) — that is the scoped Phase 6 work.
 */
const KNOWN_GOOD = new Set<string>([
	'component_autocomplete',
	'component_autocomplete_hi',
	'component_image',
	'component_svg',
	'component_pdf',
	'component_select',
	'component_iri',
	'component_date',
	'component_geolocation',
	'component_html_text',
	'component_input_text',
	'component_portal',
	'component_publication',
	'component_radio_button',
	'component_relation_related',
	'component_text_area',
]);

function comparable(item: Record<string, unknown>): Record<string, unknown> {
	return {
		tipo: item.tipo,
		section_id: item.section_id,
		mode: item.mode,
		entries: item.entries ?? null,
	};
}

describe.if(hasPhpCredentials())('model coverage sweep (pre-Phase-6 measurement)', () => {
	let client: PhpApiClient;

	beforeAll(async () => {
		await ensureTestCorpus(CORPUS_SCOPE);
		if (!hasPhpCredentials()) return;
		client = new PhpApiClient();
		const loggedIn = await client.login(
			config.phpReference.username as string,
			config.phpReference.password as string,
		);
		if (!loggedIn) throw new Error('PHP login failed');
	});

	afterAll(async () => {
		expect(await dropTestCorpus(CORPUS_SCOPE)).toBe(0);
	});

	test('sweep all models; lock the known-good set; ledger divergences', async () => {
		if (!hasPhpCredentials()) return;
		const divergent: string[] = [];
		const matched: string[] = [];
		/** Anti-vacuity accumulator for the clone-map walk (asserted below). */
		let rewrittenTipos = 0;

		for (const target of SWEEP) {
			const rqo = {
				action: 'read',
				dd_api: 'dd_core_api',
				prevent_lock: true,
				source: {
					model: 'section',
					tipo: target.section,
					section_tipo: target.section,
					mode: 'list',
					lang: 'lg-spa',
					action: 'search',
				},
				sqo: { section_tipo: [target.section], limit: 3, offset: 0 },
				show: {
					ddo_map: [
						{
							tipo: target.tipo,
							section_tipo: 'self',
							parent: 'self',
							mode: 'list',
							lang: 'lg-spa',
						},
					],
				},
			};
			const { body } = await client.call(structuredClone(rqo));
			// WC-2026-08-19-test-tld-replay: the frozen install-term items, read
			// back in test-TLD terms through the committed clone map.
			//
			// Applied to `result.data` — the ONLY thing this sweep compares — and
			// not to the whole envelope: the frozen `context[]` carries the install
			// AREA node above each cloned section in `parent_grouper`, which has no
			// twin (the clone was cut at the section root). That seam is
			// context_differential's subject, and that gate asserts both sides of it
			// explicitly; adopting the envelope here would refuse on a field this
			// gate does not look at.
			const adopted = adoptTipoIdMap(
				((body.result as { data?: Record<string, unknown>[] }).data ?? []) as Record<
					string,
					unknown
				>[],
				'model_coverage_sweep',
			);
			expect(adopted.matched).toBe(true);
			expect(adopted.rewrites.ids).toBeGreaterThan(0);
			rewrittenTipos += adopted.rewrites.tipos;
			// DEC-02 / engineering/wire_contract/ WC-001 (unified [] as of the WS-C
			// engine-wide unification): PHP still emits entries:null for empty
			// values, so the normalizer rewrites the PHP side ONLY. The TS side
			// is compared RAW — if the engine ever regresses to null, this sweep
			// reddens (the shrunken normalization doubles as the tripwire).
			// WC-2026-08-10-section-id-int-canonical: address keys compared by VALUE on BOTH sides (fixtures keep the PHP-era numeric strings).
			const phpItems = normalizeSectionIdTypes(
				adoptEntriesArrayContract(
					adopted.body.filter((item) => item.tipo === target.tipo).map(comparable),
				),
			);
			const tsItems = normalizeSectionIdTypes(
				((await readSectionRows(rqo as unknown as Rqo)) as unknown as Record<string, unknown>[])
					.filter((item) => item.tipo === target.tipo)
					.map(comparable),
			);

			// Non-empty floor: empty-vs-empty must never count as "matched".
			if (phpItems.length === 0) {
				throw new Error(`sweep ${target.model}: zero PHP items — degenerate comparison`);
			}

			const equal = JSON.stringify(tsItems) === JSON.stringify(phpItems);
			if (equal) {
				matched.push(target.model);
			} else {
				divergent.push(target.model);
			}
		}

		console.warn(
			`[SWEEP] matched: ${matched.length}/${SWEEP.length} — ${matched.join(', ')}${divergent.length > 0 ? `\n[SWEEP][UNCOVERED] divergent models: ${divergent.join(', ')}` : ''}`,
		);
		// The clone walk must have rewritten a tipo in every swept body but the
		// seed-shipped ones — a walk that rewrote nothing would be comparing
		// install terms against test terms.
		expect(rewrittenTipos).toBeGreaterThan(SWEEP.length);
		// The locked baseline must stay green (asserted AFTER the ledger prints).
		for (const lockedModel of KNOWN_GOOD) {
			expect(divergent).not.toContain(lockedModel);
		}
	}, 60000);
});
