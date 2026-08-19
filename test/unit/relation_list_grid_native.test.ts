/**
 * get_relation_list — THE REFERENCIAS GRID CONTRACT (TS-native twin).
 *
 * REPLACES `test/parity/relation_list_differential.test.ts` (deleted with its
 * frozen fixture, 2026-08-19). That gate byte-diffed the panel against live
 * PHP on ONE install's corpus (`numisdata6` §1 and the `numisdata308`
 * relation_list node): it could only be green where those records exist, and
 * its PHP half is a fossil. The CONTRACT it proved is the asset, and it is
 * re-expressed here against a situation this file BUILDS (AGENTS.md, generic
 * `test`/`zz*` TLD law) — the same engine entry point (`dispatchRqo` →
 * `section/read_facade.ts` get_relation_list → `resolve/relation_list.ts`),
 * asserted on values the gate itself wrote:
 *
 *  1. CONTEXT — per referencing section, on FIRST sight: an `id` entry
 *     {section_tipo, section_label, component_tipo:'id', component_label:'id'}
 *     then one entry per grid column, `component_label` = the column's term in
 *     the REQUEST lang, `section_label` = the section's term in that lang. The
 *     columns are the section_map `relation_list` scope term when authored,
 *     else the section's legacy `relation_list` node relations;
 *  2. DATA — per hit an id cell with NO `value` key, then one cell per column
 *     whose `value` is the component's FLAT display string: the string family
 *     lang-sliced and joined ' | ' (non-translatable components slice
 *     lg-nolan), relation models resolved through the datalist to their
 *     targets — every stored locator, joined ' | ' — with a paired dataframe
 *     frame folded into its OWN main locator's field group; the cell is
 *     emitted WITHOUT `value` when the component holds nothing;
 *  3. PAGING — sqo.limit/offset page the HITS, not the cells (page 2 = the
 *     remaining records, whose own first sight re-emits context); limit 0 =
 *     ALL; sqo.section_tipo narrows the owning sections ('all' = no
 *     narrowing);
 *  4. SHELL — source.mode !== 'edit' returns {context:[],data:[]};
 *  5. HOST READ GATE — the facade's OWN gate: a principal that may read the
 *     sqo's section but NOT the host section is refused (403 perm.denied).
 *
 * KEY ORDER IS PART OF THE CONTRACT, so context/data are compared with
 * `JSON.stringify` (never order-blind `toEqual`), exactly as the retired
 * differential compared them: the frozen PHP body emitted
 * `{section_tipo, section_label, component_tipo, component_label}` and
 * `{section_tipo, section_id, component_tipo[, value]}` in that order, and the
 * client's flat-table renderer reads the grid positionally. The expected
 * literals below are written in that order; a reordering of the engine's
 * object literals reddens this file.
 *
 * SITUATIONS IT BUILDS (`zzrl`, matrix_test, ids ≥ 900000, dropped with a
 * residue-0 assertion):
 *   zzrl1  section (HOST)              — §900801, relation_list node zzrl16
 *   zzrl3  section (referencing A)     — §900811..900817, each pointing at the
 *          host through the portal zzrl7; columns from the LEGACY
 *          relation_list node zzrl8 → [zzrl4 translatable input_text,
 *          zzrl5 select → two option records]
 *   zzrl6  section (option list)       — the select/portal targets and the
 *          dataframe frame targets (§900901..900907)
 *   zzrl9  section (referencing B)     — §900821, portal zzrl10 → host; columns
 *          from zzrl11 → [zzrl12 NON-translatable input_text, zzrl17 portal
 *          with THREE main locators and a paired dataframe zzrl18 whose slot
 *          also holds three DECOY frames]
 *   zzrl80 section on matrix_list      — no records: a PUBLICLY readable list
 *          section (PUBLIC_LIST_TABLES), the sqo target that lets an ungranted
 *          principal reach the facade's host gate
 *   zzrl90 section (referencing C)     — §900831, columns from its SECTION_MAP
 *          `relation_list` scope (which WINS over its legacy node zzrl95)
 * Three referencing sections pin the per-section context grouping; nine
 * referencing records pin the paging (hits are ordered by section_id, so page
 * 1 stops inside A and page 2 spills into B and C).
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { dispatchRqo } from '../../src/core/api/dispatch.ts';
import { getPermissions, resolvePrincipal } from '../../src/core/security/permissions.ts';
import { createSession, getSession } from '../../src/core/security/session_store.ts';
import {
	dropSituation,
	ensureSituation,
	situation,
} from '../../src/core/test_data/situations/situation.ts';
import { DB_READY } from '../helpers/db_ready.ts';
import { registerSessionCleanup } from '../helpers/session_cleanup.ts';

registerSessionCleanup();

/** The host record every referencing record points at. */
const HOST_ID = 900801;
/** Referencing section A — seven records, so page 1 (limit 5) stops inside it. */
const REF_A_IDS = [900811, 900812, 900813, 900814, 900815, 900816, 900817];
/** The one record of A that holds NO value for the string column (absent cell). */
const REF_A_EMPTY_ID = 900817;
/** Referencing section B — one record, reached only on page 2. */
const REF_B_ID = 900821;
/** Referencing section C — the section_map-columned one, last by section_id. */
const REF_C_ID = 900831;
/** The option records the relation columns resolve their labels from. */
const OPTION_A_ID = 900901;
const OPTION_B_ID = 900903;
const OPTION_C_ID = 900905;
/** The record the PAIRED dataframe frame points at (its field folds into the cell). */
const FRAME_TARGET_ID = 900902;
/** Frame targets that must NEVER fold in — one per way a frame can fail to pair. */
const FRAME_DECOY_ID_KEY_ID = 900904; // id_key 99: pairs with no main locator
const FRAME_DECOY_ZERO_ID = 900906; // id_key 0 vs a main whose `id` is null
const FRAME_DECOY_WRONG_MAIN_ID = 900907; // right id_key, wrong main_component_tipo
/**
 * The identity used for the host-read refusal: a user id in the scratch band
 * that owns no dd128 record at all, so it is a non-admin with no profile
 * grants (asserted in the test, never assumed).
 */
