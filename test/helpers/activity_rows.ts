/**
 * The ACTIVITY rows a gate's own writes leave behind — `matrix_activity`
 * (section dd542), one 'NEW' row per record a door creates (create_record.ts →
 * activity_log.ts logActivity): `string.dd546` = the WHERE tipo (the created
 * record's section), `misc.dd551[0].value.section_id` = its id.
 *
 * WHY A HELPER. The situation teardown (src/core/test_data/situations/
 * situation.ts dropSituation / residueOf) sweeps and counts matrix rows, TM and
 * counters — NOT activity rows — so a gate that creates records at runtime and
 * trusts `dropSituation() === 0` leaves its activity rows on the suite database
 * on every run, invisible to its own residue assertion. This helper sweeps them
 * AND counts them, so the gate can assert zero activity residue too.
 *
 * Scope: rows naming one section tipo — all of them for a scratch (`zz*`)
 * section the gate owns, or only the given record ids for a SHARED section
 * (the dd800 bulk-run records other gates mint too).
 */

import { sql } from '../../src/core/db/postgres.ts';
import { assertTestDatabase } from '../../src/core/test_data/test_database_marker.ts';

const WHERE = `section_tipo = 'dd542' AND string->'dd546'->0->>'value' = $1`;
const OF_IDS = `(misc->'dd551'->0->'value'->>'section_id')::text = ANY(string_to_array($2, ','))`;

/** The rows' filter: one section tipo, optionally narrowed to record ids. */
function filterOf(
	sectionTipo: string,
	ids?: readonly number[],
): { where: string; params: string[] } {
	if (ids === undefined) return { where: WHERE, params: [sectionTipo] };
	return { where: `${WHERE} AND ${OF_IDS}`, params: [sectionTipo, ids.map(String).join(',')] };
}

/** How many activity rows name `sectionTipo` (optionally only `ids`). */
export async function countActivityRows(
	sectionTipo: string,
	ids?: readonly number[],
): Promise<number> {
	if (ids !== undefined && ids.length === 0) return 0;
	const { where, params } = filterOf(sectionTipo, ids);
	const rows = (await sql.unsafe(
		`SELECT count(*)::int AS n FROM matrix_activity WHERE ${where}`,
		params,
	)) as { n: number }[];
	return rows[0]?.n ?? 0;
}

/** Delete the activity rows naming `sectionTipo` (optionally only `ids`) on the SUITE database. */
export async function sweepActivityRows(
	sectionTipo: string,
	ids?: readonly number[],
): Promise<void> {
	if (ids !== undefined && ids.length === 0) return;
	await assertTestDatabase('sweepActivityRows');
	const { where, params } = filterOf(sectionTipo, ids);
	await sql.unsafe(`DELETE FROM matrix_activity WHERE ${where}`, params);
}
