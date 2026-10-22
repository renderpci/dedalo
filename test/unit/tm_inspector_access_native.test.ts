/**
 * INSPECTOR TIME MACHINE ACCESS for a NON-ADMIN — WC-2026-10-22-tm-scope-whole-request.
 *
 * The owner report: a regular user holding the §7.4 `time_machine_list` grant
 * opened the inspector "Latest changes" / "Component history" and got
 * perm.denied. Cause: the TM scope (the caller section a dd15 read is FOR) was
 * opened only inside readSection, so the handler's Gate A — getPermissions(
 * principal, 'dd15', 'dd15'), answered by the TM floor, which reads that scope —
 * ran unscoped and refused every non-admin, grant or no grant. The real §7.4
 * gate behind it was never reached.
 *
 * Every leg goes through the HANDLER (coreApiActions.read / .count), never the
 * facade: the defect lived in the handler's gate order, so a gate below it
 * (routeSectionRead) is green on the broken engine.
 *
 *   1. read — a non-admin WITH the grant gets rows; WITHOUT it, perm.denied; a
 *      global admin gets rows; a mixed-section SQO is refused even to the grant
 *      holder (one section's grant never authorizes another's history).
 *   2. count — the same decision as read (a count the read refuses is a history
 *      total leaked; a count refusing what the read serves breaks pagination).
 *   3. NESTED grant — a time_machine_list under a section_group is granted by
 *      the recursive grant walk, so the gate must see it too.
 *   4. the section CONTEXT carries config.time_machine_list per principal: the
 *      tipo for a grant holder, null otherwise — the client's block trigger.
 *   5. THE OWNER RULE (2026-10-22, supersedes review r0): the §7.4 grant — the
 *      same one that opens the Time Machine tool — is what scopes a non-admin's
 *      history; the projects filter does NOT (the history is the record's
 *      changes, and the inspector sends skip_projects_filter by design). A grant
 *      holder reads (and counts, equal to the rows served) the history of a
 *      record OUTSIDE their projects, of a DELETED record, and the whole snapshot
 *      (undelete) list; no grant → perm.denied; an unscoped (bare dd15 browse) or
 *      mixed-section read → perm.denied for every non-admin.
 *   6. VIRTUAL section + NO node: a virtual section of the nested-grant section
 *      resolves the real section's node, and the grant keyed on the VIRTUAL
 *      section admits; a section with no time_machine_list stays admin-only and
 *      stamps the section tipo for the admin, null for anyone else.
 *
 * Situation `zztia` (scratch TLD, torn down): section zztia1 with a DIRECT
 * time_machine_list (zztia3); section zztia10 whose time_machine_list (zztia12)
 * sits inside a section_group (zztia11); zztia20, a VIRTUAL section of zztia10;
 * zztia30, a PROJECT-GATED section (component_filter zztia33) with one record in
 * the grant holder's project, one outside it and one deleted; zztia40, a section with no
 * time_machine_list. Users/profiles are minted at explicit ids and swept; TM rows
 * are minted through the engine's own save and delete paths (the LIVE records'
 * whole-record snapshots excepted — see beforeAll).
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { coreApiActions } from '../../src/core/api/handlers/dd_core_api.ts';
import { encodeForJsonb } from '../../src/core/db/json_codec.ts';
import { deleteMatrixRecord } from '../../src/core/db/matrix_write.ts';
import { sql } from '../../src/core/db/postgres.ts';
import { buildStructureContext } from '../../src/core/resolve/structure_context.ts';
import { getTimeMachineListTipo } from '../../src/core/section/list_definitions/time_machine_list.ts';
import { deleteSectionRecord } from '../../src/core/section/record/delete_record.ts';
import { saveComponentData } from '../../src/core/section/record/save_component.ts';
import {
	clearPermissionsCache,
	clearPrincipalCache,
	clearUserProjectsCache,
	type Principal,
	resolvePrincipal,
} from '../../src/core/security/permissions.ts';
import {
	dropSituation,
	ensureSituation,
	situation,
} from '../../src/core/test_data/situations/situation.ts';
import { assertTestDatabase } from '../../src/core/test_data/test_database_marker.ts';

const DIRECT_SECTION = 'zztia1';
const DIRECT_TEXT = 'zztia2';
const DIRECT_TM_LIST = 'zztia3';
/** A component of DIRECT_SECTION the grant holder holds level 0 on (no dd774 row). */
const RESTRICTED_TEXT = 'zztia4';
/** DIRECT_SECTION's list columns (both components) — the snapshot list's own columns. */
const DIRECT_LIST = 'zztia5';
/** The restricted component's past value — must never reach the grant holder. */
const SECRET = 'zztia secret';
/** The readable component's past value — the grant holder's control. */
const PUBLIC_VALUE = 'zztia history';
const NESTED_SECTION = 'zztia10';
const NESTED_GROUP = 'zztia11';
const NESTED_TM_LIST = 'zztia12';
const NESTED_TEXT = 'zztia13';
const RECORD_ID = 1;
/** A virtual section of NESTED_SECTION (its relation names a section-model node). */
const VIRTUAL_SECTION = 'zztia20';
/** A project-gated section: zztia33 is its component_filter. */
const SCOPED_SECTION = 'zztia30';
const SCOPED_TEXT = 'zztia31';
const SCOPED_TM_LIST = 'zztia32';
const SCOPED_FILTER = 'zztia33';
/** In the grant holder's project. */
const IN_SCOPE_ID = 1;
/** In another project: outside the grant holder's records. */
const OUT_OF_SCOPE_ID = 2;
/** In the grant holder's project, then DELETED: only its TM history remains. */
const DEAD_ID = 3;
/** dd153 project ids the records and the grant holder's dd170 name (no project row needed). */
const IN_PROJECT_ID = 958721;
const OUT_PROJECT_ID = 958722;
/** A section that declares NO time_machine_list. */
const NO_NODE_SECTION = 'zztia40';

