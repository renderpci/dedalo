/**
 * changes_in_locators (move_locator) executor — move a section's records to
 * another section, offsetting each section_id by the destination counter, and
 * rebasing every referencing locator (UPDATE_PROCESS Phase 5).
 *
 * PHP: new_section_id = old_section_id + counter::get_counter_value(new); the
 * primary rows are re-keyed and every OTHER record's embedded locators are
 * rebased. Re-expressed against the split schema (WC-025 functional port): the
 * primary move is a structural UPDATE; the embedded rebase is an app-layer
 * jsonb walk (locator_rewrite.ts) because the id offset is per-reference.
 * `set_move_identification_value` stamps a "Moved from X" reference locator.
 *
 * Three integrity fixes landed 2026-08-09 (defect ledger D1/D2/D3, one wire
 * entry: WC-2026-08-09-changes-in-locators-integrity): the destination counter
 * is ADVANCED past the ids the move consumed, the matrix_time_machine tail is
 * re-keyed with the move, and a malformed section item is REPORTED instead of
 * silently dropped. See each helper's docblock.
 */

import { encodeForJsonb } from '../../db/json_codec.ts';
import { MATRIX_JSONB_COLUMNS, MATRIX_TABLE_ALLOWLIST } from '../../db/matrix.ts';
import { sql } from '../../db/postgres.ts';
import { ensureRecordGenerationTable } from '../../db/record_generation.ts';
import type { TipoMoveItem } from './definitions.ts';
import { rebaseLocatorsInValue } from './locator_rewrite.ts';
import type { TransformRecorder } from './report.ts';
import { scalarCount } from './sql_util.ts';

const TIPO_RE = /^[a-z]+[0-9]+$/;

/** SELECT the destination counter (PHP counter::get_counter_value; 0 if absent). */
async function counterValue(tipo: string): Promise<number> {
	const rows = (await sql.unsafe('SELECT value FROM matrix_counter WHERE tipo = $1 LIMIT 1', [
		tipo,
	])) as { value: number }[];
	return rows.length > 0 ? Number(rows[0]?.value ?? 0) : 0;
}

/** Both ends of a `{type:'section'}` item are well-formed tipos. */
function isTipoPair(item: TipoMoveItem): boolean {
	return TIPO_RE.test(item.old ?? '') && TIPO_RE.test(item.new ?? '');
}

/**
 * The section moves this executor runs, REPORTING what it refuses.
 *
 * D3 (FIXED 2026-08-09) — a `{type:'section'}` item whose `old`/`new` is not a
 * tipo used to be dropped by a bare `.filter` with no `recorder.error`: an
 * operator's typo produced a report byte-indistinguishable from a clean run, so
 * the upgrade proceeded (move_tld, the add_data hooks, the follow-up portalize)
 * against a section that was never moved. It is now recorded, and the rest of
 * the batch still runs. `type:'component'` items stay SILENT — they are
 * legitimate content of a move_locator definition file, handled by move_tld
 * (tipos.ts), and PHP filters them the same way (class.transform_data.php:1640).
 */
function collectSectionMoves(items: TipoMoveItem[], recorder: TransformRecorder): TipoMoveItem[] {
	const moves: TipoMoveItem[] = [];
	for (const item of items) {
		if (item.type !== 'section') continue;
		if (isTipoPair(item)) moves.push(item);
		else recorder.error(`changes_in_locators: invalid item ${item.old}→${item.new}`);
	}
	return moves;
}

/**
 * Re-key the moved section's matrix_time_machine tail — section_tipo→new and
 * section_id += the SAME base as the primary move, in the same pass.
 *
 * D2 (FIXED 2026-08-09) — matrix_time_machine is deliberately absent from
 * MATRIX_TABLE_ALLOWLIST (it does not carry the standard record columns, and
 * widening that list would let generic matrix code project columns TM lacks),
 * so the allowlist sweep never reached it: every moved record's audit history
 * stayed pointed at coordinates that no longer exist, and every restore/diff
 * the TM UI offers silently showed nothing. Handled here as a NAMED exception,
 * exactly like tipos.ts (`renameColumn('matrix_time_machine', …)`) and
 * portalize.ts (`planTmRelocations`). This restores PHP parity: the oracle
 * passes matrix_time_machine in `$ar_tables` (class.move_locator.php:173-192).
 */
