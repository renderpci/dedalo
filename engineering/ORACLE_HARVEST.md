# ORACLE HARVEST — frozen PHP golden fixtures for the parity suite (DEC-14b)

> **CUTOVER EXECUTED 2026-07-11** (owner-authorized; `rewrite/CUTOVER_RUNBOOK.md`).
> The PHP oracle is DECOMMISSIONED. This store IS the read-path
> baseline-of-record (final harvest: 76 gates / 449 interactions; credless
> proof 382 pass / 0 fail / 124 skip — MEASURED AGAINST THE LIVE `dedalo_mib_v7`
> DB), pinned to the same-instant DB snapshot
> `../private/backups/db/2026-07-11_102750.….custom.backup`. `ORACLE_MODE` now
> defaults to `fixtures`; the 23 fixture-exempt gates are RETIRED — the
> DEC-14b punch list below maps each to its surviving TS-native twin. A
> re-harvest is impossible by definition: any fixture change from here on is
> a deliberate contract edit (`engineering/wire_contract/`).
>
> **STATUS 2026-08-19 — the store is CORPUS-BOUND and is being replaced.** On
> the vendored suite DB (`scripts/test_db_setup.ts`, no install records) the
> tier measures **173 pass / 13 skip / 208 fail** (2026-08-18); 186 reds are
> corpus absence, 9 are landed changes the fixture predates, 8 were ONE real
> regression (WC-034 addendum: `search_options`), 3 environment, 2 rolling
> clock. All 76 gates carry `entity: monedaiberica`. The rule now in force
> (AGENTS.md hard rules): tests use the generic `test` TLD and build the
> situation they test. Each corpus-bound differential is replaced by a
> test-TLD twin asserting the same contract and then deleted — the same
> DEC-14b path as the 23 write-path gates and the 5 TM gates below. See
> "§ Generic-TLD replacement map" at the end of this doc.

The differential parity suite verified the TS engine against the **live PHP
oracle** (`PHP_API_BASE_URL`, creds in `../private/.env`). That oracle was
decommission-bound: the day PHP stops answering, every oracle-gated assertion
would become an explicit skip and the verification story would end (DEC-14,
`audits/2026-07_foundation/general/DECISIONS.md`). The harvest converts
the differential suite into a **fixture suite on a flag**: every read-path
PHP request/response pair is frozen as a versioned golden fixture while the
oracle is still alive, and the suite can replay them forever after.

Everything lives in three places:

| Piece | Path |
|---|---|
| Record/replay seam + gate classification | `test/parity/oracle_fixtures.ts` (used by `test/parity/php_client.ts`) |
| Harvest orchestrator | `scripts/oracle_harvest.ts` |
| The golden store (one JSON per gate) | `test/parity/fixtures/oracle_harvest/` |

## The three oracle modes (`ORACLE_MODE` env)

| Mode | Behavior |
|---|---|
| `live` (default, or unset) | Unchanged: `PhpApiClient` does live HTTP to PHP. The parity baseline (LEDGER.md) is measured in this mode. |
| `record` | Live HTTP **plus** every (request → response) pair is appended to the gate's store log. Only meaningful under `scripts/oracle_harvest.ts`, which sets `ORACLE_HARVEST_GATE` and runs ONE gate per process (bun test never fires exit hooks, hence the append-log design). Never set this by hand on the full suite. |
| `fixtures` | **No network, no credentials.** `PhpApiClient.call`/`callRaw` serve the recorded response matched by canonical request hash and throw loudly on a miss. Write-path gates skip (below). |

The suite trusts `hasPhpCredentials()` as its oracle-presence probe; under
`ORACLE_MODE=fixtures` that probe becomes "does the harvested store exist",
so the read-path differentials run credential-less. The canary
(`oracle_canary.test.ts`) prints exactly what a fixture run does and does not
verify — read-path parity against the **frozen** capture, never live PHP.

## How to (re-)harvest

Requires the live oracle (creds in `../private/.env`, PHP server up):

```sh
bun run scripts/oracle_harvest.ts             # all read-path gates (~5 min)
bun run scripts/oracle_harvest.ts --gate read_differential.test.ts   # one gate
bun run scripts/oracle_harvest.ts --list      # print the manifest + exempt lists
```

