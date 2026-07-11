# ORACLE HARVEST — frozen PHP golden fixtures for the parity suite (DEC-14b)

> **CUTOVER EXECUTED 2026-07-11** (owner-authorized; `rewrite/CUTOVER_RUNBOOK.md`).
> The PHP oracle is DECOMMISSIONED. This store IS the read-path
> baseline-of-record (final harvest: 76 gates / 449 interactions; credless
> proof 382 pass / 0 fail / 124 skip), pinned to the same-instant DB snapshot
> `private/backups/db/2026-07-11_102750.….custom.backup`. `ORACLE_MODE` now
> defaults to `fixtures`; the 23 fixture-exempt gates are RETIRED — the
> DEC-14b punch list below maps each to its surviving TS-native twin. A
> re-harvest is impossible by definition: any fixture change from here on is
> a deliberate contract edit (`engineering/WIRE_CONTRACT.md`).

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
- A **deliberate wire divergence** (a `engineering/WIRE_CONTRACT.md` entry) makes
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
   belongs in `engineering/WIRE_CONTRACT.md`.

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