const UNGRANTED_USER_ID = 999001;

/** A locator pointing at the host record (what makes a record a REFERENCE). */
const hostLocator = { section_tipo: 'zzrl1', section_id: HOST_ID, type: 'dd571' };

/**
 * One referencing record of section A: two lg-spa values + one lg-eng value,
 * and a select holding TWO locators (the multi-target ' | ' join).
 * The string family lives in the `string` column and the relation family in
 * `relation` — the descriptors' own column declarations, never a guess.
 */
function refARecord(sectionId: number) {
	const index = sectionId - REF_A_IDS[0]!;
	const stringColumn =
		sectionId === REF_A_EMPTY_ID
			? {}
			: {
					zzrl4: [
						{ lang: 'lg-spa', value: `Alpha ${index}` },
						{ lang: 'lg-spa', value: `Beta ${index}` },
						{ lang: 'lg-eng', value: `English ${index}` },
					],
				};
	return {
		section_tipo: 'zzrl3',
		section_id: sectionId,
		columns: {
			string: stringColumn,
			relation: {
				zzrl7: [hostLocator],
				zzrl5: [
					{ section_tipo: 'zzrl6', section_id: OPTION_A_ID },
					{ section_tipo: 'zzrl6', section_id: OPTION_B_ID },
				],
			},
		},
	};
}

/** One option/frame-target record of the list section zzrl6. */
function optionRecord(sectionId: number, label: string, note: string | null) {
	const string: Record<string, unknown[]> = {
		zzrl13: [{ lang: 'lg-nolan', value: label }],
	};
	if (note !== null) string.zzrl19 = [{ lang: 'lg-nolan', value: note }];
	return { section_tipo: 'zzrl6', section_id: sectionId, columns: { string } };
}

