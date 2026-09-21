/**
 * `readRaw` — the raw (unresolved) record/component accessor, and the SPLIT
 * DOOR in front of it (plan §4.2.5; component key P1-3 / SEC-04, 2026-09-03).
 *
 * WHAT THIS GATES, AND WHY IT IS A DISCLOSURE GATE. `readRaw` returns the
 * exact stored jsonb of whatever its SQO matched, with NO component
 * resolution, no labels and no per-field permission stamp. Everything that
 * keeps a caller from seeing what they may not see is therefore layered in
 * front of the payload:
 *   - the per-record projects ACL, applied INSIDE `readRaw` by handing the
 *     principal to `buildSearchSql` (a non-admin sees only their projects'
 *     records);
 *   - the section-level read permission, applied by the CALLER
 *     (`dd_core_api.ts` `read_raw`) — a split door, so this file drives BOTH
 *     `readRaw` directly and the handler through `dispatchRqo`;
 *   - THE COMPONENT KEY, applied INSIDE `readRaw` through
 *     `security/read_door.ts` (DECISION recorded in read_raw.ts's header and
 *     WC-2026-09-03-read-door-component-acl): `ddoIsAuthorized` per component
 *     key on the row's OWN section — NOT the GET twin's sensitive-section
 *     denylist. Until this batch the accessor documented the disclosure as
 *     intended: every jsonb column of every matched row, verbatim, behind a
 *     section grant — on dd128 that is the dd133 password hash.
 *
 * ANTI-VACUITY. "the hidden value is not in the response" passes trivially on
 * an empty result, and an empty result is exactly what a fresh scratch record
 * gives. Every disclosure assertion here is therefore paired:
 *   - an EXACT expected array (contents AND length), never a `not.toContain`
 *     alone, and
 *   - a positive control proving the hidden record / key EXISTS and IS served
 *     to the identity that holds the grant — otherwise "not disclosed" and
 *     "not there" are indistinguishable.
 * Three identities: the SUPERUSER (-1, level 3 everywhere, record scope
 * bypassed — the projects-ACL positive control), and the two NON-ADMIN readers
 * of `test/helpers/read_door_identity_fixture.ts`, identical except that the
 * READER holds level 0 on test3's `test91` (select) and `test80` (portal)
 * where the CONTROL holds 1 — the component-key contrast, positive half
 * included. The fixture's non-degeneracy is re-asserted here before use.
 *
 * SCRATCH. `test3` / `matrix_test`, section_id band 936000-936999 (tipo prefix
 * `zzraw` for the string values), minted by this file, swept from
 * `matrix_test` AND `matrix_time_machine`, failing loudly on a 0-row delete.
 * Nothing here asserts on a row it did not mint.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { dispatchRqo } from '../../src/core/api/dispatch.ts';
import { readRaw } from '../../src/core/api/handlers/read_raw.ts';
import { encodeForJsonb } from '../../src/core/db/json_codec.ts';
import { MATRIX_JSONB_COLUMNS } from '../../src/core/db/matrix.ts';
import { sql } from '../../src/core/db/postgres.ts';
import {
	getPermissions,
	type Principal,
	resolvePrincipal,
} from '../../src/core/security/permissions.ts';
import { createSession, getSession } from '../../src/core/security/session_store.ts';
import {
	DOOR_CONTROL_USER_ID,
	DOOR_PORTAL,
	DOOR_READER_USER_ID,
	DOOR_SELECT,
	doorProjectLocator,
	installReadDoorIdentityFixture,
	removeReadDoorIdentityFixture,
} from '../helpers/read_door_identity_fixture.ts';
import { refusalOf } from '../helpers/refusal.ts';
import { registerSessionCleanup } from '../helpers/session_cleanup.ts';

registerSessionCleanup();

// --- the scratch surface ----------------------------------------------------

const SECTION = 'test3';
const TABLE = 'matrix_test';
/** component_input_text child of test3 → `string` column; BOTH readers hold 1. */
const TEXT_TIPO = 'test52';
/** component_filter child of test3 — the projects ACL predicate's tipo. */
const FILTER_TIPO = 'test101';
/** component_relation_related — a relation key BOTH readers hold 1 on. */
const GRANTED_RELATION = 'test54';
/** component_portal — a relation key the READER holds 0 on, the CONTROL 1. */
const DENIED_RELATION = DOOR_PORTAL;
/** component_select — a `relation` key the READER holds 0 on, the CONTROL 1. */
const DENIED_COMPONENT = DOOR_SELECT;

