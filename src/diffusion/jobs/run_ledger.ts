/**
 * THE RUN LEDGER STORE (DIFF-1) — every SQL statement on the job-scoped run
 * ledger table (schema.ts DIFFUSION_JOB_LEDGER_TABLE) lives here, in the jobs
 * family.
 *
 * What it holds: the run-state events of ONE job, keyed (job_id, batch_seq,
 * ord) — the resolver's frontier transitions (`queue` / `open` / `used`,
 * resolve/frontier_ledger.ts) and the writer's per-record artifacts (`wrote` /
 * `removed`, writers/types.ts ArtifactEvent). The runner appends one batch's
 * events in the batch's own fenced transaction, together with its checkpoint:
 * the ledger is exactly as far as the committed checkpoint, never further,
 * never behind. A resumed runner replays the frontier half (readRunLedger →
 * replayFrontier) and the close unit reads the artifact half as the run's
 * MANIFEST (openArtifactManifest, removedIdsFor). A completed run clears it.
 *
 * Every write is SELF-FENCED on the lease (`attempt = $epoch AND state =
 * 'running'` on the job row, inside the statement): a runner whose lease was
 * revoked appends and clears nothing, even outside the batch fence.
 */

import { randomUUID } from 'node:crypto';
import { encodeForJsonb } from '../../core/db/json_codec.ts';
import { isInTransaction, sql } from '../../core/db/postgres.ts';
import { DedaloError } from '../../core/errors/index.ts';
import type { RunLedgerEvent } from '../resolve/frontier_ledger.ts';
import type { ArtifactEvent, ManifestEntry } from '../writers/types.ts';
import type { JobLease } from './queue.ts';
import { DIFFUSION_JOB_LEDGER_TABLE, DIFFUSION_JOBS_TABLE } from './schema.ts';

/** Rows per page / FETCH of the ledger readers (bounded memory whatever the run's size). */
export const LEDGER_PAGE_ROWS = 5000;

/**
 * Reader options. `pageRows` exists so a gate can drive the keyset / cursor
 * loops across MANY pages with a small ledger (a real run crosses the default
 * page at a few thousand records; the paging is otherwise only exercised in
 * production). No production caller passes it.
 */
export interface LedgerReadOptions {
	pageRows?: number;
}

function pageRowsOf(options: LedgerReadOptions | undefined): number {
	const rows = options?.pageRows ?? LEDGER_PAGE_ROWS;
	if (!Number.isInteger(rows) || rows < 1) {
		throw new DedaloError('internal.invariant', {
			message: `run ledger: pageRows must be a positive integer (got ${rows})`,
		});
	}
	return rows;
}

/** Either half of a batch's events. */
export type RunLedgerEntry = RunLedgerEvent | ArtifactEvent;

/**
 * The IR's record id, stored as it came (jsonb): the ledger adds no id type of
 * its own — a frontier tells 940101 from '940101', so must its replay.
 */
type IrSectionId = ManifestEntry['sectionId'];

/** The stored row of one event (snake_case, jsonb section_id). */
interface StoredEvent {
	kind: string;
	level: number | null;
	section_tipo: string;
	section_id: IrSectionId | null;
}

function toStored(entry: RunLedgerEntry): StoredEvent {
	if ('op' in entry) {
		return {
			kind: entry.op,
			level: null,
			section_tipo: entry.sectionTipo,
			section_id: entry.sectionId,
		};
	}
	return {
		kind: entry.kind,
		level: entry.level ?? null,
		section_tipo: entry.sectionTipo,
		section_id: entry.sectionId ?? null,
	};
}

/**
 * Append one batch's events (ordered). ONE self-fenced statement: the rows are
 * inserted only while the lease holds, and all or none of them land. A
 * revoked lease is the typed `diffusion.lease_revoked`; a re-append of the same
 * batch is a primary-key violation (the runner numbers its batches).
 */
export async function appendRunLedger(
	lease: JobLease,
	batchSeq: number,
	events: readonly RunLedgerEntry[],
): Promise<void> {
	if (events.length === 0) return;
	const rows = (await sql.unsafe(
		`WITH appended AS (
			INSERT INTO "${DIFFUSION_JOB_LEDGER_TABLE}"
				(job_id, batch_seq, ord, kind, level, section_tipo, section_id)
			SELECT j.job_id, $3::int, e.ord::int, e.v->>'kind', (e.v->>'level')::int,
			       e.v->>'section_tipo', e.v->'section_id'
			  FROM "${DIFFUSION_JOBS_TABLE}" j,
			       jsonb_array_elements($4::text::jsonb) WITH ORDINALITY e(v, ord)
			 WHERE j.job_id = $1 AND j.attempt = $2::int AND j.state = 'running'
			RETURNING 1
		 )
		 SELECT count(*)::int AS n FROM appended`,
		[lease.job_id, lease.attempt, batchSeq, encodeForJsonb(events.map(toStored))],
	)) as { n: number }[];
	const appended = rows[0]?.n ?? 0;
	if (appended === 0) {
		throw new DedaloError('diffusion.lease_revoked', {
			coordinates: { job: lease.job_id, attempt: lease.attempt, operation: 'appendRunLedger' },
		});
	}
	if (appended !== events.length) {
		throw new DedaloError('internal.invariant', {
			message: `run ledger: batch ${batchSeq} appended ${appended} of ${events.length} events`,
		});
	}
}

/**
 * Delete the job's ledger — SELF-FENCED (runs before the terminal transition,
 * in the same transaction: a completed run's ledger is gone with it; a reset
 * run starts over).
 */
