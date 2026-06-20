---
name: dedalo-rag
description: The Dédalo v7 RAG / semantic-search subsystem (core/rag/) — a vector version of opted-in component data in a SEPARATE pgvector database, with structure-aware semantic chunking, hybrid (dense+lexical RRF) retrieval, explicit per-record ACL, a deferred matrix-DB queue, and grounded Q&A with citations. Use when modifying anything under core/rag/ (DBi_vector, rag_vector_store, embedding_provider*, rag_config, rag_text_extractor, rag_chunker, rag_fusion, rag_lexical, rag_reranker, rag_indexer, rag_queue, retrieval, rag_security, rag_llm_provider, cli/rag_drain.php), core/api/v1/common/class.dd_rag_api.php, install/db/rag_embeddings.sql, install/db/matrix_rag_index_queue.sql, the RAG hooks in core/section_record/class.section_record.php (save/delete), the dd_rag_api entry in dd_manager $allowed_api_classes / the core/rag loader case in class.loader.php, the DEDALO_RAG_* constants in config/sample.config_db.php, test/server/rag/, docs/core/rag.md, or core/rag/README.md.
---

# Dédalo v7 RAG / semantic search

Opt-in **vector version of selected component data** in a **separate** PostgreSQL +
pgvector DB (never the matrix). Adds semantic search, similar-record, passage
retrieval, agent context and grounded Q&A. Strictly dormant unless
`DEDALO_RAG_ENABLED === true`. User+dev doc: `docs/core/rag.md`; dev quick-ref:
`core/rag/README.md`. Reuses Dédalo seams (export-atoms text, `properties`
config, `save()/delete()` lifecycle, per-project ACL) — no parallel schema.

## Pipeline

`save()/delete()` → enqueue marker (matrix DB, best-effort try/catch, never fails
the save) → cron `rag_queue::drain()` → `rag_indexer`: extract (`rag_text_extractor`
via `get_value()`) → chunk (`rag_chunker`) → hash-diff → embed (`embedding_provider`)
→ atomic upsert (`rag_vector_store`). Query: `dd_rag_api` → `retrieval`: dense ANN
+ lexical (`rag_lexical`) → RRF (`rag_fusion`) → rerank (`rag_reranker`, pass-through)
→ **explicit ACL** (`rag_security::filter_accessible`) → records|passages → `ask`
grounds via `rag_llm_provider`.

Two DBs, bridged by a **locator/passage list**, never a JOIN.

## Load-bearing design (corrected by 2 review rounds — do not regress)

- **ACL is enforced EXPLICITLY in `retrieval`**, for ALL actions, BEFORE any
  score/count is returned. The SQO `filter_by_locators` fast path
  (`search.php` `parse_sql_filter_by_locators`) does **NOT** run
  `build_sql_projects_filter()` — never rely on it for ACL. `rag_security::filter_accessible`
  calls `security::user_can_access_record()` per candidate; null/0 user ⇒ `[]`.
- **pgvector cannot HNSW-index an unsized `vector` column.** The table is
  `PARTITION BY LIST (model)`; each child carries a FIXED-dim typed column
  (`vector(N)`, or `halfvec(N)` when N>2000 — the HNSW ceiling) + its own HNSW.
  `rag_create_model_partition(model,dim)` (in the SQL) provisions a child;
  `rag_vector_store::ensure_model_partition` calls it (process-cached).