const VISIBLE_WITH_VALUE = 936001;
const VISIBLE_WITHOUT_VALUE = 936002;
/** Carries the SECRET value and belongs to a project the readers have NOT. */
const HIDDEN_WITH_SECRET = 936003;
/** No `relation` column at all — the target_section null-relation arm. */
const VISIBLE_NO_RELATION = 936004;
const ALL_IDS = [
	VISIBLE_WITH_VALUE,
	VISIBLE_WITHOUT_VALUE,
	HIDDEN_WITH_SECRET,
	VISIBLE_NO_RELATION,
];

const VALUE_A = 'zzraw value A';
const SECRET = 'zzraw SECRET must never reach the non-admin';
/** A project id the fixture readers are NOT members of. */
const FOREIGN_PROJECT_ID = 936999;
/** The value stored under the READER-denied select key. */
const DENIED_VALUE = { id: 1, type: 'dd151', section_id: 2, section_tipo: 'dd64' };

const BAND_LOW = 936000;
const BAND_HIGH = 936999;

function relatedLocator(id: number, sectionTipo: string, sectionId: number, fromTipo: string) {
	return {
		id,
		type: 'dd63',
		section_id: sectionId,
		section_tipo: sectionTipo,
		from_component_tipo: fromTipo,
	};
}

async function insertScratchRecord(sectionId: number, columns: Record<string, unknown>) {
	if (sectionId < BAND_LOW || sectionId > BAND_HIGH) {
		throw new Error(`read_raw gate: ${sectionId} is outside the assigned scratch band`);
	}
	const names = ['"section_tipo"', '"section_id"'];
	const placeholders = ['$1', '$2'];
	const params: (string | number)[] = [SECTION, sectionId];
	let index = 3;
	for (const [column, value] of Object.entries(columns)) {
		names.push(`"${column}"`);
		placeholders.push(`$${index}::text::jsonb`);
		params.push(encodeForJsonb(value));
		index++;
	}
	await sql.unsafe(
		`INSERT INTO "${TABLE}" (${names.join(', ')}) VALUES (${placeholders.join(', ')})`,
		params,
	);
}

/** Band-confined sweep. `strict` fails loudly when it removes nothing. */
async function sweep(strict: boolean) {
	const removed = (await sql.unsafe(
		`DELETE FROM "${TABLE}" WHERE section_tipo = $1 AND section_id BETWEEN $2 AND $3 RETURNING section_id`,
		[SECTION, BAND_LOW, BAND_HIGH],
	)) as { section_id: number }[];
	await sql.unsafe(
		'DELETE FROM matrix_time_machine WHERE section_tipo = $1 AND section_id BETWEEN $2 AND $3',
		[SECTION, BAND_LOW, BAND_HIGH],
	);
	if (strict && removed.length !== ALL_IDS.length) {
		throw new Error(
			`read_raw gate sweep removed ${removed.length} rows, expected ${ALL_IDS.length} — the scratch filter is wrong or another run deleted them`,
		);
	}
}

/** The SQO every case runs: exactly this gate's four records, in list order. */
function scratchSqo(ids: number[] = ALL_IDS) {
	return {
		section_tipo: [SECTION],
		filter_by_locators: ids.map((sectionId) => ({ section_tipo: SECTION, section_id: sectionId })),
		limit: 50,
	};
}

let superuser: Principal;
let reader: Principal;
let control: Principal;

