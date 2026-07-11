/**
 * Raw record/component read (PHP dd_core_api::read_raw).
 *
 * read_raw returns the UNRESOLVED stored value(s) for the records a SQO matches
 * — no component resolution, labels, or subdatum. It is the low-level accessor
 * the client uses when it needs the exact jsonb a record holds:
 * - type 'component' → for each matched record, the raw value of ONE component
 *   (the tipo's slice of its model's jsonb column), or null when absent;
 * - type 'section'   → the matched rows' jsonb columns (fetch_all);
 * - type 'target_section' → walk every matched row's relation column and
 *   collect the stored locators whose section_tipo === options.tipo (the
 *   relation-locator harvest tool_export and delete propagation use).
 *
 * Permission: read (>= 1) on each SQO target section, enforced by the caller.
 */

import type { Sqo } from '../../concepts/sqo.ts';
import { sanitizeClientSqo } from '../../concepts/sqo.ts';
import { MATRIX_JSONB_COLUMNS } from '../../db/matrix.ts';
import { readMatrixRecord } from '../../db/matrix.ts';
import { sql } from '../../db/postgres.ts';
import {
	getColumnNameByModel,
	getMatrixTableFromTipo,
	getModelByTipo,
} from '../../ontology/resolver.ts';
import { buildSearchSql } from '../../search/sql_assembler.ts';
import type { Principal } from '../../security/permissions.ts';

export interface ReadRawResult {
	result: unknown[];
	/** The matrix table the primary section lives in (PHP response->table). */
	table: string | null;
}

export interface ReadRawInput {
	sectionTipo: string;
	tipo: string;
	/** Runtime model (defaults to the tipo's ontology model). */
	model?: string;
	/** 'component' (default) | 'section'. */
	type?: string;
	sqo?: Sqo;
}

/**
 * Resolve raw stored values for a SQO's matched records. `principal` scopes the
 * search (per-record projects ACL for non-admins), exactly as a normal read.
 */
export async function readRaw(input: ReadRawInput, principal?: Principal): Promise<ReadRawResult> {
	const table = await getMatrixTableFromTipo(input.sectionTipo);
	const type = input.type ?? 'component';
	const rawData: unknown[] = [];

	if (input.sqo === undefined) {
		return { result: rawData, table };
	}

	// Run the search (Phase 3 engine) — the matched record coordinates.
	const sqo = sanitizeClientSqo(structuredClone(input.sqo) as Record<string, unknown>);
	const { sql: builtSql, params } = await buildSearchSql(sqo, { principal });
	const rows = (await sql.unsafe(builtSql, params as (string | number | null)[])) as {
		section_tipo: string;
		section_id: number;
	}[];

	if (type === 'component') {
		const model = input.model ?? (await getModelByTipo(input.tipo));
		if (model === null) {
			throw new Error(`readRaw: cannot resolve model for tipo '${input.tipo}'`);
		}
		const columnName = getColumnNameByModel(model);
		if (columnName === null) {
			throw new Error(`readRaw: cannot resolve data column from model '${model}'`);
		}
		for (const row of rows) {
			const recordTable = (await getMatrixTableFromTipo(row.section_tipo)) ?? 'matrix';
			const record = await readMatrixRecord(recordTable, row.section_tipo, row.section_id);
			const column = record?.columns[columnName as (typeof MATRIX_JSONB_COLUMNS)[number]] as
				| Record<string, unknown>
				| null
				| undefined;
			rawData.push(column?.[input.tipo] ?? null);
		}
		return { result: rawData, table };
	}

	if (type === 'section') {
		// fetch_all: the matched rows' jsonb columns (PHP db_result->fetch_all()).
		for (const row of rows) {
			const recordTable = (await getMatrixTableFromTipo(row.section_tipo)) ?? 'matrix';
			const record = await readMatrixRecord(recordTable, row.section_tipo, row.section_id);
			const fullRow: Record<string, unknown> = {
				section_id: row.section_id,
				section_tipo: row.section_tipo,
			};
			for (const column of MATRIX_JSONB_COLUMNS) {
				fullRow[column] = record?.columns[column] ?? null;
			}
			rawData.push(fullRow);
		}
		return { result: rawData, table };
	}

	if (type === 'target_section') {
		// Every stored locator (any component key, any position) whose
		// section_tipo equals the requested tipo, in row → key → item order
		// (PHP nested foreach over the relation object).
		for (const row of rows) {
			const recordTable = (await getMatrixTableFromTipo(row.section_tipo)) ?? 'matrix';
			const record = await readMatrixRecord(recordTable, row.section_tipo, row.section_id);
			const relation = (record?.columns.relation ?? null) as Record<string, unknown[]> | null;
			if (relation === null) continue;
			for (const componentEntries of Object.values(relation)) {
				if (!Array.isArray(componentEntries)) continue;
				for (const locator of componentEntries) {
					if ((locator as { section_tipo?: string } | null)?.section_tipo === input.tipo) {
						rawData.push(locator);
					}
				}
			}
		}
		return { result: rawData, table };
	}

	throw new Error(
		`readRaw: type '${type}' not implemented (covered: 'component', 'section', 'target_section')`,
	);
}
