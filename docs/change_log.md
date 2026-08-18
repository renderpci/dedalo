# Change log

Last modification date:

2026-07-25T00:00:00+01:00

Dédalo version

7.0.0

---

## [Unreleased] - Maintenance panels that would not open, and panels that opened empty

### Fixed
- **The *Export hierarchy* maintenance panel opens again.** Selecting it in the
  maintenance area refused with *"The 'export_hierarchy' panel is not available
  on this engine"* and rendered nothing — which also put its working
  *Sync hierarchy active status* action out of reach, since the whole card dies
  with the failed value load. The panel now reports that hierarchy EXPORTING is
  not offered by this engine (it wrote install dump files) and renders the sync
  form, which is the operation it actually has.

- **The five migration panels (*Move TLD*, *Move locator*, *Move to portal*,
  *Move to table*, *Move lang*) show their definition files again.** Each opened
  with no explanation text and an EMPTY file list, so there was nothing to
  select and the transform could not be run at all. The engine had been serving
  the body and the file list all along — the panel simply never asked for it.

    Both bugs are the same invariant broken from opposite sides: a panel's value
    load is a PAIR (the widget serves a value, the panel asks for it) and either
    half alone is a broken panel. A gate now checks the pairing in both
    directions for every maintenance widget, so a half-wired panel fails the
    test suite instead of an operator's browser.

---

## [Unreleased] - The login panel is shown once

### Fixed
- **Logging in no longer asks for the credentials twice.** The login screen
  rendered the login panel **twice** — the form itself, dimmed, with a second
  one overlaid on top of it — so entering the user and password once appeared to
  do nothing and the operator had to type them again.

    The second panel was the **re-login overlay**, which exists to recover a
    session that died under a working page. The activity tray mounts with the
    page, and it mounted on the login screen too: its first act is to read the
    caller's own background work, which for a caller who has not logged in yet
    is correctly refused with `not_logged` — and any `not_logged` raised the
    overlay. The tray now mounts only for a logged-in page and asks nothing
    while anonymous, and the overlay refuses to open on a page that never had a
    session: it is a *re*-login, never a second login. A session that expires
    mid-use still gets the modal, which is the case it was built for.

---

## [Unreleased] - The ontology parser: one write, and it is fast

### Removed
- **The ontology parser's *Reconcile* button.** The tool offered two writes onto
  the runtime ontology — an incremental *Reconcile* that applied only what had
  drifted, and *Regenerate*, which wipes the hierarchy's runtime nodes and
  re-derives them. Reconcile's whole justification was that it never left the
  ontology momentarily empty, and that stopped being true of Regenerate the day
  the rebuild moved inside a single transaction: readers keep seeing the current
  ontology until the new one commits, and a failure rolls back. What was left was
  a strictly weaker write offered beside the stronger one, with nothing to tell an
  operator which to press — and a second code path to keep in step with the
  ontology parser forever.

    **Regenerate is now the one write onto the runtime tree**, and *Refresh
    status* still answers "what drifted" without changing anything. Ordering a
    node no longer prompts the question the button existed to ask: reordering
    genuinely changes every sibling that moved, so "only what drifted" was the
    whole hierarchy anyway.

### Changed
- **Rebuilding an ontology no longer refreshes the export files**, and became
  ~20× faster for it. *Regenerate* used to rebuild the LLM map for the **whole
  installation** afterwards, whichever single hierarchy you had ticked. That map
  is one of the files other installations download, and a rebuild refreshes none
  of its companions — so keeping it alone current never made the published set
  coherent, while costing 21 of the 22 seconds an operator spent waiting. The
  files are refreshed by **Export**, which publishes all of them together.

    !!! tip "If you rebuilt in order to publish"
        Press **Export** afterwards. That was already true of the ontology
        definition files; it is now true of the LLM map too.

    This is also where the `dropped sqo target …` lines in the server log during
    a rebuild came from — the whole-install map walk, reporting components that
    point at ontologies this installation has registered but never imported.
    They still appear on an export, and in normal editing of those components,
    which is where they are actionable.

### Fixed
- **Any component offering "every ontology" as a search target took 42 ms to
  configure — on every single request.** Resolving such a component's search
  configuration enriches each target section it offers, and asked the database
  twice per section whether it has a *new record* and a *delete record* button —
  four times over for a section with neither. On an installation carrying 205
  ontologies that is ~800 queries to draw one autocomplete, repeated on every
  page that shows it, and nothing about the answers changes between requests.

    The lookup is now remembered alongside the other ontology reads, so it costs
    **0.64 ms**. Authoring a new button still shows up immediately — the memory
    is dropped whenever the ontology is written, like every other ontology cache.
    Building the LLM map, which resolves 9 408 such fields, went **21.7 s → 1.2 s**
    on the same installation, producing a byte-for-byte identical file.

---

## [Unreleased] - A record is read once per read

### Fixed
- **A list page re-read the same record once per widget path.** The info widgets
  ask for one component at a time, and each ask fetched a WHOLE matrix row — so a
  `component_state` declaring eight paths over the same related record fetched
  that record eight times, and a media-icon widget on the same page fetched it
  again. On a ten-row page of an oral-history section that was **145 record reads
  for 27 distinct records** — 81% pure repetition, and 328 ms of the 371 ms the
  request spent in the database. The waste grew with both the page size and the
  archive, which is why the page kept getting slower without anything changing.

    A record is now fetched **once per read**, and the page-level batch loaders
    hand their results to the same store, so a component asking for a record the
    page already loaded costs no round trip. Same page: **3 record reads**, and
    the count no longer grows with the page size. The list read went 421 ms →
    66 ms, and an edit read of the same section 107 ms → 56 ms. Responses are
    byte-for-byte identical — this is purely the number of round trips.

