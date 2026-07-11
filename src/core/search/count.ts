/**
 * Count the live records of one section (PHP area_common::count_section_records,
 * class.area_common.php:288). Permission-gated (read >= 1) and matrix-table
 * guarded (virtual/untabled sections return null), then a full_count SQO search
 * — the same engine dd_core_api.count uses. Returns null when not
 * countable/accessible so callers can tell "zero records" from "no access".
 */

import { sanitizeClientSqo } from '../concepts/sqo.ts';
import { sql } from '../db/postgres.ts';
import { getMatrixTableFromTipo } from '../ontology/resolver.ts';
import { type Principal, getPermissions } from '../security/permissions.ts';
import { buildSearchSql } from './sql_assembler.ts';

export async function countSectionRecords(
	principal: Principal,
	sectionTipo: string,
): Promise<number | null> {
	if ((await getPermissions(principal, sectionTipo, sectionTipo)) < 1) return null;
	if (!(await getMatrixTableFromTipo(sectionTipo))) return null;

	const sqo = sanitizeClientSqo({ section_tipo: [sectionTipo] });
	sqo.full_count = true;
	const { sql: builtSql, params } = await buildSearchSql(sqo, { principal });
	const rows = (await sql.unsafe(builtSql, params as (string | number | null)[])) as {
		full_count: number | string;
	}[];
	// Multi-section UNION would yield one count row per branch; a single section
	// yields one — sum for safety (PHP trait.count).
	return rows.reduce((total, row) => total + Number(row.full_count), 0);
}
