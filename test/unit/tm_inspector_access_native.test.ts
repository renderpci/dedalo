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
 *
 * Situation `zztia` (scratch TLD, torn down): section zztia1 with a DIRECT
 * time_machine_list (zztia3) and section zztia10 whose time_machine_list
 * (zztia12) sits inside a section_group (zztia11). Users/profiles are minted at
 * explicit ids and swept; TM rows are minted through the engine's own save path.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { coreApiActions } from '../../src/core/api/handlers/dd_core_api.ts';
import { encodeForJsonb } from '../../src/core/db/json_codec.ts';
import { deleteMatrixRecord } from '../../src/core/db/matrix_write.ts';
import { sql } from '../../src/core/db/postgres.ts';
import { buildStructureContext } from '../../src/core/resolve/structure_context.ts';
import { getTimeMachineListTipo } from '../../src/core/section/list_definitions/time_machine_list.ts';
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
const NESTED_SECTION = 'zztia10';
const NESTED_GROUP = 'zztia11';
const NESTED_TM_LIST = 'zztia12';
const NESTED_TEXT = 'zztia13';
const RECORD_ID = 1;

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
		{ tipo: NESTED_SECTION, parent: 'test1', model: 'section', term: { 'lg-eng': 'zztia nested' } },
		{ tipo: NESTED_GROUP, parent: NESTED_SECTION, model: 'section_group', order_number: 1 },
		{ tipo: NESTED_TEXT, parent: NESTED_GROUP, model: 'component_input_text', order_number: 1 },
		{ tipo: NESTED_TM_LIST, parent: NESTED_GROUP, model: 'time_machine_list', order_number: 2 },
	],
	records: [
		{ section_tipo: DIRECT_SECTION, section_id: RECORD_ID },
		{ section_tipo: NESTED_SECTION, section_id: RECORD_ID },
	],
});

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
];
const TM_GRANTS = [
	grant(5, DIRECT_SECTION, DIRECT_TM_LIST),
	grant(6, NESTED_SECTION, NESTED_TM_LIST),
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

async function mintUser(userId: number, profileId: number, grants: object[]) {
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
		},
	});
}

function clearSecurityCaches() {
	clearPrincipalCache();
	clearUserProjectsCache();
	clearPermissionsCache();
}

async function sweepIdentities() {
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
	await mintUser(GRANTED_USER_ID, GRANTED_PROFILE_ID, [...BASE_GRANTS, ...TM_GRANTS]);
	await mintUser(UNGRANTED_USER_ID, UNGRANTED_PROFILE_ID, BASE_GRANTS);
	clearSecurityCaches();
	admin = await resolvePrincipal(-1);
	granted = await resolvePrincipal(GRANTED_USER_ID);
	ungranted = await resolvePrincipal(UNGRANTED_USER_ID);
	// History rows, minted through the engine's own save path.
	for (const [sectionTipo, componentTipo] of [
		[DIRECT_SECTION, DIRECT_TEXT],
		[NESTED_SECTION, NESTED_TEXT],
	] as const) {
		const saved = await saveComponentData({
			componentTipo,
			sectionTipo,
			sectionId: RECORD_ID,
			lang: LANG,
			changedData: [{ action: 'update', id: null, value: { lang: LANG, value: 'zztia history' } }],
			userId: -1,
		});
		expect(saved.ok).toBe(true);
	}
});

afterAll(async () => {
	await sweepIdentities();
	expect(await dropSituation(SITUATION)).toBe(0);
});

/** The inspector record-history read, exactly as render_inspector sends it. */
function historyRqo(
	action: 'read' | 'count',
	locators: { section_tipo: string }[],
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
			filter_by_locators: locators.map((entry) => ({ ...entry, section_id: RECORD_ID })),
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
	const handler = coreApiActions[action];
	if (handler === undefined) throw new Error(`dd_core_api has no '${action}' action`);
	const rqo = historyRqo(
		action,
		sectionTipos.map((section_tipo) => ({ section_tipo })),
		targets,
	);
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