beforeAll(async () => {
	await installReadDoorIdentityFixture();
	await sweep(false);

	// 936001 — VISIBLE to the readers (their project), carries the component
	// AND two relation keys with target locators plus a DECOY of another
	// section_tipo, AND the reader-denied select key. jsonb orders object keys
	// by (length, bytes), so the relation walk order is test54, test80, test91,
	// test101 — deterministic, and pinned below.
	await insertScratchRecord(VISIBLE_WITH_VALUE, {
		string: { [TEXT_TIPO]: [{ lang: 'lg-eng', value: VALUE_A }] },
		relation: {
			[FILTER_TIPO]: [doorProjectLocator()],
			[GRANTED_RELATION]: [
				relatedLocator(1, SECTION, VISIBLE_WITHOUT_VALUE, GRANTED_RELATION),
				// THE DECOY: a locator of a DIFFERENT section_tipo, in the same
				// component entry. A loosened section_tipo compare harvests it.
				relatedLocator(2, 'test2', 5, GRANTED_RELATION),
			],
			[DENIED_RELATION]: [relatedLocator(1, SECTION, HIDDEN_WITH_SECRET, DENIED_RELATION)],
			[DENIED_COMPONENT]: [DENIED_VALUE],
		},
	});

	// 936002 — VISIBLE, deliberately WITHOUT the component: the null
	// placeholder. Also carries a NON-ARRAY relation entry (the `continue`).
	await insertScratchRecord(VISIBLE_WITHOUT_VALUE, {
		string: { test17: [{ lang: 'lg-eng', value: 'zzraw other component only' }] },
		relation: {
			[FILTER_TIPO]: [doorProjectLocator()],
			test59: { not: 'an array' },
		},
	});

	// 936003 — HIDDEN from the readers (foreign project), carries the SECRET.
	await insertScratchRecord(HIDDEN_WITH_SECRET, {
		string: { [TEXT_TIPO]: [{ lang: 'lg-eng', value: SECRET }] },
		relation: {
			[FILTER_TIPO]: [doorProjectLocator(FOREIGN_PROJECT_ID)],
			[GRANTED_RELATION]: [relatedLocator(1, SECTION, VISIBLE_WITH_VALUE, GRANTED_RELATION)],
		},
	});

	// 936004 — no `relation` column at all (NULL): the target_section skip.
	await insertScratchRecord(VISIBLE_NO_RELATION, {
		string: { [TEXT_TIPO]: [{ lang: 'lg-eng', value: 'zzraw no relation' }] },
	});

	superuser = await resolvePrincipal(-1);
	reader = await resolvePrincipal(DOOR_READER_USER_ID);
	control = await resolvePrincipal(DOOR_CONTROL_USER_ID);
});

afterAll(async () => {
	await sweep(true);
	await removeReadDoorIdentityFixture();
});

describe('readRaw — the identity contrast is non-degenerate', () => {
	test('superuser bypasses everything; both readers are non-admins reading test3 and not test2', async () => {
		expect(superuser.userId).toBe(-1);
		expect(superuser.isGlobalAdmin).toBe(true);
		for (const identity of [reader, control]) {
			expect(identity.isGlobalAdmin).toBe(false);
			expect(await getPermissions(identity, SECTION, SECTION)).toBeGreaterThanOrEqual(1);
			expect(await getPermissions(identity, SECTION, TEXT_TIPO)).toBeGreaterThanOrEqual(1);
			expect(await getPermissions(identity, SECTION, GRANTED_RELATION)).toBeGreaterThanOrEqual(1);
		}
		expect(await getPermissions(reader, 'test2', 'test2')).toBe(0);
		// THE CONTRAST the component leg rides on.
		expect(await getPermissions(reader, SECTION, DENIED_COMPONENT)).toBe(0);
		expect(await getPermissions(control, SECTION, DENIED_COMPONENT)).toBe(1);
		expect(await getPermissions(reader, SECTION, DENIED_RELATION)).toBe(0);
		expect(await getPermissions(control, SECTION, DENIED_RELATION)).toBe(1);
	});
});

