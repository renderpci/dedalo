/**
 * RECORD INFO GATE — dd_utils_api:get_record_info, the inspector's
 * created / modified / published panel (core/section/record/record_info.ts +
 * diffusion_bridge/publication_history.ts).
 *
 * Pins:
 *   - created / modified come off the audit components, the modified pair moves
 *     on a save, a refused audit tipo contributes nothing (twin included);
 *   - publication comes off the dd1758 ledger: first / last PUBLISH, the state
 *     of the latest action of any kind, legacy row shapes (string section_id,
 *     action in section_id) counted, another record's rows ignored;
 *   - the door: section grant + record scope, an integer section_id, the
 *     READ_DOOR_POSTURE `component` classification naming THIS gate.
 *
 * Situation: scratch records in the `test3` playground (suite DB), ledger rows
 * in the scratch dd1758 table; all swept in afterAll.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import type { ApiRequestContext } from '../../src/core/api/dispatch.ts';
import { utilsApiActions } from '../../src/core/api/handlers/dd_utils_api.ts';
import { AUDIT_TIPOS } from '../../src/core/concepts/section.ts';
import { sql } from '../../src/core/db/postgres.ts';
import {
	activityTable,
	logDiffusionActivity,
} from '../../src/core/diffusion_bridge/diffusion_delete.ts';
import {
	decodeLedgerAction,
	readPublicationHistory,
} from '../../src/core/diffusion_bridge/publication_history.ts';
import { createSectionRecord } from '../../src/core/section/record/create_record.ts';
import { deleteSectionRecord } from '../../src/core/section/record/delete_record.ts';
import {
	auditEventsFromColumns,
	getRecordInfo,
} from '../../src/core/section/record/record_info.ts';
import { saveComponentData } from '../../src/core/section/record/save_component.ts';
import { READ_DOOR_POSTURE } from '../../src/core/security/read_door.ts';
import { assertTestDatabase } from '../../src/core/test_data/test_database_marker.ts';
import { ensureDiffusionScratchTables } from '../helpers/diffusion_scratch_tables.ts';

const SECTION = 'test3';
const TEXT = 'test52'; // test3's own component_input_text
const ROOT = -1;
const EDITOR = 4242; // a non-root author id (TM stores user ids in a varchar(8))
const ALL_AUDIT = new Set(Object.values(AUDIT_TIPOS));
const names = async (id: number): Promise<string | null> => `user ${id}`;
const allowAll = async (): Promise<boolean> => true;

const created: number[] = [];

async function sweepLedger(): Promise<void> {
	for (const sectionId of created) {
		await sql.unsafe(
			`DELETE FROM "${activityTable()}"
			 WHERE section_tipo = 'dd1758'
			   AND (relation->'dd1763' @> $1::text::jsonb OR relation->'dd1763' @> $2::text::jsonb)`,
			[
				JSON.stringify([{ section_id: sectionId, section_tipo: SECTION }]),
				JSON.stringify([{ section_id: String(sectionId), section_tipo: SECTION }]),
			],
		);
	}
}

async function newRecord(now: Date): Promise<number> {
	const id = await createSectionRecord(SECTION, ROOT, now);
	created.push(id);
	return id;
}

beforeAll(async () => {
	await assertTestDatabase('record_info_native');
	await ensureDiffusionScratchTables();
});

afterAll(async () => {
	await sweepLedger();
	for (const id of created) await deleteSectionRecord(SECTION, id, ROOT);
});

describe('audit fold (pure)', () => {
	const columns = {
		date: {
			dd199: [{ start: { year: 2026, month: 3, day: 4, hour: 5, minute: 6, second: 7 } }],
			dd201: [{ start: { year: 2026, month: 4, day: 1, hour: 0, minute: 0, second: 0 } }],
		},
		relation: {
			dd200: [{ section_id: 7, section_tipo: 'dd128' }],
			dd197: [{ section_id: '8', section_tipo: 'dd128' }],
		},
		data: { created_date: '1999-01-01 00:00:00', created_by_user_id: 9 },
	};

	test('components win over the data twin; legacy string user ids read', () => {
		const out = auditEventsFromColumns(columns, ALL_AUDIT);
		expect(out.created).toEqual({ date: '2026-03-04 05:06:07', userId: 7 });
		expect(out.modified).toEqual({ date: '2026-04-01 00:00:00', userId: 8 });
	});

	test('data twin is the created fallback; no modified stamp → null', () => {
		const out = auditEventsFromColumns({ data: columns.data }, ALL_AUDIT);
		expect(out.created).toEqual({ date: '1999-01-01 00:00:00', userId: 9 });
		expect(out.modified).toBeNull();
	});

	test('root (-1) is a user, kept; 0 / missing is no user', () => {
		const out = auditEventsFromColumns(
			{
				relation: {
					dd200: [{ section_id: -1, section_tipo: 'dd128' }],
					dd197: [{ section_id: 0, section_tipo: 'dd128' }],
				},
			},
			ALL_AUDIT,
		);
		expect(out.created).toEqual({ date: null, userId: -1 });
		expect(out.modified).toBeNull();
	});

	test('a refused audit tipo contributes nothing — its data twin neither', () => {
		const out = auditEventsFromColumns(columns, new Set([AUDIT_TIPOS.modifiedDate]));
		expect(out.created).toBeNull();
		expect(out.modified).toEqual({ date: '2026-04-01 00:00:00', userId: null });
	});

	test('ledger action decodes both shapes', () => {
		expect(decodeLedgerAction({ diffusion_action: 2, section_tipo: 'dd1774' })).toBe(2);
		expect(decodeLedgerAction({ section_id: '3', section_tipo: 'dd1774' })).toBe(3);
		expect(decodeLedgerAction(null)).toBeNull();
	});
});

describe('record info over a real record', () => {
	test('created set at birth, modified moves on save', async () => {
		const id = await newRecord(new Date(2026, 0, 2, 3, 4, 5));
		const before = await getRecordInfo(SECTION, id, { resolveName: names, canReadAudit: allowAll });
		expect(before?.created).toEqual({
			date: '2026-01-02 03:04:05',
			user_id: ROOT, // root is a real user record at -1 — never dropped
			user_name: `user ${ROOT}`,
		});
		expect(before?.publication).toEqual({ first: null, last: null, state: null });

		const saved = await saveComponentData({
			componentTipo: TEXT,
			sectionTipo: SECTION,
			sectionId: id,
			lang: 'lg-nolan',
			changedData: [{ action: 'set_data', value: [{ id: 1, value: 'record info probe' }] }],
			userId: EDITOR,
		});
		expect(saved.ok).toBe(true);
		const after = await getRecordInfo(SECTION, id, { resolveName: names, canReadAudit: allowAll });
		expect(after?.modified?.user_id).toBe(EDITOR);
		expect(after?.modified?.user_name).toBe(`user ${EDITOR}`);
		expect(typeof after?.modified?.date).toBe('string');
	});

	test('a missing record → null', async () => {
		expect(
			await getRecordInfo(SECTION, 2147483000, { resolveName: names, canReadAudit: allowAll }),
		).toBeNull();
	});
});

describe('publication history (dd1758 ledger)', () => {
	test('first / last publish, latest-action state, legacy shapes, other records ignored', async () => {
		const id = await newRecord(new Date());
		const other = await newRecord(new Date());
		expect(await readPublicationHistory(SECTION, id)).toEqual({
			first: null,
			last: null,
			state: null,
		});

		// Legacy row first: string section_id + action in section_id.
		await sql.unsafe(
			`INSERT INTO "${activityTable()}" (section_tipo, relation, date)
			 VALUES ('dd1758', $1::text::jsonb, $2::text::jsonb)`,
			[
				JSON.stringify({
					dd1763: [{ type: 'dd151', section_id: String(id), section_tipo: SECTION }],
					dd1767: [{ type: 'dd151', section_id: '1', section_tipo: 'dd1774' }],
					dd1762: [{ type: 'dd151', section_id: '11', section_tipo: 'dd128' }],
				}),
				JSON.stringify({ dd1761: [{ start: { year: 2020, month: 1, day: 1 } }] }),
			],
		);
		await logDiffusionActivity({
			sectionTipo: SECTION,
			sectionId: id,
			elementTipo: null,
			action: 1,
			userId: 12,
			now: new Date(2026, 5, 6, 7, 8, 9),
		});
		await logDiffusionActivity({
			sectionTipo: SECTION,
			sectionId: other,
			elementTipo: null,
			action: 1,
			userId: 99,
		});

		const published = await readPublicationHistory(SECTION, id);
		expect(published.first).toEqual({ date: { year: 2020, month: 1, day: 1 }, userId: 11 });
		expect(published.last?.userId).toBe(12);
		expect(published.state).toBe('published');

		await logDiffusionActivity({
			sectionTipo: SECTION,
			sectionId: id,
			elementTipo: null,
			action: 2,
			userId: 13,
		});
		const withdrawn = await readPublicationHistory(SECTION, id);
		expect(withdrawn.last?.userId).toBe(12); // last PUBLISH, not the unpublish
		expect(withdrawn.state).toBe('unpublished');

		const info = await getRecordInfo(SECTION, id, { resolveName: names, canReadAudit: allowAll });
		expect(info?.publication.first).toEqual({
			date: '2020-01-01 00:00:00',
			user_id: 11,
			user_name: 'user 11',
		});
		expect(info?.publication.last).toEqual({
			date: '2026-06-06 07:08:09',
			user_id: 12,
			user_name: 'user 12',
		});
	});
});

describe('the door — dd_utils_api:get_record_info', () => {
	const context = (principal: ApiRequestContext['principal']): ApiRequestContext =>
		({ requestId: 'record_info_native', clientIp: '127.0.0.1', principal }) as ApiRequestContext;
	const call = (options: unknown, principal: ApiRequestContext['principal']) =>
		utilsApiActions.get_record_info!(
			{ action: 'get_record_info', options } as never,
			context(principal),
		);
	const root = { userId: ROOT, isGlobalAdmin: true, isDeveloper: true };

	test('classified `component`, naming this gate', () => {
		const posture = READ_DOOR_POSTURE.get('dd_utils_api:get_record_info');
		expect(posture?.posture).toBe('component');
		expect((posture as { gate?: string }).gate).toBe('test/unit/record_info_native.test.ts');
	});

	test('root reads the owned `record_info` key', async () => {
		const id = await newRecord(new Date());
		const result = await call({ section_tipo: SECTION, section_id: String(id) }, root);
		expect(result.status).toBe(200);
		const body = result.body as unknown as {
			data: unknown;
			record_info: { created: unknown } | null;
		};
		expect(body.data).toBe(true);
		expect(body.record_info?.created).not.toBeNull();
	});

	test('a user without the section grant is refused', async () => {
		const id = await newRecord(new Date());
		const stranger = { userId: EDITOR, isGlobalAdmin: false, isDeveloper: false };
		await expect(call({ section_tipo: SECTION, section_id: id }, stranger)).rejects.toMatchObject({
			code: 'perm.denied',
		});
	});

	test('a non-integer / missing section_id is request.invalid_options', async () => {
		for (const options of [{ section_tipo: SECTION, section_id: 'x' }, { section_tipo: SECTION }]) {
			await expect(call(options, root)).rejects.toMatchObject({ code: 'request.invalid_options' });
		}
	});
});
