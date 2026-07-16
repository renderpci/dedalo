/**
 * sequences_status widget — the DB sequence audit (PHP db_tasks::check_sequences),
 * computed EAGERLY into the catalog value (PHP builds it inside get_ar_widgets).
 */

import { config } from '../../../config/config.ts';
import { sql } from '../../db/postgres.ts';
import type { WidgetModule } from './support.ts';

/** Tables PHP's sequence audit skips (db_tasks::check_sequences). */
const SEQUENCE_SKIP_TABLES: ReadonlySet<string> = new Set([
	'session_data',
	'matrix_counter',
	'matrix_counter_dd',
	'temp',
	'relations',
	'relations_DES',
]);

/**
 * The DB sequence audit (PHP db_tasks::check_sequences) — for every public
 * table with an id sequence: the sequence's start/last values against the
 * table's real MAX(id), with PHP's exact HTML report strings (repair hints
 * included). Engine-neutral (shared DB), byte-parity gated.
 */
export async function checkSequences(): Promise<Record<string, unknown>> {
	const response: {
		result: boolean;
		msg: string;
		values: Record<string, unknown>[];
		errors?: string[];
	} = { result: true, msg: '', values: [] };
	response.msg += `TEST ALL SEQUENCES IN DATABASE: ${config.db.database}`;

	const tables = (await sql.unsafe(
		`SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name ASC`,
		[],
	)) as { table_name: string }[];

	for (const { table_name } of tables) {
		if (SEQUENCE_SKIP_TABLES.has(table_name)) continue;
		let lastId: string;
		try {
			const idRows = (await sql.unsafe(
				`SELECT id FROM "${table_name}" ORDER BY id DESC LIMIT 1`,
				[],
			)) as { id: number | string }[];
			if (idRows.length === 0) continue; // empty table
			lastId = String(idRows[0]?.id);
		} catch {
			continue; // no id column — PHP's failed query is skipped the same way
		}
		const seqRows = (await sql.unsafe(
			'SELECT last_value, start_value FROM pg_sequences WHERE sequencename = $1',
			[`${table_name}_id_seq`],
		)) as { last_value: number | string | null; start_value: number | string }[];
		if (seqRows.length === 0) continue;
		const lastValue = String(seqRows[0]?.last_value);
		const startValue = String(seqRows[0]?.start_value);

		response.values.push({
			table_name,
			start_value: startValue,
			last_value: lastValue,
			last_id: lastId,
		});
		response.msg += `<hr><b>${table_name}</b> - start_value: ${startValue} - seq last_value: ${lastValue} `;
		if (lastValue !== lastId) {
			// Advisory only — PHP does NOT flip result here.
			response.msg += `<span style="color:#b97800">[last id: ${lastId}] SELECT setval('public.${table_name}_id_seq', ${lastId}, true);</span>`;
		} else {
			response.msg += `[last id: ${lastId}]`;
		}
		// AUTO-REPAIR (PHP): a sequence BEHIND the highest id would collide on
		// the next INSERT — advance it immediately with setval(..., true).
		if (Number(lastId) > Number(lastValue)) {
			response.msg += `<br><b>   WARNING: seq last_id > last_value [${lastId} > ${lastValue}]</b>`;
			response.msg += `<br>FIX AUTOMATIC TO ${lastId} start</pre>`;
			try {
				await sql.unsafe(
					`SELECT setval('public.${table_name}_id_seq', ${Number(lastId)}, true)`,
					[],
				);
			} catch {
				response.msg += `Use: <b>SELECT setval('public.${table_name}_id_seq', ${lastId}, true);</b>`;
				response.result = false;
			}
		}
		if (startValue !== '1') {
			response.msg += '<br><b>   WARNING: seq start_value != 1</b>';
			response.msg += `Use: <b>ALTER SEQUENCE ${table_name}_id_seq START WITH 1 ;</b>`;
			response.result = false;
		}
	}
	return response;
}

export const widget: WidgetModule = {
	spec: {
		id: 'sequences_status',
		category: 'integrity',
		class: 'width_100',
		label: { kind: 'literal', text: 'DB sequences status' },
	},
	eagerValue: checkSequences,
};
