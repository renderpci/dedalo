/**
 * Format-writer contract (DIFFUSION_SPEC §4.3) — the boundary between the
 * resolution pipeline (plan × records → ProjectedRow/RecordIR) and target
 * I/O (MariaDB, files). Writers know NOTHING about ontology or resolution;
 * the pipeline knows nothing about SQL dialects or file layouts.
 *
 * Lifecycle per run: open(plan) → ensureSchema() ONCE (serialized per table;
 * DDL auto-commits in MariaDB so it must never sit inside a row transaction)
 * → writeRows()/removeRecords() per committed batch (idempotent: upserts by
 * (section_id, lang); deletes tolerate missing tables) → close() (merges/
 * zips/marker union/counts) or abort() (temp-artifact cleanup).
 */

import type { PublicationPlan, SectionPlan } from '../plan/types.ts';
import type { ProjectedRow } from '../project/lang_ladder.ts';

/** Per-batch write result (feeds the job progress + final report). */
export interface WriteBatchResult {
	written: number;
	deleted: number;
}

/** Final per-table counts for the client result payload (old engine shape). */
export interface WriterRunSummary {
	tables: { table_name: string; records_affected: number; records_count: number }[];
	errors: string[];
}

export interface WriterSession {
	/** Create/evolve the target schema for every section of the plan. */
	ensureSchema(): Promise<void>;
	/** Upsert one section's projected rows (one transaction per call). */
	writeRows(section: SectionPlan, rows: ProjectedRow[]): Promise<WriteBatchResult>;
	/** Remove published records (unpublish + delete propagation). */
	removeRecords(section: SectionPlan, sectionIds: (number | string)[]): Promise<WriteBatchResult>;
	close(): Promise<WriterRunSummary>;
	abort(): Promise<void>;
}

export interface DiffusionWriter {
	/** The ontology properties->diffusion->type this writer serves. */
	readonly format: string;
	open(plan: PublicationPlan): Promise<WriterSession>;
}
