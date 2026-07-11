/**
 * Small SQL helper shared by the move_* executors (UPDATE_PROCESS Phase 5).
 */

import { sql } from '../../db/postgres.ts';

/** Run a `SELECT count(*)::int AS count …` and return the scalar (0 if no row). */
export async function scalarCount(text: string, params: unknown[]): Promise<number> {
	const rows = (await sql.unsafe(text, params as (string | number)[])) as { count: number }[];
	return rows[0]?.count ?? 0;
}
