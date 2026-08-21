/**
 * GENERIC diffusion domain fixture (tld `zzdif`) — the situation the plan
 * compiler and the resolver gates are asserted against.
 *
 * WHY IT EXISTS (2026-08-20). `diffusion_plan_compile` and `diffusion_resolver`
 * were the last two unit gates bound to an installation: they compiled and
 * resolved the DEPLOYMENT's diffusion domain (`DEDALO_DIFFUSION_DOMAIN`,
 * historically `numisdata_mib`, element `numisdata29`, section `numisdata6`).
 * That made them green on exactly one developer's machine — measured
 * 2026-08-20 on this checkout (domain `mht`) BOTH failed in `beforeAll`. A gate
 * that tests one install's records tests that install, not the engine.
 *
 * `buildVirtualDiffusionTree(domainName)` takes the domain as a parameter
 * (2026-08-20), so this fixture provisions a domain of its OWN under dd1190 and
 * the gates name it. Nothing is read from the ambient ontology: the domain, its
 * elements, its tables, its fields, the sections they publish AND the records
 * they project are all built here through `situation()` (reserved `zz*` TLD,
 * records land in `matrix_test`, teardown asserts zero residue).
 *
 * MINIMAL BUT FAITHFUL — the shapes are copied from a real install's dd1190
 * subtree (models, property bags, ddo_map/parser grammar), the VOLUME is not
 * (~700 nodes there, 33 here). Every law the two gates assert has a node:
 *
 *   zzdif40  diffusion_domain  'zzdif generic domain'          (parent dd1190)
 *     zzdif41  diffusion_group
 *       zzdif42  diffusion_element  {"diffusion":{"type":"sql"}}   ← THE element
 *         zzdif43  database  'zzdif_publication_db'
 *           zzdif44  table  'zzdif_primary'  → section zzdif1
 *             zzdif45  field_varchar  'title'        ← plain component read
 *             zzdif46  field_varchar  'code'
 *             zzdif47  field_text     'summary'      ← runtime parser chain
 *             zzdif48  field_int      'counter'      ← number column
 *             zzdif49  field_int      'published_at' ← REWRITER step, no ddo
 *             zzdif51  field_text     'linked_ids'   ← portal hop (frontier)
 *             zzdif52  field_enum     'publication'  ← exclude_column
 *           zzdif50  table_alias 'zzdif_linked' → zzdif60  ← ALIAS-IN-PLACE law
 *             zzdif53  field_varchar  'alias_own_field'
 *       zzdif55  diffusion_element  (holds the alias TARGET, so the real table
 *         zzdif56  database 'zzdif_alias_source_db'   is not element-suppressed)
 *           zzdif60  table 'zzdif_linked_real' → section zzdif20
 *             zzdif61  field_varchar 'name'
 *             zzdif62  field_enum    'publication' (exclude_column)
 *       zzdif70  diffusion_element  ← the LOUD-FAILURE element
 *         zzdif71  database 'zzdif_broken_db'
 *           zzdif72  table 'zzdif_broken' → section zzdif20
 *             zzdif73  field_varchar 'bad_parser'  parser fn NOT in the registry
 *
 * and the data side:
 *
 *   zzdif1   section 'zzdif primary section'   (parent test1, matrix_test)
 *     zzdif2 component_input_text (translatable) | zzdif3 component_input_text
 *     zzdif4 component_input_text | zzdif5 component_number
 *     zzdif6 component_publication | zzdif7 component_portal → zzdif20
 *   zzdif20  section 'zzdif linked section'
 *     zzdif21 component_input_text | zzdif22 component_publication
 *
 *   940001  zzdif1  PUBLISHABLE   (dd64/1) + portal → 940101, 940102
 *   940002  zzdif1  UNPUBLISHABLE (dd64/2)
 *   940101  zzdif20 publishable
 *   940102  zzdif20 publishable
 *
 * The ALIAS law needs the real table to live under ANOTHER element: the walk
 * suppresses a real node consumed by an alias INSIDE the same element
 * (virtual_tree.ts consumedByAliasByElement), which is exactly how the install
 * shape works too (an alias in one element targeting a table owned by another).
 */

