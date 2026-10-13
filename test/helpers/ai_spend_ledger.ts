/**
 * THE AI SPEND LEDGER AND LIMITS, as SUITE STATE — swept and restored, never
 * accumulated.
 *
 * The ledger (`dd660`, src/core/security/ai_spend.ts) is DB state on purpose:
 * nothing in-process resets it. In a suite database that means every gate that
 * reaches a metered door (an agent run, a semantic search, a vision call)
 * leaves a charge behind, and repeated runs on the same UTC day would walk a
 * fixture user into its limit — a red that says nothing about the engine. So
 * the ledger is swept: the whole of it at the start of every `bun test`
 * process (test/preload/engine_state.ts), and per user by the gate that
 * measures it (ai_spend_budget_native).
 *
 * The LIMITS are user / profile data (dd692-695 on dd128, dd696-699 on dd234):
 * a gate that needs a metered door to admit sets them on the records it spends
 * as (`setAiSpendLimits`) and puts the previous values back after
 * (`restoreAiSpendLimits`) — an unset limit is 0, which refuses.
 *
 * Every writer here is refused, loudly and without writing, on a database
 * without the `dedalo_test_marker` row (`assertTestDatabase`).
 */

import { deleteMatrixRecord } from '../../src/core/db/matrix_write.ts';
import { sql } from '../../src/core/db/postgres.ts';
import { getMatrixTableFromTipo } from '../../src/core/ontology/resolver.ts';
import {
	persistRecordKeys,
	type SavePathItem,
} from '../../src/core/section_record/record_write.ts';
import {
	AI_SPEND_LEDGER,
	AI_SPEND_LIMITS,
	type AiSpendKind,
} from '../../src/core/security/ai_spend.ts';
import { assertTestDatabase } from '../../src/core/test_data/test_database_marker.ts';
import { sweepActivityRows } from './activity_rows.ts';

const KINDS: readonly AiSpendKind[] = ['runs', 'tokens', 'embeds', 'vision'];

/**
 * Delete the ledger records of `userIds` (every user when omitted) AND the
 * 'Created section record' activity rows their births left. Answers how many
 * ledger records were deleted. A ledger whose ontology is not installed holds
 * nothing.
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
	const deletedIds: number[] = [];
	for (const row of rows) {
		const owner = Number(row.users?.[0]?.section_id);
		if (wanted !== null && !wanted.has(owner)) continue;
		const sectionId = Number(row.section_id);
		if ((await deleteMatrixRecord(table, AI_SPEND_LEDGER.section, sectionId)) > 0) {
			deletedIds.push(sectionId);
		}
	}
	// The suite's ledger is test residue only: a full sweep clears every birth
	// row of the section; a per-user sweep only the records it deleted.
	await sweepActivityRows(AI_SPEND_LEDGER.section, wanted === null ? undefined : deletedIds);
	return deletedIds.length;
}

/**
 * A limit to write per kind: a number (0 included) sets it, `null` EMPTIES it
 * (inherit). A STRING is written as the item's raw value — the malformed /
 * blank shapes the fail-closed legs need (an import or a direct edit can store
 * them; the number widget cannot).
 */
export type AiSpendLimitValues = Partial<Record<AiSpendKind, number | string | null>>;

/**
 * AMPLE limits for a gate whose SUBJECT is not the budget (the doors are metered
 * and an unset limit is 0): enough for any one gate's spend, never "unlimited" —
 * the budget law itself is ai_spend_budget_native's.
 */
export const AMPLE_AI_SPEND_LIMITS: Readonly<Record<AiSpendKind, number>> = Object.freeze({
	runs: 1000,
	tokens: 100_000_000,
	embeds: 1000,
	vision: 1000,
});

/** Which record: a user (dd128) or a profile (dd234). */
export type AiSpendLimitTarget = { userId: number } | { profileId: number };

