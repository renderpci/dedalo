/**
 * RELATIONS_SPEC.md gate 3 — request_config resolution parity over the §7
 * corpus (both config strategies exercised: explicit, self-targeting sqo,
 * dynamic hierarchy_types, multi-section, filter_by_list expansion, and the
 * implicit/no-source legacy rows).
 *
 * Oracle: dd_core_api::get_element_context on the live PHP server vs the TS
 * dispatch handler — comparing the REQUEST_CONFIG projection: per item
 * api_engine/type, resolved sqo target sections, the show/search/choose
 * ddo_map identity chain (tipo/parent/mode), and the expanded filter_by_list
 * (per filter: context tipo + datalist labels/values).
 *
 * sqo.section_tipo entries are the ENRICHED ddo objects on both engines
 * (labels, colors, permissions, buttons, matrix_table — the CLIENT depends
 * on them: portal link/new buttons read target_section[0].tipo) and are
 * compared IN FULL.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { config } from '../../src/config/config.ts';
import { dispatchRqo } from '../../src/core/api/dispatch.ts';
import type { Rqo } from '../../src/core/concepts/rqo.ts';
import { sql } from '../../src/core/db/postgres.ts';
import { clearOntologyDerivedCaches } from '../../src/core/ontology/cache_invalidation.ts';
import { getElementTargetSectionTipos } from '../../src/core/relations/request_config/build.ts';
import { resolvePrincipal } from '../../src/core/security/permissions.ts';
import { createSession, getSession } from '../../src/core/security/session_store.ts';
import { normalizeSectionIdTypes } from './normalize.ts';
import { hasPhpCredentials, PhpApiClient } from './php_client.ts';

/** The §7 corpus rows this gate drives (component context in EDIT mode). */
const CASES: { tipo: string; section_tipo: string; family: string }[] = [
	// explicit config
	{ tipo: 'numisdata161', section_tipo: 'numisdata4', family: 'explicit + filter_by_list' },
	{ tipo: 'numisdata77', section_tipo: 'numisdata3', family: 'explicit portal' },
	{ tipo: 'numisdata75', section_tipo: 'numisdata3', family: 'explicit portal + dataframe' },
	{ tipo: 'numisdata249', section_tipo: 'numisdata3', family: 'explicit deep ddo_map' },
	{ tipo: 'numisdata34', section_tipo: 'numisdata3', family: 'explicit autocomplete + dataframe' },
	// multi-section + dynamic hierarchy_types targets
	{ tipo: 'numisdata159', section_tipo: 'numisdata3', family: 'explicit multi-section' },
	{ tipo: 'numisdata20', section_tipo: 'numisdata6', family: 'explicit hierarchy_types' },
	{ tipo: 'rsc860', section_tipo: 'rsc167', family: 'explicit hierarchy_types wide' },
	// implicit-self sqo (no section_tipo, filter_by_list only)
	{ tipo: 'numisdata36', section_tipo: 'numisdata3', family: 'explicit self-targeting sqo' },
	{ tipo: 'numisdata1006', section_tipo: 'numisdata3', family: 'explicit self-targeting sqo' },
	// implicit / no-source legacy rows
	{ tipo: 'numisdata55', section_tipo: 'numisdata4', family: 'implicit legacy source object' },
	{ tipo: 'numisdata967', section_tipo: 'numisdata3', family: 'implicit no-source radio' },
	{ tipo: 'numisdata71', section_tipo: 'numisdata3', family: 'implicit no-source autocomplete' },
	{ tipo: 'numisdata1562', section_tipo: 'numisdata3', family: 'implicit no-source select' },
	// external engine (zenon aux item -> api_config attach) + portals
	{ tipo: 'numisdata163', section_tipo: 'numisdata6', family: 'explicit + zenon api_config' },
	{ tipo: 'rsc1435', section_tipo: 'rsc197', family: 'explicit family-unit portal' },
	{ tipo: 'hierarchy93', section_tipo: 'tema1', family: 'explicit thesaurus library' },
	// source {mode: external} — inverse/runtime resolution, no request_config
	{ tipo: 'hierarchy40', section_tipo: 'cult1', family: 'external-mode relation_index' },
];

/**
 * sqo.section_tipo entries: BOTH engines ship the ENRICHED ddo objects
 * (typo/tipo/model/permissions/label/buttons/color/matrix_table — the client
 * contract; PHP build_sqo_section_tipo_ddo). Compared in full.
 */
