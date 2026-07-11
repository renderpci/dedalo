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
oracle-harvest golden store (`rewrite/ORACLE_HARVEST.md`). A new entry here must
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
- **Shape after (TS, only when `DEDALO_DIFFUSION_NATIVE=true`):** the key is
  ABSENT — the client then routes diffusion through the native TS actions.
  With the flag off, TS still emits the key (and the legacy route 404s — set
  the flag; see the project memory note).
- **Gate reconciliation:** `test/parity/environment_differential.test.ts`
  asserts the divergence explicitly (TS omits / PHP has) and compares the rest
  of plain_vars exactly.

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
  (CLAUDE.md hard rule) — emitting both keys is the test_info widget's own
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
