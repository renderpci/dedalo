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

/** Execute delete propagation against the MariaDB targets directly. */
export async function executeSqlDeleteTargets(
	targets: SqlDeleteTarget[],
): Promise<SqlDeleteResult> {
	const result: SqlDeleteResult = { deleted: [], errors: [] };
	for (const target of targets) {
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
				// Never published there — idempotent success (oracle errno 1146/1049).
				confirmed = true;
			} else {
				result.errors.push(`${key}: ${error instanceof Error ? error.message : String(error)}`);
			}
		}
		if (!confirmed) continue;
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
	return result;
}
