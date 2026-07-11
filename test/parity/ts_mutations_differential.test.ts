/**
 * dd_ts_api mutation differential (plan A6): mutate on TS, read the post-state,
 * revert. Covers the cycle-rejection envelope (byte-equal msg + errors:['cycle'])
 * and an add_child round-trip (dd64/1 is_descriptor default + dd47 parent locator,
 * then delete to revert).
 *
 * DESTRUCTIVE: add_child creates a real record and deletes it again. Guarded by
 * hasPhpCredentials so it no-ops without live PHP+DB. The orchestrator owns the
 * fuller sweep (move renumber, ontology TLD inheritance, save_order dd_ontology
 * sync); this pins the highest-value invariants.
 */

import { beforeAll, describe, expect, test } from 'bun:test';
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

describe.if(hasPhpCredentials())('dd_ts_api.update_parent_data — cycle rejection', () => {
	test('self-target is rejected with the VERBATIM msg + errors:["cycle"]', async () => {
		if (!hasPhpCredentials()) return;
		const body = await ts({
			dd_api: 'dd_ts_api',
			action: 'update_parent_data',
			prevent_lock: true,
			source: {
				section_tipo: 'tchi1',
				section_id: 602,
				old_parent_section_tipo: 'tchi1',
				old_parent_section_id: 620,
				new_parent_section_tipo: 'tchi1',
				new_parent_section_id: 602, // moving under itself
			},
		});
		expect(body.result).toBe(false);
		expect(body.errors).toEqual(['cycle']);
		expect(body.msg).toBe(
			'Error. The node cannot be moved under itself or under its own descendant',
		);
	});
});

describe.if(hasPhpCredentials())(
	'dd_ts_api.add_child — defaults + parent link, then revert',
	() => {
		test('creates a child with dd64/1 is_descriptor and a dd47 parent locator', async () => {
			if (!hasPhpCredentials()) return;
			const created = await ts({
				dd_api: 'dd_ts_api',
				action: 'add_child',
				prevent_lock: true,
				source: PARENT,
			});
			const newId = created.result as number;
			try {
				// Asserted INSIDE the try so a failure still reverts the created record.
				expect(created.errors).toEqual([]);
				expect(typeof newId).toBe('number');
				expect(newId).toBeGreaterThan(0);

				// read back the new record's raw matrix row.
				const record = await readMatrixRecord('matrix', 'tchi1', newId);
				expect(record).not.toBeNull();
				const relation = (record?.columns.relation ?? {}) as Record<string, unknown[]>;
				// parent link: a dd47 locator pointing at the parent node.
				const parentTipo = Object.keys(relation).find((tipo) =>
					(relation[tipo] as { type?: string }[])?.some((item) => item.type === 'dd47'),
				);
				expect(parentTipo).toBeDefined();
				const parentLocator = (
					relation[parentTipo as string] as {
						type?: string;
						section_id?: string;
						section_tipo?: string;
					}[]
				).find((item) => item.type === 'dd47');
				expect(parentLocator?.section_tipo).toBe('tchi1');
				expect(String(parentLocator?.section_id)).toBe('620');
				// is_descriptor default (dd64/1) exists somewhere in the relation bag.
				const hasDescriptorDefault = Object.values(relation).some((items) =>
					(items as { section_tipo?: string; section_id?: string }[])?.some(
						(item) => item.section_tipo === 'dd64' && String(item.section_id) === '1',
					),
				);
				expect(hasDescriptorDefault).toBe(true);
			} finally {
				// revert: delete the created record (only if create returned an id).
				if (typeof newId === 'number' && newId > 0) {
					await ts({
						dd_api: 'dd_core_api',
						action: 'delete',
						prevent_lock: true,
						source: { section_tipo: 'tchi1', section_id: newId, delete_mode: 'delete_record' },
					});
				}
			}
		});
	},
);
