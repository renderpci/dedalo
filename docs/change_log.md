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

## [Unreleased] - Activity log at scale

### Changed
- **Activity (`dd542`) list survives 30M+ rows** (WC-044, WC-046) — on a
  32.9M-row / 85 GB `matrix_activity` a header sort or a deep page used to
  full-scan the whole table (>60 s at *every* page). Three wire-identical
  internal rewrites (same rows, same order, same paginated envelope): the
  structural sort key (`section_id` / `id`) is emitted index-aligned with no
  `NULLS LAST`, so the default newest-first list is index-served (>60 s →
  ~11 ms); deep and last pages use a late-row-lookup + order-flip on the
  flattened unique-key path (>5 s → ~64 ms); and the bare-browse total is
  served from a save-event-invalidated cache. Ordered-search SQL is flattened
  to an inline `ORDER BY … LIMIT` whenever the target table carries the full
  unique `(section_id, section_tipo)` key.
- **Append-only logs restrict sort and search dimensions** (WC-044, WC-045) —
  arbitrary component sorts on the append-only log are disallowed: every
  `dd542` column is `sortable:false` except *When* (`dd547`), whose order maps
  to the direct `section_id` column (append-only ⇒ insertion order). The
  edit-mode search *FIELDS* panel now omits the shared section-info group
  (`dd196`) for Activity (`dd542`) and Time Machine (`dd15`), where that
  editorial metadata is meaningless as a search dimension.
- The *Optimize tables* action of the [Database-info maintenance
  widget](./core/areas/area_maintenance.md) prunes dead/redundant indexes on
  the two logs by a single-source-of-truth policy (never a constraint or a
  proven-used index); ~7.9 GB reclaimed on the reference install.

---

## [Unreleased] - Cache rebuild tooling and configurable media URLs

### Changed
- **`tool_update_cache` now requires an explicit scope** (WC-043) — the silent
  whole-section fallback is removed: a missing or malformed `sqo` fails closed
  with `invalid_request`, and the client sends a deep clone of the caller
  list's live `sqo`, so a run's scope is exactly the scope the list displays.
  The confirm dialog carries the record and component counts; the media
  regenerate path rebuilds only files that are missing (instead of re-encoding
  everything), mints a `dd800` bulk-process record per run, and suppresses Time
  Machine for the run's re-saves.
- **Media URLs honor `DEDALO_MEDIA_WEB_BASE`** (WC-042) — every client media
  URL is now built on a configurable base (`config.media.webBase`), so an
  install serving media from a different origin than the app can emit correct
  absolute URLs; unset means the previous same-origin relative default.
  Distinct from `DEDALO_MEDIA_BASE_URL`, which continues to root export cells
  only (unset means unresolved, never guessed). See
  [config reference](./config/config.md).

### Added
- **A generic *Stop* wire for background jobs** (WC-043) —
  `dd_utils_api::stop_process` is registered (the copied client's Stop button
  always posted it but no handler existed), owner-gated and job-scoped; the
  abort reaches handlers as a per-job `AbortSignal`, and `update_cache` checks
  it per record and returns a partial summary.

---

## [Unreleased] - Password recovery

### Added
- **Login *forgot password* flow is live** (WC-039) — the recovery actions
  `request_password_reset` / `confirm_password_reset` are implemented natively
  (`src/core/security/password_reset.ts` + a nodemailer SMTP mailer), with
  pending codes in the session store. `request` always returns
  `{result:true, reset_id}` (anti-enumeration); a successful reset evicts the
  user's existing sessions. TLS peer verification is never disableable (pin a
  private CA via `NODE_EXTRA_CA_CERTS`). Config: catalog domain `mailer`
  (`DEDALO_SMTP_*`, `DEDALO_PWRESET_*`). User guide:
  [Password recovery](./management/password_recovery.md).

---

## [Unreleased] - Activity log coverage and offline GeoIP

### Added
- **The full 16-code activity WHAT map is emitted** (WC-040) — eight event
  emitters were added (LOG IN / LOG OUT / NEW / UPLOAD COMPLETE / DELETE FILE /
  RECOVER SECTION / RECOVER COMPONENT / NEW VERSION), so the `user_activity`
  charts are no longer limited to the four previously-instrumented events.
  Login failures are recorded too (throttle lockouts and maintenance refusals
  included). Known gap, ledgered: the projects dimension (`relation.dd550`) is
  not written by the engine, so activity filtered by project shows nothing from
  the current era.

### Changed
- **IP→country resolution moved server-side and offline** (WC-038) — the
  `ip_api` descriptor is removed from `page_globals`; the client no longer has
  each browser fetch a third-party geolocation service. Resolution is now the
  native GeoIP subsystem (`src/core/geoip/`, DB-IP Country Lite) behind the
  same-origin `get_ip_country` action. Config keys: `DEDALO_GEOIP_*` (the old
  `IP_API` key is dropped).

---

## [Unreleased] - Consultation-section search: dates and special tables

### Fixed
- **Time-machine date search now filters** (WC-036) — the *When* (`dd547`)
  search in Activity (`dd542`) sent a structured object that the builder had
  been stringifying to `"[object Object]"` and dropping, so every date search
  ran unfiltered; object-q is now normalized. Directional operators are
  implemented for the special-table date path: each typed value defines a
  precision-sized half-open period and the operator picks the boundary
  (`>2026` → strictly after 2026), where the frozen engine left them all
  falling through to a range equality.
- **Special-table component search restored** (WC-037) — `component_json`
  gained a search builder (Activity's *Data* `dd551` and every JSON component
  were previously unsearchable), and the Time Machine table (`dd15`), which
  stores each component in a flat physical column, gained a component conformer
  so its clauses are honored instead of returning all rows. Text matching on
  these paths is accent- and case-insensitive (a safe superset that never hides
  a match).

---

## [Unreleased] - Site builder subsystem

### Added
- **Agent-built public websites** (WC-035) — a wholly TS-native subsystem lets
  users build public sites over the published data by talking to a coding
  agent: a standalone daemon (`publication/site_builder/`, isolated like the
  publication API), the proxy tool `tool_sitebuilder` (a three-pane workspace),
  and a `site_builder_status` maintenance widget that probes the daemon and
  hosts the launcher. No counterpart existed in the previous engine. Docs:
  [Site builder](./management/site_builder.md) ·
  [internals](./development/site_builder_internals.md).

---

## [Unreleased] - UI labels: repo catalogs

### Changed
- **Program strings are now repo-owned label catalogs** (WC-033) — the
  application's buttons, menus, dialogs and error text are served by
  committed files (`src/core/labels/master.json` = the complete key set with
  source strings; `src/core/labels/catalog/lg-<code>.json` = per-language
  translations) merged into the `get_label` dictionary by
  `src/core/labels/catalog.ts`. Labels ride **code** deploys, not ontology
  updates: a key ships in the same commit as the code that references it. The
  served dictionary always carries the full master key set (previously a lang
  file missing a key served `undefined`). The prior model — `dd_ontology`
  `model='label'` (`dd383`) rows rebuilt into generated JS lang files — is
  retired: those rows are inert and the generated lang files are deleted. New
  invariant gate: `labels_tripwire`. See
  [Internationalization → Program strings](./development/internationalization.md#2b-program-strings-the-repo-label-catalogs-get_label).
- **Label catalog cleanup** (WC-034) — the master key census went 686 → 413:
  28 renames to English keys, 240 proven-unused removals, and 21 single-tool
  keys migrated into their tools' own `register.json` labels (edited with
  [`tool_dd_label`](./tools/using_dd_label.md)). The `get_label` wire shape is
  unchanged; only the key set.

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