/** A dataframe pairing locator (PHP dd490 frame) on section B's record. */
function frame(sectionId: number, mainComponentTipo: string, idKey: number) {
	return {
		type: 'dd490',
		section_tipo: 'zzrl6',
		section_id: sectionId,
		from_component_tipo: 'zzrl18',
		main_component_tipo: mainComponentTipo,
		id_key: idKey,
	};
}

const S = situation({
	name: 'zzrl relation_list grid',
	tld: 'zzrl',
	nodes: [
		// HOST section (data on matrix_test through the test24 matrix_table node).
		{
			tipo: 'zzrl1',
			parent: 'test1',
			model: 'section',
			term: { 'lg-spa': 'Anfitrión', 'lg-eng': 'Host' },
			relations: [{ tipo: 'test24' }],
		},
		{ tipo: 'zzrl2', parent: 'zzrl1', model: 'component_input_text', is_translatable: true },
		// The host's own relation_list node — the panel's `source.tipo`.
		{ tipo: 'zzrl16', parent: 'zzrl1', model: 'relation_list', term: { 'lg-spa': 'Referencias' } },

		// REFERENCING SECTION A + its grid columns (LEGACY relation_list node).
		{
			tipo: 'zzrl3',
			parent: 'test1',
			model: 'section',
			term: { 'lg-spa': 'Sección A', 'lg-eng': 'Section A' },
			relations: [{ tipo: 'test24' }],
		},
		{
			tipo: 'zzrl4',
			parent: 'zzrl3',
			model: 'component_input_text',
			is_translatable: true,
			term: { 'lg-spa': 'Título', 'lg-eng': 'Title' },
		},
		{
			tipo: 'zzrl5',
			parent: 'zzrl3',
			model: 'component_select',
			order_number: 2,
			term: { 'lg-spa': 'Opción', 'lg-eng': 'Option' },
			// Legacy (implicit) select shape: the section node is the target, the
			// component node is the label ddo.
			relations: [{ tipo: 'zzrl6' }, { tipo: 'zzrl13' }],
		},
		{
			tipo: 'zzrl7',
			parent: 'zzrl3',
			model: 'component_portal',
			order_number: 3,
			term: { 'lg-spa': 'Portal al anfitrión' },
			relations: [{ tipo: 'zzrl1' }],
		},
		{
			tipo: 'zzrl8',
			parent: 'zzrl3',
			model: 'relation_list',
			order_number: 4,
			term: { 'lg-spa': 'relation_list' },
			relations: [{ tipo: 'zzrl4' }, { tipo: 'zzrl5' }],
		},

		// The select's option list — also the frames' target section.
		{
			tipo: 'zzrl6',
			parent: 'test1',
			model: 'section',
			term: { 'lg-spa': 'Lista de opciones' },
			relations: [{ tipo: 'test24' }],
		},
		{ tipo: 'zzrl13', parent: 'zzrl6', model: 'component_input_text', term: { 'lg-spa': 'Label' } },
		{
			tipo: 'zzrl19',
			parent: 'zzrl6',
			model: 'component_input_text',
			order_number: 2,
			term: { 'lg-spa': 'Nota de ficha' },
		},

		// REFERENCING SECTION B — a second section, so context groups per section.
		{
			tipo: 'zzrl9',
			parent: 'test1',
			model: 'section',
			term: { 'lg-spa': 'Sección B', 'lg-eng': 'Section B' },
			relations: [{ tipo: 'test24' }],
		},
		{
			tipo: 'zzrl12',
			parent: 'zzrl9',
			model: 'component_input_text',
			term: { 'lg-spa': 'Nota', 'lg-eng': 'Note' },
		},
		{
			tipo: 'zzrl10',
			parent: 'zzrl9',
			model: 'component_portal',
			order_number: 2,
			term: { 'lg-spa': 'Portal al anfitrión B' },
			relations: [{ tipo: 'zzrl1' }],
		},
		{
			tipo: 'zzrl11',
			parent: 'zzrl9',
			model: 'relation_list',
			order_number: 3,
			term: { 'lg-spa': 'relation_list' },
			relations: [{ tipo: 'zzrl12' }, { tipo: 'zzrl17' }],
		},
		// A relation column WITH A PAIRED DATAFRAME: each main locator's cell part
		// folds the target's label and ITS OWN frame's field.
		{
			tipo: 'zzrl17',
			parent: 'zzrl9',
			model: 'component_portal',
			order_number: 4,
			term: { 'lg-spa': 'Ficha', 'lg-eng': 'Frame' },
			relations: [{ tipo: 'zzrl6' }, { tipo: 'zzrl13' }, { tipo: 'zzrl18' }],
		},
		{
			tipo: 'zzrl18',
			parent: 'zzrl17',
			model: 'component_dataframe',
			term: { 'lg-spa': 'dataframe' },
			relations: [{ tipo: 'zzrl19' }],
		},

		// A PUBLICLY readable list section (its matrix table is matrix_list, which
		// PUBLIC_LIST_TABLES grants level 1 to everyone). It holds NO records: it
		// exists so an ungranted principal can PASS the handler's sqo gate and be
		// refused by the facade's own HOST gate, the line this file guards.
		{
			tipo: 'zzrl80',
			parent: 'test1',
			model: 'section',
			term: { 'lg-spa': 'Lista pública' },
			relations: [{ tipo: 'zzrl81' }],
		},
		{ tipo: 'zzrl81', model: 'matrix_table', term: { 'lg-spa': 'matrix_list' } },

		// REFERENCING SECTION C — its columns come from the SECTION_MAP
		// 'relation_list' scope, which must WIN over its legacy relation_list node.
		{
			tipo: 'zzrl90',
			parent: 'test1',
			model: 'section',
			term: { 'lg-spa': 'Sección C', 'lg-eng': 'Section C' },
			relations: [{ tipo: 'test24' }],
		},
		{
			tipo: 'zzrl91',
			parent: 'zzrl90',
			model: 'component_input_text',
			term: { 'lg-spa': 'Columna mapa', 'lg-eng': 'Map column' },
		},
		{
			tipo: 'zzrl92',
			parent: 'zzrl90',
			model: 'component_input_text',
			order_number: 2,
			term: { 'lg-spa': 'Columna heredada' },
		},
		{
			tipo: 'zzrl93',
			parent: 'zzrl90',
			model: 'component_portal',
			order_number: 3,
			term: { 'lg-spa': 'Portal al anfitrión C' },
			relations: [{ tipo: 'zzrl1' }],
		},
		{
			tipo: 'zzrl94',
			parent: 'zzrl90',
			model: 'section_map',
			order_number: 4,
			term: { 'lg-spa': 'section_map' },
			properties: { relation_list: { term: ['zzrl91'] } },
		},
		{
			tipo: 'zzrl95',
			parent: 'zzrl90',
			model: 'relation_list',
			order_number: 5,
			term: { 'lg-spa': 'relation_list' },
			// The LEGACY column set — shadowed by the section_map above.
			relations: [{ tipo: 'zzrl92' }],
		},
	],
	records: [
		{ section_tipo: 'zzrl1', section_id: HOST_ID, columns: { data: {} } },
		// NON-translatable string components: stored (and read) as lg-nolan.
		optionRecord(OPTION_A_ID, 'Option A', null),
		optionRecord(OPTION_B_ID, 'Option B', null),
		optionRecord(OPTION_C_ID, 'Option C', null),
		optionRecord(FRAME_TARGET_ID, 'Frame target', 'Ficha 1'),
		optionRecord(FRAME_DECOY_ID_KEY_ID, 'Decoy target', 'Ficha DECOY'),
		optionRecord(FRAME_DECOY_ZERO_ID, 'Zero target', 'Ficha ZERO'),
		optionRecord(FRAME_DECOY_WRONG_MAIN_ID, 'Wrong-main target', 'Ficha WRONGMAIN'),
		...REF_A_IDS.map(refARecord),
		{
			section_tipo: 'zzrl9',
			section_id: REF_B_ID,
			columns: {
				string: { zzrl12: [{ lang: 'lg-nolan', value: 'Nota B' }] },
				relation: {
					zzrl10: [hostLocator],
					// THREE main locators: the first carries the stable `id` its frame
					// pairs on, the second an id no frame names, the third a NULL id
					// (PHP's null id_key — it pairs with nothing, ever).
					zzrl17: [
						{ section_tipo: 'zzrl6', section_id: OPTION_A_ID, id: 1 },
						{ section_tipo: 'zzrl6', section_id: OPTION_B_ID, id: 2 },
						{ section_tipo: 'zzrl6', section_id: OPTION_C_ID, id: null },
					],
					// The frame slot: ONE real frame + three decoys, so the pairing law
					// (dd490 + main_component_tipo + id_key, NEVER array position) is
					// observable — an unpaired read would fold the decoys into every cell.
					zzrl18: [
						frame(FRAME_TARGET_ID, 'zzrl17', 1),
						frame(FRAME_DECOY_ID_KEY_ID, 'zzrl17', 99),
						frame(FRAME_DECOY_ZERO_ID, 'zzrl17', 0),
						frame(FRAME_DECOY_WRONG_MAIN_ID, 'zzrl10', 1),
					],
				},
			},
		},
		{
			section_tipo: 'zzrl90',
			section_id: REF_C_ID,
			columns: {
				string: {
					zzrl91: [{ lang: 'lg-nolan', value: 'Valor mapa' }],
					zzrl92: [{ lang: 'lg-nolan', value: 'Valor heredado' }],
				},
				relation: { zzrl93: [hostLocator] },
			},
		},
	],
});

