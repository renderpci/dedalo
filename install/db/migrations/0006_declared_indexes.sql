-- P2-34 / UPD-01 — the four DECLARED indexes the shipped seed never had.
--
-- THE RULE, from 0001_baseline.sql's own header: every schema change lands as
-- the next numbered migration and runs at boot before serving. These four were
-- declared in src/core/db/db_pg_definitions.json on 2026-07-26/27; the seed was
-- last regenerated 2026-07-21. No migration shipped them. So they reached an
-- existing install ONLY if an operator happened to click "recreate DB assets",
-- and a FRESH install never got them at all.
--
-- Two are load-bearing by the engine's own account, and one is measured at 84x
-- on a 1.2M-row clone (5.649 ms -> 0.067 ms): matrix_time_machine_record_history_idx
-- serves the Time Machine inspector panel a curator opens on any record.
--
-- IF NOT EXISTS throughout: an install whose operator DID press the button
-- already has them, and this must be a no-op there rather than an error.

-- dd542 Activity 'Who' (dd543) search. Leading ACTOR equality + the trailing (timestamp, id) sort key, so ONE index answers both the filter and the list order and a page is O(LIMIT) for every actor (1.1
CREATE INDEX IF NOT EXISTS matrix_activity_who_ts_idx ON matrix_activity ((relation->'dd543'->0->>'section_id'), (relation->'dd543'->0->>'section_tipo'), "timestamp" DESC, id DESC);

-- Date predicates from the dd15 search panel and the When-ordered browse. Replaces the BRIN DATE("timestamp") index, which no emitted shape used (matrix_index_policy: drop-dead) — matrix_activity's time
CREATE INDEX IF NOT EXISTS matrix_time_machine_timestamp_date_id_idx ON "matrix_time_machine" USING btree ("timestamp", id DESC); ANALYZE matrix_time_machine;

-- Backs the bare dd15 browse ordered by the Section id column (TM_ORDER_COLUMN dd1212) — the only sortable dd15 column an index serves outright. Replaces the standalone lang index, which no emitted shap
CREATE INDEX IF NOT EXISTS matrix_time_machine_section_id_idx ON "matrix_time_machine" USING btree (section_id); ANALYZE matrix_time_machine;

-- Record history (inspector time machine): scope AND sort key in one index. With section_tipo and section_id equality-bound the trailing id DESC is the requested order, so a page costs 40 index entries.
CREATE INDEX IF NOT EXISTS matrix_time_machine_record_history_idx ON "matrix_time_machine" (section_tipo, section_id DESC, id DESC); ANALYZE matrix_time_machine;
