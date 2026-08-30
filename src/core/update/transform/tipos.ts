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
import { requiredOntologyTld } from '../../ontology/tld.ts';
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
 * locators/keys). Counter rows for a renamed tipo are CARRIED to the new tipo
 * (P0-14 — PHP dropped them and left the allocator to rebuild from live rows,
 * which re-minted the ids of deleted records).
 */
export async function executeChangesInTipos(
	rawItems: unknown,
	recorder: TransformRecorder,
): Promise<void> {
	const items = Array.isArray(rawItems) ? (rawItems as TipoMoveItem[]) : [];
	const map = items.filter((item) => TIPO_RE.test(item.old ?? '') && TIPO_RE.test(item.new ?? ''));
	if (map.length !== items.length) {
		// TIPO_RE is a DELIBERATE boundary, not an oversight: it requires digits, so a
		// bare-tld entry (`{"old":"qdp","new":"tch"}`) can never be written. This tool
		// renames TIPOS, never TLD NAMESPACES — see the ONT-TLD refusal below.
		recorder.error('some map entries have an unsafe old/new tipo — skipped');
	}
	// ONT-TLD: an ontology ROOT section (`<tld>0`) is never renamed by this tool.
	// It is not a gap to fill — it is an operation that cannot work here:
	//  - the rows carry their tld in `ontology7`, a BARE string that no tipo rewrite
	//    below can reach, so the whole ontology would keep declaring the old
	//    namespace and parse into it (ontology_state's `foreign` drift, en masse);
	//  - `matrix_ontology` has a UNIQUE (section_id, section_tipo) index, and two
	//    real ontologies routinely share section_ids, so the bulk UPDATE aborts
	//    part-way — with no transaction and no rollback here (WC-025), that leaves
	//    the database half-renamed and unrecoverable.
	// A tld rename is done in the ontology MASTER and redistributed by the ontology
	// import, which rewrites ontology7 as it lands (data_io_import's
	// normalizeOntologyTld). Refused loudly rather than half-performed.
	const governed = map.filter(
		(item) =>
			requiredOntologyTld(item.old ?? '') !== null || requiredOntologyTld(item.new ?? '') !== null,
	);
	for (const item of governed) {
		recorder.error(
			`${item.old} → ${item.new}: an ontology root section (<tld>0) cannot be renamed here — its records carry the tld in ontology7, which this tool cannot rewrite. Rename the tld in the ontology master and redistribute it with the ontology import (update_ontology); move_tld migrates the DATA sections only`,
		);
	}
	const safeMap = map.filter((item) => !governed.includes(item));

	const tables = rewritableTables();
	for (const entry of safeMap) {
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
			// The section keeps its records — and their ids — under the new tipo,
			// so it must keep its high-water mark too: CARRY the counter, then drop
			// the old row (P0-14).
			await carryCounter(oldTipo, newTipo, recorder);
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

/** The two counter tables a section can be governed by (see carryCounter). */
const COUNTER_TABLES = ['matrix_counter', 'matrix_counter_dd'] as const;

/** Carry one counter table's row for a renamed tipo: raise the destination, drop the source. */
async function carryOneCounterTable(
	counterTable: (typeof COUNTER_TABLES)[number],
	oldTipo: string,
	newTipo: string,
	recorder: TransformRecorder,
): Promise<void> {
	if (recorder.dryRun) {
		const count = await scalarCount(
			`SELECT count(*)::int AS count FROM ${counterTable} WHERE tipo = $1`,
			[oldTipo],
		);
		if (count > 0)
			recorder.record({
				op: 'update',
				table: counterTable,
				target: oldTipo,
				detail: `carry counter→${newTipo}`,
			});
		return;
	}
	// Raise the destination to the old counter's value (GREATEST — a counter
	// already standing at the new tipo is never lowered), then drop the source.
	const carried = (await sql.unsafe(
		`INSERT INTO ${counterTable} (tipo, value)
		 SELECT $2, value FROM ${counterTable} WHERE tipo = $1
		 ON CONFLICT (tipo) DO UPDATE SET value = GREATEST(${counterTable}.value, EXCLUDED.value)
		 RETURNING value`,
		[oldTipo, newTipo],
	)) as { value: number }[];
	const rows = (await sql.unsafe(`DELETE FROM ${counterTable} WHERE tipo = $1 RETURNING tipo`, [
		oldTipo,
	])) as unknown[];
	if (rows.length > 0)
		recorder.record({
			op: 'update',
			table: counterTable,
			target: oldTipo,
			detail: `carry counter→${newTipo} (${String(carried[0]?.value ?? 'absent')})`,
		});
}

/**
 * CARRY a renamed section's counter row to its new name, then drop the old one.
 *
 * (!) Deliberate divergence from PHP changes_in_tipos:997
 * (WC-2026-08-30-section-id-counter-is-a-high-water-mark, P0-14).
 * PHP dropped the old counter and left the new tipo with none, trusting the
 * allocator to "rebuild" it — but the allocator's bootstrap derives its restart
 * point from rows that are still ALIVE, so every id freed by a deleted record
 * became re-mintable the moment a section was renamed. The rename moves the
 * records and their `matrix_time_machine` rows to the new tipo without changing
 * a single section_id, so the high-water mark must move with them.
 *
 * BOTH counter tables are carried: a section backed by a `_dd` matrix table is
 * governed by `matrix_counter_dd`, and the ontology node that would say which
 * one may already be renamed or gone by the time this transform runs. Carrying
 * from a table that holds no row is a no-op, so carrying both is safer than
 * resolving and guessing.
 */
async function carryCounter(
	oldTipo: string,
	newTipo: string,
	recorder: TransformRecorder,
): Promise<void> {
	// A move_tld map is hand-maintained and routinely lists every tipo of a TLD,
	// including ones that do not move. For an identity entry the "carry" upserts
	// the row onto ITSELF (a no-op GREATEST) and the DELETE would then destroy
	// the only counter — re-creating the exact defect this function closes.
	if (oldTipo === newTipo) return;

	for (const counterTable of COUNTER_TABLES) {
		await carryOneCounterTable(counterTable, oldTipo, newTipo, recorder);
	}
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
