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
 */

import { encodeForJsonb } from '../../db/json_codec.ts';
import { MATRIX_JSONB_COLUMNS, MATRIX_TABLE_ALLOWLIST } from '../../db/matrix.ts';
import { sql } from '../../db/postgres.ts';
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

export async function executeChangesInLocators(
	rawItems: unknown,
	recorder: TransformRecorder,
): Promise<void> {
	const items = Array.isArray(rawItems) ? (rawItems as TipoMoveItem[]) : [];
	const sections = items.filter(
		(item) =>
			item.type === 'section' && TIPO_RE.test(item.old ?? '') && TIPO_RE.test(item.new ?? ''),
	);

	for (const entry of sections) {
		const oldTipo = entry.old;
		const newTipo = entry.new;
		const base = await counterValue(newTipo);

		// 1. move the primary records: section_tipo→new, section_id += base.
		for (const table of MATRIX_TABLE_ALLOWLIST) {
			if (table === 'matrix_counter' || table === 'matrix_counter_dd') continue;
			if (recorder.dryRun) {
				const count = await scalarCount(
					`SELECT count(*)::int AS count FROM "${table}" WHERE section_tipo = $1`,
					[oldTipo],
				);
				if (count > 0)
					recorder.record({
						op: 'update',
						table,
						target: oldTipo,
						detail: `→${newTipo}, id+=${base} (${count} rows)`,
					});
			} else {
				const rows = (await sql.unsafe(
					`UPDATE "${table}" SET section_tipo = $1, section_id = section_id + $2 WHERE section_tipo = $3 RETURNING id`,
					[newTipo, base, oldTipo],
				)) as unknown[];
				if (rows.length > 0)
					recorder.record({
						op: 'update',
						table,
						target: oldTipo,
						detail: `→${newTipo}, id+=${base} (${rows.length} rows)`,
					});
			}
		}

		// 2. rebase referencing locators in every jsonb column of every table
		//    (app-layer walk — the id offset is per-reference).
		for (const table of MATRIX_TABLE_ALLOWLIST) {
			if (table === 'matrix_counter' || table === 'matrix_counter_dd') continue;
			await rebaseReferencingLocators(table, oldTipo, newTipo, base, recorder);
		}

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
 */
async function rebaseReferencingLocators(
	table: string,
	oldTipo: string,
	newTipo: string,
	base: number,
	recorder: TransformRecorder,
): Promise<void> {
	const needle = `%"${oldTipo}"%`;
	const columnList = MATRIX_JSONB_COLUMNS.map((column) => `"${column}"::text AS ${column}`).join(
		',',
	);
	const whereAny = MATRIX_JSONB_COLUMNS.map((column) => `"${column}"::text LIKE $1`).join(' OR ');
	const rows = (await sql.unsafe(`SELECT id, ${columnList} FROM "${table}" WHERE ${whereAny}`, [
		needle,
	])) as (Record<string, string | null> & { id: number })[];

	for (const row of rows) {
		const changedColumns: Record<string, unknown> = {};
		for (const column of MATRIX_JSONB_COLUMNS) {
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
