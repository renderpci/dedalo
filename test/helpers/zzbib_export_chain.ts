/**
 * A BUILT bibliography chain — the multi-author, 3-hop shape the deep-breakdown
 * export contract needs, with every record it walks actually present.
 *
 * WHY THIS EXISTS. The frozen deep-breakdown oracle
 * (test/parity/tool_export_breakdown_differential.test.ts + its fixture store)
 * pins the 2026-07-08 export_tabulator rebuild against monedaiberica's
 * bibliography records (numisdata3/1490's portal → rsc332 references →
 * rsc205 publications → rsc197 persons). A tool_export grid is DISPLAY
 * STRINGS and reveals no storable data, so scripts/derive_test_corpus.ts
 * REFUSES those records as `never_revealed` — the corpus cannot ever hold
 * them, and the parity pair is red BY CONSTRUCTION on the suite DB.
 *
 * The law's answer (DEC-14b) is to BUILD the situation and pin the contract in
 * TS-native twins. This chain reproduces the frozen corpus's STRUCTURE (never
 * its content) exactly:
 *
 *   zzbib1   MAIN section (the "coin type")             — record 960001
 *     zzbib2   component_input_text  "zzbib ref"          literal column
 *     zzbib3   component_portal      "zzbib bibliography" → zzbib10 (3 refs)
 *   zzbib10  REFERENCE section (the bibliography rows)  — 960101..960103
 *     zzbib11  component_input_text  "zzbib pages"
 *     zzbib12  component_autocomplete "zzbib publication" → zzbib20
 *   zzbib20  PUBLICATION section                        — 960201..960203
 *     zzbib21  component_input_text  "zzbib title"
 *     zzbib22  component_date        "zzbib date"          year-only starts
 *     zzbib23  component_autocomplete "zzbib authorship"  → zzbib30, whose
 *              request_config ddo_map FANS OUT into surname AND name — the
 *              relation-leaf fan-out rule (frozen rsc139 → rsc86 + rsc85)
 *   zzbib30  PERSON section                             — 960301..960304
 *     zzbib31  component_input_text  "zzbib surname"
 *     zzbib32  component_input_text  "zzbib name"
 *
 * Reference fan mirroring the frozen record: ref 1 → pub 1 (TWO authors),
 * ref 2 → pub 2 (one author), ref 3 → pub 3 (one author) — so every placement
 * rule (per-segment '|n' suffix keys, max-aligned author rows, fill-down,
 * label ' N+1' suffixes) is load-bearing.
 */

import { mediaTypeOf } from '../../src/core/concepts/media.ts';
import { type Situation, situation } from '../../src/core/test_data/situations/situation.ts';

export const ZZBIB_MAIN_SECTION = 'zzbib1';
export const ZZBIB_LITERAL = 'zzbib2';
export const ZZBIB_PORTAL = 'zzbib3';

export const ZZBIB_REF_SECTION = 'zzbib10';
export const ZZBIB_PAGES = 'zzbib11';
export const ZZBIB_PUB = 'zzbib12';

export const ZZBIB_PUB_SECTION = 'zzbib20';
export const ZZBIB_TITLE = 'zzbib21';
export const ZZBIB_DATE = 'zzbib22';
export const ZZBIB_AUTHORSHIP = 'zzbib23';

export const ZZBIB_PERSON_SECTION = 'zzbib30';
export const ZZBIB_SURNAME = 'zzbib31';
export const ZZBIB_NAME = 'zzbib32';

export const ZZBIB_MAIN_ID = 960001;

/** MEDIA leg — the img-cell rule (frozen rsc170/rsc29: the export value of a
 * component_image is the ABSOLUTE default-quality URL, cell_type 'img'). */
export const ZZBIB_MEDIA_SECTION = 'zzbib50';
export const ZZBIB_IMAGE = 'zzbib51';
export const ZZBIB_MEDIA_NAME = 'zzbib52';
export const ZZBIB_MEDIA_ID = 960501;
/** The default image quality from the media CONTRACT (never hardcoded). */
export const ZZBIB_IMAGE_QUALITY: string =
	mediaTypeOf('component_image')?.defaultQuality ?? '1.5MB';
/** The stored files_info file_path the URL cell must append to the export base. */
export const ZZBIB_IMAGE_FILE_PATH = `/image/${ZZBIB_IMAGE_QUALITY}/960000/zzbib51_zzbib50_960501.jpg`;
const REF_IDS = [960101, 960102, 960103] as const;
const PUB_IDS = [960201, 960202, 960203] as const;
const PERSON_IDS = [960301, 960302, 960303, 960304] as const;