const GRANTED_USER_ID = 958701;
const UNGRANTED_USER_ID = 958702;
const GRANTED_PROFILE_ID = 958711;
const UNGRANTED_PROFILE_ID = 958712;
/** TEST-NET-3: the LOAD activity rows this file's reads write are swept by it. */
const CLIENT_IP = '203.0.113.88';
const LANG = 'lg-eng';

const SITUATION = situation({
	name: 'inspector time machine access',
	tld: 'zztia',
	nodes: [
		{ tipo: DIRECT_SECTION, parent: 'test1', model: 'section', term: { 'lg-eng': 'zztia direct' } },
		{ tipo: DIRECT_TEXT, parent: DIRECT_SECTION, model: 'component_input_text', order_number: 1 },
		{ tipo: DIRECT_TM_LIST, parent: DIRECT_SECTION, model: 'time_machine_list', order_number: 2 },
		{
			tipo: RESTRICTED_TEXT,
			parent: DIRECT_SECTION,
			model: 'component_input_text',
			order_number: 3,
		},
		{
			tipo: DIRECT_LIST,
			parent: DIRECT_SECTION,
			model: 'section_list',
			order_number: 4,
			relations: [{ tipo: DIRECT_TEXT }, { tipo: RESTRICTED_TEXT }],
		},
		{ tipo: NESTED_SECTION, parent: 'test1', model: 'section', term: { 'lg-eng': 'zztia nested' } },
		{ tipo: NESTED_GROUP, parent: NESTED_SECTION, model: 'section_group', order_number: 1 },
		{ tipo: NESTED_TEXT, parent: NESTED_GROUP, model: 'component_input_text', order_number: 1 },
		{ tipo: NESTED_TM_LIST, parent: NESTED_GROUP, model: 'time_machine_list', order_number: 2 },
		{
			tipo: VIRTUAL_SECTION,
			parent: 'test1',
			model: 'section',
			term: { 'lg-eng': 'zztia virtual' },
			relations: [{ tipo: NESTED_SECTION }],
		},
		{ tipo: SCOPED_SECTION, parent: 'test1', model: 'section', term: { 'lg-eng': 'zztia scoped' } },
		{ tipo: SCOPED_TEXT, parent: SCOPED_SECTION, model: 'component_input_text', order_number: 1 },
		{ tipo: SCOPED_TM_LIST, parent: SCOPED_SECTION, model: 'time_machine_list', order_number: 2 },
		{
			tipo: SCOPED_FILTER,
			parent: SCOPED_SECTION,
			model: 'component_filter',
			order_number: 3,
			term: { 'lg-eng': 'Projects' },
			relations: [{ tipo: 'dd153' }],
		},
		{ tipo: NO_NODE_SECTION, parent: 'test1', model: 'section', term: { 'lg-eng': 'zztia bare' } },
	],
	records: [
		{ section_tipo: DIRECT_SECTION, section_id: RECORD_ID },
		{ section_tipo: NESTED_SECTION, section_id: RECORD_ID },
		{ section_tipo: VIRTUAL_SECTION, section_id: RECORD_ID },
		scopedRecord(IN_SCOPE_ID, IN_PROJECT_ID),
		scopedRecord(OUT_OF_SCOPE_ID, OUT_PROJECT_ID),
		scopedRecord(DEAD_ID, IN_PROJECT_ID),
	],
});