import {
	dropSituation,
	ensureSituation,
	residueOf,
	type Situation,
	situation,
} from '../../src/core/test_data/situations/situation.ts';

/** The domain NAME the gates hand to buildVirtualDiffusionTree(). */
export const ZZDIF_DOMAIN_NAME = 'zzdif generic domain';
/** The dd1190 child node that name must resolve to. */
export const ZZDIF_DOMAIN_TIPO = 'zzdif40';
/** The sql element every plan-shape assertion is made against. */
export const ZZDIF_ELEMENT = 'zzdif42';
/** The element that must FAIL to compile (unknown parser fn). */
export const ZZDIF_BROKEN_ELEMENT = 'zzdif70';
/** The primary section the resolver projects rows from. */
export const ZZDIF_SECTION = 'zzdif1';
/** The linked section reached through the portal hop (frontier level 0). */
export const ZZDIF_LINKED_SECTION = 'zzdif20';
/** The alias table node (published under the ALIAS label). */
export const ZZDIF_TABLE_ALIAS = 'zzdif50';
/** The parser fn no registry entry exists for — the loud-failure subject. */
export const ZZDIF_UNKNOWN_PARSER_FN = 'parser_zzdif::no_such_fn';

export const ZZDIF_PUBLISHABLE_ID = 940001;
export const ZZDIF_UNPUBLISHABLE_ID = 940002;
export const ZZDIF_LINKED_IDS = [940101, 940102] as const;

/** dd64 = DEDALO_SECTION_SI_NO_TIPO; section_id 1 = yes, 2 = no. */
const YES = [{ section_tipo: 'dd64', section_id: 1 }];
const NO = [{ section_tipo: 'dd64', section_id: 2 }];

/** The `publication` enum field shape every install writes (exclude_column). */
function publicationField(tipo: string, source: string) {
	return {
		tipo,
		model: 'field_enum',
		term: { 'lg-spa': 'publication' },
		relations: [{ tipo: source }],
		properties: {
			exclude_column: true,
			process: {
				parser: [
					{ fn: 'parser_locator::get_v6_section_id' },
					{ fn: 'parser_helper::get_first' },
					{ fn: 'parser_text::map_value', options: { map: [{ a: { '1': 'si', '2': 'no' } }] } },
				],
				default_value: 'no',
			},
		},
	};
}