export async function clearRunLedger(lease: JobLease): Promise<void> {
	await sql.unsafe(
		`DELETE FROM "${DIFFUSION_JOB_LEDGER_TABLE}" ledger
		 WHERE ledger.job_id = $1
		   AND EXISTS (SELECT 1 FROM "${DIFFUSION_JOBS_TABLE}" j
		               WHERE j.job_id = $1 AND j.attempt = $2::int AND j.state = 'running')`,
		[lease.job_id, lease.attempt],
	);
}

/**
 * The job's FRONTIER events (queue / open / used), in ledger order, as an async
 * keyset-paged stream — the input of replayFrontier. Needs no transaction.
 */
export async function* readRunLedger(
	jobId: string,
	options?: LedgerReadOptions,
): AsyncIterable<RunLedgerEvent> {
	const pageRows = pageRowsOf(options);
	let afterSeq = -1;
	let afterOrd = -1;
	for (;;) {
		const rows = (await sql.unsafe(
			`SELECT batch_seq, ord, kind, level, section_tipo, section_id
			   FROM "${DIFFUSION_JOB_LEDGER_TABLE}"
			  WHERE job_id = $1 AND kind IN ('queue','open','used')
			    AND (batch_seq, ord) > ($2::int, $3::int)
			  ORDER BY batch_seq, ord
			  LIMIT ${pageRows}`,
			[jobId, afterSeq, afterOrd],
		)) as (StoredEvent & { batch_seq: number; ord: number })[];
		for (const row of rows) {
			const event: RunLedgerEvent = {
				kind: row.kind as RunLedgerEvent['kind'],
				sectionTipo: row.section_tipo,
			};
			if (row.level !== null) event.level = row.level;
			if (row.section_id !== null) event.sectionId = row.section_id;
			yield event;
		}
		if (rows.length < pageRows) return;
		const last = rows[rows.length - 1] as { batch_seq: number; ord: number };
		afterSeq = last.batch_seq;
		afterOrd = last.ord;
	}
}

/** Stream a query through a server-side cursor of the ambient transaction. */
async function* cursorRows<T>(
	query: string,
	params: unknown[],
	door: string,
	pageRows: number,
): AsyncIterable<T> {
	if (!isInTransaction()) {
		throw new DedaloError('internal.invariant', {
			message: `run ledger: ${door} reads through a cursor and needs the close unit's transaction`,
		});
	}
	// One name per call: several cursors may be open in one close transaction.
	const cursor = `run_ledger_${randomUUID().replaceAll('-', '')}`;
	await sql.unsafe(`DECLARE ${cursor} NO SCROLL CURSOR FOR ${query}`, params);
	try {
		for (;;) {
			const rows = (await sql.unsafe(`FETCH ${pageRows} FROM ${cursor}`)) as T[];
			yield* rows;
			if (rows.length < pageRows) return;
		}
	} finally {
		await sql.unsafe(`CLOSE ${cursor}`);
	}
}

/**
 * The run's ARTIFACT MANIFEST, in the order a Set replay of its `wrote` /
 * `removed` events gives (a wrote adds a record if absent, a removed deletes
 * it): the records whose LAST artifact event is a write, each ordered by its
 * first write after its last removal. Ids of different JSON types are
 * different records. Streamed through a cursor — call it inside the close
 * unit's transaction.
 */
export function openArtifactManifest(
	jobId: string,
	options?: LedgerReadOptions,
): AsyncIterable<ManifestEntry> {
	const pageRows = pageRowsOf(options);
	return (async function* () {
		const rows = cursorRows<{ section_tipo: string; section_id: IrSectionId }>(
			`WITH events AS (
				SELECT section_tipo, section_id, kind, (batch_seq::bigint << 32) + ord AS seq
				  FROM "${DIFFUSION_JOB_LEDGER_TABLE}"
				 WHERE job_id = $1 AND kind IN ('wrote','removed')
			 ), last_removal AS (
				SELECT section_tipo, section_id, max(seq) FILTER (WHERE kind = 'removed') AS removed_seq
				  FROM events GROUP BY section_tipo, section_id
			 )
			 SELECT e.section_tipo, e.section_id
			   FROM events e
			   JOIN last_removal r ON r.section_tipo = e.section_tipo AND r.section_id = e.section_id
			  WHERE e.kind = 'wrote' AND (r.removed_seq IS NULL OR e.seq > r.removed_seq)
			  GROUP BY e.section_tipo, e.section_id
			  ORDER BY min(e.seq)`,
			[jobId],
			'openArtifactManifest',
			pageRows,
		);
		for await (const row of rows) {
			yield { sectionTipo: row.section_tipo, sectionId: row.section_id };
		}
	})();
}

/** Every id the run REMOVED from `sectionTipo` (ledger order) — a full-export filter set. */
export function removedIdsFor(
	jobId: string,
	sectionTipo: string,
	options?: LedgerReadOptions,
): AsyncIterable<number | string> {
	const pageRows = pageRowsOf(options);
	return (async function* () {
		const rows = cursorRows<{ section_id: IrSectionId }>(
			`SELECT section_id FROM "${DIFFUSION_JOB_LEDGER_TABLE}"
			  WHERE job_id = $1 AND kind = 'removed' AND section_tipo = $2
			  ORDER BY batch_seq, ord`,
			[jobId, sectionTipo],
			'removedIdsFor',
			pageRows,
		);
		for await (const row of rows) yield row.section_id;
	})();
}
