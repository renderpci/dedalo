-- 0003_temporal_scratch — the server-side scratch store behind a TEMPORAL
-- instance's staging form (WC-079; supersedes the storage half of WC-059).
--
-- Rows are written ONLY by src/core/section/record/temporal_store.ts
-- (sql_confinement T4 owner), which keeps an identical CREATE IF NOT EXISTS as
-- the lazy fallback (migrate.ts documented model) — keep BOTH copies in lockstep
-- when evolving this table.
--
-- THE KEY is five discrete columns, never a concatenated string. PHP's oracle
-- (matrix_temp_manager::get_uid) built its key as `section_tipo . user_id` with
-- no separator, so 'oh1'+42 and 'oh14'+2 addressed the SAME row — two different
-- users on two different sections. It also omitted the owning tool entirely, so
-- two tools open on one section clobbered each other. Both are fixed here:
--   user_id        — isolation; the ONLY tenancy boundary (never from the wire)
--   scope          — the owning tool, so concurrent tools cannot collide
--   section_tipo   \ the component identity
--   component_tipo /
--   lang           — a translatable component stores one lang slice per save
--
-- `entries` holds RAW values: literal items, or relation LOCATORS. Never
-- resolved chips — labels are lang- and permission-dependent and must be
-- re-resolved on every read.
--
-- updated_at drives the opportunistic TTL prune on write (the
-- error_report/store.ts + session_store login-attempts GC precedent). PHP never
-- deleted a temp row at all; its only reclamation was Postgres truncating the
-- UNLOGGED table on crash.
CREATE TABLE IF NOT EXISTS dedalo_ts_temporal_scratch (
	user_id        integer     NOT NULL,
	scope          text        NOT NULL,
	section_tipo   text        NOT NULL,
	component_tipo text        NOT NULL,
	lang           text        NOT NULL,
	entries        jsonb       NOT NULL,
	updated_at     timestamptz NOT NULL DEFAULT now(),
	PRIMARY KEY (user_id, scope, section_tipo, component_tipo, lang)
);
CREATE INDEX IF NOT EXISTS dedalo_ts_temporal_scratch_updated_idx
	ON dedalo_ts_temporal_scratch (updated_at);