/** What `setAiSpendLimits` overwrote — hand it to `restoreAiSpendLimits`. */
export interface AiSpendLimitSnapshot {
	target: AiSpendLimitTarget;
	previous: Partial<Record<AiSpendKind, unknown>>;
	/** The record's `number` column was NULL (restored as NULL, not as `{}`). */
	numberWasNull: boolean;
}

function levelOf(target: AiSpendLimitTarget) {
	return 'userId' in target
		? { level: AI_SPEND_LIMITS.user, sectionId: target.userId }
		: { level: AI_SPEND_LIMITS.profile, sectionId: target.profileId };
}

async function writeLimitKeys(
	target: AiSpendLimitTarget,
	values: Partial<Record<AiSpendKind, unknown>>,
): Promise<void> {
	const { level, sectionId } = levelOf(target);
	const table = await getMatrixTableFromTipo(level.section);
	if (table === null) throw new Error(`setAiSpendLimits: section '${level.section}' has no table`);
	const savePath: SavePathItem[] = [];
	for (const kind of KINDS) {
		if (!(kind in values)) continue;
		savePath.push({ column: 'number', key: level[kind], value: values[kind] ?? null });
	}
	if (savePath.length === 0) return;
	await persistRecordKeys(
		{ table, sectionTipo: level.section, sectionId },
		savePath,
		// No modified-audit stamp: a gate's limit edit must leave the record as it found it.
		false,
		{ actor: -1 },
	);
}

/**
 * Set (or empty, with `null`) the AI limits of one user or profile record.
 * Answers the snapshot of what was there before.
 */
export async function setAiSpendLimits(
	target: AiSpendLimitTarget,
	values: AiSpendLimitValues,
): Promise<AiSpendLimitSnapshot> {
	await assertTestDatabase('setAiSpendLimits');
	const { level, sectionId } = levelOf(target);
	const table = await getMatrixTableFromTipo(level.section);
	if (table === null) throw new Error(`setAiSpendLimits: section '${level.section}' has no table`);
	const rows = (await sql.unsafe(
		`SELECT number FROM "${table}" WHERE section_tipo = $1 AND section_id = $2`,
		[level.section, sectionId],
	)) as { number: Record<string, unknown> | null }[];
	if (rows.length === 0) {
		throw new Error(`setAiSpendLimits: no ${level.section} record ${sectionId}`);
	}
	const previous: Partial<Record<AiSpendKind, unknown>> = {};
	const next: Partial<Record<AiSpendKind, unknown>> = {};
	for (const kind of KINDS) {
		if (!(kind in values)) continue;
		previous[kind] = rows[0]?.number?.[level[kind]] ?? null;
		const value = values[kind];
		next[kind] = value === null || value === undefined ? null : [{ id: 1, value }];
	}
	await writeLimitKeys(target, next);
	return { target, previous, numberWasNull: rows[0]?.number === null };
}

/** Put back what `setAiSpendLimits` overwrote (a record deleted since is skipped). */
export async function restoreAiSpendLimits(
	snapshots: readonly AiSpendLimitSnapshot[],
): Promise<void> {
	await assertTestDatabase('restoreAiSpendLimits');
	for (const snapshot of [...snapshots].reverse()) {
		const { level, sectionId } = levelOf(snapshot.target);
		const table = await getMatrixTableFromTipo(level.section);
		if (table === null) continue;
		const exists = (await sql.unsafe(
			`SELECT 1 FROM "${table}" WHERE section_tipo = $1 AND section_id = $2`,
			[level.section, sectionId],
		)) as unknown[];
		if (exists.length === 0) continue;
		await writeLimitKeys(snapshot.target, snapshot.previous);
		if (snapshot.numberWasNull) {
			await sql.unsafe(
				`UPDATE "${table}" SET number = NULL WHERE section_tipo = $1 AND section_id = $2 AND number = '{}'::jsonb`,
				[level.section, sectionId],
			);
		}
	}
}
