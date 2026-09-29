-- 0010 — matrix_time_machine.tm_role: the undo log of a bulk run (2026-09-27).
--
-- SHARED-SCHEMA ADDITIVE COLUMN: a nullable, default-less column on the time
-- machine table, which a bulk run's undo log needs to mark its HIDDEN rows. No
-- existing row changes meaning: every row that exists is ordinary, visible
-- history, which is exactly what NULL says.
--
-- WHAT THE COLUMN MEANS (src/core/db/time_machine.ts TM_ROLE):
--   NULL  an ordinary, VISIBLE history row — every existing row, every write
--         outside a bulk run, and the after-row of every bulk write
--   1     BEFORE image: the exact region a bulk write replaced (NULL data =
--         the key was absent)
--   3     BIRTH marker: the record was created by the run
--   4     a record the run's dataframe cascade deleted: its whole snapshot
-- Readers of history narrow with record_generation.ts withTmHistory
-- (`tm_role IS NULL`); only the bulk revert reads every role.
--
-- WHY THIS IS SAFE ON THE LARGEST TABLE OF AN INSTALL (50M+ rows on one):
--   - ADD COLUMN with no DEFAULT and no NOT NULL is METADATA-ONLY: no rewrite,
--     no scan, no backfill (every row reads NULL without being touched).
--   - The CHECK constraint is added NOT VALID: it binds every row written from
--     now on, and skips the validation scan — pointless here, because every
--     existing row is NULL, which the check admits.
--   - Both still take an ACCESS EXCLUSIVE lock for an instant, and that lock
--     QUEUES behind any long reader of the table (a dd15 COUNT on a big
--     install) — and every reader queues behind the waiting lock. So the wait
--     is bounded by lock_timeout, and a timeout is retried by the migration
--     runner (install/db/migrate.ts, SQLSTATE 55P03) rather than stalling boot.
--     SET LOCAL: the setting dies with this migration's transaction and never
--     leaks onto the pooled connection.
--
-- IDEMPOTENT: IF NOT EXISTS on the column; the constraint is added only when
-- its name is not already on the table.

SET LOCAL lock_timeout = '5s';

ALTER TABLE matrix_time_machine ADD COLUMN IF NOT EXISTS tm_role smallint NULL;

DO $tm_role$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint
		 WHERE conname = 'matrix_time_machine_tm_role_check'
		   AND conrelid = 'matrix_time_machine'::regclass
	) THEN
		ALTER TABLE matrix_time_machine ADD CONSTRAINT matrix_time_machine_tm_role_check CHECK (tm_role IS NULL OR tm_role IN (1, 3, 4)) NOT VALID;
	END IF;
END
$tm_role$;
