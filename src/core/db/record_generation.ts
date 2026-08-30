/**
 * RECORD GENERATION — which slice of a shared address's history belongs to the
 * record living there NOW (P0-14, second half).
 *
 * THE PROBLEM. A record's address is (section_tipo, section_id), and
 * `matrix_time_machine` keys history by that address alone. Where an id was
 * re-minted, the reborn record inherits the dead one's snapshots: the TM panel
 * lists them as its own and a restore writes the dead record's values into it
 * with `ok:true` (tool_time_machine.ts matches purely by
 * (section_tipo, section_id, tipo)).
 *
 * THE DISCRIMINATOR IS AN ID, NOT A CLOCK. `matrix_time_machine.id` is a
 * monotonic serial and is already the engine's ordering for a record's history
 * (read_tm.ts: "the TM id column only"). So an epoch is a TM id, and this
 * record's history is `matrix_time_machine.id >= epoch`.
 *
 * The timestamp column CANNOT serve: both engines deliberately stamp repair
 * rows 60 seconds in the past (duplicate_record.ts, delete_record.ts, PHP
 * `PT1M`), the clock is DEDALO_TIMEZONE wall-clock with an ambiguous DST fold
 * and 1-second granularity, and 2,428 UTC-skewed rows still exist (CARRY-05).
 * Any tolerance wide enough for the -60s rows re-admits a dead generation.
 *
 * ABSENT MEANS ALL. An address with no row has epoch 0 — every existing record
 * keeps its whole history, with no backfill and no schema change to the
 * largest table on the install. New rows are written ONLY when a record is born
 * at an address that already has history, i.e. only for an actual rebirth.
 *
 * BOOT ORDER. The epoch store is created by
 * `install/db/migrations/0005_record_generation.sql`, which the boot runner
 * applies BEFORE the server serves — so every read path below can rely on it.
 * The lazy `ensureGenerationTable` covers the one caller that runs earlier than
 * any boot: the installer, which mints records while restoring its seed.
 *
 * WHAT THIS DOES NOT DO. It cannot separate histories that were ALREADY merged
 * before it shipped: a re-minted rebirth and a legitimate same-id undelete
 * leave byte-identical data, so guessing would sever real curators from real
 * history. This fences the future.
 */

import { isInTransaction, sql } from './postgres.ts';

/** The epoch store. Also created by install/db/migrations/0005_record_generation.sql. */
const GENERATION_TABLE = 'dedalo_ts_record_generation';

let tableReady = false;

/**
 * Create the epoch store on first use (idempotent; safe under concurrency).
 *
 * The migration runner creates it at boot, but the INSTALLER mints records
 * before any boot has happened — a fresh install died on
 * `relation "dedalo_ts_record_generation" does not exist` during its seed
 * restore (measured). This is the pattern 0001_baseline names for exactly this
 * class of table: "TS-owned operational tables ... are still bootstrapped by
 * their subsystems' lazy CREATE TABLE IF NOT EXISTS" (component locks,
 * diffusion jobs, RAG). The migration remains the authority for an install that
 * upgrades rather than installs.
 *
 * EXPORTED because `tmEpochPredicate` is raw SQL embedded in OTHER modules'
 * statements: those callers must ensure the table themselves, or the read fails
 * on any database where no write path has run first — which is every fresh
 * suite database (the test tiers do not run boot migrations).
 */
export async function ensureRecordGenerationTable(): Promise<void> {
	if (tableReady) return;
	// (!) Postgres DDL is TRANSACTIONAL. Inside a caller's transaction this
	// CREATE is undone by a later ROLLBACK — and a latched memo would then claim
	// a table that no longer exists, failing every create and every time-machine
	// read in this process until it restarts. So the memo is set only when the
	// DDL is committed by its own statement; inside a transaction the CREATE is
	// re-issued next time, which `IF NOT EXISTS` makes free.
	const inTransaction = isInTransaction();
	await sql.unsafe(
		`CREATE TABLE IF NOT EXISTS ${GENERATION_TABLE} (
			section_tipo varchar NOT NULL,
			section_id   integer NOT NULL,
			epoch_tm_id  integer NOT NULL,
			opened_at    timestamp NOT NULL DEFAULT now(),
			PRIMARY KEY (section_tipo, section_id)
		)`,
		[],
	);
	if (!inTransaction) tableReady = true;
}

/** An address with no epoch row: its whole history belongs to it. */
export const EPOCH_ALL_HISTORY = 0;

