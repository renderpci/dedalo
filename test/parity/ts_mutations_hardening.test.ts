/**
 * Tree-mutation hardening (plan Phase 4): the concurrency + atomicity guarantees
 * that the Workstream-0 transaction/advisory-lock primitives exist to provide,
 * exercised end-to-end through the public dd_ts_api surface.
 *
 *  1. CONCURRENCY: two add_child calls racing on the SAME parent must each get a
 *     distinct section_id AND a distinct sibling order. Sibling order is
 *     allocated as "descriptor-count + 1" while holding the parent node lock, so
 *     without the lock both racers would read the same count and collide on the
 *     order. This asserts they don't.
 *  2. ATOMICITY: add_child either fully lands (record + dd47 parent locator) or
 *     leaves nothing — there is no orphan record without a parent link. (The
 *     rollback mechanism itself is proven in with_transaction.test.ts; here we
 *     confirm the tree mutation composes its writes inside one transaction.)
 *
 * DESTRUCTIVE: creates real child records and deletes them in a finally block.
 * Guarded by hasPhpCredentials so it no-ops without live DB.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { dispatchRqo } from '../../src/core/api/dispatch.ts';
import { readMatrixRecord } from '../../src/core/db/matrix.ts';
import { resolvePrincipal } from '../../src/core/security/permissions.ts';
import { createSession, getSession } from '../../src/core/security/session_store.ts';
import { hasPhpCredentials } from './php_client.ts';

const PARENT = { section_tipo: 'tchi1', section_id: 620 };

let tsContext: Parameters<typeof dispatchRqo>[1];

async function ts(rqo: Record<string, unknown>) {
	return (await dispatchRqo(structuredClone(rqo) as never, tsContext)).body;
}

async function addChild(): Promise<number> {
	const body = await ts({
		dd_api: 'dd_ts_api',
		action: 'add_child',
		prevent_lock: true,
		source: PARENT,
	});
	expect(body.errors).toEqual([]);
	return body.result as number;
}

async function deleteRecord(sectionId: number): Promise<void> {
	await ts({
		dd_api: 'dd_core_api',
		action: 'delete',
		prevent_lock: true,
		source: { section_tipo: 'tchi1', section_id: sectionId, delete_mode: 'delete_record' },
	});
}

/** Read a node's sibling order under PARENT via the tree's own get_children_data. */
async function childrenOrders(): Promise<Map<number, number | string | null>> {
	const body = await ts({
		dd_api: 'dd_ts_api',
		action: 'get_children_data',
		prevent_lock: true,
		source: { ...PARENT, children_tipo: 'tchi40', area_model: 'area_thesaurus' },
	});
	const rows = ((body.result as { ar_children_data?: unknown[] })?.ar_children_data ?? []) as {
		section_id: number | string;
		order: number | string | null;
	}[];
	const map = new Map<number, number | string | null>();
	for (const row of rows) {
		map.set(Number(row.section_id), row.order);
	}
	return map;
}

beforeAll(async () => {
	if (!hasPhpCredentials()) return;
	const token = createSession(-1, 'root', true);
	const session = getSession(token);
	const principal = await resolvePrincipal(-1);
	tsContext = {
		requestId: 't',
		clientIp: '127.0.0.1',
		session,
		csrfCandidate: session?.csrfToken ?? null,
		principal,
	} as never;
}, 60000);

describe.if(hasPhpCredentials())('dd_ts_api mutation hardening', () => {
	const created: number[] = [];
	afterAll(async () => {
		for (const id of created) {
			try {
				await deleteRecord(id);
			} catch {
				/* best-effort cleanup */
			}
		}
	});

	test('two concurrent add_child get distinct ids and distinct sibling orders', async () => {
		if (!hasPhpCredentials()) return;
		// Fire both adds concurrently — they contend on the parent node lock.
		const [idA, idB] = await Promise.all([addChild(), addChild()]);
		created.push(idA, idB);

		expect(typeof idA).toBe('number');
		expect(typeof idB).toBe('number');
		expect(idA).not.toBe(idB); // distinct records (counter never reused an id)

		// Both must carry a dd47 parent locator at the parent (no orphan).
		for (const id of [idA, idB]) {
			const record = await readMatrixRecord('matrix', 'tchi1', id);
			expect(record).not.toBeNull();
			const relation = (record?.columns.relation ?? {}) as Record<string, { type?: string }[]>;
			const hasParentLink = Object.values(relation).some((items) =>
				items?.some((item) => item.type === 'dd47'),
			);
			expect(hasParentLink).toBe(true);
		}

		// Distinct sibling orders — the lock made the "count + 1" allocations serial.
		const orders = await childrenOrders();
		const orderA = orders.get(idA);
		const orderB = orders.get(idB);
		expect(orderA).not.toBeNull();
		expect(orderB).not.toBeNull();
		expect(orderA).not.toBe(orderB);
	});
});
