# Change log

Last modification date:

2026-07-23T00:00:00+01:00

Dédalo version

7.0.0

---

## [Unreleased] - Semantic search: embed groups, client search, assistant grounding

### Added
- **RAG embed-groups descriptor** — what a section vectorizes is now AUTHORED
  in its `section_map` node: `properties.rag.embed` is an array of named
  groups, each an exact request_config `ddo_map`. A group is one vector
  document per (record, data language) — the facet unit (a person's
  `profession` vs `filiation`; a transcription with its own chunking) — stored
  under `rag:<group>`. Resolution reuses the section-read machinery
  (`emitDdoData`), so DEEP relation resolution works: a coin type's card can
  embed its mint's *name*, resolved through the relation. Virtual sections
  select their own maps (the section_map read is virtual-aware) — the earlier
  per-component boolean opt-in, which could not differentiate virtual siblings
  and indexed no text at all for virtual sections, is retired. Documentation:
  [RAG & semantic search](./core/ai/rag.md) ·
  [cookbook R1](./core/ai/rag_cookbook.md).
- **Semantic search in the client** (WC-047) — a *"Search by meaning"* quick
  input in the section-list toolbar and a semantic block in the search panel
  (composes AND with the structured filter). Ranked hits pin the list via
  `filter_by_locators` plus the new `{"mode":"locator_position"}` SQO order
  entry, so relevance order survives pagination, counts and exports; an
  SQO-derived pinned chip makes the state visible and clearable. Sections with
  several embed groups get a facet selector (`dd_rag_api embed_groups`).
  Search presets store the LIVE natural-language query and re-run it on Apply.
- **Assistant grounding tools** — the AI assistant's loop gains section/facet
  scoping on `dedalo_semantic_search` and the new `dedalo_retrieve_passages`
  (exact chunk-level passages for cited answers, deduplicated across
  languages). The external-model egress gate now also classifies every
  deep-resolution CONTRIBUTOR section of a hit — text a group document pulled
  from a forbidden section can never reach an external model through a public
  host record.
- **RAG ops** — the drain cron + embedding-sidecar runbook
  (`engineering/PRODUCTION.md` §11); Ollama's native `/api/embed` matches the
  sidecar contract directly.

### Changed
- Index-time resolution always runs under a system scope with explicit data
  languages — a record's vectors never depend on which user's save triggered
  the re-index (guarded by `rag_index_scope_tripwire`).
- `sanitizeClientSqo` clamps `filter_by_locators` to 1000 pins (loud log).
- Retrieval scope is pushed down into the vector-store legs (a dominant
  section can no longer starve scoped searches into empty results).

### Fixed
- Text-area values embedded through list-mode ddos were truncated to the
  130-character list preview (a 2.1 MB transcription embedded as 154 chars).
  Ddo `mode` in `rag.embed` maps is now honored verbatim when explicit and
  defaults to full-value resolution for literals when absent.

---

## [Unreleased] - Native diffusion engine (TypeScript)

### Added
- **Native diffusion engine** — the publication pipeline (publish, not just
  delete/status) now runs natively in the TS work server: dd1190 →
  `PublicationPlan` compiler, streaming resolver (recursive ddo-chain walk,
  publication gate, linked-record frontier), the 33-fn parser registry
  (23 runtime + 10 compile-absorbed), 5-rung language projection, format
  writers for SQL/Socrata/CSV/JSON/Markdown/RDF/XML, a durable Postgres job
  queue (`dedalo_ts_diffusion_jobs`) with spawned runner processes,
  checkpointed crash-resume (byte-equivalent), and the complete
  `dd_diffusion_api` client action set — the copied `tool_diffusion` client
  works with zero edits. 228 tests across 16 suites; oracle spot-check against
  old-engine-published rows. Documentation:
  [diffusion/native_engine.md](./diffusion/native_engine.md); spec
  `engineering/DIFFUSION_SPEC.md`.
- **Staged cutover levers** — `DEDALO_DIFFUSION_NATIVE` (flips the
  byte-identical client from the old engine to the main API) and
  `DEDALO_DIFFUSION_NATIVE_ELEMENTS` (per-element routing); native in-process
  MariaDB delete propagation with the old engine socket kept as transition
  fallback.

### Changed
- The legacy pre-rewrite + external-engine diffusion documentation was **removed**: the
  TS server is a new version built from scratch, and its docs describe only the
  native engine. Deleted pages: `diffusion/dd_diffusion_api_and_bun.md`,
  `diffusion/engine_internals.md`, `diffusion/diffusion_config_properties.md`,
  `diffusion/diffusion_multiple_databases.md`,
  `api/diffusion_api_documentation.md` and the whole `api/diffusion/` directory
  (`README.md`, `architecture.md`, `data_model.md`, `endpoints.md`).
- [core/system/diffusion.md](./core/system/diffusion.md) rewritten as the lean
  conceptual overview of native diffusion;
  [diffusion/diffusion_markdown.md](./diffusion/diffusion_markdown.md) rewritten
  for the native Markdown writer;
  [diffusion/diffusion_data_flow.md](./diffusion/diffusion_data_flow.md)
  cleansed of old-architecture wording and re-anchored to
  [diffusion/native_engine.md](./diffusion/native_engine.md), now titled
  *The diffusion engine* — the single technical reference.

### Fixed
- **Search preset leaked fields from the wrong section** — the search panel
  restores your in-progress filter from a per-user *temp editing preset*
  (`dd655`) plus named presets (`dd623`). These were keyed by the search's
  **caller** section (`self.section_tipo`) instead of the section actually being
  **searched** (`self.target_section_tipo`, the same source the field list uses).
  The two diverge whenever the searched section differs from the host section — an
  ontology/thesaurus browser, or a relation/portal/autocomplete picker opened from
  inside another section — so a filter built from one section's fields was stored
  under a different section's key and later surfaced there (e.g. an `ontologytype0`
  filter appearing in the Activity `dd542` search panel). Presets are now scoped by
  the searched section (`client/dedalo/core/search/js/preset_scope.js`
  `preset_scope_tipo`), and the section-key match is exact (`q_operator: '=='`) so
  a tipo that is a substring of another can no longer bleed. Guarded by
  `test/unit/search_preset_scope.test.ts`.

## [Unreleased] - Breaking Change Detection System

### Added
- **Breaking Change Detection** - Comprehensive CI/CD pipeline for detecting breaking changes
  - API Contract Snapshot Testing (`test/server/contract/`)
  - Method Signature Tracking (`dev/signature_tracker/`)
  - Data Model Change Detection (`dev/ontology_tracker/`)
  - CI integration via GitHub Actions
  - See `docs/development/breaking_change_detection.md` for full documentation

### CI/CD
- New workflow steps in a pre-rewrite CI workflow file:
  - Contract tests for API response stability
  - Signature checking for class/method changes
  - Ontology checking for data model changes
- Added `.github/pull_request_template.md` with breaking change checklist

> **TS/Bun rewrite note.** The entry above describes pre-rewrite-era CI
> tooling (`dev/signature_tracker/`, `dev/ontology_tracker/`, and a legacy CI
> workflow file) and predates this repository's TypeScript/Bun server. That
> tooling is not present here. The equivalent breaking-change gate for the
> rewrite is the frozen-fixture and unit test harness under `test/parity/`
> and `test/unit/` (run via `bun test`) described in
> `docs/development/breaking_change_detection.md`.