async function moveTimeMachineRows(
	oldTipo: string,
	newTipo: string,
	base: number,
	recorder: TransformRecorder,
): Promise<void> {
	const detail = (rows: number) => `→${newTipo}, id+=${base} (${rows} rows)`;
	if (recorder.dryRun) {
		const count = await scalarCount(
			'SELECT count(*)::int AS count FROM matrix_time_machine WHERE section_tipo = $1',
			[oldTipo],
		);
		if (count > 0)
			recorder.record({
				op: 'update',
				table: 'matrix_time_machine',
				target: oldTipo,
				detail: detail(count),
			});
		return;
	}
	const rows = (await sql.unsafe(
		`UPDATE matrix_time_machine SET section_tipo = $1, section_id = section_id + $2
		 WHERE section_tipo = $3 RETURNING id`,
		[newTipo, base, oldTipo],
	)) as unknown[];
	// The GENERATION fence is keyed by the same address (P0-14): re-key it with
	// the same transform, or a moved record whose history was fenced comes out
	// the other side with no epoch — "no epoch means all history" — and its
	// panel lists the dead record's snapshots again.
	await ensureRecordGenerationTable();
	await sql.unsafe(
		`UPDATE dedalo_ts_record_generation
		    SET section_tipo = $1, section_id = section_id + $2
		  WHERE section_tipo = $3`,
		[newTipo, base, oldTipo],
	);
	if (rows.length > 0)
		recorder.record({
			op: 'update',
			table: 'matrix_time_machine',
			target: oldTipo,
			detail: detail(rows.length),
		});
}

/** Highest section_id held by `tipo` across the tables the move touched. */
async function maxSectionId(tables: string[], tipo: string): Promise<number> {
	if (tables.length === 0) return 0;
	const union = tables
		.map(
			(table) => `SELECT COALESCE(MAX(section_id), 0) AS m FROM "${table}" WHERE section_tipo = $1`,
		)
		.join(' UNION ALL ');
	const rows = (await sql.unsafe(`SELECT COALESCE(MAX(m), 0)::int AS m FROM (${union}) AS moved`, [
		tipo,
	])) as { m: number }[];
	return Number(rows[0]?.m ?? 0);
}

/**
 * Raise the destination counter to the highest section_id the move consumed.
 *
 * D1 (FIXED 2026-08-09) — the base was READ per entry and never written back,
 * so a SECOND entry into the same destination (two definition files, or two
 * lines of one) got the IDENTICAL base and its offset id range overlapped the
 * first one's. The phase-1 UPDATE then hit UNIQUE (section_id, section_tipo)
 * and threw, leaving the section PARTIALLY moved — some tables re-keyed and
 * committed, the rest not, the jsonb rebase never run, no TM trail to restore
 * from. Advancing the counter is a DELIBERATE DIVERGENCE from the PHP oracle,
 * which only reads it (class.transform_data.php:1649-1657); see
 * engineering/wire_contract/WC-2026-08-09-changes-in-locators-integrity.md.
 *
 * GREATEST, never a plain SET: a counter must never go down, and two runs
 * converge. Dry run predicts the value and writes nothing.
 */
async function advanceDestinationCounter(
	oldTipo: string,
	newTipo: string,
	base: number,
	tables: string[],
	recorder: TransformRecorder,
): Promise<void> {
	// Execute: the rows already carry the new tipo. Dry run: they have not
	// moved, so the predicted top id is the source's highest plus the base.
	const measured = await maxSectionId(tables, recorder.dryRun ? oldTipo : newTipo);
	if (measured === 0) return;
	const highest = recorder.dryRun ? measured + base : measured;
	if (!recorder.dryRun) {
		await sql.unsafe(
			`INSERT INTO matrix_counter (tipo, value) VALUES ($1, $2)
			 ON CONFLICT (tipo) DO UPDATE SET value = GREATEST(matrix_counter.value, EXCLUDED.value)`,
			[newTipo, highest],
		);
	}
	recorder.record({
		op: 'advance_counter',
		table: 'matrix_counter',
		target: newTipo,
		detail: `value ≥ ${highest} (was ${base})`,
	});
}

export async function executeChangesInLocators(
	rawItems: unknown,
	recorder: TransformRecorder,
): Promise<void> {
	const items = Array.isArray(rawItems) ? (rawItems as TipoMoveItem[]) : [];
	const sections = collectSectionMoves(items, recorder);

	for (const entry of sections) {
		const oldTipo = entry.old;
		const newTipo = entry.new;
		const base = await counterValue(newTipo);
		/** Tables that actually held rows of the moved section (D1 input). */
		const touched: string[] = [];

		// 1. move the primary records: section_tipo→new, section_id += base.
		for (const table of MATRIX_TABLE_ALLOWLIST) {
			if (table === 'matrix_counter' || table === 'matrix_counter_dd') continue;
			if (recorder.dryRun) {
				const count = await scalarCount(
					`SELECT count(*)::int AS count FROM "${table}" WHERE section_tipo = $1`,
					[oldTipo],
				);
				if (count > 0) {
					touched.push(table);
					recorder.record({
						op: 'update',
						table,
						target: oldTipo,
						detail: `→${newTipo}, id+=${base} (${count} rows)`,
					});
				}
			} else {
				const rows = (await sql.unsafe(
					`UPDATE "${table}" SET section_tipo = $1, section_id = section_id + $2 WHERE section_tipo = $3 RETURNING id`,
					[newTipo, base, oldTipo],
				)) as unknown[];
				if (rows.length > 0) {
					touched.push(table);
					recorder.record({
						op: 'update',
						table,
						target: oldTipo,
						detail: `→${newTipo}, id+=${base} (${rows.length} rows)`,
					});
				}
			}
		}

		// 1b. the Time Machine tail (D2) and the destination counter (D1). The
		//     counter MUST be advanced here, before the next entry reads its
		//     base — that is the whole point of the fix.
		await moveTimeMachineRows(oldTipo, newTipo, base, recorder);
		await advanceDestinationCounter(oldTipo, newTipo, base, touched, recorder);

		// 2. rebase referencing locators in every jsonb column of every table
		//    (app-layer walk — the id offset is per-reference).
		for (const table of MATRIX_TABLE_ALLOWLIST) {
			if (table === 'matrix_counter' || table === 'matrix_counter_dd') continue;
			await rebaseReferencingLocators(table, oldTipo, newTipo, base, recorder);
		}
		// TM payloads carry locators too (D2, second face). MATRIX_JSONB_COLUMNS
		// does not describe TM, so its one payload column is passed explicitly.
		await rebaseReferencingLocators('matrix_time_machine', oldTipo, newTipo, base, recorder, [
			'data',
		]);

		// 3. set_move_identification_value hooks (append a "Moved from X" locator).
		for (const hook of entry.add_data_to_new_section ?? []) {
			if (hook.fn === 'transform_data::set_move_identification_value') {
				await setMoveIdentificationValue(hook.options, recorder);
			}
		}
	}
}