function buildSituation(): Situation {
	return situation({
		name: 'zzdif generic diffusion domain',
		tld: 'zzdif',
		nodes: [
			// ---- data side: two sections with components ----------------------
			{ tipo: 'zzdif1', parent: 'test1', model: 'section', term: { 'lg-spa': 'zzdif primary' } },
			{
				tipo: 'zzdif2',
				parent: 'zzdif1',
				model: 'component_input_text',
				term: { 'lg-spa': 'title source' },
				is_translatable: true,
				order_number: 1,
			},
			{
				tipo: 'zzdif3',
				parent: 'zzdif1',
				model: 'component_input_text',
				term: { 'lg-spa': 'code source' },
				order_number: 2,
			},
			{
				tipo: 'zzdif4',
				parent: 'zzdif1',
				model: 'component_input_text',
				term: { 'lg-spa': 'summary source' },
				is_translatable: true,
				order_number: 3,
			},
			{
				tipo: 'zzdif5',
				parent: 'zzdif1',
				model: 'component_number',
				term: { 'lg-spa': 'counter source' },
				order_number: 4,
			},
			{
				tipo: 'zzdif6',
				parent: 'zzdif1',
				model: 'component_publication',
				term: { 'lg-spa': 'publication source' },
				order_number: 5,
			},
			{
				tipo: 'zzdif7',
				parent: 'zzdif1',
				model: 'component_portal',
				term: { 'lg-spa': 'linked source' },
				order_number: 6,
			},
			{ tipo: 'zzdif20', parent: 'test1', model: 'section', term: { 'lg-spa': 'zzdif linked' } },
			{
				tipo: 'zzdif21',
				parent: 'zzdif20',
				model: 'component_input_text',
				term: { 'lg-spa': 'linked name source' },
				is_translatable: true,
				order_number: 1,
			},
			{
				tipo: 'zzdif22',
				parent: 'zzdif20',
				model: 'component_publication',
				term: { 'lg-spa': 'linked publication source' },
				order_number: 2,
			},

			// ---- diffusion side: the domain ------------------------------------
			{
				tipo: 'zzdif40',
				parent: 'dd1190',
				model: 'diffusion_domain',
				term: { 'lg-spa': ZZDIF_DOMAIN_NAME },
			},
			{
				tipo: 'zzdif41',
				parent: 'zzdif40',
				model: 'diffusion_group',
				term: { 'lg-spa': 'zzdif group' },
			},
			// element 1 — the subject of every plan-shape assertion.
			{
				tipo: 'zzdif42',
				parent: 'zzdif41',
				model: 'diffusion_element',
				term: { 'lg-spa': 'zzdif sql element' },
				properties: { diffusion: { type: 'sql' } },
				order_number: 1,
			},
			{
				tipo: 'zzdif43',
				parent: 'zzdif42',
				model: 'database',
				term: { 'lg-spa': 'zzdif_publication_db' },
			},
			{
				tipo: 'zzdif44',
				parent: 'zzdif43',
				model: 'table',
				term: { 'lg-spa': 'zzdif_primary' },
				relations: [{ tipo: 'zzdif1' }],
				order_number: 1,
			},
			{
				tipo: 'zzdif45',
				parent: 'zzdif44',
				model: 'field_varchar',
				term: { 'lg-spa': 'title' },
				relations: [{ tipo: 'zzdif2' }],
				properties: { varchar: 500 },
				order_number: 1,
			},
			{
				tipo: 'zzdif46',
				parent: 'zzdif44',
				model: 'field_varchar',
				term: { 'lg-spa': 'code' },
				relations: [{ tipo: 'zzdif3' }],
				properties: { varchar: 64 },
				order_number: 2,
			},
			{
				tipo: 'zzdif47',
				parent: 'zzdif44',
				model: 'field_text',
				term: { 'lg-spa': 'summary' },
				relations: [{ tipo: 'zzdif4' }],
				properties: {
					process: { parser: [{ fn: 'parser_text::v5_html' }], output_format: 'string' },
				},
				order_number: 3,
			},
			{
				tipo: 'zzdif48',
				parent: 'zzdif44',
				model: 'field_int',
				term: { 'lg-spa': 'counter' },
				relations: [{ tipo: 'zzdif5' }],
				order_number: 4,
			},
			// REWRITER step + no ddo_map: absorbed at compile ('rewriter:…@zzdif49'),
			// executed by the resolver as the run-scoped constant.
			{
				tipo: 'zzdif49',
				parent: 'zzdif44',
				model: 'field_int',
				term: { 'lg-spa': 'published_at' },
				properties: {
					process: {
						parser: [{ fn: 'parser_global::publication_unix_timestamp' }],
						output_format: 'int',
					},
				},
				order_number: 5,
			},
			// The portal hop: its locators are what the frontier queues.
			{
				tipo: 'zzdif51',
				parent: 'zzdif44',
				model: 'field_text',
				term: { 'lg-spa': 'linked_ids' },
				relations: [{ tipo: 'zzdif7' }],
				properties: {
					process: {
						parser: [{ fn: 'parser_locator::get_v6_section_id' }],
						output_format: 'json',
					},
				},
				order_number: 6,
			},
			{ ...publicationField('zzdif52', 'zzdif6'), parent: 'zzdif44', order_number: 7 },
			// The alias: publishes under ITS label, fields merge from zzdif60.
			{
				tipo: 'zzdif50',
				parent: 'zzdif43',
				model: 'table_alias',
				term: { 'lg-spa': 'zzdif_linked' },
				relations: [{ tipo: 'zzdif60' }],
				order_number: 2,
			},
			{
				tipo: 'zzdif53',
				parent: 'zzdif50',
				model: 'field_varchar',
				term: { 'lg-spa': 'alias_own_field' },
				relations: [{ tipo: 'zzdif21' }],
				properties: { varchar: 128 },
				order_number: 1,
			},

			// element 2 — owns the alias TARGET table (see the header note).
			{
				tipo: 'zzdif55',
				parent: 'zzdif41',
				model: 'diffusion_element',
				term: { 'lg-spa': 'zzdif alias source element' },
				properties: { diffusion: { type: 'sql' } },
				order_number: 2,
			},
			{
				tipo: 'zzdif56',
				parent: 'zzdif55',
				model: 'database',
				term: { 'lg-spa': 'zzdif_alias_source_db' },
			},
			{
				tipo: 'zzdif60',
				parent: 'zzdif56',
				model: 'table',
				term: { 'lg-spa': 'zzdif_linked_real' },
				relations: [{ tipo: 'zzdif20' }],
			},
			{
				tipo: 'zzdif61',
				parent: 'zzdif60',
				model: 'field_varchar',
				term: { 'lg-spa': 'name' },
				relations: [{ tipo: 'zzdif21' }],
				properties: { varchar: 500 },
				order_number: 1,
			},
			{ ...publicationField('zzdif62', 'zzdif22'), parent: 'zzdif60', order_number: 2 },

			// element 3 — must FAIL to compile, naming the field and the fn.
			{
				tipo: 'zzdif70',
				parent: 'zzdif41',
				model: 'diffusion_element',
				term: { 'lg-spa': 'zzdif broken element' },
				properties: { diffusion: { type: 'sql' } },
				order_number: 3,
			},
			{
				tipo: 'zzdif71',
				parent: 'zzdif70',
				model: 'database',
				term: { 'lg-spa': 'zzdif_broken_db' },
			},
			{
				tipo: 'zzdif72',
				parent: 'zzdif71',
				model: 'table',
				term: { 'lg-spa': 'zzdif_broken' },
				relations: [{ tipo: 'zzdif20' }],
			},
			{
				tipo: 'zzdif73',
				parent: 'zzdif72',
				model: 'field_varchar',
				term: { 'lg-spa': 'bad_parser' },
				relations: [{ tipo: 'zzdif21' }],
				properties: { process: { parser: [{ fn: ZZDIF_UNKNOWN_PARSER_FN }] } },
			},
		],
		records: [
			{
				section_tipo: 'zzdif1',
				section_id: ZZDIF_PUBLISHABLE_ID,
				columns: {
					// component_input_text stores {value,lang} items in the `string`
					// column (its descriptor), NOT in `data`.
					string: {
						zzdif2: [{ value: 'zzdif publishable title', lang: 'lg-spa' }],
						zzdif3: [{ value: 'ZZDIF-0001' }],
						zzdif4: [{ value: 'A <b>summary</b> body', lang: 'lg-spa' }],
					},
					number: { zzdif5: [{ value: 42 }] },
					relation: {
						zzdif6: YES,
						zzdif7: ZZDIF_LINKED_IDS.map((id) => ({
							section_tipo: 'zzdif20',
							section_id: id,
						})),
					},
				},
			},
			{
				section_tipo: 'zzdif1',
				section_id: ZZDIF_UNPUBLISHABLE_ID,
				columns: {
					string: {
						zzdif2: [{ value: 'zzdif unpublishable title', lang: 'lg-spa' }],
						zzdif3: [{ value: 'ZZDIF-0002' }],
					},
					number: { zzdif5: [{ value: 7 }] },
					relation: { zzdif6: NO },
				},
			},
			...ZZDIF_LINKED_IDS.map((id) => ({
				section_tipo: 'zzdif20',
				section_id: id,
				columns: {
					string: { zzdif21: [{ value: `zzdif linked ${id}`, lang: 'lg-spa' }] },
					relation: { zzdif22: YES },
				},
			})),
		],
	});
}

/** The validated descriptor (pure — no DB until ensure/drop). */
export const ZZDIF_SITUATION: Situation = buildSituation();

/** Provision the fixture; any leftover from an aborted run is swept first. */
export async function ensureZzdifDomain(): Promise<void> {
	await dropSituation(ZZDIF_SITUATION);
	await ensureSituation(ZZDIF_SITUATION);
}

/** Tear it down; the returned residue count MUST be asserted 0 by the caller. */
export async function dropZzdifDomain(): Promise<number> {
	return dropSituation(ZZDIF_SITUATION);
}

/** Rows this situation currently owns (nodes + records + counters). */
export async function zzdifResidue(): Promise<number> {
	return residueOf(ZZDIF_SITUATION);
}