describe('readRaw — DISCLOSURE: the projects ACL scopes the raw payload', () => {
	/**
	 * WHAT WOULD LEAK. `readRaw` hands `principal` to `buildSearchSql`; drop it
	 * (or hand `undefined`, the documented "internal search" escape) and the
	 * per-record projects filter is skipped — the RAW STORED VALUE of every
	 * record in the section reaches a caller scoped to one project. The
	 * component arm returns the value itself, so this is content disclosure,
	 * not an existence oracle.
	 */
	test('a non-admin gets ONLY their project rows; the hidden record IS there and IS readable by the superuser', async () => {
		// Positive control FIRST: the hidden record exists and holds the secret.
		const privileged = await readRaw(
			{ sectionTipo: SECTION, tipo: TEXT_TIPO, type: 'component', sqo: scratchSqo() },
			superuser,
		);
		expect(privileged.result).toEqual([
			[{ lang: 'lg-eng', value: VALUE_A }],
			null,
			[{ lang: 'lg-eng', value: SECRET }],
			[{ lang: 'lg-eng', value: 'zzraw no relation' }],
		]);

		// The scoped read: EXACT set, not a `not.toContain`.
		const scoped = await readRaw(
			{ sectionTipo: SECTION, tipo: TEXT_TIPO, type: 'component', sqo: scratchSqo() },
			reader,
		);
		expect(scoped.result).toEqual([[{ lang: 'lg-eng', value: VALUE_A }], null]);
		expect(JSON.stringify(scoped.result)).not.toContain(SECRET);
	});

	/**
	 * WHAT WOULD LEAK. The `section` arm returns EVERY jsonb column of the
	 * matched rows — the whole record. Same ACL, larger blast radius.
	 */
	test('the section arm is scoped too — the hidden row is absent from the full-row dump', async () => {
		const privileged = await readRaw(
			{ sectionTipo: SECTION, tipo: TEXT_TIPO, type: 'section', sqo: scratchSqo() },
			superuser,
		);
		expect((privileged.result as { section_id: number }[]).map((row) => row.section_id)).toEqual(
			ALL_IDS,
		);
		expect(JSON.stringify(privileged.result)).toContain(SECRET);

		const scoped = await readRaw(
			{ sectionTipo: SECTION, tipo: TEXT_TIPO, type: 'section', sqo: scratchSqo() },
			reader,
		);
		expect((scoped.result as { section_id: number }[]).map((row) => row.section_id)).toEqual([
			VISIBLE_WITH_VALUE,
			VISIBLE_WITHOUT_VALUE,
		]);
		expect(JSON.stringify(scoped.result)).not.toContain(SECRET);
	});

	/**
	 * WHAT WOULD LEAK. The `target_section` harvest returns stored locators —
	 * the ADDRESSES of records the caller may not read. Unscoped, it is a
	 * cross-project reference map.
	 */
	test('the target_section harvest is scoped — the hidden row contributes no locator', async () => {
		const privileged = await readRaw(
			{ sectionTipo: SECTION, tipo: SECTION, type: 'target_section', sqo: scratchSqo() },
			superuser,
		);
		// 936003's own test54 locator (→ 936001) is present for the superuser ONLY.
		expect(privileged.result).toContainEqual(
			relatedLocator(1, SECTION, VISIBLE_WITH_VALUE, GRANTED_RELATION),
		);

		// The CONTROL holds every relation key: its harvest is scoped by RECORD only.
		const scoped = await readRaw(
			{ sectionTipo: SECTION, tipo: SECTION, type: 'target_section', sqo: scratchSqo() },
			control,
		);
		expect(scoped.result).toEqual([
			relatedLocator(1, SECTION, VISIBLE_WITHOUT_VALUE, GRANTED_RELATION),
			relatedLocator(1, SECTION, HIDDEN_WITH_SECRET, DENIED_RELATION),
		]);
	});
});

/**
 * THE COMPONENT KEY (P1-3 / SEC-04). Same records, same project, two readers
 * that differ ONLY on `test91` / `test80`. Every case is a PAIR: the reader is
 * refused or narrowed, the control on the identical call is served.
 */