The script refuses to harvest fixture-exempt (write-path) gates, preflights
the oracle, runs each gate with `ORACLE_MODE=record`, and wraps each gate's
log into `test/parity/fixtures/oracle_harvest/<gate>.json` with provenance
meta (extending the batch-1 pattern of `scripts/capture_fixture.ts` /
`test/integration/fixtures/diffusion_old_engine_cells.json`):

- `captured_at`, `capture_commit` — when/what code did the freezing;
- `oracle_base_url_sha256` — detects a re-harvest against a *different*
  oracle instance (that is a new baseline, not a refresh); the URL itself
  stays out of the repo;
- `entity`, `interaction_count`;
- `drift_policy` — see below.

Secrets never land in the store: login RQOs are redacted
(`__ORACLE_USER__`/`__ORACLE_AUTH__`) before hashing AND storage — which is
also what makes fixture-mode lookups succeed on machines with no credentials
— and response `csrf_token` values are replaced with `__FIXTURE_CSRF__`.
Known and accepted: PHP response *payloads* may carry the login user's NAME
(e.g. `page_globals.username`) — that is shared-DB record data both engines
emit and diff, so it must stay verbatim; the password and the oracle URL are
verified absent (grep the store before committing a re-harvest).

## How to run the suite from fixtures

```sh
ORACLE_MODE=fixtures PHP_API_BASE_URL= PHP_API_USERNAME= PHP_API_PASSWORD= \
  bun test test/parity/
```

(The blanked vars are optional — fixture mode never touches them — but prove
the point on a credential-less machine.) Requirements that do NOT go away in
fixture mode: the TS side still runs for real, so the **shared Postgres and
the repo's normal `../private/.env` TS config (ENTITY, DB_*) are still
needed**. Only the PHP HTTP oracle is replaced.

## Drift policy

