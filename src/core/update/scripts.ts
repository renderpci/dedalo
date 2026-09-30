/**
 * The data-migration SCRIPT REGISTRY (UPDATE_PROCESS Phase 3) — the TS twin of
 * PHP's script_class::script_method lookup, keyed by the catalog's `scriptId`.
 *
 * Its own module so the catalog can validate `scriptId`s at MODULE LOAD
 * (catalog.ts validateCatalog) without importing the engine, which imports the
 * catalog. update/engine.ts re-exports both names.
 *
 * THE SCRIPT CONTRACT (OPS-6). A script runs INSIDE the engine's one atomic
 * transaction, under its own SAVEPOINT:
 *  - it issues statements through `sql` only — they are pinned to the run's
 *    transaction and roll back with it (a restart, an abort, a later hard
 *    failure leave nothing behind);
 *  - `sql.reserve()` is refused inside a transaction (a second connection would
 *    escape the unit), and so is any session `SET`;
 *  - it cannot COMMIT/ROLLBACK/BEGIN: the pool refuses transaction control
 *    before it is sent (`internal.invariant`, a failed script outcome — a
 *    `stopOnError` one rolls the run back); `SAVEPOINT` / `ROLLBACK TO` stay
 *    available. The engine's checkpoint still compares transaction ids (defense
 *    in depth) and reports a changed one as PARTIAL, never as a rollback;
 *  - it honours `ctx.signal` for long loops (the engine also cancels the
 *    running statement on abort, and once the run is aborted no further
 *    statement of it is sent — its next `sql` call throws the abort);
 *  - engine write helpers may queue COMMIT-ONLY actions (registerCommitAction):
 *    they follow the savepoint (db/postgres.ts recorder) — dropped with a soft
 *    failure's ROLLBACK TO, run after the run's COMMIT otherwise.
 * A soft failure (`stopOnError: false`) rolls back to the script's SAVEPOINT —
 * its own writes, and the commit actions they queued, are undone; the run
 * continues.
 */

/** A registered TS migration script (the script_class::script_method twin). */
export type UpdateScriptFn = (
	context: { signal?: AbortSignal },
	...vars: unknown[]
) => Promise<{ ok: boolean; msg?: string; errors?: string[] } | boolean>;

/**
 * TS migration scripts, keyed by scriptId (catalog.ts UpdateScriptStep).
 * EMPTY until the first 7.x migration ships one; an unknown id is refused at
 * module load (validateCatalog) and again in the engine's preflight.
 */
export const SCRIPT_REGISTRY: Readonly<Record<string, UpdateScriptFn>> = Object.freeze({});
