-- =============================================================================
-- matrix_rag_index_queue.sql
-- Dirty-marker queue for RAG re-indexing. Runs against the MATRIX/work database
-- (NOT the vector instance) so that enqueue happens on the same connection as
-- the editor save and a DOWN vector store can NEVER block a save. State stays
-- in the matrix DB (the Dédalo way).
--
-- The PRIMARY KEY (section_tipo, section_id) coalesces repeated saves of the
-- same record into a single pending row. `op` records the desired action
-- (index | delete); a later save flips a pending 'delete' back to 'index' (and
-- vice-versa) via ON CONFLICT DO UPDATE.
--
-- The drain (rag_queue::drain) claims rows with FOR UPDATE SKIP LOCKED and
-- deletes only rows whose observed `enqueued_at` is unchanged, so an edit that
-- lands mid-drain is not lost and parallel drains never double-process.
-- =============================================================================

CREATE TABLE IF NOT EXISTS rag_index_queue (
	section_tipo	varchar(64)		NOT NULL,
	section_id		integer			NOT NULL,
	op				varchar(8)		NOT NULL DEFAULT 'index',	-- index | delete
	attempts		integer			NOT NULL DEFAULT 0,
	last_error		text,										-- OPS-02: last failure reason
	next_attempt_at	timestamptz		NOT NULL DEFAULT now(),		-- OPS-02: backoff gate
	enqueued_at		timestamptz		NOT NULL DEFAULT now(),
	PRIMARY KEY (section_tipo, section_id)
);

-- Backfill columns on an existing install (idempotent).
ALTER TABLE rag_index_queue ADD COLUMN IF NOT EXISTS last_error text;
ALTER TABLE rag_index_queue ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz NOT NULL DEFAULT now();

-- Oldest-first claim order (only rows whose backoff has elapsed are eligible).
CREATE INDEX IF NOT EXISTS rag_index_queue_ready_idx
	ON rag_index_queue (next_attempt_at, enqueued_at);