describe('readRaw — DISCLOSURE: the component key holds on every arm', () => {
	test("'component' arm: the ONE typed tipo denied on the primary section is perm.denied — and served to the control", async () => {
		const served = await readRaw(
			{ sectionTipo: SECTION, tipo: DENIED_COMPONENT, type: 'component', sqo: scratchSqo() },
			control,
		);
		expect(served.result).toEqual([[DENIED_VALUE], null]);

		const refusal = await refusalOf(
			readRaw(
				{ sectionTipo: SECTION, tipo: DENIED_COMPONENT, type: 'component', sqo: scratchSqo() },
				reader,
			),
		);
		expect(refusal.code).toBe('perm.denied');
		expect(JSON.stringify(refusal)).not.toContain('"dd64"');
	});

	test("'section' arm: every jsonb column is projected to the keys the caller may read on the row's own section", async () => {
		const served = await readRaw(
			{ sectionTipo: SECTION, tipo: TEXT_TIPO, type: 'section', sqo: scratchSqo() },
			control,
		);
		const servedRow = (served.result as Record<string, unknown>[]).find(
			(row) => row.section_id === VISIBLE_WITH_VALUE,
		) as { relation: Record<string, unknown>; string: Record<string, unknown> };
		// Positive control: the control sees EXACTLY the four relation keys stored.
		expect(Object.keys(servedRow.relation).sort()).toEqual(
			[FILTER_TIPO, GRANTED_RELATION, DENIED_RELATION, DENIED_COMPONENT].sort(),
		);
		expect(servedRow.relation[DENIED_COMPONENT]).toEqual([DENIED_VALUE]);

		const narrowed = await readRaw(
			{ sectionTipo: SECTION, tipo: TEXT_TIPO, type: 'section', sqo: scratchSqo() },
			reader,
		);
		const narrowedRow = (narrowed.result as Record<string, unknown>[]).find(
			(row) => row.section_id === VISIBLE_WITH_VALUE,
		) as { relation: Record<string, unknown>; string: Record<string, unknown> };
		// EXACT key set: the two denied keys are ABSENT, the granted ones present.
		expect(Object.keys(narrowedRow.relation).sort()).toEqual(
			[FILTER_TIPO, GRANTED_RELATION].sort(),
		);
		expect(narrowedRow.string).toEqual({ [TEXT_TIPO]: [{ lang: 'lg-eng', value: VALUE_A }] });
		expect(JSON.stringify(narrowed.result)).not.toContain(DENIED_COMPONENT);
		expect(JSON.stringify(narrowed.result)).not.toContain(DENIED_RELATION);
	});

	test("'target_section' arm: locators under a denied relation key are not harvested", async () => {
		// The control's harvest above already proved test80's locator IS there.
		const narrowed = await readRaw(
			{ sectionTipo: SECTION, tipo: SECTION, type: 'target_section', sqo: scratchSqo() },
			reader,
		);
		expect(narrowed.result).toEqual([
			relatedLocator(1, SECTION, VISIBLE_WITHOUT_VALUE, GRANTED_RELATION),
		]);
	});

	test('an ABSENT principal is an internal read: nothing is projected', async () => {
		const internal = await readRaw({
			sectionTipo: SECTION,
			tipo: TEXT_TIPO,
			type: 'section',
			sqo: scratchSqo([VISIBLE_WITH_VALUE]),
		});
		const row = (internal.result as Record<string, unknown>[])[0] as {
			relation: Record<string, unknown>;
		};
		expect(Object.keys(row.relation).sort()).toEqual(
			[FILTER_TIPO, GRANTED_RELATION, DENIED_RELATION, DENIED_COMPONENT].sort(),
		);
	});
});

