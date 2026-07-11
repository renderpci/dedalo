/**
 * Selection — keyset-batched record cursor + batched matrix reads
 * (DIFFUSION_SPEC §4.1 stage C, DIFFUSION_PLAN D3-P1).
 *
 * Records are selected through the SAME assembler every other read uses
 * (buildSearchSql over the sanitized SQO — spec §8.4), then paginated by
 * KEYSET (WHERE section_id > cursor ORDER BY section_id LIMIT batch): never
 * OFFSET, so a resumed run re-selects exactly the remaining slice and a batch
 * boundary is a durable checkpoint (the section_id cursor in the job row).
 *
 * readMatrixRecords is the batched twin of core readMatrixRecord (one IN
 * query per batch, spec §4.1 "retire per-record loops") — it lives HERE, not
 * in core/db, because bulk publication reads are a diffusion concern; the
 * projection and allowlist gates are identical to the core reader.
 */

import type { Sqo } from '../../core/concepts/sqo.ts';
import { MATRIX_JSONB_COLUMNS, assertMatrixTable } from '../../core/db/matrix.ts';
import type { MatrixRecord } from '../../core/db/matrix.ts';
import { sql } from '../../core/db/postgres.ts';
import { buildSearchSql } from '../../core/search/sql_assembler.ts';
import type { Principal } from '../../core/security/permissions.ts';

/**
 * Read MANY records of one section by id — one IN query (`= ANY($::int[])`).
 * Returns records ordered by section_id ASC (deterministic batches); missing
 * ids are simply absent from the result.
 */
export async function readMatrixRecords(
	tableName: string,
	sectionTipo: string,
	sectionIds: (number | string)[],
): Promise<MatrixRecord[]> {
	if (sectionIds.length === 0) return [];
	assertMatrixTable(tableName);

	// Numeric-only id list: matrix section ids are integers; a non-numeric id
	// here is a data error worth failing loud on (never silently skipped).
	const numericIds = sectionIds.map((id) => {
		const numeric = Number(id);
		if (!Number.isInteger(numeric)) {
			throw new Error(`readMatrixRecords: non-integer section_id '${String(id)}'`);
		}
		return numeric;
	});

	const jsonbProjection = MATRIX_JSONB_COLUMNS.map(
		(column) => `"${column}", "${column}"::text AS "${column}__text"`,
	).join(', ');

	const rows = (await sql.unsafe(
		`SELECT id, section_id, section_tipo, ${jsonbProjection}
		 FROM "${tableName}"
		 WHERE section_tipo = $1 AND section_id = ANY($2::int[])
		 ORDER BY section_id ASC`,
		[sectionTipo, `{${numericIds.join(',')}}`],
	)) as Record<string, unknown>[];

	return rows.map((row) => {
		const columns: MatrixRecord['columns'] = {};
		const rawText: MatrixRecord['rawText'] = {};
		for (const column of MATRIX_JSONB_COLUMNS) {
			columns[column] = row[column];
			rawText[column] = row[`${column}__text`] as string | null;
		}
		return {
			id: row.id as number,
			section_id: row.section_id as number,
			section_tipo: row.section_tipo as string,
			columns,
			rawText,
		};
	});
}

/** One keyset batch: the selected ids plus the cursor to resume AFTER them. */
export interface RecordIdBatch {
	sectionIds: number[];
	/** Highest section_id of the batch — the durable checkpoint value. */
	cursor: number;
}

/**
 * Keyset-batched id cursor over one section's selection.
 *
 * The caller's SQO decides WHICH records qualify (filter tree,
 * filter_by_locators, principal-independent — the job spec stores the already
 * sanitized SQO); this generator owns ONLY the pagination: the base query is
 * wrapped as a subselect and windowed by
 * `section_id > $cursor ORDER BY section_id LIMIT $batch`. Any limit/offset/
 * order on the SQO itself is stripped — keyset pagination replaces them.
 */
export async function* selectRecordBatches(
	sqo: Sqo,
	sectionTipo: string,
	batchSize: number,
	afterSectionId = 0,
	principal?: Principal,
): AsyncGenerator<RecordIdBatch> {
	if (!Number.isInteger(batchSize) || batchSize <= 0) {
		throw new Error(`selectRecordBatches: invalid batch size ${batchSize}`);
	}

	// Pagination belongs to the cursor, selection to the SQO (see module doc).
	const selectionSqo: Sqo = {
		...sqo,
		section_tipo: sectionTipo,
		limit: null,
		offset: null,
		order: false,
	};
	// DIFF-01: when the enqueuing principal is a non-admin, apply their per-record
	// projects filter so a section-wide diffuse publishes ONLY the caller's
	// in-scope records (never records outside their tenant). Global admins /
	// unresolved system owners select unscoped, exactly as before.
	const base = await buildSearchSql(selectionSqo, principal ? { principal } : {});
	// The assembler terminates its statement — a subselect must not.
	const baseSql = base.sql.trim().replace(/;$/, '');

	let cursor = afterSectionId;
	for (;;) {
		const cursorParam = base.params.length + 1;
		const limitParam = base.params.length + 2;
		const rows = (await sql.unsafe(
			`SELECT section_id
			 FROM (${baseSql}) diffusion_selection
			 WHERE section_id > $${cursorParam}
			 ORDER BY section_id ASC
			 LIMIT $${limitParam}`,
			[...base.params, cursor, batchSize],
		)) as { section_id: number }[];

		if (rows.length === 0) return;

		const sectionIds = rows.map((row) => Number(row.section_id));
		cursor = sectionIds[sectionIds.length - 1] as number;
		yield { sectionIds, cursor };

		if (rows.length < batchSize) return;
	}
}
