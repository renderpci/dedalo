# WIRE_CONTRACT — deliberate divergences from the PHP wire shape

Ledger of every DELIBERATE divergence between the TS engine's JSON API output
and the live PHP oracle (DEC-15). The byte-identical client is the real spec at
these seams; the PHP shape is recorded as the fossil it replaces.

**Standing rule (DEC-02/DEC-12):** a deliberate divergence commit must touch its
parity gates in the same commit, and add (or amend) an entry here the same day.
A red parity gate with no ledger line here is a REGRESSION, not a divergence.

Entry format: id · date · decision reference · shape before (PHP) / after (TS) ·
reason · gate reconciliation.

**Fixture interaction (DEC-14b):** the PHP wire shape is also frozen in the
oracle-harvest golden store (`engineering/ORACLE_HARVEST.md`). A new entry here must
state whether the affected gates need a re-harvest (they do NOT when the gate
transforms the PHP/fixture response before diffing — the WC-001 pattern).

---

## WC-001 — `entries: []` for empty component values (was `entries: null`) — UNIFIED

- **Date adopted:** 2026-07-02 (commit 589deae, portal + select families);
  gates reconciled 2026-07-07; **unified for ALL models 2026-07-07** (WS-C:
  the single chokepoint is `resolve/component_data.ts buildDataItem`, which
  normalizes a null value to `[]` for every data item the engine emits).
- **Decision:** DEC-02, option (a) — adopt `[]` as the TS contract.
- **Shape before (PHP):** a component data item with no stored value emits
  `"entries": null`.
- **Shape after (TS):** the same item emits `"entries": []` — every model,
  every mode.
- **Reason:** the byte-identical client's lifecycle code requires an array
  (`Array.isArray` assertions in the client suites; `entries.map(...)` call
  sites crash on null). The client is the actual consumer of this seam.
- **Gate reconciliation:** `test/parity/normalize.ts#adoptEntriesArrayContract`
  rewrites a PRESENT `entries: null` to `[]` before diffing — every other byte
  is still compared verbatim. Applied to the **PHP side only** in:
  `read_differential`, `portal_differential`,
  `portal_edit_subdatum_differential`, `portal_drag_capture_replay`,
  `get_data_differential`, `complex_relation_sweep`, and
  `model_coverage_sweep` (previously BOTH sides
  there; the TS side is now compared RAW, so an engine regression back to
  `null` reddens the sweep — the shrunken normalization doubles as the
  tripwire). Future gates that byte-compare data items must import it rather
  than hand-rolling.
- **Scope note:** only the DATA-item `entries` key. Envelope (`sections`)
  entries were always arrays on both engines.

## WC-003 — `DEDALO_DIFFUSION_API_URL` omitted from plain_vars under native diffusion

- **Date:** 2026-07-05 (native diffusion cutover levers); ledgered 2026-07-07.
- **Decision:** self-contained cutover posture (project memory: TS stands
  alone; the TS server serves NO `/dedalo/diffusion/api/v1/` route).
- **Shape before (PHP):** `plain_vars.DEDALO_DIFFUSION_API_URL =
  "/dedalo/diffusion/api/v1/"` (points the client at the legacy Bun diffusion
  API).
- **Shape after (TS, whenever native diffusion is on):** the key is ABSENT —
  the client then routes diffusion through the native TS actions.
- **Gate reconciliation:** `test/parity/environment_differential.test.ts`
  asserts the divergence explicitly (TS omits / PHP has) and compares the rest
  of plain_vars exactly.

### Addendum 2026-07-29 — native is now the DEFAULT, not an opt-in

The flag defaulted to `false`, so an install that never wrote
`DEDALO_DIFFUSION_NATIVE` kept emitting `DEDALO_DIFFUSION_API_URL` and pointed
`tool_diffusion` at the external PHP-era service. That service is decommissioned
(cutover 2026-07-11) and this server serves NO `/dedalo/diffusion/api/v1/`
route, so the `false` branch could only ever produce a 404 — observed as
`tool_diffusion` failing to open in any section, masked by a downstream
`Invalid tool wrapper: missing tool_header`.

Changes:

- Catalog default `DEDALO_DIFFUSION_NATIVE: false → true`
  (`src/config/catalog/diffusion.ts`). Emitting the key is now the explicit
  opt-out, for a deployment that still runs the external service behind a route
  of its own.
- The three readers moved from `readEnv('DEDALO_DIFFUSION_NATIVE') === 'true'`
  to `readBool('DEDALO_DIFFUSION_NATIVE')` — `readEnv` returns `undefined` when
  the key is unset and IGNORES the catalog, so the old form pinned the value to
  `false` no matter what the catalog said. Sites: `core/resolve/environment.ts`
  (the wire shape), `core/area_maintenance/widgets/diffusion_server_control.ts`
  and `.../check_config.ts` (the two panels that REPORT the posture — left on
  `readEnv` they would report "external" while the wire routed native).

Wire effect: on a default install `plain_vars` no longer carries
`DEDALO_DIFFUSION_API_URL`. The PHP-oracle divergence recorded above is
unchanged in kind; only the condition that triggers it is now the default.

## WC-002 — service-worker manifest served by TS only when PHP has no twin

- **Date:** 2026-07-06 (Tier-1 S1-19). Not a shape divergence: TS implements
  `dd_utils_api::get_dedalo_files` to the PHP contract (`{type,url}[]` +
  `dedalo_version`). Recorded here because the client's sw.js has NO failure
  fallback: any future change to this action's shape stalls every login at the
  progress ring. Treat the shape as frozen; gate:
  `test/parity/dedalo_files_differential.test.ts`.

## WC-004 — TS-native install surface (pre-auth while unsealed; SUPERSEDES the 2026-07-07 stopgap)

- **Date:** 2026-07-07 stopgap (login-gated, dd1590-pinned); **2026-07-09
  IMPLEMENTED** — the full TS-native installer landed (DEC-19 cutover blocker
  RESOLVED). This entry describes the CURRENT shape.
- **Decision:** the TS server installs itself (no PHP). `src/core/install/` +
  the browser wizard + the `dedalo:install` CLI. See `docs/install/ts_native_install.md`.
- **Shape before (PHP):** `dd_utils_api::install` (sub-actions
  `test_db_connection`, `persist_config`, `set_root_pw`, `install_finish`,
  `install_db_from_default_file`, `install_hierarchies`, `register_tools`,
  `check_directories`, `verify_active_config`, `test_diffusion_connection`,
  `to_update`) and `get_install_context` are PRE-AUTH, guarded by
  `DEDALO_INSTALL_STATUS` + an install-window IP allowlist; `start` returns the
  installer context while not installed.
- **Shape after (TS):** `dd_utils_api:install` (routing by `options.action`) and
  `dd_utils_api:get_install_context` are **registered and pre-auth WHILE
  UNSEALED**, IP-gated by `DEDALO_INSTALL_ALLOWED_IPS` (unset = open, dev),
  enforced in dispatch Gate 1b. Once `install_finish` seals the instance
  (`ts_state.json` `install_status='sealed'`) the whole surface returns **404**.
  `get_install_context` returns a **synthetic** installer element (built by
  hand, `buildInstallContext` — no ontology needed pre-restore) whose
  `.properties` carry `needs_config`/`init_test`/`server_info`/
  `target_file_path`/`hierarchies`. `start` mounts `model:'installer'` when
  `config.installMode`. Record-writing steps (`install_hierarchies`,
  `register_tools`) additionally require a session (post in-wizard login).
  Responses are TOP-LEVEL (`{result,msg,...extras}`) per the client contract.
- **Server_info honesty:** the PHP/Apache-only checkers were REMOVED entirely
  from both the payload and the client grid (WC-006), not emitted as null; the
  real progression gate is `init_test.result`.
- **Gate reconciliation:** `test/unit/install_gate.test.ts` (mount + sealed-404
  + IP + pre-auth + record-step 401) and `test/unit/security_fail_closed.test.ts`
  (sealed → 404). No parity gate diffs these actions — no re-harvest needed.

## WC-005 — `diffusion_server_control` goes TS-native (client widget + panel); `media_path` engine-native

- **Date:** 2026-07-07 (user WIP landed; see LEDGER S2-23 deferral row).
- **Decision:** self-contained cutover posture (project direction: TS stands
  alone — own diffusion engine, own media dir).
- **Shape before (PHP):** the widget drives the legacy daemon
  (`start_server`/`stop_server`/`restart_server`); `media_control.get_value`
  reports the PHP install's `media_path`; the client widget files are
  byte-identical to the PHP tree.
