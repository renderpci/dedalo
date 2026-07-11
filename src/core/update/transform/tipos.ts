/**
 * changes_in_tipos (move_tld) executor — bulk rename an ontology tipo/TLD
 * across every matrix table (UPDATE_PROCESS Phase 5).
 *
 * SCHEMA NOTE (WC-025): PHP transform_data::changes_in_tipos targets the
 * LEGACY monolithic `datos` column; the live schema is split typed columns
 * (data/relation/string/…). This TS port re-expresses the SAME operation
 * against the current schema — a FUNCTIONAL port, not a byte translation
 * (the PHP oracle runs against a dead schema, so there is no byte oracle;
 * precedent: diffusion's functional-parity bar). The embedded-locator rewrite
 * uses PHP's OWN string-level approach (`replace_tm_data`: `"old"` → `"new"`)
 * generalized across the jsonb columns — schema-agnostic and faithful.
 */

import { MATRIX_JSONB_COLUMNS, MATRIX_TABLE_ALLOWLIST } from '../../db/matrix.ts';
import { sql } from '../../db/postgres.ts';
import type { TipoMoveItem } from './definitions.ts';
import type { TransformRecorder } from './report.ts';
import { scalarCount } from './sql_util.ts';

const TIPO_RE = /^[a-z]+[0-9]+$/;

/** Tables that carry section_tipo + jsonb columns to rewrite (counter/TM handled apart). */
function rewritableTables(): string[] {
	return MATRIX_TABLE_ALLOWLIST.filter(
		(table) => table !== 'matrix_counter' && table !== 'matrix_counter_dd',
	);
}

/**
 * Apply one move_tld definition file. Each item is `{old,new,type,perform}`;
 * `type:'section'` entries drive the section_tipo column rename, all entries
 * drive the embedded-tipo string rewrite (component tipos live inside
 * locators/keys). Counter rows for a renamed tipo are DROPPED (PHP parity —
 * a matching `new` counter is expected to be rebuilt).
 */
export async function executeChangesInTipos(
	rawItems: unknown,
	recorder: TransformRecorder,
): Promise<void> {
	const items = Array.isArray(rawItems) ? (rawItems as TipoMoveItem[]) : [];
	const map = items.filter((item) => TIPO_RE.test(item.old ?? '') && TIPO_RE.test(item.new ?? ''));
	if (map.length !== items.length) {
		recorder.error('some map entries have an unsafe old/new tipo — skipped');
	}

	const tables = rewritableTables();
	for (const entry of map) {
		const { old: oldTipo, new: newTipo, type } = entry;

		// 1. section_tipo column rename (section-type entries only)
		if (type === 'section') {
			for (const table of tables) {
				if (recorder.dryRun) {
					const count = await scalarCount(
						`SELECT count(*)::int AS count FROM "${table}" WHERE section_tipo = $1`,
						[oldTipo],
					);
					if (count > 0) {
						recorder.record({
							op: 'update',
							table,
							target: oldTipo,
							detail: `section_tipo→${newTipo} (${count} rows)`,
						});
					}
				} else {
					const rows = (await sql.unsafe(
						`UPDATE "${table}" SET section_tipo = $1 WHERE section_tipo = $2 RETURNING id`,
						[newTipo, oldTipo],
					)) as unknown[];
					if (rows.length > 0) {
						recorder.record({
							op: 'update',
							table,
							target: oldTipo,
							detail: `section_tipo→${newTipo} (${rows.length} rows)`,
						});
					}
				}
			}
			// matrix_time_machine also keys sections by section_tipo.
			await renameColumn('matrix_time_machine', 'section_tipo', oldTipo, newTipo, recorder);
			// matrix_counter row for the old section tipo is dropped (PHP parity).
			await dropCounter(oldTipo, recorder);
		}

		// 2. TM `tipo` column rename (both section + component tipos are TM tipos)
		await renameColumn('matrix_time_machine', 'tipo', oldTipo, newTipo, recorder);

		// 3. embedded-tipo string rewrite across every jsonb column (PHP replace_tm_data,
		//    generalized): a quoted "<old>" becomes "<new>" inside locators/keys.
		for (const table of tables) {
			for (const column of MATRIX_JSONB_COLUMNS) {
				await rewriteEmbeddedTipo(table, column, oldTipo, newTipo, recorder);
			}
		}
		// TM payload column too.
		await rewriteEmbeddedTipo('matrix_time_machine', 'data', oldTipo, newTipo, recorder);
	}
}