describe('readRaw — the component arm', () => {
	/**
	 * A record missing the component pushes NULL, a PLACEHOLDER, not a skip.
	 * `push(column?.[tipo] ?? null)` → `if (v !== undefined) push(v)` and the
	 * value list silently desynchronises from the caller's record list: every
	 * downstream export column shifts by one row and nothing throws. LENGTH is
	 * the anti-vacuity floor.
	 */
	test('the value array is positional: [value, null, value, value]', async () => {
		const outcome = await readRaw(
			{ sectionTipo: SECTION, tipo: TEXT_TIPO, type: 'component', sqo: scratchSqo() },
			superuser,
		);
		expect(outcome.result).toHaveLength(ALL_IDS.length);
		expect(outcome.result[1]).toBeNull();
		expect(outcome.result).toEqual([
			[{ lang: 'lg-eng', value: VALUE_A }],
			null,
			[{ lang: 'lg-eng', value: SECRET }],
			[{ lang: 'lg-eng', value: 'zzraw no relation' }],
		]);
		expect(outcome.table).toBe(TABLE);
	});

	test("'component' is the default type — an absent `type` takes the same arm", async () => {
		const outcome = await readRaw(
			{ sectionTipo: SECTION, tipo: TEXT_TIPO, sqo: scratchSqo() },
			superuser,
		);
		expect(outcome.result).toHaveLength(ALL_IDS.length);
		expect(outcome.result[0]).toEqual([{ lang: 'lg-eng', value: VALUE_A }]);
	});
});

describe('readRaw — the section arm', () => {
	/** A dropped key silently truncates the raw view. */
	test('every MATRIX_JSONB_COLUMNS key is present per row, null when the column is absent', async () => {
		const outcome = await readRaw(
			{ sectionTipo: SECTION, tipo: TEXT_TIPO, type: 'section', sqo: scratchSqo() },
			superuser,
		);
		const rows = outcome.result as Record<string, unknown>[];
		expect(rows).toHaveLength(ALL_IDS.length);
		for (const row of rows) {
			expect(Object.keys(row).sort()).toEqual(
				['section_id', 'section_tipo', ...MATRIX_JSONB_COLUMNS].sort(),
			);
			expect(row.section_tipo).toBe(SECTION);
			expect(typeof row.section_id).toBe('number');
		}
		// The record with NO relation column reports it as null, not missing.
		const noRelation = rows.find((row) => row.section_id === VISIBLE_NO_RELATION);
		expect(noRelation).toBeDefined();
		expect(noRelation?.relation).toBeNull();
		expect(noRelation?.date).toBeNull();
		// …and the one that HAS it reports the stored object.
		const withRelation = rows.find((row) => row.section_id === VISIBLE_WITH_VALUE);
		expect((withRelation?.relation as Record<string, unknown>)?.[DENIED_RELATION]).toBeDefined();
	});
});

describe('readRaw — the target_section arm', () => {
	/**
	 * EXACT length and EXACT ordered contents, WITH the decoy present.
	 * "the result contains only tipo X locators" passes on an empty result.
	 * Loosening the `?.section_tipo === input.tipo` compare makes delete
	 * propagation harvest locators of OTHER sections and unpublish unrelated
	 * records — the decoy (`test2`/5, sitting inside the SAME component entry
	 * as a real match) is that mutation's tripwire.
	 */
	test('collects exactly the requested section_tipo, in row → key → item order, decoy excluded', async () => {
		const outcome = await readRaw(
			{ sectionTipo: SECTION, tipo: SECTION, type: 'target_section', sqo: scratchSqo() },
			superuser,
		);
		expect(outcome.result).toEqual([
			// 936001: jsonb key order is (length, bytes) → test54, test80, test91, test101.
			relatedLocator(1, SECTION, VISIBLE_WITHOUT_VALUE, GRANTED_RELATION), // test54[0]
			// test54[1] is the test2 DECOY and must NOT appear here.
			relatedLocator(1, SECTION, HIDDEN_WITH_SECRET, DENIED_RELATION), // test80[0]
			// test91[0] is a dd64 locator — not this section.
			// 936002: only a non-array entry + the project locator → nothing.
			// 936003:
			relatedLocator(1, SECTION, VISIBLE_WITH_VALUE, GRANTED_RELATION),
			// 936004: relation is NULL → skipped.
		]);
		expect(outcome.result).toHaveLength(3);
		expect(JSON.stringify(outcome.result)).not.toContain('"test2"');
	});

	test('a foreign target tipo harvests the decoy and NOTHING else', async () => {
		const outcome = await readRaw(
			{ sectionTipo: SECTION, tipo: 'test2', type: 'target_section', sqo: scratchSqo() },
			superuser,
		);
		expect(outcome.result).toEqual([relatedLocator(2, 'test2', 5, GRANTED_RELATION)]);
	});
});

