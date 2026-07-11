/**
 * schema_probe — one-round-trip schema/engine health readout for status
 * surfaces (the check_config maintenance widget's "Database details" block,
 * WC-027). Lives in db/ (the raw-SQL home) so callers never query dd_ontology
 * directly (T3 read-consolidation ratchet, S2-19): this is a schema-EXISTENCE
 * probe, not an ontology read — `to_regclass` guards every optional table so
 * a fresh/half-migrated DB answers nulls instead of throwing.
 */

import { sql } from './postgres.ts';

export interface SchemaProbeRow {
	/** Engine name + version, e.g. "PostgreSQL 16.3". */
	server: string | null;
	/** dd_ontology table exists. */
	onto: boolean;
	/** dd_ontology row count (null when the table is absent). */
	onto_rows: number | null;
	/** Materialised matrix_* table count. */
	matrix_tables: number | null;
	/** Applied TS schema-migration count (null before the migrations table exists). */
	mig_n: number | null;
	/** Highest applied TS schema-migration version. */
	mig_latest: string | null;
}

/** Probe engine version, ontology presence/rows, matrix-table count and the
 * TS-owned migration level in ONE round-trip. Throws on connection failure —
 * status callers catch and render the fields as absent (fail-soft is theirs). */
export async function probeSchemaHealth(): Promise<SchemaProbeRow | null> {
	const rows = (await sql.unsafe(
		`SELECT
			split_part(version(), ' ', 1) || ' ' || split_part(version(), ' ', 2) AS server,
			to_regclass('public.dd_ontology') IS NOT NULL AS onto,
			CASE WHEN to_regclass('public.dd_ontology') IS NOT NULL
				THEN (SELECT count(*)::int FROM dd_ontology) END AS onto_rows,
			(SELECT count(*)::int FROM information_schema.tables
				WHERE table_schema = 'public' AND table_name ~ '^matrix_') AS matrix_tables,
			CASE WHEN to_regclass('public.dedalo_ts_schema_migrations') IS NOT NULL
				THEN (SELECT count(*)::int FROM dedalo_ts_schema_migrations) END AS mig_n,
			CASE WHEN to_regclass('public.dedalo_ts_schema_migrations') IS NOT NULL
				THEN (SELECT max(version) FROM dedalo_ts_schema_migrations) END AS mig_latest`,
		[],
	)) as SchemaProbeRow[];
	return rows[0] ?? null;
}
