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

import { DedaloError } from '../errors/dedalo_error.ts';
import { isInTransaction, sql, withTransaction } from './postgres.ts';

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

/**
 * THE PRECONDITION OF EVERY `tm_role` READER: the epoch store
 * (ensureRecordGenerationTable — the predicate is spliced into their SQL) AND
 * the `tm_role` column (ensureTmRoleColumn — the visibility predicate names
 * it). Every reader that splices `withTmHistory` / `tmVisiblePredicate` or
 * selects `tm_role` calls THIS, never the epoch half alone.
 *
 * (!) The two halves are separate on purpose. The epoch store is also the
 * record-minting doors' precondition (insertMatrixRecordWithCounter,
 * openEpochIfReborn), which never touch `tm_role`: chaining the column heal
 * onto it made every counter-allocated create (run inside a transaction, where
 * the heal refuses by design) fail while 0010 was unapplied, and — the heal
 * sitting behind the epoch memo — ran it at most once per process, so a heal
 * that lost its lock race was never retried. The column half has its own memo,
 * set only on success: a reader after a failed heal tries again.
 */
export async function ensureTmHistoryReady(): Promise<void> {
	await ensureRecordGenerationTable();
	await ensureTmRoleColumn();
}

/** The time machine table the undo-log role lives on. */
const TIME_MACHINE_TABLE = 'matrix_time_machine';

/** Tables whose `tm_role` column is verified present in this process (a bootstrap memo). */
const tmRoleReadyTables = new Set<string>();

/**
 * TEST SEAM: forget the bootstrap memos — both (`'all'`: the epoch store's
 * `tableReady` and the tm_role column's verified tables) or the column's alone
 * (`'tm_role'`: the state a process is in after a heal that failed) — so a gate
 * can replay a first call against a schema it altered inside a rolled-back
 * transaction. Both memos only ever skip an idempotent probe.
 */
export function resetSchemaMemosForTests(which: 'all' | 'tm_role' = 'all'): void {
	if (which === 'all') tableReady = false;
	tmRoleReadyTables.clear();
}

/**
 * `matrix_time_machine.tm_role` PRESENT, or a typed failure — never a server
 * that looks healthy while every history read and every bulk write dies on
 * `column "tm_role" does not exist`.
 *
 * The column's authority is `install/db/migrations/0010_tm_role.sql`, applied
 * by the boot runner before the server serves. But that runner gives up after
 * its lock retries (a long dd15 COUNT holding the table on a big install) and
 * startServer then serves on — and no lazy bootstrap existed for this column,
 * so every narrowed reader (`withTmHistory` / `tmVisiblePredicate`: the dd15
 * list, count and preview, apply_value, the delete and observer probes) and
 * every undo-log INSERT failed until the next restart. This SELF-HEALS: the
 * first caller that finds the column missing adds it with the migration's own
 * two statements (the nullable, default-less column — metadata-only — and the
 * NOT VALID CHECK), in its own transaction with a bounded lock wait — and
 * only OUTSIDE a caller's transaction (an ACCESS EXCLUSIVE lock must never be
 * held to a caller's COMMIT; the dd15 list, count and preview read outside
 * one). A caller inside a transaction, or a heal that cannot get its lock,
 * throws `internal.invariant` naming the migration: fail closed, and the next
 * caller tries again (the memo is set only on success). One catalog probe per
 * process otherwise.
 *
 * `table` / `lockTimeout` are injectable for the gate (a scratch table);
 * production passes neither.
 */
export async function ensureTmRoleColumn(
	table: string = TIME_MACHINE_TABLE,
	lockTimeout = '5s',
): Promise<void> {
	if (tmRoleReadyTables.has(table)) return;
	const state = await tmRoleColumnState(table);
	// No table yet (an installer before its seed restore): nothing reads or
	// writes it either — not memoized, so the next call checks again.
	if (state === 'no_table') return;
	if (state === 'missing') await healTmRoleColumn(table, lockTimeout);
	tmRoleReadyTables.add(table);
}

/**
 * Add the missing column — never inside a caller's transaction: the ACCESS
 * EXCLUSIVE lock would be held to that caller's COMMIT (and queue every reader
 * behind it). The caller fails closed; the next caller outside one heals.
 */
async function healTmRoleColumn(table: string, lockTimeout: string): Promise<void> {
	if (isInTransaction()) {
		throw tmRoleMissing(table, 'inside a transaction, where it is never added');
	}
	try {
		await addTmRoleColumn(table, lockTimeout);
	} catch (error) {
		throw tmRoleMissing(table, error instanceof Error ? error.message : String(error), error);
	}
}

/** The typed failure of a missing, unhealable tm_role column. */
function tmRoleMissing(table: string, why: string, cause?: unknown): DedaloError {
	return new DedaloError('internal.invariant', {
		cause,
		message: `${table}.tm_role is missing (migration 0010_tm_role.sql unapplied) and could not be added: ${why}`,
		coordinates: { table, migration: '0010_tm_role.sql' },
	});
}

async function tmRoleColumnState(table: string): Promise<'present' | 'missing' | 'no_table'> {
	const rows = (await sql.unsafe(
		`SELECT to_regclass($1) IS NOT NULL AS has_table,
		        EXISTS (SELECT 1 FROM pg_attribute
		          WHERE attrelid = to_regclass($1) AND attname = 'tm_role'
		            AND NOT attisdropped) AS has_column`,
		[table],
	)) as { has_table: boolean; has_column: boolean }[];
	const row = rows[0];
	if (row?.has_table !== true) return 'no_table';
	return row.has_column ? 'present' : 'missing';
}