/** The flat content the twins pin (kept here so test + data cannot drift). */
export const ZZBIB_TITLES = ['zzbib title one', 'zzbib title two', 'zzbib title three'] as const;
export const ZZBIB_YEARS = [2004, 2012, 2015] as const;
export const ZZBIB_SURNAMES = [
	'zzbib surname A',
	'zzbib surname B',
	'zzbib surname C',
	'zzbib surname D',
] as const;
export const ZZBIB_NAMES = [
	'zzbib name A',
	'zzbib name B',
	'zzbib name C',
	'zzbib name D',
] as const;

/** pub index → author indexes (pub 1 carries TWO authors — the fan). */
export const ZZBIB_PUB_AUTHORS: readonly (readonly number[])[] = [[0, 1], [2], [3]] as const;

/** The `source` block a related component needs for the walk to descend. */
function relationSource(
	targetSection: string,
	showTipos: string[],
	fieldsSeparator = ' | ',
): Record<string, unknown> {
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
					fields_separator: fieldsSeparator,
				},
			},
		],
	};
}

/** dd151 = the ordinary link relation type every locator above uses. */
const LINK = 'dd151';
const link = (sectionTipo: string, sectionId: number, fromComponent: string, id = 1) => ({
	id,
	type: LINK,
	section_id: sectionId,
	section_tipo: sectionTipo,
	from_component_tipo: fromComponent,
});

const text = (tipo: string, value: string) => ({
	[tipo]: [{ id: 1, lang: 'lg-eng', value }],
});

