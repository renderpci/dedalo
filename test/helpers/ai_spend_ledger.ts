/**
 * THE AI SPEND LEDGER, as SUITE STATE — swept, never accumulated.
 *
 * The ledger (`ddengine1`, src/core/security/ai_spend.ts) is DB state on
 * purpose: nothing in-process resets it. In a suite database that means every
 * gate that reaches a metered door (an agent run, a semantic search, a vision
 * call) leaves a charge behind, and repeated runs on the same UTC day would
 * walk a fixture user into its budget — a red that says nothing about the
 * engine. So the ledger is swept: the whole of it at the start of every
 * `bun test` process (test/preload/engine_state.ts), and per user by the gate
 * that measures it (ai_spend_budget_native).
 *
 * Refused, loudly and without writing, on a database without the
 * `dedalo_test_marker` row (`assertTestDatabase`).
 */

import { deleteMatrixRecord } from '../../src/core/db/matrix_write.ts';
import { sql } from '../../src/core/db/postgres.ts';
import { getMatrixTableFromTipo } from '../../src/core/ontology/resolver.ts';
import { AI_SPEND_LEDGER } from '../../src/core/security/ai_spend.ts';
import { assertTestDatabase } from '../../src/core/test_data/test_database_marker.ts';

/**
 * Delete the ledger records of `userIds` (every user when omitted). Answers how
 * many were deleted. A ledger whose ontology is not installed holds nothing.
 */
export async function sweepAiSpendLedger(userIds?: readonly number[]): Promise<number> {
	await assertTestDatabase('sweepAiSpendLedger');
	const table = await getMatrixTableFromTipo(AI_SPEND_LEDGER.section);
	if (table === null) return 0;
	const rows = (await sql.unsafe(
		`SELECT section_id, relation->'${AI_SPEND_LEDGER.user}' AS users FROM "${table}" WHERE section_tipo = $1`,
		[AI_SPEND_LEDGER.section],
	)) as { section_id: number; users: { section_id?: unknown }[] | null }[];
	const wanted = userIds === undefined ? null : new Set(userIds.map(Number));
	let deleted = 0;
	for (const row of rows) {
		const owner = Number(row.users?.[0]?.section_id);
		if (wanted !== null && !wanted.has(owner)) continue;
		deleted += await deleteMatrixRecord(table, AI_SPEND_LEDGER.section, Number(row.section_id));
	}
	return deleted;
}