interface GridEntry {
	section_tipo: string;
	section_id?: number;
	section_label?: string;
	component_tipo: string;
	component_label?: string;
	value?: string;
}

interface Grid {
	context: GridEntry[];
	data: GridEntry[];
}

/** The panel's RQO — the same shape the client (and the retired gate) sends. */
function relationListRqo(
	sqoOverrides: Record<string, unknown> = {},
	sourceOverrides: Record<string, unknown> = {},
): Record<string, unknown> {
	return {
		action: 'read',
		dd_api: 'dd_core_api',
		prevent_lock: true,
		options: {},
		source: {
			typo: 'source',
			model: 'relation_list',
			tipo: 'zzrl16',
			section_tipo: 'zzrl1',
			section_id: HOST_ID,
			action: 'get_relation_list',
			mode: 'edit',
			lang: 'lg-spa',
			...sourceOverrides,
		},
		sqo: {
			section_tipo: ['all'],
			mode: 'related',
			filter_by_locators: [{ section_tipo: 'zzrl1', section_id: HOST_ID }],
			limit: 5,
			offset: 0,
			...sqoOverrides,
		},
	};
}

/**
 * The same RQO with `source.tipo` genuinely ABSENT (not undefined) — the shape
 * that reaches the facade's own host gate, because the handler's gate A only
 * fires when the source carries BOTH section_tipo and tipo.
 */
