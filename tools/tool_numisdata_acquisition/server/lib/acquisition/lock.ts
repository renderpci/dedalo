/**
 * commit_lots' find-or-create dedup lock. Gated by test/unit/tool_numisdata_acquisition_keys.test.ts
 * (two spellings the '==' search equates must contend for one lock).
 */

import { sql } from '../../../../../src/core/db/postgres.ts';

/** A transaction-scoped advisory lock on a find-or-create dedup key - same primitive as
 * acquireNodeLock (src/core/db/postgres.ts) for an existing node, just keyed on the dedup term
 * instead of a section_id, since the record doesn't exist yet when the race happens. Serializes
 * two concurrent commits that would otherwise both miss the lookup and both create (review item
 * C4). Must be called inside withTransaction - the lock releases at commit/rollback.
 *
 * The LOCK KEY MUST NEVER BE FINER THAN THE SEARCH EQUALITY it guards: every lookup it protects is
 * an '==' leaf, `f_unaccent(stored) = f_unaccent(q)` (builder_string / builder_iri 'exact'). So the
 * term is folded IN SQL, by that same f_unaccent - two spellings the search treats as one value
 * hash to one key by construction, whatever Postgres's unaccent rules map (a JS re-implementation
 * of them drifted: typographic quotes, dashes, guillemets...). lower() on top only makes the key
 * coarser, which is always safe (two unrelated terms may serialise on one lock; the re-check under
 * the lock, through the real search, stays the correctness guarantee). `scope` (a constant prefix
 * plus already-exact ids) is concatenated unfolded. Both values travel as bound params. */
export async function acquireDedupLock(scope: string, term: string): Promise<void> {
	await sql.unsafe('SELECT pg_advisory_xact_lock(hashtext($1 || lower(f_unaccent($2))))', [
		scope,
		term,
	]);
}