/** A zztia30 record filed under one dd153 project. */
function scopedRecord(sectionId: number, projectId: number) {
	return {
		section_tipo: SCOPED_SECTION,
		section_id: sectionId,
		columns: {
			relation: {
				[SCOPED_FILTER]: [
					{
						id: 1,
						type: 'dd151',
						section_tipo: 'dd153',
						section_id: projectId,
						from_component_tipo: SCOPED_FILTER,
					},
				],
			},
		},
	};
}

/** One dd774 grant row (getPermissionsTable reads `${section_tipo}_${tipo}`). */
const grant = (id: number, sectionTipo: string, tipo: string) => ({
	id,
	tipo,
	section_tipo: sectionTipo,
	value: 1,
});

/** Section + component read on both sections: everything EXCEPT the §7.4 grant. */
const BASE_GRANTS = [
	grant(1, DIRECT_SECTION, DIRECT_SECTION),
	grant(2, DIRECT_SECTION, DIRECT_TEXT),
	grant(3, NESTED_SECTION, NESTED_SECTION),
	grant(4, NESTED_SECTION, NESTED_TEXT),
	grant(7, VIRTUAL_SECTION, VIRTUAL_SECTION),
	grant(8, VIRTUAL_SECTION, NESTED_TEXT),
	grant(9, SCOPED_SECTION, SCOPED_SECTION),
	grant(10, SCOPED_SECTION, SCOPED_TEXT),
	grant(11, NO_NODE_SECTION, NO_NODE_SECTION),
];
const TM_GRANTS = [
	grant(5, DIRECT_SECTION, DIRECT_TM_LIST),
	grant(6, NESTED_SECTION, NESTED_TM_LIST),
	// The VIRTUAL section's grant: the pair the gate asks, (virtual section, the
	// real section's node) — getPermissions(principal, zztia20, zztia12).
	grant(12, VIRTUAL_SECTION, NESTED_TM_LIST),
	grant(13, SCOPED_SECTION, SCOPED_TM_LIST),
];

const OWNED: { table: string; sectionTipo: string; sectionId: number }[] = [
	{ table: 'matrix_users', sectionTipo: 'dd128', sectionId: GRANTED_USER_ID },
	{ table: 'matrix_users', sectionTipo: 'dd128', sectionId: UNGRANTED_USER_ID },
	{ table: 'matrix_profiles', sectionTipo: 'dd234', sectionId: GRANTED_PROFILE_ID },
	{ table: 'matrix_profiles', sectionTipo: 'dd234', sectionId: UNGRANTED_PROFILE_ID },
];

async function insertRow(table: string, sectionTipo: string, sectionId: number, columns: object) {
	const entries = Object.entries(columns);
	const names = entries.map(([name]) => `"${name}"`).join(', ');
	const values = entries.map((_, index) => `$${index + 3}::text::jsonb`).join(', ');
	await sql.unsafe(
		`INSERT INTO "${table}" (section_tipo, section_id, ${names}) VALUES ($1, $2, ${values})`,
		[sectionTipo, sectionId, ...entries.map(([, value]) => encodeForJsonb(value))],
	);
}

const locator = (from: string, sectionTipo: string, sectionId: number) => ({
	id: 1,
	type: 'dd151',
	section_id: sectionId,
	section_tipo: sectionTipo,
	from_component_tipo: from,
});

async function mintUser(
	userId: number,
	profileId: number,
	grants: object[],
	projectIds: readonly number[] = [],
) {
	await insertRow('matrix_profiles', 'dd234', profileId, {
		string: { dd237: [{ id: 1, lang: LANG, value: `zztia profile ${profileId}` }] },
		misc: { dd774: grants },
	});
	await insertRow('matrix_users', 'dd128', userId, {
		string: { dd132: [{ id: 1, lang: 'lg-nolan', value: `zztia_${userId}` }] },
		relation: {
			dd131: [locator('dd131', 'dd64', 1)],
			dd244: [locator('dd244', 'dd64', 2)],
			dd515: [locator('dd515', 'dd64', 2)],
			dd1725: [locator('dd1725', 'dd234', profileId)],
			...(projectIds.length > 0
				? {
						dd170: projectIds.map((projectId, index) => ({
							...locator('dd170', 'dd153', projectId),
							id: index + 1,
						})),
					}
				: {}),
		},
	});
}

function clearSecurityCaches() {
	clearPrincipalCache();
	clearUserProjectsCache();
	clearPermissionsCache();
}

