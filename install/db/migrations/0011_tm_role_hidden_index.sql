-- 0011 — matrix_time_machine: the hidden-role partial index + tm_role statistics (2026-09-27).
--
-- WHY. 0010 added `tm_role`, and every history reader narrows with
-- `tm_role IS NULL` (record_generation.ts withTmHistory). Two costs followed,
-- measured read-only on a 29.45M-row TM (dedalo_mib_v7, EXPLAIN ANALYZE):
--   - NO STATISTICS. A column added by ALTER has no pg_stats row until an
--     ANALYZE, and on a large, mostly static table autoanalyze may not come for
--     a long time. The planner then guessed `tm_role IS NULL` at its default
--     selectivity: 61,356 rows estimated where 29.27M matched, and every dd15
--     shape carrying the predicate (the list, the deep-page barrier and late
--     lookup, the dd1371 filters) planned from that estimate.
--   - NO INDEX-ONLY COUNT. tm_role is in no index, so the bare dd15 COUNT could
--     no longer be index-only: 3,072 ms (Parallel Index Only Scan) became
--     15,020 ms (Parallel Seq Scan + Nested Loop Anti Join).
-- The count is now TOTAL − HIDDEN (read_tm.ts tmHistoryCountSql): the total is
-- index-only as before, and the hidden half is index-only on THIS partial
-- index, which holds only the undo-log rows (a small fraction of the table).
--
-- ONLINE MIGRATION: a full-heap index build on the time machine never holds the
-- listener (install/db/online_migration.ts). It runs in the background once the
-- server serves, CONCURRENTLY (no write lock on the live table), with ANALYZE after;
-- every reader is correct without it, only slower until it lands.
--
-- WHY A SEPARATE FILE FROM 0010. 0010's ALTER holds an ACCESS EXCLUSIVE lock to
-- its COMMIT, pre-listen; the build and the statistics sampling here are
-- scans, and a pre-listen scan on a 29M-row table outlasted the systemd
-- watchdog's 30 s probe (rollback of the update, or a restart loop).
--
-- The index is declared in src/core/db/db_pg_definitions.json (ar_index) and
-- classified 'keep' in src/core/db/matrix_index_policy.ts.
--
-- IDEMPOTENT: IF NOT EXISTS (an INVALID leftover of a killed build is dropped by
-- the runner first); ANALYZE is repeatable.

CREATE INDEX CONCURRENTLY IF NOT EXISTS matrix_time_machine_tm_role_hidden_idx ON "matrix_time_machine" USING btree (section_tipo, section_id DESC, id DESC) WHERE tm_role IS NOT NULL;

ANALYZE matrix_time_machine (tm_role);