function withoutSourceTipo(rqo: Record<string, unknown>): Record<string, unknown> {
	const { tipo: _tipo, ...source } = rqo.source as Record<string, unknown>;
	return { ...rqo, source };
}

async function callRelationList(
	rqo: Record<string, unknown>,
	userId = -1,
): Promise<{ status: number; body: Record<string, unknown> }> {
	const token = createSession(userId, 'relation_list_grid_test', true);
	const session = getSession(token);
	const principal = await resolvePrincipal(userId);
	const result = await dispatchRqo(
		structuredClone(rqo) as never,
		{
			requestId: 'relation_list_grid_native',
			clientIp: '127.0.0.1',
			session,
			csrfCandidate: session?.csrfToken ?? null,
			principal,
		} as never,
	);
	return { status: result.status, body: result.body as Record<string, unknown> };
}

/** The grid of a successful call (throws loudly on a refusal — never a silent {}). */
async function grid(rqo: Record<string, unknown>): Promise<Grid> {
	const { status, body } = await callRelationList(rqo);
	if (status !== 200) throw new Error(`get_relation_list refused: ${JSON.stringify(body)}`);
	return (body as { data: Grid }).data;
}

/**
 * Context entry builder — the exact 4-key shape PHP emitted, KEY ORDER
 * INCLUDED (every comparison below is a JSON.stringify, as the retired
 * differential's was).
 */