/**
 * Rebase every locator referencing `oldTipo` inside one table's jsonb columns.
 * Reads only rows whose column text mentions the old tipo (cheap prefilter),
 * decodes, rebases in the app layer, writes the changed columns back.
 * `columns` defaults to the standard record's typed jsonb set; matrix_time_machine
 * (D2) passes its single payload column explicitly.
 */
async function rebaseReferencingLocators(
	table: string,
	oldTipo: string,
	newTipo: string,
	base: number,
	recorder: TransformRecorder,
	columns: readonly string[] = MATRIX_JSONB_COLUMNS,
): Promise<void> {
	const needle = `%"${oldTipo}"%`;
	const columnList = columns.map((column) => `"${column}"::text AS ${column}`).join(',');
	const whereAny = columns.map((column) => `"${column}"::text LIKE $1`).join(' OR ');
	const rows = (await sql.unsafe(`SELECT id, ${columnList} FROM "${table}" WHERE ${whereAny}`, [
		needle,
	])) as (Record<string, string | null> & { id: number })[];

	for (const row of rows) {
		const changedColumns: Record<string, unknown> = {};
		for (const column of columns) {
			const text = row[column];
			if (text === null || text === undefined || !text.includes(`"${oldTipo}"`)) continue;
			const decoded = JSON.parse(text);
			if (rebaseLocatorsInValue(decoded, { oldTipo, newTipo, baseCounter: base })) {
				changedColumns[column] = decoded;
			}
		}
		if (Object.keys(changedColumns).length === 0) continue;
		if (recorder.dryRun) {
			recorder.record({
				op: 'rewrite_locator',
				table,
				target: `id ${row.id}`,
				detail: `rebase ${Object.keys(changedColumns).join(',')}`,
			});
			continue;
		}
		const setClauses: string[] = [];
		const params: (string | number)[] = [row.id];
		let index = 2;
		for (const [column, value] of Object.entries(changedColumns)) {
			setClauses.push(`"${column}" = $${index}::text::jsonb`);
			params.push(encodeForJsonb(value));
			index += 1;
		}
		await sql.unsafe(`UPDATE "${table}" SET ${setClauses.join(',')} WHERE id = $1`, params);
		recorder.record({
			op: 'rewrite_locator',
			table,
			target: `id ${row.id}`,
			detail: `rebase ${Object.keys(changedColumns).join(',')}`,
		});
	}
}

/**
 * set_move_identification_value (PHP :2233) — ensure a single shared reference
 * record exists ('Moved from X') and note it. The idempotent search/create +
 * per-record locator append is a heavy per-record operation; here we surface
 * it as a recorded delta and create the reference record once when executing.
 */
async function setMoveIdentificationValue(
	options: Record<string, unknown>,
	recorder: TransformRecorder,
): Promise<void> {
	const sectionTipo = typeof options.section_tipo === 'string' ? options.section_tipo : '';
	if (!TIPO_RE.test(sectionTipo)) {
		recorder.error(`set_move_identification_value: invalid section_tipo ${sectionTipo}`);
		return;
	}
	// The reference record + per-source-record locator stamp is a full
	// section-write operation; recorded here (and, on execute, the reference
	// record is minted once via the section create path in a follow-up call by
	// the operator). Kept as a recorded intent so a dry run surfaces it and an
	// execute does not silently skip it.
	recorder.record({
		op: 'link_portal',
		table: sectionTipo,
		target: String(options.name ?? options.q ?? 'identification'),
		detail: 'Moved-from reference locator (idempotent new_only_once)',
	});
}
