/**
 * A BUILT export chain — the multi-hop shape the P6 export gate needs, with
 * every record it walks actually present.
 *
 * WHY THIS EXISTS. `diffusion_export_unified` exported the phase-2 `test`-TLD
 * twins of an installation's coin/mint ontology, and six of its cases emitted
 * rows whose cells were all EMPTY. The file's own note blamed an empty
 * `show.ddo_map` on the seed twin. That was a MISDIAGNOSIS — measured
 * 2026-08-22, those maps are fully populated. The real gap is one level out:
 *
 *   - the dataframe-bearing main resolves through a `sqo` naming section
 *     `test6810`, whose records the corpus does not hold;
 *   - the hierarchical leaf reads `hierarchy25` off a thesaurus record that is
 *     likewise absent — and the record the hop actually lands on
 *     (`testmint1/75`) carries no value for that component at all;
 *   - the portal leaf targets `rsc332`, again unprovisioned.
 *
 * So the chains resolve into sections that exist as DEFINITIONS and hold no
 * RECORDS, and an export of nothing is indistinguishable from an export that
 * silently stopped descending. That is not fixable in the corpus: it is
 * DERIVED, never authored (`scripts/derive_test_corpus.ts` reconstructs only
 * what the frozen store reveals and REFUSES rather than guess), so the missing
 * neighbours cannot be typed in by hand without inventing data.
 *
 * The law's answer is to BUILD the situation instead, which is also the
 * stronger gate: this chain is closed — every hop lands on a record that
 * exists, and every leaf has a value — so an empty cell here can only mean the
 * engine stopped walking.
 *
 * ── THE SHAPE ────────────────────────────────────────────────────────────────
 *   zzexp1   section  MAIN (a "coin")
 *     zzexp2   component_input_text     literal, the flat column
 *     zzexp3   component_portal         THE HOP → zzexp10
 *     zzexp4   component_autocomplete   a dataframe-bearing main → zzexp30
 *     zzexp5   component_dataframe      frames of zzexp4's items → zzexp20
 *   zzexp10  section  TARGET (a "mint") — everything the hop can read
 *     zzexp11  component_input_text     literal leaf
 *     zzexp12  component_autocomplete   relation leaf → zzexp40
 *     zzexp13  component_portal         portal leaf → zzexp20
 *   zzexp20  section  referenced records (portal + frame targets)
 *   zzexp30  section  label records (the autocomplete main's targets)
 *   zzexp40  section  term records (the relation leaf's targets)
 *
 * Every relation component carries the `source.request_config[0]` shape the
 * engine actually reads — `sqo.section_tipo` naming the target and a
 * `show.ddo_map` naming the component to render on it — copied in STRUCTURE
 * (never in content) from the install nodes above, because that map is what the
 * export walker descends.
 */

import { type Situation, situation } from '../../src/core/test_data/situations/situation.ts';

export const ZZEXP_MAIN_SECTION = 'zzexp1';
export const ZZEXP_TARGET_SECTION = 'zzexp10';
export const ZZEXP_REF_SECTION = 'zzexp20';

/** MAIN components. */
export const ZZEXP_LITERAL = 'zzexp2';
export const ZZEXP_HOP = 'zzexp3';
export const ZZEXP_DATAFRAME_MAIN = 'zzexp4';
export const ZZEXP_DATAFRAME_SLOT = 'zzexp5';

/** TARGET components — the three leaf kinds a hop can land on. */
export const ZZEXP_LEAF_LITERAL = 'zzexp11';
export const ZZEXP_LEAF_RELATION = 'zzexp12';
export const ZZEXP_LEAF_PORTAL = 'zzexp13';

/** The two MAIN records every case exports. */
export const ZZEXP_RECORD_IDS = [950001, 950002] as const;

const TARGET_ID = 950101;
const REF_IDS = [950201, 950202] as const;
const LABEL_ID = 950301;
const TERM_ID = 950401;

/**
 * The `source` block a related component needs for the export to descend: which
 * section its locators point at, and which component to render there.
 * `parent: 'self'` + `section_tipo: 'self'` is the install spelling for "on the
 * target record itself".
 */
function relationSource(targetSection: string, showTipos: string[]): Record<string, unknown> {
	return {
		request_config: [
			{
				sqo: { section_tipo: [{ value: [targetSection], source: 'section' }] },
				show: {
					ddo_map: showTipos.map((tipo) => ({
						tipo,
						parent: 'self',
						section_tipo: 'self',
					})),
					fields_separator: ' | ',
				},
			},
		],
	};
}

