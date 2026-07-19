/**
 * Activity log rows (PHP logger::$obj['activity'] → matrix_activity, section
 * dd542): every state-changing API action appends an audit row —
 *
 *   relation.dd543 = the acting user's locator (dd128, no item id)
 *   relation.dd545 = the WHAT code locator (dd42 — see WHAT_CODES below)
 *   string.dd544   = the client host, string.dd546 = the WHERE tipo
 *   date.dd547     = the virtual-calendar instant (no id/lang)
 *   misc.dd551     = [{lang:'lg-nolan', value: <action payload>}]
 *
 * (!) PHP also writes relation.dd550 = the actor's PROJECTS locators
 * (filter::get_user_projects, re-stamped to from_component_tipo dd550). We do
 * NOT — see the WIRE_CONTRACT entry. Every TS-written row lacks that dimension.
 *
 * The section_id comes from the matrix_activity_section_id_seq POSTGRES
 * SEQUENCE (PHP inserts without section_id — the dd542 matrix_counter lags
 * and is NOT the allocator here). Failures are logged and swallowed (an
 * audit write must never fail the user action — PHP posture).
 */

import { sql } from '../../db/postgres.ts';
import { virtualDateNow } from '../../section/record/create_record.ts';

/**
 * PHP WHAT message → dd42 code (logger_backend_activity::$what). Keys are the
 * EXACT PHP message strings — 'LOAD EDIT'/'LOAD LIST' are distinct codes (6/7),
 * NOT a single 'LOAD'. Unmapped messages are skipped, never guessed.
 *
 * The map mirrors dd42 in FULL (all 16 codes) because the READ side already
 * does: area_maintenance/user_stats.ts WHAT_MAP resolves 1-16 → dd696…dd1081
 * for the user_activity widget. Four codes have no emitter — here or in PHP:
 *
 *   SEARCH 8, UPLOAD 9, STATS 15  — defined in PHP's $what but never passed to
 *       log_message() anywhere in v6 or the frozen v7. Never implemented.
 *   DOWNLOAD 10 — a v5-era event ('download file by tool av / image / pdf')
 *       LOST IN THE v6 MIGRATION. matrix_activity still holds dd1080 rows from
 *       2019-2020 and none after, and the v5→v6 upgrade map
 *       (class.activity_v5_to_v6.php) still translates it — so the code must
 *       stay readable even while nothing writes it.
 *
 * They are mapped, not omitted: an emitter added later needs only its call
 * site, and the map stays a faithful mirror of the ontology section. None is
 * ruled out permanently — reinstating DOWNLOAD in particular is an open
 * question, not a closed one.
 */
const WHAT_CODES: Record<string, string> = {
	'LOG IN': '1', // dd696
	'LOG OUT': '2', // dd697
	NEW: '3', // dd695
	DELETE: '4', // dd729
	SAVE: '5', // dd700
	'LOAD EDIT': '6', // dd694
	'LOAD LIST': '7', // dd693
	SEARCH: '8', // dd699 — no emitter (never implemented)
	UPLOAD: '9', // dd1090 — no emitter (never implemented; see UPLOAD COMPLETE)
	DOWNLOAD: '10', // dd1080 — no emitter (v5-era, lost in the v6 migration)
	'UPLOAD COMPLETE': '11', // dd1094
	'DELETE FILE': '12', // dd1095
	'RECOVER SECTION': '13', // dd1092
	'RECOVER COMPONENT': '14', // dd1091
	STATS: '15', // dd1098 — no emitter (never implemented)
	'NEW VERSION': '16', // dd1081
};

/**
 * The activity section's own components. Logging an action WHOSE TARGET is one
 * of these would append a row describing the appending of a row — PHP's
 * log_message_defer guards with the same list (logger_backend_activity::
 * $ar_elements_activity_tipo) and this is the port of that guard.
 */
const ACTIVITY_OWN_TIPOS: ReadonlySet<string> = new Set([
	'dd542', // the Activity section itself
	'dd543', // WHO
	'dd544', // IP
	'dd545', // WHAT
	'dd546', // WHERE
	'dd547', // WHEN
	'dd550', // PROJECTS
	'dd551', // DATA
]);

/**
 * PHP's WHO fallback when nothing is authenticated (log_message_defer:
 * `$user_id ?? logged_user_id() ?? '-666'`). Load-bearing rather than
 * decorative: a DENIED login has no principal, and without this sentinel the
 * row could not name an actor at all.
 */
export const ANONYMOUS_USER_ID = -666;

/**
 * The dd544 (IP) value. Loopback resolves to the literal 'localhost' — PHP
 * normalizes '::1' the same way, and the existing rows depend on it.
 */
export function hostFromClientIp(clientIp: string | null | undefined): string {
	if (clientIp === '127.0.0.1' || clientIp === '::1') return 'localhost';
	return clientIp ?? 'unknown';
}

export interface ActivityEntry {
	what: keyof typeof WHAT_CODES | string;
	/** The WHERE tipo (component tipo for saves, section tipo for deletes). */
	tipo: string;
	userId: number;
	/** Client host (PHP stores the resolved host, e.g. 'localhost'). */
	host: string;
	/** The dd551 payload (msg + action-specific fields). */
	data: Record<string, unknown>;
}

/** Append one activity row. Never throws (audit must not break the action). */
export async function logActivity(entry: ActivityEntry, now: Date = new Date()): Promise<void> {
	try {
		const code = WHAT_CODES[entry.what];
		if (code === undefined) return; // unmapped actions are skipped, not guessed
		// PHP log_message_defer's two skips, ported here (not at the call sites) so
		// that every current and future emitter inherits them:
		if (entry.tipo.length === 0) return; // no WHERE → the row would be meaningless
		if (ACTIVITY_OWN_TIPOS.has(entry.tipo)) return; // audit-of-the-audit loop
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
		const miscColumn = { dd551: [{ lang: 'lg-nolan', value: entry.data }] };
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
