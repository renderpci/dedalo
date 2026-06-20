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
	enqueued_at		timestamptz		NOT NULL DEFAULT now(),
	PRIMARY KEY (section_tipo, section_id)
);

-- Oldest-first claim order.
CREATE INDEX IF NOT EXISTS rag_index_queue_enqueued_idx
	ON rag_index_queue (enqueued_at);