/** `UPDATE <table> SET <column> = new WHERE <column> = old` (structural columns). */
async function renameColumn(
	table: string,
	column: 'section_tipo' | 'tipo',
	oldValue: string,
	newValue: string,
	recorder: TransformRecorder,
): Promise<void> {
	if (recorder.dryRun) {
		const count = await scalarCount(
			`SELECT count(*)::int AS count FROM "${table}" WHERE ${column} = $1`,
			[oldValue],
		);
		if (count > 0)
			recorder.record({
				op: 'update',
				table,
				target: oldValue,
				detail: `${column}→${newValue} (${count})`,
			});
		return;
	}
	const rows = (await sql.unsafe(
		`UPDATE "${table}" SET ${column} = $1 WHERE ${column} = $2 RETURNING id`,
		[newValue, oldValue],
	)) as unknown[];
	if (rows.length > 0)
		recorder.record({
			op: 'update',
			table,
			target: oldValue,
			detail: `${column}→${newValue} (${rows.length})`,
		});
}

/** DROP the matrix_counter row for a renamed tipo (PHP changes_in_tipos:997). */
async function dropCounter(tipo: string, recorder: TransformRecorder): Promise<void> {
	if (recorder.dryRun) {
		const count = await scalarCount(
			'SELECT count(*)::int AS count FROM matrix_counter WHERE tipo = $1',
			[tipo],
		);
		if (count > 0)
			recorder.record({
				op: 'delete',
				table: 'matrix_counter',
				target: tipo,
				detail: 'drop old counter',
			});
		return;
	}
	const rows = (await sql.unsafe('DELETE FROM matrix_counter WHERE tipo = $1 RETURNING tipo', [
		tipo,
	])) as unknown[];
	if (rows.length > 0)
		recorder.record({
			op: 'delete',
			table: 'matrix_counter',
			target: tipo,
			detail: 'drop old counter',
		});
}

/**
 * String-level embedded-tipo rewrite in one jsonb column (PHP replace_tm_data
 * generalized): `replace(col::text, '"old"', '"new"')::jsonb` where the column
 * text contains the quoted old tipo. Matched on the double-quoted token so a
 * substring (qdp1 inside qdp100) never false-matches.
 */
async function rewriteEmbeddedTipo(
	table: string,
	column: string,
	oldTipo: string,
	newTipo: string,
	recorder: TransformRecorder,
): Promise<void> {
	const needle = `"${oldTipo}"`;
	const replacement = `"${newTipo}"`;
	if (recorder.dryRun) {
		const count = await scalarCount(
			`SELECT count(*)::int AS count FROM "${table}" WHERE "${column}" IS NOT NULL AND "${column}"::text LIKE $1`,
			[`%${needle}%`],
		);
		if (count > 0)
			recorder.record({
				op: 'rewrite_locator',
				table,
				target: `${column}`,
				detail: `${needle}→${replacement} (${count} rows)`,
			});
		return;
	}
	const rows = (await sql.unsafe(
		`UPDATE "${table}" SET "${column}" = replace("${column}"::text, $1, $2)::jsonb
		 WHERE "${column}" IS NOT NULL AND "${column}"::text LIKE $3 RETURNING id`,
		[needle, replacement, `%${needle}%`],
	)) as unknown[];
	if (rows.length > 0)
		recorder.record({
			op: 'rewrite_locator',
			table,
			target: `${column}`,
			detail: `${needle}→${replacement} (${rows.length} rows)`,
		});
}