/**
 * The lowest `matrix_time_machine.id` belonging to the record living at this
 * address now. 0 when the address has never been reborn.
 *
 * NOT cached: an epoch changes at a record's birth, and a stale 0 would serve a
 * dead record's history as the living record's own — the exact defect. The read
 * is a primary-key lookup on a table with one row per rebirth.
 */
export async function recordEpoch(sectionTipo: string, sectionId: number): Promise<number> {
	await ensureRecordGenerationTable();
	const rows = (await sql`
		SELECT epoch_tm_id FROM dedalo_ts_record_generation
		WHERE section_tipo = ${sectionTipo} AND section_id = ${sectionId}
	`) as { epoch_tm_id: number }[];
	return Number(rows[0]?.epoch_tm_id ?? EPOCH_ALL_HISTORY);
}

/**
 * A SQL predicate confining time-machine rows to the record living at
 * `(section_tipo, section_id)` now — for statements that already bind those
 * two, and that must not read a dead generation's rows.
 *
 * `alias` is the matrix_time_machine alias in the statement. The correlated
 * lookup keeps the predicate self-contained, so a caller cannot forget to fetch
 * the epoch first and silently serve everything.
 *
 * (!) NEVER add this to the counter-floor `MAX(section_id)` reads
 * (matrix_write.ts counterFloorExpression, hierarchy_import.ts,
 * data_io_import.ts). Those exist precisely to witness DEAD generations' ids so
 * the allocator cannot re-mint them; filtering them re-opens the first half of
 * P0-14.
 */
export function tmEpochPredicate(alias = 'matrix_time_machine'): string {
	// An ANTI-JOIN, not a correlated scalar subquery. The dd15 bare list is a
	// full-table COUNT(*) over the largest table on the install (a measured 50.5M
	// rows on one), and a per-row scalar lookup there would be ruinous. This
	// shape lets the planner hash-anti-join against a table that is EMPTY on any
	// install that has never had a rebirth, which is the overwhelming majority.
	//
	// Semantics: a row is excluded only when an epoch exists for its address AND
	// the row predates it. No epoch row => nothing excluded => all history, which
	// is exactly the grandfathering rule.
	return `NOT EXISTS (
		SELECT 1 FROM dedalo_ts_record_generation g
		WHERE g.section_tipo = ${alias}.section_tipo
		  AND g.section_id   = ${alias}.section_id
		  AND ${alias}.id    < g.epoch_tm_id
	)`;
}

/** `whereSql` narrowed to the record living at each address now. See tmEpochPredicate. */
export function withTmEpoch(whereSql: string, alias = 'matrix_time_machine'): string {
	return `(${whereSql}) AND ${tmEpochPredicate(alias)}`;
}

/**
 * Open a new epoch at an address IF it already carries time-machine history —
 * i.e. a record is being born where a dead one lived.
 *
 * Called from the record-minting doors. A no-op for the overwhelmingly common
 * case (a fresh address), so the cost on the create path is one indexed
 * `EXISTS` against the (section_tipo, section_id DESC, id DESC) index.
 *
 * The epoch is `MAX(id) + 1` over the address's existing rows: every row
 * written from now on is at or above it, and every row the dead record left is
 * below it. `ON CONFLICT ... DO UPDATE` with GREATEST so a second birth at the
 * same address can only move the boundary FORWARD — an epoch that moved
 * backwards would re-admit a dead generation.
 *
 * Returns the epoch opened, or null when the address had no history.
 */
export async function openEpochIfReborn(
	sectionTipo: string,
	sectionId: number,
): Promise<number | null> {
	if (sectionId <= 0) return null;
	await ensureRecordGenerationTable();
	const rows = (await sql`
		INSERT INTO dedalo_ts_record_generation (section_tipo, section_id, epoch_tm_id)
		SELECT ${sectionTipo}, ${sectionId}, MAX(id) + 1
		  FROM matrix_time_machine
		 WHERE section_tipo = ${sectionTipo} AND section_id = ${sectionId}
		HAVING MAX(id) IS NOT NULL
		ON CONFLICT (section_tipo, section_id) DO UPDATE
		   SET epoch_tm_id = GREATEST(dedalo_ts_record_generation.epoch_tm_id, EXCLUDED.epoch_tm_id),
		       opened_at   = now()
		RETURNING epoch_tm_id
	`) as { epoch_tm_id: number }[];
	return rows[0] === undefined ? null : Number(rows[0].epoch_tm_id);
}
