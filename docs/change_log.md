# Change log

Last modification date:

2026-07-05T00:00:00+01:00

Dédalo version

7.0.0

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