async function sweepIdentities() {
	await assertTestDatabase('tm_inspector_access_native sweep');
	for (const row of OWNED) await deleteMatrixRecord(row.table, row.sectionTipo, row.sectionId);
	await sql.unsafe("DELETE FROM matrix_activity WHERE string->'dd544'->0->>'value' = $1", [
		CLIENT_IP,
	]);
	clearSecurityCaches();
}

let admin: Principal;
let granted: Principal;
let ungranted: Principal;

beforeAll(async () => {
	await assertTestDatabase('tm_inspector_access_native');
	await sweepIdentities();
	await ensureSituation(SITUATION);
	await mintUser(
		GRANTED_USER_ID,
		GRANTED_PROFILE_ID,
		[...BASE_GRANTS, ...TM_GRANTS],
		[IN_PROJECT_ID],
	);
	await mintUser(UNGRANTED_USER_ID, UNGRANTED_PROFILE_ID, BASE_GRANTS, [IN_PROJECT_ID]);
	clearSecurityCaches();
	admin = await resolvePrincipal(-1);
	granted = await resolvePrincipal(GRANTED_USER_ID);
	ungranted = await resolvePrincipal(UNGRANTED_USER_ID);
	// History rows, minted through the engine's own save path.
	for (const [sectionTipo, componentTipo, sectionId] of [
		[DIRECT_SECTION, DIRECT_TEXT, RECORD_ID],
		[NESTED_SECTION, NESTED_TEXT, RECORD_ID],
		[VIRTUAL_SECTION, NESTED_TEXT, RECORD_ID],
		[SCOPED_SECTION, SCOPED_TEXT, IN_SCOPE_ID],
		[SCOPED_SECTION, SCOPED_TEXT, OUT_OF_SCOPE_ID],
		[SCOPED_SECTION, SCOPED_TEXT, DEAD_ID],
	] as const) {
		const saved = await saveComponentData({
			componentTipo,
			sectionTipo,
			sectionId,
			lang: LANG,
			changedData: [{ action: 'update', id: null, value: { lang: LANG, value: PUBLIC_VALUE } }],
			userId: -1,
		});
		expect(saved.ok).toBe(true);
	}
	// The RESTRICTED component's history on the same record (per-component row).
	const restricted = await saveComponentData({
		componentTipo: RESTRICTED_TEXT,
		sectionTipo: DIRECT_SECTION,
		sectionId: RECORD_ID,
		lang: LANG,
		changedData: [{ action: 'update', id: null, value: { lang: LANG, value: SECRET } }],
		userId: -1,
	});
	expect(restricted.ok).toBe(true);
	// A whole-record snapshot of the same record carrying BOTH components — the
	// snapshot list's surface (inserted directly, see the note below).
	await sql.unsafe(
		`INSERT INTO matrix_time_machine (section_id, section_tipo, tipo, lang, timestamp, user_id, data)
		 VALUES ($1, $2, $2, 'lg-nolan', now(), -1, $3::text::jsonb)`,
		[
			RECORD_ID,
			DIRECT_SECTION,
			encodeForJsonb({
				string: {
					[DIRECT_TEXT]: [{ id: 1, lang: LANG, value: PUBLIC_VALUE }],
					[RESTRICTED_TEXT]: [{ id: 1, lang: LANG, value: SECRET }],
				},
			}),
		],
	);
	// Whole-record snapshot rows (tipo = section_tipo — the snapshot list's
	// surface) of the two LIVE records, inserted directly: no engine door writes
	// one for a live record without changing it. The DEAD record's comes from the
	// engine's own delete, which snapshots the record and leaves no live row.
	for (const sectionId of [IN_SCOPE_ID, OUT_OF_SCOPE_ID]) {
		await sql.unsafe(
			`INSERT INTO matrix_time_machine (section_id, section_tipo, tipo, lang, timestamp, user_id, data)
			 VALUES ($1, $2, $2, 'lg-nolan', now(), -1, '{}'::jsonb)`,
			[sectionId, SCOPED_SECTION],
		);
	}
	expect((await deleteSectionRecord(SCOPED_SECTION, DEAD_ID, -1)).removed).toBe(true);
});

afterAll(async () => {
	await sweepIdentities();
	expect(await dropSituation(SITUATION)).toBe(0);
});

/** The inspector record-history read, exactly as render_inspector sends it. */
function historyRqo(
	action: 'read' | 'count',
	locators: { section_tipo: string; section_id?: number }[],
	targets?: string[],
) {
	return {
		action,
		source: {
			model: 'section',
			tipo: 'dd15',
			section_tipo: 'dd15',
			mode: 'list',
			lang: LANG,
			session_save: false,
			tm_surface: 'inspector_record',
		},
		sqo: {
			id: 'section_history',
			mode: 'tm',
			section_tipo: targets ?? [...new Set(locators.map((entry) => entry.section_tipo))],
			limit: 10,
			offset: 0,
			order: [{ direction: 'DESC', path: [{ component_tipo: 'id' }] }],
			skip_projects_filter: true,
			filter_by_locators: locators.map((entry) => ({ section_id: RECORD_ID, ...entry })),
		},
		show: {},
	};
}