describe('readRaw — guards', () => {
	/** The table is still resolved: the caller's `response->table` is not null. */
	test('an undefined sqo returns an empty result WITH the table resolved', async () => {
		const outcome = await readRaw({ sectionTipo: SECTION, tipo: TEXT_TIPO }, superuser);
		expect(outcome.result).toEqual([]);
		expect(outcome.table).toBe(TABLE);
	});

	/**
	 * Dropping the final throw makes an unknown type return an EMPTY RESULT —
	 * a silent wrong answer instead of a loud one, against the project's law
	 * (and indistinguishable, at the client, from "this record has nothing").
	 */
	test('an unknown type THROWS rather than returning an empty result', async () => {
		const refusal = await refusalOf(
			readRaw(
				{ sectionTipo: SECTION, tipo: TEXT_TIPO, type: 'not_a_type', sqo: scratchSqo() },
				superuser,
			),
		);
		expect(refusal.code).toBe('request.invalid_options');
		expect(refusal.message).toMatch(/type 'not_a_type' not implemented/);
	});

	test('an unresolvable model THROWS naming the tipo', async () => {
		const refusal = await refusalOf(
			readRaw(
				{ sectionTipo: SECTION, tipo: 'test999999', type: 'component', sqo: scratchSqo() },
				superuser,
			),
		);
		expect(refusal.code).toBe('request.invalid_tipo');
		expect(refusal.message).toMatch(/cannot resolve model for tipo 'test999999'/);
	});

	test('a model with no jsonb column THROWS naming the model', async () => {
		const refusal = await refusalOf(
			readRaw(
				{
					sectionTipo: SECTION,
					tipo: TEXT_TIPO,
					model: 'diffusion_element',
					type: 'component',
					sqo: scratchSqo(),
				},
				superuser,
			),
		);
		expect(refusal.code).toBe('request.invalid_model');
		expect(refusal.message).toMatch(/cannot resolve data column from model 'diffusion_element'/);
	});
});

/**
 * THE OTHER HALF OF THE SPLIT DOOR. The section-level read permission is NOT
 * in `readRaw` — it is in the `read_raw` handler, which checks level >= 1 on
 * every SQO target section. Drop that loop and any logged-in user can dump the
 * raw jsonb of a section they hold no grant on. The handler also carries the
 * NARROWING NOTICE: a component-key refusal inside readRaw reaches the wire as
 * `notices:[{code:'perm.out_of_scope'}]` beside `ok:true`, never silently.
 */