function targetTipos(sectionTipo: unknown): unknown[] {
	return Array.isArray(sectionTipo) ? sectionTipo : [];
}

/** ddo_map identity chain incl. the SELF-RESOLVED section_tipo (the client
 * bug of 2026-07-03: 'self' must resolve to the sqo TARGETS, not the caller —
 * excluded from this projection, the corpus missed it). */
function ddoChain(
	block: unknown,
): { tipo: unknown; parent: unknown; mode: unknown; section_tipo: unknown }[] {
	const map = (block as { ddo_map?: Record<string, unknown>[] } | null)?.ddo_map ?? [];
	return map.map((ddo) => ({
		tipo: ddo.tipo,
		parent: ddo.parent,
		mode: ddo.mode,
		section_tipo: ddo.section_tipo ?? null,
		// STEP 9 hydration (external-API components): the ontology stores the flag
		// `fields_map: true` and the wire must carry the node's real mapping —
		// service_autocomplete.js:911/:1060 read fields_map[0].remote to shape the
		// answer and to build '&field[]='. `null` on every ordinary ddo, which is
		// also what the oracle emits (the key is absent unless hydrated).
		fields_map: ddo.fields_map ?? null,
		lang: ddo.lang ?? null,
	}));
}

/** filter_by_list expansion surface: filter component + its option list. */
function filterByListSurface(
	filterByList: unknown,
): { tipo: unknown; options: { label: unknown; section_id: unknown }[] }[] {
	const list = Array.isArray(filterByList) ? filterByList : [];
	return list.map((filter) => {
		const context = (filter as { context?: unknown }).context;
		const contextEntry = Array.isArray(context) ? context[0] : context;
		const datalist = ((filter as { datalist?: unknown[] }).datalist ?? []) as Record<
			string,
			unknown
		>[];
		return {
			tipo: (contextEntry as { tipo?: unknown } | null)?.tipo,
			options: datalist.map((option) => ({
				label: option.label,
				section_id: option.section_id,
			})),
		};
	});
}

/** The full comparable projection of one request_config array. */
function configProjection(requestConfig: unknown): unknown {
	const items = Array.isArray(requestConfig) ? (requestConfig as Record<string, unknown>[]) : [];
	return items.map((item) => {
		const sqo = (item.sqo ?? {}) as Record<string, unknown>;
		return {
			api_engine: item.api_engine,
			type: item.type,
			// The target section's external binding. PHP emits the key on EVERY
			// item — null for the dedalo engine — and the client reads it as soon
			// as api_engine !== 'dedalo' (component_portal.js:2054, ui_base_url +
			// section_id). TS publishes a SHAPED copy (publishApiConfig): credential
			// keys stripped, unknown keys dropped, http(s)-only URLs. On this
			// corpus that is field-identical to the oracle's raw echo.
			api_config: item.api_config ?? null,
			targets: targetTipos(sqo.section_tipo),
			filter_by_list:
				sqo.filter_by_list === undefined ? null : filterByListSurface(sqo.filter_by_list),
			show: ddoChain(item.show),
			search: ddoChain(item.search),
			choose: ddoChain(item.choose),
		};
	});
}

function elementContextRqo(
	tipo: string,
	sectionTipo: string,
	mode = 'edit',
): Record<string, unknown> {
	return {
		action: 'get_element_context',
		dd_api: 'dd_core_api',
		prevent_lock: true,
		source: {
			tipo,
			section_tipo: sectionTipo,
			mode,
			lang: 'lg-spa',
		},
	};
}

