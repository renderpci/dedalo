/**
 * pruneMatrixIndexes executor (db_assets.ts) against the real DB, dry-run.
 *
 * The pure classification is gated by matrix_index_policy.test.ts; THIS gate
 * exercises the executor's DB wiring — introspection, the single-tipo probe,
 * and the classify→action mapping — WITHOUT dropping anything (dryRun), so it
 * never mutates the shared test schema. It is the mechanism the Database-info
 * widget's "Optimize tables" action runs on the active database (WC-046).
 */

import { describe, expect, test } from 'bun:test';
import { pruneMatrixIndexes } from '../../src/core/db/db_assets.ts';
import { policyForTable } from '../../src/core/db/matrix_index_policy.ts';

describe('pruneMatrixIndexes executor (dry-run)', () => {
	test('a non-governed table returns null (nothing to prune)', async () => {
		expect(await pruneMatrixIndexes('matrix_ontology', { dryRun: true })).toBeNull();
	});

	test('matrix_activity: keeps every load-bearing index; only ever drops policy "drop" indexes', async () => {
		const report = await pruneMatrixIndexes('matrix_activity', { dryRun: true });
		expect(report).not.toBeNull();
		if (report === null) return;
		const policy = policyForTable('matrix_activity');
		expect(policy).toBeDefined();
		// Every dropped index must map to a policy entry that is NOT 'keep'.
		const keepReasons = new Set(
			(policy?.entries ?? []).filter((e) => e.disposition === 'keep').map((e) => e.reason),
		);
		for (const dropped of report.dropped) {
			expect(keepReasons.has(dropped.reason)).toBe(false);
		}
		// The required load-bearing indexes are counted as kept, never dropped.
		expect(report.kept).toBeGreaterThanOrEqual((policy?.requiredSignatures ?? []).length);
		const droppedNames = report.dropped.map((d) => d.name);
		expect(droppedNames.some((n) => /section_tipo_section_id_desc/.test(n))).toBe(false);
	}, 30000);

	test('matrix_time_machine (multi-tipo): governed, returns a report', async () => {
		const report = await pruneMatrixIndexes('matrix_time_machine', { dryRun: true });
		expect(report).not.toBeNull();
		if (report === null) return;
		// PK + record-history scope are load-bearing → at least the required count kept.
		expect(report.kept).toBeGreaterThanOrEqual(2);
	}, 30000);
});
