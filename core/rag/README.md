# RAG / Vector Data Processing (core/rag/)

A retrieval-augmented-generation subsystem for Dédalo v7: a **vector version of
selected data** in a separate **pgvector** instance, enabling semantic search,
similar-record lookup, passage retrieval for agents, and grounded Q&A with
citations. Built to reuse Dédalo's existing seams (export-atoms text extraction,
the `properties` ontology config, the `save()`/`delete()` lifecycle, the
per-project ACL) rather than parallel machinery.

This is the **foundation** (ingestion → store → retrieval → API). It is strictly
opt-in and fully dormant unless `DEDALO_RAG_ENABLED = true`.

## What's implemented

| Area | Classes |
|------|---------|
| Vector store | `DBi_vector`, `rag_vector_store` (per-model LIST partitions, `halfvec` >2000d, HNSW build-after-backfill) |
| Embeddings | `embedding_provider` (+ `_local_http`, `_openai`), `embedding_provider_factory` (multilingual default) |
| Config | `rag_config` (`properties.rag` resolution, no bespoke table) |
| Ingestion | `rag_text_extractor` (get_value/export-atoms), `rag_chunker` (structure-aware **semantic** chunking), `rag_indexer` |
| Freshness | `rag_queue` (matrix-DB marker, advisory single-flight drain, delete-by-observed-ts), hooks in `section_record::save()/delete()` |
| Retrieval | `retrieval` (hybrid dense+lexical → RRF → **reranker** → **explicit ACL** → diversify → records/passages), `rag_fusion`, `rag_lexical` (accent-folded via `f_unaccent`), `rag_reranker` (cross-encoder; pass-through if unconfigured) |
| Security | `rag_security` (per-record egress gate, ACL chokepoint) |
| Generation | `rag_llm_provider` (Anthropic Citations / local; temperature, locator-titled citations), `dd_rag_api::ask` (context-token budgeting, live egress recompute, raw-JSON answer, configurable system prompt) |
| API | `dd_rag_api` (`semantic_search`, `similar_to`, `retrieve`, `ask`, `get_agent_context`) |
| Ops | `rag_queue::drain` (advisory single-flight, exponential backoff + `last_error`), `rag_queue::stats` (metrics), `core/rag/cli/rag_drain.php` (cron entry), `rag_indexer::reconcile_section`, `rag_vector_store::drop_model_partition` |

### The chunker (the advanced piece)
`rag_chunker` does **structure-aware semantic chunking**, not fixed-size splits:
1. **Structural hard boundaries** — headings / paragraphs / lists / tables /
   `[page-n-X]` / timecode-speaker turns; a chunk never crosses one.
2. **Semantic soft boundaries** — embeds consecutive sentences and breaks at
   cosine-distance percentile breakpoints (degrades to structural-only when no
   embedder / `strategy:'structural'`).
3. **Min/max packing + double-merge** — absorbs orphan one-sentence segments.
4. **Contextual enrichment** — prepends `{title} › {heading path}` to the
   *embedded* text; raw text kept clean for citations.
5. **Small-to-big** — each chunk carries a `parent_key`; `ask()` expands a hit to
   its parent section for coherent generation.

## Provisioning

1. Provision a **separate** Postgres with the `vector` extension. Set the
   `DEDALO_RAG_DB_*` constants (see `config/sample.config_db.php`).
2. Run the DDL:
   - `install/db/rag_embeddings.sql` → against the **RAG** instance.
   - `install/db/matrix_rag_index_queue.sql` → against the **matrix** instance.
3. Stand up an embeddings endpoint (default: local Ollama, `bge-m3` multilingual)
   and set `DEDALO_RAG_PROVIDER` / `_MODEL` / `_ENDPOINT`.
4. Opt a section in: set its node `properties.rag = {"enabled": true}` and the
   text components' `properties.rag = {"embed": true}`.
5. Set `DEDALO_RAG_ENABLED = true`.
6. Backfill, then build the ANN index (see "Operations").

## Operations

- **Re-index on edit** is automatic: `save()`/`delete()` enqueue a marker; an
  out-of-band drain does the heavy work off the editor path. A down vector store
  never blocks a save. **Wire the drain to cron** (the missing-without-it piece):
  `* * * * * cd /path/to/dedalo && php core/rag/cli/rag_drain.php >> rag_drain.log 2>&1`
  (safe to overlap — `drain()` single-flights via an advisory lock). Failures
  back off exponentially and record `last_error`; `rag_queue::stats()` reports depth.
- **Reconcile** after direct-SQL changes/migrations: `rag_indexer::reconcile_section($tipo)`
  enqueues add/delete drift between the matrix and the vector store.
- **Model migration**: build the new model's index, re-backfill, then
  `rag_vector_store::drop_model_partition($old_model)` to reclaim space.
- **Backfill / index build**: drive `rag_indexer::index_record()` over a section,
  then `rag_vector_store::build_ann_index($model, $dimension)` once (HNSW is built
  after load, on an autocommit connection — never on the hot upsert path).

## Security model (enforced)

- **Retrieval ACL is explicit.** `retrieval` calls
  `security::user_can_access_record()` on every candidate, for **all** actions,
  *before* any score/count is returned. The SQO `filter_by_locators` fast path
  does **not** run the project filter — so retrieval never relies on it.
- **Index-time egress is gated per-record.** `rag_indexer` checks
  `rag_security::record_can_egress()` before any text reaches an external
  embedding provider; restricted records use a local provider or are skipped.
- **Generation egress** forces a local provider when any passage is restricted.
- **Grounding guardrail**: no context → deterministic refusal, no model call.
- **Output sanitised** before return (untrusted model output → no stored XSS).

## Not yet built (deferred phases)

These are intentionally out of the foundation:
- **Phase 5 tool** (`tools/tool_rag_index/`) — backfill/build/eval UI + CLI. The
  underlying methods (`rag_indexer::index_record`, `rag_vector_store::build_ann_index`,
  `rag_queue::drain`) exist and are callable.
- **Phase 5b multimodal media** — image visual embeddings (`embedding_provider_multimodal`,
  `rag_media_extractor`). PDF/AV already flow through the text path once their
  `component_text_area` is flagged.
- **Phase 8 public service** — separate Bun service over a published-only
  collection (co-located with diffusion).
- **MCP tool** — `dedalo_get_relevant_context` → `get_agent_context`.
- **Retrieval-quality eval harness** — golden set + recall@k/nDCG.

## Tests

`test/server/rag/` (suite `rag`): `php vendor/bin/phpunit -c test/server/phpunit.xml --testsuite rag`
- `rag_chunker_Test` / `rag_fusion_Test` / `rag_security_Test` / `rag_hardening_Test`
  (token budgeting, diversify, reranker pass-through, private-range) — pure logic, always run.
- `rag_store_integration_Test` — end-to-end against a real pgvector instance;
  skips cleanly when `DEDALO_RAG_DB_*` is not configured.

Current: 31 tests / 88 assertions green (4 store-integration skip without a live vector DB).
