/**
 * MariaDB SQL writer — the 'sql' DiffusionWriter (DIFFUSION_SPEC §4.3).
 *
 * Consumes ProjectedRows (the lang ladder's output) and lands them in the
 * plan's target database through src/diffusion/targets/mariadb/ — the only
 * MariaDB surface in the tree. The writer knows the PLAN (tables, columns),
 * never the ontology.
 *
 * Session lifecycle (WriterSession contract, writers/types.ts):
 * - open(plan): pool for plan.target.database + LOUD reachability probe —
 *   a missing/ungranted database is MissingTargetDatabaseError (typed config
 *   failure at open, before any schema or row work; never auto-created).
 * - ensureSchema(): ONCE per run, serialized table by table: CREATE TABLE IF
 *   NOT EXISTS → INFORMATION_SCHEMA column diff → additive ALTER ADD. DDL
 *   auto-commits in MariaDB, so this NEVER runs inside a row transaction
 *   (plan D5.7) — deliberately unlike the old engine, which re-ran
 *   create/ensure inside every insert_table_data transaction.
 * - writeRows(): multi-row upserts (~DEDALO_DIFFUSION_BATCH_ROWS rows per
 *   statement, byte-budget capped) inside ONE transaction per call — the
 *   old engine's one-INSERT-per-record loop is deliberately replaced.
 * - removeRecords(): batched DELETE by section_id; a missing table/database
 *   (errno 1146/1049) is a tolerated no-op — the old engine's delete
 *   posture, kept verbatim.
 * - close(): per-table {table_name, records_affected, records_count} — the
 *   old engine's engine_response.tables shape (lib/types.ts:186), which the
 *   byte-identical client renders.
 * - abort(): no-op — SQL work is transactional; anything uncommitted was
 *   already rolled back by the failed writeRows call.
 */

import { readEnv } from '../../config/env.ts';
import { readString } from '../../config/readers.ts';
import type { PublicationPlan, SectionPlan } from '../plan/types.ts';
import type { ProjectedRow } from '../project/lang_ladder.ts';
import {
	getTargetPool,
	isMissingDatabaseError,
	isMissingTableError,
	probeTargetDatabase,
} from '../targets/mariadb/db.ts';
import type { MariadbExecResult } from '../targets/mariadb/db.ts';
import {
	DEFAULT_UPSERT_BATCH_BYTES,
	DEFAULT_UPSERT_BATCH_ROWS,
	generateAddColumns,
	generateBatchUpsert,
	generateColumnsQuery,
	generateCreateTable,
	generateDelete,
	planUpsertBatches,
	tableColumnFields,
} from '../targets/mariadb/sql_generator.ts';
import { applyTableState } from '../targets/mediastore/media_index.ts';
import type {
	DiffusionWriter,
	WriteBatchResult,
	WriterRunSummary,
	WriterSession,
} from './types.ts';

/** Max section_ids per DELETE statement (IN-list kept boring and bounded). */
const DELETE_BATCH_IDS = 500;

/** Per-table running counters feeding the close() summary. */
interface TableCounters {
	records_affected: number;
	records_count: number;
}

/** Row cap per upsert statement (plan D1: DEDALO_DIFFUSION_BATCH_ROWS, default 200). */
function upsertBatchRows(): number {
	const configured = Number(readString('DEDALO_DIFFUSION_BATCH_ROWS'));
	return Number.isFinite(configured) && configured > 0
		? Math.floor(configured)
		: DEFAULT_UPSERT_BATCH_ROWS;
}

class MariadbWriterSession implements WriterSession {
	private readonly plan: PublicationPlan;
	private readonly database: string;
	/** Insertion-ordered so close() reports tables in plan order. */
	private readonly counters = new Map<string, TableCounters>();
	private readonly errors: string[] = [];
	private schemaEnsured = false;

	constructor(plan: PublicationPlan, database: string) {
		this.plan = plan;
		this.database = database;
		for (const section of plan.sections) {
			this.counters.set(section.tableName, { records_affected: 0, records_count: 0 });
		}
	}

	private countersFor(tableName: string): TableCounters {
		let counters = this.counters.get(tableName);
		if (counters === undefined) {
			counters = { records_affected: 0, records_count: 0 };
			this.counters.set(tableName, counters);
		}
		return counters;
	}

	/**
	 * Schema critical section: serialized per table, strictly BEFORE any DML.
	 * Additive only — existing columns are never retyped or dropped.
	 */
	async ensureSchema(): Promise<void> {
		const pool = getTargetPool(this.database);
		for (const section of this.plan.sections) {
			// 1. Table with the full plan anatomy (no-op when it already exists).
			await pool.unsafe(generateCreateTable(section), []);

			// 2. Diff live columns against the plan (covers pre-existing tables).
			const columnsQuery = generateColumnsQuery(this.database, section.tableName);
			const rows = (await pool.unsafe(columnsQuery.sql, columnsQuery.params)) as {
				COLUMN_NAME: string;
			}[];
			const existingColumns = new Set(rows.map((row) => row.COLUMN_NAME));

			// 3. Additive ALTER ADD for every plan column the table lacks.
			const missingColumns = tableColumnFields(section)
				.map((field) => field.columnName)
				.filter((columnName) => !existingColumns.has(columnName));
			for (const alterSql of generateAddColumns(section, missingColumns)) {
				await pool.unsafe(alterSql, []);
			}
		}
		this.schemaEnsured = true;
	}

