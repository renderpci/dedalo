/**
 * move_data_between_matrix_tables (move_to_table) executor — relocate a
 * section's rows from one matrix table to another (UPDATE_PROCESS Phase 5).
 * PHP INSERT…SELECT (id omitted) + DELETE per tipo, one transaction each.
 * Re-expressed against the SPLIT columns (MATRIX_COPY_COLUMNS) instead of the
 * PHP legacy `datos` (WC-025 functional port).
 */

import { MATRIX_TABLE_ALLOWLIST } from '../../db/matrix.ts';
import { MATRIX_COPY_COLUMNS } from '../../db/matrix_write.ts';
import { sql, withTransaction } from '../../db/postgres.ts';
import type { TableMoveItem } from './definitions.ts';
import type { TransformRecorder } from './report.ts';

const TIPO_RE = /^[a-z]+[0-9]+$/;

/**
 * Validate ONE definition item; returns the message to record, or null when the
 * item may run. Identifier gate: `source_section` must be a tipo and both table
 * names must be allowlist members (they are interpolated into raw SQL).
 *
 * D4 (FIXED 2026-08-09) — `source_table === target_table` is now REFUSED before
 * any SQL runs. The self-move issued `INSERT INTO t SELECT … FROM t WHERE
 * section_tipo = $1` followed by `DELETE FROM t WHERE section_tipo = $1`, so on
 * `matrix_activity_diffusion` — the ONE allowlisted table with no
 * UNIQUE (section_id, section_tipo) — the section was duplicated and then BOTH
 * copies deleted inside a COMMITTED transaction, with `errors: []` and a report
 * claiming a clean move. These transforms write no Time Machine trail, so the
 * loss was unrecoverable short of a database backup. On the other 22 tables the
 * unique index turned the same item into a raw PostgresError that escaped the
 * executor and silently dropped every remaining item of the definition file.
 */
function validateTableMoveItem(item: TableMoveItem): string | null {
	const sectionTipo = item.source_section;
	const source = item.source_table;
	const target = item.target_table;
	if (
		!TIPO_RE.test(sectionTipo ?? '') ||
		!MATRIX_TABLE_ALLOWLIST.includes(source) ||
		!MATRIX_TABLE_ALLOWLIST.includes(target)
	) {
		return `move_to_table: invalid item ${sectionTipo} ${source}→${target}`;
	}
	if (source === target) {
		return `move_to_table: refused self-move ${sectionTipo} ${source}→${target} (source and target table are the same)`;
	}
	return null;
}

export async function executeMoveToTable(
	rawItems: unknown,
	recorder: TransformRecorder,
): Promise<void> {
	const items = Array.isArray(rawItems) ? (rawItems as TableMoveItem[]) : [];
	const columns = MATRIX_COPY_COLUMNS.map((column: string) => `"${column}"`).join(',');

	for (const item of items) {
		const sectionTipo = item.source_section;
		const source = item.source_table;
		const target = item.target_table;
		const invalid = validateTableMoveItem(item);
		if (invalid !== null) {
			recorder.error(invalid);
			continue;
		}

		const countRows = (await sql.unsafe(
			`SELECT count(*)::int AS count FROM "${source}" WHERE section_tipo = $1`,
			[sectionTipo],
		)) as { count: number }[];
		const count = countRows[0]?.count ?? 0;
		if (count === 0) continue;

		if (recorder.dryRun) {
			recorder.record({
				op: 'insert',
				table: target,
				target: sectionTipo,
				detail: `${count} rows from ${source}`,
			});
			recorder.record({
				op: 'delete',
				table: source,
				target: sectionTipo,
				detail: `${count} rows`,
			});
			continue;
		}

		await withTransaction(async () => {
			await sql.unsafe(
				`INSERT INTO "${target}" (${columns}) SELECT ${columns} FROM "${source}" WHERE section_tipo = $1`,
				[sectionTipo],
			);
			await sql.unsafe(`DELETE FROM "${source}" WHERE section_tipo = $1`, [sectionTipo]);
		});
		recorder.record({
			op: 'insert',
			table: target,
			target: sectionTipo,
			detail: `${count} rows from ${source}`,
		});
		recorder.record({ op: 'delete', table: source, target: sectionTipo, detail: `${count} rows` });
	}
}