describe('dd_core_api read_raw — the caller-side permission door', () => {
	function contextFor(userId: number, username: string, principal: Principal) {
		const token = createSession(userId, username, principal.isGlobalAdmin);
		const session = getSession(token);
		return {
			requestId: 'read-raw-gate',
			clientIp: '127.0.0.1',
			session,
			csrfCandidate: session?.csrfToken ?? null,
			principal,
		};
	}

	test('a section the caller cannot read → 403, and no raw content in the body', async () => {
		const result = await dispatchRqo(
			{
				action: 'read_raw',
				dd_api: 'dd_core_api',
				options: { section_tipo: 'test2', tipo: 'test2', type: 'section' },
				sqo: { section_tipo: ['test2'], limit: 5 },
			} as never,
			contextFor(DOOR_READER_USER_ID, 'zzdoor_reader', reader) as never,
		);
		expect(result.status).toBe(403);
		// The denial envelope is `ok:false` — never an array of rows.
		expect((result.body as { ok?: unknown }).ok).toBe(false);
		expect((result.body as { table?: unknown }).table).not.toBeDefined();
	});

	/**
	 * The mandatory POSITIVE CONTROL: a handler that 403s everything (or 500s
	 * into an error envelope) would pass the case above on its own.
	 */
	test('the SAME caller on a section they DO hold read on → 200, scoped to their project, no notice', async () => {
		const result = await dispatchRqo(
			{
				action: 'read_raw',
				dd_api: 'dd_core_api',
				options: { section_tipo: SECTION, tipo: TEXT_TIPO, type: 'component' },
				sqo: scratchSqo(),
			} as never,
			contextFor(DOOR_READER_USER_ID, 'zzdoor_reader', reader) as never,
		);
		expect(result.status).toBe(200);
		const body = result.body as unknown as { data: unknown[]; table: string; notices?: unknown };
		expect(body.table).toBe(TABLE);
		expect(body.data).toEqual([[{ lang: 'lg-eng', value: VALUE_A }], null]);
		expect(JSON.stringify(body.data)).not.toContain(SECRET);
		// Nothing was narrowed by the component key: no notice.
		expect(body.notices).toBeUndefined();
	});

	test('a section dump narrowed by the component key SAYS SO — one perm.out_of_scope notice, and none for the control', async () => {
		const narrowed = await dispatchRqo(
			{
				action: 'read_raw',
				dd_api: 'dd_core_api',
				options: { section_tipo: SECTION, tipo: SECTION, type: 'section' },
				sqo: scratchSqo([VISIBLE_WITH_VALUE]),
			} as never,
			contextFor(DOOR_READER_USER_ID, 'zzdoor_reader', reader) as never,
		);
		expect(narrowed.status).toBe(200);
		const body = narrowed.body as unknown as {
			data: { relation: Record<string, unknown> }[];
			notices?: { code: string; label_key: string; retryable: boolean }[];
		};
		expect(Object.keys(body.data[0]?.relation ?? {}).sort()).toEqual(
			[FILTER_TIPO, GRANTED_RELATION].sort(),
		);
		expect(body.notices).toEqual([
			{ code: 'perm.out_of_scope', label_key: 'error_perm_out_of_scope', retryable: false },
		]);

		const served = await dispatchRqo(
			{
				action: 'read_raw',
				dd_api: 'dd_core_api',
				options: { section_tipo: SECTION, tipo: SECTION, type: 'section' },
				sqo: scratchSqo([VISIBLE_WITH_VALUE]),
			} as never,
			contextFor(DOOR_CONTROL_USER_ID, 'zzdoor_control', control) as never,
		);
		const servedBody = served.body as unknown as {
			data: { relation: Record<string, unknown> }[];
			notices?: unknown;
		};
		expect(Object.keys(servedBody.data[0]?.relation ?? {})).toHaveLength(4);
		expect(servedBody.notices).toBeUndefined();
	});

	test("'component' arm through the door: the denied tipo is a 403 for the reader and 200 for the control", async () => {
		const refused = await dispatchRqo(
			{
				action: 'read_raw',
				dd_api: 'dd_core_api',
				options: { section_tipo: SECTION, tipo: DENIED_COMPONENT, type: 'component' },
				sqo: scratchSqo(),
			} as never,
			contextFor(DOOR_READER_USER_ID, 'zzdoor_reader', reader) as never,
		);
		expect(refused.status).toBe(403);
		expect((refused.body as { error?: { code?: string } }).error?.code).toBe('perm.denied');

		const served = await dispatchRqo(
			{
				action: 'read_raw',
				dd_api: 'dd_core_api',
				options: { section_tipo: SECTION, tipo: DENIED_COMPONENT, type: 'component' },
				sqo: scratchSqo(),
			} as never,
			contextFor(DOOR_CONTROL_USER_ID, 'zzdoor_control', control) as never,
		);
		expect(served.status).toBe(200);
		expect((served.body as unknown as { data: unknown[] }).data).toEqual([[DENIED_VALUE], null]);
	});

	test('missing options.section_tipo / options.tipo → 400 (before any search)', async () => {
		const noSection = await dispatchRqo(
			{ action: 'read_raw', dd_api: 'dd_core_api', options: { tipo: TEXT_TIPO } } as never,
			contextFor(-1, 'root', superuser) as never,
		);
		expect(noSection.status).toBe(400);
		const noTipo = await dispatchRqo(
			{ action: 'read_raw', dd_api: 'dd_core_api', options: { section_tipo: SECTION } } as never,
			contextFor(-1, 'root', superuser) as never,
		);
		expect(noTipo.status).toBe(400);
	});
});