describe.if(hasPhpCredentials())(
	'relation corpus request_config parity (spec §7/§8 gate 3)',
	() => {
		const results = new Map<string, { php: unknown; ts: unknown }>();

		beforeAll(async () => {
			if (!hasPhpCredentials()) return;
			const client = new PhpApiClient();
			await client.login(
				config.phpReference.username as string,
				config.phpReference.password as string,
			);
			const token = createSession(-1, 'root', true);
			const session = getSession(token);
			const principal = await resolvePrincipal(-1);

			for (const testCase of CASES) {
				const rqo = elementContextRqo(testCase.tipo, testCase.section_tipo);
				const { body } = await client.call(structuredClone(rqo));
				const phpEntry = ((body.result as Record<string, unknown>[]) ?? [])[0];
				const tsResult = await dispatchRqo(structuredClone(rqo) as unknown as Rqo, {
					requestId: 't',
					clientIp: '127.0.0.1',
					session,
					csrfCandidate: session?.csrfToken ?? null,
					principal,
				});
				const tsEntry = ((tsResult.body.data as Record<string, unknown>[]) ?? [])[0];
				// WC-2026-08-10-section-id-int-canonical: address keys compared by VALUE on BOTH sides (fixtures keep the PHP-era numeric strings).
				results.set(testCase.tipo, {
					php: normalizeSectionIdTypes(configProjection(phpEntry?.request_config)),
					ts: normalizeSectionIdTypes(configProjection(tsEntry?.request_config)),
				});
			}
		});

		for (const testCase of CASES) {
			test(`${testCase.tipo} (${testCase.family}): request_config projection matches PHP`, () => {
				if (!hasPhpCredentials()) return;
				const pair = results.get(testCase.tipo);
				expect(pair).toBeDefined();
				expect(pair?.ts).toEqual(pair?.php as never);
			});
		}
	},
);

// ===========================================================================
// component_relation_model target resolution (plan gate #5) — TS-NATIVE cases.
//
// The model was in NO corpus sweep when the frozen store was harvested
// (2026-07-11), and a re-harvest is impossible by definition — so these cases
// cannot ride the PhpApiClient replay above (a fixture lookup for
// hierarchy27@es1 would MISS and throw). They pin the CONTRACT directly
// against the suite database instead, oracle-of-record v6
// class.component_relation_model.php:115-177: target = registry pairing
// hierarchy53 == caller → hierarchy58, falling back to tld(caller)+'2' — for
// es1 both agree on es2 (registry row hierarchy1/66: es1 → es2). TS resolution:
// the descriptor-declared `targetSource: 'section_model'` default
// (request_config/target_sources.ts → ontology/model_section.ts), applied at
// the ONE seam buildRequestConfigForElement.
//
// Two shapes, matching the two builder branches the seam must cover:
//  1. hierarchy27 in es1 (edit AND list) — EXPLICIT config whose ontology sqo
//     declares section_tipo: [] (defined-but-empty; the node's retired `_info`
//     admits the target "is calculated in class"). Pre-fix TS resolved NO
//     target here — empty edit options, blank list labels.
//  2. A SCRATCH relation_model node with NO source.request_config — the
//     IMPLICIT branch (buildImplicitComponentListConfig), whose relation-graph
//     walk picks the first section-model entry of node.relations. Mirroring
//     hierarchy27's live graph ([{hierarchy20},{hierarchy25}]) that pick is
//     hierarchy20, the raw 69,148-row thesaurus TEMPLATE: plausible, silent
//     and wrong. The model default must BEAT that pick (implicit.ts — a walk
//     pick is not a declaration). No live node exercises this branch (every
//     shipped relation_model node carries an explicit config), so the case is
//     constructed on a scratch ontology node — nothing else would catch a
//     seam applied to the explicit branch only.
//
// Scratch surface: dd_ontology tipo test9881 (tld 'test', the playground
// namespace — outside every other gate's sweep patterns), inserted in
// beforeAll, swept in afterAll and pre-cleaned for crashed runs. No matrix
// rows are written.
// ===========================================================================

/** The scratch implicit-branch relation_model node (dd_ontology, tld 'test'). */
const SCRATCH_IMPLICIT_TIPO = 'test9881';

/** hierarchy27's model-default resolution, per caller (the plan's worked example). */
const RELATION_MODEL_OWNER = 'es1';
const RELATION_MODEL_TWIN = 'es2';

