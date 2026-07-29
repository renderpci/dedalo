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
 * Wall-clock budgets. The scan is a maintenance action an operator waits on,
 * NOT an unbounded job: without a budget one pathological table starves every
 * table after it (alphabetical order put `matrix_activity` third of 24, so the
 * other 21 were never reached). Basis: a warm full walk of `matrix` — the
 * largest table that actually holds frames — measured 18–24 s across its 99
 * batches on dedalo7_mdcat, so 45 s per table leaves headroom without letting
 * a single table run away. Exceeding a budget is NOT an error: it truncates
 * that table and says so in `coverage`.
 */
const DATAFRAME_TABLE_BUDGET_MS = 45_000;
const DATAFRAME_TOTAL_BUDGET_MS = 180_000;

/**
 * Tables the discovery pass will NOT walk, each with the reason the report
 * surfaces verbatim.
 *
 * (!) This is a NAMED, REASONED exemption list, not a silent filter — the AGENTS
 * "never silently narrow scope" rule. Every entry appears in `coverage` with
 * status 'exempt', and an exempt table makes `complete` FALSE: the scan is
 * explicitly not claiming these tables are clean, only that it chose not to
 * look.
 *
 * (!) `matrix_time_machine` is deliberately NOT here. The discovery SQL used to
 * carry `NOT IN ('matrix_time_machine')`, which was DEAD: that table has no
 * `relation` column at all (its jsonb payload is `data`), so the
 * relation-column discovery query cannot return it and never could. Listing it
 * would document a decision that is not being made — the reason it is skipped
 * is structural, not a judgement call. Do not re-add it.
 *
 * (!) The zero-frame property of the activity logs is EMPIRICAL, not
 * structural. They carry the same 15-column jsonb layout including `relation`,
 * and the ontology cannot prove a component never writes frames there (dd560,
 * the global component_iri label dataframe, is hard-coded in
 * component_iri/descriptor.ts and is unreachable by ontology recursion). Their
 * emptiness was measured three ways on dedalo7_mdcat (exhaustive GIN pass,
 * TABLESAMPLE, pg_stats MCV coverage) — measurement, which can go stale, is
 * why this is an exemption with a reason and not a deletion.
 */
export const DATAFRAME_SCAN_EXEMPT_TABLES: Readonly<Record<string, string>> = {
	matrix_activity:
		'append-only activity log (32.9M rows / 81 GB on a scale install); a full walk is ~85 s of pure I/O and cannot finish inside the statement timeout — measured zero matching rows, empirically not structurally',
	matrix_activity_diffusion:
		'append-only diffusion activity log; same shape and same reasoning as matrix_activity',
};

/** One table's outcome. `status` is the whole truth about what was examined. */
export interface TableCoverage {
	table: string;
	status: 'complete' | 'exempt' | 'no_relation_column' | 'budget_exhausted' | 'error';
	/** Required for every status that is not 'complete'. */
	reason?: string;
	rows_scanned: number;
	/** The cursor actually reached; rows above it were NOT examined. */
	last_id: number;
	batches: number;
}

/**
 * The completeness verdict — a PURE function so the tripwire can assert the
 * rule without a database.
 *
 * `complete` is true only when every discovered table was either walked to
 * exhaustion or carries no `relation` column at all (a structural fact the
 * column check proves, unlike an exemption, which is a judgement call). An
 * exemption, a budget truncation or a failed batch all make the scan
 * incomplete — so a caller can never read "0 orphans" as "database is clean"
 * without also reading `complete`.
 */
