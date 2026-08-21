/**
 * Children-exist delete refusal DIFFERENTIAL (PHP sections::delete :535-593):
 * both engines must SKIP a delete_record on a thesaurus parent that still has
 * a child — row intact, result excludes the parent — and both must delete it
 * once the child is gone.
 *
 * DESTRUCTIVE (scratch-twin hygiene): each engine creates its own parent +
 * child under a scratch hierarchy term via dd_ts_api.add_child (the
 * ts_mutations_differential pattern), asserts the refusal, then reverts child
 * → parent (both childless deletes) in finally. TM rows swept afterAll.
 * The refusal path `continue`s BEFORE section_record::delete, so the pinned
 * PHP live-delete crash (delete_multi_differential header) never fires here.
 */
// GENERIC-TLD MIGRATED 2026-08-20 (WC-2026-08-19-test-tld-replay).
// The section is the cloned immovable-heritage thesaurus (`testimmovable1`)
// and the scratch parent is the committed corpus record the clone kept at the
// same id, materialized by `ensureTestCorpus` — so the situation is BUILT, not
// borrowed from whatever install the database happens to hold. This gate is
// FIXTURE-EXEMPT (its PHP round-trips are real mutations, so it runs only
// against a LIVE oracle, which the cutover decommissioned): the corpus is
// materialized under exactly that condition and never on a fixtures replay.

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { config } from '../../src/config/config.ts';
import { dispatchRqo } from '../../src/core/api/dispatch.ts';
import type { Rqo } from '../../src/core/concepts/rqo.ts';
import { sql } from '../../src/core/db/postgres.ts';
import { getMatrixTableFromTipo } from '../../src/core/ontology/resolver.ts';
import { resolvePrincipal } from '../../src/core/security/permissions.ts';
import { createSession, getSession } from '../../src/core/security/session_store.ts';
import { dropTestCorpus, ensureTestCorpus } from '../../src/core/test_data/test_corpus/ensure.ts';
import { registerSessionCleanup } from '../helpers/session_cleanup.ts';
import { hasLivePhpOracle, PhpApiClient } from './php_client.ts';

registerSessionCleanup();

/** The cloned immovable-heritage thesaurus, and the corpus term this gate hangs its scratch subtree under. */
const SECTION = 'testimmovable1';
const SCRATCH_PARENT = { section_tipo: SECTION, section_id: 620 };
const createdIds: number[] = [];

async function tsCall(body: Record<string, unknown>): Promise<Record<string, unknown>> {
	const token = createSession(-1, 'root', true);
	const session = getSession(token);
	const principal = await resolvePrincipal(-1);
	const context = {
		requestId: 'del_guard_diff',
		clientIp: '127.0.0.1',
		session,
		csrfCandidate: session?.csrfToken ?? null,
		principal,
	};
	const dispatched = await dispatchRqo({ prevent_lock: true, ...body } as unknown as Rqo, context);
	return dispatched.body as Record<string, unknown>;
}

// The section's matrix table is RESOLVED from the ontology, never hardcoded:
// every `test`-TLD section writes to `matrix_test`, and a hardcode here would
// silently read the wrong table the day that changes.
async function rowExists(sectionId: number): Promise<boolean> {
	const table = (await getMatrixTableFromTipo(SECTION)) as string;
	const rows = (await sql.unsafe(
		`SELECT 1 FROM ${table} WHERE section_tipo = $1 AND section_id = $2`,
		[SECTION, sectionId],
	)) as unknown[];
	return rows.length > 0;
}

function deleteRqo(sectionId: number): Record<string, unknown> {
	return {
		action: 'delete',
		dd_api: 'dd_core_api',
		source: {
			section_tipo: SECTION,
			tipo: SECTION,
			section_id: sectionId,
			delete_mode: 'delete_record',
		},
	};
}

function addChildRqo(parentId: number): Record<string, unknown> {
	return {
		action: 'add_child',
		dd_api: 'dd_ts_api',
		source: { section_tipo: SECTION, section_id: parentId },
	};
}

beforeAll(async () => {
	// Fixture-exempt gate: the corpus is only needed (and only written) when a
	// LIVE oracle makes the tests run at all.
	if (!hasLivePhpOracle()) return;
	await ensureTestCorpus([SECTION]);
});

afterAll(async () => {
	if (!hasLivePhpOracle()) return;
	const table = (await getMatrixTableFromTipo(SECTION)) as string;
	for (const id of createdIds) {
		// Belt-and-braces: remove any leftover rows + the TM audit trail.
		await sql.unsafe(`DELETE FROM ${table} WHERE section_tipo = $1 AND section_id = $2`, [
			SECTION,
			id,
		]);
		await sql`DELETE FROM matrix_time_machine WHERE section_tipo = ${SECTION} AND section_id = ${id}`;
	}
	expect(await dropTestCorpus([SECTION])).toBe(0);
});

describe.if(hasLivePhpOracle())('children-exist delete refusal differential', () => {
	test('TS engine: parent with child is refused; childless deletes succeed', async () => {
		if (!hasLivePhpOracle()) return;
		const parentRes = await tsCall(addChildRqo(SCRATCH_PARENT.section_id));
		const parentId = Number(parentRes.data);
		expect(parentId).toBeGreaterThan(0);
		createdIds.push(parentId);
		const childRes = await tsCall(addChildRqo(parentId));
		const childId = Number(childRes.data);
		expect(childId).toBeGreaterThan(0);
		createdIds.push(childId);
		try {
			const refused = await tsCall(deleteRqo(parentId));
			// Envelope v2: the deleted set is the payload and the skip is a CODED
			// notice (`record.delete_children_refused`, details.not_deleted) — the
			// v2 twin of the PHP-era `errors` prose line
			// (WC-2026-08-16-error-envelope-compat-removal).
			expect(refused.data).toEqual([]);
			const notices = refused.notices as { code: string; details?: { not_deleted?: string } }[];
			expect(notices[0]?.code).toBe('record.delete_children_refused');
			expect(String(notices[0]?.details?.not_deleted).split(',')).toContain(String(parentId));
			expect(await rowExists(parentId)).toBe(true);
		} finally {
			await tsCall(deleteRqo(childId));
			await tsCall(deleteRqo(parentId));
		}
		expect(await rowExists(childId)).toBe(false);
		expect(await rowExists(parentId)).toBe(false);
	});

	test('PHP oracle: the same shape refuses the parent while the child exists', async () => {
		if (!hasLivePhpOracle()) return;
		const client = new PhpApiClient();
		await client.login(
			config.phpReference.username as string,
			config.phpReference.password as string,
		);
		const { body: parentRes } = await client.call(addChildRqo(SCRATCH_PARENT.section_id));
		const parentId = Number((parentRes as { result: unknown }).result);
		expect(parentId).toBeGreaterThan(0);
		createdIds.push(parentId);
		const { body: childRes } = await client.call(addChildRqo(parentId));
		const childId = Number((childRes as { result: unknown }).result);
		expect(childId).toBeGreaterThan(0);
		createdIds.push(childId);
		try {
			const { body: refused } = await client.call(deleteRqo(parentId));
			// PHP skips the record: result excludes the parent, the row survives.
			const deleted = (refused as { result: unknown }).result;
			expect(Array.isArray(deleted) ? deleted : []).not.toContain(String(parentId));
			expect(await rowExists(parentId)).toBe(true);
		} finally {
			await client.call(deleteRqo(childId));
			await client.call(deleteRqo(parentId));
		}
		expect(await rowExists(childId)).toBe(false);
		expect(await rowExists(parentId)).toBe(false);
	});
});