	/**
	 * Upsert one section's projected rows: byte-capped multi-row statements,
	 * ONE transaction for the whole call (a write-batch is atomic; a failure
	 * rolls back the entire call and propagates to the runner).
	 */
	async writeRows(section: SectionPlan, rows: ProjectedRow[]): Promise<WriteBatchResult> {
		if (rows.length === 0) return { written: 0, deleted: 0 };
		if (!this.schemaEnsured) {
			const reason =
				'schema-ensure is a serialized run-start step (DDL auto-commits, never mid-DML)';
			throw new Error(
				`mariadb_sql writer: writeRows('${section.tableName}') before ensureSchema() — ${reason}`,
			);
		}

		const columnNames = tableColumnFields(section).map((field) => field.columnName);
		const batches = planUpsertBatches(rows, columnNames, {
			maxRowsPerStatement: upsertBatchRows(),
			maxBytesPerStatement: DEFAULT_UPSERT_BATCH_BYTES,
		});

		const pool = getTargetPool(this.database);
		let affectedRows = 0;
		await pool.begin(async (transaction) => {
			for (const batch of batches) {
				const statement = generateBatchUpsert(section.tableName, columnNames, batch);
				const result = (await transaction.unsafe(
					statement.sql,
					statement.params,
				)) as MariadbExecResult;
				affectedRows += result.affectedRows ?? 0;
			}
		});

		const counters = this.countersFor(section.tableName);
		counters.records_affected += affectedRows;
		counters.records_count += rows.length;

		// S2-31: mirror the committed publish into the media marker store
		// (oracle index.ts:213 — after the write, per table; marker failures
		// are reported but never fail the diffusion, index.ts:212-224).
		try {
			const publishedIds = [...new Set(rows.map((row) => row.sectionId))];
			await applyTableState(
				this.database,
				section.tableName,
				section.sectionTipo,
				publishedIds,
				[],
			);
		} catch (error) {
			console.error(
				`[media_index] marker publish failed for ${this.database}.${section.tableName} (rows committed; markers heal on next reconcile/rebuild):`,
				error,
			);
		}
		return { written: rows.length, deleted: 0 };
	}

	/**
	 * Remove published records (unpublish sentinel + delete propagation). A
	 * missing table or database means "nothing was ever published there" —
	 * tolerated as a zero-row no-op (oracle errno 1146/1049 posture).
	 */
	async removeRecords(
		section: SectionPlan,
		sectionIds: (number | string)[],
	): Promise<WriteBatchResult> {
		if (sectionIds.length === 0) return { written: 0, deleted: 0 };

		const pool = getTargetPool(this.database);
		let deletedRows = 0;
		for (let offset = 0; offset < sectionIds.length; offset += DELETE_BATCH_IDS) {
			const idsBatch = sectionIds.slice(offset, offset + DELETE_BATCH_IDS);
			const statement = generateDelete(section.tableName, idsBatch);
			try {
				const result = (await pool.unsafe(statement.sql, statement.params)) as MariadbExecResult;
				deletedRows += result.affectedRows ?? 0;
			} catch (error) {
				if (isMissingTableError(error) || isMissingDatabaseError(error)) {
					break; // nothing published there — tolerated no-op
				}
				throw error;
			}
		}

		this.countersFor(section.tableName).records_affected += deletedRows;

		// S2-31: drop the markers for the unpublished ids (same posture as the
		// publish-side apply above — logged, never failing the run).
		try {
			await applyTableState(this.database, section.tableName, section.sectionTipo, [], sectionIds);
		} catch (error) {
			console.error(
				`[media_index] marker removal failed for ${this.database}.${section.tableName} (rows removed; markers heal on next reconcile/rebuild):`,
				error,
			);
		}
		return { written: 0, deleted: deletedRows };
	}

	/** Final per-table counts — the old engine_response.tables shape. */
	async close(): Promise<WriterRunSummary> {
		return {
			tables: [...this.counters.entries()].map(([tableName, counters]) => ({
				table_name: tableName,
				records_affected: counters.records_affected,
				records_count: counters.records_count,
			})),
			errors: [...this.errors],
		};
	}

	/**
	 * Nothing to clean for SQL: every write ran inside a transaction that
	 * either committed or already rolled back; schema DDL is idempotent and
	 * additive. Pools are process-cached, not session-owned.
	 */
	async abort(): Promise<void> {
		// no-op by design
	}
}

/** The 'sql' format writer (registry entry; 'socrata' aliases it, dormant). */
export const mariadbSqlWriter: DiffusionWriter = {
	format: 'sql',
	async open(plan: PublicationPlan): Promise<WriterSession> {
		if (plan.target.kind !== 'table') {
			throw new Error(
				`mariadb_sql writer requires a 'table' target, got '${plan.target.kind}' ` +
					`(element ${plan.elementTipo})`,
			);
		}
		// Loud config gate: unreachable/ungranted database fails the run HERE.
		await probeTargetDatabase(plan.target.database);
		return new MariadbWriterSession(plan, plan.target.database);
	},
};