export function summarizeCoverage(coverage: TableCoverage[]): {
	complete: boolean;
	uncovered: string[];
} {
	const uncovered = coverage
		.filter((entry) => entry.status !== 'complete' && entry.status !== 'no_relation_column')
		.map((entry) => `${entry.table} [${entry.status}]: ${entry.reason ?? 'no reason given'}`);
	if (coverage.length === 0) {
		// FAIL CLOSED. An empty coverage array means the discovery pass returned
		// no tables at all — that is a broken discovery query, not a clean
		// database, and "complete: true" here would be completeness by vacuous
		// truth: the one claim this function exists to prevent.
		return {
			complete: false,
			uncovered: ['no tables were discovered — the scan examined nothing'],
		};
	}
	return { complete: uncovered.length === 0, uncovered };
}

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

	// An EXPLICIT scope (tests, a future operator-chosen run) overrides the
	// exemptions: naming a table is a deliberate choice and must win. Only the
	// discovery pass consults DATAFRAME_SCAN_EXEMPT_TABLES.
	const scoped = scopedTables !== null;
	const tableRows = scoped
		? (scopedTables as string[]).map((table) => ({ table_name: table }))
		: ((await sql.unsafe(
				`SELECT table_name FROM information_schema.columns
					 WHERE column_name = 'relation' AND data_type = 'jsonb'
					   AND table_name LIKE 'matrix%'
					 ORDER BY table_name`,
				[],
			)) as { table_name: string }[]);
	const coverage: TableCoverage[] = [];
	const scanStart = Date.now();
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
		const exemptReason = scoped ? undefined : DATAFRAME_SCAN_EXEMPT_TABLES[table];
		if (exemptReason !== undefined) {
			coverage.push({
				table,
				status: 'exempt',
				reason: exemptReason,
				rows_scanned: 0,
				last_id: 0,
				batches: 0,
			});
			continue;
		}

		const columnRows = (await sql.unsafe(
			`SELECT column_name FROM information_schema.columns
			 WHERE table_name = $1 AND data_type = 'jsonb'`,
			[table],
		)) as { column_name: string }[];
		const tableColumns = columnRows
			.map((row) => row.column_name)
			.filter((column) => dataColumns.includes(column));
		if (!tableColumns.includes('relation')) {
			coverage.push({
				table,
				status: 'no_relation_column',
				reason: 'no jsonb relation column — cannot hold frame locators (structural)',
				rows_scanned: 0,
				last_id: 0,
				batches: 0,
			});
			continue;
		}

		const selectColumns = tableColumns.map((column) => `"${column}"`).join(', ');
		const tableStart = Date.now();
		let lastId = 0;
		let batches = 0;
		let rowsScanned = 0;
		let status: TableCoverage['status'] = 'complete';
		let reason: string | undefined;

		for (;;) {
			// Budgets are checked BEFORE issuing the next batch, so the cursor
			// recorded below is exactly the last id we actually examined.
			const tableElapsed = Date.now() - tableStart;
			const totalElapsed = Date.now() - scanStart;
			if (tableElapsed > DATAFRAME_TABLE_BUDGET_MS || totalElapsed > DATAFRAME_TOTAL_BUDGET_MS) {
				status = 'budget_exhausted';
				reason =
					`stopped after ${batches} batches / ${tableElapsed}ms ` +
					`(per-table budget ${DATAFRAME_TABLE_BUDGET_MS}ms, total ${DATAFRAME_TOTAL_BUDGET_MS}ms): ` +
					`rows with id > ${lastId} were NOT examined`;
				report.errors.push(`${table} | ${reason}`);
				break;
			}

			let rows: Record<string, unknown>[];
			try {
				rows = (await sql.unsafe(
					`SELECT id, section_tipo, section_id, ${selectColumns}
					 FROM "${table}"
					 WHERE id > $1 AND (relation::text LIKE '%id_key%')
					 ORDER BY id ASC LIMIT ${DATAFRAME_BATCH_SIZE}`,
					[lastId],
				)) as Record<string, unknown>[];
			} catch (error) {
				// A cancelled batch (statement_timeout on a large table) must
				// NOT abort the whole scan: every later table would silently go
				// unexamined and the caller would get no report at all.
				status = 'error';
				reason =
					`batch at id > ${lastId} failed: ${(error as Error).message}: ` +
					`rows with id > ${lastId} were NOT examined`;
				report.errors.push(`${table} | ${reason}`);
				break;
			}
			batches++;
			if (rows.length === 0) break;

			for (const row of rows) {
				rowsScanned++;
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

		coverage.push({ table, status, reason, rows_scanned: rowsScanned, last_id: lastId, batches });
	}

	// The completeness verdict rides WITH the counts, never separately: a caller
	// that reads `orphans: 0` must be able to see, in the same object, whether
	// the scan actually looked everywhere.
	const { complete, uncovered } = summarizeCoverage(coverage);
	const outcome = complete ? 'OK' : 'PARTIAL';
	const scope = complete
		? ''
		: ` - INCOMPLETE, ${uncovered.length} of ${coverage.length} tables not fully examined`;

	return {
		result: {
			scanned: report.scanned,
			frames_checked: report.frames_checked,
			orphans: report.unresolved,
			orphan_items: report.unresolved_items,
			legacy_unmigrated: report.legacy_unmigrated,
			orphans_fixed: report.orphans_fixed,
			complete,
			coverage,
			uncovered,
			errors: report.errors,
		},
		msg: fix
			? `${outcome}. Integrity scan done. Orphans removed: ${report.orphans_fixed}${scope}`
			: `${outcome}. Integrity scan done. Orphans found: ${report.unresolved}${
					report.legacy_unmigrated > 0
						? ` - legacy (pre-migration) frames: ${report.legacy_unmigrated}`
						: ''
				}${scope}`,
		errors: report.errors,
	};
}

export const widget: WidgetModule = {
	spec: {
		id: 'dataframe_control',
		category: 'integrity',
		class: 'width_100',
		label: { kind: 'literal', text: 'Dataframe pairing integrity' },
	},
	apiActions: {
		get_value: dataframeControlGetValue,
		run_check: dataframeControlGetValue,
		run_fix: dataframeControlRunFix,
	},
	// NO `getValue` (WC-068): the module deliberately does not answer the
	// get_widget_value panel-load RQO. This scan walks EVERY matrix% table
	// end to end — on a scale install (dedalo7_mdcat: 24 tables / ~36.6M rows
	// / ~92 GB) a single invocation is ~80s of DB work that ends in a
	// statement_timeout cancel, and it was previously fired on every
	// area_maintenance page load, per admin, in both views. It is an OPERATOR
	// action now: the panel renders a "not run" state and the scan happens
	// only through apiActions.run_check / run_fix. The client peer must not
	// call get_widget_value for this widget — see the matching removal of
	// `dataframe_control.prototype.get_value` in the client module.
};