The fixtures freeze responses over the **live, mutable shared DB** (audit
S2-43's fixture-rot channel). The TS side keeps reading that DB live, so:

- A fixture-mode red with **no engine change** means the shared data moved
  after the harvest. Adjudicate: if the diff is data-side only, re-harvest
  that gate (`--gate <name>`) in the same change that adjudicates the red.
  Never "fix" the engine to match rotten data, and never re-harvest to bury
  an engine regression — the two-sided rule of the per-fixture
  `drift_policy` string.
- A **deliberate wire divergence** (a `engineering/wire_contract/` entry) makes
  the frozen PHP shape the *fossil* side, exactly like the live oracle: the
  gates already encode adopted divergences (e.g. WC-001 `entries:[]`) by
  transforming the PHP response before diffing, so fixtures stay verbatim
  captures. New divergences must reconcile their gates AND state whether a
  re-harvest is needed, in the same WIRE_CONTRACT entry.
- While PHP is alive, **live mode remains the baseline of record**
  (LEDGER.md); fixture mode is the rehearsed fallback. Re-harvest whenever
  the shared DB is deliberately reshaped (demo reseed, ontology update).

## Fixture-exempt gates (cannot be served from fixtures)

Two disjoint categories, both enumerated in `test/parity/oracle_fixtures.ts`
(the single source of truth — the harvest script and this doc both read from
it; run `--list` for the live view):

**`FIXTURE_EXEMPT_GATES` — 23 live-only gates**, two reasons:

- *[write], 20 gates* — their PHP-side round-trips are real mutations
  (create/save/delete/tool + maintenance-widget actions), so replaying a
  frozen response would assert nothing about a write that never happened:
  activity_log, calculation_widget, create, dataframe_roundtrip, delete_data,
  delete, delete_inverse_refs, delete_multi, duplicate,
  generate_virtual_section, indexation_grid_media_av (classified 2026-07-10:
  seeds an av scratch chain create→assert→revert; had shipped unclassified
  and replay-red), observer, ontology_delete, ontology_parser,
  portal_drag_capture_replay, portal_edit_writes, save_multilang,
  tm_wallclock, tool_ontology, widget_request.
- *[scratch-read], 3 gates* — they SEED scratch records per run (fresh
  section_ids) and read them back through PHP, so their request hashes can
  never match a frozen store (proven by fixture-mode lookup misses,
  2026-07-07): has_dataframe_literal, info_widget, iri_dataframe.

All 23 gate on `hasLivePhpOracle()` and report explicit SKIPS under
`ORACLE_MODE=fixtures`. One PARTIAL exemption inside a harvested gate:
`widgets_differential > sequences_status` byte-compares live Postgres
sequence counters that other suite tests legitimately bump, so that single
test is `test.if(hasLivePhpOracle())` while the rest of the gate replays from
fixtures.

**`NO_ORACLE_GATES` — 9 TS+DB-only tests** in the parity directory with no
`PhpApiClient` traffic (some use `hasPhpCredentials()` purely as a
dev-environment probe). Mode-independent; they keep running in fixture mode:

import_files_filename, media_files_info, permissions, projects_filter,
publication_toggle_doubling, regenerate, tools_register, ts_mutations,
ts_mutations_hardening.

`oracle_canary.test.ts` is special-cased: it probes oracle liveness itself,
so it is never harvested; in fixture mode it asserts the store is present.

## Cutover-day switch procedure

1. **Freeze point**: stop PHP-side writes; run the full live parity suite one
   last time and record the result in LEDGER.md.
2. **Final harvest**: `bun run scripts/oracle_harvest.ts` (all green or
   ledgered), commit the store.
3. **Snapshot the shared DB at the same instant** (the WS-E backup artifact).
   The fixtures and this snapshot are a *pinned pair*: fixture-mode parity is
   only meaningful against DB state compatible with the harvest.
4. **Flip the parity job** to `ORACLE_MODE=fixtures` (and drop
   `ORACLE_REQUIRED=1` in favor of the fixture-presence canary). Local runs:
   the command above.
5. **Write-path coverage does not survive the oracle** — the 23 exempt gates
   retire with PHP. Their contracts must be re-expressed as TS-native
   integration tests (scratch-record round-trips asserting on the DB, not on
   PHP responses) — tracked as the DEC-14b residual in
   `audits/2026-07_foundation/general/REMEDIATION.md`.
6. After decommissioning, a "re-harvest" is impossible by definition: any
   adjudicated fixture change from then on is a deliberate contract edit and
   belongs in `engineering/wire_contract/`.

## ADDENDUM 2026-08-14 — the five TM differentials are RETIRED (unrunnable, not merely stale)

`tm_read_differential`, `tm_bare_list_differential`,
`tm_component_history_differential`, `tm_component_value_differential` and
`tm_relation_filter_differential` are retired into TS-native twins. They are not
"red pending adjudication": they are **structurally unrunnable** in any current
environment, and were already failing 7–10 assertions on a clean tree before the
Time Machine unification touched anything.

WHY, precisely — the fixtures and the suite database drifted apart:

- the TM fixtures were harvested 2026-07-11 against a **live shared DB**. Their
  rows exist ONLY in `dedalo7_mdcat` (`matrix_id` 51071497/96/95/94, caller
  `rsc1242`/578) — verified absent from every other local database;
- ~~the pinned `private/backups/db/2026-07-11_102750.….custom.backup` is GONE~~
  **CORRECTED 2026-08-19: it is NOT gone.** It is on disk at
  `../private/backups/db/2026-07-11_102750.dedalo_mib_v7.…custom.backup`
  (382 MB, `dbname: dedalo_mib_v7`, archived 2026-07-11 10:27:50 — the harvest
  instant), and the harvest DB `dedalo_mib_v7` is itself still live locally.
  This bullet was wrong when written; the retirement below stands on the
  remaining three bullets alone, which are sufficient — and on the stronger
  rule adopted 2026-08-19 that a corpus-bound gate is the wrong shape
  regardless of whether its corpus can be restored;
- `test/preload/test_database.ts` hard-points the WHOLE SUITE at `<app db>_test`
  and deliberately refuses to fall back to a real database (written after a gate
  deleted `test218` out of a live install);
- `scripts/test_db_setup.ts` builds that database "from files vendored in this
  repo, **never by copying a live database**" — install seed + canonical test3 +
  the numisdata definitions.

A synthetic install database can never contain harvested rows from a live one.
Per each fixture's own `drift_policy` string this adjudicates as DATA-side, not
an engine regression: the engine was never consulted, the rows are absent.

Replacement TS-native twins (all credless, all green):

| Retired gate | Surviving contract | Twin |
|---|---|---|
| tm_read_differential | envelope extras (matrix_id/timestamp/caller/user), per-cell item shapes, int addresses | `test/unit/tm_emit_row_context_native.test.ts` |
| tm_bare_list_differential | dd15 default column set + structure-context shape | `test/unit/tm_emit_row_context_native.test.ts` (context half) + `test/unit/tm_sort_policy.test.ts` |
| tm_component_history_differential | per-component history rows, newest-first, select-family label resolution | `test/unit/tm_emit_row_context_native.test.ts` (history surface) |
| tm_component_value_differential | the snapshot VALUE a cell resolves to, incl. list rendering | `test/unit/tm_emit_hooks_native.test.ts` (truncation, tag resolution, DOS-01 cap, the audit-lang rule) |
| tm_relation_filter_differential | the dd578 relation-filter surface behaviour | `test/unit/tm_filter.test.ts` (the conformer, exhaustively) |

Contract changes adopted at the same time — the reason the frozen PHP bytes are
now the fossil rather than the target — are ledgered in
`WC-2026-08-14-tm-cells-obey-list-emit-policy` and
`WC-2026-08-14-tm-ddo-mode-retired`.

## DEC-14b re-expression punch list (audited 2026-07-10)

Per-gate audit of what each of the 23 exempt gates asserts vs existing
TS-native coverage. The `expect(ts).toEqual(php)` halves and every
`(!) PHP LIVE DEFECT` pin die with the oracle and need NO replacement; the
rows below are the TS-side contracts that must survive. Update statuses in
place as replacements land.

**Already safe (no action):** `ontology_parser` (→ `test/unit/ontology_parser.test.ts`),
`save_multilang` (→ `test/unit/save_multilang_siblings.test.ts`), the parser
core of `tool_ontology`; `tm_wallclock`'s single-engine assertion → DONE
2026-07-10 (`test/unit/tm_wallclock.test.ts`).

**P0 — fully uncovered (in progress 2026-07-10):**

| Gate | Surviving contract | Status |
|---|---|---|
| observer | rsc387 save → hierarchy93 mirror append + relation_search ancestor index; delete restores term bag; DEFAULT branch no-op | DONE 2026-07-11 → `test/unit/observer_native.test.ts` (oracle-cross-checked) |
| activity_log | dd542 row anatomy on save (WHAT=5) + delete (WHAT=4): dd543 user, dd546 tipo, dd547 instant, dd551 payload | DONE 2026-07-10 → `test/unit/activity_log_native.test.ts` (oracle-cross-checked before landing) |
| generate_virtual_section | dd_ontology node structure + `<tld>0/1`/`<tld>0/2` records from a hierarchy1 registry record | DONE 2026-07-10 → `test/unit/hierarchy_provision_native.test.ts` (also fixed the hierarchy53/58 write-back no-op) |
| ontology_delete | registry delete uninstalls the TLD: nodes=0 + registry row gone | DONE 2026-07-10 → same file (PHP steps 2&4 divergence flagged in LEDGER) |
| delete_multi | SQO filter_by_locators multi-delete: exact rows gone, result ids, per-record TM snapshot | DONE 2026-07-10 → `test/unit/delete_multi_native.test.ts` |
| indexation_grid_media_av | media-thumb + AV 11-column grid projection over seeded scratch (golden must be captured while PHP lives) | DONE 2026-07-11 → `test/unit/indexation_grid_av_native.test.ts` + goldens captured from the live oracle (`test/unit/fixtures/indexation_grid_native/`) |

**P1 — a primitive is covered, the specific contract is not:**
- DONE 2026-07-10/11: create → `create_record_audit.test.ts`; duplicate core
  → `duplicate_record_native.test.ts`; delete TM snapshot →
  `delete_record_tm_native.test.ts`; delete_data end-state + −60s pair →
  `delete_data_native.test.ts`; delete_inverse_refs selective strip →
  `delete_inverse_refs_native.test.ts` (all oracle-cross-checked live before
  landing).
- DONE 2026-07-11: dataframe_roundtrip id_key stamping →
  `dataframe_idkey_native.test.ts`; portal_edit_writes →
  `portal_edit_writes_native.test.ts` (20 tests incl. the four
  delete_locator match-semantics cases); portal_drag_capture_replay →
  `portal_drag_capture_native.test.ts` (replays the client capture fixture
  natively). All three source differentials re-verified live.
- DONE 2026-07-11: the three [scratch-read] gates → `test/unit/
  has_dataframe_literal_native.test.ts`, `iri_dataframe_native.test.ts`,
  `info_widget_native.test.ts` + goldens under `test/unit/fixtures/*_native/`
  (43 live TS===PHP checks at capture; `_provenance` stamped in each JSON;
  recapture script method noted in headers). NOTE for the differential's
  owner: test3/27 now stores a value — its "placeholder" coverage is
  vacuous; the native gate pins a true empty-record placeholder instead.
- DONE 2026-07-11: widget_request per-widget computes →
  `widget_request_native.test.ts` (dispatch gates, counters_status datalist,
  database_info catalog, modify_counter fix/reset on scratch,
  rebuild_user_stats dd1521 anatomy on synthetic UID 424252);
  calculation_widget → `calculation_widget_native.test.ts` (DEC-06
  store-without-compute + the empty-input `total:0` golden). Same-day gate
  reconciliations: calculation_widget_differential adopted WC-026
  (normalizeWidgetEntryKeys on the PHP side) and
  widget_request_differential's user-stats byte-compare adopted the
  ledgered dd1530 virtual-seconds `time` (0fae11e) — its only remaining red
  is the ledgered register_tools dd1324 data drift (owner decision).

**Punch list state 2026-07-11: ALL P0 + P1 + P2 rows re-expressed.** The
write-path suite now survives PHP decommission; the exempt differentials
stay as live cross-checks until cutover, then retire per step 5 above.

Cross-cutting: P0/P1 replacements need goldens derived from the
differentials' pinned shapes or the PHP source — never from whatever the TS
engine happens to emit (the two-sided drift rule).

## Post-cutover subsystems: external record services (2026-08-05/06)

A subsystem built AFTER the freeze has no differential to retire and no
fixture to reconcile — but it still owes the same thing every retired
differential owed: a TS-native gate holding the contract. `src/external/`
(`engineering/EXTERNAL_SPEC.md`) is the first such subsystem, and its twin map
is listed here so the punch list stays the one place to ask "what holds this
contract now that the oracle is gone".

**Why NO fixture is affected, verified rather than assumed:** the frozen store
holds no data item for ANY `component_external` tipo, `zenon1` has zero rows in
every matrix table, and `matrix_time_machine` holds zero rows for every
`component_external` tipo. There is no PHP shape in the store for these gates to
diff against, so every entry below is a native contract, not a re-expression.

| Contract | TS-native twin |
|---|---|
| payload → entries: unwrap, id-matching row pick, path extraction, named formats, the two ceilings | `test/unit/external_fields_map_native.test.ts` |
| the nine-step outbound door: order, classification, retry policy, breaker transitions, pin + cap | `test/unit/external_transport_native.test.ts` |
| row cache key, coalescing, soft-TTL stale serving, per-page field union | `test/unit/external_cache_native.test.ts` |
| every degradation state end to end, identical empty shape in `edit`/`list`/`tm` | `test/unit/external_degradation_native.test.ts` |
| the derived emission item (literal shape, `lg-nolan`, verbatim zero-padded `section_id`) | `test/unit/external_emit_native.test.ts` |
| multi-item `request_config`: ddo flattening, per-locator filtering, capability negotiation | `test/unit/external_multi_source_native.test.ts`, `test/unit/external_request_config_native.test.ts` |
| the `zenon` adapter's request bytes, `lgn` fallback, id codec, both formats | `test/unit/external_zenon_native.test.ts` |

The nine `external_*_tripwire` invariant gates are indexed in
`engineering/TRIPWIRES.md`, not here — this table is contract coverage, that one
is invariant enforcement.

## § Generic-TLD replacement map (opened 2026-08-19)

The rule (AGENTS.md hard rules): a test uses the generic `test` TLD and BUILDS
the situation it tests. Every corpus-bound gate in this store is replaced by a
test-TLD twin proving the SAME contract, then deleted together with its
`oracle_harvest/<gate>.json`. Rows are appended as twins land — this table is
the ledger of record for the migration; `rewrite/LEDGER.md` carries the
measured counts between batches.

Baseline 2026-08-18 (`ORACLE_MODE=fixtures bun test test/parity/`, suite DB):
173 pass / 13 skip / 208 fail across 82 files; 51 files corpus-bound (class A).

| Retired gate | Contract it proved | Twin | Landed |
|---|---|---|---|
| `test/parity/portal_differential.test.ts` | Portal subdatum in LIST mode through readSectionRows: for a record whose portal holds MORE locators than the list cell page, the portal item's entries are the paginated locator page (LIST limit chain: ddo-declared limit → the component's effective list config / section_list-substituted limit → PORTAL_LIST_LIMIT=1; autocomplete_hi shows all) and pagination = {total: FULL locator count, limit}; the child items (declared child ddo at the target section) come in locator order, one per paged locator, with identity (section_tipo, section_id of the target), entries = the target's stored value (WC-001: [] when empty, never null), and the subdatum stamps row_section_id = the OUTER record and parent_tipo = the portal tipo (section-read re-stamp — differs from get_data's target anchor). | `test/unit/portal_list_cell_pagination_native.test.ts` (situation `zzpl`) | 2026-08-19 |
| `test/parity/relation_list_differential.test.ts` | get_relation_list (the Referencias panel): every record pointing AT the host (inverse index scan over 'all' owning sections, or the sqo.section_tipo-narrowed set) as a heterogeneous grid — context = per referencing section, on FIRST sight, an 'id' column entry then one entry per grid column (section_map relation_list scope term, else the section's legacy relation_list node relations) with component_label = the column's term in the request lang; data = per hit an id cell (no value key) + one cell per column whose `value` is the component's FLAT display string (string family lang-sliced joined ' \| ', relation models via datalist label resolution, dataframe frames folded), absent when null; sqo.limit/offset page the HITS, limit 0 = all; source.mode !== 'edit' returns the empty shell {context:[],data:[]}; host read permission gate. | `test/unit/relation_list_grid_native.test.ts` (situation `zzrl`) | 2026-08-19 |
| `test/parity/tool_export_dataframe_differential.test.ts` | tool_export get_export_grid with a RELATION main (autocomplete/portal stored model → the fan-out path, NOT the WC-008 compact branch) carrying component_dataframe children: frames found on the OWNER record's relation column under the frame tipo, paired to each main locator by (type dd490, main_component_tipo, id_key = the main locator's stored id); grid_value default/rows/columns and value/default all mint a frame column and flow the frame VALUE into the framed record's cells; a frameless record still gets the column (mid-stream mint, empty cell); `unresolved` never contains 'component_dataframe' for this shape; columns/rows/end/meta.total consistent across formats. dedalo_raw (WC-2026-08-09): the frame slot is its OWN column `${section}_${frame}` after the main, every cell a bare {"dedalo_data": <array>} of dd490 locators with from_component_tipo=frame. A DECLARED dataframe path step stays LOUD: unresolved contains 'component_dataframe:declared-path'. | `test/unit/tool_export_relation_dataframe_fanout_native.test.ts` (situation `zzxd`) | 2026-08-19 |