function buildSituation(): Situation {
	return situation({
		name: 'zzbib bibliography export chain',
		tld: 'zzbib',
		nodes: [
			// ---- MAIN -----------------------------------------------------------
			{
				tipo: ZZBIB_MAIN_SECTION,
				parent: 'dd14',
				term: { 'lg-eng': 'zzbib main' },
				model: 'section',
				relations: [{ tipo: 'test24' }],
			},
			{
				tipo: ZZBIB_LITERAL,
				parent: ZZBIB_MAIN_SECTION,
				term: { 'lg-eng': 'zzbib ref' },
				model: 'component_input_text',
				order_number: 1,
				is_translatable: true,
			},
			{
				tipo: ZZBIB_PORTAL,
				parent: ZZBIB_MAIN_SECTION,
				term: { 'lg-eng': 'zzbib bibliography' },
				model: 'component_portal',
				order_number: 2,
				relations: [{ tipo: ZZBIB_REF_SECTION }],
				properties: {
					view: 'default',
					source: relationSource(ZZBIB_REF_SECTION, [ZZBIB_PAGES, ZZBIB_PUB]),
				},
			},
			// ---- REFERENCE ------------------------------------------------------
			{
				tipo: ZZBIB_REF_SECTION,
				parent: 'dd14',
				term: { 'lg-eng': 'zzbib references' },
				model: 'section',
				relations: [{ tipo: 'test24' }],
			},
			{
				tipo: ZZBIB_PAGES,
				parent: ZZBIB_REF_SECTION,
				term: { 'lg-eng': 'zzbib pages' },
				model: 'component_input_text',
				order_number: 1,
				is_translatable: true,
			},
			{
				tipo: ZZBIB_PUB,
				parent: ZZBIB_REF_SECTION,
				term: { 'lg-eng': 'zzbib publication' },
				model: 'component_autocomplete',
				order_number: 2,
				relations: [{ tipo: ZZBIB_PUB_SECTION }],
				properties: {
					children_view: 'text',
					source: relationSource(ZZBIB_PUB_SECTION, [ZZBIB_TITLE, ZZBIB_AUTHORSHIP]),
				},
			},
			// ---- PUBLICATION ----------------------------------------------------
			{
				tipo: ZZBIB_PUB_SECTION,
				parent: 'dd14',
				term: { 'lg-eng': 'zzbib publications' },
				model: 'section',
				relations: [{ tipo: 'test24' }],
			},
			{
				tipo: ZZBIB_TITLE,
				parent: ZZBIB_PUB_SECTION,
				term: { 'lg-eng': 'zzbib title' },
				model: 'component_input_text',
				order_number: 1,
				is_translatable: true,
			},
			{
				tipo: ZZBIB_DATE,
				parent: ZZBIB_PUB_SECTION,
				term: { 'lg-eng': 'zzbib date' },
				model: 'component_date',
				order_number: 2,
			},
			{
				// THE FAN-OUT LEAF: its own request_config names TWO children on the
				// person target — the frozen rsc139 → rsc86 (Surname) + rsc85 (Name)
				// rule that grows one column per child.
				tipo: ZZBIB_AUTHORSHIP,
				parent: ZZBIB_PUB_SECTION,
				term: { 'lg-eng': 'zzbib authorship' },
				model: 'component_autocomplete',
				order_number: 3,
				relations: [{ tipo: ZZBIB_PERSON_SECTION }],
				properties: {
					children_view: 'text',
					source: relationSource(ZZBIB_PERSON_SECTION, [ZZBIB_SURNAME, ZZBIB_NAME], ', '),
				},
			},
			// ---- PERSON ---------------------------------------------------------
			{
				tipo: ZZBIB_PERSON_SECTION,
				parent: 'dd14',
				term: { 'lg-eng': 'zzbib persons' },
				model: 'section',
				relations: [{ tipo: 'test24' }],
			},
			{
				tipo: ZZBIB_SURNAME,
				parent: ZZBIB_PERSON_SECTION,
				term: { 'lg-eng': 'zzbib surname' },
				model: 'component_input_text',
				order_number: 1,
				is_translatable: true,
			},
			{
				tipo: ZZBIB_NAME,
				parent: ZZBIB_PERSON_SECTION,
				term: { 'lg-eng': 'zzbib name' },
				model: 'component_input_text',
				order_number: 2,
				is_translatable: true,
			},
			// ---- MEDIA (the img-cell leg) ---------------------------------------
			{
				tipo: ZZBIB_MEDIA_SECTION,
				parent: 'dd14',
				term: { 'lg-eng': 'zzbib media' },
				model: 'section',
				relations: [{ tipo: 'test24' }],
			},
			{
				tipo: ZZBIB_IMAGE,
				parent: ZZBIB_MEDIA_SECTION,
				term: { 'lg-eng': 'zzbib image' },
				model: 'component_image',
				order_number: 1,
			},
			{
				tipo: ZZBIB_MEDIA_NAME,
				parent: ZZBIB_MEDIA_SECTION,
				term: { 'lg-eng': 'zzbib media name' },
				model: 'component_input_text',
				order_number: 2,
				is_translatable: true,
			},
		],
		records: [
			// The media record: files_info carries the default quality entry the
			// img cell resolves (the URL is exportBase + file_path, nothing else).
			{
				section_tipo: ZZBIB_MEDIA_SECTION,
				section_id: ZZBIB_MEDIA_ID,
				columns: {
					string: text(ZZBIB_MEDIA_NAME, 'zzbib media one'),
					media: {
						[ZZBIB_IMAGE]: [
							{
								id: 1,
								files_info: [
									{
										quality: ZZBIB_IMAGE_QUALITY,
										extension: 'jpg',
										file_name: 'zzbib51_zzbib50_960501.jpg',
										file_path: ZZBIB_IMAGE_FILE_PATH,
									},
								],
							},
						],
					},
				},
			},
			// Persons first, so every locator lands on a real record.
			...PERSON_IDS.map((id, index) => ({
				section_tipo: ZZBIB_PERSON_SECTION,
				section_id: id,
				columns: {
					string: {
						...text(ZZBIB_SURNAME, ZZBIB_SURNAMES[index] as string),
						...text(ZZBIB_NAME, ZZBIB_NAMES[index] as string),
					},
				},
			})),
			// Publications: title + year-only date + authorship fan.
			...PUB_IDS.map((id, index) => ({
				section_tipo: ZZBIB_PUB_SECTION,
				section_id: id,
				columns: {
					string: text(ZZBIB_TITLE, ZZBIB_TITLES[index] as string),
					date: {
						[ZZBIB_DATE]: [{ id: 1, mode: 'start', start: { year: ZZBIB_YEARS[index] as number } }],
					},
					relation: {
						[ZZBIB_AUTHORSHIP]: (ZZBIB_PUB_AUTHORS[index] as number[]).map(
							(authorIndex, position) =>
								link(
									ZZBIB_PERSON_SECTION,
									PERSON_IDS[authorIndex] as number,
									ZZBIB_AUTHORSHIP,
									position + 1,
								),
						),
					},
				},
			})),
			// References: pages + ONE publication each.
			...REF_IDS.map((id, index) => ({
				section_tipo: ZZBIB_REF_SECTION,
				section_id: id,
				columns: {
					string: text(ZZBIB_PAGES, `zzbib pages ${index + 1}`),
					relation: { [ZZBIB_PUB]: [link(ZZBIB_PUB_SECTION, PUB_IDS[index] as number, ZZBIB_PUB)] },
				},
			})),
			// The exported main: literal + the 3-reference bibliography portal.
			{
				section_tipo: ZZBIB_MAIN_SECTION,
				section_id: ZZBIB_MAIN_ID,
				columns: {
					string: text(ZZBIB_LITERAL, 'zzbib main one'),
					relation: {
						[ZZBIB_PORTAL]: REF_IDS.map((id, index) =>
							link(ZZBIB_REF_SECTION, id, ZZBIB_PORTAL, index + 1),
						),
					},
				},
			},
		],
	});
}

/** The validated descriptor (pure — no DB until ensure/drop). */
export const ZZBIB_SITUATION: Situation = buildSituation();
