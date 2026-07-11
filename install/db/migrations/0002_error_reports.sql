-- 0002_error_reports — append-only intake table for the error-report receiver
-- (dd_error_report_api:receive_report, WC-017). Rows are written ONLY by
-- src/core/error_report/store.ts (sql_confinement T4 owner), which keeps an
-- identical CREATE IF NOT EXISTS as the lazy fallback (migrate.ts documented
-- model) — keep BOTH copies in lockstep when evolving this table.
--
-- source_ip + received_at are receiver-stamped and are the only fields the
-- master trusts; everything else is the sender's self-reported claim.
CREATE TABLE IF NOT EXISTS dedalo_ts_error_reports (
	id             bigserial PRIMARY KEY,
	received_at    timestamptz NOT NULL DEFAULT now(),
	source_ip      text        NOT NULL,
	entity         text,
	dedalo_version text,
	user_id        integer,
	section_tipo   text,
	section_id     text,
	page_url       text,
	description    text        NOT NULL,
	js_errors      jsonb,
	context        jsonb
);
CREATE INDEX IF NOT EXISTS dedalo_ts_error_reports_received_idx
	ON dedalo_ts_error_reports (received_at DESC);
