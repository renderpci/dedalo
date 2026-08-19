/**
 * SECTION_SPEC §6 gate: the section-only context extras — section_map,
 * matrix_table, config.relation_list_tipo — byte-parity vs live PHP.
 *
 * The base context_differential compares only the 9-field structural subset;
 * this gate pins the section stamp fields PHP emits on the SECTION entry
 * (class.common.php :2056-2100) that the earlier ledger reported as UNCOVERED.
 */
// BINDS INSTALL TLDs: cult, numisdata, rsc — install-specific fixtures, grandfathered in
// engineering/generic_tld_baseline.json (generic_tld_tripwire, shrink-only). This test
// is meaningful only on a database holding those installs' records. Migrate it to a
// built situation (src/core/test_data/situations) or the generic `test` TLD, then
// regenerate the baseline (`bun run scripts/generic_tld_baseline.ts`).

import { describe, expect, test } from 'bun:test';
import { config } from '../../src/config/config.ts';
import type { Rqo } from '../../src/core/concepts/rqo.ts';
import { readSection } from '../../src/core/section/read.ts';
import { hasPhpCredentials, PhpApiClient } from './php_client.ts';

/** The full SECTION_SPEC §12 corpus: object sections, an audiovisual + a people
 * section, a thesaurus-config section (cult1) and the Thesaurus section
 * (hierarchy20) — covering section_map present/absent, virtual sections
 * (rsc167 → rsc2), and relation_list present/absent. */
const SECTIONS = [
	'numisdata6',
	'numisdata3',
	'numisdata4',
	'rsc167',
	'rsc197',
	'cult1',
	'hierarchy20',
];

function readRqo(sectionTipo: string): Rqo {
	return {
		action: 'read',
		dd_api: 'dd_core_api',
		prevent_lock: true,
		source: {
			model: 'section',
			tipo: sectionTipo,
			section_tipo: sectionTipo,
			mode: 'list',
			lang: 'lg-spa',
			action: 'search',
		},
		sqo: { section_tipo: [sectionTipo], limit: 1, offset: 0 },
	} as unknown as Rqo;
}

function sectionEntry(context: Record<string, unknown>[], tipo: string): Record<string, unknown> {
	const entry = context.find((item) => item.tipo === tipo && item.model === 'section');
	if (entry === undefined) throw new Error(`no section entry for ${tipo}`);
	return entry;
}

describe.if(hasPhpCredentials())('section context extras differential (SECTION_SPEC §6)', () => {
	for (const sectionTipo of SECTIONS) {
		test(`${sectionTipo}: section_map + matrix_table + relation_list_tipo match PHP`, async () => {
			if (!hasPhpCredentials()) return;
			const client = new PhpApiClient();
			await client.login(
				config.phpReference.username as string,
				config.phpReference.password as string,
			);
			const rqo = readRqo(sectionTipo);
			const { body } = await client.call(
				structuredClone(rqo) as unknown as Record<string, unknown>,
			);
			const phpContext = (body.result as { context: Record<string, unknown>[] }).context;
			const tsContext = (await readSection(rqo)).context as unknown as Record<string, unknown>[];

			const php = sectionEntry(phpContext, sectionTipo);
			const ts = sectionEntry(tsContext, sectionTipo);

			// section_map: the section_map node properties (null when the section
			// declares none). PHP may omit the key entirely vs TS null — treat
			// undefined and null as equivalent absence.
			expect(ts.section_map ?? null).toEqual(php.section_map ?? null);
			expect(ts.matrix_table ?? null).toEqual(php.matrix_table ?? null);
			const phpRelListTipo =
				(php.config as { relation_list_tipo?: unknown } | undefined)?.relation_list_tipo ?? null;
			const tsRelListTipo =
				(ts.config as { relation_list_tipo?: unknown } | undefined)?.relation_list_tipo ?? null;
			expect(tsRelListTipo).toEqual(phpRelListTipo);

			// component_relation_model TARGET parity (the hierarchy27 regression,
			// 2026-08-14). PHP resolves this model's targets registry-first —
			// hierarchy53 == caller → hierarchy58, falling back to tld+'2' (v6
			// class.component_relation_model.php:115-177) — and the frozen store
			// already holds its answer for hierarchy27 in cult1: target_sections
			// [{tipo:'cult2', label:'Cultura [m]'}]. TS resolved [] (the node's sqo
			// declares section_tipo: [], and the calculation was never ported) while
			// this gate compared ONLY the section entry — which is exactly how the
			// regression stayed invisible. Greens via the model's `section_model`
			// default target (request_config/target_sources.ts →
			// ontology/model_section.ts).
			//
			// FIELD-SCOPED on target_sections, never the whole context entry: TS
			// emits `request_config` on relation entries where PHP's
			// component_relation_model_json passes add_request_config=false — an
			// unrelated, PRE-EXISTING divergence a whole-entry compare would red on.
			const phpRelationModels = phpContext.filter(
				(entry) => entry.model === 'component_relation_model',
			);
			if (sectionTipo === 'cult1') {
				// Non-vacuity pin: the ONE frozen relation_model datapoint lives in
				// cult1's context (hierarchy27). If a fixture edit ever drained it,
				// this sweep would go silently green — fail loudly instead.
				expect(phpRelationModels.map((entry) => entry.tipo)).toContain('hierarchy27');
			}
			for (const phpEntry of phpRelationModels) {
				const tsEntry = tsContext.find(
					(entry) =>
						entry.tipo === phpEntry.tipo &&
						entry.model === 'component_relation_model' &&
						entry.section_tipo === phpEntry.section_tipo,
				);
				if (tsEntry === undefined)
					throw new Error(
						`no TS context entry for component_relation_model ${String(phpEntry.tipo)} in ${sectionTipo}`,
					);
				expect(tsEntry.target_sections ?? null).toEqual(phpEntry.target_sections ?? null);
			}
		});
	}
});