- **The active-tools registry was re-queried once per rendered row.** The lookup
  takes no arguments — it is the same query every time — and a media-icon widget
  runs it per row, so a ten-row page ran it ten times for 43 ms. It is now read
  once and cleared whenever the tools registry (`dd1324`), the install config or
  a user profile is written, through the existing tool-cache invalidation.

    !!! note "Out-of-band registry edits need a cache clear"
        Activating or deactivating a tool through the interface invalidates the
        cache immediately. Editing `matrix_tools` directly in the database does
        not — use the maintenance area's cache-clear action, or restart.

## [Unreleased] - The `state` widget reads like a table, and adds up

### Fixed
- **The state breakdown panel contradicted its own cell.** A source record that
  saved nothing contributes 0 to the average but emits no `detail` item, so a
  record with two linked resources and one value showed a hover panel reading
  `total : 50%` beside a cell reading `25%` — two numbers, both labelled total.
  The panel now lists **one row per source record** (the empty ones included,
  as explicit `0%`) under a single ruled-off total that always equals the cell.
  It also dropped every row after the first on a non-translatable leaf, and
  clipped long option names to one letter per line.
- **A row with no data collapsed the layout.** The cells of an empty
  situation/state column were not rendered at all, so the next row's label was
  auto-placed into the hole and the labels marched across the columns. Empty
  cells are now drawn, and read `—`.

### Added
- **`items` on the `state` widget's `total` items** — the source-record count
  the total is averaged over, i.e. its own divisor. TS-only and additive; wire
  contract `WC-2026-08-03-state-widget-total-source-count`.
  [Shape and rationale](./core/components/component_info.md#state--detail-total-and-the-items-divisor).

### Changed
- **The state widget's edit view was restyled** to the maintenance widget-kit
  language: card surface, uppercase header, hairline row rules, tabular
  numerals, and a meter per percentage (full at 100%, muted empty track at 0%).
  Every colour goes through a theme token, so the breakdown panel is no longer
  a white slab in dark mode. Percentages are keyboard reachable, and the panel
  stays open while the pointer travels into it.

## [Unreleased] - Session lifetime, and the media cookie bound to it

### Changed
- **Session expiry retuned.** The idle timeout drops from 12 h to **1 h**
  (`SESSION_TTL_SECONDS`) and the absolute cap from 30 days to **12 h**
  (`SESSION_ABSOLUTE_TTL_SECONDS`). An unattended browser is the threat the idle
  window exists for, and because the client polls in the background the idle
  clock alone never expires anything — the cap is what actually ends a working
  day. Both clocks were already enforced on read; only the defaults moved.
  **Long-running work is unaffected**: background imports keep their requesting
  user on the job record and diffusion re-derives the enqueuing principal at run
  time, so a publication run or a massive import survives its owner's logout and
  reattaches after re-login.
- **The media access cookie now lives exactly as long as the session.**
  `dedalo_media_auth` is re-issued on any authenticated request whose value is
  missing or stale, with `Max-Age` = the session idle window.
  [Media protection](./core/system/media_protection.md) ·
  [login](./core/system/login.md).

### Added
- **Pre-expiry warning.** The client warns before a session dies, so unsaved work
  can be committed instead of the next click failing. Lead time is
  `SESSION_WARNING_SECONDS` (default 300; `0` disables it). The boot payload
  ships only the absolute deadline — the idle window restarts on every request,
  so the client re-arms a local timer from its own activity beat.

### Fixed
- **Images, video, PDFs and 3D files 404'd for anyone logged in longer than a
  day**, while the application itself looked completely healthy. The media
  cookie was minted only at login with a fixed 24-hour `Max-Age` while the
  session refreshed on every request; since the *web server* enforces media
  access, losing the cookie removed every media file with no other symptom. The
  reverse leak is closed too — a cookie minted just before logout stayed a valid
  media credential for up to 48 hours with no session behind it.
- **An expired session showed up as a network error and blank widgets** instead
  of the re-login modal. The client's whole recovery path keys on the error code
  `not_logged`, which the server never emitted (it put the human message in
  `errors[]`), and the client's retry wrapper treated the 401 as a transport
  failure and threw before the response could be read. Expiry now raises the
  re-login modal in place, and pending saves replay on `login_successful`.
- **Expired sessions were never garbage-collected** when they hit the absolute
  cap. The sweeper matched only the idle clock, so a session kept warm by a
  polling client past the cap was refused on every request and its row kept
  forever.

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
  Distinct from `DEDALO_MEDIA_EXPORT_BASE`, which continues to root export cells
  only (unset means unresolved, never guessed). That key is the **rename** of
  `DEDALO_MEDIA_BASE_URL`: the two names were indistinguishable while the values
  differ only in audience, so the pair now says who each one serves — the old
  spelling is retired and refuses the boot until the line is renamed. Its value
  is normalized like `webBase` (trailing slash stripped), and it takes the media
  directory too (`https://host/dedalo/media`), because both bases are prefixed
  to the same media-root relative path. See
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