function contextFor(principal: Principal) {
	return {
		principal,
		session: { userId: principal.userId },
		clientIp: CLIENT_IP,
		requestId: 'tm_inspector_access',
	} as unknown as Parameters<NonNullable<(typeof coreApiActions)['read']>>[1];
}

type Answer = { refused: string } | { body: Record<string, unknown> };

async function call(
	action: 'read' | 'count',
	principal: Principal,
	sectionTipos: string[],
	targets?: string[],
): Promise<Answer> {
	return send(
		action,
		principal,
		historyRqo(
			action,
			sectionTipos.map((section_tipo) => ({ section_tipo })),
			targets,
		),
	);
}

/** One record's history (a single pin at `sectionId`). */
function callPinned(
	action: 'read' | 'count',
	principal: Principal,
	sectionTipo: string,
	sectionId: number,
): Promise<Answer> {
	return send(
		action,
		principal,
		historyRqo(action, [{ section_tipo: sectionTipo, section_id: sectionId }]),
	);
}

/** The record-SNAPSHOT list, exactly as tool_time_machine sends it for a section caller. */
function callSnapshots(
	action: 'read' | 'count',
	principal: Principal,
	sectionTipo: string,
): Promise<Answer> {
	return send(action, principal, {
		action,
		source: {
			model: 'section',
			tipo: 'dd15',
			section_tipo: 'dd15',
			mode: 'list',
			lang: LANG,
			session_save: false,
		},
		sqo: {
			id: 'time_machine_temporal',
			mode: 'tm',
			section_tipo: [sectionTipo],
			limit: 10,
			offset: 0,
			order: [{ direction: 'DESC', path: [{ component_tipo: 'id' }] }],
			skip_projects_filter: true,
			filter: { $and: [{ q: sectionTipo, column_name: 'tipo' }] },
		},
		show: {},
	});
}

async function send(action: 'read' | 'count', principal: Principal, rqo: object): Promise<Answer> {
	const handler = coreApiActions[action];
	if (handler === undefined) throw new Error(`dd_core_api has no '${action}' action`);
	try {
		const result = await handler(rqo as never, contextFor(principal));
		return { body: result.body as Record<string, unknown> };
	} catch (error) {
		return { refused: String((error as { code?: unknown }).code) };
	}
}

/** The dd15 history rows a read answered (the `sections` envelope's entries). */
function historyRows(answer: Answer): number {
	if ('refused' in answer) return -1;
	const data = (answer.body.data as { data?: { typo?: string; entries?: unknown[] }[] }).data ?? [];
	const envelope = data.find((item) => item.typo === 'sections');
	return envelope?.entries?.length ?? 0;
}

/** The caller records the history rows a read answered belong to (sorted, distinct). */
function historyRecords(answer: Answer): number[] {
	if ('refused' in answer) return [-1];
	const data = (answer.body.data as { data?: { typo?: string; entries?: unknown[] }[] }).data ?? [];
	const entries = (data.find((item) => item.typo === 'sections')?.entries ?? []) as {
		caller_section_id?: unknown;
	}[];
	return [...new Set(entries.map((entry) => Number(entry.caller_section_id)))].sort(
		(a, b) => a - b,
	);
}

function countTotal(answer: Answer): number {
	if ('refused' in answer) return -1;
	return Number((answer.body.data as { total?: unknown }).total);
}

describe('read through the handler (Gate A judges the TM scope)', () => {
	test('a non-admin WITH the time_machine_list grant reads the history', async () => {
		expect(historyRows(await call('read', granted, [DIRECT_SECTION]))).toBeGreaterThan(0);
	});

	test('a non-admin WITHOUT the grant is refused', async () => {
		expect(await call('read', ungranted, [DIRECT_SECTION])).toEqual({ refused: 'perm.denied' });
	});

	test('a global admin reads the history', async () => {
		expect(historyRows(await call('read', admin, [DIRECT_SECTION]))).toBeGreaterThan(0);
	});

	test('a mixed-section read is refused even to the grant holder', async () => {
		expect(await call('read', granted, [DIRECT_SECTION, NESTED_SECTION])).toEqual({
			refused: 'perm.denied',
		});
	});
});

