/**
 * Native SQL delete propagation (DIFFUSION_SPEC §4.2 "deletes stay
 * in-process"; old engine lib/delete_handler.ts semantics).
 *
 * Replaces the socket hop to the external engine's delete_record action:
 * per-target transactional DELETE with the oracle's tolerances — a missing
 * table (errno 1146) or missing/denied database (1049/1044) is an idempotent
 * no-op success (the record was never published there), and one target's
 * failure never aborts the rest (per-target isolation).
 *
 * Registered into core's diffusion_delete hook at boot (see
 * registerNativeDiffusionSqlDelete) — core never imports this module
 * statically (D1 boundary rule).
 *
 * Media publication markers: NATIVE since the S2-31 media_index port — each
 * confirmed target (deleted or errno-tolerated no-op) also drops its
 * .publication/ markers via applyTableState, exactly like the old engine's
 * delete_handler.ts:129-141. Marker failures are logged and never fail the
 * delete (fail-closed: a missing marker only hides a published record until
 * the next publish/reconcile/rebuild).
 */

import {
	sqlTargetLockKey,
	withDeleteDoorLock,
} from '../../../core/diffusion_bridge/target_lock.ts';
import { escapeSqlIdentifier } from '../../plan/identifier.ts';
import { applyTableState } from '../mediastore/media_index.ts';
import { getTargetPool, isMissingDatabaseError, isMissingTableError } from './db.ts';

export interface SqlDeleteTarget {
	database_name: string;
	table_name: string;
	section_ids: (number | string)[];
	section_tipo?: string;
}

export interface SqlDeleteResult {
	/** `${database_name}|${table_name}` keys confirmed deleted (or no-op'd). */
	deleted: string[];
	errors: string[];
}

/**
 * Execute delete propagation against the MariaDB targets directly — each
 * DATABASE under the publication-target lock as a DELETE-ONLY door
 * (core/diffusion_bridge/target_lock.ts withDeleteDoorLock: the same lock a
 * publication run's batch holds, taken SHARED — concurrent deletes on one
 * database never exclude each other), databases in sorted order. A database an
 * EXCLUSIVE writer holds is NOT touched: its targets go to `errors`, so the
 * dd1758 row stays pending and the next retry occasion (a run start, the
 * widget, the API — all patient drains) unpublishes it (residual R3). On the
 * request path a held database is given up at once; inside
 * withPatientDeleteWait held databases are waited for until the scope's one
 * budget is spent.
 */
export async function executeSqlDeleteTargets(
	targets: SqlDeleteTarget[],
): Promise<SqlDeleteResult> {
	const result: SqlDeleteResult = { deleted: [], errors: [] };
	const byDatabase = new Map<string, SqlDeleteTarget[]>();
	for (const target of targets) {
		const group = byDatabase.get(target.database_name) ?? [];
		group.push(target);
		byDatabase.set(target.database_name, group);
	}
	for (const database of [...byDatabase.keys()].sort()) {
		const group = byDatabase.get(database) as SqlDeleteTarget[];
		// SHARED: another unpublisher on this database is no reason to leave this
		// row pending — only an exclusive writer (a runner's unit, the lang sweep,
		// the media rebuild) is.
		const fenced = await withDeleteDoorLock(sqlTargetLockKey(database), async () => {
			for (const target of group) await deleteOneTarget(target, result);
		});
		if (!fenced.acquired) {
			for (const target of group) {
				result.errors.push(
					`${target.database_name}|${target.table_name}: publication target busy (another writer holds it) — the unpublish stays pending for the retry queue`,
				);
			}
		}
	}
	return result;
}

/** One target's DELETE + marker drop (per-target isolation: failures land in `result.errors`). */
async function deleteOneTarget(target: SqlDeleteTarget, result: SqlDeleteResult): Promise<void> {
	const key = `${target.database_name}|${target.table_name}`;
	let confirmed = false;
	try {
		const pool = getTargetPool(target.database_name);
		const placeholders = target.section_ids.map(() => '?').join(', ');
		await pool.unsafe(
			`DELETE FROM ${escapeSqlIdentifier(target.table_name)} WHERE section_id IN (${placeholders})`,
			// Oracle posture: section ids bind as strings.
			target.section_ids.map((id) => String(id)),
		);
		confirmed = true;
	} catch (error) {
		if (isMissingTableError(error) || isMissingDatabaseError(error)) {
			// Idempotent success (oracle errno 1146/1049): nothing published there.
			// Since DIFF-A put the delete target names through the SAME identifier
			// chokepoint as publish, a missing table can no longer be a
			// case/sanitize MISMATCH masquerading as "unpublished" (the bug that
			// left records live while dd1758 logged success and retry never fired).
			// It is now genuinely never-created — but LOG it (was silent), so an
			// unexpected drop still surfaces instead of reading as a clean unpublish.
			console.warn(
				`[diffusion delete] ${key}: target absent (errno 1146/1049) — treating unpublish as idempotent success`,
			);
			confirmed = true;
		} else {
			result.errors.push(`${key}: ${error instanceof Error ? error.message : String(error)}`);
		}
	}
	if (!confirmed) return;
	result.deleted.push(key);

	// S2-31: drop the publication markers for the unpublished ids (oracle
	// delete_handler.ts:129-141 — after the row DELETE, never failing it).
	if (target.section_tipo !== undefined && target.section_tipo !== '') {
		try {
			await applyTableState(
				target.database_name,
				target.table_name,
				target.section_tipo,
				[],
				target.section_ids,
			);
		} catch (error) {
			console.error(
				`[media_index] marker removal failed for ${key} (delete succeeded; markers heal on next reconcile/rebuild):`,
				error,
			);
		}
	}
}