function contextEntry(
	sectionTipo: string,
	sectionLabel: string,
	componentTipo: string,
	componentLabel: string,
): GridEntry {
	return {
		section_tipo: sectionTipo,
		section_label: sectionLabel,
		component_tipo: componentTipo,
		component_label: componentLabel,
	};
}

/** The three context entries of section A, in the request lang. */
function contextA(lang: 'lg-spa' | 'lg-eng'): GridEntry[] {
	const spa = lang === 'lg-spa';
	return [
		contextEntry('zzrl3', spa ? 'Sección A' : 'Section A', 'id', 'id'),
		contextEntry('zzrl3', spa ? 'Sección A' : 'Section A', 'zzrl4', spa ? 'Título' : 'Title'),
		contextEntry('zzrl3', spa ? 'Sección A' : 'Section A', 'zzrl5', spa ? 'Opción' : 'Option'),
	];
}

/** The select cell's value: BOTH stored locators, joined by the records separator. */
const SELECT_VALUE = 'Option A | Option B';

/** One record's row of section A in the given lang: id cell + the two column cells. */
function rowA(sectionId: number, lang: 'lg-spa' | 'lg-eng' = 'lg-spa'): GridEntry[] {
	const index = sectionId - REF_A_IDS[0]!;
	const text = lang === 'lg-eng' ? `English ${index}` : `Alpha ${index} | Beta ${index}`;
	const textCell: GridEntry =
		sectionId === REF_A_EMPTY_ID
			? { section_tipo: 'zzrl3', section_id: sectionId, component_tipo: 'zzrl4' }
			: {
					section_tipo: 'zzrl3',
					section_id: sectionId,
					component_tipo: 'zzrl4',
					value: text,
				};
	return [
		{ section_tipo: 'zzrl3', section_id: sectionId, component_tipo: 'id' },
		textCell,
		{
			section_tipo: 'zzrl3',
			section_id: sectionId,
			component_tipo: 'zzrl5',
			// The label component is NOT translatable: the same value in both langs.
			value: SELECT_VALUE,
		},
	];
}

/**
 * Section B's single row: id + the non-translatable note + the relation cell.
 * The relation value is one part per MAIN locator joined ' | ', and each part
 * folds the target's label with ITS OWN paired frame's field (fields_separator
 * ', ' — the component declares none). Only main #1 has a paired frame: #2's
 * id names no frame and #3's id is null, so the three decoy frames sitting in
 * the same slot contribute nothing to any part.
 */
const ROW_B: GridEntry[] = [
	{ section_tipo: 'zzrl9', section_id: REF_B_ID, component_tipo: 'id' },
	{ section_tipo: 'zzrl9', section_id: REF_B_ID, component_tipo: 'zzrl12', value: 'Nota B' },
	{
		section_tipo: 'zzrl9',
		section_id: REF_B_ID,
		component_tipo: 'zzrl17',
		value: 'Option A, Ficha 1 | Option B | Option C',
	},
];