describe('count answers what read answers', () => {
	test('per principal, the count decision equals the read decision', async () => {
		const decisions: Record<string, [string, string]> = {};
		for (const [name, principal] of [
			['admin', admin],
			['granted', granted],
			['ungranted', ungranted],
		] as const) {
			const read = await call('read', principal, [DIRECT_SECTION]);
			const count = await call('count', principal, [DIRECT_SECTION]);
			decisions[name] = [
				'refused' in read ? read.refused : 'served',
				'refused' in count ? count.refused : 'served',
			];
		}
		expect(decisions).toEqual({
			admin: ['served', 'served'],
			granted: ['served', 'served'],
			ungranted: ['perm.denied', 'perm.denied'],
		});
	});

	test('an SQO targeting dd15 itself is judged in the same scope by both', async () => {
		// Gate B then asks the dd15 FLOOR, which reads the TM scope: a count run
		// outside it refuses what the read serves.
		const read = await call('read', granted, [DIRECT_SECTION], ['dd15']);
		const count = await call('count', granted, [DIRECT_SECTION], ['dd15']);
		expect([historyRows(read) > 0, countTotal(count) > 0]).toEqual([true, true]);
		expect(await call('count', ungranted, [DIRECT_SECTION], ['dd15'])).toEqual({
			refused: 'perm.denied',
		});
	});

	test('the grant holder counts the same total the admin counts', async () => {
		const adminTotal = countTotal(await call('count', admin, [DIRECT_SECTION]));
		expect(adminTotal).toBeGreaterThan(0);
		expect(countTotal(await call('count', granted, [DIRECT_SECTION]))).toBe(adminTotal);
	});
});

describe('a time_machine_list nested under a grouper', () => {
	test('the gate finds it where the grant walk put it', async () => {
		expect(await getTimeMachineListTipo(NESTED_SECTION)).toBe(NESTED_TM_LIST);
	});

	test('its grant admits the non-admin; its absence refuses', async () => {
		expect(historyRows(await call('read', granted, [NESTED_SECTION]))).toBeGreaterThan(0);
		expect(await call('read', ungranted, [NESTED_SECTION])).toEqual({ refused: 'perm.denied' });
	});
});

describe('the section context carries config.time_machine_list per principal', () => {
	async function stamped(principal: Principal, sectionTipo: string): Promise<unknown> {
		const entry = await buildStructureContext({
			tipo: sectionTipo,
			sectionTipo,
			mode: 'edit',
			lang: LANG,
			permissions: 1,
			principal,
		} as never);
		return (entry as { config?: { time_machine_list?: unknown } }).config?.time_machine_list;
	}

	test('a virtual section stamps the real node; a section with no node stamps admin only', async () => {
		expect({
			grantedVirtual: await stamped(granted, VIRTUAL_SECTION),
			ungrantedVirtual: await stamped(ungranted, VIRTUAL_SECTION),
			adminNoNode: await stamped(admin, NO_NODE_SECTION),
			grantedNoNode: await stamped(granted, NO_NODE_SECTION),
		}).toEqual({
			grantedVirtual: NESTED_TM_LIST,
			ungrantedVirtual: null,
			adminNoNode: NO_NODE_SECTION,
			grantedNoNode: null,
		});
	});

	test('the tipo for a grant holder and an admin, null otherwise', async () => {
		expect({
			granted: await stamped(granted, DIRECT_SECTION),
			grantedNested: await stamped(granted, NESTED_SECTION),
			ungranted: await stamped(ungranted, DIRECT_SECTION),
			admin: await stamped(admin, DIRECT_SECTION),
		}).toEqual({
			granted: DIRECT_TM_LIST,
			grantedNested: NESTED_TM_LIST,
			ungranted: null,
			admin: DIRECT_TM_LIST,
		});
	});
});