describe.if(hasPhpCredentials())(
	'component_relation_model target resolution (plan gate #5, TS-native)',
	() => {
		beforeAll(async () => {
			// Crashed-run belt and braces first — the scratch tipo is ours alone.
			await sql.unsafe('DELETE FROM dd_ontology WHERE tipo = $1', [SCRATCH_IMPLICIT_TIPO]);
			await sql.unsafe(
				`INSERT INTO dd_ontology (id, tipo, parent, model, tld, relations, properties, is_translatable, term)
				 VALUES ((SELECT COALESCE(MAX(id), 0) + 1 FROM dd_ontology), $1, $2, $3, 'test', $4::text::jsonb, $5::text::jsonb, false, $6::text::jsonb)`,
				[
					SCRATCH_IMPLICIT_TIPO,
					RELATION_MODEL_OWNER,
					'component_relation_model',
					// hierarchy27's REAL relation graph: the section-model entry the
					// implicit walk picks (hierarchy20) + the label term component.
					JSON.stringify([{ tipo: 'hierarchy20' }, { tipo: 'hierarchy25' }]),
					// NO source.request_config → selectRequestConfigStrategy: implicit.
					JSON.stringify({ source: { mode: 'select' } }),
					JSON.stringify({ 'lg-spa': 'Scratch relation model (gate #5)' }),
				],
			);
			// The resolver/model caches may hold pre-insert negatives for the tipo.
			await clearOntologyDerivedCaches();
		});

		afterAll(async () => {
			await sql.unsafe('DELETE FROM dd_ontology WHERE tipo = $1', [SCRATCH_IMPLICIT_TIPO]);
			await clearOntologyDerivedCaches();
		});

		for (const mode of ['edit', 'list'] as const) {
			test(`hierarchy27 in ${RELATION_MODEL_OWNER} (${mode}): explicit-but-empty sqo resolves the model twin ${RELATION_MODEL_TWIN}`, async () => {
				if (!hasPhpCredentials()) return;
				const token = createSession(-1, 'root', true);
				const session = getSession(token);
				const principal = await resolvePrincipal(-1);
				const rqo = elementContextRqo('hierarchy27', RELATION_MODEL_OWNER, mode);
				const tsResult = await dispatchRqo(structuredClone(rqo) as unknown as Rqo, {
					requestId: 't',
					clientIp: '127.0.0.1',
					session,
					csrfCandidate: session?.csrfToken ?? null,
					principal,
				});
				const tsEntry = ((tsResult.body.data as Record<string, unknown>[]) ?? [])[0];
				const projection = configProjection(tsEntry?.request_config) as {
					targets: unknown[];
					show: { tipo: unknown; section_tipo: unknown }[];
				}[];

				// One config item (the node declares exactly one), targeting exactly
				// the caller's model section — never the caller itself, never the raw
				// hierarchy20 template.
				expect(projection).toHaveLength(1);
				const first = projection[0] as (typeof projection)[number];
				const targetTipos = first.targets.map((ddo) => (ddo as { tipo?: unknown }).tipo);
				expect(targetTipos).toEqual([RELATION_MODEL_TWIN]);

				// The label ddo (hierarchy25) must read against the TARGET row's
				// section — PHP's "label ddo, target row" behaviour: its ontology
				// `section_tipo: 'self'` resolves to the sqo TARGETS, not the caller
				// (the 2026-07-03 client bug class, same as the corpus projection).
				// Explicit-branch ddos carry the ARRAY section_tipo form.
				const labelDdo = first.show.find((ddo) => ddo.tipo === 'hierarchy25');
				expect(labelDdo).toBeDefined();
				expect(labelDdo?.section_tipo).toEqual([RELATION_MODEL_TWIN]);
			});
		}

		test('implicit branch (scratch node, NO source.request_config): model default beats the relation-walk pick — resolves the model twin, NOT hierarchy20', async () => {
			if (!hasPhpCredentials()) return;
			// Premise pin: the stored graph really does name hierarchy20, so the
			// implicit walk WOULD pick it — without this the NOT-hierarchy20 claim
			// below could go vacuous under a scratch-shape edit.
			const rows = (await sql.unsafe('SELECT relations FROM dd_ontology WHERE tipo = $1', [
				SCRATCH_IMPLICIT_TIPO,
			])) as { relations: { tipo?: string }[] }[];
			expect(rows[0]?.relations?.map((link) => link.tipo)).toContain('hierarchy20');

			// getElementTargetSectionTipos is the seam's exported consumer chokepoint
			// (import_conform, section_elements_context, relation_index all read it).
			// Default mode ('search') and 'edit' both take the component implicit
			// branch; 'list' would detour through the (absent) section_list child to
			// the same walk.
			const searchTargets = await getElementTargetSectionTipos(
				SCRATCH_IMPLICIT_TIPO,
				RELATION_MODEL_OWNER,
			);
			expect(searchTargets).toEqual([RELATION_MODEL_TWIN]);
			expect(searchTargets).not.toContain('hierarchy20');
			const editTargets = await getElementTargetSectionTipos(
				SCRATCH_IMPLICIT_TIPO,
				RELATION_MODEL_OWNER,
				'edit',
			);
			expect(editTargets).toEqual([RELATION_MODEL_TWIN]);
		});
	},
);
