/**
 * Native SQL delete propagation seam (DIFFUSION_PLAN P2 "drop the socket
 * hop"; socket plumbing fully retired at the 2026-07-11 cutover — P5 step 3).
 * THE GUARANTEES under test:
 * - with a registered native executor, deleteDiffusionRecord routes sql
 *   targets through it, with the exact engine-wire target shape;
 * - partial confirmation lands split across deleted/pending;
 * - the real executor (targets/mariadb) treats missing table/database as
 *   idempotent success (oracle errno 1146/1049 posture).
 *
 * dd1758 writes are avoided (logActivity=false); the DB is never mutated.
 */

import { afterAll, describe, expect, test } from 'bun:test';
import {
	deleteDiffusionRecord,
	registerNativeDiffusionSqlDelete,
	resetNativeDiffusionSqlDeleteForTests,
} from '../../src/core/diffusion_bridge/diffusion_delete.ts';
import type { NativeSqlDeleteTarget } from '../../src/core/diffusion_bridge/diffusion_delete.ts';
import { getSectionDiffusionTargets } from '../../src/core/diffusion_bridge/diffusion_map.ts';
import { executeSqlDeleteTargets } from '../../src/diffusion/targets/mariadb/delete_record.ts';

afterAll(() => {
	resetNativeDiffusionSqlDeleteForTests();
});

/** Find a real section with ≥1 sql diffusion target (read-only). */
async function findSqlDiffusionSection(): Promise<{
	sectionTipo: string;
	keys: string[];
} | null> {
	// The numisdata_mib domain publishes most numisdata sections; probe a few.
	for (const sectionTipo of ['numisdata4', 'rsc197', 'numisdata3', 'numisdata57']) {
		const targets = await getSectionDiffusionTargets(sectionTipo);
		const keys = targets
			.filter((target) => target.type === 'sql' || target.type === 'socrata')
			.map((target) => `${target.database_name}|${target.table_name}`);
		if (keys.length > 0) return { sectionTipo, keys };
	}
	return null;
}

// Fixture detection at COLLECTION time (top-level await) so a missing fixture
// gates the tests via test.if → reported SKIP, never a silent fake PASS (the
// old `if (found === null) return` pattern). Read-only probe.
const found = await findSqlDiffusionSection().catch(() => null);
if (found === null) {
	console.warn('no sql diffusion section in this install — seam tests SKIPPED');
}
/** Fixture-gated test: SKIP (visibly) when no sql diffusion section exists. */
const testIfSection = test.if(found !== null);

describe('native diffusion sql delete (registration seam)', () => {
	testIfSection(
		'registered executor receives the engine-wire targets; outcome splits by confirmation',
		async () => {
			// Deeper check stays loud: the gate above guarantees found, but a
			// regression in the gating itself must throw, not quietly pass.
			if (found === null) throw new Error('gated test ran without a fixture');
			const seen: NativeSqlDeleteTarget[][] = [];
			registerNativeDiffusionSqlDelete(async (targets) => {
				seen.push(targets);
				// Confirm all but the first target — exercises the pending split.
				return {
					deleted: targets.slice(1).map((t) => `${t.database_name}|${t.table_name}`),
					errors: [],
				};
			});

			const outcome = await deleteDiffusionRecord(found.sectionTipo, 999999901, false);

			expect(seen.length).toBe(1);
			const call = seen[0] ?? [];
			expect(call.length).toBe(found.keys.length);
			for (const target of call) {
				expect(typeof target.database_name).toBe('string');
				expect(typeof target.table_name).toBe('string');
				expect(target.section_ids).toEqual([999999901]);
				expect(target.section_tipo).toBe(found.sectionTipo);
			}
			expect(outcome.pending).toContain(found.keys[0] ?? '');
			for (const key of found.keys.slice(1)) {
				expect(outcome.deleted).toContain(key);
			}
		},
	);

	// (The 'explicit socketPath forces the legacy engine path' test retired at
	// the 2026-07-11 cutover with the socket plumbing itself.)

	test('real executor: missing table and missing database are idempotent successes', async () => {
		const result = await executeSqlDeleteTargets([
			{
				database_name: 'web_numisdata_mib',
				table_name: 'dedalo_ts_never_created_table',
				section_ids: [1],
			},
			{
				database_name: 'dedalo_ts_no_such_db',
				table_name: 'whatever',
				section_ids: [1],
			},
		]);
		expect(result.deleted).toEqual([
			'web_numisdata_mib|dedalo_ts_never_created_table',
			'dedalo_ts_no_such_db|whatever',
		]);
		expect(result.errors).toEqual([]);
	});

	test('real executor drops the publication markers of confirmed targets (S2-31)', async () => {
		// Seed a marker in a temp store; the errno-tolerated no-op delete must
		// still unpublish it (record gone ⇒ marker gone), exactly like the old
		// engine's delete_handler apply_table_state call.
		const { promises: fs } = await import('node:fs');
		const { tmpdir } = await import('node:os');
		const { join } = await import('node:path');
		const { applyTableState, overrideMediaIndexBaseForTests } = await import(
			'../../src/diffusion/targets/mediastore/media_index.ts'
		);
		const base = await fs.mkdtemp(join(tmpdir(), 'dedalo_ts_media_index_'));
		overrideMediaIndexBaseForTests(base);
		try {
			await applyTableState(
				'web_numisdata_mib',
				'zz_marker_probe_missing_table',
				'rsc167',
				[90001],
				[],
			);
			const marker = join(base, 'pub/rsc167_90001');
			expect(
				await fs.access(marker).then(
					() => true,
					() => false,
				),
			).toBe(true);

			const result = await executeSqlDeleteTargets([
				{
					database_name: 'web_numisdata_mib',
					// NON-scratch name (the store's dedalo_ts_* guard would no-op the
					// marker apply); still missing in MariaDB → errno-1146 tolerated,
					// so the real database is never touched.
					table_name: 'zz_marker_probe_missing_table',
					section_ids: [90001],
					section_tipo: 'rsc167',
				},
			]);
			expect(result.deleted).toEqual(['web_numisdata_mib|zz_marker_probe_missing_table']);
			expect(
				await fs.access(marker).then(
					() => true,
					() => false,
				),
			).toBe(false);
			expect(
				await fs
					.access(join(base, 'dbs/web_numisdata_mib/zz_marker_probe_missing_table/rsc167_90001'))
					.then(
						() => true,
						() => false,
					),
			).toBe(false);
		} finally {
			overrideMediaIndexBaseForTests(null);
			await fs.rm(base, { recursive: true, force: true });
		}
	});
});
