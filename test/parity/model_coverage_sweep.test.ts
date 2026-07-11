/**
 * MODEL COVERAGE SWEEP (pre-Phase-6 measurement): replay a read for ONE
 * data-bearing component of EVERY model family present in numisdata6 and diff
 * the data items against live PHP.
 *
 * Purpose: measure exactly which of the component models the GENERIC pipeline
 * (column map + lang slice + truncation + relation passthrough) already
 * serves with parity, and which need per-model work in Phase 6. Divergent
 * models are REPORTED (ledger) — the assertion only locks the models already
 * known good, so the sweep never rots while still surfacing regressions.
 */

import { beforeAll, describe, expect, test } from 'bun:test';
import { config } from '../../src/config/config.ts';
import type { Rqo } from '../../src/core/concepts/rqo.ts';
import { readSectionRows } from '../../src/core/section/read.ts';
import { adoptEntriesArrayContract } from './normalize.ts';
import { PhpApiClient, hasPhpCredentials } from './php_client.ts';

/** One data-bearing component per model family (verified via SQL). */
const SWEEP: { model: string; tipo: string; section: string }[] = [
	// numisdata34/numisdata3: every record in the limit-3 window carries real
	// relation data (verified via jsonb_each probe 2026-07-07). The former
	// fixture (numisdata1338 under numisdata6) was DEGENERATE BY CONSTRUCTION —
	// numisdata1338's ontology parent is numisdata126, so projecting it on a
	// numisdata6 read yields zero items on BOTH engines and the model was
	// "certified matched" on an empty-vs-empty compare since birth (audit
	// 2026-07-07; the non-empty floor below is what exposed it).
	{ model: 'component_autocomplete', tipo: 'numisdata34', section: 'numisdata3' },
	{ model: 'component_autocomplete_hi', tipo: 'numisdata20', section: 'numisdata6' },
	{ model: 'component_date', tipo: 'numisdata1342', section: 'numisdata6' },
	{ model: 'component_geolocation', tipo: 'numisdata264', section: 'numisdata6' },
	{ model: 'component_html_text', tipo: 'numisdata18', section: 'numisdata6' },
	{ model: 'component_input_text', tipo: 'numisdata1007', section: 'numisdata6' },
	{ model: 'component_iri', tipo: 'numisdata1339', section: 'numisdata6' },
	{ model: 'component_portal', tipo: 'numisdata1281', section: 'numisdata6' },
	{ model: 'component_publication', tipo: 'numisdata434', section: 'numisdata6' },
	{ model: 'component_radio_button', tipo: 'numisdata266', section: 'numisdata6' },
	{ model: 'component_relation_related', tipo: 'numisdata1337', section: 'numisdata6' },
	{ model: 'component_text_area', tipo: 'numisdata17', section: 'numisdata6' },
	// second wave: sections carrying models numisdata6 lacks
	{ model: 'component_image', tipo: 'rsc29', section: 'rsc170' },
	{ model: 'component_svg', tipo: 'rsc855', section: 'rsc170' },
	{ model: 'component_pdf', tipo: 'rsc209', section: 'rsc205' },
	{ model: 'component_select', tipo: 'numisdata309', section: 'numisdata3' },
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
		if (!hasPhpCredentials()) return;
		client = new PhpApiClient();
		const loggedIn = await client.login(
			config.phpReference.username as string,
			config.phpReference.password as string,
		);
		if (!loggedIn) throw new Error('PHP login failed');
	});

	test('sweep all models; lock the known-good set; ledger divergences', async () => {
		if (!hasPhpCredentials()) return;
		const divergent: string[] = [];
		const matched: string[] = [];

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
			// DEC-02 / WIRE_CONTRACT.md WC-001 (unified [] as of the WS-C
			// engine-wide unification): PHP still emits entries:null for empty
			// values, so the normalizer rewrites the PHP side ONLY. The TS side
			// is compared RAW — if the engine ever regresses to null, this sweep
			// reddens (the shrunken normalization doubles as the tripwire).
			const phpItems = adoptEntriesArrayContract(
				((body.result as { data: Record<string, unknown>[] }).data ?? [])
					.filter((item) => item.tipo === target.tipo)
					.map(comparable),
			);
			const tsItems = (
				(await readSectionRows(rqo as unknown as Rqo)) as unknown as Record<string, unknown>[]
			)
				.filter((item) => item.tipo === target.tipo)
				.map(comparable);

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
		// The locked baseline must stay green (asserted AFTER the ledger prints).
		for (const lockedModel of KNOWN_GOOD) {
			expect(divergent).not.toContain(lockedModel);
		}
	}, 60000);
});
