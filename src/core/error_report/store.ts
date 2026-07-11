/**
 * Error-report intake store — the ONE owning module for the
 * dedalo_ts_error_reports table (sql_confinement T4; WC-017).
 *
 * Append-only by construction: this module exports insert/list/count plus the
 * retention prune — no UPDATE and no targeted DELETE exist, so a stored report
 * cannot be edited through any door. The retention prune (opportunistic, on
 * insert — the session_store login-attempts GC precedent) bounds total disk
 * footprint; "append-only" governs integrity WITHIN the retention window, not
 * permanence (SECURITY_DECISIONS: error-report intake).
 *
 * DDL lives twice by the migrate.ts documented model: the authoritative copy in
 * install/db/migrations/0002_error_reports.sql (applied at boot) and the lazy
 * fallback below — keep them in lockstep when evolving the table.
 */

import { config } from '../../config/config.ts';
import { sql } from '../db/postgres.ts';

export const ERROR_REPORTS_TABLE = 'dedalo_ts_error_reports';

/** Same identifier guard as migrate.ts — table names are interpolated. */
const TABLE_NAME_PATTERN = /^[a-z_][a-z0-9_]*$/;

/** Max rows one list() call may return (the admin widget pages through). */
export const LIST_MAX_LIMIT = 100;

/** What the receiver stamps + stores. source_ip/received_at are the only
 * trusted fields; everything else is the sender's self-reported claim. */
export interface ErrorReportRow {
	readonly source_ip: string;
	readonly entity: string | null;
	readonly dedalo_version: string | null;
	readonly user_id: number | null;
	readonly section_tipo: string | null;
	readonly section_id: string | null;
	readonly page_url: string | null;
	readonly description: string;
	readonly js_errors: readonly unknown[] | null;
	readonly context: Readonly<Record<string, unknown>> | null;
}

export interface StoredErrorReport extends ErrorReportRow {
	readonly id: number;
	readonly received_at: string;
}

function tableOrThrow(table: string | undefined): string {
	const name = table ?? ERROR_REPORTS_TABLE;
	if (!TABLE_NAME_PATTERN.test(name)) {
		throw new Error(`error_report store: invalid table name '${name}'`);
	}
	return name;
}

/**
 * Idempotently provision the table + list index. Lazy fallback for installs
 * where the boot migration could not run — the 0002 migration is authoritative.
 */
export async function ensureErrorReportsTable(table?: string): Promise<void> {
	const name = tableOrThrow(table);
	await sql.unsafe(
		`CREATE TABLE IF NOT EXISTS "${name}" (
			id             bigserial PRIMARY KEY,
			received_at    timestamptz NOT NULL DEFAULT now(),
			source_ip      text        NOT NULL,
			entity         text,
			dedalo_version text,
			user_id        integer,
			section_tipo   text,
			section_id     text,
			page_url       text,
			description    text        NOT NULL,
			js_errors      jsonb,
			context        jsonb
		)`,
		[],
	);
	await sql.unsafe(
		`CREATE INDEX IF NOT EXISTS "${name}_received_idx" ON "${name}" (received_at DESC)`,
		[],
	);
}

/**
 * Append one report and return its id. Afterwards, opportunistically prune
 * rows older than the retention window (config errorReport.retentionDays,
 * 0 = keep forever) — best-effort: a prune failure never fails the insert.
 */
export async function insertErrorReport(
	report: ErrorReportRow,
	options?: { table?: string; retentionDays?: number },
): Promise<number> {
	const name = tableOrThrow(options?.table);
	const rows = (await sql.unsafe(
		`INSERT INTO "${name}"
			(source_ip, entity, dedalo_version, user_id, section_tipo, section_id,
			 page_url, description, js_errors, context)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::text::jsonb, $10::text::jsonb)
		 RETURNING id`,
		[
			report.source_ip,
			report.entity,
			report.dedalo_version,
			report.user_id,
			report.section_tipo,
			report.section_id,
			report.page_url,
			report.description,
			report.js_errors === null ? null : JSON.stringify(report.js_errors),
			report.context === null ? null : JSON.stringify(report.context),
		],
	)) as { id: number }[];

	const retentionDays = options?.retentionDays ?? config.errorReport.retentionDays;
	if (retentionDays > 0) {
		try {
			await sql.unsafe(
				`DELETE FROM "${name}" WHERE received_at < now() - make_interval(days => $1)`,
				[retentionDays],
			);
		} catch (error) {
			console.warn('[error_report] retention prune failed', error);
		}
	}

	return Number(rows[0]?.id);
}

/** Newest-first page of stored reports for the admin widget. */
export async function listErrorReports(options?: {
	offset?: number;
	limit?: number;
	table?: string;
}): Promise<StoredErrorReport[]> {
	const name = tableOrThrow(options?.table);
	const limit = Math.min(LIST_MAX_LIMIT, Math.max(1, options?.limit ?? 25));
	const offset = Math.max(0, options?.offset ?? 0);
	return (await sql.unsafe(
		`SELECT id, received_at::text AS received_at, source_ip, entity, dedalo_version,
				user_id, section_tipo, section_id, page_url, description, js_errors, context
		 FROM "${name}"
		 ORDER BY received_at DESC, id DESC
		 LIMIT $1 OFFSET $2`,
		[limit, offset],
	)) as StoredErrorReport[];
}

/** Total stored reports (the admin widget's counter). */
export async function countErrorReports(table?: string): Promise<number> {
	const name = tableOrThrow(table);
	const rows = (await sql.unsafe(`SELECT count(*)::int AS total FROM "${name}"`, [])) as {
		total: number;
	}[];
	return Number(rows[0]?.total ?? 0);
}