/** dd151 = the ordinary link relation type every locator above uses. */
const LINK = 'dd151';
/** dd490 = DEDALO_RELATION_TYPE_DATAFRAME — the frame marker. */
const DATAFRAME = 'dd490';

const link = (sectionTipo: string, sectionId: number, fromComponent: string, id = 1) => ({
	id,
	type: LINK,
	section_id: sectionId,
	section_tipo: sectionTipo,
	from_component_tipo: fromComponent,
});

function buildSituation(): Situation {
	return situation({
		name: 'zzexp export chain',
		tld: 'zzexp',
		nodes: [
			// ---- MAIN ---------------------------------------------------------
			{
				tipo: ZZEXP_MAIN_SECTION,
				parent: 'dd14',
				term: { 'lg-eng': 'zzexp main' },
				model: 'section',
				relations: [{ tipo: 'test24' }],
			},
			{
				tipo: ZZEXP_LITERAL,
				parent: ZZEXP_MAIN_SECTION,
				term: { 'lg-eng': 'zzexp ref' },
				model: 'component_input_text',
				order_number: 1,
				is_translatable: true,
			},
			{
				tipo: ZZEXP_HOP,
				parent: ZZEXP_MAIN_SECTION,
				term: { 'lg-eng': 'zzexp hop' },
				model: 'component_portal',
				order_number: 2,
				relations: [{ tipo: ZZEXP_TARGET_SECTION }],
				properties: {
					view: 'default',
					source: relationSource(ZZEXP_TARGET_SECTION, [ZZEXP_LEAF_LITERAL]),
				},
			},
			{
				// A LITERAL-less main that carries a dataframe: `has_dataframe` is
				// required on a literal main and IGNORED by a relation main, which
				// activates through the ddo in `show.ddo_map` — so the slot is named
				// there, exactly as the install nodes do it.
				tipo: ZZEXP_DATAFRAME_MAIN,
				parent: ZZEXP_MAIN_SECTION,
				term: { 'lg-eng': 'zzexp labelled main' },
				model: 'component_autocomplete',
				order_number: 3,
				relations: [{ tipo: 'zzexp30' }],
				properties: {
					children_view: 'text',
					source: {
						request_config: [
							{
								sqo: { section_tipo: [{ value: ['zzexp30'], source: 'section' }] },
								show: {
									ddo_map: [
										{ tipo: 'zzexp31', parent: 'self', section_tipo: 'self' },
										{
											tipo: ZZEXP_DATAFRAME_SLOT,
											view: 'default',
											parent: 'self',
											section_tipo: ZZEXP_MAIN_SECTION,
										},
									],
									fields_separator: ' | ',
								},
							},
						],
					},
				},
			},
			{
				tipo: ZZEXP_DATAFRAME_SLOT,
				parent: ZZEXP_MAIN_SECTION,
				term: { 'lg-eng': 'zzexp frames' },
				model: 'component_dataframe',
				order_number: 4,
				relations: [{ tipo: ZZEXP_REF_SECTION }],
				properties: {
					view: 'default',
					source: relationSource(ZZEXP_REF_SECTION, ['zzexp21']),
				},
			},

			// ---- TARGET (what the hop reads) ------------------------------------
			{
				tipo: ZZEXP_TARGET_SECTION,
				parent: 'dd14',
				term: { 'lg-eng': 'zzexp target' },
				model: 'section',
				relations: [{ tipo: 'test24' }],
			},
			{
				tipo: ZZEXP_LEAF_LITERAL,
				parent: ZZEXP_TARGET_SECTION,
				term: { 'lg-eng': 'zzexp target name' },
				model: 'component_input_text',
				order_number: 1,
				is_translatable: true,
			},
			{
				tipo: ZZEXP_LEAF_RELATION,
				parent: ZZEXP_TARGET_SECTION,
				term: { 'lg-eng': 'zzexp target culture' },
				model: 'component_autocomplete',
				order_number: 2,
				relations: [{ tipo: 'zzexp40' }],
				properties: {
					children_view: 'text',
					source: relationSource('zzexp40', ['zzexp41']),
				},
			},
			{
				tipo: ZZEXP_LEAF_PORTAL,
				parent: ZZEXP_TARGET_SECTION,
				term: { 'lg-eng': 'zzexp target refs' },
				model: 'component_portal',
				order_number: 3,
				relations: [{ tipo: ZZEXP_REF_SECTION }],
				properties: {
					view: 'default',
					source: relationSource(ZZEXP_REF_SECTION, ['zzexp21']),
				},
			},

			// ---- the three leaf-target sections ---------------------------------
			{
				tipo: ZZEXP_REF_SECTION,
				parent: 'dd14',
				term: { 'lg-eng': 'zzexp refs' },
				model: 'section',
				relations: [{ tipo: 'test24' }],
			},
			{
				tipo: 'zzexp21',
				parent: ZZEXP_REF_SECTION,
				term: { 'lg-eng': 'zzexp ref text' },
				model: 'component_input_text',
				order_number: 1,
				is_translatable: true,
			},
			{
				tipo: 'zzexp30',
				parent: 'dd14',
				term: { 'lg-eng': 'zzexp labels' },
				model: 'section',
				relations: [{ tipo: 'test24' }],
			},
			{
				tipo: 'zzexp31',
				parent: 'zzexp30',
				term: { 'lg-eng': 'zzexp label' },
				model: 'component_input_text',
				order_number: 1,
				is_translatable: true,
			},
			{
				tipo: 'zzexp40',
				parent: 'dd14',
				term: { 'lg-eng': 'zzexp terms' },
				model: 'section',
				relations: [{ tipo: 'test24' }],
			},
			{
				tipo: 'zzexp41',
				parent: 'zzexp40',
				term: { 'lg-eng': 'zzexp term' },
				model: 'component_input_text',
				order_number: 1,
				is_translatable: true,
			},
		],
		records: [
			// Leaf targets first, so every locator below lands on a real record.
			...REF_IDS.map((id, index) => ({
				section_tipo: ZZEXP_REF_SECTION,
				section_id: id,
				columns: {
					string: { zzexp21: [{ id: 1, lang: 'lg-eng', value: `zzexp ref ${index + 1}` }] },
				},
			})),
			{
				section_tipo: 'zzexp30',
				section_id: LABEL_ID,
				columns: { string: { zzexp31: [{ id: 1, lang: 'lg-eng', value: 'zzexp label one' }] } },
			},
			{
				section_tipo: 'zzexp40',
				section_id: TERM_ID,
				columns: { string: { zzexp41: [{ id: 1, lang: 'lg-eng', value: 'zzexp term one' }] } },
			},
			// The hop's landing record — all three leaf kinds populated, which is
			// exactly what the corpus twin could not offer.
			{
				section_tipo: ZZEXP_TARGET_SECTION,
				section_id: TARGET_ID,
				columns: {
					string: {
						[ZZEXP_LEAF_LITERAL]: [{ id: 1, lang: 'lg-eng', value: 'zzexp target one' }],
					},
					relation: {
						[ZZEXP_LEAF_RELATION]: [link('zzexp40', TERM_ID, ZZEXP_LEAF_RELATION)],
						[ZZEXP_LEAF_PORTAL]: REF_IDS.map((id, index) =>
							link(ZZEXP_REF_SECTION, id, ZZEXP_LEAF_PORTAL, index + 1),
						),
					},
				},
			},
			// The two exported mains. Both hop to the SAME target record: the gate
			// asserts protocol invariants over rows, not distinct values.
			...ZZEXP_RECORD_IDS.map((id, index) => ({
				section_tipo: ZZEXP_MAIN_SECTION,
				section_id: id,
				columns: {
					string: {
						[ZZEXP_LITERAL]: [{ id: 1, lang: 'lg-eng', value: `zzexp main ${index + 1}` }],
					},
					relation: {
						[ZZEXP_HOP]: [link(ZZEXP_TARGET_SECTION, TARGET_ID, ZZEXP_HOP)],
						[ZZEXP_DATAFRAME_MAIN]: [link('zzexp30', LABEL_ID, ZZEXP_DATAFRAME_MAIN)],
						// The frame pairs to item id 1 of the main above, by `id_key`
						// under the dd490 marker — the whole dataframe contract.
						[ZZEXP_DATAFRAME_SLOT]: [
							{
								id: 1,
								id_key: 1,
								type: DATAFRAME,
								section_id: REF_IDS[0],
								section_tipo: ZZEXP_REF_SECTION,
								from_component_tipo: ZZEXP_DATAFRAME_SLOT,
							},
						],
					},
				},
			})),
		],
	});
}

/** The validated descriptor (pure — no DB until ensure/drop). */
export const ZZEXP_SITUATION: Situation = buildSituation();
