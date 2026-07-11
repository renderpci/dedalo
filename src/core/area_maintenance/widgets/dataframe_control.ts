/**
 * dataframe_control widget — the dd490 pairing integrity scan + orphan fix
 * (PHP widgets/dataframe_control wrapping dataframe_v7_migration::integrity_check).
 */

import { sql } from '../../db/postgres.ts';
import { getModelByTipo } from '../../ontology/resolver.ts';
import type { WidgetModule, WidgetResponse } from './support.ts';

/** Models whose column is 'relation' (PHP get_components_with_relations). */
async function isRelationModel(model: string | null): Promise<boolean> {
	if (model === null || model === '') return true; // PHP empty() → true
	const { getColumnNameByModel } = await import('../../ontology/resolver.ts');
	return getColumnNameByModel(model) === 'relation';
}

const DATAFRAME_MAX_REPORT_ITEMS = 500;
const DATAFRAME_BATCH_SIZE = 500;

/**
 * dataframe_control.get_value / run_check — the READ-ONLY dd490 pairing
 * integrity scan (PHP dataframe_v7_migration::integrity_check(null, false)
 * behind the widget's build_response): every relation entry that carries
 * pairing keys (id_key/section_id_key + main_component_tipo +
 * from_component_tipo) must find a main item with its id in some data column
 * of the SAME row; unmatched frames report as orphans (details capped at
 * 500).
 */
async function dataframeControlGetValue(): Promise<WidgetResponse> {
	return dataframeControlScan(false, null);
}

/**
 * dataframe_control.run_fix — the SAME scan with orphan REMOVAL: unpaired
 * frame locators are stripped from their relation arrays and the row is
 * updated in place (PHP integrity_check(null, true)). Gated on a scoped
 * scratch fixture (matrix_test) — the API call covers every matrix table.
 */
async function dataframeControlRunFix(): Promise<WidgetResponse> {
	return dataframeControlScan(true, null);
}