Blocked rows (a contract that could NOT be re-expressed generically) are
recorded here with the reason inline, never dropped.

Batch 1 (2026-08-19) — rows NOT ACCEPTED (twin refuted twice in review; the
in-tree state at the time of writing is: twin file present, old gate + fixture
staged as deleted — the row above is withheld until a review pass accepts it):

- `test/parity/portal_edit_subdatum_differential.test.ts` — twin
  `test/unit/portal_edit_subdatum_native.test.ts` (situation `zzpe`).
  Reason (verbatim): "Rebuild completed; all three contract-fidelity gaps and
  the surviving lang mutation are fixed and mutation-verified." Refutations on
  record: (1) CONTRACT-FIDELITY — the context surface kept 7 of the old gate's
  10 byte-compared keys (`lang`, `label`, `translatable` dropped; a
  `translatable: false` mutation at `structure_context.ts:417` stayed green);
  (2) MUTATION — get_data effective-limit CONFIG chain (`read.ts:1101-1111`)
  never exercised because every rqo sent a numeric `sqo.limit` (fix: a
  `limit: null` read asserting the LAST config item's limit wins).
- `test/parity/section_elements_context_differential.test.ts` — twin
  `test/unit/section_elements_context_native.test.ts` (situation `zzsec`).
  Reason (verbatim): "Contract expressible generically; the twin landed and the
  old gate + fixture are deleted (both staged as D)." Refutations on record:
  (1) CONTRACT-FIDELITY — `search_operators_info` + `search_options_title`
  gated behind a hand-written `OPERATORS_BY_MODEL` lookup with an
  `if (pairs === undefined) continue` escape hatch; seven panel models
  (component_section_id, iri, json, select_lang, filter_master,
  filter_records, relation_model) asserted nowhere — deleting
  `[',', 'sequence']` from SECTION_ID_OPERATORS stayed green; ontology1 /
  hierarchy1 target-source coverage delegated to a currently-red gate;
  (2) MUTATION — 6/72 survivors, two real: `getModelByTipo` canonicalization
  at `section_elements_context.ts:93` and `buildSearchOptionsTitle(core.model)`
  at `structure_context.ts:1352` — no legacy-model component (autocomplete_hi /
  html_text) in the built situations (fix: add one under the grouper and pin
  its target_section_tipo + title/operators keyed by entry.model).

## ADDENDUM 2026-08-19 — the store is REPLAYED UNDER THE `test` TLD (no re-harvest)

**The store bytes are UNCHANGED and stay unchanged.** Since the generic-TLD
migration's phase 4 a parity gate may be written entirely in the generic `test`
TLD and still be compared against the install-term interaction PHP answered in
2026-07, because the seam translates — never the fixture. This is the WC-001
pattern (a gate-side transform, the frozen file untouched), applied to ontology
identity instead of to a field shape, and it is the SECOND path out of
corpus-boundness, beside the "retire and re-express as a TS-native twin" path
of § Generic-TLD replacement map above:

| Path | When | Result |
|---|---|---|
| Replay under the `test` TLD (this addendum) | The contract IS the PHP wire shape, and the situation can be built from the committed clone + corpus. | The gate SURVIVES with its fixture; only its terms change. |
| Retire → TS-native twin (§ map above) | The contract is expressible without an oracle, or the fixture cannot answer it at all (write path, live-only). | The gate and its `<gate>.json` are DELETED. |

**How the replay works** (contract: `WC-2026-08-19-test-tld-replay`):

- `unmapRqo` (`test/parity/normalize.ts`, wired into `lookupInteraction` in
  `test/parity/oracle_fixtures.ts`) rewrites a test-TLD RQO back into install
  terms BEFORE `hashRequest`, so the gate's request finds the frozen
  interaction. A miss still throws, and now names the unmapped request.
- `adoptTipoIdMap(frozenBody, gate)` reads the frozen RESPONSE in test-TLD
  terms through the committed, append-only, bijective
  `src/core/test_data/test_tld_tipo_map.json` (+ `test_corpus/id_map.json` for
  record addresses), and REFUSES rather than guesses: a TS-shaped body, a
  surviving install token, a disagreement between the two maps. Every caller
  asserts `matched === true` plus a `rewrites` floor.
- The records come from `ensureTestCorpus` — owned by the gate, dropped after
  it (records are a situation, not a backdrop).

**No re-harvest, and none is possible.** Nothing in
`test/parity/fixtures/oracle_harvest/` is edited by this change; the four
pilots below replay the SAME interaction hashes they always did.

**Pilots (2026-08-19).** `read_differential`, `context_differential`,
`component_publication_search_differential` and
`relation_index_get_data_differential` are ALL green on a suite database holding
NO install data (the fourth went green with the corpus fixes below).

Two REDUCTIONS were needed beyond the transform, both declared and enforced:

- `CORPUS_SCALE_FIELDS` (`test/parity/normalize.ts`) — a value that counts rows
  the corpus deliberately does not hold (`relation_index`'s unfiltered
  `pagination.total` over the install). `stripCorpusScaleFields` REFUSES a
  declared path that is not present, so a projection can never silently stop
  projecting. A FILTERED total stays verbatim.
- `UNCLONED_TOKENS` — an install token with no twin because the clone closure
  stops at the section root (`context_differential`'s `parent_grouper`, the
  install AREA node above the cloned section). Tolerated ONLY when declared,
  REFUSED when the declared token is absent, and the declaring gate owes an
  explicit assertion about the field (it asserts both sides of the seam).

**Corpus gaps this exposed** — ALL THREE CLOSED 2026-08-19 (same day), kept
here because the rules they produced are what phase 5 must build on:

1. **Inverse edges ARE reconstructed now.** `relation_index_get_data_differential`
   reads an inverse index: the frozen entries state that `rsc205/37,42,44,69,74`
   point at the term through `rsc387`, and `derive_test_corpus.ts` used to
   rebuild a record only from ITS OWN read projections, so those pointer
   locators were absent and the index resolved 0 items. The deriver now reads
   the computed inverse page a `component_relation_index` item reveals
   (`{type, section_tipo, section_id, from_component_top_tipo}` — the exact
   discriminator: `parseInverseEntry` is the only writer of that key, and a
   STORED item always carries its own `id`) and materializes the locator on the
   POINTING record, where the `matrix_*_relation_index_sync` trigger indexes it
   exactly as a real save would. Six edges, audited per record as
   `inverse_edges[]` (`origin: 'inverse_edge'` + the gate/record/component that
   stated it); a record that exists only because of one is `edge_only: true`;
   an edge whose pointing record has no ontology clone, whose component does
   not store, or whose target is unmappable is REFUSED (`inverse_edge_*` in
   `refused.json`), never approximated. The gate is GREEN (both cases). Its
   `pagination.total` strip STAYS declared: the corpus holds 5 pointing
   records, the install had 1 647 — a corpus that held all of them would be the
   install.
2. **A reconstructed record's value may be a LIST PROJECTION** (already
   truncated), so reading it back through the list pipeline truncates twice.
   `read_differential` therefore compares VALUES on raw records only
   (`reconstructed: false`), and identity/order over the whole sequence. The
   rule is now WHERE A SWEEPER SEES IT: every record declares
   `component_sources: {tipo: 'raw'|'edit'|'list'}`, the corpus file header
   states the rule, and the `dedalo-ts-testing` skill carries it. Census
   2026-08-19 over 1 018 written (record, component) pairs: **16 raw · 170
   edit · 832 list projections**; the deriver's richest-source preference is
   exercised in both directions (10 upgrades, 88 poorer sources rejected).
3. **`dd128` user records carry no `relation` column**, so no corpus principal
   holds any grant and any ACL-shaped assertion is vacuous on the corpus alone.
   The door for that situation is `test/helpers/acl_identity_fixture.ts`, and
   it was RED for ONE reason: its `dd1324/21` tool-registry pin is
   `tool_import_marc21` on this suite DB (`tool_export` is 22), so the fixture
   THREW before writing anything — which is also why `getSectionPermissions`
   read 0: there was no profile to read. The id is now DERIVED by name through
   the registry's own door (`getActiveToolMetaBySectionId`), refusing a
   non-unique or `always_active` match. The fixture also grants the
   per-COMPONENT dd774 rows it always implied (`test3_test92`): `ddoIsAuthorized`
   keys the matrix by `${section}_${component}` and has no global-admin bypass,
   so section grants alone served the empty shell to BOTH identities. All of it
   is verified through the real doors in `acl_identity_fixture_native`
   (`getSectionPermissions`, `ddoIsAuthorized` both ways, `getUserTools`).