describe('the owner rule: the TM grant, not the projects filter, scopes a non-admin history', () => {
	/** A read's records and its count, side by side (count must equal the rows served). */
	async function readAndCount(
		read: (action: 'read' | 'count') => Promise<Answer>,
	): Promise<{ records: number[]; rows: number; total: number }> {
		const answer = await read('read');
		return {
			records: historyRecords(answer),
			rows: historyRows(answer),
			total: countTotal(await read('count')),
		};
	}

	test('the grant holder reads the history of an in-project record', async () => {
		const seen = await readAndCount((action) =>
			callPinned(action, granted, SCOPED_SECTION, IN_SCOPE_ID),
		);
		expect(seen.records).toEqual([IN_SCOPE_ID]);
		expect(seen.total).toBe(seen.rows);
	});

	test('the grant holder reads the history of a record OUTSIDE their projects — read and count', async () => {
		const pinned = (principal: Principal) =>
			readAndCount((action) => callPinned(action, principal, SCOPED_SECTION, OUT_OF_SCOPE_ID));
		const asAdmin = await pinned(admin);
		const asGranted = await pinned(granted);
		expect(asGranted.records).toEqual([OUT_OF_SCOPE_ID]);
		expect(asGranted.rows).toBeGreaterThan(0);
		expect(asGranted.total).toBe(asGranted.rows);
		expect(asGranted).toEqual(asAdmin);
	});

	test('a pin list naming both records answers both, as it does for the admin', async () => {
		const both = historyRqo('read', [
			{ section_tipo: SCOPED_SECTION, section_id: IN_SCOPE_ID },
			{ section_tipo: SCOPED_SECTION, section_id: OUT_OF_SCOPE_ID },
		]);
		expect(historyRecords(await send('read', granted, both))).toEqual([
			IN_SCOPE_ID,
			OUT_OF_SCOPE_ID,
		]);
		expect(historyRecords(await send('read', admin, both))).toEqual([IN_SCOPE_ID, OUT_OF_SCOPE_ID]);
	});

	test('the snapshot (undelete) list holds every record, deleted included; its count equals its rows', async () => {
		const snapshots = (principal: Principal) =>
			readAndCount((action) => callSnapshots(action, principal, SCOPED_SECTION));
		const asGranted = await snapshots(granted);
		expect(asGranted.records).toEqual([IN_SCOPE_ID, OUT_OF_SCOPE_ID, DEAD_ID]);
		expect(asGranted.total).toBe(asGranted.rows);
		expect(asGranted).toEqual(await snapshots(admin));
	});

	test('a DELETED record keeps its history for the grant holder — read and count', async () => {
		const pinned = (principal: Principal) =>
			readAndCount((action) => callPinned(action, principal, SCOPED_SECTION, DEAD_ID));
		const asGranted = await pinned(granted);
		expect(asGranted.records).toEqual([DEAD_ID]);
		expect(asGranted.rows).toBeGreaterThan(0);
		expect(asGranted.total).toBe(asGranted.rows);
		expect(asGranted).toEqual(await pinned(admin));
	});

	test('without the grant: perm.denied — out-of-project, deleted and snapshot surfaces alike', async () => {
		const refusals: Answer[] = [];
		for (const action of ['read', 'count'] as const) {
			refusals.push(await callPinned(action, ungranted, SCOPED_SECTION, OUT_OF_SCOPE_ID));
			refusals.push(await callPinned(action, ungranted, SCOPED_SECTION, DEAD_ID));
			refusals.push(await callSnapshots(action, ungranted, SCOPED_SECTION));
		}
		expect(refusals).toEqual(Array(6).fill({ refused: 'perm.denied' }));
	});

	test('unscoped (the bare dd15 browse) and mixed-section reads stay admin-only', async () => {
		const browse = (action: 'read' | 'count') => ({
			action,
			source: {
				model: 'section',
				tipo: 'dd15',
				section_tipo: 'dd15',
				mode: 'list',
				lang: LANG,
				session_save: false,
			},
			sqo: {
				id: 'tm_browse',
				mode: 'tm',
				section_tipo: ['dd15'],
				limit: 10,
				offset: 0,
				order: [{ direction: 'DESC', path: [{ component_tipo: 'id' }] }],
			},
			show: {},
		});
		const mixed = (action: 'read' | 'count') =>
			historyRqo(action, [
				{ section_tipo: SCOPED_SECTION, section_id: OUT_OF_SCOPE_ID },
				{ section_tipo: DIRECT_SECTION, section_id: RECORD_ID },
			]);
		const refusals: Answer[] = [];
		for (const action of ['read', 'count'] as const) {
			refusals.push(await send(action, granted, browse(action)));
			refusals.push(await send(action, granted, mixed(action)));
		}
		expect(refusals).toEqual(Array(4).fill({ refused: 'perm.denied' }));
		// The CONTROL: the same browse is the admin's.
		expect(historyRows(await send('read', admin, browse('read')))).toBeGreaterThan(0);
	});
});

describe('a virtual section and a section with no time_machine_list', () => {
	test('the virtual section resolves the real section nested node', async () => {
		expect(await getTimeMachineListTipo(VIRTUAL_SECTION)).toBe(NESTED_TM_LIST);
	});

	test('the grant keyed on the virtual section admits; its absence refuses', async () => {
		expect(historyRows(await call('read', granted, [VIRTUAL_SECTION]))).toBeGreaterThan(0);
		expect(await call('read', ungranted, [VIRTUAL_SECTION])).toEqual({ refused: 'perm.denied' });
	});

	test('no node: admin-only, read and count alike', async () => {
		expect(await call('read', granted, [NO_NODE_SECTION])).toEqual({ refused: 'perm.denied' });
		expect(await call('count', granted, [NO_NODE_SECTION])).toEqual({ refused: 'perm.denied' });
	});

	test('a mixed-section count is refused like the mixed-section read', async () => {
		expect(await call('count', granted, [DIRECT_SECTION, NESTED_SECTION])).toEqual({
			refused: 'perm.denied',
		});
	});
});