export async function dataframeControlScan(
	fix: boolean,
	scopedTables: string[] | null,
): Promise<WidgetResponse> {
	const report = {
		scanned: 0,
		frames_checked: 0,
		legacy_unmigrated: 0,
		unresolved: 0,
		unresolved_items: [] as string[],
		orphans_fixed: 0,
		rows_changed: 0,
		errors: [] as string[],
	};

	const tableRows =
		scopedTables !== null
			? scopedTables.map((table) => ({ table_name: table }))
			: ((await sql.unsafe(
					`SELECT table_name FROM information_schema.columns
					 WHERE column_name = 'relation' AND data_type = 'jsonb'
					   AND table_name LIKE 'matrix%'
					   AND table_name NOT IN ('matrix_time_machine')
					 ORDER BY table_name`,
					[],
				)) as { table_name: string }[]);
	const dataColumns = [
		'relation',
		'string',
		'date',
		'iri',
		'geo',
		'number',
		'media',
		'misc',
		'data',
	];

	for (const { table_name: table } of tableRows) {
		const columnRows = (await sql.unsafe(
			`SELECT column_name FROM information_schema.columns
			 WHERE table_name = $1 AND data_type = 'jsonb'`,
			[table],
		)) as { column_name: string }[];
		const tableColumns = columnRows
			.map((row) => row.column_name)
			.filter((column) => dataColumns.includes(column));
		if (!tableColumns.includes('relation')) continue;

		const selectColumns = tableColumns.map((column) => `"${column}"`).join(', ');
		let lastId = 0;
		for (;;) {
			const rows = (await sql.unsafe(
				`SELECT id, section_tipo, section_id, ${selectColumns}
				 FROM "${table}"
				 WHERE id > $1 AND (relation::text LIKE '%id_key%')
				 ORDER BY id ASC LIMIT ${DATAFRAME_BATCH_SIZE}`,
				[lastId],
			)) as Record<string, unknown>[];
			if (rows.length === 0) break;

			for (const row of rows) {
				lastId = Number(row.id);
				report.scanned++;
				const relation = row.relation as Record<string, unknown> | null;
				if (relation === null || typeof relation !== 'object' || Array.isArray(relation)) {
					continue;
				}
				const findMainItems = (mainTipo: string): unknown[] | null => {
					for (const column of tableColumns) {
						const columnData = row[column] as Record<string, unknown> | null;
						if (
							columnData !== null &&
							typeof columnData === 'object' &&
							!Array.isArray(columnData) &&
							Array.isArray(columnData[mainTipo])
						) {
							return columnData[mainTipo] as unknown[];
						}
					}
					return null;
				};
				const contextRef = `${table} ${row.section_tipo}_${row.section_id}`;
				const orphansOfRow: unknown[] = [];

				for (const entries of Object.values(relation)) {
					if (!Array.isArray(entries)) continue;
					for (const el of entries as {
						id_key?: unknown;
						section_id_key?: unknown;
						main_component_tipo?: unknown;
						from_component_tipo?: unknown;
						section_tipo?: unknown;
						section_id?: unknown;
					}[]) {
						// only dataframe pairing locators are checked
						if (
							el === null ||
							typeof el !== 'object' ||
							!(
								(el.id_key !== undefined || el.section_id_key !== undefined) &&
								el.main_component_tipo !== undefined &&
								el.from_component_tipo !== undefined
							)
						) {
							continue;
						}
						report.frames_checked++;

						if (el.id_key === undefined) {
							const mainModel = await getModelByTipo(String(el.main_component_tipo));
							if (await isRelationModel(mainModel)) {
								report.legacy_unmigrated++;
								continue;
							}
						}

						const key = Number(el.id_key ?? el.section_id_key);
						const mainItems = findMainItems(String(el.main_component_tipo));
						let paired = false;
						if (Array.isArray(mainItems)) {
							for (const item of mainItems as {
								id?: unknown;
								id_key?: unknown;
								section_id_key?: unknown;
							}[]) {
								if (
									item !== null &&
									typeof item === 'object' &&
									item.id !== undefined &&
									Number(item.id) === key &&
									item.id_key === undefined &&
									item.section_id_key === undefined
								) {
									paired = true;
									break;
								}
							}
						}
						if (!paired) {
							report.unresolved++;
							if (report.unresolved_items.length < DATAFRAME_MAX_REPORT_ITEMS) {
								report.unresolved_items.push(
									`${contextRef} | ORPHAN frame: main ${el.main_component_tipo}` +
										` has no item id ${key} (slot ${el.from_component_tipo},` +
										` target ${el.section_tipo ?? '?'}_${el.section_id ?? '?'})`,
								);
							}
							if (fix) {
								orphansOfRow.push(el);
							}
						}
					}
				}
				if (fix && orphansOfRow.length > 0) {
					// S2-06: NOT a full-column overwrite from this (possibly stale)
					// scan snapshot — fixDataframeOrphanEntries re-reads the row FOR
					// UPDATE in a transaction and strips the orphans per component
					// KEY (updateMatrixKeysData), so concurrent saves to the same
					// record are never reverted. Entries edited since the scan no
					// longer match their signature and are left for the next run.
					try {
						const { fixDataframeOrphanEntries } = await import('../../relations/dataframe.ts');
						const removed = await fixDataframeOrphanEntries(
							table,
							String(row.section_tipo),
							Number(row.section_id),
							orphansOfRow as Record<string, unknown>[],
						);
						report.orphans_fixed += removed;
						if (removed > 0) report.rows_changed++;
					} catch (error) {
						report.errors.push(`${contextRef} | fix failed: ${(error as Error).message}`);
					}
				}
			}
		}
	}

	return {
		result: {
			scanned: report.scanned,
			frames_checked: report.frames_checked,
			orphans: report.unresolved,
			orphan_items: report.unresolved_items,
			legacy_unmigrated: report.legacy_unmigrated,
			orphans_fixed: report.orphans_fixed,
			errors: report.errors,
		},
		msg: fix
			? `OK. Integrity scan done. Orphans removed: ${report.orphans_fixed}`
			: `OK. Integrity scan done. Orphans found: ${report.unresolved}${
					report.legacy_unmigrated > 0
						? ` - legacy (pre-migration) frames: ${report.legacy_unmigrated}`
						: ''
				}`,
		errors: report.errors,
	};
}

export const widget: WidgetModule = {
	spec: {
		id: 'dataframe_control',
		category: 'integrity',
		class: 'width_100',
		label: { kind: 'literal', text: 'DATAFRAME PAIRING INTEGRITY' },
	},
	apiActions: {
		get_value: dataframeControlGetValue,
		run_check: dataframeControlGetValue,
		run_fix: dataframeControlRunFix,
	},
	getValue: dataframeControlGetValue,
};