- **Shape after (TS):** the widget drives the NATIVE engine's durable job
  queue (`requeue_job`/`purge_jobs`/`set_scheduler` + `cancel_process`/
  `retry_pending_deletions`); its label is the literal
  'Diffusion engine & queue'; `media_path` reports the TS tree's OWN media
  root (`MEDIA_PATH` in `<private>/.env`, no longer the PHP install's dir).
  The widget's client files (`client/dedalo/core/area_maintenance/widgets/
  diffusion_server_control/`) are a TS-OWNED divergence from the byte-identity
  rule — excluded from `scripts/sync_client.sh` like `tools/`; port PHP
  changes by hand.
- **Gate reconciliation:** `widget_request_differential` media_control test
  asserts `media_path` AND the `.publication` marker store per-engine (TS =
  `config.media.rootPath`, PHP = its own absolute path; the TS store may
  honestly report `base_exists:false` until `rebuild_media_index` provisions
  the cutover dir) and keeps quality/registry byte-parity;
  `widgets_differential` carves the label out of byte-parity. No re-harvest.

## WC-006 — `tool_common` client machinery relocated to `/dedalo/core/tools_common/`

- **Date:** 2026-07-07 (ledgered retroactively — the gate normalization
  predates this row; found by the 2026-07 test-quality audit).
- **Shape before (PHP):** the shared tool client machinery (`tool_common.js`
  et al.) is served from the tools tree at `/dedalo/tools/tool_common/…`, and
  `get_dedalo_files` manifests those URLs.
- **Shape after (TS):** the machinery lives in `src/core/tools/client` and is
  served at `/dedalo/core/tools_common/…` (see `core/tools/paths.ts` — the
  tools/ tree is TS-owned, not part of the byte-identical client copy). The
  `get_dedalo_files` manifest emits the TS URL; same files, same bytes,
  different base path. The service worker only maps `el.url` into a cache
  Set, so any self-resolvable URL satisfies the client contract.
- **Gate reconciliation:** `dedalo_files_differential.test.ts
  comparableLine()` maps the PHP base onto the TS base before comparing
  (cites this row) and separately asserts every TS URL resolves through the
  server's static surfaces — the rewrite cannot hide a 404.


## WC-007 — `tool_transcription` success `msg` is a real "OK." (PHP leaves the error msg on success)

- **Date:** 2026-07-07 (tools production-readiness pass).
- **Shape before (PHP):** `automatic_transcription` (class.tool_transcription.php:402)
  and `check_server_transcriber_status` (:775) never reset the initial
  `msg = 'Error. Request failed [<fn>]'` on their SUCCESS branch — a latent PHP
  bug — so a successful call returns `{result:<babel result>, msg:'Error. …',
  errors:[]}`.
- **Shape after (TS):** the success branch returns the truthful
  `msg:'OK. Transcription job submitted'` (automatic_transcription) /
  `msg:'OK. Request done [check_server_transcriber_status]'`. `result` and
  `errors` are unchanged; only the human-readable `msg` differs, and only on
  success. Deliberate: replicating a "success reported as error" string in a
  production server would poison operator logs and any client that surfaces
  `msg`.
- **Gate reconciliation:** the byte-identical client contract is preserved — the
  client reads only `response.result` here (the `test_tool_transcription`
  client gate is green), so the `msg` text is not part of the wire the client
  depends on. Cited at both return sites in
  `tools/tool_transcription/server/index.ts`.

## WC-008 — single-step portal export = COMPACT per-reference cells (PHP fans out deep)

- **Date:** 2026-07-08 (user-requested: "the three resolutions are correct").
- **Shape before (PHP):** `tool_export.get_export_grid` with `data_format:
  'grid_value'` and a SINGLE-step `ar_ddo_to_export` path whose component is a
  portal (stored ontology model `component_portal`) recurses the portal's
  request_config and emits one column PER LEAF FIELD
  (`numisdata6_numisdata163.rsc332_rsc368.rsc205_rsc140`, …).
- **Shape after (TS):** the same request emits ONE base column
  (`numisdata6_numisdata163`); each referenced record's FULL flat info (the
  per-target string of `resolveRelationTargetValues` — the same fields the
  value format joins) lands in ONE cell; the breakdown explodes references by
  ROW (`default`/`rows`) or by `'|n'` COLUMN (`columns`, labels
  `'Bibliografía 2'`…). Scope: STORED model `component_portal` only — the
  runtime `component_portal` alias of autocompletes keeps PHP deep parity.
- **Why:** product decision (owner, 2026-07-08) — all THREE portal resolutions
  must be selectable from the existing tool UI with no client change: drag the
  portal UNEXPANDED → compact per-reference (this shape); drag EXPANDED child
  components → deep field columns (multi-step paths, PHP-parity, byte-gated);
  format `Estándar` → everything in one cell (PHP-parity). PHP offers no
  compact option, so matching it would lose two of the three.
- **Gate reconciliation:** asymmetric pin in
  `test/parity/tool_export_breakdown_differential.test.ts` ("WC-008 single-step
  portal COMPACT …", both engines asserted); the multi-step deep corpus in the
  same file stays byte-equal to PHP. Implementation:
  `src/diffusion/export/atoms.ts` (compact branch) +
  `src/core/resolve/relation_list.ts::resolveRelationTargetValues` (extracted
  per-target half of the byte-gated datalist branch).
- **2026-07-10 extension:** compact cells now also fold in a reference's
  PAIRED DATAFRAME frames (`resolveDataframeFlatValue` — the "full ref info in
  one cell" promise extended to frame fields); no live portal carries paired
  frames on this corpus, so the existing WC-008 pins are unaffected.

## WC-009 — `sqo.order` entry may name an exact column with `path:[{ column }]` (PHP requires `component_tipo`)

- **Date:** 2026-07-09 (user-requested: coherent order convention).
- **Shape before (PHP):** `trait.order.php build_sql_query_order` requires a
  `component_tipo` on every order entry (validated at :155-163: it must be a
  member of `search::$ar_direct_columns` or a valid tipo, else the entry is
  SKIPPED). PHP's `column` field is an OPTIONAL override that still needs
  `component_tipo` (it supplies the SELECT alias `<component_tipo>_order`). So an
  order authored as `path:[{ column:"section_id" }]` (no `component_tipo`) is
  IGNORED by PHP → the list falls back to `section_id ASC`.
- **Shape after (TS):** the `sqo.order` path end-step accepts EITHER
  `component_tipo` (order by a component's value — the generic case) OR a
  standalone `column` (order by an exact structural/flat matrix column —
  id/section_id/section_tipo/… — the direct case). `component_tipo` WINS when
  both are present. `buildOrderClauses` honors a `column`-only entry
  (`src/core/search/sql_assembler.ts`), so `path:[{ column:"section_id" }]`
  orders `section_id DESC`. `column` is gated by `assertValidDataColumn`
  (`VALID_DATA_COLUMNS`). Ontology carrier: dd542 Activity's `section_list`
  (dd549) default sort.
- **Why:** semantic coherence (owner, 2026-07-09) — `component_tipo` should name
  a component, not double as a raw-column slot; a dedicated `column` field makes
  "order by an exact column" self-documenting. The PHP-tolerated shortcut
  `component_tipo:"section_id"|"section_tipo"|"id"` is KEPT working for
  back-compat/parity; only the `column`-ONLY form is TS-exclusive.
- **Gate reconciliation:** no parity gate reds — the differentials that touch
  ordering (`activity_read_differential`, `multihop_order_differential`) send an
  EXPLICIT client order, and nothing compares the config-default sort across
  engines. Unit coverage: `test/unit/search_order_id.test.ts` (column-only,
  component_tipo-wins, gate rejection). Client-side: the sort-arrow UI keys on
  `component_tipo` (`ui.js:3011`), so a `column`-only DEFAULT shows no arrow —
  cosmetic, and the default sort is server-applied (never client round-tripped).

## WC-010 — consultation-only sections are strictly read-only (TS hardens duplicate/delete beyond the oracle)

- **Date:** 2026-07-09 (user directive: Activity dd542 + Time Machine dd15 must
  be strictly read-only — "the user can never modify the information").
- **Context — mostly a parity FIX.** PHP already makes these sections read-only
  via three guards the TS engine had NOT all ported: the section-permission cap
  (`section::get_section_permissions:1929` → level ≤ 1 for dd542; dd15 is
  admin-only in `common::get_permissions`), the save refusal
  (`dd_core_api::save:1330` "Illegal save to activity", search_* excepted), and
  the create refusal (`section::create_record:452`). TS now mirrors all three:
  `getSectionPermissions` (permissions.ts) applies the cap and feeds the client
  read-only rendering + the create/duplicate/delete API gates; the save handler
  refuses with the search_* exception; the write engines
  (`create/duplicate/delete/saveComponentData`) backstop every door (client,
  MCP, agent). `getPermissions` is UNCHANGED (still a faithful mirror of
  `common::get_permissions`, which does NOT cap dd542 — the cap lives one layer
  up), so the `permissions_differential` contract is intact.
- **Shape before (PHP):** `duplicate` / `delete` gate on the UNcapped
  `common::get_permissions(section_tipo, section_tipo)` and carry no extra
  activity/TM guard. A misconfigured profile granting level ≥ 2 on dd542/dd15
  would let the PHP oracle duplicate or delete one of these records (success +
  new id / deletion).
- **Shape after (TS):** the same request is refused — a 403 at the API handler
  (section perm capped at 1) and a hard throw at the write engine — regardless
  of any grant. Registry: `CONSULTATION_ONLY_SECTIONS` in
  `src/core/concepts/section.ts` (add a tipo to extend the policy to a future
  section).
- **Client editability (the UI half).** The record read path stamps a COARSE
  per-request permission (`section/read.ts` + `resolve/read_tm.ts`: 3 for
  admins, 1 otherwise — the acknowledged "v0" cap, exact per-element propagation
  deferred). So an ADMIN saw every Activity/TM component as editable (e.g. the
  'Who' column dd132). The fix caps at the single context chokepoint
  `resolve/structure_context.ts::buildStructureContext`: every element emitted
  for a consultation-only section comes back `permissions ≤ 1`, so the client's
  `disabled_component` path fires (`ui.js:251`, permission < 2) and no
  admin-only affordance (perm ≥ 3) is attached. This is complemented by a cap AT
  THE READ SOURCE (`section/read.ts` + `resolve/read_tm.ts`): when the read
  TARGET is consultation-only the coarse per-request permission is capped at 1
  before it is threaded into the tree, so CROSS-SECTION portal subdatum children
  are covered too — e.g. the Activity 'Who' column's username `dd132`, whose own
  `section_tipo` is `dd128`/Users; `buildStructureContext` keys on the element's
  own section and would leave it at admin-3 (editable), but the source cap makes
  the whole subtree read-only. For a normal global admin this
  MATCHES PHP (PHP resolves the Activity component perm from the matrix, which
  grants ≤ 1 — admins are not auto-3, only the superuser is). It diverges from
  PHP ONLY for the superuser (user -1), whom PHP leaves at 3 (editable-looking,
  though its save is still refused). TS renders it read-only per the directive —
  strictly safer, and the superuser is the system/root account.
- **Why:** the directive is that these sections are *always* read-only; leaning
  on "no profile happens to grant write" (the oracle's posture) is the exact
  fragility being closed. Strictly safer; observably identical under normal data
  (no shipped profile grants write on dd542/dd15).
- **Gate reconciliation:** no differential gate reds — the emission differentials
  (`activity_read`, `tm_read`, `section_elements_context`, `read`) run as a
  non-admin, where the component perm is already ≤ 1 in both engines, so the cap
  is a no-op there; no parity gate mutates a real dd542/dd15 record
  (scratch-write hygiene forbids it), so the beyond-oracle write branch is never
  exercised against the live oracle. The invariant is pinned by the unit tripwire
  `test/unit/consultation_only_sections_tripwire.test.ts` (the section-perm cap,
  the `buildStructureContext` client-editability cap handed admin-level 3, and
  every engine refusal). `permissions_differential` gains a fidelity assertion
  that the cap lives ONLY in `getSectionPermissions`, never in `getPermissions`.

## WC-011 — multi-section projects filter is PER-SECTION (PHP filters by the first section only, fail-open)

- **Date:** 2026-07-09 (found while fixing BUG-0, the autocomplete picker
  routing; security review ran on the Opus pass).
- **Shape before (PHP):** `trait.where.php build_sql_projects_filter` scopes to
  `$this->main_section_tipo` — the FIRST entry of `sqo->section_tipo` — only
  (:743-744), resolves ONE `component_filter` tipo from that section
  (:849-866), and `build_union_query` (class.search.php:1048-1065) is a pure
  FROM-table `str_replace` that copies that single clause verbatim into every
  UNION branch. Consequences for a NON-ADMIN multi-section search:
  - first section UNGATED → the `return` at trait.where.php:857-864 emits NO
    filter at all → every gated non-first section returns UNFILTERED
    (**fail-open cross-project enumeration — a live PHP defect**);
  - filter tipos differ per section → non-first rows are checked against the
    first section's JSONB key → wrongly excluded (fail-closed functional bug).
- **Shape after (TS):** `buildMultiSectionProjectsFilter`
  (`src/core/search/sql_assembler.ts`) emits one disjunct per searched section
  — `(alias.section_tipo = $X AND EXISTS(<own filter tipo>…))` for gated
  sections, a bare `alias.section_tipo = $Y` guard for ungated ones — placed
  before the UNION rewrite so it self-selects per branch and per-row in
  same-table `section_tipo IN (…)` queries. Returns `''` when no searched
  section is gated (byte-identical to the ungated case). Single-section
  searches keep the byte-parity `buildProjectsFilter` clause. This replaces
  the Phase 5c fail-closed throw (which also broke non-admin multi-section
  `count`) — the autocomplete picker over multi-target portals now works for
  non-admins, correctly scoped.
- **Why:** restoring parity here would port a cross-project enumeration hole;
  the per-section form converges to the ACL PHP intends record-by-record.
  Same strictly-safer class as WC-010 / the AUTHZ-05 guard.
- **Gate reconciliation:** no differential reds — the pre-existing
  `projects_filter_differential` single-section cases assert TS-vs-DB ground
  truth (unchanged, byte-parity clause), and its NEW multi-section cases
  (incl. the fail-open guard: ungated section FIRST must still scope the gated
  one to 103 project-7 records, not 15k) deliberately assert TS ground truth,
  NOT PHP equality — running the ungated-first shape against live PHP would
  reproduce the leak. SQL-shape pins: `test/unit/
  search_projects_filter_multisection.test.ts`.

## WC-006 — installer diagnostics grid drops the PHP/Apache-only checkers (TS-owned client)

- **Date:** 2026-07-09 (TS-native install polish).
- **Decision:** the TS-native installer never runs against PHP, so its wizard
  client is a TS-OWNED divergence (like `diffusion_server_control`, WC-005),
  excluded from `scripts/sync_client.sh` (`--exclude='installer/**'`).
- **Shape before (PHP):** `render_installer.js` renders 18 diagnostic cards,
  eight of them PHP/Apache-specific (PHP Version, Memory Limit, PHP Memory, Max
  Execution Time, Apache, PHP User, GD, mbstring); `server_info` carries those
  keys.
- **Shape after (TS):** those eight cards are removed from the installer client
  grid, and `buildInstallServerInfo()` no longer emits their keys. The grid
  shows only TS-meaningful facts (System RAM, CPU Frequency, PostgreSQL, Disk
  Free Space, Platform, Server Software, ImageMagick, FFmpeg, cURL, OpenSSL);
  `cpu_mhz` is now populated from `os.cpus()`. The PHP tree keeps its own
  PHP-era installer client unchanged.
- **Gate reconciliation:** the `client_serving` byte-identity tripwire does not
  cover the installer files (only page/common/main.css), so no gate diffs these.
  No parity gate diffs the installer — no re-harvest needed.

## WC-012 — filter_by_list `format:'function'` maps the client's v6 function name to the v7 `data_*` twin (PHP errors on it)

- **Date:** 2026-07-09 (user report: the numisdata161 catalogue pre-filter
  "searches all type catalogues always").
- **Shape before (PHP):** the autocomplete pre-filter checkboxes send clauses
  `{q:'"<fct>_<st>_<si>"', format:'function',
  use_function:'relations_flat_fct_st_si'}` (v6 function names, baked into the
  byte-identical client). The PHP engine interpolates the name verbatim; this
  DB defines only the v7 `data_relations_flat_*` functions (install/db), so
  the query ERRORS and the picker returns **0 results** (probed live
  2026-07-09). The TS engine simply had no `format:'function'` handling, so
  the clause was silently ignored → UNFILTERED results (the reported bug).
- **Shape after (TS):** `conform.ts` resolves the clause through an explicit
  allowlist (`relations_flat_{st_si,fct_st_si,ty_st_si,ty_st}` → the `data_*`
  twins; `data_*` names accepted as-is) and emits
  `data_relations_flat_fct_st_si(alias.relation) @> $n::text::jsonb` with the
  flat key bound as a parameter (never interpolated; malformed keys contribute
  nothing; unknown function names throw loudly). The pre-filter now narrows
  correctly (numisdata309 catalogue 1 → 5425 / catalogue 2 → 2726 = SQL ground
  truth; ACIP-only picker returns 30/30 ACIP records).
- **Why:** functionality-over-parity (owner directive: autocomplete is a
  service, not stored data) — both engines were broken in different ways; the
  TS behavior is what the feature means. Upstream PHP should map the name or
  re-define the legacy functions.
- **Gate reconciliation:** no cross-engine equality is possible while live PHP
  errors — `search_filter_by_list_function.test.ts` asserts TS ground truth
  (counts vs direct EXISTS queries, allowlist throw, malformed-key drop).
- **Amendment (2026-07-20, implementation only — wire shape and result sets
  unchanged):** conform translates the allowlisted clause into an EXACT
  tuple-IN over the `matrix_relation_index` per-locator store — the flat key
  splits unambiguously on `_` (tipos never contain underscores) into the
  variant's typed columns, each a bound parameter. Equality pinned by
  `relation_index_store.test.ts` (index vs raw-jsonb counts) alongside the
  existing TS-ground-truth gate.
- **Amendment 2 (2026-07-20, same day — the flat functions are REMOVED):** the
  `data_relations_flat_*` stored functions, their GIN indexes and every SQL
  path that called them are gone (v7 ships no legacy relation engine; owner
  directive). The `use_function` names are from here on **wire vocabulary
  only**: the allowlist maps them to index-column layouts, nothing else. The
  index is required — an uncovered instance throws with the maintenance
  remediation (`search_store.ts` requireRelationIndex) instead of falling
  back. The v6→v7 update drops both name families (`relations_flat_*` and
  `data_relations_flat_*`) on closed installations; the install dump ships
  without them.
- **Amendment 3 (2026-07-21 — canonical leaf `format:'relation'`, legacy
  vocabulary DEPRECATED; owner directive: clean nomenclature for the clean
  implementation):** the wire shape the shipped client now emits is
  `{format:'relation', q: <partial locator object> | <array of them>, path}` —
  q fields are the locator vocabulary (`section_tipo` required, `section_id`,
  `from_component_tipo`, `type`), an array means OR within the leaf (the
  filter_by_locators semantics), strictly validated (unknown fields / bad
  tipos / non-integer id THROW; the new contract owes loud errors, not
  bug-compat). Both shapes emit the identical matrix_relation_index tuple-IN.
  `format:'function'` + `use_function` remains accepted as a DEPRECATED
  READER for beta-era saved searches; nothing in the tree emits it. Producer
  migrated: `view_default_autocomplete.js` filter_by_list checkboxes; zero
  occurrences of the legacy vocabulary exist in ontology data (probed
  2026-07-21). Gates: `search_filter_by_list_function.test.ts` (canonical
  single/array/strict cases + the legacy reader pins).

## WC-013 — tool_assistant client goes TS-NATIVE server-driven (the assistant rewrite)

- **Date:** 2026-07-09 (user directive: "rewrite the tool_assistant — a solid
  AI integration with the work MCP"; plan approved same day).
- **Shape before (PHP copy, byte-seeded):** 11 js files. The chat ran a
  CLIENT-side agent loop over either a browser-local ONNX model
  (`model_engine.js`, Transformers.js dynamically imported from the jsDelivr
  CDN) or a direct browser→OpenAI-compatible endpoint fetch; MCP tools were
  executed via `mcp_client.js` → `dd_mcp_api:mcp_proxy`; the system prompt
  lived in client JS; **dd1633 carried server-model `api_url`/`api_key`
  flagged `client:true` — the key was served to every browser** (fixed here).
- **Shape after (TS-native):** 10 js files (~-45% bytes): `model_engine.js`,
  `mcp_client.js`, `client_tools.js` DELETED and `ai_assistant.js` reduced to a
  one-line COMPAT ALIAS (`export const ai_assistant = assistant_controller`) —
  the byte-identical client core opens the edit-menu assistant panel with a
  dynamic `import('.../tool_assistant/js/ai_assistant.js')`
  (`client/dedalo/core/menu/js/view_default_edit_menu.js:588`, same in the PHP
  tree), so the SERVER side keeps that name alive rather than editing `client/`.
  New: `assistant_controller.js` (thin turn driver) + `agent_stream.js` (SSE
  consumer). The chat drives the SERVER agent (`dd_mcp_api:agent_models` /
  `agent_chat_stream` / `agent_apply`): server-side prompt, model catalog
  with egress classes, per-record egress gate, propose→confirm→apply plan
  cards. dd1633 emptied (`{}`); dd1327 → 2.0.0; dd1372 labels updated; the
  jsDelivr CDN dependency is gone.
- **mcp_proxy is UNCHANGED and still gate-covered** (dd_mcp_api.test.ts —
  the literal `'No valid MCP session ID provided'` recovery contract) for the
  PHP tree's tool_assistant copy and external consumers.
- **Why:** browser models are unreliable at tool use; direct browser→LLM
  traffic bypassed audit + egress control; the prompt was frozen in the
  byte-copied client. The `tools/` tree is TS-owned (rewrite/client_seam.md) —
  this divergence is census/registry-level, not a client-copy-rule breach.
- **Gate reconciliation:** `dedalo_files_differential.test.ts` filters
  `/dedalo/tools/tool_assistant/` from BOTH sides of the census compare and
  pins the TS file set explicitly; `tools_register_differential.test.ts` is
  diff-free after the dd1324 registry write (version 2.0.0; PHP must NOT
  re-import tools — rewrite/COEXISTENCE.md); `tool_assistant_register.test.ts`
  (unit) asserts dd1633 stays secret-free.

## WC-014 — single `=` string operator: exact match (PHP strips it and runs contains)

- **Date:** 2026-07-09 (owner-directed: "PHP is not a reference here — add
  operators in a better way").
- **Shape before (PHP):** the string search grammar has `==` (exact), `!=`,
  `-`, `!!`, `*` wildcards and `'quoted'` literals — but NO single `=`: a
  leading `=` falls through to the default case, which STRIPS `[+*=]` and runs
  contains. Typing `=Ea` therefore matched every value CONTAINING "ea"
  (1,250 hits on es1), so short names (`Ea`, `Ye`, `Ibi`) could never be
  reached in the autocomplete picker.
- **Shape after (TS):** `=word` is the single-char twin of `==` — exact,
  accent/case-insensitive equality (`builder_string.ts`; the shared tokenizer
  already glued `=` to its word, so `q_split` multi-word input fans out
  per-word). `=Ea` → exactly 1. `==`, `'quoted'`, wildcards, `-`, `!=`, `!!`,
  `*`/`!*` all keep their prior semantics (both engines agree there).
- **Why:** functionality — the picker needs a discoverable, single-keystroke
  exact operator; quoted literals work on both engines but nobody types them.
  Upstream PHP should adopt the same mapping.
- **Gate reconciliation:** no differential reds — no parity gate sends a
  single-`=` q (they would now deliberately diverge). TS ground truth pinned
  in `test/unit/search_string_equal_operator.test.ts` (exact vs contains
  cardinality on es1 `Ea`/`Ye`/`Ibi`, bare-`=` no-crash, `==`/literal
  equivalence).

## WC-015 — tree node `order` pairs by the parent-link item `id` (PHP returns the FIRST item's stale value)

- **Date:** 2026-07-10 (reported: ontology tree reorder reverts on reload —
  dd15 under dd207 saved at 6, redisplayed at its old position).
- **Shape before (PHP):** `ts_node_repository::pick_order_value_for_parent`
  matches order-dataframe entries on `$item->id_key` — a field NO write path
  has ever produced (`trait.dataframe_common::add_value_by_id_key` writes
  `{value, id}`). Its "legacy unkeyed" scan then treats id-keyed entries as
  unkeyed and returns the FIRST entry's value. Single-item dataframes work by
  accident; a multi-item dataframe (multi-parent node, or a node MOVED between
  parents — dd15's `[{id:1,value:2},{id:2,value:6}]`) yields the stale item.
  Verified live 2026-07-10: PHP `get_children_data` dd0/207 returns dd15
  `order: 2`; the client sorts children by `order` (ts_object.js:667), so the
  saved reorder visually reverts on reload.
- **Shape after (TS):** `node_repository.ts pickOrderValueForParent` step 1
  pairs on `item.id_key ?? item.id` (the field actually written by both
  engines; `id_key` honoured first for any row carrying the name PHP
  expected), and the unkeyed scan requires NO pairing key of any generation.
  dd15 emits `order: 6` — the value `save_order` wrote.
- **Reason:** functionality — save_order/sortChildren, dd_ontology
  order_number sync and the children ARRAY order (getChildren pairs correctly
  via getInlineValueByIdKey) all already use `id`; the node-payload picker was
  the one reader pairing on the phantom field, and it feeds the client's sort.
  Upstream PHP should adopt the same one-line pairing fix.
- **Gate reconciliation:** no differential reds — the tchi1 fixture nodes
  (`ts_node_read_differential`, `ts_mutations_differential`) carry single-item
  order dataframes, where both pickers agree byte-for-byte (ran green against
  the live oracle 2026-07-10). TS ground truth pinned in
  `test/unit/ts_tree_semantics.test.ts` (cases 1b–1d: the dd15 multi-item
  shape, id-keyed ≠ unkeyed, and the no-link-id fallback). No re-harvest
  needed (no golden-store gate covers a multi-item order dataframe).

## WC-016 — `properties.css` reserved mode keys `list`/`search` (TS-only opt-in; PHP has no per-mode component css)

- **Date:** 2026-07-10 (user-approved alongside the PHP-parity port of the
  list-mode css strip).
- **Shape before (PHP):** `build_structure_context_core`
  (class.common.php:1801-1846) treats a component's `properties.css` as one
  opaque selector-fragment map: emitted whole in edit/search/tm, nulled in
  list (`remove_edit_css`). A component therefore CANNOT carry list-mode css
  of its own — list styling only exists on the section_list child node or via
  the section-node `properties.css->{tipo}` override.
- **Shape after (TS):** `resolveEmittedPropertiesAndCss` +
  `resolveCssModeKeys` (resolve/structure_context.ts) reserve the top-level
  keys `list` and `search` on any winning css object (own, section_list
  child's, or override). Bare keys keep PHP semantics verbatim; `css.list` is
  emitted (alone) in list mode despite the strip, `css.search` overrides the
  bare set in search mode, and reserved keys never leak into another mode's
  emission. An object whose bare set is emptied by reserved-key removal emits
  null, not `{}`. A section-node override is never list-stripped (PHP replaces
  the already-nulled css — an override is deliberate any-mode styling).
- **Why:** most css add-ons are edit-oriented (the strip is right), but the
  hard mode-based rule leaves no per-component list channel. The reserved keys
  give a declarative opt-in with zero client changes (the client applies
  whatever `context.css` arrives; server-side resolution keeps the context
  core cache pure — mode is already in its key).
- **Coexistence risk (why this is ledgered):** a PHP engine serving a
  mode-keyed row emits the RAW object in edit mode — the PHP client's
  `set_element_css` renders the reserved keys as garbage-but-inert selectors —
  and strips it entirely in list. The feature is TS-engine-only until PHP
  adopts the same resolution. `list`/`search` are reserved words: a css object
  cannot use them as selector fragments anymore.
- **Gate reconciliation:** no differential reds — MEASURED 2026-07-10: zero
  css objects in dd_ontology carry a `list`/`search` key, so every live css
  emits byte-identically to PHP (pinned by
  `component_list_css_strip_differential` + the `css` field now compared in
  `context_differential`). TS ground truth pinned in
  `test/unit/structure_context_css.test.ts` (the WC-016 describe block: list
  opt-in over the strip, search override, no cross-mode leaks, `{}`
  byte-pass-through for bare objects, mode keys inside overrides and
  section_list child css).

## WC-017 — `dd_error_report_api:receive_report`, a TS-only pre-auth intake action (PHP has no twin)

- **Date:** 2026-07-10 (user-approved error-report feature).
- **Shape:** a NEW API class+action with no PHP counterpart — the TS
  ACTION_REGISTRY was previously action-complete vs PHP API_ACTIONS, so any
  TS-only action is ledgered here. `receive_report` accepts an error report
  relayed machine-to-machine by another installation's server (the
  tool_error_report relay, WC-019) and appends it to the TS-owned
  `dedalo_ts_error_reports` table (migration 0002).
- **Exposure:** pre-auth (`NO_LOGIN_ACTIONS` + `CSRF_EXEMPT_ACTIONS`, the
  login posture) but FLAG-GATED: dispatch Gate 1c refuses unless
  `DEDALO_ERROR_REPORT_RECEIVER=true` (default off), answering the EXACT
  Gate-1 unregistered-action shape so a probe cannot learn the endpoint
  exists. Hardening in the handler: per-(entity,ip) sliding-window throttle,
  optional per-deployment shared token (constant-time), 256 KiB payload
  clamp, strict shared Zod schema. Security posture + privacy/retention:
  SECURITY_DECISIONS.md "Error-report intake".
- **Coexistence risk:** none — PHP never dispatches the class; a PHP server
  receiving the RQO answers its own unknown-action error, which the relay
  reports honestly to the admin.
- **Gate reconciliation:** no differential covers unknown API classes (no red
  to normalize). TS ground truth pinned in
  `test/unit/error_report_receiver.test.ts` (flag off/token/throttle/schema/
  stamping paths).

## WC-018 — `error_reports` maintenance widget (TS-only; conditional catalog entry + TS-owned client files)

- **Date:** 2026-07-10.
- **Shape:** the maintenance dashboard catalog gains an `error_reports`
  widget (browse the WC-017 intake) ONLY where
  `DEDALO_ERROR_REPORT_RECEIVER=true` — on every other installation the
  catalog stays byte-identical to PHP. Its client JS lives at
  `client/dedalo/core/area_maintenance/widgets/error_reports/` as a TS-OWNED
  divergence (the diffusion_server_control WC-005 pattern), excluded from
  `scripts/sync_client.sh`. Rendering rule: report fields are untrusted
  remote content — textContent only, never inner_html.
- **CSS:** the widget look lives in
  `widgets/error_reports/css/error_reports.less` (system_info visual language,
  theme-aware `--fg_*`/`--bg_*`) and is `@import`ed into `area_maintenance.less`.
  The client `main.less` cannot compile standalone (it imports `tool_common`,
  which is served from `src/` and is not a physical client file), and `main.css`
  is built in the PHP tree + synced — which cannot include this TS-only widget.
  So `error_reports.less` is compiled standalone (`lessc`) and its output
  APPENDED to `client/dedalo/core/page/css/main.css` under a marker comment.
  A full `sync_client.sh` re-sync reverts the append (main.css re-synced from
  PHP) — the script RE-APPENDS it automatically (idempotent marker check;
  fails loudly without `lessc`, 2026-07-10 follow-through), so a re-sync never
  silently ships the widget unstyled. Verified readable in light + dark via a
  headless puppeteer screenshot.
- **Gate reconciliation:** `widgets_differential` filters `id ===
  'error_reports'` from the TS catalog before the byte-compare;
  `dedalo_files_differential` filters the widget's client files via
  `isTsOnlyEntry`. TS ground truth pinned in
  `test/unit/error_reports_widget.test.ts`. `client_serving.test.ts` asserts
  main.css as PHP-bytes-exact-PREFIX + exactly this ONE marker-tagged tail
  (strict byte-identity minus the ledgered append; reconciled 2026-07-10 —
  the append had landed without updating this gate, turning verify red).

## WC-019 — `tool_error_report`, a TS-only tool (dd1324 row TS-written; PHP must not re-import)

- **Date:** 2026-07-10.
- **Shape:** a new tool package in the TS-owned `tools/` tree (admin-only:
  active, NOT always_active, granted to no profile) whose server half relays
  admin error reports to the master installation (WC-017). The shared dd1324
  registry row is written by the TS *Register tools* widget
  (TOOLS_ENABLE_REGISTRY_IMPORT; registered on this install 2026-07-10).
- **Global launch surface (2026-07-10, upstreamed — NOT a TS divergence):**
  the tool is toolbar-less (`affected_models: []`, `show_in_inspector: false`)
  and launched from a SINGLE global surface: a small fixed floating button
  (`core/common/js/error_report_launcher.js`, admin-gated, injected once from
  `core/page/js/index.js` after render) present on EVERY page — including
  menu-less `?menu=false` windows (thesaurus term, print). A short-lived
  top-menu-bar variant was tried and dropped as redundant (the floating button
  already covers menu'd pages), which keeps `view_default_edit_menu.js`
  unedited. It opens the tool BY NAME with a SYNTHETIC caller
  (`{model,type:'tool',tipo,lang,id_base,label}`) — `view_modal` hard-requires a
  caller; the tool defines `on_close_actions()` so the close flow skips the
  component re-activate that would fail on a synthetic caller. Resolves on the
  TS engine only; on a PHP-served client the button appears but open_tool finds
  no context (PHP has no such tool on disk) and does nothing — the same
  coexistence wrinkle as the dd1324 row (COEXISTENCE).
- **Coexistence (MEASURED 2026-07-10):** PHP-served admins do NOT see the
  tool at all — PHP's `get_all_registered_tools` drops any dd1324 row whose
  on-disk client config is missing ("Ignored bad config" `continue`,
  `tools/tool_common/class.tool_common.php:788-796`), so the TS-only row
  never enters PHP's tool lists (only a debug_log ERROR line). Cleaner than
  the tool_assistant listed-but-broken shape; the standing rule stays: PHP
  must never re-import tools (COEXISTENCE row).
- **Gate reconciliation:** `tools_register_differential` carves the tool out
  of the in-registry no-op requirement via `TS_ONLY_TOOLS` (still validated;
  still diff-free once registered, with a staleness self-test);
  `user_tools_differential` + `section_tools_differential` filter the tool
  from the TS side (PHP lists never carry it, per the measured drop above);
  `dedalo_files_differential` filters `/dedalo/tools/tool_error_report/` via
  `isTsOnlyEntry`. All four verified GREEN against the live oracle
  post-registration. TS ground truth pinned in
  `test/unit/tool_error_report.test.ts`.
- **Screenshot field (2026-07-17):** the submission/wire payload gains ONE
  optional field `screenshot` — an INLINE `data:image/(png|jpeg|webp);base64,…`
  data URL, never a fetchable URL (no SSRF surface; the `.regex()` in
  `src/core/error_report/schema.ts` rejects any other shape). It is
  `.optional()` on top of `.nullable()` so a report from an older client that
  omits the key still validates at the master (cross-version wire). The admin
  attaches it in the tool UI (file-pick / drag / clipboard-paste); the browser
  re-encodes it to a compact `image/jpeg` under a ~150 KiB budget before it is
  ever sent, and the existing 256 KiB whole-payload cap
  (`REPORT_MAX_SERIALIZED_BYTES`) still bounds the total. Stored inside the
  report's `context` jsonb (`screenshot`), NOT a new column — no migration. The
  `error_reports` widget renders it as an `<img src="data:…">` (inert as
  markup; still never `inner_html`) and elides the base64 blob from the raw
  Context dump. Purely additive; PHP has no twin and never reads this endpoint.

## WC-020 — `component_alias`: first-class tipo-level aliasing (TS-native; PHP emits the raw model and cannot serve alias reads/saves)

- **Date:** 2026-07-10 (owner decision: the alias node is THE config carrier
  for tool components — single source of truth instead of inline ddo_map
  property copies; contract: `src/core/ontology/alias.ts`).
- **Shape:** an ontology node `model:'component_alias'` with REQUIRED
  `properties.alias_of:'<target component tipo>'` (single hop; alias-of-alias,
  missing target, missing alias_of and the retired v5 keys
  `max_records`/`look_inside`/`edit_view` all THROW). Effective properties =
  `{...target.properties, ...alias.properties minus alias_of}` — TOP-LEVEL-KEY
  wholesale replacement; precedence rqo `source.properties` override → alias
  merge → target. Wire identity: context/data emit the ALIAS tipo with the
  TARGET's `model`/`legacy_model`/translatable and the alias's OWN label; the
  byte-identical client instantiates the target's JS class with zero client
  changes (instances.js keys purely on `model`). DATA identity: reads, writes,
  search WHERE/ORDER, item-id counters, TM audit and the relation_search index
  all key the TARGET's column slot (`resolveDataTipo`) — stored data NEVER
  contains an alias tipo. ACL hops to the target (an alias is a view with the
  target's exact rights). v1 wires the portal family + literal emission +
  save/search/order; other relation faces throw loudly (LEDGER known-open gap).
- **Divergence:** PHP has NO alias resolution (dead since v5): it enriches
  ddo_map entries with `model:'component_alias'` verbatim and its client
  cannot build them. After `scripts/migrate_component_alias.ts --execute`
  re-points numisdata201's coins role at numisdata203, the PHP epigraphy
  coins panel is DEGRADED (COEXISTENCE row).
- **Gate reconciliation:** `section_tool_start_differential` byte-pins
  numisdata201's config through a coins-entry normalizer (strips the entry
  both sides, byte-compares the rest, pins the TS alias shape explicitly —
  no-op pre-migration); `tool_component_read_differential` pins the
  `source.properties` override MECHANISM against numisdata77 via a frozen
  fixture (`test/parity/fixtures/coins_override_properties.json`). TS ground
  truth: `test/unit/component_alias.test.ts` (scratch contract + data/save
  round-trip) and `test/unit/component_alias_numisdata203.test.ts`
  (post-migration, visibly gated on the DB state).

## WC-021 — `unit_test.create_test_record` restores the canonical test3 fixture (PHP twin stays live-defective)

- **Date:** 2026-07-10 (single-verified-source rebuild of the test3 playground
  data; owner decision — the maintenance reset must actually RESTORE the
  playground, not destroy it).
- **Shape:** wire strings unchanged (`dd_area_maintenance_api` /
  `widget_request` / model `unit_test` / action `create_test_record`; msg
  `OK. Request done unit_test::create_test_record`). TS behavior: TRUNCATE
  matrix_test, restart its id sequence, insert the FULL canonical record set
  from `src/core/test_data/test3_canonical.json` (records 1/2/27; shape
  contract in `src/core/test_data/manifest.ts`), exact-set the `test3`
  matrix_counter to MAX(section_id). Surgical sibling for harnesses:
  `restoreCanonicalTest3()` (test3 rows only, raise-only counter, no
  truncate/sequence touch).
- **Divergence:** the PHP twin is live-defective — its `test_data.json` still
  carries V6 column shapes AND re-appends the explicit
  section_id/section_tipo columns, so the PHP reset TRUNCATEs then DIES
  (`column "section_id" specified more than once`), leaving matrix_test EMPTY
  with `result:false`. PHP restores nothing; TS restores everything.
  Coexistence (shared DB): a PHP-triggered reset still empties the table —
  the TS harness self-heals (`ensureCanonicalTest3()` in the shape-dependent
  gates, plus the client-runner reseed) and the widget re-populates on demand.
- **Gate reconciliation:** `test/parity/widget_request_differential.test.ts`
  pins BOTH sides in one snapshot-protected test (PHP: result:false +
  duplicate-column msg + empty table; TS: exactly the canonical records +
  exact counter). Fixture truth: `test/unit/test3_canonical_fixture.test.ts`
  (tripwire — coverage vs the test3 ontology subtree, REQUIRED_SHAPES,
  restore/reset round-trips).

## WC-022 — `register_tools.register_tools` OWNED-mode report items (TS installer shape, not PHP `file_info` rows)

- **Date:** 2026-07-10 (UPDATE_PROCESS Phase 1 — the register_tools import
  unlocked behind the standalone-ownership gate).
- **Shape:** only reachable when `core/update/ownership.ts engineOwnsInstall()`
  is true (historically the TS install seal + `DEDALO_ENGINE_OWNS_INSTALL`;
  the gate collapsed to ALWAYS TRUE at the 2026-07-11 cutover — PHP retired). Envelope bytes match the oracle
  (`class.register_tools.php::register_tools`): `result` = per-tool array
  (truthy), `msg` = `OK. Request done successfully` |
  `Warning! Request done with errors`, `errors` = flat per-tool error strings.
- **Divergence:** the per-tool `result` items are the TS installer shape
  `{name, dir, version, imported, errors, warnings}`
  (`src/core/install/register_tools.ts` precedent) instead of PHP's
  `tools_register::import_tools` objects (`file_info`, ontology-merge fields).
  The byte-identical client renders the envelope generically
  (`render_register_tools.js` print_response: msg + joined errors + a JSON
  tree of the whole envelope, then repaints from `get_value`), so no client
  field-access depends on the item shape; the TS items are the more useful
  diagnostic rows.
- **Coexisting (gate closed) is UNCHANGED:** the dry-run diff report
  (`dry_run/total/invalid_count/would_change_count/report`) stays byte-frozen
  — pinned by `test/parity/widget_request_differential.test.ts`.
- **Gates:** `test/unit/register_tools_widget.test.ts` (open-mode bytes via
  mocked gate + importTools spy proving `{dryRun:false}`; closed-mode dry-run
  envelope); `test/unit/update_ownership_tripwire.test.ts` (the action is
  gated, EXPECTED_GATED-frozen, and its open branch is NOT a stub).

## WC-023 — `update_ontology.update_ontology` OWNED-mode ingest is stricter than PHP (staged, verified, recoverable)

- **Date:** 2026-07-10 (UPDATE_PROCESS Phase 2 — the ontology import unlocked
  behind the standalone-ownership gate; Opus-designed transport hardening).
- **Shape:** only reachable when `engineOwnsInstall()` is true (always, since the 2026-07-11 cutover) — historically never while
  coexisting with PHP (closed mode keeps the frozen `engine_denied` bytes).
  Success envelope mirrors PHP: `result:true`,
  `msg = ('OK. Request done successfully' | 'Warning! Request done with
  errors') + joined step messages`, `root_info:{term, properties}` from dd1.
  Panel (`get_value`) bytes match PHP `{servers (probed), current_ontology,
  prefix_tipos, structure_from_server, body, confirm_text}`; the legacy
  `STRUCTURE_SERVER_URL/CODE` fallback is not carried (TS installs are
  v7-configured). **Partly SUPERSEDED by WC-028 (2026-07-11):** `prefix_tipos`
  is now emitted as `active_ontology_tlds` (same value, honest name); the rest
  of this byte list stands.
- **Divergences (each deliberately STRICTER; `src/core/ontology/
  data_io_import.ts` + `ontology_update.ts`):**
  D1 TLS peer verification stays ON (PHP `ssl_verifypeer=false`; private CAs
  via `NODE_EXTRA_CA_CERTS`; `NODE_TLS_REJECT_UNAUTHORIZED=0` refused +
  tripwired). D2 downloads refuse redirects. D3 streamed size caps
  (256 MiB/file) + stall guard. D4 the client-supplied `files` list is
  schema-validated (zod) — a malformed list PHP tolerated now hard-fails.
  D5 the network target is re-resolved from the CONFIG catalog by server
  code and every URL is origin-pinned; destination filenames are CONSTRUCTED
  from the validated tld (never `basename(url)`); `section_tipo` recomputed.
  D6 decompression byte + ratio ceilings. D7 **all-or-nothing**: everything
  stages + validates BEFORE the first destructive statement, a per-table
  recovery snapshot is taken first, each file's DELETE+`\copy` is ONE psql
  transaction, and any failure AUTO-RESTORES the snapshots — PHP's per-file
  partial success (`result:true` + errors, half-imported state) cannot occur;
  failures answer `result:false`. D8 COPY-shape sanity check before DELETE.
  Local-source runs ('Local files') read the IO dir directly instead of
  self-HTTP (wire-invisible).
- **TS-N/A steps:** the PHP session wipe + static JS lang-file regen have no
  TS equivalent (labels are DB-derived; in-process caches purged via
  `clearOntologyDerivedCaches`); the PHP backend-activity row is not ported.
- **Master surface (PHP parity, fail-closed):** `dd_utils_api:
  get_server_ready_status` + `get_ontology_update_info` (NO_LOGIN +
  CSRF-exempt machine-to-machine POSTs; refuse unless `IS_AN_ONTOLOGY_SERVER`
  + a configured access code) and the
  `/dedalo/install/import/ontology/<major.minor>/<file>` snapshot route
  (allowlisted basenames, confined dir). The recovery-file pair
  (`build_database_version.build_recovery_version_file` /
  `restore_dd_ontology_recovery_from_file`) is gated open with the same
  semantics as PHP (pg_dump slice of whitelisted TLDs; restore recreates only
  the `dd_ontology_recovery` table).
- **Gates:** `test/unit/ontology_ingest.test.ts` (transport hardening
  branches, manifest builder, schema-diff bytes, and the DESTRUCTIVE
  copy-import exercised on a throwaway scratch DATABASE incl. the
  mid-COPY-failure rollback proof); `test/unit/update_ownership_tripwire.test.ts`
  (gated non-stub + the TLS ban). The full owned-mode pipeline against a real
  master is an operator drill on a scratch instance (ledgered in
  rewrite/LEDGER.md — no automated surface mutates a live ontology).

## WC-024 — `update_code.update_code` OWNED-mode swap is stricter than PHP (verified, quarantined, atomic, supervised)

- **Date:** 2026-07-10 (UPDATE_PROCESS Phase 4 — the code update unlocked
  behind the standalone-ownership gate; Opus-designed download/extract/swap
  hardening).
- **Shape:** only reachable when `engineOwnsInstall()` is true (always, since the 2026-07-11 cutover) and a process
  supervisor is present — never while coexisting with PHP (closed mode keeps
  the frozen `engine_denied` bytes). The panel (`get_value`) mirrors PHP
  `{servers (probed), dedalo_source_version_local_dir, is_a_code_server}`. The
  install request is the PHP `{file:{version,url,sha256?,force_update_mode?},
  update_mode, info}` shape; success answers `{result:true, msg:'OK. Installed
  Dédalo <v> (<mode>). Restarting…'}` and the server exits for the supervisor.
- **Divergences (each deliberately STRICTER; `src/core/update/code_update.ts`
  + `code_download.ts` + `code_build.ts` + `code_manifest.ts`):**
  D1 manifest `sha256` verified post-download (PHP verifies nothing; optional
  ed25519 lever). D2 TLS peer verification ON (PHP `ssl_verifypeer=false`).
  D3 redirects refused. D4 streamed size cap + stall guard (PHP unbounded).
  D5 ZIP magic sniff before extraction. D6 `zipinfo` PRE-VALIDATION rejects
  any absolute/`..`/non-`dedalo_code/`-prefix name and any SYMLINK entry
  BEFORE extraction — closes the info-zip symlink-write-through escape (PHP
  `ZipArchive::extractTo` trusts entry names). D7 quarantine-then-rename swap,
  never over the live tree; old tree backed up with version+timestamp,
  same-device asserted for atomic renames. D8 strict-linear re-enforcement at
  install (`assertLinearUpgrade` — no downgrade/skip, minor/major bumps land
  on .0) as a backstop against a malicious server. D9 live swap REFUSED
  without a supervisor (`DEDALO_SUPERVISED` / systemd env). D10 git build twin
  uses a Bun.spawn argv array + a strict ref regex (no shell). D11 sha256
  sidecar emitted next to each built archive (the integrity metadata the
  manifest serves).
- **Master surface (PHP parity, fail-closed):** `dd_utils_api:
  get_code_update_info` (NO_LOGIN + CSRF-exempt machine-to-machine POST; refuse
  unless `IS_A_CODE_SERVER` + a configured `CODE_SERVERS` code; advertises only
  built releases on the caller's linear path) and `get_server_ready_status`
  gains the `code_server` branch.
- **Wire-visible additions (client-tolerant):** per-file `sha256` on the
  manifest (the byte-identical client reads only version/url/date/
  force_update_mode and ignores it); the restart-then-report flow. No client
  edit needed.
- **Config keys censused:** CODE_SERVERS, IS_A_CODE_SERVER,
  DEDALO_CODE_FILES_DIR, DEDALO_CODE_SERVER_GIT_DIR, DEDALO_SUPERVISED,
  DEDALO_BACKUP_PATH, DEDALO_SOURCE_VERSION_LOCAL_DIR.
- **Gates:** `test/unit/code_update.test.ts` (strict-linear matrix, zipinfo
  zip-slip + symlink rejection, magic sniff, tree-marker sanity, and the FULL
  download→verify→extract→clean-swap chain + checksum-mismatch refusal against
  a synthetic release in a TEMP tree). The live projectRoot swap + restart is
  an operator drill on a scratch instance (ledgered — no automated surface
  swaps the running tree).

## WC-025 — move_* transform executors are a FUNCTIONAL port against the split schema, with mandatory dry-run

- **Date:** 2026-07-10 (UPDATE_PROCESS Phase 5 — the tld→tld transform engine
  unlocked behind the standalone-ownership gate).
- **Shape:** only reachable when `engineOwnsInstall()` is true (always, since the 2026-07-11 cutover) — historically never while
  coexisting with PHP (closed mode keeps the frozen `engine_denied` bytes). The
  panel (`get_value`) is unchanged (`{body, files}` — the definition-file
  listing, now read from the TS-owned `config.ops.transformDefinitionsDir`).
  The EXECUTE request is `{files_selected, dry_run}`; the response is a
  transform report `{result, msg, errors, dry_run, counts, sample}`.
- **NO BYTE ORACLE — functional parity (the load-bearing divergence):**
  `class.transform_data.php` is written against the LEGACY monolithic `datos`
  JSONB column (+ TM `dato`); the LIVE schema is split typed columns
  (data/relation/string/…/relation_search, TM `data`). A byte translation of
  the PHP SQL would be WRONG against the current DB. Every executor is
  therefore RE-EXPRESSED against the split schema (precedent: the diffusion
  functional-parity bar) — the transforms must WORK, not diff byte-for-byte
  against dead SQL:
  - `changes_in_tipos` (move_tld): structural `section_tipo`/TM `tipo` rename +
    matrix_counter drop + embedded-tipo string rewrite (`"old"`→`"new"`, PHP's
    own `replace_tm_data` approach) across every jsonb column of every table.
  - `changes_in_locators` (move_locator): counter-offset id move (structural)
    + an app-layer jsonb walk rebasing every referencing locator's
    section_tipo + section_id (the offset is per-reference, so not a string
    replace) + `set_move_identification_value`.
  - `portalize_data` (move_to_portal — THE flat-data+link-back pattern):
    per source record, copy each mapped component's column value under the
    target tipo into a NEW target-section record (relation locators repointed
    via from_component_tipo), set a component_portal locator on the SOURCE,
    null the moved source components, relocate the TM history in place
    (save_tm suppressed = a direct UPDATE, no new snapshot). Composed from
    createSectionRecord + updateMatrixKeysData (no PHP one-shot Save exists).
  - `move_data_between_matrix_tables` (move_to_table): INSERT…SELECT (over
    MATRIX_COPY_COLUMNS, not `datos`) + DELETE per tipo, one transaction each.
  - `change_data_lang`/`lang_to_nolan` (move_lang): re-key the lang inside the
    per-tipo column object + the TM `lang` column.
- **DRY RUN IS REQUIRED (TS improvement over PHP's execute-only transforms):**
  `dry_run` must be exactly `false` to mutate; absent/true reports the would-be
  deltas without writing. The response's `counts`/`sample` are the operator's
  pre-execute review.
- **NO ROLLBACK** for locator/tld moves (PHP parity — counter offsets are
  irreversible); the widget response and the engine header say so, and the
  dry-run is the safety gate. The operation is O(all rows across all tables)
  (the widget body itself warns "a very long process… all the records") —
  run under maintenance mode.
- **Gates:** `test/unit/transform_engine.test.ts` (pure locator-rebase +
  definition-file confinement + dry-run recorder units; safe SELECT-only
  dry-run smoke over the live DB with non-existent tipos; a real EXECUTE of
  changes_in_tipos on the matrix_test scratch table — rename + embedded rewrite
  + counter drop, cleaned up). portalize/locators EXECUTE against live sections
  is an operator drill on a scratch instance (ledgered — no automated surface
  mutates live section data).

## WC-026 — component_info entries carry BOTH `id` and `widget_id` matching keys

- **Date:** 2026-07-10 (component_info widget framework rebuild — the
  "widgets render blank" root cause).
- **Shape:** every top-level widget item in a component_info data item's
  `entries` (section read; stored-misc AND live-compute branches) carries
  BOTH `id` and `widget_id` when either is a string:
  `{widget, key, id, widget_id, value, …}`. Normalizer:
  `src/core/components/component_info/widgets/widget_common.ts`
  `normalizeWidgetEntryKeys` (applied in the `info` emit hook). Scalar
  string keys only — media_icons row objects (whose `id` key holds a CELL
  object) and nested shapes (state's `value.widget_id`) pass through
  verbatim; the tags widget's leading raw text items (no `widget` tag) are
  untouched. The single-widget API channel (`dd_component_info`
  `get_widget_data`) stays PHP-byte-verbatim — the divergence covers the
  section-read `entries` and the save response's merged observer item
  (`observers_data` — the same client renders consume it); observer
  matrix_time_machine rows stay RAW computed shape (PHP-byte, coexistence).
- **Divergence rationale:** the client widget renders match on `widget_id`
  (`render_get_archive_weights.js:249` et al.) while the grid/export
  builders match on `id` — and PHP emits ONE key per widget class
  (weights/state live = `widget_id`, calculation live = `id`) with all
  STORED misc values id-keyed. Verified live 2026-07-10: the PHP client
  renders every stored numisdata archive (17,087 records) AND every live
  calculation BLANK. The server must satisfy the client's contract
  (AGENTS.md hard rule) — emitting both keys is the test_info widget's own
  precedent and repairs rendering without mutating stored data.
- **Gate reconciliation:** `test/parity/info_widget_differential.test.ts`
  `phpEntries` normalizes the PHP response with the SAME production
  function before diffing (the WC-001 pattern); the calculation empty-input
  pin asserts the added `widget_id` explicitly.

## WC-027 — `check_config` maintenance widget: eager folded status + TS-native details/mode readouts

- **Date:** 2026-07-10.
- **Symptom fixed:** the `check_config` card painted danger-red while FOLDED on
  a perfectly healthy install. `check_config` is not a `background` widget, so
  its data loads lazily on open — but the client still `render()`s the card at
  page build (folded) with `self.value` unset. `render_check_config.js` reads
  the empty `db_status`, sees `global_status===undefined` (`!== true`), and adds
  the `danger` class. Opening the panel loaded real data and cleared it → the
  "red only while folded" report.
- **Shape after (TS):**
  - `check_config.get_value` now has a twin `eagerValue`; the catalog
    (`get_ar_widgets` / `getMaintenanceWidgets`) PRE-LOADS the payload onto the
    widget descriptor's `value`, so the folded card paints from REAL status
    (green when healthy, honestly red only on a genuine probe failure). Same
    computation as the panel-open probe (`computeCheckConfig`) → folded and
    opened renders are byte-identical.
  - The `result` payload gains two TS-native, PHP-absent blocks:
    `db_info` = `{ identity (name@host:port), server (PostgreSQL version),
    schema_ok, ontology_rows, matrix_tables, migration_level, migration_latest,
    pool:{in_use,max,waiters} }`; `runtime_mode` = `{ maintenance, recovery,
    notification, diffusion_native, dev_mode }`. New read-only accessors feed
    them: `getPoolStats()` (`db/postgres.ts`), `statePath()`
    (`resolve/server_state.ts`), `SESSION_DB_PATH` (`security/session_store.ts`).
  - `config_sources` now reports the session store at its REAL filename
    (`dedalo_ts_sessions.sqlite`, honoring `DEDALO_SESSION_DB_PATH`) — the old
    hardcoded `sessions.sqlite` never existed, so the row was always "absent".
  - Client `render_check_config.js` renders "Database details" + "Runtime mode"
    sections, each GUARDED on `value.db_info` / `value.runtime_mode` — so the
    PHP server (which emits neither) renders the ORIGINAL card unchanged. This
    is a ONE-FILE TS-owned divergence (the widget's other client files stay
    byte-identical), excluded from `scripts/sync_client.sh` (see its
    `TS_OWNED_EXCLUDES`, alongside WC-005/WC-018).
- **Gate reconciliation:** none needed on the catalog — `widgets_differential`
  already strips every widget's `value` before the byte-compare (the 11
  PHP-value widgets ship TS-null there; check_config now ships a value the PHP
  side lacks, still stripped). `test/unit/server_state.test.ts` pins the
  `eagerValue` payload (db_status object shape, `db_info` identity/server/
  schema/migration/pool, the five `runtime_mode` booleans) and the corrected
  session-store reporting.

## WC-028 — `update_ontology` panel: `prefix_tipos` → `active_ontology_tlds`

- **Date:** 2026-07-11 (post-cutover; the first contract edit made with no live
  oracle to answer to — PHP is decommissioned dead code).
- **Why:** the key was a PHP inheritance that named the value wrongly. It is not
  a "prefix" of a "tipo": it is the set of ontology TOP-LEVEL DOMAINS active in
  this installation (`dd`, `rsc`, `oh`, …) — which is the vocabulary the rest of
  the codebase already speaks (`safeTld`, the `tld:` fields across
  `core/install/`, and `el.tld` in the client's own manifest filter).
- **Shape after (TS):** the `update_ontology` `get_value` panel envelope renames
  ONE key — `prefix_tipos` → `active_ontology_tlds` (`string[]`, still the
  configured TLDs unioned with the always-on `ontology`/`ontologytype` pair).
  Every other key in the WC-023 byte list (`servers`, `current_ontology`,
  `structure_from_server`, `body`, `confirm_text`) is unchanged. This SUPERSEDES
  the `prefix_tipos` name in WC-023's panel enumeration.
- **Config key (same rename, un-wired from PHP):** `DEDALO_PREFIX_TIPOS` →
  `ACTIVE_ONTOLOGY_TLDS` (`config.ontologyIo.activeOntologyTlds`). The rename is
  HARD — deliberately NOT added to `env.ts`'s `PHP_KEY_ALIASES` — so the retired
  spelling is enforced by a boot refusal (`RETIRED_ENV_KEYS` in `config.ts`):
  an `.env` still carrying the old key fails loudly instead of falling back to
  the `[]` default, which would silently shrink the update panel's manifest to
  `ontology`/`ontologytype` alone.
- **Client:** `client/` is TS-owned since the cutover, so both sides move in the
  same commit — `render_update_ontology.js` reads `value.active_ontology_tlds`,
  names its form input `active_ontology_tlds`, filters the master's manifest by
  it, and prints the config-grid row as `ACTIVE_ONTOLOGY_TLDS` (the key name is
  rendered verbatim to the operator, so a half-rename would have shown a key
  that no longer exists).
- **Gate:** `test/unit/active_ontology_tlds.test.ts` — the env key (comma-list +
  JSON-array forms), the retired-spelling boot refusal (loud, and NOT an alias),
  and the panel wire key (`active_ontology_tlds` present, `prefix_tipos` gone,
  core pair unioned without duplicates). No frozen parity fixture ever carried
  `prefix_tipos`, so the pinned oracle-harvest store is untouched by this edit.

## WC-029 — the tree icon empty-skip judges a data item by its VALUE, not by "has any property"

- **Date:** 2026-07-13 (post-cutover; PHP is decommissioned dead code).
- **PHP behaviour:** `ts_object::resolve_element_value` (:1565) suppresses an icon
  element when `is_empty($component_data)` — a helper whose own docblock says it
  exists to stop "pseudo-empty values like `<p></p>`" from counting as content.
  Its object branch, however, is `foreach ($data as $property) { return false; }`:
  ANY property makes an object non-empty, and it never looks at the values. Every
  stored data item is a `{id, lang?, value}` wrapper, and clearing a component
  leaves the wrapper behind (`[{"id":1,"value":null}]` — the real shape of, e.g.,
  `dd0_1772`'s properties). So in PHP the empty-skip can never fire for a wrapped
  component: an ontology term whose `properties` are EMPTY still renders its `P`
  icon, and clicking it opens an empty JSON editor. Verified directly against the
  frozen oracle (`php -r` over `shared/core_functions.php`).
- **TS behaviour:** `isEmptyData` (`src/core/ts_object/ts_object.ts`) ports
  `is_empty` faithfully for scalars/strings/arrays (`0`, `''`, `'0'`, `'<p></p>'`,
  `[]`, and arrays whose entries are all empty), and diverges on objects: a data-item
  wrapper (an object carrying a `value` key) is judged by that `value` alone —
  `id`/`lang` are pairing metadata, never content — while any other object (a
  locator) stays empty only when every property is. The icon is then suppressed for
  a cleared component, which is what the rule always meant.
- **Blast radius:** icons only (`term` and `link_children` keep PHP's plain
  `empty()` semantics). The TS pre-image was `componentData.length === 0`, which was
  ALSO not PHP-faithful: it rendered icons for `['']`/`['<p></p>']`/`[0]` that PHP
  skipped. No frozen parity fixture carries an `ar_elements` icon
  (`ts_node_read_differential.json` has none), so the pinned oracle-harvest store is
  untouched by this edit.
- **Gate:** `test/unit/ts_tree_semantics.test.ts` — the `isEmptyData` table (the
  PHP-faithful rows and the wrapper divergence rows); `test/unit/ts_tree_db_semantics.test.ts`
  — the cleared-properties node (`dd0_1772`, no `ontology18` icon) against the
  positive control (`dd0_1`, icon present).

## WC-030 — `php_info` + `php_runtime` maintenance widgets MERGED into one native `runtime_info` (catalog shrinks 31 → 30)

- **Date:** 2026-07-15.
- **Shape:** two PHP-oracle-era catalog slots become one. `php_info` (a
  `phpinfo()` iframe with no Bun equivalent — always `engineDenied`) is
  renamed to `runtime_info`, and rather than staying a denied stub it TAKES
  OVER the already-TS-native `php_runtime` widget's real implementation (Bun
  version/pid/memory/uptime via `getValue`, plus `clear_cache_files` /
  `clear_session_files` `apiActions`); the `php_runtime` slot is then removed
  from the catalog entirely. Net effect: the TS catalog has ONE FEWER widget
  than the frozen PHP oracle (30 vs 31), and it is no longer engine-disabled —
  the panel now renders live in the dashboard.
  - **Server:** `src/core/area_maintenance/widgets/runtime_info.ts` carries
    `php_runtime.ts`'s logic under the `runtime_info` id/label (`'RUNTIME
    INFO'`, no `class` override — matches `php_runtime`'s original plain
    layout, not `php_info`'s `'violet fit width_100'` iframe styling).
    `php_runtime.ts` is deleted; `registry.ts` drops the `php_runtime` import
    and its `CORE_WIDGET_MODULES` entry, keeping `runtime_info` at the former
    `php_info` array position (catalog ORDER for every other widget is
    unchanged).
  - **Client:** `client/dedalo/core/area_maintenance/widgets/runtime_info/`
    now holds `php_runtime`'s renderer (renamed `runtime_info.js` /
    `render_runtime_info.js` / `runtime_info.less`, CSS class
    `.wrapper_widget.runtime_info`) — `php_info`'s dead iframe renderer is
    gone, not merely hidden. `render_runtime_info.js` is REWRITTEN to render
    the Bun payload the TS `getValue` actually emits (`{info:{engine,version,
    pid,platform,memory_rss,memory_heap_used,uptime_seconds}, environment}`):
    a one-line runtime summary + the info/environment blocks + the two working
    maintenance actions. The PHP-era sections it inherited (PHP user, error-log
    path, session path, opcache status, "Caches & directories" health panel,
    upload-chunk cleanup) are DELETED — they read fields the engine never
    emits, so the panel no longer reads as PHP. Two carried-over bugs are fixed
    in the same pass: the action buttons' success check was `result===true`
    but the TS `widget_request` returns `result:{cleared:[…]}`/`{pruned:N}` on
    success (now a truthiness check), and the maintenance container was renamed
    `runtime_actions` to avoid colliding with the global `.maintenance_container`
    maintenance-mode banner class in `page/css/layout/general.less`.
    `render_area_maintenance.js`'s `ENGINE_DISABLED_WIDGETS` is now EMPTY (the
    widget is no longer denied); its System Map node (`MAP_NODES` 'web') and
    tool description (`MAP_TOOL_DESC`) are re-keyed `php_runtime` →
    `runtime_info`. `test_others_lifecycle.js`'s widget census drops
    `php_runtime` and keeps `runtime_info` in its alphabetical slot.
    `scripts/sync_client.sh`'s (retired, non-executing) `TS_OWNED_EXCLUDES`
    comment is updated for history.
  - **Ownership/env gates:** `test/unit/config_env_tripwire.test.ts`'s
    NODE_ENV allowlist entry and `test/unit/update_ownership_tripwire.test.ts`'s
    `apiActions` classification keys move from `php_runtime.*` to
    `runtime_info.*`; `test/unit/server_state.test.ts`'s runtime-panel gate
    calls `runtime_info` instead of `php_runtime`.
- **Gate reconciliation:** `widgets_differential` filters the frozen PHP
  oracle's `php_runtime` entry OUT of the comparison list (PHP-only now, the
  mirror image of the `error_reports`/WC-018 TS-only filter), bringing both
  sides to 30, THEN omits `id`/`label`/`class` (in addition to the universal
  `value` omission) at the remaining slot where the frozen oracle's `id ===
  'php_info'`, matching the `diffusion_server_control` pattern — `class`
  because the widget deliberately keeps `php_runtime`'s plain layout (no
  class) instead of `php_info`'s `'violet fit width_100'`, per the server
  note above.
  `dedalo_files_differential`'s `isRuntimeInfoRenameEntry` filters ALL THREE
  of `/dedalo/core/area_maintenance/widgets/php_info/`,
  `/…/php_runtime/` (PHP-side, frozen) and `/…/runtime_info/` (TS-side, new)
  from both sides of the file-set compare (the WC-013 pattern) — the
  every-TS-url-resolves test still validates the new files serve.

## WC-031 — `is_ontology_server` page_globals key (TS-only) drives the ontology-master client skin

- **Date:** 2026-07-16.
- **Shape:** `buildPageGlobals` (`src/core/resolve/environment.ts`) emits a new
  boolean `is_ontology_server` (from `config.ontologyIo.isOntologyServer`,
  i.e. the `IS_AN_ONTOLOGY_SERVER` install flag). PHP `get_page_globals` has
  NO twin — the flag was server-only in the oracle (fail-closed manifest gates,
  never surfaced to the UI). Emitted UNCONDITIONALLY (like `maintenance_mode`
  and the `DEVELOPMENT_SERVER` plain_var), so the pre-auth login form is marked
  too; it is not reconnaissance-sensitive (reveals only "this install is an
  ontology master", not DB name / engine version).
- **Client effect:** `page.js` `set_custom_css()` adds `body.is_ontology_server`
  when the flag is truthy; `page/css/layout/ontology_server.less` (imported by
  `main.less`) then skins the whole app in the existing ontology teal
  (`--color_green_ontology`, `#276f67`): a fixed top edge band, a persistent
  `ONTOLOGY SERVER` corner badge, and a tinted menu bar (activating the
  dormant `.menu > .content_data.master` intent that never had a JS wire). No
  server HTML change — the index.html shell stays byte-static (client_serving).
- **Gate reconciliation:** `test/parity/environment_differential.test.ts`
  (page_globals key-set test) asserts the key is present TS-side / absent
  PHP-side, then deletes it from the TS copy before the exact key-set compare —
  the WC-003 (`DEDALO_DIFFUSION_API_URL`) pattern.

## WC-032 — `update_ontology` panel redesign: drop `structure_from_server`, fold the dead client surfaces, JSON-body probe

- **Date:** 2026-07-16 (post-cutover; PHP is decommissioned dead code).
- **Why:** the panel had accreted dead weight. `STRUCTURE_FROM_SERVER` is a
  legacy config flag nothing reads; two sub-panels (`rebuild_lang_files`,
  `export_to_translate`) are `engineDenied` in v7 (no generated JS lang files —
  labels are DB-derived; the CSV workflow is unported); and the response area
  dumped the whole envelope twice.
- **Shape after (TS):** the `update_ontology` `get_value` envelope DROPS the
  `structure_from_server` key. Remaining keys: `servers` (probed),
  `current_ontology`, `active_ontology_tlds`, `body`, `confirm_text`. This
  SUPERSEDES the `structure_from_server` entry in the WC-023 / WC-028 byte
  lists. No frozen parity fixture ever carried `structure_from_server`, so the
  pinned oracle-harvest store is untouched.
- **Probe/manifest transport:** `checkRemoteServer` now POSTs a JSON body (the
  TS API parses `request.json()` and 400s a form body, matching the vendored
  client's `data_manager.request`). PHP's `check_remote_server` posted
  `rqo=`-form-encoded because the PHP server read `$_POST['rqo']`; against a TS
  master that made the readiness probe read back "Invalid JSON body", so the
  panel disabled every TS master's radio. This is a deliberate divergence from
  the PHP form encoding.
- **Client (TS-owned, same commit):** `render_update_ontology.js` rebuilt around
  the one working action (master pull → overwrite), on the shared `widget_kit`
  vocabulary. It no longer renders the `STRUCTURE_FROM_SERVER` /
  `ACTIVE_ONTOLOGY_TLDS` "Config" grid (WC-028's config-grid row is GONE; the
  active-TLDs value survives only as the form input's default), the raw
  current-ontology JSON dump, the duplicated response, or the always-open JSON
  envelope, and it drops the `rebuild_lang_files` / `export_to_translate`
  panels. Those two REMAIN `engineDenied` server actions — the wire is
  unchanged, only the UI stopped surfacing dead buttons.
- **Gates:** `test/unit/ontology_ingest.test.ts` (the JSON-body probe
  regression + the recovery-snapshot / counter `\copy`/`-c` interpolation
  regressions); `test/unit/engine_denied_boundary.test.ts` (the two folded
  actions stay denied server-side). The panel `get_value` shape has no automated
  fixture (no live oracle post-cutover); the drop is verified by absence — no
  test or fixture asserts `structure_from_server`.

## WC-033 — UI labels are repo catalogs: `get_label` is catalog-derived, the generated JS lang files are gone

- **Date:** 2026-07-16 (post-cutover; PHP is decommissioned dead code).
- **Why:** the inherited model had THREE simultaneous truths and none worked.
  `getLabels` PREFERRED the committed `client/…/js/lang/lg-*.js` files (frozen
  at the cutover — nothing regenerates them, `rebuild_lang_files` is denied),
  silently falling back to a dd_ontology rebuild — so a WC-023 ontology update
  changed label rows but the UI kept serving cutover-day strings; the ledger
  ("labels are DB-derived") contradicted the code; and the files had ALREADY
  become the de-facto authoring surface (26 TS-era keys — the login-recovery
  set — existed ONLY there, 0 DB rows). Program strings are coupled to CODE,
  not to the data model: a key exists because a line of client/widget code
  references it, so labels now ship in the same commit as that code.
- **Shape after (TS):** repo label files with TWO deliberately separated
  ROLES (amended same day — no language is privileged at runtime):
  `src/core/labels/master.json` is the SOURCE OF DEFINITIONS — the complete
  key set with its source strings, tripwired complete; it is *authored in*
  `MASTER_SOURCE_LANG` (currently lg-eng — a fact about who writes the
  strings, gettext-msgid style). `src/core/labels/catalog/lg-<code>.json`
  (sorted keys, sparse allowed) are per-lang TRANSLATIONS, all equal — EVERY
  application lang has one, including the master-source lang, whose file is
  a sparse display-text OVERRIDE of the master (starts empty; the tripwire
  fails entries byte-equal to the master, so it can never silently become a
  duplicate). Requesting the master-source lang applies only that override —
  no other lang may shadow a master the requester already reads natively.
  `getLabels` (`src/core/labels/catalog.ts`) serves the merged dictionary by
  the fallback criteria: master ← the INSTALL's default application lang
  (`DEDALO_APPLICATION_LANGS_DEFAULT` — the operator's choice) ← declared
  linguistic alias (lg-vlca→lg-cat, the aliasing PHP baked into its generated
  file) ← requested lang. (The first cut hardcoded eng-as-reference plus a
  structure-lang overlay; both were language priorities the engine had no
  business asserting — structure lang is an ontology-authoring concept.) So
  `get_label` now always carries the FULL key set (pre-migration, a lang file
  missing a key served `undefined` to the client). The dd_ontology
  `model='label'` rows (dd383 children) are INERT for the TS engine: a WC-023
  ontology update still imports them (v6 consumers may read them) but they
  drive nothing. The environment `get_label` WIRE SHAPE is unchanged (a
  lang-keyed string map); only its provenance moved. The eng catalog also
  absorbed 181 keys that previously resolved ONLY through scattered client
  `|| 'literal'` fallbacks or rendered `undefined` (the literals ARE the
  catalog values — bytes preserved).
- **Client file census:** `client/dedalo/core/common/js/lang/lg-*.js` is
  DELETED (the client never fetched it — labels arrive via get_environment;
  the files were server-read only). `get_dedalo_files` (the SW pre-cache
  manifest) therefore lists no lang files; the frozen PHP fixture still does —
  `dedalo_files_differential` filters `/dedalo/core/common/js/lang/` from
  BOTH sides (the WC-013 normalization pattern).
- **Sync story:** labels ride CODE updates (git/`update_code`), never
  `update_ontology`. `rebuild_lang_files` / `export_to_translate` stay
  `engineDenied` (the CSV translation workflow is superseded by
  `scripts/labels_fill.ts` — per-lang missing-key backlog vs lg-eng).
- **Two deliberate VALUE divergences from the oracle dictionary** (dd_ontology
  duplicate-`properties.name` collisions where PHP's generator let the later
  row win): `no_hay_etiqueta_seleccionada` now says 'No tag selected…' (dd1640
  — the string component_portal.js actually shows on the index-without-tag
  confirm; the oracle served dd1664's 'User code does not exist' there) and
  `tool_watermark` now says 'Watermark' (dd1547; the oracle served dd1548's
  'Notes').
- **Gate reconciliation:** `environment_differential` `get_label` moves from
  byte-equality to CONTAINMENT — every oracle key present with the oracle's
  value except the two fixes above (asserted present AND changed); TS-only
  keys are the catalog additions. `dedalo_files_differential` filters the lang
  path (above). `labels_tripwire` (catalog integrity, reference completeness,
  the shrink-only uncataloged ratchet) is the new invariant gate. The one-time
  DB↔file reconcile (dup-name rows, the 22 mojibake-corrupted DB Italian
  values, baked-fallback removal) is recorded in rewrite/LABELS_RECONCILE.md.

## WC-034 — label catalog cleanup: renames to English keys, tool-local migration, unused removal

- **Date:** 2026-07-16 (follows WC-033 the same day; the catalogs are repo-owned,
  so this is a catalog content edit, not a serving-shape change).
- **Why:** the key list had grown organically for years: Spanish-named keys
  (`buscar`, `seccion`), typos (`erors_found`, `invalid_componet`,
  `rebuild_constraits`, `are_you_sure_to_delete_refrence`), singular/plural
  twins under two spellings (`anyo`/`year`), tool-specific strings parked in
  the global namespace, and a large dead tail (~35 `tool_*` display names
  duplicating the tools' own register labels, retired feature strings).
- **Shape after (TS):** master went 686 → 413 keys. THE MAP IS MACHINE-READABLE:
  `test/parity/wc034_label_cleanup.json` — 28 renames (references updated across
  client/src/tools/install; merges into existing English keys keep the target's
  translations and adopt the source's for missing langs), 21 tool-local
  migrations, 240 removals. The `get_label` wire SHAPE is unchanged; only the
  key census. The client mdcat widget now uses the same `year/years/month/...`
  keys as its server twin (`sum_dates.ts`), which already expected them.
- **Removal safety (how "unused" was proven):** a key was removed only if it had
  (1) no static reference anywhere in client/src/tools/install (`get_label.x`,
  `get_label['x']`, widget label rules, server `labels.x`); (2) no reachability
  from any of the 14 dynamic `get_label[expr]` sites — each was enumerated
  (tool_assistant `t()` literals, media_versions action names, tool_diffusion
  `add_button` keys, search `$and/$or`), and the two data-driven sites (state
  and calculation widgets) plus `search_operators.ts`'s wire {operator →
  label-key} map were covered by a full-DB scan (every matrix table +
  dd_ontology minus the inert `model='label'` rows themselves) — 22 DB-hit keys
  kept conservatively; (3) no other repo occurrence except confirmed word
  coincidences. Both data-driven sites degrade gracefully on foreign installs
  (`get_label[x] || x`).
- **Tool-local migration (21 keys, 9 tools):** keys used by exactly ONE tool and
  tool-specific in meaning (export column toggles, subtitles player controls,
  import-files naming modes, …) moved into that tool's `register.json`
  `misc.dd1372` labels (translations carried from the catalogs) and the tool JS
  switched `get_label.x` → `self.get_tool_label('x')`; every site keeps its
  English `|| 'literal'` fallback, so the change is safe even BEFORE an install
  re-runs the *Register tools* maintenance widget (required for the DB
  `matrix_tools` rows to pick the new labels up). Genuinely generic vocabulary
  used by one tool today (`error`, `print`, `upload`, `now`, …) stays global,
  as do `conform_headers`/`rotate` (reached via the media_versions dynamic
  action lookup on the GLOBAL dictionary).
- **Gate reconciliation:** `environment_differential` get_label asserts every
  ORACLE key is served with the oracle value, OR renamed per the map (new key
  asserted present), OR ledger-removed (and asserts a removed key is NOT
  served). The WC-033 dup-name fixes ride the same map
  (`no_hay_etiqueta_seleccionada` → `no_tag_selected`; `tool_watermark`
  removed). `labels_tripwire` unchanged and green — it enforces the cleaned
  census going forward.

## WC-035 — the site-builder subsystem: `tool_sitebuilder` + `site_builder_status` are TS-ONLY surfaces (no PHP twin)

- **Date:** 2026-07-16 (subsystem built 2026-07-15).
- **Shape:** a wholly TS-native addition with no PHP-oracle counterpart. The
  **site builder** lets users build public websites over the published data by
  talking to a coding agent: a standalone daemon (`publication/site_builder/`,
  its own package outside the engine — same isolation model as the
  publication API v2) plus two engine-side surfaces:
  - **`tool_sitebuilder`** (`tools/tool_sitebuilder/`) — the proxy tool whose
    `apiActions` forward to the daemon over bearer-token HTTP and whose
    vanilla-JS client is the three-pane workspace (opened `open_as:'window'`).
  - **`site_builder_status`** (`src/core/area_maintenance/widgets/` +
    `client/dedalo/core/area_maintenance/widgets/site_builder_status/`) — the
    maintenance widget (category `publication`, a TS-only category) that
    probes the daemon's health and hosts the workspace launcher.
  Neither existed in the frozen PHP engine; the frozen oracle can never serve
  them. Developer doc: `docs/development/site_builder_internals.md`.
- **Gate reconciliation** (the WC-018/WC-019 TS-only pattern, one entry per
  gate, each citing this row):
  - `test/parity/tools_register_differential.test.ts` — `tool_sitebuilder` in
    `TS_ONLY_TOOLS`.
  - `test/parity/widgets_differential.test.ts` — `site_builder_status` in
    `TS_ONLY_WIDGET_IDS` (filtered from the catalog byte-compare; the widget's
    own shape is asserted natively by
    `test/unit/site_builder_status_widget.test.ts`).
  - `test/parity/dedalo_files_differential.test.ts` — both client trees
    (`/dedalo/tools/tool_sitebuilder/`,
    `/dedalo/core/area_maintenance/widgets/site_builder_status/`) in
    `isTsOnlyEntry`; the every-TS-url-resolves test still validates the new
    files serve.
- **Non-parity gates that own the new surfaces:** the daemon's hermetic suite
  runs in CI via `scripts/ci/hermetic.sh` and as a targeted `verify.ts` stage;
  the engine proxy is gated by `test/unit/tool_sitebuilder.test.ts` (mock
  daemon) and `test/unit/dd_tools_api_stream_headers.test.ts` (the one core
  edit: the tool_request stream branch merges a tool's `streamHeaders`).

## WC-036 — time-machine date search: object-q handled + directional operators implemented (PHP dropped both)

- **Date:** 2026-07-17 (reported: "When" (dd547) search in section Activity
  (dd542) does not filter; then: its operators `>`/`<` fail).
- **Context:** date components on the `matrix_activity` / `matrix_time_machine`
  tables store their value in the dedicated `timestamp` timestamptz column, so
  PHP routes them to `trait.search_component_date_tm` (SARGable `"timestamp"`
  ranges) instead of the JSONB `date` path. `builder_date.ts` gained that
  routing. Two behaviours here deliberately go BEYOND the frozen oracle:
- **Object-q (the parity FIX, restores PHP behaviour — recorded for context, not
  a divergence):** the date search widget sends its value as a STRUCTURED object
  (`data.entries: [{start:{year,month,day?}, id}]`), never plain text. PHP
  passes structured q straight through (`extract_normalized_date_q`
  is-object branch); the earlier TS builder `String()`-ified it to
  `"[object Object]"`, failed the `YYYY-MM-DD` regex, and DROPPED the clause —
  so every date search ran unfiltered. TS now normalizes object-q. This matches
  PHP, so it is not a divergence.
- **Shape before (PHP, the real divergence):** the `_tm` handler's operator
  switch has NO directional cases — `<`, `>`, `>=`, `<=`, `=` and the default
  all fall through to one body that builds the SAME half-open equality range.
  PHP's own comment: directional operators "are not yet implemented and all
  fall through to the range equality treatment." So `>2026` matched the 2026
  range (behaved like `=`); nothing "after"/"before" a date was ever reachable.
- **Shape after (TS):** each typed value defines a precision-sized half-open
  period `[lower, upper)` (whole year / month / day), and the operator picks the
  boundary: `=`/none → `>= lower AND < upper`; `>` → `>= upper` (strictly after
  the whole period); `>=` → `>= lower`; `<` → `< lower`; `<=` → `< upper`.
  Partial dates thus compare as spans — `>2026` → `>= 2027-01-01`. Bounds travel
  as bound `_Q_` params (a plain column comparison, not jsonpath). The in-string
  op prefix (`>2026`) still wins over the sqo `q_operator` (PHP
  `dd_date->set_op`). Existence `*`/`!*` test the `timestamp` column
  (`IS [NOT] NULL`).
- **Why:** functionality — the frozen PHP left this a documented gap; a date
  field whose operators silently no-op is a defect, not a contract. Same
  functionality-over-parity posture as WC-012 / WC-014. Ordinary (non-TM) JSONB
  sections keep the v0 `start.time <op> t` predicate (range-mode still ledgered
  known-open in `rewrite/LEDGER.md`).
- **Gate reconciliation:** no differential reds — no parity gate sends a date-q
  operator (they would now deliberately diverge), and the object-q path only
  reaches PHP-agreeing behaviour. TS ground truth pinned in
  `test/unit/search_date_builder.test.ts` (object/plain-text q, all five
  comparison operators + whole-period spans, in-string-op precedence,
  existence ops, drop-on-unparseable). No re-harvest needed (the golden store
  has no Activity date-search fixture).

## WC-037 — special-table component search restored: component_json searchable + dd15 Time Machine component search

- **Date:** 2026-07-17 (audit: "check every component in Activity (dd542) and
  Time Machine (dd15) is search-capable, including operators").
- **Context:** two special tables broke component search. (1) `component_json`
  had NO TS search builder — `conform` threw "declares no searchBuilder family",
  so Activity's *Data* (dd551) and every JSON component were unsearchable.
  (2) `matrix_time_machine` (dd15) stores each component in a flat PHYSICAL
  COLUMN (id/section_id/bulk_process_id/`timestamp`/user_id/tipo/section_tipo/
  data), not a tipo-keyed jsonb column; `buildTmWhere` ignored every component
  clause and returned ALL rows. PHP has the twins (`search_component_json` +
  the five `search_*_tm` traits); this ports them.
- **Shape before (PHP):** json search navigates `$.<tipo>[*].value.**` with a
  `like_regex` (case-insensitive, accent-SENSITIVE); the `_tm` traits emit
  column-direct SQL (LIKE case-SENSITIVE for string/data, exact for scalar
  tipo/section_tipo, integer comparisons for number, `user_id` scalar equality
  for relation, `timestamp` ranges for date).
- **Shape after (TS):** `component_json` gains `searchBuilder:'json'`
  (`builders/builder_json.ts`) over the `misc` column — the recursive `.value.**`
  is expressed as `f_unaccent(elem->>'value') ~* f_unaccent(_Q1_)` (value stays
  a BOUND param, never embedded in the jsonpath). dd15 gains a component
  conformer (`resolve/tm_filter.ts`, wired into `buildTmWhere`) emitting
  physical-column `$N` SQL per kind. TWO deliberate divergences: (a) text
  matching is accent-insensitive (`f_unaccent`) and case-insensitive (`ILIKE`) —
  a safe superset of PHP's case-only fold that never HIDES a match; (b) date
  columns use the WC-036 whole-period operator span (PHP `_tm` left directional
  operators unimplemented).
- **Why:** functionality — a component whose search silently returns everything
  (or throws) is a defect. Same posture as WC-012 / WC-014 / WC-036.
- **Gate reconciliation:** no differential reds — no parity gate exercises a
  json/TM component search. `descriptor_completeness_tripwire` updated in this
  commit (component_json removed from LEDGERED_UNSEARCHABLE; the `json → misc`
  family-column mapping added). TS ground truth pinned in
  `test/unit/search_json_builder.test.ts` (json envelope + operator grammar) and
  `test/unit/tm_filter.test.ts` (per-kind physical-column SQL, operators,
  AND-combination, unmapped-tipo throws). No re-harvest needed.

## WC-038 — `ip_api` removed from page_globals: IP→country resolution is server-side/offline

- **Date:** 2026-07-17 (task: "section Activity dd542 GeoIP — free, open, reliable").
- **Context:** the IP list view (`view_ip_list_input_text.js`) used to resolve a
  visitor's country by having EACH BROWSER fetch a third-party geolocation API
  described by `page_globals.ip_api` (`{url, href, country_code}`, populated from
  the PHP `IP_API` constant). That was free/open but unreliable — a single
  un-SLA'd third party, per-visitor, rate-limited, CORS/mixed-content-bound — and
  it 404'd on IPv6 loopback `::1` / the `local` sentinel (the IPv4-only client
  filter let them through).
- **Shape before (PHP oracle, frozen):** `page_globals` carries
  `ip_api: {url, href, country_code}`.
- **Shape after (TS):** `page_globals` OMITS `ip_api` entirely. Resolution moved
  server-side and OFFLINE to the native GeoIP subsystem (`src/core/geoip/`,
  DB-IP Country Lite CC-BY-4.0 loaded via mmdb-lib) behind the same-origin
  `dd_core_api::get_ip_country` action; the client no longer reads any geolocation
  descriptor. The `IP_API` config key is RECLASSIFIED DROPPED in `migration_map.ts`
  (superseded), replaced by `DEDALO_GEOIP_*`.
- **Why:** reliability + no runtime third-party dependency, while staying free and
  open. Same "the copied client no longer needs this key" posture as the TS-only
  page_globals divergences (WC-031).
- **Gate reconciliation:** `environment_differential` strips `ip_api` from the
  PHP-side `page_globals` copy before the exact key-set compare (asserting it was
  present PHP-side and is absent TS-side — the mirror of the WC-031
  `is_ontology_server` handling). Frozen fixtures are unchanged (they legitimately
  recorded the PHP value); no re-harvest. TS ground truth pinned in
  `test/unit/geoip_resolve.test.ts`.

## WC-039 — password recovery ported: `request_password_reset` / `confirm_password_reset` are live TS surfaces

- **Date:** 2026-07-18 (task: "login forgot_password_link doesn't work").
- **Context:** the login screen's forgot-password flow was fully wired in the
  copied client (`client/dedalo/core/login/js/login.js` :292-350 posts
  `dd_utils_api:request_password_reset` / `confirm_password_reset`), but the TS
  engine never implemented the actions — Gate 1 rejected both with HTTP 400, so
  no recovery email was ever sent and confirm always failed. The whole PHP
  subsystem (`core/password_reset/class.password_reset.php` + `dd_mailer`) is
  now ported: `src/core/security/password_reset.ts` + `src/core/mailer/mailer.ts`
  (nodemailer over SMTP), pending codes in the session sqlite store
  (`session_store.ts` `password_resets`), both actions in `NO_LOGIN_ACTIONS` +
  `CSRF_EXEMPT_ACTIONS` (PHP dd_manager pre-auth/CSRF whitelist parity).
- **Shape:** identical to the frozen-PHP response contract, which the client's
  error-code map (`render_login.js` :874-879) pins: request always returns
  `{result:true, msg, reset_id:<32-hex>}` (anti-enumeration); confirm returns
  `{result, msg, errors:[]}` with codes
  `invalid_or_expired | too_many_attempts | weak_password | reset_failed`.
- **Deliberate divergences (all wire-invisible):**
  - timing normalization on the no-op request paths is one decoy Argon2id
    verify (`auth.ts normalizeTiming`, the AUTHZ-03 login posture), not PHP's
    `sleep(2)`;
  - pending-code storage is the session sqlite store, not a JSON file cache;
  - a successful reset EVICTS the user's existing sessions
    (`destroyUserSessions`) — PHP did not; a stolen session must not survive
    the reset that revokes the account's credentials;
  - the PHP `DEDALO_SMTP_VERIFY_PEER=false` escape hatch is NOT ported: TLS
    peer verification is never disableable (WC-023 D1 tripwire; pin a private
    CA via `NODE_EXTRA_CA_CERTS`). Config keys: catalog domain `mailer`
    (`DEDALO_SMTP_*`, `DEDALO_PWRESET_*`).
- **Gate reconciliation:** no fixture touches and no re-harvest — the frozen
  store never recorded these actions (the PHP engine froze with them
  unexercised by the harvest). The TS-native contract gate is
  `test/unit/password_reset_native.test.ts` (DEC-14b twin): happy path against
  a scratch matrix_users record, anti-enumeration shapes, attempt cap, expiry,
  weak-password, malformed reset_id, mailer-unconfigured guard, session
  eviction.

## WC-040 — activity log: the full 16-code WHAT map is emitted, and `relation.dd550` (PROJECTS) is not written

- **PHP:** `logger_backend_activity` defines 16 WHAT codes (dd42) and its
  `log_message_defer` writes SIX columns per row: `relation` (dd543 WHO +
  dd545 WHAT + **dd550 PROJECTS**), `string` (dd544 IP, dd546 WHERE), `date`
  (dd547 WHEN), `misc` (dd551 payload).
- **TS before this entry:** only 4 of the 16 codes had an emitter (SAVE,
  DELETE, LOAD EDIT, LOAD LIST) while the READ side
  (`area_maintenance/user_stats.ts` `WHAT_MAP`) already resolved all 16 — so
  every `user_activity` chart was structurally limited to those four.

### Emitters (now at parity with the v6 producer set)

Eight emitters added: LOG IN (1), LOG OUT (2), NEW (3), UPLOAD COMPLETE (11),
DELETE FILE (12), RECOVER SECTION (13), RECOVER COMPONENT (14), NEW VERSION
(16). Payload keys mirror the PHP call sites verbatim.

**Four codes are mapped but have NO emitter — in TS *or* PHP:**

| Code | Status |
|---|---|
| SEARCH 8, UPLOAD 9, STATS 15 | Defined in PHP's `$what` but never passed to `log_message()` anywhere in v6 or frozen v7. Never implemented. |
| DOWNLOAD 10 | A **v5-era** event ("download file by tool av / image / pdf") **lost in the v6 migration**. `matrix_activity` holds dd1080 rows from 2019-2020 and none after; the v5→v6 upgrade map still translates it. |

They stay in `WHAT_CODES` deliberately: the map mirrors dd42, the read side
needs the codes to interpret legacy rows, and reinstating DOWNLOAD is an OPEN
question rather than a closed one.

### Divergences (deliberate)

- **`relation.dd550` is NOT written.** PHP attaches the actor's project
  locators (`filter::get_user_projects`, re-stamped to
  `from_component_tipo: dd550`). The TS INSERT writes `relation/string/date/
  misc` only, so no TS-written row carries the projects dimension — including
  every row written since the cutover. Consumers that filter activity by
  project therefore see nothing from the TS era. Ledgered, not fixed: filling
  it needs the project-filter port, which is separate scope.
- **The success `LOG IN` payload omits `browser` and `DB-backup`.** PHP reads
  `$_SERVER['HTTP_USER_AGENT']`; the TS request path carries no user-agent at
  all, and inventing one would be worse than omitting it.
- **Two failure causes have no PHP twin** — `Too many failed attempts
  (throttled)` and `Server under maintenance` — because neither mechanism
  exists in v6. Both are logged: a lockout is precisely the event an operator
  auditing the trail wants to see.
- **Login failures record the actor as `-666`** (`ANONYMOUS_USER_ID`), PHP's
  own sentinel — nobody is authenticated yet, so the attempted username lives
  in the payload instead.

### Gate

`test/unit/activity_log_native.test.ts` (DEC-14b twin) — SAVE + DELETE were
already pinned; NEW and the LOG IN allow/deny pair are added here.

## WC-041 — component_image fixture data edit: rsc170/1 `files_info` repaired post-harvest (media index rebuild)

- **What moved:** the SHARED-DB record `rsc170/1` component `rsc29` — not the
  wire shape. Its stored `files_info` (a disk-derived cache the read path
  serves verbatim for images) was stale: emptied/never-rebuilt after a period
  where `MEDIA_PATH` pointed at the wrong tree, while the harvest-era copy
  still listed `png`/`tiff` originals that no longer exist on disk.
- **The repair (2026-07-19, user-requested):** rebuilt the index from the real
  files via the established seams — `tool_update_cache` media repair
  (regenerate derivatives where the original is present + re-scan +
  `updateMatrixKeyData` per-key write, NO Time Machine entry) and the
  cross-section ops sweep `scripts/media_repair_files_info.ts` (dry-run default,
  shrink-guarded). Result for rsc170/1: 5 existing entries
  (original jpg+avif, 1.5MB jpg+avif, thumb jpg).
- **Fixture edit (deliberate, per the store's drift_policy):**
  `test/parity/fixtures/oracle_harvest/component_image_context_differential.json`
  interaction `09190497c0662d1bcc37cfdb`, `result.data[16].entries[0].files_info`
  replaced with the repaired 5-entry truth. Adjudicated DATA-SIDE ONLY: lang,
  external_source, base_svg_url, entry identity and the projection shape are
  untouched; a re-harvest is impossible (PHP decommissioned) so the fixture is
  hand-edited in the same change that repairs the data.
- **Behavior note (not a divergence):** TS still mirrors PHP's stored-cache
  read for images (only `component_av` re-scans per read); repairs flow
  through `tool_update_cache`/the script, never silently on read.

### Gate

`test/parity/component_image_context_differential.test.ts` (fixtures replay) +
`test/unit/tool_update_cache.test.ts` media-repair scratch test (wipe
`files_info` → update_cache → rebuilt from disk, sibling keys preserved).

## WC-042 — media URLs honor `DEDALO_MEDIA_WEB_BASE` (config-dependent absolute wire URLs)

- **PHP:** every client media URL was built on the constant `DEDALO_MEDIA_URL`
  (= configurable `DEDALO_ROOT_WEB` + media dir) — an install serving media from
  another origin emitted absolute URLs everywhere.
- **TS before this entry:** the base was HARDCODED relative
  (`/dedalo/<mediaDir>`), so an app browsed on one origin (the Bun dev port)
  could never fetch media served on another (the web server enforcing the
  generated protection rules) — images 404'd by design with no configuration
  escape.
- **Now:** `config.media.webBase` = `DEDALO_MEDIA_WEB_BASE` (trailing slash
  stripped; unset/'' → the relative default, i.e. the exact previous shape).
  Emitters on it: the client `DEDALO_MEDIA_URL` plain var
  (resolve/environment.ts), `base_svg_url` (media/svg_overlay.ts wire path),
  `posterframe_url` + `subtitles_url` (media/component_emit.ts + media/path.ts),
  the indexation-grid thumb URLs (section/indexation_grid.ts), the MCP media
  `url` field (ai/mcp/tools/media.ts), and the text_area tag 302 redirect
  (component_text_area/tag_endpoint.ts).
- **Deliberately NOT on it:** persisted content (the SVG envelope's embedded
  raster href stays relative — resolves against the envelope's own fetch
  origin), diffusion/publication output (`svgUrlFromTagLocator`,
  diffusion runner/default_value — published data must not embed a dev origin),
  bare `files_info.file_path` values (the client prefixes those with
  `DEDALO_MEDIA_URL`; absolutizing would double-prefix), inbound route matching
  (server.ts, protection.ts rules), and `DEDALO_MEDIA_EXPORT_BASE` (export cells —
  unchanged semantics: unset means unresolved, never guessed; read via
  `config.media.exportBase`). That key was spelled `DEDALO_MEDIA_BASE_URL` until
  2026-07-25; the two names were indistinguishable, so the pair was renamed to
  state its audience (WEB = the client, EXPORT = what leaves the app) and the old
  spelling is RETIRED (`RETIRED_ENV_KEYS`, refuses the boot). Same value shape as
  `webBase` — origin + `/dedalo/<mediaDir>`, trailing slash now stripped on both,
  since both are prefixed to the same media-root relative `file_path`.
- **Fixtures:** every harvest fixture pins the harvest-era RELATIVE shape, so
  `test/preload/test_database.ts` pins `DEDALO_MEDIA_WEB_BASE=''` for the whole
  suite — gates are hermetic against the developer's .env, no fixture edits.
- `DEDALO_MEDIA_URL` (the v6 constant name) stays DROPPED in
  `config/migration_map.ts`; the new key is a v7-native knob (classified NEW).

### Gate

`test/unit/media_web_base.test.ts` (default shape, builder rooting, fresh-import
override + trailing-slash strip) + the pinned relative shape across the existing
media gates and parity fixtures.

## WC-043 — tool_update_cache scope honesty + the background-job stop wire

Three coupled changes born of the 2026-07-19 runaway (a run the client displayed
as "Records: 1" swept the whole 438k-record section):

- **`update_cache` REQUIRES `options.sqo`.** The silent whole-section fallback
  (`?? {section_tipo:[…]}`) is REMOVED: absent/malformed sqo fails closed with
  `invalid_request`. The v7 client now sends a deep clone of the caller list's
  LIVE sqo (`tools/tool_update_cache/js/tool_update_cache.js` — it previously
  sent none at all, which is what armed the fallback), so the run's scope is by
  construction the scope the list displays; an unfiltered list matches the whole
  section EXPLICITLY. Scripted callers pass `{section_tipo:['…']}` themselves.
  The confirm dialog now carries the record + component counts. Response gains
  `processed` and `stopped`.
- **Per-record progress.** The handler publishes throttled frames via
  `ctx.publishProgress` — `{msg, is_running, counter, total,
  current:{section_id}, n_components}`, the exact fields the copied client's
  stream renderer has always formatted (`render_tool_update_cache.js`
  compound_msg). Before this the pfile froze on the initial frame for the whole
  run.
- **`dd_utils_api::stop_process` EXISTS now.** The copied client's generic Stop
  button has always posted this action; no handler was registered, so every
  Stop click surfaced "Not retry-able HTTP error 400". Registered in
  `utilsApiActions` → `stopUtilsProcess` (core/api/process_status.ts):
  `options {pid, pfile}`, job id = validated pfile basename, owner-gated with
  the status stream's rule (no existence oracle for foreign ids), aborts the
  job's controller. The abort reaches handlers as the NEW
  `ToolActionContext.signal` (background executor forwards the job manager's
  per-job AbortSignal — `core/tools/background.ts`); `update_cache` checks it
  per record and returns a partial summary. The client stop branch
  (`client/dedalo/core/common/js/render_common.js`) now sends `pfile` alongside
  the legacy `pid` — fixing Stop for every tool on the legacy branch.

### Gate

`test/unit/tool_update_cache.test.ts` (sqo fail-closed; scoped run `records===1`
+ progress frames; aborted-signal cancellation) +
`test/unit/stop_process.test.ts` (registry, pfile grammar, no-oracle answers,
live-job stop → status `stopped`).

### WC-043 addendum — v6 `regenerate_component` parity (2026-07-19, same day)

Review against the v6 oracle (`tools/tool_update_cache/class.tool_update_cache.php`
+ `component_media_common::regenerate_component :2614`) found five divergences in
the first TS port; all are now aligned:

- **Media regenerate builds only what is MISSING.** v6 rebuilds the default
  quality only when its file is absent, re-creates the thumb ALWAYS, and
  creates/path-fixes the SVG envelope; the TS port re-encoded everything
  unconditionally (the runaway's file-churn). Kernel:
  `core/media/repair.ts regenerateMissingDerivatives`.
- **`regenerate_options` honored + correct wire shape.** get_component_list now
  returns the v6 descriptor ARRAY (`[{name,type,default}]`) the copied client
  iterates (the previous `{regenerable:true}` object rendered a silently empty
  options panel), and update_cache applies `delete_normalized_files` (move to
  `deleted/<bulk id>/`; guarded — our deliberate divergence — on a locally
  present original).
- **Time Machine suppressed** for the run's generic re-saves (`saveTm:false`;
  v6 hard-disabled TM + activity for the whole run — activity already does not
  fire on direct component saves in TS).
- **dd800 bulk-process record** minted per run (label
  `Update cache | <section> | <components>`), id in the response
  (`bulk_process_id`) and in the deleted-files path.
- **`original_file_name` restoration** from the media component's
  `properties.target_filename` sibling (v6 :2670) when the stored item lost it.

Ledgered gap: v6 also conditionally builds ALTERNATE-extension versions; the TS
processing layer has no alternate-extension builder yet.

Gate: `test/unit/tool_update_cache.test.ts` (TM-count unchanged across a run,
dd800 minted, exact scope, progress frames).

### WC-043 correction — thumb builds from the DEFAULT-QUALITY file (2026-07-19)

v6 `component_image::create_thumb` (:393) reads `get_media_filepath(default_quality)`
and never touches the original. The first parity pass still gated BOTH the tool
regenerate and `build_version('thumb')` on `resolveOriginalSource`, so on a
partial-media box (default files present, originals not) the thumb build silently
no-oped / threw 'original not found'. Now: the kernel's thumb + envelope steps key
on the DEFAULT file's presence (original needed only for the default-quality build
and delete_normalized); `buildVersionCore('thumb')` sources the default file,
falls back to the original, and errors clearly only when neither exists.
Gate: `test/unit/media_regenerate_thumb.test.ts` (scratch media root with the
default file only).

## WC-044 — Activity (dd542) list-sort restriction + flattened ordered-search SQL (2026-07-21)

Born of a production-scale incident: on a 32.9M-row / 85 GB `matrix_activity`
(dedalo7_mdcat), a list-header sort on the IP column ran **456 s** — the PHP
windowed shape `SELECT * FROM (SELECT DISTINCT ON (section_id) …, <jsonb sort
expr> … ORDER BY section_id) main_select ORDER BY <sort> LIMIT n` materializes
EVERY row (full scan + per-row `jsonb_path_query_first`) before the LIMIT can
apply. Two coupled changes:

- **Flattened ordered-search SQL (internal shape, wire-identical rows).** When
  an ordered SQO is single-section, join-free, and the target table carries the
  full UNIQUE `(section_id, section_tipo)` key (probed + cached —
  `tableHasUniqueSectionKey`; `matrix_time_machine`/`matrix_structurations`
  lack it and keep the windowed shape), `DISTINCT ON (section_id)` is a no-op
  and the assembler emits `ORDER BY <sort> LIMIT n` inline. Same rows, same
  order, same columns (verified plain + paged against the windowed shape);
  `section_id` sorts drop from ~10 s to ~1 ms (index-served), component sorts
  from 456 s to 77 s (parallel seq scan, still O(n)).
- **dd542 sort policy (structure-context wire change).** Arbitrary component
  sorts on the append-only log stay O(n) even flattened and are DISALLOWED:
  every dd542 column emits `sortable:false` EXCEPT When (dd547), whose order
  `path` maps to the direct `section_id` column (append-only ⇒ When-order ≡
  insertion order; `ACTIVITY_WHEN_TIPO`, order_path.ts) — the newest-first
  sort users actually want is index-served. Same policy family as the TM list
  (read_tm.ts maps header sorts to real columns and refuses the rest). The
  expression-index alternative was REJECTED (write amplification on the
  hottest insert path + rarely-used disk). dd542 left
  `list_column_sortable_differential`'s section loop (its oracle rows are
  history, ledgered in the test header).

### Gate

`test/unit/activity_sort_policy.test.ts` (When→section_id path, dd542-scoped —
other sections' date columns keep the jsonb path, sortable flags, unique-key
probe) + `test/unit/search_order_id.test.ts` /
`test/unit/search_late_row_lookup.test.ts` (flattened shape: no `main_select`,
no `DISTINCT ON`, inline ORDER BY + LIMIT/OFFSET).

## WC-045 — Append-only log search-field restriction: section-info group (dd196) omitted for Activity (dd542) + Time Machine (dd15) (2026-07-21)

The edit-mode search "FIELDS" panel (`dd_core_api::get_section_elements_context`
→ `buildSectionElementsContext`, `src/core/resolve/section_elements_context.ts`)
appends the shared **section-info group `dd196`** (Created/Modified by user +
date, First/Last publication + user) to every section that has its own elements,
shown to global admins (PHP class.common.php:3870-3877). On an append-only log
that editorial metadata is meaningless as a search dimension, so TS omits the
`dd196` group (and its children) from the field list of two sections, both held
in the `dd542`-/`dd15`-scoped `SUPPRESS_SECTION_INFO` set:

- **Activity (`dd542`)** — DELIBERATE wire-shape divergence from PHP, which
  offers `dd196` to admins. Same policy family as WC-044 (dd542 list-sort
  restriction, same day).
- **Time Machine (`dd15`)** — PHP-PARITY RESTORATION, not a divergence: PHP
  explicitly empties `section_info_elements` for
  `DEDALO_TIME_MACHINE_SECTION_TIPO` (class.common.php:3759). The TS port's
  "appended to every non-TM section" comment always intended this, but the guard
  was never implemented — dd15 was wrongly getting `dd196` + children. Adding it
  to the set makes the code match its comment and PHP.

The section's existing exclusion knob is **model-keyed only** (`DEFAULT_EXCLUDE`
/ client `ar_components_exclude`) and cannot express this: `dd196`'s children are
date/relation models — the same models as legitimate fields (activity's When
`dd547` is a date, Who `dd543` a relation), so no model rule drops them without
collateral. Hence a section-tipo-scoped suppression of the group append,
server-side. The real fields and the section entry are unchanged; every other
section still gets `dd196`. (Neither `dd542` nor `dd15` is in
`section_elements_context_differential`'s `SECTIONS` corpus, so no oracle rows to
reconcile.)

### Gate

`test/unit/activity_search_fields.test.ts` — `dd542` and `dd15` field lists each
exclude `dd196` and every `parent==='dd196'` child while including the section's
real components; scope control asserts a second section (`dd128`) still carries
`dd196` for the same global-admin principal.

## WC-046 — Activity (dd542) list at scale: index-aligned structural order + generalized deep-page flip + cached bare total (2026-07-22)

Follow-up to WC-044 on the same 32.9M-row / 85 GB `matrix_activity`. WC-044
flattened the ordered SQL but left three scale defects — the first crippling
EVERY page, not just deep ones. All three rewrites are **wire-identical**
(same rows, same order, same paginated envelope); the internal SQL changes:

- **Structural sort key emitted index-aligned — no `NULLS LAST` (a wire-shape
  SQL divergence from PHP).** `buildOrderClauses` (PHP :274-292 parity) appended
  a blanket `NULLS LAST` to every explicit sort. On the unique structural key
  `section_id` (sequence-backed, 0 nulls) / `id` (NOT NULL) that is a no-op that
  DEFEATS the `DESC` (=NULLS FIRST) list index: the dd542 newest-first list then
  Parallel-Seq-Scans + Sorts the whole table for **every page, including offset 0
  (>60 s measured)**. TS now emits `section_id/id <dir>` with no `NULLS LAST` and
  no section_id tiebreaker (the key is already a unique total order) → index-served,
  **>60 s → ~11 ms**. Wire-identical (no nulls to reorder); jsonb component sorts
  (nullable) keep `NULLS LAST`.
- **Deep-page late-lookup + order-flip generalized to the flattened unique-key
  path** (`sql_assembler.ts`, the matrix_activity twin of `read_tm.ts`
  queryTmRows which owns the multi-tipo `matrix_time_machine` `id`-PK path). A
  far-half page is fetched from the opposite end (last page → OFFSET 0); the key
  pages on a narrow scan, then join back for the wide columns. Applies to a sole
  sort on the `id` PK **or** `section_id` — the dd542 list DEFAULTS to `id DESC`
  (deriveSectionListSqoDefaults; the real slow-request order), while a When-header
  sort maps to `section_id`. Last/far-half page **>5 s → ~64 ms** end-to-end.
  Gated to the bare browse (`whereParts` empty) so the exact row total is cheap
  + cached. (Residual: an `id`-ordered page at the EXACT middle offset still walks
  ~N/2 heap-checked rows — no `(section_tipo,id)` index — but that offset is
  pathological; the far half, i.e. real "jump to last", is index/flip-served.)
- **Bare-browse `full_count` served from a save-event-invalidated cache**
  (`search/bare_count.ts`, scoped to the policy-governed logs) — the paginator
  total drops from a ~2.5 s parallel scan to a cached literal on every list
  paint. `read_tm.ts` owns the `matrix_time_machine` twin (`tmCount`).

Also operational (NOT wire): the dead/redundant PHP-era indexes on both logs are
pruned by the **Database-info maintenance widget → "Optimize tables"** action
(`database_info.optimize_tables` → `db_assets.optimizeTables` → new
`pruneMatrixIndexes`, run on the ACTIVE database before the REINDEX/VACUUM).
The keep/drop policy is `src/core/db/matrix_index_policy.ts` (single source of
truth, per index SIGNATURE not name; conservative — never a constraint/keep/
unclassified/proven-used index). mdcat: activity 9.8→4.0 GB, TM 13→10 GB, ~7.9 GB
reclaimed — every surplus index was maintained on the hottest insert path for a
shape the planner never picks (the WC-044 write-amplification concern, realized).

### Gate

`test/unit/activity_deep_offset_flip.test.ts` (flip page == ground-truth
`ORDER BY <key> DESC LIMIT L OFFSET O` byte-for-byte across shallow / deep /
last / partial / ASC, for BOTH the `id`-PK default order and `section_id`, +
proof the flip engages) · `search_order_id` /
`search_late_row_lookup` (index-aligned structural order, no `NULLS LAST`, no
window) · `matrix_index_policy.test.ts` (prune policy self-consistency) +
`matrix_index_prune.test.ts` (the `pruneMatrixIndexes` executor, dry-run: keeps
every load-bearing index, drops only policy-`drop` ones). Neither `dd542` nor the
flattened shape is in an oracle corpus (WC-044) — no re-harvest.

## WC-047 — Semantic search in the client: `locator_position` SQO order mode + preset `semantic` key + `dd_rag_api embed_groups` (2026-07-22)

ADDITIVE (no PHP counterpart exists — the RAG subsystem is TS-native), ledgered
because all three surfaces are client-visible wire shapes:

1. **SQO order entry `{mode:'locator_position'}`** — orders rows by their
   POSITION in `filter_by_locators` (the semantic-search rank). Emitted by the
   assembler as a `selectExtra` alias (`locator_position_order`) riding the
   component-sort machinery, ids inlined as `Number.isSafeInteger`-validated
   literals (an order-time bind would bind-mismatch the count path, which
   reuses the sqo but emits no ORDER BY). No-op without pins; single-tipo pin
   lists only (loud refusal otherwise). `sanitizeClientSqo` additionally clamps
   `filter_by_locators` to `CLIENT_MAX_LOCATOR_PINS` (1000) with the DEC-07
   loud-clamp convention (hardening — the node ceiling already bounded ≈3.3k).
2. **Search-preset `semantic` key** — the dd625 stored filter value may carry
   `{"semantic":{q,group}}` beside `$and`/`$or`: the LIVE natural-language
   query a preset re-runs on Apply (never the resolved pins/order — freezing
   one user's result set into a shareable record is forbidden by design).
   Old clients ignore the key (`build_dom_group` walks only path/`$` keys).
3. **`dd_rag_api embed_groups {section_tipo} → {groups:[ids]}`** — the client's
   facet selector + semantic-availability gate. Malformed tipo, denied caller
   (`getPermissions(tipo,tipo) < 1`) and not-opted-in are BYTE-IDENTICAL
   `{groups:[]}` — the action is never a section-existence oracle.

Client flow (resolve-once-then-pin): quick input / panel block →
`dd_rag_api semantic_search {query, section_tipo, group?}` → pins + the order
mode → the normal section list renders/pages the ranked set; an SQO-derived
pinned CHIP makes session-persisted pins visible and clearable (pins ride
`SESSION_SQO_MERGE_KEYS` and outlive the page — an invisible pin set was the
adversarial review's top finding).

### Gate

`test/unit/search_locator_position_order.test.ts` (alias shape, end-to-end rank,
count-path regression, windowed-path validity, no-op/multi-tipo/unsafe-id
refusals, clamp) · `test/unit/rag_api.test.ts` (embed_groups oracle-shape
equality) · `test/unit/agent_egress_tripwire.test.ts` (AGENT_TOOLS totality +
contributor rule) · `test/unit/agent_loop.test.ts` (RAG tools scope/group/
dedupe). Not in any oracle corpus — no fixture impact.

## WC-048 — Portal column sort: PER-DDO model (`sort_by_column` + `order` on the ddo, top-level property RETIRED) (2026-07-23)

Portal column-sort is a **v7-native feature with no PHP oracle**; PHP is now
reference-only, so TS takes its own shape. The sort directives are declared **on
the column ddo** — a `properties.source.request_config[].show.ddo_map` entry —
NOT on top-level component properties. The PHP-inherited `properties.sort_by_column`
(`true` | allowlist array) and the earlier interim `properties.order_by` are
**both retired**; nothing in the corpus used either (`dd_ontology` scan: 0 hits).
Two independent per-ddo keys:

```jsonc
"show": { "ddo_map": [
  { "tipo": "rsc85", "sort_by_column": true, "order": "asc" },
  { "tipo": "rsc86", "sort_by_column": true, "order": "asc" }
] }
```

- **`sort_by_column: true`** (WRITE, user-triggered) — the column may be
  persistently re-ordered by a header click (Time Machine data change). Gate
  moved from the top-level property to the column ddo: `applySortByColumn`
  (`save.ts`) requires the resolved column ddo's `sort_by_column === true`; the
  client `ui.allow_column_order` reads the per-column `column.sort_by_column`
  (stamped by `get_columns_map` from the ddo). The old `true | [tipos]` allowlist
  is gone — an allowlist of column tipos was just a per-ddo flag in disguise.
- **`order: "asc"|"desc"`** (READ, declared default; `true` = asc) — the portal
  is ordered by the column(s) carrying `order` EVERY read, FOR DISPLAY, without
  touching the stored array. Applied in `expandPortal` (`relation_core.ts`)
  between reading the stored locators and paginating (page 1 = top-ranked);
  priority = ddo_map declaration order; unresolvable targets fall to the END.

Both share ONE ranking engine `rankLocatorsByColumns`
(`src/core/relations/order_locators.ts`): a target-section search over the
linked `section_id`s ordered on the column(s), then a rank-map re-order.

- **Wire carrier.** The per-ddo keys ride the parsed request_config PASSTHROUGH
  (`request_config/explicit.ts` spreads `...rawDdo`; `parseBlock` spreads
  `...block`) to the server read/save paths AND to the client — no `ddoSchema`
  change (that schema is the INBOUND client-RQO strip only; the outbound
  server-built config never re-parses through it).
- **Fixture impact: NONE.** Opt-in; no corpus record carries either key, so the
  frozen read-path store replays byte-identical.
- **Two latent-bug fixes in the shared engine** (both were masked because the
  pre-existing `sort_by_column` had no DB happy-path gate and never actually
  reordered):
  1. `limit: 0` renders as a literal `LIMIT 0` (zero rows); only
     `limit: 'all'`/null is unbounded → the rank search returned nothing.
  2. The ranking SCOPE was resolved from the column ddo's `section_tipo: 'self'`
     mapped to the CALLER section — but a portal column's 'self' is its TARGET
     section (where the linked records live). Searching the caller table matched
     no ids → empty rank → stable no-op. Fixed: the target section is derived
     from the LOCATORS being sorted (`locatorTargetSections`), so both
     `sort_by_column` and `order` rank over the correct table. Verified in the
     browser (tch551 → tch10) — `section_id` DESC reorders `[1,2]→[2,1]`.
  3. The order path was a naive single-step `[{target, column}]` — correct for
     literals/dates, but a RELATION column (checkbox/autocomplete/portal) stores
     a LOCATOR with no `.value`, so the assembler's `.value`-by-lang extraction
     ranked everything NULL (tie → no-op). Fixed: each order column resolves
     through `buildOrderPath` (`buildOrderEntries`), which emits the per-model
     JOIN chain to the linked sortable leaf. Verified in the browser (tch191
     checkbox: ASC `[2,1]` vs DESC `[1,2]`).
  No parity fixture pins `sort_by_column` output.

  Separately, this required fixing `component_date` SAVE to stamp
  `start.time` (PHP `component_date::save → add_time`, ported as
  `addTimeToDateItem` and wired into `save_component.ts`) — the generic write
  path had no per-model date hook, so v7-entered dates lacked the sort/search
  key entirely (`file_date.ts`/`media_file_date.test.ts`).

### Gate

`test/unit/portal_order_by_columns_native.test.ts` — `normalizeDirection`,
`buildPortalOrderSpecs` (per-ddo `order`, self→section, skip-un-ordered column,
declaration-order priority, invalid→null), `hasDeclaredColumnOrder` (cheap raw
gate) + DB-backed end-to-end (`rankLocatorsByColumns` re-orders real test3
locators by `section_id`, unresolved last; the `limit: 'all'` fix is what makes
the rows non-empty). Save gate: `test/unit/portal_edit_writes_native.test.ts`
(`sort_by_column` refuses when the column ddo does not opt in).

## WC-049 — Export parents chain ACTIVATED: per-ddo `value_with_parents` → sibling `#parents` column (grid_value only) (2026-07-24)

The PHP export feature (`component_relation_common::get_export_value` parents
block + `get_locator_value show_parents`) that the TS rewrite carried as an
INERT flag is now implemented — with three deliberate divergences from PHP:

1. **Per-ddo ONLY.** The flag lives on the export column
   (`ar_ddo_to_export[].value_with_parents`, the per-column checkbox). The PHP
   request-global `options.value_with_parents` (the old global "Export parents"
   checkbox) is REMOVED from the client and IGNORED by the server
   (`compileExportPlan` reads only the ddo).
2. **grid_value format ONLY.** PHP also folded parents atoms into the flat
   `value` cells via `join_atoms`; TS `value`/`dedalo_raw` outputs are
   unchanged (`resolveValueCell` never reads the flag; the value-format label
   derivation calls `collectGridAtoms` with parents OFF).
3. **ONE pre-joined atom per locator.** PHP emitted one atom per ancestor and
   joined at tabulate time with the segment's `fields_separator (' > ')`; the
   TS tabulator's cell join is fixed `' | '`, so `atoms.ts
   resolveParentsChain` pre-joins the chain (`' > '`, nearest parent first,
   self excluded, empty terms dropped) into one atom. Same cell bytes.

Emission (atoms.ts): per relation locator, `getParentsRecursive` ×
`getTermByLocator(fromCache)` → an extra atom whose segment path appends
`{sub_id:'parents', section_tipo: target, component_tipo: relation tipo,
item_index: locator position}` — column key ends `#parents`, label leaf is the
verbatim `parents`, rows align with the locator's child atoms in every
breakdown. Both relation paths emit: the WC-008 compact portal cell (parents
segment unindexed, first segment carries the locator position) and the
request-config fan-out, where the flag inherits down EVERY relation level
(PHP `export_context::descend` parity). Targets without hierarchy (no
`component_relation_parent`, no parents) emit NOTHING — never an empty column.
Parents apply to the ddo's LEAF relation targets (+ nested fan-out levels),
not to intermediate DECLARED hops — a per-column flag names its own column.

Client gate (tools/tool_export): the per-column checkbox renders only for
models `component_portal | component_autocomplete | component_autocomplete_hi`
(the old broader relation-model set is retired) AND when the NEW
`tool_export.components_with_parent` action (`{components:[{tipo,
section_tipo}]} → {[tipo]: boolean}`, section read gate) confirms a
hierarchical target — targets resolve through the datalist's
request-config builder (explicit configs, hierarchy_types, 'self', implicit
ontology relations). Legacy presets carrying the global flag apply cleanly
(the key is ignored; per-ddo flags ride the preset's ddo list). The
`value_with_parents` tool label is now in register.json (was a hardcoded
English fallback).

**Fixture impact: NONE.** No tool_export oracle fixture carries
`value_with_parents` (the section-read `ddinfo` fixtures that do are a
different feature, untouched). The output only changes when the per-ddo flag
is sent — additive.

### Gate

`test/unit/tool_export_parents_native.test.ts` (test3 playground: scratch
27→2→1 chain + stamped lg-spa terms — compact + fan-out emission with key/
label/chain-order/cell bytes, per-ddo-only, grid_value-only, parent-less
emits nothing, `components_with_parent` truth table + invalid_request) ·
`diffusion_export_unified.test.ts` (protocol invariants with the flag on, both
formats).

## WC-050 — Observer cascade fires at the WRITE CHOKEPOINT (beyond-oracle broadening) (2026-07-24)

PHP fired `propagate_to_observers` only from the interactive component-save
controller. TS fires the same recompute law (`section/record/observers.ts`,
oracle-pinned byte shape) from `saveComponentData` POST-COMMIT — so EVERY
save door propagates (dispatch, `dedalo_data`/CSV import, MCP write tools,
transcription) — plus two doors that bypass the chokepoint: portal
`delete_locator` (recomputes the REMOVED locators' targets) and record
duplicate (recomputes the copied locators' targets AND the copy's own
observer-mirror slots). Deliberate divergences, all ADDITIVE (mirrors that
PHP left stale converge; no served byte shape changes): the per-write mirror
value equals what a PHP interactive re-save would have produced. Doors still
outside the cascade (`tool_propagate_component_data`, `delete_data` wipe,
`update/transform/portalize.ts`) heal via `scripts/observer_reconcile.ts`
(dry-run default; `--apply`; shrink-guarded inside the row lock).

### Gate

`test/unit/observer_native.test.ts` (dispatch door + both bypass doors,
oracle-captured mirror/relation_search goldens; suite-DB seeding via
`test/helpers/observer_term_seed.ts`) ·
`test/unit/observer_reconcile_native.test.ts` (bypass-drift dry-run/repair/
idempotence/shrink; planted-seed-gated so a live snapshot is never written).

## WC-051 — Session lifetime retuned, and the media cookie + `not_logged` bound to it (2026-07-24)

One policy change with three wire consequences. Idle TTL 12h → **1h**
(`SESSION_TTL_SECONDS`), absolute cap 30d → **12h**
(`SESSION_ABSOLUTE_TTL_SECONDS`): an unattended browser is the threat, and the
client's own background polling renews an idle session indefinitely, so the cap
is what actually ends a day. Long-running work is UNAFFECTED by construction —
background tools keep the requesting user on the job record and never re-read
the session (`core/tools/background.ts`), and diffusion re-derives the enqueuing
principal from `owner_user_id` at run time (`diffusion/runner.ts`, DIFF-01) — so
publication and massive imports outlive their owner's logout.

**1. `dedalo_media_auth` now tracks the session.** It was minted ONLY at login
with a fixed `Max-Age=86400`, while the session refreshed on every request. Both
directions were broken: anyone logged in over a day kept a healthy session and
lost the cookie, and since the WEB SERVER gates media (not this process), every
image/av/pdf/3d 404'd while the app looked fine — with no publication markers,
Rule A is the only door. Conversely a cookie minted just before logout stayed a
valid media credential for up to 48h with no session behind it. Now re-issued on
any authenticated request whose cookie is missing or stale, with `Max-Age` = the
session idle window, via the read-only `currentMediaAuthCookie()` (never mints,
never rotates, never rewrites the rule files — it is on the hot path).

**2. The auth denial carries `errors:['not_logged']`** (`notLogged()`, replacing
`denied(401, 'Authentication required')`, which put the human message in
`errors`). The whole client dispatches re-login on that literal token — modal,
per-component retry on `login_successful`, error render — inherited from the PHP
oracle and emitted by nothing in TS, so the entire recovery path was unreachable
dead code. The maintenance-mode gate returns the same shape, as its comment
already claimed. `msg` still carries the human text.

**3. Three TS-ONLY `page_globals` keys** (PHP has no twin — it had nothing to
warn about): `dedalo_session_ttl_seconds`, `dedalo_session_absolute_expires_in`,
`dedalo_session_warning_seconds` (`SESSION_WARNING_SECONDS`, default 300, `0`
disables). Only the ABSOLUTE deadline is shipped because only it is underivable
client-side — the idle window restarts on every request, so `session_expiry.js`
re-arms a local timer from the `session_activity` beat instead of a per-response
countdown field. Zero per-response wire cost.

Client-side, `_fetch_with_retry_and_timeout` now EXEMPTS 401 from its HttpError
throw: it classified 401 non-retryable, painted a permanent red "Not retry-able
HTTP error 401" and threw, so the envelope never reached `.json()` and
`api_response_errors` never published. Without that exemption point 2 is inert.

### Gate

`test/unit/session_expiry.test.ts` (both clocks on read AND in the GC — the
sweeper matched only `last_seen`, so a session kept warm past the absolute cap
was refused on every request and never deleted; plus the two reported clocks) ·
`test/unit/media_protection_cookies.test.ts` (re-issue when missing/stale,
silence when current, `Max-Age` = idle window, never for an unauthenticated
caller, and that the read path performs no write) ·
`test/unit/session_not_logged_contract.test.ts` (the 401 token over real HTTP,
the 401 exemption in `data_manager`, and that every client branch still names
`not_logged` — so the server token can never be orphaned again) ·
`test/parity/environment_differential.test.ts` (the three keys asserted TS-only,
then stripped, exactly as WC-031).

## WC-052 — Rows `ddinfo`: emitted only for VALUE-RESOLVING ddos, stamped `from_ddo_tipo` (2026-07-25)

The section-rows breadcrumb (`read_source.ts` `emitRow`, the picker's
`value_with_parents` ddinfo) diverges from the frozen PHP oracle in two ways,
mirroring the v6 fix of 2026-07-24/25:

**1. Suppression of the phantom.** PHP emits the ddinfo for EVERY
`value_with_parents` ddo that runs for a row — but a `'self'` ddo resolves for
every searched section, so `hierarchy25` runs for a `tchi1` row where its
component has NO data (`entries: []`, `fallback_value: [null]`) and emits a
breadcrumb for a term that isn't displayed. With the client's ddinfo column
anchored after the hierarchy25 column, that phantom renders the parents chain
BEFORE the row's real term (`tch555` choose list: "chain → Cirat" instead of
"Cirat | chain"). TS emits the ddinfo ONLY when the ddo's just-emitted items
carry a real value (`entries` or the lang-fallback face `fallback_value` with
at least one non-null/non-empty element; locator-shaped entries count).

**2. `from_ddo_tipo` stamp.** Each emitted ddinfo carries the generating ddo's
tipo. The client (`get_columns_map`) now builds ONE ddinfo column per anchor
column of a `value_with_parents` ddo (ddos sharing a column share one ddinfo
column) and each column's `render_column_component_info` callback filters by
`from_ddo_tipos` — so a multi-section picker whose sections use DIFFERENT term
components (`hierarchy25` vs `tchi15`) renders every row as `term | parents`.
PHP keeps the phantom and stamps only `parent` (the caller/section tipo, which
cannot distinguish generating ddos). Existing parity projections are
unaffected: `autocomplete_search_differential` rsc92/fr1 compares
`section_id:chain` strings only, and its hierarchy25 fixture resolves real
values (nothing suppressed).

NOTE: whether a row gets a breadcrumb at all is ONTOLOGY-driven — the target
section's term ddo must declare `value_with_parents: true` in the request_config
block the client searches with (e.g. `tch555` needs it on `tchi15` in `choose`
for tchi1 rows to carry their chain).

### Gate

`test/unit/ddinfo_from_ddo_native.test.ts` (phantom suppressed; stamp names the
generating ddo; fallback_value and locator-shaped entries count as values;
non-vwp ddos never emit).

## WC-053 — Time Machine (dd15): sort restriction, id-column resolution, ORDER BY qualification, range-filter barrier + the record-history index (2026-07-25, extended 2026-07-26)

Born of a production-scale slow-request report on the 50.5M-row / 33 GB
`matrix_time_machine` (dedalo7_mdcat): the inspector history
(`dd_core_api::read`, `src=service_time_machine:dd15`) took **11.5 s**. Root
cause was an index gap, not the read shape — `WHERE section_tipo=? AND
section_id=? ORDER BY id DESC LIMIT n` (read_tm.ts `queryTmRows`) had no index
carrying BOTH the scope and the sort key, so the planner could only choose
between reading the record's WHOLE history and top-N sorting it (**4 216 ms** on
a 113k-row record) or walking the section's entire log filtering `section_id`
(**5 954 ms** on the same). Cost scaled with the record's history size, not the
page size, which is why small records never reproduced it.

(Those two figures are on the BLOATED indexes — the state that produced the
incident. A REINDEX of the same rows brings the losing plan to 302 ms; it still
reads all 113 251 rows to return 10, so the shape, and therefore the scaling, is
unchanged. All measurements in this entry are PostgreSQL 18.4.)

Chasing it opened three further defects on the same surface, all of the same
shape — *the column that scopes and the column that sorts are not the same
column* — plus two id/name collisions. Five changes in total:

- **New index (no wire change).** `matrix_time_machine_record_history_idx
  (section_tipo, section_id DESC, id DESC)` — both leading columns
  equality-bound leaves the trailing `id DESC` as the requested order, so a page
  costs 40 index entries + 10 heap fetches: **4 216 ms → 0.29 ms**, flat in
  history size (verified to 433 895 rows). The trailing `DESC` on `section_id`
  makes it a superset of the all-matrix `(section_tipo, section_id DESC)` index,
  which is therefore KEPT (it is the narrowest index for the scoped pagination
  COUNT, index-only, and is asset-provisioned for every matrix table).
  Provisioned in `db_pg_definitions.json` so fresh installs get it.

- **dd15 sort policy (structure-context wire change).** Every dd15 list column
  now emits `sortable:false` EXCEPT Section id (dd1212 → the `section_id`
  column) and When (dd559 → the `timestamp` column) —
  `TIME_MACHINE_SORTABLE_TIPOS`, enforced in `structure_context.resolveSortable`.
  Unlike dd542/WC-044 this is NOT a jsonb-sort problem: dd15 columns map 1:1 to
  real flat columns. It is index DIRECTION — read_tm.ts emits `ORDER BY <col>
  <dir>, id <dir>` while every composite index is `(col, id DESC)`, and a btree
  reads only forwards or backwards, so those sorts degrade to an Incremental
  Sort over a full index scan. Measured on the bare browse (PostgreSQL 18.4),
  bloated → straight after a REINDEX of the same 50.5M rows: What (dd577)
  1 444 → 50 ms, Who (dd578) 7 919 → 721 ms, Process (dd1371) > 25 s →
  **20 406 ms**, Value (dd1574) > 25 s → **14 554 ms** (a parallel seq scan +
  full sort of 50M jsonb). The two allowed columns are index-served with NO
  sort node in both states (1–2 ms), which is why the allowlist is "served
  outright" and not "fast today" — the sort-node columns swing ~29x on index
  bloat alone, on a table where bloat always returns. (Those figures come from a
  NARROW `SELECT id` probe, which an index-only scan satisfies; the emitted query
  selects the wide row including the `data` jsonb, so each sort-node row also
  costs a heap fetch and the real numbers are worse. Ranking is unaffected and
  the exclusions only get safer. The allowed set is dd1573 Id, dd1212 Section id
  and dd559 When, plus the client's built-in Id box.) Columns
  outside `TM_ORDER_COLUMN` entirely — the section's own components as columns in
  the record-snapshot list — also lose the icon; a header click on those
  previously THREW `TM read: order by '<tipo>' is uncovered scope` (a 500), so
  this leg is strictly a repair.

- **The Id columns resolve to their own physical column (bug fix, ROW ORDER
  changes for a given click).** dd15 has TWO id-ish columns and both were
  mis-wired. `TM_ORDER_COLUMN` now maps:
  `dd1573 "Id" → id` (the TM ROW's own PK — it was ABSENT from the map while
  `tm_filter` already resolved it to `id`, so the Id column could be FILTERED but
  not SORTED: a header click fell through to the uncovered-scope throw);
  `section_id → id` (the PSEUDO-column the client's built-in Id box sends —
  `view_default_list_section.rebuild_columns_map` hardcodes `tipo:'section_id'
  // used to sort only`, meaning "the record's OWN id", NOT the literal column.
  In an ordinary section those coincide; on dd15 the envelope addresses each
  snapshot by the TM row PK (`section_id: row.id`), so the box DISPLAYS `id`
  while it SORTED by the caller record's `section_id` — the Id column came back
  `61468923, 4, 38, 28, 1344, 105`, unsorted);
  `dd1212 "Section id" → section_id`, unchanged — it is the CALLER record's id,
  shown in its own column (its lg-spa term is literally "section_id", which is
  how the two got conflated). Each descriptor now sorts by what its column
  displays. dd15-ONLY: in an ordinary section the record's id IS `section_id`,
  and `order_path.ts` keeps encoding that for every `component_section_id`
  column — untouched.

- **`ORDER BY` is TABLE-QUALIFIED (bug fix, no order change).** The select list
  emits `timestamp::text AS timestamp`, and SQL resolves a bare `ORDER BY`
  identifier to the OUTPUT name first — so `ORDER BY timestamp` bound to the
  text projection, not the indexed column, and the When sort became a parallel
  seq scan + top-N sort of all 50.5M rows: **19 583 ms live / 17 863 ms
  measured**. `read_tm.buildTmOrderSql` now emits `tm."timestamp" DESC,
  tm."id" DESC` → the (timestamp, id DESC) index serves it with NO sort node,
  **0.359 ms** (33–110 ms end-to-end through the read pipeline). Same rows in the
  same order: PG renders ISO with trimmed trailing zeros, so fraction digits
  compare lexicographically exactly as numerically — verified identical over the
  first 2000 rows despite 49.6M rows carrying fractional seconds. `timestamp` was
  the ONLY aliased field in that select, which is why only When was affected;
  every column is qualified now so a future alias cannot reintroduce it silently.

- **Range-filter planner barrier (bug fix, no order change).** A RANGE predicate
  (the dd559 When date search) combined with the `id` sort has no index carrying
  both, and the planner walks the `id` PK filtering inline, betting LIMIT lets it
  stop early. On an append-only log the filtered column CORRELATES with `id`, so
  every match sits at the far end: a 2026 When-search discarded **45 992 453** PK
  entries to return 10 rows — 51.2 s at offset 30 and 48.9 s at offset 1000 (so
  NOT the deep-page/WC-046 problem). `queryTmRows` now wraps the page subquery in
  an `OFFSET 0` optimisation barrier when `tm_filter` reports a range predicate
  (`ParamSink.rangePredicate`) AND the order is `id`: the range is scanned
  index-only and top-N sorted — **425 ms / 309 ms**, proven to return the
  IDENTICAL page (same ids, same order) as the unbarriered query. Conditional by
  necessity: an EQUALITY filter is served outright by its `(col, id DESC)` index
  at 4 ms, and barriering it would force a full range scan.

Divergence from the oracle is the `sortable` flag on dd15 columns only. Row
shape and pagination are unchanged; row ORDER changes only where it was wrong —
the two Id descriptors now sort by the column they display.

FIXTURE STORE: the frozen responses DO carry the oracle's dd15 column contexts
with `sortable:true` — `tm_bare_list` (dd559/dd578/dd1772/dd1212/dd1371/dd1574),
`tm_read` (dd1371/dd559/dd578/dd577), `tm_component_history` (dd559/dd578/
rsc1246), `tm_component_value` (dd559/rsc20). They are NOT edited, because no
gate compares that field: every TM differential asserts STRUCTURAL parity (item
and context tipo SETS, envelope row counts — the values are live history, so
exact bytes were never asserted), and the two gates that do read `sortable`
(`list_column_sortable_differential`, `context_differential`) cover no dd15
context. So the recorded bytes stay a faithful record of what PHP served, and
this entry is the sole ledger of the divergence — the same posture WC-044 took
for dd542, which was removed from the sortable differential's SECTIONS list.

### Gate

`test/unit/tm_sort_policy.test.ts` (allowlist is exactly the index-served set;
each meta column's flag; the uncovered-scope leg; dd1573 vs dd1212 resolve to
different physical columns; the Id box's `section_id` pseudo-column resolves to
`id`; every `TM_ORDER_COLUMN` entry is table-qualified with no bare identifier
reachable; the `buildOrderPath` → `TM_ORDER_COLUMN` round-trip agrees per
sortable column; policy is dd15-scoped — an ordinary section's
`component_section_id` still orders by `section_id`) ·
`test/unit/tm_range_filter_barrier.test.ts` (range detection drives the barrier:
dd559 dates flag at year/month/day, dd577/dd578/dd1574 equality and
contains-searches do not, dd1371 flags on `>=` but not `=`, the flag survives
`$or` nesting) ·
`test/unit/matrix_index_policy.test.ts` + `matrix_index_prune.test.ts` (the
index policy that pins the new signature as required/`keep`).

### Index audit (same pass)

`matrix_index_policy.ts` was re-derived from TRACED EMITTERS rather than scan
counts, which corrected three dispositions: `search_default_idx` was `review`
(operator opt-in to DROP) but is the WRITE path's index — the save/delete
backfill probe binds all four leading columns, measured 1.3 ms with it and
**24 941 ms** without on a miss; `bulk_process_id` was `review` on "cold"
grounds but is `bulk_revert`'s only index (cold ≠ dead); `user_id`'s stated
purpose ("per-user audit history") did not exist — its real consumer is the
dd578 Who EQUALITY filter via `tm_filter.emitRelation`. A STATS CAVEAT is
recorded there too: the `drop-dead` gate keys on `idxScan > 0`, and cumulative
stats are LOST on crash recovery / `pg_upgrade` (this cluster came up with
`stats_reset` NULL and every index at ~0 scans while holding 50.5M rows), so on
a freshly restarted server that gate silently stops protecting.
`db_pg_definitions.json` was reconciled with the policy: three asset-provisioned
indexes the policy calls `drop-dead` removed (BRIN `date(timestamp)`, standalone
`lang`, `(section_id, bulk_process_id, section_tipo, tipo, lang)`), two
policy-`keep` indexes added that installs lacked (`(timestamp, id DESC)`,
`(section_id)`), and the invalid `idx_matrix_data_trgm` dropped.

## WC-054 — Activity (dd542): the list's structural order is served by the `("timestamp", id)` index (2026-07-27)

Born of a production-scale slow-request report on the 32.9M-row / 85 GB
`matrix_activity` (dedalo7_mdcat): searching the **When** column (dd547) hung.
Same shape as WC-053's range-filter barrier — *the column that filters and the
column that sorts are not the same column* — but on the other log, and with a
stronger remedy available.

**Root cause: an abort-early plan flip, not the SQL shape.** Every dd542 list
sort is a unique monotonic key — `id DESC` (the dd549 default: insertion order)
or `section_id <dir>` (the When header; WC-044 maps When → section_id) — and
ordered alone each is index-perfect. The When SEARCH filters `timestamp`, which
neither the `id` PK nor `(section_tipo, section_id DESC)` carries. Above roughly
100k estimated matches the planner therefore drops the `("timestamp", id)`
index and walks the ORDER BY index BACKWARDS with the dates as a Filter, betting
that 30 matches turn up within ~30/selectivity rows:

```
Limit  (cost=0.56..173.48 rows=30)
  ->  Index Scan Backward using matrix_activity_pkey  (cost=0.56..18410763.51 rows=3194075)
        Filter: "timestamp" >= … AND "timestamp" < … AND section_tipo = …
```

That bet assumes the qualifying rows are spread along the key. On an APPEND-ONLY
log they are one contiguous block, so any range that does not touch "now" makes
the scan walk every newer row first — for `When = 2023-06`, ~11.4M rows, each a
heap fetch (the PK index does not carry `timestamp`). The estimates are accurate
(3,194,075 estimated vs 3,207,022 actual); it is the DISTRIBUTION assumption
that is wrong, which is why no amount of ANALYZE helps.

Reachable from the ordinary UI, not an edge case: `builder_date.periodBounds`
expands a partial date to its whole period, so a year-only value is a 12-month
range and year+month a whole month. Only a full `YYYY-MM-DD` stayed under the
flip threshold (~3 weeks of data on this install). `<` / `<=` on an old date is
the worst case; `>=` on a recent one is fast by luck (its matches sit at the
newest end). The implicit default order (`section_id ASC`, for an sqo that omits
`order`) has the same trap seen from the other end — cost 13.6 M, walking from
the OLDEST row.

**The change (SQL only, same rows).** On `matrix_activity` a single
structural-key order is emitted as `"timestamp" <dir>, id <dir>`
(`sql_assembler.timeOrderedLogOrder`), covering the `id` default, the
`section_id` When-header sort, and the implicit no-order default. The existing
`("timestamp", id) INCLUDE (section_tipo, section_id)` index then delivers the
requested order OUTRIGHT — a backward index scan with **no sort node** — so the
cost is O(LIMIT), independent of the range width. Measured on mdcat with the
emitted query (full wide-column select, `LIMIT 30`):

| When search | before | after |
|---|---|---|
| `2023-06-15` (a day) | 1.9 ms | ~1 ms |
| `2023-06` (a month, 3.2M rows) | **>300 s** (statement timeout) | **6.1 ms** |
| `2023` (a year, 6.0M rows) | **>300 s** | **1.4 ms** |
| bare browse, offset 0 | ~11 ms (WC-046) | 0.17 ms |

Why dd542 gets the reorder where dd15 got WC-053's `OFFSET 0` barrier (which
here measures 1.88 s for the month — 300x better than the trap, 300x worse than
this): on dd15, `id` and `timestamp` are two DIFFERENT user-facing columns
(dd1573 Id, dd559 When) and an `id` sort must stay an `id` sort. On dd542 there
is no Id column at all — WC-044 already established that the only sortable
column, When, IS insertion order, so re-expressing it on the timestamp index
changes nothing the user asked for.

**Divergence: equivalent order, not identical.** `timestamp` order ≡ insertion
order ≡ `id` order is WC-044's own invariant (it is what made When → section_id
legal), but it is not exact to the microsecond: measured on the real log, ~7
rows per million are stamped microseconds out of id order (busiest bulk day
2023-06-28: **10 inversions in 1,412,451 rows**, worst 224 µs — concurrent
inserts whose ids were assigned in a slightly different order than their
timestamps). Two sub-millisecond neighbours can therefore swap. The `id`
tiebreaker keeps the pair a UNIQUE total order, so pagination stays stable.

**The deep-page rewrites carry over unchanged.** `singleUniqueKeyOrder` rejects
a two-column clause by design, so the WC-046 late-row-lookup and order-flip had
to be handed the rewrite's key explicitly or every deep page would have silently
dropped back to a plain OFFSET (8.1 s at offset 16 M on the composite order,
measured). `("timestamp", id)` is still a unique total order (`id` alone is), so
both rewrites stay exact: the page is ACQUIRED by `id` — the join back is 1:1 —
while both the inner page and the outer restore ORDER BY the composite, mirrored
together by the flip. Scoped to `matrix_activity`
(`TIME_ORDERED_LOG_TABLES`): `matrix_time_machine` has its own emitter
(`read_tm.ts`) and cannot flatten; every other section is untouched.

### Gate

`test/unit/activity_time_order.test.ts` (the rewrite: dd549 default, When-header
sort both directions, same-direction pair, the date-filtered request that was
reported, the no-order default, plus two negative controls — a jsonb component
sort keeps its sort alias, an ordinary section keeps `section_id`) ·
`activity_deep_offset_flip.test.ts` (extended: the flip/late-lookup page still
equals the ground-truth `ORDER BY <key> DESC LIMIT L OFFSET O` byte-for-byte for
BOTH keys, and now asserts the composite order on both sides of the join, so a
regression to a bare key order fails loudly) · `search_order_id.test.ts`
(retargeted off dd542 onto an ordinary section — it tests the generic `column` /
`component_tipo` convention, which dd542 no longer exhibits; one boundary case
pins the rewrite).

FIXTURE STORE: `activity_read_differential.json` DOES pin a dd542 listing (the
flattened SQL shape itself does not — WC-044). It is NOT edited and needs no
re-harvest: the divergence only exists where `timestamp` and `id` disagree, and
they do not disagree on any non-scale corpus. Verified by ranking every dd542
row both ways on each install DB — `dedalo7ts` (1332 rows), `dedalo7ts_test`
(260), `dedalo7_mdcat_test` (579): **0 inversions, 0 rank differences** in all
three. Only the 32.9M-row `dedalo7_mdcat` log, whose concurrency produced the
microsecond inversions above, orders differently at all.

## WC-055 — Unindexed searches: the redundant `@?` pre-guard removed, and the statement-timeout ceiling made usable (2026-07-27)

Two changes on the same theme — a search we deliberately do NOT index must still
be cheap per row and bounded in total. Neither changes any result.

**The `@?` pre-guard on the POSITIVE exists-envelope (SQL only, same rows).**
`builder_json` and `builder_iri` emitted
`(col @? '$.<tipo>[*]') AND EXISTS (SELECT 1 FROM jsonb_path_query(col, …) …)`.
The guard cannot change the result: `jsonb_path_query` is STRICT, so a NULL
column or a path yielding no element produces no rows and the EXISTS is already
false. It was a second full jsonpath evaluation of the same path on the same
document, per row. Measured on the dd551 Data search over the 32.9M-row mdcat
`matrix_activity` — the shape that CANNOT abort early, a term matching nothing,
so it reads everything — 200k rows: **2854 ms → 1059 ms (2.7x)**; extrapolated
to the full table ~470 s → ~175 s. Removed from `existsEnvelope` in both
builders only. It is LOAD-BEARING elsewhere and stays: `!=`/`-` is
`(col @? path) AND NOT EXISTS (…)` = "has entries but none match" (without it
every record lacking the component would match), and `*` not-empty IS the guard.

**Why dd551 is not indexed at all** (the decision this entry records, so it is
not silently revisited): the only index that could serve
`f_unaccent(elem->>'value') ~* f_unaccent($1)` is a trigram GIN over an
expression on `misc`, maintained on EVERY activity insert — the hottest write
path in the system, the write amplification WC-046 set out to remove — to serve
a column that is searched rarely, and whose COMMON-term search already answers
in 0.3 ms (the matches are recent, so the ordered walk aborts early). Only the
no-match term is slow. The residual cost is accepted and bounded, not indexed.

**`DB_STATEMENT_TIMEOUT_MS` made usable (`runWithoutStatementTimeout`).** The
ceiling is the only bound on that residual: an unindexed `~*` over 33M rows
cannot abort early, and a client disconnecting does NOT cancel it (verified the
hard way — probe queries orphaned by a killed `psql` were still burning CPU 24
minutes later). The setting nevertheless shipped disabled and unused, because it
is a per-connection GUC on the SHARED pool and the same ceiling would abort
REINDEX / VACUUM / DROP INDEX CONCURRENTLY — maintenance that is SUPPOSED to run
for minutes. Those statements now opt out explicitly through a RESERVED
connection (`core/db/postgres.ts`), so the ceiling can finally be set for the
request traffic it exists to protect: `db_assets.optimizeTables` (REINDEX +
VACUUM per table), `pruneMatrixIndexes` (DROP INDEX CONCURRENTLY),
`execMaintenance` (the `ar_maintenance` sentences, incl. VACUUM FULL), and the
Database-info widget's whole-database VACUUM ANALYZE. The GUC is cleared on a
reserved connection, never a pooled one: a plain `SET` persists for the life of
the connection, so issuing it on the pool would silently un-bound every later
request handed that same connection.

### Gate

`test/unit/search_exists_envelope_guard.test.ts` — the asymmetry (positive
envelope carries no `@?`; `!=`/`-` and `*` keep theirs) PLUS a row-level
equivalence proof against the live planner over NULL / empty-array /
missing-component / object-valued rows · `test/unit/statement_timeout_exemption.test.ts`
— a ceilinged statement IS cancelled, the helper's is not, and the cleared GUC
does not leak back into pooled traffic.

## WC-056 — Activity (dd542) "Who" (dd543): actor searched through an indexed expression (2026-07-27)

The third scale defect on the same 32.9M-row log, and the one that had never
worked: searching Who for a user who left the organization did not return.

**Root cause — no index on `relation`, and none that could carry the sort key.**
The list orders by `("timestamp", id)` (WC-054) while the filter is
`relation @> '{"dd543":[{…}]}'`, so no index carries both; the planner walks the
ordered index with containment as a Filter and stops at the LIMIT. On an
append-only log every row of one actor is a contiguous block, so that walk is
fast only when the actor is ALSO recent. Measured, 25-row page:

| actor | matching rows | no index | GIN(relation) | GIN + `OFFSET 0` barrier | this |
|---|---|---|---|---|---|
| user 3 (last seen 2016) | 1 021 | **>300 s** | 12.5 ms | — | **1.6 ms** |
| user 40 | 52 000 | **>300 s** | **>300 s** | — | **1.1 ms** |
| user 95 | 206 000 | **>300 s** | **>300 s** | 4.4 s | **2.6 ms** |
| user 115 | 2 600 000 | 258 ms | 68 ms | — | — |
| user 2 | 8 100 000 | 90 ms | 90 ms | **69.5 s** | **4.3 ms** |

(Final column measured on the shipped two-column index, `EXPLAIN ANALYZE` of the
emitted query against `dedalo7_mdcat`. Every plan is a plain `Index Scan using
matrix_activity_who_ts_idx` with no sort node — the cost is the page, not the
actor.)

Two candidate fixes were measured and rejected as complete answers. A **GIN on
`relation`** rescues only the RARE actor — the one case the estimate is small
enough for a bitmap scan — and leaves a departed actor with 206k rows timing
out. The **WC-053 `OFFSET 0` barrier** helps that actor (>300 s → 4.4 s) but is
catastrophic for a heavy one (90 ms → **69.5 s**), because it forces a full
8.1M-row bitmap heap scan where abort-early was finding 25 rows immediately.
This filter's selectivity spans four orders of magnitude BETWEEN ACTORS, so no
static plan choice is right for all of them — unlike WC-053's date range, where
one barrier fits.

**The change.** `matrix_activity_who_ts_idx
((relation->'dd543'->0->>'section_id'), (relation->'dd543'->0->>'section_tipo'),
"timestamp" DESC, id DESC)` — leading actor equality leaves the trailing sort
key free, so ONE index answers the filter AND the order, index-served with no
sort node, O(LIMIT) for every actor class. It needs the predicate written as an
equality on the same expression, so `builder_relation` gained an activity twin
(`buildActivityWhoFragment`), exactly as it already had one for
`matrix_time_machine`'s flat `user_id` column. `'*'`/`'!*'` existence stay on the
cheap `?` key test; `!=`/`!==` negate the same expression.

**Scoped, and resting on a gated invariant.** dd542/dd543 only — dd545 What on
the same column, every ordinary section, and the TM twin are untouched and keep
containment. The predicate reads element 0, so it is exact only while a row
carries exactly ONE actor locator: that is how `activity_log.ts` writes, and how
the data reads (2.5M rows sampled on mdcat — 2M newest + 500k oldest — all
`length 1`, all `dd128`). `activity_log_single_actor.test.ts` gates the WRITER,
because a second locator would be invisible to Who search rather than an error.
`section_tipo` is bound explicitly rather than assumed, so a locator addressing
another section can never be a false positive.

**The GIN is restored anyway** (`matrix_index_policy`: `drop-dead` → `keep`,
434 MB, 96 s to build). It is what makes a rare-value search fast for every
OTHER relation component and every other section, and its drop-dead
classification was unsound: the stated reason ("the planner picks the ordered
btree + Filter, never this GIN") described the symptom of the ordering trap, and
the `idxScan > 0` safety gate could not object because this cluster came up with
`stats_reset` NULL — the STATS CAVEAT recorded in that same file, realized. It
is also asset-provisioned for every matrix table
(`all_matrix_relation_gin_idx`), so the prune was dropping an index
`recreateDbAssets` immediately put back.

### Gate

`test/unit/activity_who_expression_search.test.ts` (the emitted predicate for
default/`==`/`!=`/`!==`, bound params not interpolation, malformed locators drop
the clause instead of matching everything, plus three negative controls: dd545
on the same table, dd543 in an ordinary section, and the TM twin all still emit
containment) · `test/unit/activity_log_single_actor.test.ts` (the writer-side
invariant) · `matrix_index_policy.test.ts` + `matrix_index_prune.test.ts` (both
indexes classified `keep`, so "Optimize tables" can no longer drop them).

---

## WC-057 — register_tools: the panel joins the tools tree, and its ACTIVE checkboxes outrank register.json (2026-07-28)

- **Date adopted:** 2026-07-28.
- **Decision:** admin sovereignty over tool activation (this entry; no earlier DEC).
- **Shape before (TS):** `register_tools::get_value` served the dd1324 registry
  ALONE — `{name, warning:null, version, developer, installed_version}`, with
  `version` mirroring `installed_version` by construction, so PHP's two
  file-state warnings could never arise. `register_tools.register_tools`
  ignored its `options` entirely.
- **Shape after (TS):** each datalist row gains **`active`** (dd1354, the
  registry state) and **`on_disk`**, and the datalist is the JOIN of the
  registry with the directories the importer scans — so a registered tool whose
  directory is gone is listed with `warning:'Not found on disk'`, and a tool on
  disk with no registry row is listed with `warning:'Not registered tool'`
  (PHP's wording), `installed_version:null`, `active:true`. The action reads
  **`options.tools_active`** (`{[tool_name]: boolean}`) and each report item
  gains **`active`** — as does the frozen dry-run branch's `result.report`
  (`ImportReportItem`), whose items now carry the same field.
  **`version` is populated at last.** Both report mappers read
  `(item as {record?:{version?:string}}).record?.version ?? null`, but
  `ImportReportItem` never carried a `record` — so every row of every report
  served `version: null`: the widget response AND the install wizard's per-tool
  rows (`core/install/register_tools.ts`, rendered by `render_installer.js`).
  `ImportReportItem.version` now holds the declared version and both mappers
  read it. A consumer that keyed off the always-null value would see real
  strings for the first time.
- **Reason:** dd1354 gates whether a tool is served to ANY user
  (`tools/registry.ts fetchActiveToolRows`), and 34 of 36 register.json files
  declare `active:1`, so every import re-stamped active and silently re-enabled
  tools an admin had turned off. The panel is the only place an admin
  reconciles tools, so the control belongs there — and a control that writes
  must show the state it writes, hence `active` on the wire. `on_disk` exists
  because the action can only reach tools it can scan: without it the panel
  would offer a checkbox whose write can never happen.
  The override applies BEFORE `validateRegister`/`projectIdentity`
  (`applyActiveOverride`), so the dry-run diff reports `active` too.
  **Admin state wins over the file** for a tool the install already registered;
  a tool author shipping `active:false` no longer deactivates it remotely. A
  tool absent from `tools_active` (any other caller, including the installer's
  `registerInstallTools`) keeps its file declaration — the pre-WC-057 path is
  byte-unchanged.
- **PHP fossil:** PHP scanned the directories for `register.json` and paired
  each with its registry record — the join this entry restores. PHP had no
  per-tool activation control on this panel.
- **Client rendering (no wire effect):** the 36×7-object report is unreadable
  as the generic `print_response` JSON tree, so `build_form` gained an optional
  **`render_response`** hook (absent ⇒ `print_response`, unchanged for every
  other widget) and register_tools supplies a summary: outcome headline,
  active/disabled counts, per-tool errors, the deactivated set, warnings
  GROUPED by message, and the original tree behind a collapsed
  `<details>`.
- **Gate reconciliation:** no oracle re-harvest — no harvested fixture covers
  `register_tools` `get_value` or its action (the widget appears in
  `widgets_differential` only as a CATALOG entry, which is untouched).
  `test/parity/tools_register_differential.test.ts` is unaffected: it calls
  `importTools({dryRun:true})` with no overrides, which is the unchanged path.

### Gate

`test/unit/register_tools_panel.test.ts` (the join: every on-disk tool is
offered a row, rows unique + name-sorted, `active`/`on_disk` present and
boolean, `on_disk` agrees with the scanner and a false one carries the
warning, an unregistered row defaults to active) ·
`test/unit/register_tools_widget.test.ts` (`tools_active` reaches importTools
as `activeOverrides`; malformed keys/values DROPPED not defaulted; a non-object
ignored; the report item's `active`) ·
`test/unit/tools_register_validate.test.ts` (`applyActiveOverride` overrides the
file declaration, keeps the record valid, is idempotent, creates a missing
relation column).

## WC-058 — tool_ontology::set_records_in_dd_ontology takes its scope from the request

The list-mode counterpart of WC-043, found by the 2026-07-28 tools audit and closed
the same way.

PHP list mode rebuilt the SQO from the session
(`$_SESSION['dedalo']['config']['sqo'][$sqo_id]`) and **failed CLOSED** when it was
absent — `'Not sqo_session found from id: …'`, writing nothing
(`class.tool_ontology.php:186-200`). The TS port has no session-SQO twin and filled
the gap with an unbounded `SELECT section_id FROM "<table>" WHERE section_tipo = $1`,
i.e. it rewrote **every record of the section**. That is fail-OPEN where PHP was
fail-CLOSED. Measured reach on the audited install: 4,654 records from one button
(`mdcat0`), 12,172 across `mdcat0`/`dmm0`/`dd0`/`rsc0` — foreground, not
background-runnable, no progress frames, no abort signal, behind a client that gives
up at 60 s while the server keeps writing.

- **List mode REQUIRES `options.sqo`.** Absent, `null`, non-object or array fails
  closed with `invalid_request` and the WC-043 wording. The v7 client now sends a
  deep clone of the caller list's LIVE sqo
  (`tools/tool_ontology/js/tool_ontology.js` — it previously sent none, which is
  what armed the fallback), so the run's scope is by construction the scope the list
  displays; an unfiltered list matches the whole section EXPLICITLY. Pagination is
  stripped server-side (PHP `set_order([])` / `set_limit(0)` / `set_offset(0)`), so
  the whole MATCHED set is processed, not the visible page.
- **Edit mode is unchanged** — an explicit `section_id` is its own scope.
- **`setRecordsInDdOntology` no longer has a whole-section default.** `SetRecordsTarget`
  gains `sectionIds` (an explicit id list) and `wholeSection` (opt-in, greppable,
  for internal rebuild callers only — `ontology_update.ts`'s full-TLD re-derive
  after an ontology-file import declares it). With none of the three stated the
  call refuses loudly rather than guessing "all".

**The generalisation, now stated in TOOLS_SPEC:** a batch tool action takes its
scope from the REQUEST or refuses. An absent scope parameter must never widen into
"everything".

Gated by `test/unit/tool_ontology_scope.test.ts` (9 tests, nothing written — every
case is a refusal or a zero-match resolve, and the dd_ontology row count is asserted
unchanged in `afterAll`). Mutation-proved: reintroducing the fallback turns it red.

## WC-059 — `source.is_temporal`: a temporal instance resolves, it never persists (2026-07-28)

The same shape as WC-058, one layer lower: a scope the TS port dropped, widening
silently into "a real record". Found while investigating why
`tool_propagate_component_data` is unreachable from section list mode.

A **temporal instance** is a tool's throwaway editable clone — the propagate tool's
value widget, `service_tmp_section`'s staging form (behind tool_import_marc21 /
zotero / files), the `component_text_area` draw and reference pickers. It has no
record: the client stamps a **sentinel** `section_id: 1` on it and sets
`source.is_temporal` (PHP commit `5c45c71ebb`, 2026-01-31), which PHP routed to a
scratch store — `matrix_temp_manager`, a `(section_tipo, logged_user_id)`-keyed row
in the unlogged `temp` table.

The TS rewrite (`d31bad80c1`) carried the five client producers over and **did not
port the store**. `rqoSourceSchema` was `.passthrough()`, so the flag rode along
unread, and the save door handed `sectionId: Number(source.section_id)` — the
sentinel — straight to `saveComponentData`. Consequences on the **real** record 1 of
the target section, every time such a tool was opened: the component's value
replaced (`set_data` is a bulk replace; a phantom record is CREATED if record 1 was
absent — `save_component.ts` `createSectionRecord({conflictTolerant:true})`), a Time
Machine row appended, the dd197/dd201 modified stamp falsified, an activity `SAVE`
row written, and for relation components an orphan record created in the target
section plus a rewritten `relation_search`. Audited as a legitimate edit and
therefore invisible in the TM UI — and, for the same reason, recoverable.

Blast radius by producer: `tool_propagate_component_data` writes **once per tool
open**, unconditionally, from `build()`; `service_tmp_section` writes **once per
field edit** (`change_value` → `save`); the text_area pickers write on use, and
`render_reference`'s `null` `set_data` **clears** the target. Global admins are
fully exposed (`isRecordInScope` is skipped for them); a scoped level-2 user is
exposed only where record 1 is inside their projects filter.

- **The save door normalizes and echoes.** `resolveTemporalSave`
  (`src/core/section/record/temporal.ts`) returns the canonical DataItem the client
  resolves by, with no read of the addressed record, no write to it, no Time Machine
  row, no modified stamp and no activity row.
  - It does **not re-apply** `changed_data` on the literal branch, and that is the
    subtle part. The persisted engine seeds from the LOCKED MATRIX ROW, so it
    cannot double-apply; a temporal instance has no row, so its only base is
    `data.entries` — which the client has ALREADY applied the delta to
    (`change_value` runs `update_data_value` over every item, mutating
    `self.data.entries`, and only then calls `save(changed_data)` with
    `clone(self.data)`). Re-applying failed every `remove` (the id is already gone,
    and the engine's unknown-id rule would 400 the user's deletion), duplicated
    every `insert`, and appended on every `update`. Only `set_data` is idempotent
    under re-application — which is exactly why the first cut of this door looked
    correct against a set_data-only gate.
  - What it DOES perform is the normalization the persisted path does on the way to
    storage, because the echo becomes the client's next `self.data`: the lang stamp
    (through the SAME predicate the engine uses — `isLangSlicedModel`, now exported
    from `save_component.ts`) and the item-id mint. Without the mint an id-less item
    stays id-less, the next `update` arrives with `id: null` and APPENDS, and the
    array grows on every committed edit — the array `tool_propagate_component_data`
    then writes across every matched record.
  - The relation branch needs no equivalent: `mergeRelationChips` is idempotent
    under both orderings (insert dedups by locator, remove is a filter).
  The relation branch reuses
  the pre-existing non-persisting `search_<n>` machinery, extracted to
  `src/core/section/record/resolve_echo.ts` and now shared by both doors — the
  client needs a labelled chip and a `pagination.total`, and only a real resolution
  produces them.
- **The gate is a READ level (>= 1) — except for the one action that writes.**
  Nothing is persisted, so the write grant is generally not the question being asked
  (the same reasoning the `search_<n>` branch already used). But `add_new_element`
  really does create a target record, and this branch deliberately short-circuits
  the level-2 gate, the record-scope gate and `refuseAreaWrite` — so admitting it at
  level 1 would be a read→create escalation. The required level is therefore a
  function of the batch: **2 when any change is `add_new_element`, 1 otherwise.**
- **The read door serves no record.** `readComponentData`'s `hasRecordId` is false
  for a temporal source, so it resolves context and datalist with an EMPTY value
  (the existing record-independent path, shared with synthetic search ids) instead
  of serving a stranger's record as the clone's starting value; `read_facade` skips
  the per-record scope gate there for the same reason.
- **The record-lifecycle doors refuse it.** `create` / `duplicate` / `delete` answer
  400 — a lifecycle action on something that addresses no record is nonsense, and
  refusing keeps the totality assertion literally true.
- **`add_new_element` still creates its TARGET record**, and only that: the
  host-filter read is skipped (`applyAddNewElement({skipHostFilterRead:true})`), so
  the new record inherits the default project locator. PHP's temp store behaved the
  same way — the target is real, only the host anchor was scratch. A consultation-only
  target is refused with 400 (without it the `createSectionRecord` engine THROWS on
  dd542/dd15 — a 500 where a 400 is the honest answer).
- **The select family keeps its datalist.** Every `SELECT_FAMILY_MODELS` member is a
  RELATION-column component, so the datalist attach lives on the relation branch;
  placed on the literal branch it could never execute, and the client's post-save
  render (`component_radio_button get_checked_value_label`) dereferences it.
- **`is_temporal` is now DECLARED** on `rqoSourceSchema` rather than swallowed by
  `.passthrough()`, and `isTemporalSource` — beside the declaration, because
  `section/read.ts` needs it and a predicate in `temporal.ts` would close a static
  import cycle — is the single reader.
- **The sentinel is left alone.** `section_id: 1` stays on the wire and is now
  inert; the doors branch on the flag, never on the value.

**The generalisation, extending WC-058's:** a client-supplied record id on an
instance that declares itself record-less is a **wire field, never an address**. A
scope the port dropped must fail closed, not widen into whatever the raw value
happens to name.

Gated by `test/unit/temporal_instance_tripwire.test.ts` (8 tests). The behavioural
half asserts the canonical test3 record 1 is byte-identical with no new TM and no
new activity row after a temporal save, and carries a CANARY — a real save on a
scratch twin — proving those same three probes can see a write, so "nothing
changed" cannot pass vacuously. Mutation-proved: deleting the temporal branch from
`dd_core_api.ts` turns it red.

## WC-060 — `inspect_ontologies`: a misfiled source record is drift kind `foreign`, not a phantom `missing`

`dd_ontology(tld)` is the projection of `matrix_ontology` section `<tld>0`, but a node's
tipo AND tld come from the RECORD's `ontology7`, not from the section it sits in.
`parseMatrixNodes(tld)` did not filter by tld while `storedNodes(tld)` read
`WHERE tld = $1`, so a record with a typo'd `ontology7` (live: `actv0/127` declares
`"act"`) parsed into another tld's namespace and could never appear in `stored`. It was
reported `missing` FOREVER, re-upserted by every reconcile — breaking the module's own
idempotency claim — and **written into the other tld's namespace** by a per-tld
operation, where `deleteTldNodes(tld)` could never take it back. `reconcile_ontologies`
therefore reported a permanent FALSE failure for a TLD it could never fix.

Both sides of the diff are now scoped to the inspected tld. Wire additions, all
backward-compatible:

- `states[].drift[].kind` gains **`'foreign'`** (`diffColumns:['tld']`), plus optional
  `source` (`'<section_tipo>/<section_id>'`) and `declaredTld`;
- `states[].foreignNodes` (count) is new;
- `states[].matrixNodes` now counts the tld's OWN nodes only — unchanged for every tld
  with no misfiled record.

Existing kinds are byte-unchanged. `ensureOntology`/`rebuildOntology` now REFUSE the
cross-namespace write and name the culprit.

**Client (closed same day):** `render_tool_ontology_parser.js` counted drift kinds by
name (`{missing, stale, orphaned}`) and its detail join had no `foreign` term, so a
foreign-only tld rendered a red "check failed" with an EMPTY reason — on the one panel
built to diagnose exactly this. It now renders `N misfiled`, counts any kind it does not
recognise as `N other`, and falls back to `out of sync` rather than an empty reason, so a
future kind can never blank the panel again.

Gate: `test/unit/ontology_state_foreign_tld.test.ts`.

## WC-061 — `tool_tc::change_all_timecodes`: atomic slice write, slice-indexed audit map, `lang` required

Three divergences from `class.tool_tc.php`, closed together.

1. **The write is ATOMIC per component.** PHP built the whole rewritten element set and
   issued ONE `set_data_lang($new_data, $lang)` + `save()`. The port called
   `saveComponentData` once PER ITEM — each its own transaction, each its own Time
   Machine row — so a failure part-way through a multi-paragraph transcription COMMITTED
   a half-offset document and returned a success-shaped envelope for the prefix that
   landed. Nothing on the wire distinguished it from a complete run, and every committed
   prefix is indistinguishable from a legitimate edit in the TM UI. The handler now
   issues a single `set_data` carrying the rebuilt lang slice.
2. **`options.key` and the returned map are keyed by the LANG-SLICE index**, not the
   full stored-array index (PHP `get_data_lang` → `array_values`). On a multi-lang
   component the old indexing selected and reported the WRONG element. Latent in
   practice — the client always sends `key: null` — but the returned `changesByKey`
   keys change shape for any caller that does send one.
3. **`lang` is now REQUIRED** (PHP `empty($lang)`) instead of silently defaulting to
   `lg-nolan`, and `result` is the audit map on every successful path instead of
   `false`. (The map-instead-of-`false` half is parity RESTORATION, not a divergence —
   PHP assigns and returns it unconditionally.)

One deliberate new divergence: a request that changes nothing skips the write entirely,
so it mints no Time Machine row and no falsified `modified` stamp — the same
formulation as WC-059.

Gate: `test/unit/media_timecode.test.ts` (atomicity pinned as a TM row count on a
scratch `test2` record seeded so slice index 0 ≠ array index 0).

## WC-062 — `tool_identify` client package is TS-only (2026-07-28)

ADDITIVE, no PHP counterpart: `tool_identify` is the object-identification
curator panel (`engineering/IDENTIFY_SPEC.md`), a TS-native tool that never
existed in the frozen PHP tree. Its client files therefore appear in the TS
`get_dedalo_files` census and in no oracle harvest, exactly like the tools
already ledgered as TS-only — `tool_error_report` (WC-019), the `error_reports`
widget (WC-018), and `tool_sitebuilder` + `site_builder_status` (WC-035).

Handled the same way they are: `isTsOnlyEntry` in
`test/parity/dedalo_files_differential.test.ts` filters the prefix from BOTH
sides of the set compare. **The frozen fixture is NOT edited** — a re-harvest is
impossible by definition, and rewriting a harvested oracle to accommodate new TS
files would destroy the very baseline the gate exists to hold. The predicate is
the sanctioned seam for "exists only in TS"; the fixture stays the record of
what PHP actually served.

Files: `/dedalo/tools/tool_identify/{js/*.js,css/tool_identify.css}`.

## WC-063 — TS-native core client files absent from the frozen oracle census (2026-07-29)

ADDITIVE, no PHP counterpart. Five `client/dedalo/core/` files exist only in the
TS `get_dedalo_files` census:

- `core/page/js/design.js` + `core/page/js/design-init.js` — the design-line
  toggle (classic / redesign), a TS-era client feature;
- `core/common/js/session_expiry.js` — the idle-session countdown client
  (behaviour ledgered under WC-051; the FILE is censused here);
- `core/search/js/preset_scope.js` — the search-preset scope panel (dd623
  presets, a TS-era feature);
- `core/search/js/render_semantic.js` — the semantic-search (RAG) results
  rendering, TS-native by definition.

Handled like WC-013/WC-019: `isTsNativeCoreFileEntry` in
`test/parity/dedalo_files_differential.test.ts` filters them from BOTH sides of
the set compare; the every-TS-url-resolves gate still proves they serve.

## WC-064 — `php_user` maintenance widget removed (2026-07-29)

The `php_user` area_maintenance widget administered the PHP engine's system
user — meaningless since the cutover retired that engine. Its two client files
(`widgets/php_user/js/{php_user,render_php_user}.js`) are gone from the TS
tree; the frozen oracle still censuses them. Filtered from BOTH sides
(`isPhpUserRemovalEntry`), the same pattern as the WC-030 runtime_info merge.

## WC-065 — `get_diffusion_info` node `connection_status` is `{result,msg}|null` (2026-07-29)

- **Date:** 2026-07-29 (tool_diffusion accordion showed an EMPTY "Connection
  status" value; root-caused the same day).
- **Decision:** restore the PHP OBJECT contract the client was always written
  against, and make the verdict a REAL target-database probe instead of a
  compile-time writer-registry lookup.
- **Shape before (PHP):** `dd_diffusion_api::get_diffusion_info` →
  `diffusion_utils::get_section_diffusion_nodes` (`class.diffusion_utils.php:245-289`)
  emitted **exactly** `{tipo, model, label, parents[], children[]}` — no `type`
  and no `connection_status`. The `connection_status` object itself existed on
  the SIBLING surface `get_diffusion_map` (`:945` →
  `get_connection_status :971`), where it was `{result:bool, msg:string}` for
  `type === 'sql'` and `null` for every other type (`default: // ignore`,
  `:1002`); PHP obtained the verdict by asking the (now retired) external Bun
  engine `check_database` (`database_exits :1013`). The retired external engine
  stamped readiness onto the info nodes, which is why the copied client reads
  it there.
- **Shape after (TS):** each `section_diffusion_nodes[]` entry carries the two
  ADDITIVE fields `type: string|null` (element `properties->diffusion->type`,
  resolved from the parents path) and
  `connection_status: {result: boolean, msg: string} | null`:
  - `null` whenever the element does not publish into a MariaDB database —
    the client's truthiness gate then omits the whole row (PHP's null rule);
  - otherwise a live `SELECT 1` against the resolved target database
    (`getDatabaseNameForElement`), with PHP's **verbatim** strings
    `"Database is ready."` / `"Database is NOT ready (missing or engine
    unreachable)."`.
  The probed name is the label put through `requireSqlIdentifier`, the SAME
  chokepoint the publish plan (`compile.ts:576`) and the delete map
  (`diffusion_map.ts:488`) use — `getDatabaseNameForElement` returns the raw
  institution-editable ontology label, and that helper NORMALIZES (lowercase,
  non-`[a-z0-9_]` → `_`). Probing the raw label would address a DIFFERENT
  database than the one written to (`Web MDCAT` publishes to `web_mdcat`) and
  report a healthy target as dead — the DIFF-A raw-vs-sanitized drift
  (`src/core/db/sql_identifier.ts:5-16`) on the read side. Pinned by the
  `probe addresses the SANITIZED database` test.
- **Deviations from the PHP strings/semantics (the only three):**
  1. **`socrata` also answers.** PHP answered for `'sql'` alone. Natively
     `socrata` publishes through the same MariaDB table target
     (`TABLE_FORMATS`, `src/diffusion/plan/formats.ts`), so the verdict is
     meaningful for it and suppressing it would be a lie by omission. Both
     formats come from ONE list, shared with the plan compiler's identifier
     chokepoint — never a fork.
  2. **An unresolvable target database name** — no `database`/`database_alias`
     node on the element path, OR a label that cannot sanitize to a valid
     identifier — yields the same `result:false` object plus a
     `console.warn`, where PHP would have asked the engine with an empty name.
     The compiler treats that state as a compile ERROR; an observability panel
     must render "not ready", not throw and blank the accordion.
  3. **The probe never evicts the writer's pool.** `probeTargetDatabase()`
     (the writer `open()` gate) closes and evicts the shared pool on failure;
     an admin opening a panel must not tear down a pool a live publication is
     using, so `getTargetDatabaseStatus()` is a separate non-evicting,
     non-throwing path with a 3s ceiling (Bun's default `connectionTimeout` is
     30s — a black-holed host would otherwise hang the request) and a 10s
     per-database memo so N panels cost ONE round-trip.
- **Interim TS defect this closes (never shipped to a fixture):** between the
  native-diffusion cutover and today, `src/diffusion/api/info.ts:47/:114`
  emitted the BARE STRING `'ok' | 'unavailable'` stamped from
  `WRITER_REGISTRY.has(type)` — a compile-time "do we have a writer" fact, not
  reachability. The client rendered the label (a string is truthy), a BLANK
  value (`'ok'.msg` is undefined) and css class `value fail`
  (`'ok' === true` is false) for every node including healthy ones.
- **Gate reconciliation:** **no re-harvest, and no parity gate moves.** The
  frozen fixture's only `connection_status` occurrences
  (`test/parity/fixtures/oracle_harvest/widgets_differential.json:11414/:11428/:11442`)
  belong to the `publication_api` widget's `value.diffusion_map` — the
  `get_diffusion_map` surface, NOT `get_diffusion_info` — and
  `test/parity/widgets_differential.test.ts:98-120` omits the `value` key from
  the byte compare for all widgets. No fixture is edited. The new contract is
  held mechanically by `test/unit/diffusion_connection_status.test.ts`
  (`{result,msg}|null`, never a bare string; null exactly for non-MariaDB
  formats; probe failure degrades instead of throwing; the format list is the
  compiler's; the client still reads `.result`/`.msg`) plus the compile-time
  type pin, and the memo is allowlisted with its lifecycle in
  `test/unit/module_state_tripwire.test.ts`.

## WC-066 — `get_diffusion_info` node `parents[]` carries `label` (+ `type`) (2026-07-29)

- **Date:** 2026-07-29 (same-day sibling of WC-065: the accordion panel HEADER
  rendered empty).
- **Decision:** emit the oracle's full path item instead of a two-key stub.
- **Shape before (TS):** `src/diffusion/api/info.ts` mapped the path to
  `{tipo, model}` only. The client's panel header text IS
  `diffusion_element_parent.label` (`render_tool_diffusion.js:493`) and its
  group key IS `diffusion_group_parent.label` (`:462`), so both were
  `undefined`. `ui.create_dom_element` guards its text setter with
  `else if(options.text_content)` (`ui.js:1863`), so the header silently
  rendered EMPTY rather than the string "undefined" — the blank bar above the
  panel grid. `diffusion_element_parent.type` (`:484`, feeding the `:842`
  per-format switch) was likewise undefined.
- **Shape after (TS):** `{tipo, model, label}` plus `type` **only** on
  `diffusion_element` / `diffusion_element_alias` items — byte-for-byte the
  oracle's path item (`class.diffusion_utils.php:345-352`, emitted verbatim by
  `$item->parents = $vnode->parents` at `:265`). `virtual_tree.ts:482-491`
  already built exactly this, including PHP's `?? 'unknown'` type fallback;
  only the emit dropped it, so no builder change was needed.
- **Deliberate omission:** `VirtualPathItem.realTipo` is NOT emitted. It is a
  TS-only alias-resolution memo (it replaces PHP's on-demand
  `resolve_node_with_alias` call); the oracle never had it on the wire and the
  client has no use for it. Pinned negatively by the gate.
- **Gate reconciliation:** no fixture moves — `get_diffusion_info` has no
  frozen oracle fixture (see WC-065's reconciliation for why the only
  `connection_status` occurrences belong to the `get_diffusion_map` widget
  surface). Held mechanically by `test/unit/diffusion_info_parents.test.ts`:
  the pure `toWirePathItem` mapper's exact key sets for element vs non-element
  items, `realTipo` never present, a null label staying null, and the client
  welding pins on `:493`/`:462`/`:484`.

## WC-067 — `dd_diffusion_api::follow_queue`, the admin queue stream (2026-07-29)

- **Date:** 2026-07-29.
- **Decision:** add an eighth `dd_diffusion_api` action — a global-admin SSE
  stream carrying the whole ACTIVE diffusion queue plus scheduler state, so the
  `diffusion_server_control` maintenance widget can show live publication
  progress instead of a snapshot behind a Refresh button.
- **No PHP oracle.** TS-only wire, like WC-064/065/066. The retired engine had
  no queue-wide observer at all: its `get_process_status` followed one process
  id out of an in-memory store, and the durable job queue this streams did not
  exist. There is nothing to be byte-compatible with, so nothing here is pinned
  against a fixture — the contract is the gate named below.
- **Why not the widget API.** The obvious home was a `widget_request` action on
  `diffusion_server_control`, and it cannot work:
  `dd_area_maintenance_api.ts` constructs its `ApiResult` as `{status:200, body}`
  from a `WidgetResponse` (`support.ts`), which has no `stream` slot, so
  `server.ts`'s `outcome.stream` branch can never fire for a widget action; and
  the widget transport is `data_manager.request` with `use_worker:true`, which
  never touches `response.body`. The widget therefore keeps `widget_request` for
  its mutations and opens this stream directly with
  `data_manager.request_stream` — the documented "shared/infra logic" exception
  to the widget-API policy.
- **Shape.** One frame per observable change, in the EXISTING padded SSE framing
  (`data:\n{json}` padded to 16384 then `\n\n`) so `data_manager.read_stream`
  parses it with zero client transport changes — `encodeSseChunk` and
  `encodeQueueSseChunk` share one private encoder precisely so the two wires
  cannot drift apart:

      { kind: 'diffusion_queue',            // discriminator; the client rejects
                                            // anything else, including
                                            // read_stream's synthetic first frame
        at: <epoch ms>,                     // VOLATILE — stripped from the change
                                            // signature, or a quiet queue would
                                            // emit a frame every poll
        scheduler: { running, queued, max_runners, paused, stale_after_seconds },
        jobs: [ { job_id, process_id, state, counter, total, msg,
                  cancel_requested, attempt, max_attempts } ],
        membership: '<sorted job_id join>', // the client's "set changed" test
        refresh:   <bool>,                  // membership moved since the last
                                            // frame → the client refetches the
                                            // 24h history ONCE
        reconnect?: true,                   // only on the max-lifetime frame
        errors: [] }

- **The job key set is the contract.** Nine keys, and deliberately NOT
  `mapJobToClient`'s: `spec` (the whole sanitized SQO), `checkpoint`, `result`,
  `runner`, `owner_user_id` and `errors[]` (unbounded, appended per failing
  field) are excluded. This frame is re-serialized once a second for every
  connected admin, so the narrow set is the cost bound; and because the frames
  name EVERY owner's jobs to a global admin, it is also the data-minimisation
  bound. Those fields remain available on the widget's `get_value`, which is
  read on open and on membership change — not per second.
- **Scope.** Global admin only, checked once at open, before any queue read.
  Strictly more sensitive than its owner-scoped siblings
  (`get_process_status` / `list_processes` / `cancel_process`), which is why it
  does not reuse `ownerScope()`.
- **The refusal is an SSE frame, not a JSON envelope** — a deliberate divergence
  from every other action on this class. `data_manager.request_stream` resolves
  `response.body` and discards the `Response`, so a stream client cannot observe
  a status code or a content-type; a JSON refusal yields no `data:\n…\n\n`
  framing, `read_stream` never fires `on_read`, and the caller hangs forever. A
  non-admin therefore receives one framed frame carrying
  `errors:['insufficient permissions']`, empty `jobs`, and a close. Same
  precedent as `getProcessStatusAction`'s missing-id refusal.
- **Cadence and lifetime.** 1000 ms poll (not the 500 ms diffuse cadence — the
  underlying counter moves once per `DEDALO_DIFFUSION_BATCH_RECORDS` batch, so
  polling faster only burns CPU), an UNCONDITIONAL 15 s comment heartbeat, and a
  15-minute hard lifetime whose final frame sets `reconnect:true`. The heartbeat
  is load-bearing rather than cosmetic: the only in-process signal that the peer
  is gone is the enqueue throw in `push()`, and on an idle queue the change
  signature suppresses every frame, so without it a closed browser tab would
  leave a poll loop running. The deadline bounds any leak without relying on
  Bun's `cancel()` firing on a dropped socket (untested in this codebase), and
  bounds the stale-authorization window. There is no client-settable
  `update_rate`: a queue-wide stream at the 250 ms floor `get_process_status`
  allows would be a self-inflicted DoS.
- **Reader.** The tick runs exactly one statement, `listActiveJobs`
  (`state IN ('queued','running')`, served by the partial index
  `<table>_state_idx`, jsonb projected to scalars in SQL, counts as window
  aggregates so `LIMIT 100` is an output cap and never a correctness cap). It
  must never call `listJobsForCaller` (24h/200 rows of whole jsonb columns) or
  `countPendingDiffusion` (a GIN containment COUNT over a multi-hundred-MB
  table).
- **`pg_notify` stays forward-compatibility.** `LISTEN` was evaluated and
  rejected for now: the poll is one indexed sub-millisecond statement per second
  per admin, and the runner is a separate process so the in-process fan-out
  pattern in `core/media/jobs.ts` has nothing local to observe. Recorded in
  `engineering/DIFFUSION_SPEC.md` §4.2 so it stops being re-litigated.
- **Gate reconciliation:** no fixture moves — the per-job framing bytes are
  unchanged (shared encoder, asserted by `test/unit/diffusion_sse.test.ts`), and
  `get_value`'s `mapJobToClient` shape is untouched. Held mechanically by
  `test/unit/diffusion_queue_stream_tripwire.test.ts` (key allowlist, forbidden
  fields, reader purity, query narrowness) and
  `test/unit/diffusion_queue_stream.test.ts` (quiet-when-unchanged, membership
  marker, heartbeat-on-idle, deadline, error frame, refusal frame).

### WC-067 addendum — the client consumer (2026-07-29)

Recorded with the frame because the consumer's constraints are what the frame
shape is FOR, and a future editor reading only the wire half would not see them.

- **Who reads it.** `diffusion_server_control`'s live layer
  (`client/dedalo/core/area_maintenance/widgets/diffusion_server_control/js/live_diffusion_server_control.js`),
  opened through `data_manager.request_stream` — never `widget_request`, which
  structurally cannot carry a stream (see the main entry).
- **A frame PATCHES, it never rebuilds.** The widget's own
  `refresh({destroy:true})` replaces the entire DOM; doing that once a second
  would destroy focus, the value being typed into the purge-hours input, and the
  scroll position. So a frame writes a fixed set of text nodes and one bar width.
  A ROW is rebuilt only when its structural signature changes (state /
  cancel_requested / bar shape — deliberately NOT the counter, or every frame
  would rebuild), and the 24h history is refetched only when the frame's
  `membership` marker moves. That is the whole reason `refresh` exists on the
  frame instead of the client diffing job lists itself.
- **`reconnect: true` is routine, not an error.** The 15-minute lifetime cap
  fires it; the client reopens and must not show a failure state.
- **Degradation is strictly additive.** Open failure, mid-stream drop, an
  `errors[]` frame or a non-admin refusal all leave exactly the widget that
  existed before — a static snapshot with a working Refresh button and working
  action buttons. The live layer never applies the `lock` class, never disables a
  control, and never blanks a number it can no longer refresh. A broken feed
  degrades to "not live", never to "not usable"; the state chip is the only
  place that says which.
- **The 24h `failed` count is NOT on this wire, on purpose.** The stream reads
  only ACTIVE rows, so the rollup band's failed count comes from `get_value` and
  refreshes on membership change. Its caption says "(24 h)" so a number that is
  minutes stale can never be read as a live alarm.
- **Percentages are estimates and say so.** Both the per-row bar and the band's
  aggregate derive from `total`, which is the client's enqueue-time estimate that
  the server never re-counts (`queue.ts` writes `totals.total` once). Hence the
  `(estimated)` suffix, the `Estimate exceeded` state instead of a >100% bar, and
  the aggregate being record-weighted `SUM(counter)/SUM(total)` over running jobs
  that HAVE an estimate — with the excluded count disclosed on screen rather than
  folded in silently. There is deliberately no time-remaining figure anywhere.
- Held mechanically by `test/unit/diffusion_queue_stream_tripwire.test.ts`
  (client + host + honesty + motion halves) and
  `test/unit/diffusion_queue_stream.test.ts` (the aggregate's three honesty
  rules, asserted on the pure model).

## WC-068 — `dataframe_control` does not answer `get_widget_value` (2026-07-29)

- **Date:** 2026-07-29 (found by root-causing a `[db] slow query 2309ms`
  line naming `FROM "matrix"`; diagnosed and fixed the same day).
- **What changed.** The `dataframe_control` maintenance widget's module no
  longer exports `getValue`, so `dd_area_maintenance_api / get_widget_value`
  for `model:'dataframe_control'` now takes the no-handler branch in
  `registry.ts dispatchGetWidgetValue`. Its client peer dropped the matching
  `dataframe_control.prototype.get_value` assignment, so it never sends that
  RQO. `apiActions` is UNCHANGED — `get_value`, `run_check` and `run_fix` all
  still exist on `widget_request`, and `run_check` is byte-identical to what
  the panel load used to return.
- **Why.** The widget's "value" is a whole-database integrity scan
  (`dataframeControlScan`, every `matrix%` table with a jsonb `relation`
  column, end to end). It was NOT click-gated: the client claimed the lazy
  load synchronously and awaited its own `get_value()` inside the render
  spinner, so the scan ran **once per area_maintenance page load, per admin,
  in both Map and List views** — for the cosmetic gain of not flashing a `-`
  report before a second spinner. Measured on `dedalo7_mdcat` (24 tables,
  ~36.6M rows, ~92 GB) through the real config/pool: 75.2 s / 84.5 s / 79.2 s
  per invocation, **each ending in `canceling statement due to statement
  timeout`** (`DB_STATEMENT_TIMEOUT_MS=60000`). The scan aborts on table 3 of
  24 (`matrix_activity`, 32.9M rows / 81 GB, zero matching rows) and never
  reaches `matrix_hierarchy`. The only `try/catch` in the function is inside
  the `fix` branch, so it surfaced as `{result:false}` with no partial report.
  The panel could not produce a report on this install at all.
- **Divergence from PHP.** PHP's `class.dataframe_control.php` DID implement
  `get_value()`, and the frozen oracle harvest still censuses the widget's two
  client files (`dedalo_files_differential.json`). This is a deliberate
  removal of a PHP-parity entry point, not an unported one: the SAME work is
  reachable through `widget_request` (`run_check`), which is the route the UI
  now uses exclusively.
- **Not-run is not zero.** Per *never silently narrow scope*, the panel opens
  in an explicit not-run state (`render_not_run`, the kit's `.dd_note`) rather
  than `render_report(summary, {})` — five dashes read like a completed scan
  that found nothing, which would imply a clean database the widget has not
  looked at. Scan failures now paint through `render_error`
  (`.dd_note.state_danger`) instead of silently leaving the previous state on
  screen.
- **Gate reconciliation.** No fixture moves: no oracle fixture pins a
  `get_widget_value` response for this widget, and the catalog entry in
  `widgets_differential.json` is produced by `eagerValue`, which this widget
  has never had (its `value` stays `null`). `update_ownership_tripwire`'s
  ENGINE_NATIVE map is unchanged because it classifies `apiActions` entries,
  and all three remain registered.
- **Still open (not addressed here).** The scan itself remains uncompletable
  at this scale — no per-table budget, no partial report on timeout, no
  in-flight dedupe or abort propagation, and `matrix_activity` is still
  walked in full for zero matches. Those are separate changes; this one only
  stops the scan from running when nobody asked for it.

## WC-069 — `dataframe_control` reports COVERAGE, and cannot claim a completeness it did not earn (2026-07-29)

- **Date:** 2026-07-29 (same-day follow-on to WC-068).
- **What changed.** `run_check` / `run_fix` gain three result fields:
  `complete: boolean`, `coverage: TableCoverage[]` (one entry per discovered
  table: `status` ∈ complete | exempt | no_relation_column | budget_exhausted
  | error, plus `reason`, `rows_scanned`, `last_id`, `batches`), and
  `uncovered: string[]` (the human-readable "table [status]: reason" lines).
  `msg` now opens `OK.` or `PARTIAL.` and appends the uncovered count. Existing
  fields are untouched, so a client that ignores the new ones behaves as before
  — except that it will now GET a report where it used to get `{result:false}`.
- **Why.** Before this, a batch that exceeded `DB_STATEMENT_TIMEOUT_MS` threw
  out of the whole scan: the operator got no report at all, and the 21 tables
  after the failing one were never examined with nothing saying so. The
  failure was total and silent about its own extent.
- **Budgets.** `DATAFRAME_TABLE_BUDGET_MS` 45 s, `DATAFRAME_TOTAL_BUDGET_MS`
  180 s, checked BEFORE issuing each batch so the recorded `last_id` is exactly
  the last row examined. Basis: a warm full walk of `matrix` (the largest table
  that actually holds frames) measures 18–24 s over its ~100 batches on
  dedalo7_mdcat. A per-batch `try/catch` converts a cancelled statement into a
  truncated table plus a reason, never an aborted scan.
- **The exemption is NAMED and it costs completeness.**
  `DATAFRAME_SCAN_EXEMPT_TABLES` skips `matrix_activity` and
  `matrix_activity_diffusion`, each carrying the reason the report prints
  verbatim. An exemption sets `complete:false` — the scan does not claim those
  tables are clean, only that it chose not to look. Their zero-frame property
  is EMPIRICAL (measured three ways), not structural: same 15-column jsonb
  layout, and dd560 proves the ontology cannot answer the question (hard-coded
  in `component_iri/descriptor.ts`, unreachable by recursion). An explicit
  `scopedTables` argument overrides the exemptions — naming a table is a
  deliberate choice and wins.
- **`matrix_time_machine` is NOT exempt — the old `NOT IN` was dead code.**
  That table has no `relation` column at all (its jsonb payload is `data`), so
  the relation-column discovery query never could return it. Listing it would
  document a decision nobody is making. Do not re-add it.
- **Fail closed.** `summarizeCoverage([])` returns `complete:false`: empty
  coverage means the discovery query is broken, and `uncovered.length===0`
  would otherwise make the emptiest possible scan the most confident one.
- **Client.** The INCOMPLETE banner renders ABOVE the counts (`.dd_note
  .state_warning`), not below — "Orphan frames: 0" under a partial scan means
  "none where we looked", so the caveat must reach the eye before the number.
  The `uncovered` lines render in the existing `.orphan_items` console block.
- **Measured effect (dedalo7_mdcat, 24 discovered tables).** Before: threw at
  ~80 s having examined 2 tables, no report. After: **19–47 s, 22 tables walked
  to exhaustion, 2 exempt**, `complete:false`, and it surfaces what the tool
  exists to surface — **36,219 legacy pre-migration frames, 0 orphans**,
  including `matrix_hierarchy` (51 rows), a table the old scan never reached.
- **Gate.** `test/unit/dataframe_scan_coverage_tripwire.test.ts` (registered in
  `engineering/TRIPWIRES.md` + `scripts/verify.ts` in this change, as the index
  contract requires): every exemption carries a real reason; exempt / budget /
  error each force `complete:false`; `no_relation_column` does not (structural,
  proven by the column check); empty coverage fails closed.

## WC-070 — `database_info.get_value` carries a `statistics` health verdict (2026-07-29)

- **Date:** 2026-07-29.
- **What changed.** `database_info.get_value` result gains one additive,
  engine-native key: `statistics: StatisticsHealth | null` — `{status:
  'ok'|'degraded', tables, never_analyzed, counters_reset, worst[], detail}`.
  `info` / `tables` / `indexes` are untouched, so the PHP-parity fields and the
  `widget_request` denial of `get_value` are unaffected. Computation is
  fail-soft (`null` on error): a statistics readout must never take the catalog
  panel down with it.
- **Why.** A stats-collector reset is dangerous precisely because it is SILENT.
  Found by accident on 2026-07-29 while chasing an unrelated slow query:
  dedalo7_mdcat had 38 of 43 tables with `last_analyze` AND `last_autoanalyze`
  NULL while `autovacuum` read `on`, and `n_live_tup` was fiction
  (`matrix_time_machine` 91 against a real 50,993,786). `pg_stats` still held
  rows — `pg_statistic` survived while the CUMULATIVE counters were wiped
  (crash restart or restore). Autovacuum and autoanalyze fire on
  `n_mod_since_analyze` / `n_dead_tup`, which restart from zero, so a 44 GB
  table would never be auto-maintained again and nothing anywhere said so.
- **Detection.** Two signals, thresholds in
  `summarizeStatisticsHealth` (PURE — the verdict is testable without a DB):
  never-analyzed tables at or above `STATS_SIGNIFICANT_BYTES` (64 MB; smaller
  tables are counted but not alarming — a 50-row lookup plans fine on
  defaults), and the RESET signature `reltuples >= 1000 && n_live_tup*100 <
  reltuples` — the planner believing in a big table while the counters believe
  it is empty. `detail` states the CONSEQUENCE ("they will NOT fire"), not just
  the fact, and points at the panel's own "Analyze database" button.
- **Client.** Renders FIRST in the panel (`.dd_note.state_warning` + a
  `.version_info` block listing the offenders), above the catalog dump — the
  one place this is surfaced, so it must not sit under the index listing.
  Table names go in via `textContent` (DB-sourced).
- **Measured, both branches, live.** `dedalo7_mdcat` after the 2026-07-29
  DB-wide ANALYZE: `ok`, 43 tables, 0 never-analyzed — the alarm clears when
  the problem is fixed. `dedalo7ts` untouched: `degraded`, 39 tables, **37
  never analyzed, 8 counters-reset**, worst = matrix_hierarchy (398 MB,
  n_live_tup=0 vs reltuples=185,612), matrix_relation_index (191 MB, 0 vs
  1,512,310), matrix_ontology, matrix_string_search, … So the condition is
  present across the local dev databases, not an mdcat quirk.
- **Not a tripwire.** This is a runtime health READOUT, not a mechanical
  invariant — its truth depends on the database, so it cannot live in
  `engineering/TRIPWIRES.md`. The pure verdict is pinned by
  `test/unit/database_statistics_health.test.ts` (thresholds, the reset
  signature, alarm-clears-after-ANALYZE, dedup/cap of `worst`).