- **HNSW built AFTER backfill** on an autocommit conn (`DBi_vector::exec_autocommit`,
  `CREATE INDEX CONCURRENTLY` can't run in a txn) via `build_ann_index` — never on
  the upsert path.
- **Index-time egress is gated per-record** in `rag_indexer` BEFORE any external
  embed (`rag_security::record_can_egress`); restricted ⇒ local provider or skip.
  Generation egress recomputed from LIVE config in `dd_rag_api::ask` (not the
  stored `egress_class`, which can go stale).
- **Freshness hook is on `save()` (~:558) and `delete()` (~:965), branching on the
  method** — NOT on `save_event()` (a cache-invalidation switch) and NOT on
  `record_in_the_database` (means "row exists", true for inserts/temp too). Both
  hooks are guarded `defined('DEDALO_RAG_ENABLED') && ===true` first (zero cost off).

## Chunker (`rag_chunker`) — structure-aware semantic chunking

Modes auto-detected (TC markers → transcription; large → long_document; else short).
Pipeline: (1) structural HARD boundaries (headings `[h1..6]`, paragraphs, lists,
tables, `[page-n-X]`, `[TC_HH:MM:SS.mmm_TC]` turns) — a chunk never crosses one;
(2) semantic SOFT boundaries — embed consecutive sentences, break at cosine-distance
percentile (`segment_unit`, needs an injected embedder; degrades to structural-only
without one); (3) pack to TOKEN budget + min-token double-merge; (4) contextual
header `{title › heading}` prepended to the EMBEDDED text only (raw `source_text`
kept clean for citations); (5) `parent_key` for small-to-big expansion at `ask()`.
`source_hash = sha256(VERSION . '|' . embed_text)` — bump `rag_chunker::VERSION` to
force a deliberate full re-embed. Embedder is INJECTED (`opts['embedder']`) → unit-testable.

## Config (`properties.rag`, no bespoke table — via `ontology_node::get_instance($tipo)->get_properties()`)

- Section node: `{ "rag": { "enabled": true } }` — the cheap save-hook gate.
- Component node: `{ "rag": { "embed": true, "strategy": "structural|structural_semantic", "chunk": {max_tokens,min_tokens}, "system_prompt": "…" } }`.
- `rag_config` resolves + statically caches; `get_embeddable_component_tipos` filters
  `section::get_ar_children_tipo_by_model_name_in_section` (models from
  `DEDALO_RAG_EMBEDDABLE_MODELS`) by the `embed` flag.

## API (`dd_rag_api`, in `dd_manager::$allowed_api_classes`; SEC-024 flat `API_ACTIONS` list)

Actions: `semantic_search`, `similar_to`, `retrieve`, `ask`, `get_agent_context`.
Standard `{result,msg,errors}` envelope. **A scope is required** (`section_tipo` |
`section_tipos`), permission-filtered (`common::get_permissions >= 1`) before retrieval.
`semantic_search`/`similar_to` → records (best-per-record collapse); `retrieve`/`ask`/
`get_agent_context` → passages. `ask`: scope → retrieve passages → defensive per-passage
ACL → grounding gate (refuse + NO model call if empty) → small-to-big parent expansion →
context-token budget (`fit_token_budget`, keeps ≥1) → live egress decision → generate →
**raw answer in JSON** (NO `htmlspecialchars` — client escapes at render).

## Store / queue

- `rag_embeddings` (RAG DB): partitioned by model; cols incl `embedding`,
  `source_hash`, `source_text`, `egress_class`, `parent_key`, `chunk_meta jsonb`,
  `modality`, `source_kind`. UNIQUE/PK `(section_tipo,section_id,component_tipo,lang,chunk_index,model,dimension)`.
  Lexical GIN index on `to_tsvector('simple', f_unaccent(coalesce(source_text,'')))`
  — `rag_lexical::query` MUST use the identical expression or the index isn't used
  (`unaccent`+`f_unaccent` provisioned in `rag_embeddings.sql`).
- `rag_index_queue` (MATRIX DB): PK `(section_tipo,section_id)` coalesces saves;
  `op`, `attempts`, `last_error`, `next_attempt_at` (exp backoff), `enqueued_at`.
  `drain`: advisory single-flight (`pg_try_advisory_lock`), oldest-ready-first,
  delete-by-observed-`enqueued_at` (an edit mid-drain survives), cap 5 attempts.

## DBi_vector

Mirrors DBi (own conn cache + md5 prepared-stmt pool + `DEALLOCATE ALL`>1000 +
persistent-conn abandoned-tx guard) but SEPARATE state — a vector failure never
touches the matrix tx. `exec()` prepared (constant-shape SQL, `= ANY($n::text[])`);
`exec_autocommit()` for `CREATE INDEX CONCURRENTLY`; `begin/commit/rollback`
(savepoint nesting, own depth) used by the indexer's atomic flush; `is_configured()`
guards every entry so absence ⇒ clean skip; `set_session_ef_search`.

## Operations

- **Drain cron (required, else markers never index):**
  `* * * * * cd /path/to/dedalo && php core/rag/cli/rag_drain.php >> rag_drain.log 2>&1`
- `rag_queue::stats()` (depth/ready/blocked/failed + `metrics::get_summary`);
  `rag_indexer::reconcile_section($tipo)` (add/delete drift after direct-SQL);
  `rag_vector_store::drop_model_partition($model)` (post-migration cleanup).

## Wiring

- `core/base/class.loader.php`: `dd_rag_api` eager-included in the `dd_*_api` block;
  all other `core/rag/` classes resolved by an explicit loader switch-case (flat dir,
  NOT one-class-per-dir) — add new classes to that list.
- `dd_manager::$allowed_api_classes` includes `'dd_rag_api'`.
- Constants in `config/sample.config_db.php` (active config is out-of-repo
  `private/config_db.inc`); everything guarded by `defined()`.

## Gotchas

- Default embedding model is **multilingual** (`bge-m3`) — never default to an
  English-only model (heritage text is non-English; cross-lingual needs a shared space).
- Do **not** silo the ANN query by language; `lang` is stored for display/optional filter.
- Lexical index expression and `rag_lexical` query expression must match EXACTLY
  (incl `f_unaccent` + `coalesce`) or Postgres won't use the GIN index.
- `embedding_provider::embed` discovers dimension from the response — never hard-code;
  a count mismatch returns `[]` (skip, never write a garbage vector).
- `ask` returns RAW text in JSON; re-adding `htmlspecialchars` double-escapes (corrupts
  `&`/quotes) and is not XSS protection — the client escapes at render.
- Cosine distance is NOT comparable across models → `min_score`/`max_distance` are
  per-model, not a single global threshold.

## Tests

`test/server/rag/` (suite `rag`): `php vendor/bin/phpunit -c test/server/phpunit.xml --testsuite rag`.
- Pure-logic (always run): `rag_chunker_Test` (semantic boundaries, structural
  hard-boundaries, transcription TC, contextual header vs raw, versioned hash),
  `rag_fusion_Test` (RRF agreement, collapse), `rag_security_Test` (ACL superuser/
  no-user, egress), `rag_hardening_Test` (token budget keeps ≥1, diversify, reranker
  pass-through, 172.16/12).
- `rag_store_integration_Test` — end-to-end vs a live pgvector instance; `markTestSkipped`
  when `DEDALO_RAG_DB_*` is unset. Inject a deterministic fake embedder for chunker
  semantic tests (no model needed).

## Deferred (documented, not built)

tool_rag_index UI / bulk-index; multimodal image (visual) embeddings; Phase-8 Bun
public service over published-only; MCP `dedalo_get_relevant_context`; retrieval-quality
eval harness; per-user `ask` rate-limit (planned, login-throttle-style).
