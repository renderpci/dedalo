/**
 * A Time Machine COLUMN resolves its request_config against the SUBJECT
 * section, never against dd15 (2026-10-10, `concepts/emit_row.ts`).
 *
 * dd15 lists a record's components as its own columns: the cell BINDS to dd15
 * (the client matches context and data by an exact (tipo, mode, section_tipo)
 * triple), but the component belongs to the record's section. Both TM paths —
 * the column context (`buildTmContext` → `buildStructureContext`) and the row
 * emission (`emitTmRow` → the portal's own config) — handed dd15 to the
 * request_config builder as the OWNER section. A `field_value` sqo source reads
 * the owner section's ACTIVE records, so it queried `matrix_time_machine` and
 * the whole history read died on `column t.string does not exist` (a 500 on
 * dd_core_api::read for every record history showing such a column —
 * hierarchy1's hierarchy45/hierarchy59 on any install).
 *
 * Four legs: the context resolves the field_value targets AND still binds to
 * dd15; the data read does not throw and its cell still binds to dd15; the
 * resolver itself refuses a non-standard table with a typed invariant instead
 * of a Postgres error; and a positive control (the subject section resolves).
 *
 * THE SITUATION IS BUILT HERE on the reserved `zztmfv` scratch TLD (records in
 * matrix_test, TM rows minted through the engine's single TM writer) and torn
 * down by dropSituation, residue asserted 0.
 */

import { afterAll, beforeAll, expect, test } from 'bun:test';
import { TIME_MACHINE_SECTION_TIPO } from '../../src/core/concepts/section.ts';
import { recordTimeMachine } from '../../src/core/db/time_machine.ts';
import { isDedaloError } from '../../src/core/errors/index.ts';
import {
	extractSqoSectionTipos,
	type ParsedRequestConfigItem,
	resolveSqoSectionTipos,
} from '../../src/core/relations/request_config/explicit.ts';
import { readTimeMachineData, tmReadSource } from '../../src/core/resolve/read_tm.ts';
import { runWithRequestLangs } from '../../src/core/resolve/request_lang.ts';
import type { Principal } from '../../src/core/security/permissions.ts';
import {
	dropSituation,
	ensureSituation,
	situation,
} from '../../src/core/test_data/situations/situation.ts';

const TLD = 'zztmfv';
/** The subject section: its records carry the field_value source. */
const SUBJECT = 'zztmfv1';
/** component_input_text whose VALUE names the portal's target section. */
const FIELD = 'zztmfv2';
/** component_portal whose sqo target is `field_value` of FIELD. */
const PORTAL = 'zztmfv3';
/** The section FIELD's value names — what field_value must resolve to. */
const TARGET = 'zztmfv5';
const TARGET_TEXT = 'zztmfv6';
const RECORD_ID = 1;
const LANG = 'lg-spa';
const ADMIN: Principal = { userId: -1, isGlobalAdmin: true, isDeveloper: true };

const FIELD_VALUE_SQO = [{ value: [FIELD], source: 'field_value' }];

/** The active flag field_value filters on (the hierarchy4 → dd64/1 locator). */
const ACTIVE_FLAG = {
	hierarchy4: [
		{ type: 'dd151', section_tipo: 'dd64', section_id: '1', from_component_tipo: 'hierarchy4' },
	],
};

const SITUATION = situation({
	tld: TLD,
	name: 'TM column config owner',
	nodes: [
		{ tipo: SUBJECT, parent: 'test1', model: 'section', term: { 'lg-eng': 'zztmfv subject' } },
		{ tipo: FIELD, parent: SUBJECT, model: 'component_input_text', order_number: 1 },
		{
			tipo: PORTAL,
			parent: SUBJECT,
			model: 'component_portal',
			order_number: 2,
			properties: {
				source: {
					request_config: [
						{
							sqo: { section_tipo: FIELD_VALUE_SQO },
							// A get_ddo_map show (hierarchy45's shape) declares NO explicit list
							// map, so the list cell falls to the portal's OWN config — the data
							// path that resolved against dd15. An explicit ddo_map here would
							// take the list-map branch and leave the data leg vacuous (measured).
							show: { get_ddo_map: { model: 'section_map', columns: [['thesaurus', 'term']] } },
						},
					],
				},
			},
		},
		{ tipo: TARGET, parent: 'test1', model: 'section', term: { 'lg-eng': 'zztmfv target' } },
		{ tipo: TARGET_TEXT, parent: TARGET, model: 'component_input_text', order_number: 1 },
	],
	records: [
		{
			section_tipo: SUBJECT,
			section_id: RECORD_ID,
			columns: {
				string: { [FIELD]: [{ id: 1, lang: 'lg-nolan', value: TARGET }] },
				relation: ACTIVE_FLAG,
			},
		},
		{
			section_tipo: TARGET,
			section_id: RECORD_ID,
			columns: { string: { [TARGET_TEXT]: [{ id: 1, lang: 'lg-nolan', value: 'target text' }] } },
		},
	],
});