/**
 * 0010_tm_role.sql's two statements, for `table` (gated equal by
 * tm_role_self_heal_native),
 * then 0011's statistics half (the partial index stays ONLINE migration 0011's,
 * built CONCURRENTLY after the listener binds: a full-heap build never belongs
 * in a reader's request).
 */
async function addTmRoleColumn(table: string, lockTimeout: string): Promise<void> {
	if (!/^[a-z_][a-z0-9_]*$/.test(table) || !/^\d+(ms|s)$/.test(lockTimeout)) {
		throw new DedaloError('internal.invariant', {
			message: `addTmRoleColumn: invalid table '${table}' or lock timeout '${lockTimeout}'`,
			coordinates: { table, lock_timeout: lockTimeout },
		});
	}
	await withTransaction(async () => {
		await sql.unsafe(`SET LOCAL lock_timeout = '${lockTimeout}'`, []);
		await sql.unsafe(`ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS tm_role smallint NULL`, []);
		await sql.unsafe(
			`DO $tm_role$
			BEGIN
				IF NOT EXISTS (
					SELECT 1 FROM pg_constraint
					 WHERE conname = '${table}_tm_role_check' AND conrelid = '"${table}"'::regclass
				) THEN
					ALTER TABLE "${table}" ADD CONSTRAINT "${table}_tm_role_check" CHECK (tm_role IS NULL OR tm_role IN (1, 3, 4)) NOT VALID;
				END IF;
			END
			$tm_role$`,
			[],
		);
	});
	// STATISTICS, after the ALTER's COMMIT (never under its ACCESS EXCLUSIVE
	// lock — ANALYZE samples the heap). A column added by ALTER has no pg_stats
	// row, and the planner then guesses `tm_role IS NULL` at its default
	// selectivity (61,356 estimated vs 29.27M actual, measured): every history
	// reader plans from that until an autoanalyze that a large, mostly static
	// table may not get for a long time. Online migration 0011 does the same
	// post-listen (it cannot land before the column exists, so it is still
	// unrecorded whenever this heal runs).
	await analyzeTmRoleColumn(table, lockTimeout);
}

/**
 * The statistics half of the heal — BEST-EFFORT, bounded, and never reported as
 * a missing column. The column is already added and COMMITTED when this runs,
 * so its failure must not become `tmRoleMissing` (a false internal.invariant
 * whose log points at the wrong cause). Its own transaction carries the same
 * `lock_timeout` as the ALTER: the ALTER's SET LOCAL died with that
 * transaction, and an unbounded ANALYZE waits for its SHARE UPDATE EXCLUSIVE
 * lock behind anything holding one — an anti-wraparound vacuum does not yield,
 * and can hold it for hours on a large table, hanging the request that healed.
 * On failure (lock, statement timeout, cancel) the degraded outcome is the
 * planner's default estimate until online migration 0011 ANALYZEs on the next
 * post-listen run (or an autoanalyze does) — logged, not thrown.
 */
async function analyzeTmRoleColumn(table: string, lockTimeout: string): Promise<void> {
	try {
		await withTransaction(async () => {
			await sql.unsafe(`SET LOCAL lock_timeout = '${lockTimeout}'`, []);
			await sql.unsafe(`ANALYZE "${table}" (tm_role)`, []);
		});
	} catch (error) {
		console.warn(
			`[record_generation] ${table}.tm_role added, statistics not collected; online migration 0011 will ANALYZE on its next run`,
			error,
		);
	}
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
 * A SQL predicate confining time-machine rows to ordinary, VISIBLE history:
 * `tm_role IS NULL`. A row with a role is a bulk run's undo-log bookkeeping
 * (time_machine.ts TM_ROLE — a hidden BEFORE image, a birth marker, a cascade
 * delete snapshot) and must never reach a history list, count, filter, preview,
 * restore source or backfill probe: a hidden BEFORE image served as history
 * shows a curator a value nobody saved at that moment, and a restore from it
 * writes it back.
 *
 * (!) NOT for the bulk revert (it reads every role of its own run) nor the
 * counter floors (they witness every id ever used, whatever its role).
 */
export function tmVisiblePredicate(alias = 'matrix_time_machine'): string {
	return `${alias}.tm_role IS NULL`;
}

/**
 * The complement of tmVisiblePredicate: a bulk run's undo-log row. For ONE
 * reader only — the HIDDEN half of the dd15 history count (read_tm.ts
 * tmHistoryCountSql, total − hidden), which exists so that count stays
 * index-only (on the partial matrix_time_machine_tm_role_hidden_idx, whose
 * predicate this spells EXACTLY — the planner matches a partial index by its
 * predicate). Never a filter that SERVES rows.
 */
export function tmHiddenPredicate(alias = 'matrix_time_machine'): string {
	return `${alias}.tm_role IS NOT NULL`;
}

/**
 * `whereSql` narrowed to the VISIBLE history of the record living at each
 * address now: the generation epoch (tmEpochPredicate) AND no undo-log role
 * (tmVisiblePredicate). THE narrowing for every history reader. A caller that
 * splices it must `ensureRecordGenerationTable()` first, as for withTmEpoch.
 */
export function withTmHistory(whereSql: string, alias = 'matrix_time_machine'): string {
	return `${withTmEpoch(whereSql, alias)} AND ${tmVisiblePredicate(alias)}`;
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
