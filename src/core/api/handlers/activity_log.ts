/**
 * Activity log rows (PHP logger::$obj['activity'] → matrix_activity, section
 * dd542): every state-changing API action appends an audit row —
 *
 *   relation.dd543 = the acting user's locator (dd128, no item id)
 *   relation.dd545 = the WHAT code locator (dd42: LOGIN=1, DELETE=4, SAVE=5,
 *                    LOAD=7)
 *   string.dd544   = the client host, string.dd546 = the WHERE tipo
 *   date.dd547     = the virtual-calendar instant (no id/lang)
 *   misc.dd551     = [{lang:'lg-nolan', value: <action payload>}]
 *
 * The section_id comes from the matrix_activity_section_id_seq POSTGRES
 * SEQUENCE (PHP inserts without section_id — the dd542 matrix_counter lags
 * and is NOT the allocator here). Failures are logged and swallowed (an
 * audit write must never fail the user action — PHP posture).
 */

import { sql } from '../../db/postgres.ts';
import { virtualDateNow } from '../../section/record/create_record.ts';

/** PHP WHAT → dd42 code (observed live: login/delete/save/page-load). */
const WHAT_CODES: Record<string, string> = {
	LOGIN: '1',
	DELETE: '4',
	SAVE: '5',
	LOAD: '7',
};

export interface ActivityEntry {
	what: keyof typeof WHAT_CODES | string;
	/** The WHERE tipo (component tipo for saves, section tipo for deletes). */
	tipo: string;
	userId: number;
	/** Client host (PHP stores the resolved host, e.g. 'localhost'). */
	host: string;
	/** The dd551 payload (msg + action-specific fields). */
	datos: Record<string, unknown>;
}

/** Append one activity row. Never throws (audit must not break the action). */
export async function logActivity(entry: ActivityEntry, now: Date = new Date()): Promise<void> {
	try {
		const code = WHAT_CODES[entry.what];
		if (code === undefined) return; // unmapped actions are skipped, not guessed
		const { encodeForJsonb } = await import('../../db/json_codec.ts');
		const relation = {
			dd543: [
				{
					type: 'dd151',
					section_id: String(entry.userId),
					section_tipo: 'dd128',
					from_component_tipo: 'dd543',
				},
			],
			dd545: [
				{ type: 'dd151', section_id: code, section_tipo: 'dd42', from_component_tipo: 'dd545' },
			],
		};
		const stringColumn = {
			dd544: [{ lang: 'lg-nolan', value: entry.host }],
			dd546: [{ lang: 'lg-nolan', value: entry.tipo }],
		};
		const dateColumn = { dd547: [{ start: virtualDateNow(now) }] };
		const miscColumn = { dd551: [{ lang: 'lg-nolan', value: entry.datos }] };
		await sql.unsafe(
			`INSERT INTO matrix_activity (section_tipo, relation, string, date, misc)
			 VALUES ('dd542', $1::text::jsonb, $2::text::jsonb, $3::text::jsonb, $4::text::jsonb)`,
			[
				encodeForJsonb(relation),
				encodeForJsonb(stringColumn),
				encodeForJsonb(dateColumn),
				encodeForJsonb(miscColumn),
			],
		);
	} catch (error) {
		console.error('activity log write failed (swallowed):', error);
	}
}