/** Section B's context entries in lg-spa. */
const CONTEXT_B: GridEntry[] = [
	contextEntry('zzrl9', 'Sección B', 'id', 'id'),
	contextEntry('zzrl9', 'Sección B', 'zzrl12', 'Nota'),
	contextEntry('zzrl9', 'Sección B', 'zzrl17', 'Ficha'),
];

/** Section C: ONE column, the section_map's — never the legacy node's zzrl92. */
const ROW_C: GridEntry[] = [
	{ section_tipo: 'zzrl90', section_id: REF_C_ID, component_tipo: 'id' },
	{ section_tipo: 'zzrl90', section_id: REF_C_ID, component_tipo: 'zzrl91', value: 'Valor mapa' },
];

const CONTEXT_C: GridEntry[] = [
	contextEntry('zzrl90', 'Sección C', 'id', 'id'),
	contextEntry('zzrl90', 'Sección C', 'zzrl91', 'Columna mapa'),
];

/** Byte-equality (key order included), the retired differential's comparison. */
function expectSameJson(actual: unknown, expected: unknown): void {
	expect(JSON.stringify(actual)).toBe(JSON.stringify(expected));
}

beforeAll(async () => {
	if (!DB_READY) return;
	await ensureSituation(S);
});

afterAll(async () => {
	if (!DB_READY) return;
	// Hermeticity is ASSERTED, never trusted: zero nodes, zero records left.
	expect(await dropSituation(S)).toBe(0);
});

describe.if(DB_READY)('get_relation_list — the Referencias grid', () => {
	test('page 1: context columns + every value cell (limit 5, offset 0)', async () => {
		const page = await grid(relationListRqo());
		// Non-vacuity floor (the retired gate's `data.length > 0`), sharpened:
		// five hits × (id + 2 columns).
		expect(page.data.length).toBe(15);
		// Context: ONE group, emitted on the first sight of section A.
		expectSameJson(page.context, contextA('lg-spa'));
		// Data: the FIRST five records only — paging cuts HITS, not cells.
		expectSameJson(
			page.data,
			REF_A_IDS.slice(0, 5).flatMap((id) => rowA(id)),
		);
		// The id cell carries no `value` key at all (not an empty string).
		const idCells = page.data.filter((cell) => cell.component_tipo === 'id');
		expect(idCells.length).toBe(5);
		expect(idCells.every((cell) => !('value' in cell))).toBe(true);
	});

	test('page 2: offset applies to the RECORDS and each new section re-emits context', async () => {
		const page = await grid(relationListRqo({ offset: 5 }));
		// The remaining two records of A, then B's, then C's (hits order by id).
		expectSameJson(page.data, [
			...REF_A_IDS.slice(5).flatMap((id) => rowA(id)),
			...ROW_B,
			...ROW_C,
		]);
		// Context groups PER SECTION, each on its first sight, in hit order.
		expectSameJson(page.context, [...contextA('lg-spa'), ...CONTEXT_B, ...CONTEXT_C]);
		// The record with no stored value emits its cell WITHOUT `value`.
		const emptyCell = page.data.find(
			(cell) => cell.section_id === REF_A_EMPTY_ID && cell.component_tipo === 'zzrl4',
		);
		expect(emptyCell).toBeDefined();
		expect('value' in (emptyCell as GridEntry)).toBe(false);
	});

	test('limit 0 = ALL the hits (the header-open request)', async () => {
		const page = await grid(relationListRqo({ limit: 0 }));
		expectSameJson(page.data, [...REF_A_IDS.flatMap((id) => rowA(id)), ...ROW_B, ...ROW_C]);
		expectSameJson(page.context, [...contextA('lg-spa'), ...CONTEXT_B, ...CONTEXT_C]);
	});

	test('a string section_id addresses the same host (canonical int)', async () => {
		const asString = await grid(
			relationListRqo(
				{
					limit: 0,
					filter_by_locators: [{ section_tipo: 'zzrl1', section_id: String(HOST_ID) }],
				},
				{ section_id: String(HOST_ID) },
			),
		);
		const asNumber = await grid(relationListRqo({ limit: 0 }));
		expectSameJson(asString.data, asNumber.data);
		expectSameJson(asString.context, asNumber.context);
		expect(asString.data.length).toBeGreaterThan(0);
	});

	test('sqo.section_tipo narrows the owning sections; [all] does not', async () => {
		const narrowed = await grid(relationListRqo({ limit: 0, section_tipo: ['zzrl9'] }));
		expectSameJson(narrowed.data, ROW_B);
		expectSameJson(narrowed.context, CONTEXT_B);
		const unnarrowed = await grid(relationListRqo({ limit: 0, section_tipo: ['all'] }));
		expect(new Set(unnarrowed.data.map((cell) => cell.section_tipo))).toEqual(
			new Set(['zzrl3', 'zzrl9', 'zzrl90']),
		);
	});

	test("the section_map 'relation_list' scope defines the columns, over the legacy node", async () => {
		const page = await grid(relationListRqo({ limit: 0, section_tipo: ['zzrl90'] }));
		expectSameJson(page.context, CONTEXT_C);
		expectSameJson(page.data, ROW_C);
		// The legacy relation_list node's own column is NOT a column here…
		expect(page.data.some((cell) => cell.component_tipo === 'zzrl92')).toBe(false);
		// …and its value really exists on the record, so the absence is the
		// precedence rule and not an empty component.
		expect(page.data.some((cell) => cell.value === 'Valor heredado')).toBe(false);
	});

	test('component_label and section_label are the terms in the REQUEST lang', async () => {
		const page = await grid(relationListRqo({ limit: 1 }, { lang: 'lg-eng' }));
		expectSameJson(page.context, contextA('lg-eng'));
		// …and the cell VALUE is the lg-eng slice of the same component (the
		// lg-spa items are not joined into it).
		expectSameJson(page.data, rowA(REF_A_IDS[0] as number, 'lg-eng'));
	});

	test('non-edit mode returns the empty shell', async () => {
		const { status, body } = await callRelationList(relationListRqo({}, { mode: 'list' }));
		expect(status).toBe(200);
		expect((body as { data: Grid }).data).toEqual({ context: [], data: [] });
	});
});

