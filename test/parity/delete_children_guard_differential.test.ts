/**
 * Children-exist delete refusal DIFFERENTIAL (PHP sections::delete :535-593):
 * both engines must SKIP a delete_record on a thesaurus parent that still has
 * a child — row intact, result excludes the parent — and both must delete it
 * once the child is gone.
 *
 * DESTRUCTIVE (scratch-twin hygiene): each engine creates its own parent +
 * child under the tchi1/620 scratch hierarchy via dd_ts_api.add_child (the
 * ts_mutations_differential pattern), asserts the refusal, then reverts child
 * → parent (both childless deletes) in finally. TM rows swept afterAll.
 * The refusal path `continue`s BEFORE section_record::delete, so the pinned
 * PHP live-delete crash (delete_multi_differential header) never fires here.
 */

import { afterAll, describe, expect, test } from 'bun:test';
import { config } from '../../src/config/config.ts';
import { dispatchRqo } from '../../src/core/api/dispatch.ts';
import type { Rqo } from '../../src/core/concepts/rqo.ts';
import { sql } from '../../src/core/db/postgres.ts';
import { resolvePrincipal } from '../../src/core/security/permissions.ts';
import { createSession, getSession } from '../../src/core/security/session_store.ts';
import { registerSessionCleanup } from '../helpers/session_cleanup.ts';
import { PhpApiClient, hasLivePhpOracle } from './php_client.ts';

registerSessionCleanup();

const SECTION = 'tchi1';
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

// tchi1 lives on the generic `matrix` table (ts_mutations_differential reads
// it via readMatrixRecord('matrix', 'tchi1', …)).
async function rowExists(sectionId: number): Promise<boolean> {
	const rows = (await sql`
		SELECT 1 FROM matrix WHERE section_tipo = ${SECTION} AND section_id = ${sectionId}
	`) as unknown[];
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

afterAll(async () => {
	if (!hasLivePhpOracle()) return;
	for (const id of createdIds) {
		// Belt-and-braces: remove any leftover rows + the TM audit trail.
		await sql`DELETE FROM matrix WHERE section_tipo = ${SECTION} AND section_id = ${id}`;
		await sql`DELETE FROM matrix_time_machine WHERE section_tipo = ${SECTION} AND section_id = ${id}`;
	}
});

describe.if(hasLivePhpOracle())('children-exist delete refusal differential', () => {
	test('TS engine: parent with child is refused; childless deletes succeed', async () => {
		if (!hasLivePhpOracle()) return;
		const parentRes = await tsCall(addChildRqo(SCRATCH_PARENT.section_id));
		const parentId = Number(parentRes.result);
		expect(parentId).toBeGreaterThan(0);
		createdIds.push(parentId);
		const childRes = await tsCall(addChildRqo(parentId));
		const childId = Number(childRes.result);
		expect(childId).toBeGreaterThan(0);
		createdIds.push(childId);
		try {
			const refused = await tsCall(deleteRqo(parentId));
			expect(refused.result).toEqual([]);
			expect((refused.errors as string[])[0]).toContain(`has children : ${parentId}`);
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