describe('the component pair: a section-wide TM grant never reads a level-0 component', () => {
	/** The whole answer as text — a value served anywhere in it (cell, subdatum, raw) shows. */
	const served = (answer: Answer): string =>
		'refused' in answer ? `refused:${answer.refused}` : JSON.stringify(answer.body);

	/** One COMPONENT's history (the tool opened on a component). */
	const componentRqo = (componentTipo: string, show: object = {}) => ({
		action: 'read',
		source: {
			model: 'section',
			tipo: 'dd15',
			section_tipo: 'dd15',
			mode: 'list',
			lang: LANG,
			session_save: false,
		},
		sqo: {
			id: 'component_history',
			mode: 'tm',
			section_tipo: [DIRECT_SECTION],
			limit: 50,
			offset: 0,
			order: [{ direction: 'DESC', path: [{ component_tipo: 'id' }] }],
			skip_projects_filter: true,
			filter_by_locators: [
				{ section_tipo: DIRECT_SECTION, section_id: RECORD_ID, tipo: componentTipo },
			],
		},
		show,
	});

	test('the component surface: the admin reads the restricted value, the grant holder never', async () => {
		expect(served(await send('read', admin, componentRqo(RESTRICTED_TEXT)))).toContain(SECRET);
		const answer = await send('read', granted, componentRqo(RESTRICTED_TEXT));
		expect(historyRows(answer)).toBeGreaterThan(0);
		expect(served(answer)).not.toContain(SECRET);
	});

	test('a withheld column is not advertised in the context either', async () => {
		const columns = (answer: Answer): string[] =>
			'refused' in answer
				? []
				: (((answer.body.data as { context?: { tipo?: string; type?: string }[] }).context ?? [])
						.filter((entry) => entry.type === 'component')
						.map((entry) => entry.tipo) as string[]);
		expect(columns(await send('read', admin, componentRqo(RESTRICTED_TEXT)))).toContain(
			RESTRICTED_TEXT,
		);
		const grantedColumns = columns(await send('read', granted, componentRqo(RESTRICTED_TEXT)));
		expect(grantedColumns).toContain('dd559');
		expect(grantedColumns).not.toContain(RESTRICTED_TEXT);
	});

	test('the component surface of a READABLE component still serves its value', async () => {
		expect(served(await send('read', granted, componentRqo(DIRECT_TEXT)))).toContain(PUBLIC_VALUE);
	});

	test('a client-sent column naming the restricted component serves nothing of it', async () => {
		const show = { ddo_map: [{ tipo: RESTRICTED_TEXT, section_tipo: 'dd15', view: 'text' }] };
		expect(served(await send('read', admin, componentRqo(RESTRICTED_TEXT, show)))).toContain(
			SECRET,
		);
		expect(served(await send('read', granted, componentRqo(RESTRICTED_TEXT, show)))).not.toContain(
			SECRET,
		);
	});

	test('the inspector record block: the raw value (dd1574) of a restricted row is withheld', async () => {
		const rqo = historyRqo('read', [{ section_tipo: DIRECT_SECTION, section_id: RECORD_ID }]);
		expect(served(await send('read', admin, rqo))).toContain(SECRET);
		const answer = await send('read', granted, rqo);
		// The CONTROLS: the readable component's raw value and the history's own
		// columns (Who, with its user subdatum) still serve.
		expect(served(answer)).toContain(PUBLIC_VALUE);
		expect(served(answer)).toContain('"tipo":"dd578"');
		expect(served(answer)).toContain('"tipo":"dd132"');
		expect(served(answer)).not.toContain(SECRET);
	});

	test('the snapshot list: the restricted column of a whole-record snapshot is withheld', async () => {
		expect(served(await callSnapshots('read', admin, DIRECT_SECTION))).toContain(SECRET);
		const answer = await callSnapshots('read', granted, DIRECT_SECTION);
		expect(historyRows(answer)).toBeGreaterThan(0);
		// The CONTROL: the readable list column of the same snapshot still serves.
		expect(served(answer)).toContain(PUBLIC_VALUE);
		expect(served(answer)).not.toContain(SECRET);
	});
});