describe.if(DB_READY)('get_relation_list — the host read gate', () => {
	test('a principal without read on the HOST section is refused (403 perm.denied)', async () => {
		// NON-DEGENERACY first: the identity is a non-admin that CAN read the
		// section the sqo targets (the public list section) and CANNOT read the
		// host — so the handler's own source/sqo gates both pass and only the
		// facade's host gate can refuse.
		const principal = await resolvePrincipal(UNGRANTED_USER_ID);
		expect(principal.isGlobalAdmin).toBe(false);
		expect(await getPermissions(principal, 'zzrl80', 'zzrl80')).toBe(1);
		expect(await getPermissions(principal, 'zzrl1', 'zzrl1')).toBe(0);
		// `tipo` is absent from the source ON PURPOSE: with it, the handler's
		// gate A refuses first and the facade's gate is never reached.
		const rqo = withoutSourceTipo(relationListRqo({ section_tipo: ['zzrl80'] }));
		const { status, body } = await callRelationList(rqo, UNGRANTED_USER_ID);
		expect(status).toBe(403);
		expect((body as { error: { code: string } }).error.code).toBe('perm.denied');
		// The SAME tipo-less RQO is served to the superuser, so the refusal is the
		// host gate and not a malformed request.
		const served = await grid(withoutSourceTipo(relationListRqo({ limit: 0 })));
		expect(served.data.length).toBeGreaterThan(0);
	});

	test('the handler gate A also refuses the tipo-carrying panel RQO', async () => {
		const { status, body } = await callRelationList(relationListRqo(), UNGRANTED_USER_ID);
		expect(status).toBe(403);
		expect((body as { error: { code: string } }).error.code).toBe('perm.denied');
	});
});
