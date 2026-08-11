/**
 * sequences_status widget — the DB sequence audit (PHP db_tasks::check_sequences),
 * computed EAGERLY into the catalog value (PHP builds it inside get_ar_widgets).
 */

import { config } from '../../../config/config.ts';
import { sql } from '../../db/postgres.ts';
import type { WidgetModule } from './support.ts';

/**
 * Tables PHP's sequence audit skips (db_tasks::check_sequences).
 *
 * `matrix_counter`/`matrix_counter_dd` are the load-bearing members: their
 * `value` column is NOT an id sequence, so setval-ing them would corrupt the
 * record-id counters. Exported for the gate — membership IS the contract.
 */
export const SEQUENCE_SKIP_TABLES: ReadonlySet<string> = new Set([
	'session_data',
	'matrix_counter',
	'matrix_counter_dd',
	'temp',
	'relations',
	'relations_DES',
]);

/**
 * The per-table verdict — the PURE decision the audit below acts on.
 *
 * All three comparisons are deliberate:
 *  - `advisoryMismatch` (string ≠, PHP's `!=` on the report line) — reported,
 *    never fatal: a sequence AHEAD of the last id is normal (deleted rows).
 *  - `needsSetval` NUMERIC (`Number()` both sides): a sequence BEHIND the
 *    highest id collides on the next INSERT. String compare would judge
 *    '10' < '9' and call an unhealthy sequence healthy — the exact failure
 *    this widget exists to prevent.
 *  - `warnStartValue` / `resultFalse`: PHP flips result ONLY on a non-1 start
 *    value (the setval advisory does not), plus a failing setval at the call
 *    site, which is I/O and therefore not part of this verdict.
 */
export function sequenceVerdict(
	lastId: string,
	lastValue: string,
	startValue: string,
): {
	advisoryMismatch: boolean;
	needsSetval: boolean;
	warnStartValue: boolean;
	resultFalse: boolean;
} {
	const warnStartValue = startValue !== '1';
	return {
		advisoryMismatch: lastValue !== lastId,
		needsSetval: Number(lastId) > Number(lastValue),
		warnStartValue,
		resultFalse: warnStartValue,
	};
}

/**
 * The DB sequence audit (PHP db_tasks::check_sequences) — for every public
 * table with an id sequence: the sequence's start/last values against the
 * table's real MAX(id), with PHP's exact HTML report strings (repair hints
 * included). Engine-neutral (shared DB), byte-parity gated.
 *
 * ⚠ LEDGERED WRITE ON A READ PATH (plan §4.4 D2, 2026-08-10 — unresolved,
 * behaviour intentionally UNCHANGED). This function is wired as the widget's
 * `eagerValue`, so it runs whenever the maintenance CATALOG is built — a panel
 * LOAD — and when a sequence is behind its table it fires
 * `SELECT setval('public.<table>_id_seq', <lastId>, true)` (:below). It is the
 * PHP auto-repair posture, and it only ever moves a sequence FORWARD to the
 * table's true max, but it is still a write on a read path: any code path that
 * builds the catalog (including test/parity/widgets_differential.test.ts, which
 * runs credlessly under ORACLE_MODE=fixtures) advances sequences in whatever
 * database is bound — dedalo_mib_v7_test on every parity run. A gate must NEVER
 * call checkSequences(); gate `sequenceVerdict` instead.
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
		const verdict = sequenceVerdict(lastId, lastValue, startValue);

		response.msg += `<hr><b>${table_name}</b> - start_value: ${startValue} - seq last_value: ${lastValue} `;
		if (verdict.advisoryMismatch) {
			// Advisory only — PHP does NOT flip result here.
			response.msg += `<span style="color:#b97800">[last id: ${lastId}] SELECT setval('public.${table_name}_id_seq', ${lastId}, true);</span>`;
		} else {
			response.msg += `[last id: ${lastId}]`;
		}
		// AUTO-REPAIR (PHP): a sequence BEHIND the highest id would collide on
		// the next INSERT — advance it immediately with setval(..., true).
		if (verdict.needsSetval) {
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
		// The report line and the result flip are ONE branch here because the
		// verdict makes them coincide (`resultFalse` is `warnStartValue`): PHP
		// flips the overall result on a non-1 start value and nowhere else in
		// this decision — the failing-setval flip above is I/O, not verdict.
		if (verdict.resultFalse) {
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
