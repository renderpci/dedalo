/**
 * Children-exist delete refusal (PHP sections::delete :535-593): a
 * delete_record on a record that still has children (computed inverse over
 * the paired component_relation_parent) is SKIPPED — never an orphaned
 * subtree — unless the caller passes options.delete_with_children.
 *
 * ENVELOPE v2 (engineering/ERRORS_SPEC.md §3): the skip is a NON-FATAL CODED
 * FACT on a SUCCESS — `notices:[{code:'record.delete_children_refused',
 * details:{not_deleted}}]` — because what WAS deleted really was deleted and
 * stays the payload. `record.delete_children_refused` is the code the parity
 * reconciler maps the frozen PHP body to (test/parity/normalize.ts).
 *
 * Fixture: the disposable test3 section (matrix_test) — test201 is its
 * component_relation_children, paired to test71 (component_relation_parent).
 * Scratch-write hygiene: every record created here is deleted, TM rows swept.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { dispatchRqo } from '../../src/core/api/dispatch.ts';
import type { Rqo } from '../../src/core/concepts/rqo.ts';
import { sql } from '../../src/core/db/postgres.ts';
import { getChildrenTipo } from '../../src/core/relations/children.ts';
import { resolvePrincipal } from '../../src/core/security/permissions.ts';
import { createSession, getSession } from '../../src/core/security/session_store.ts';
import { registerSessionCleanup } from '../helpers/session_cleanup.ts';
import { cleanScratchRecord } from '../helpers/test_data.ts';

registerSessionCleanup();

const SECTION = 'test3';
const TABLE = 'matrix_test';
const PARENT_COMPONENT = 'test71'; // component_relation_parent of test3

let dbReady = false;
let parentId = 0;
let childId = 0;

interface DeleteBody {
	ok?: boolean;
	data?: unknown;
	notices?: { code: string; details?: Record<string, unknown> }[];
}

async function dispatchDelete(
	sectionId: number,
	deleteMode: 'delete_record' | 'delete_data',
	deleteWithChildren = false,
): Promise<DeleteBody> {
	const token = createSession(-1, 'root', true);
	const session = getSession(token);
	const principal = await resolvePrincipal(-1);
	const context = {
		requestId: 'del_guard_test',
		clientIp: '127.0.0.1',
		session,
		csrfCandidate: session?.csrfToken ?? null,
		principal,
	};
	const rqo = {
		action: 'delete',
		dd_api: 'dd_core_api',
		prevent_lock: true,
		options: deleteWithChildren ? { delete_with_children: true } : {},
		source: {
			section_tipo: SECTION,
			tipo: SECTION,
			section_id: sectionId,
			delete_mode: deleteMode,
		},
	} as unknown as Rqo;
	const dispatched = await dispatchRqo(rqo, context);
	return dispatched.body as DeleteBody;
}

async function rowExists(sectionId: number): Promise<boolean> {
	const rows = (await sql.unsafe(
		`SELECT 1 FROM ${TABLE} WHERE section_tipo = $1 AND section_id = $2`,
		[SECTION, sectionId],
	)) as unknown[];
	return rows.length > 0;
}

beforeAll(async () => {
	try {
		await sql`SELECT 1`;
		dbReady = true;
	} catch {
		dbReady = false;
		return;
	}
	const { createSectionRecord } = await import('../../src/core/section/record/create_record.ts');
	parentId = await createSectionRecord(SECTION, -1);
	childId = await createSectionRecord(SECTION, -1);
	// Stamp the child's dd47 parent locator exactly as the parent-save engine
	// stores it (verified against live matrix rows: STRING section_id).
	const locator = {
		id: 1,
		type: 'dd47',
		section_id: String(parentId),
		section_tipo: SECTION,
		from_component_tipo: PARENT_COMPONENT,
	};
	// ::text::jsonb — the Bun.sql jsonb string-param bind trap (write-path law).
	await sql.unsafe(
		`UPDATE ${TABLE}
		 SET relation = COALESCE(relation, '{}'::jsonb) || jsonb_build_object($1::text, $2::text::jsonb)
		 WHERE section_tipo = $3 AND section_id = $4`,
		[PARENT_COMPONENT, JSON.stringify([locator]), SECTION, childId],
	);
});

afterAll(async () => {
	if (!dbReady) return;
	// Belt-and-braces cleanup: rows (if a phase failed) + TM audit rows.
	for (const id of [childId, parentId]) {
		if (id > 0) {
			await cleanScratchRecord(SECTION, id);
		}
	}
});

describe('children-exist delete refusal (PHP sections::delete :535-593)', () => {
	test('fixture floor: test3 declares a component_relation_children; flat test2 does not', async () => {
		if (!dbReady) return;
		expect(await getChildrenTipo(SECTION)).toBe('test201');
		expect(await getChildrenTipo('test2')).toBeNull();
	});

	test('delete_record on a parent WITH children is refused: row stays, coded notice', async () => {
		if (!dbReady) return;
		const body = await dispatchDelete(parentId, 'delete_record');
		expect(body.ok).toBe(true); // what was deleted (nothing) is still the payload
		expect(body.data).toEqual([]);
		expect(body.notices?.length).toBe(1);
		expect(body.notices?.[0]?.code).toBe('record.delete_children_refused');
		// The refused id is the code's ONE declared detail (scalar, so ids are joined).
		expect(body.notices?.[0]?.details?.not_deleted).toBe(String(parentId));
		expect(await rowExists(parentId)).toBe(true);
	});

	test('delete_data mode is NOT gated (children present, data still emptied)', async () => {
		if (!dbReady) return;
		const body = await dispatchDelete(parentId, 'delete_data');
		expect(body.notices).toBeUndefined();
		expect((body.data as string[]).length).toBeGreaterThan(0);
		expect(await rowExists(parentId)).toBe(true); // delete_data keeps the row
	});

	test('delete_with_children bypasses the guard (caller accepts the orphaning)', async () => {
		if (!dbReady) return;
		const body = await dispatchDelete(parentId, 'delete_record', true);
		expect(body.notices).toBeUndefined();
		// int-canonical delete result ids (WC-2026-08-10-section-id-int-canonical)
		expect(body.data).toEqual([parentId]);
		expect(await rowExists(parentId)).toBe(false);
	});

	test('a childless record deletes normally through the same path', async () => {
		if (!dbReady) return;
		const body = await dispatchDelete(childId, 'delete_record');
		expect(body.notices).toBeUndefined();
		// int-canonical delete result ids (WC-2026-08-10-section-id-int-canonical)
		expect(body.data).toEqual([childId]);
		expect(await rowExists(childId)).toBe(false);
	});
});