/** One record-history read of the subject record, showing the portal column. */
const historyRqo = {
	source: { lang: LANG },
	sqo: {
		section_tipo: [TIME_MACHINE_SECTION_TIPO],
		limit: 10,
		offset: 0,
		filter_by_locators: [{ section_tipo: SUBJECT, section_id: RECORD_ID }],
	},
	show: { ddo_map: [{ tipo: PORTAL }] },
} as never;

const inLang = <T>(fn: () => Promise<T>): Promise<T> =>
	runWithRequestLangs({ applicationLang: LANG, dataLang: LANG }, fn);

beforeAll(async () => {
	await ensureSituation(SITUATION);
	// A per-component history row of the portal, through the single TM writer.
	await recordTimeMachine(
		{
			sectionTipo: SUBJECT,
			sectionId: RECORD_ID,
			componentTipo: PORTAL,
			lang: 'lg-nolan',
			userId: -1,
			data: [
				{
					id: 1,
					type: 'dd151',
					section_tipo: TARGET,
					section_id: String(RECORD_ID),
					from_component_tipo: PORTAL,
				},
			],
		},
		'2026-10-10 10:00:00',
	);
}, 120000);

afterAll(async () => {
	expect(await dropSituation(SITUATION)).toBe(0);
}, 120000);

test('positive control: field_value over the SUBJECT section resolves the named target', async () => {
	const resolved = await resolveSqoSectionTipos(FIELD_VALUE_SQO, {
		ownerTipo: PORTAL,
		ownerSectionTipo: SUBJECT,
		mode: 'list',
		ownerIsSection: false,
	});
	expect(resolved).toEqual([TARGET]);
});

test('field_value over a non-standard table is a typed refusal, never a Postgres error', async () => {
	const failure = await resolveSqoSectionTipos(FIELD_VALUE_SQO, {
		ownerTipo: PORTAL,
		ownerSectionTipo: TIME_MACHINE_SECTION_TIPO,
		mode: 'list',
		ownerIsSection: false,
	}).then(
		() => null,
		(error: unknown) => error,
	);
	expect(failure, 'dd15 as the owner must be refused, not queried').not.toBeNull();
	expect(isDedaloError(failure)).toBe(true);
	expect((failure as { code: string }).code).toBe('internal.invariant');
	expect((failure as Error).message).toContain('matrix_time_machine');
});

test('TM column CONTEXT: binds to dd15, resolves its field_value against the subject', async () => {
	const buildContext = tmReadSource.buildContext;
	if (buildContext === undefined) throw new Error('the dd15 read source must build its context');
	const context = await inLang(() => buildContext(historyRqo, ADMIN));
	const column = (context as unknown as Record<string, unknown>[]).find(
		(entry) => entry.tipo === PORTAL,
	);
	expect(column, 'the portal column context must be emitted').toBeDefined();
	expect(column?.section_tipo).toBe(TIME_MACHINE_SECTION_TIPO);
	const item = (column?.request_config as ParsedRequestConfigItem[] | undefined)?.[0];
	expect(extractSqoSectionTipos(item)).toEqual([TARGET]);
});

test('TM column DATA: the row emits (no 500) and its cell binds to dd15', async () => {
	const result = await inLang(() => readTimeMachineData(historyRqo));
	const cells = (result.data as Record<string, unknown>[]).filter((item) => item.tipo === PORTAL);
	expect(cells.length, 'one portal cell for the minted history row').toBe(1);
	expect(cells[0]?.section_tipo).toBe(TIME_MACHINE_SECTION_TIPO);
});
