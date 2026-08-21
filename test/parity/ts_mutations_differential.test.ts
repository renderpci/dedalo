/**
 * dd_ts_api mutation differential (plan A6): mutate on TS, read the post-state,
 * revert. Covers the cycle-rejection envelope (envelope v2: ok:false +
 * error.code 'tree.cycle' — the registry twin of the PHP-era errors:['cycle'])
 * and an add_child round-trip (dd64/1 is_descriptor default + dd47 parent locator,
 * then delete to revert).
 *
 * DESTRUCTIVE: add_child creates a real record and deletes it again. Guarded by
 * hasPhpCredentials so it no-ops without live PHP+DB. The orchestrator owns the
 * fuller sweep (move renumber, ontology TLD inheritance, save_order dd_ontology
 * sync); this pins the highest-value invariants.
 */
// GENERIC-TLD MIGRATED 2026-08-19 (WC-2026-08-19-test-tld-replay). The tchi
// thesaurus is gone: the gate BUILDS its situation from the committed test
// corpus (`testimmovable1`, the `testimmovable` thesaurus TLD — the clone of
// the old tchi1 fixture, src/core/test_data/test_tld_tipo_map.json) and its
// hierarchy registry row, then tears it down. No frozen fixture is involved
// (this gate is in NO_ORACLE_GATES): every record it asserts on is one it wrote.

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { dispatchRqo } from '../../src/core/api/dispatch.ts';
import { readMatrixRecord } from '../../src/core/db/matrix.ts';
import { resolvePrincipal } from '../../src/core/security/permissions.ts';
import { createSession, getSession } from '../../src/core/security/session_store.ts';
import { dropTestCorpus, ensureTestCorpus } from '../../src/core/test_data/test_corpus/ensure.ts';
import { hasPhpCredentials } from './php_client.ts';

/**
 * The situation: the `testimmovable` thesaurus (terms section `testimmovable1`,
 * children component `testimmovable1038`, parent component `testimmovable1037`).
 * `ensureTestCorpus` materializes its records AND the `hierarchy1` registry row
 * (`testHierarchyRegistry` — never a hand-written insert), whose root term is
 * the section's lowest id, `testimmovable1/3`. That root IS the parent every
 * mutation here hangs a child off.
 */
const SECTION = 'testimmovable1';
const PARENT = { section_tipo: SECTION, section_id: 3 };
/** A node BELOW the root — the mover in the cycle case. */
const CHILD_NODE_ID = 602;

let tsContext: Parameters<typeof dispatchRqo>[1];

async function ts(rqo: Record<string, unknown>) {
	return (await dispatchRqo(structuredClone(rqo) as never, tsContext)).body;
}

beforeAll(async () => {
	await ensureTestCorpus([SECTION]);
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

afterAll(async () => {
	expect(await dropTestCorpus([SECTION])).toBe(0);
});

describe.if(hasPhpCredentials())('dd_ts_api.update_parent_data — cycle rejection', () => {
	test('self-target is rejected with error.code tree.cycle (envelope v2)', async () => {
		if (!hasPhpCredentials()) return;
		const body = await ts({
			dd_api: 'dd_ts_api',
			action: 'update_parent_data',
			prevent_lock: true,
			source: {
				section_tipo: SECTION,
				section_id: CHILD_NODE_ID,
				old_parent_section_tipo: PARENT.section_tipo,
				old_parent_section_id: PARENT.section_id,
				new_parent_section_tipo: SECTION,
				new_parent_section_id: CHILD_NODE_ID, // moving under itself
			},
		});
		// The PHP-era refusal (`result:false` + `errors:['cycle']` + a verbatim
		// Spanish/English msg) is restated in envelope v2: the CODE is the wire
		// fact, the prose is label-driven and no longer a contract
		// (registry.ts LEGACY token map: cycle → tree.cycle).
		expect(body.ok).toBe(false);
		expect((body.error as { code: string }).code).toBe('tree.cycle');
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
			const newId = created.data as number;
			try {
				// Asserted INSIDE the try so a failure still reverts the created record.
				expect(created.ok).toBe(true);
				// No non-fatal findings ⇒ dd_ts_api emits NO `errors` extension key
				// (handlers/dd_ts_api.ts tsApiResult: an empty set emits nothing).
				expect(created.errors).toBeUndefined();
				expect(typeof newId).toBe('number');
				expect(newId).toBeGreaterThan(0);

				// read back the new record's raw matrix row.
				const record = await readMatrixRecord('matrix_test', SECTION, newId);
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
				expect(parentLocator?.section_tipo).toBe(PARENT.section_tipo);
				expect(String(parentLocator?.section_id)).toBe(String(PARENT.section_id));
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
						source: { section_tipo: SECTION, section_id: newId, delete_mode: 'delete_record' },
					});
				}
			}
		});
	},
);
