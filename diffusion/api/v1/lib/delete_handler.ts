/**
 * DELETE_HANDLER
 * Executes delete propagation requests coming from PHP
 * (diffusion_delete::delete_record) when a work-system record
 * is deleted and its published copies must be removed from the
 * target diffusion databases.
 *
 * PHP resolves the targets (database/table names) from the
 * diffusion ontology; this module only executes the deletions,
 * reusing the same pools and SQL generation as the publish path.
 */

import { get_pool }          from './db';
import { generate_delete }   from './sql_generator';
import { apply_table_state } from './media_index';
import type { delete_target, delete_record_response } from './types';



/**
 * VALIDATE_DELETE_TARGETS
 * Manual validation of the request targets (no zod in this project).
 * Returns an error message or null when valid.
 */
export function validate_delete_targets(targets: unknown): string | null {

	if (!Array.isArray(targets) || targets.length === 0) {
		return 'Missing or empty targets array';
	}

	// DIFFTS-06: validate identifiers against the same strict charset the media-index
	// entry points enforce, so every engine entry point rejects odd db/table names
	// uniformly (defence-in-depth against any future non-escaped interpolation).
	const NAME_REGEX = /^[A-Za-z0-9_.-]+$/;

	for (const target of targets) {
		if (typeof target !== 'object' || target === null) {
			return 'Invalid target: not an object';
		}
		const t = target as Partial<delete_target>;
		if (typeof t.database_name !== 'string' || !NAME_REGEX.test(t.database_name)) {
			return 'Invalid target: missing or malformed database_name';
		}
		if (typeof t.table_name !== 'string' || !NAME_REGEX.test(t.table_name)) {
			return 'Invalid target: missing or malformed table_name';
		}
		if (!Array.isArray(t.section_ids) || t.section_ids.length === 0) {
			return `Invalid target: missing section_ids for table "${t.table_name}"`;
		}
		for (const id of t.section_ids) {
			if (typeof id !== 'string' && typeof id !== 'number') {
				return `Invalid target: bad section_id for table "${t.table_name}"`;
			}
		}
		// section_tipo is optional (older PHP clients omit it) but must be a
		// non-empty string when present: it drives media publication markers.
		if (t.section_tipo !== undefined && (typeof t.section_tipo !== 'string' || t.section_tipo.length === 0)) {
			return `Invalid target: bad section_tipo for table "${t.table_name}"`;
		}
	}

	return null;
}



/**
 * DELETE_RECORDS
 * Deletes the given section_ids from each target database.table.
 * Missing table (errno 1146) or missing database (errno 1049) are
 * tolerated as no-op success — nothing published there, nothing to
 * delete (mirrors insert_table_data deletion semantics in db.ts).
 *
 * One failed target does not abort the others: errors are collected
 * per target so PHP can mark the matching diffusion element as
 * pending and retry later.
 *
 * @param targets - Resolved delete targets from PHP
 * @returns delete_record_response with per-target affected counts
 */
export async function delete_records(targets: delete_target[]): Promise<delete_record_response> {

	const deleted: delete_record_response['deleted'] = [];
	const errors:  string[] = [];

	for (const target of targets) {

		try {
			const pool       = get_pool(target.database_name);
			const connection = await pool.getConnection();

			try {
				await connection.beginTransaction();

				const del_stmt = generate_delete(target.table_name, target.section_ids);
				const [result] = await connection.execute(del_stmt.sql, del_stmt.params) as any;

				await connection.commit();

				deleted.push({
					database_name: target.database_name,
					table_name:    target.table_name,
					affected:      result.affectedRows ?? 0,
				});

			} catch (err: any) {
				await connection.rollback();

				// Tolerate missing table (1146) and missing database (1049):
				// the record was never published there, so the delete is a no-op success.
				if (err.errno === 1146 || err.errno === 1049) {
					console.warn(`[delete_record] Target missing (errno ${err.errno}): ${target.database_name}.${target.table_name} — treated as no-op`);
					deleted.push({
						database_name: target.database_name,
						table_name:    target.table_name,
						affected:      0,
					});
				} else {
					throw err;
				}
			} finally {
				connection.release();
			}

			// Media publication markers: the rows are gone (or were never
			// there), so drop the matching markers. Optional field for
			// back-compat with older PHP clients; marker failures never
			// fail the delete itself.
			if (target.section_tipo) {
				try {
					await apply_table_state(
						target.database_name,
						target.table_name,
						target.section_tipo,
						[],
						target.section_ids
					);
				} catch (marker_error: unknown) {
					console.error(`[delete_record] Media marker removal failed for ${target.database_name}.${target.table_name}:`, marker_error);
				}
			}

		} catch (error: unknown) {
			const err_msg = error instanceof Error ? error.message : String(error);
			console.error(`[delete_record] Error deleting from ${target.database_name}.${target.table_name}:`, error);
			errors.push(`${target.database_name}.${target.table_name}: ${err_msg}`);
		}
	}

	return {
		result: errors.length === 0,
		msg:    errors.length === 0
			? `OK. Deleted from ${deleted.length} target(s)`
			: `Partial failure. ${errors.length} target(s) failed`,
		deleted,
		errors: errors.length > 0 ? errors : undefined,
	};
}
