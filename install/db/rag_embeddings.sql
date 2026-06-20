-- =============================================================================
-- rag_embeddings.sql
-- Schema for the SEPARATE, dedicated pgvector instance backing Dédalo RAG.
--
-- This DDL runs against the RAG vector database (DEDALO_RAG_DB_*), NOT the
-- matrix/work database. It is idempotent (CREATE ... IF NOT EXISTS / guarded
-- DO blocks) so it can be re-applied safely on upgrade.
--
-- KEY DESIGN (corrected after the pgvector specialist review):
--   * An UNSIZED `vector` column CANNOT be HNSW-indexed (pgvector raises
--     "column does not have dimensions"; a partial WHERE dimension=N does not
--     supply the typmod the index builder needs). Therefore the table is
--     PARTITIONED BY LIST (model) and each per-model child partition declares
--     a FIXED-dimension typed column (vector(N) or halfvec(N) when N>2000, the
--     HNSW dimension ceiling) and carries its own HNSW index. This is how
--     dimension drift across pluggable providers AND text-vs-image isolation
--     are handled.
--   * ANN (HNSW) indexes on a child are built AFTER bulk backfill, on an
--     autocommit connection, by rag_vector_store::build_ann_index() — never
--     lazily on the hot upsert path (a plain CREATE INDEX takes a SHARE lock
--     that blocks the drain; CREATE INDEX CONCURRENTLY cannot run in a txn
--     block). The child-partition creation here only declares the typed column.
--   * The dirty-marker QUEUE lives in the MATRIX database, not here, so a down
--     vector store never blocks an editor save. See matrix_rag_index_queue.sql.
--
-- Distance: cosine. Operator <=> must always pair with vector_cosine_ops /
-- halfvec_cosine_ops or the planner silently falls back to a sequential scan.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS vector;

-- -----------------------------------------------------------------------------
-- Parent table. PARTITIONED BY LIST (model). The parent's `embedding` column is
-- declared as the unsized `vector` type ONLY to satisfy the partition-parent
-- shape; it is never indexed and never queried directly. Every row physically
-- lands in a per-model child whose `embedding` column is re-typed to a fixed
-- dimension (see rag_create_model_partition below).
--
-- The partition key (model) is part of the PRIMARY KEY / UNIQUE constraints, as
-- PostgreSQL requires for partitioned tables.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rag_embeddings (
	id				bigint GENERATED ALWAYS AS IDENTITY,
	section_tipo	varchar(64)		NOT NULL,
	section_id		integer			NOT NULL,
	component_tipo	varchar(64)		NOT NULL,
	lang			varchar(16)		NOT NULL,
	chunk_index		integer			NOT NULL,
	provider		varchar(64)		NOT NULL,
	model			varchar(128)	NOT NULL,
	dimension		integer			NOT NULL,
	embedding		vector			NOT NULL,
	source_hash		char(64)		NOT NULL,
	source_text		text,
	token_count		integer,
	modality		varchar(16)		NOT NULL DEFAULT 'text',	-- text | image
	source_kind		varchar(32)		NOT NULL DEFAULT 'text',	-- text | pdf_text | av_transcript | image_caption | image_visual
	egress_class	varchar(16)		NOT NULL DEFAULT 'public',	-- public | restricted (governs external-provider egress)
	parent_key		varchar(255),	-- structural-section id for small-to-big parent expansion
	chunk_meta		jsonb,			-- {tc_in,tc_out,media_tipo} | {heading,page,char_start,char_end} | {media_tipo,quality,thumb_url}
	created_at		timestamptz		NOT NULL DEFAULT now(),
	updated_at		timestamptz		NOT NULL DEFAULT now(),
	-- model + dimension in the key: guards a model reconfigured to a new
	-- dimension under the same name, and is required because `model` is the
	-- partition key. chunk_index distinguishes the per-(record,component,lang)
	-- chunks; this is the ON CONFLICT target used by upsert().
	PRIMARY KEY (section_tipo, section_id, component_tipo, lang, chunk_index, model, dimension)
) PARTITION BY LIST (model);

-- Non-vector lookup indexes on the parent propagate to every child partition.
CREATE INDEX IF NOT EXISTS rag_embeddings_record_idx
	ON rag_embeddings (section_tipo, section_id);
CREATE INDEX IF NOT EXISTS rag_embeddings_component_idx
	ON rag_embeddings (section_tipo, component_tipo, lang);
-- Lexical (BM25-ish) hybrid retrieval over source_text, accent-folded. Uses the
-- 'simple' config (language-agnostic) so multilingual heritage text is treated
-- uniformly; unaccent is applied in the query builder (rag_lexical).
CREATE INDEX IF NOT EXISTS rag_embeddings_lexical_idx
	ON rag_embeddings USING gin (to_tsvector('simple', coalesce(source_text, '')));

-- -----------------------------------------------------------------------------
-- rag_create_model_partition(model, dimension)
-- Idempotently create the per-model child partition with a FIXED-dimension
-- typed embedding column. halfvec is used above the 2000-dim HNSW ceiling.
-- Call once per configured model before its first upsert (rag_vector_store does
-- this). The ANN index is NOT created here — see build_ann_index().
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION rag_create_model_partition(p_model text, p_dimension int)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
	v_child		text := 'rag_embeddings_' || regexp_replace(lower(p_model), '[^a-z0-9_]+', '_', 'g');
	v_coltype	text;
BEGIN
	IF p_dimension > 2000 THEN
		v_coltype := format('halfvec(%s)', p_dimension);
	ELSE
		v_coltype := format('vector(%s)', p_dimension);
	END IF;

	-- create the child as a partition of the parent FOR the given model value
	IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = v_child) THEN
		EXECUTE format(
			'CREATE TABLE %I PARTITION OF rag_embeddings FOR VALUES IN (%L)',
			v_child, p_model
		);
		-- re-type the inherited unsized column to the fixed dimension so it is
		-- HNSW-indexable
		EXECUTE format(
			'ALTER TABLE %I ALTER COLUMN embedding TYPE %s USING embedding::%s',
			v_child, v_coltype, v_coltype
		);
	END IF;
END;
$$;
