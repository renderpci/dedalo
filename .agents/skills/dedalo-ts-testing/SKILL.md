---
name: dedalo-ts-testing
description: How to test the Dédalo v7 TypeScript/Bun rewrite oracle-honestly — the two tiers (test/unit/ pure+DB, test/parity/ differential replaying the FROZEN 2026-07-11 fixture store — the live PHP oracle is decommissioned), the generic-`test`-TLD law (a test BUILDS its situation, never reads a specific install's numisdata/oh/tch/rsc records), the DEDICATED SUITE DATABASE and its `dedalo_test_marker` (every test-data writer refuses without it), the green-suite trap, the eleven tripwire tests that are the invariant-enforcement backbone, and scratch-write hygiene. Use when a test-data writer REFUSES ('no dedalo_test_marker row'), when building the suite DB with bun run test:db:setup, when writing or debugging any *.test.ts or *_differential.test.ts, when a test fails only in full-suite/parallel order, when oracle-gating with describe.if(hasPhpCredentials()) / test.if(...), running ORACLE_MODE=fixtures/record harvest (scripts/oracle_harvest.ts), asking "is this test actually asserting anything or silently green", adding or trusting a tripwire, chasing a mock.module leak across files ("mock.restore doesn't revert"), a wiped session store, or a deliberate TS↔PHP wire divergence (WC-001, entries:[]). Symbols: hasPhpCredentials (test/parity/php_client.ts:178), oracleMode/ORACLE_MODE (test/parity/oracle_fixtures.ts), oracle_canary.test.ts, DEDALO_SESSION_DB_PATH. Sibling: dedalo-parity-debugging for the differential probe/browser workflow. Authoritative: rewrite/LEDGER.md (tripwire index + measured state), engineering/ORACLE_HARVEST.md, engineering/wire_contract/.
---

# Dédalo v7 testing (TypeScript rewrite)

The rewrite in `src/` is verified against the **live PHP server on the same Postgres** as the oracle. The one law of this suite: **a test that cannot fail proves nothing.** The 2026-07 foundation audit found the opposite everywhere — every invariant guarded only by docs/memory had been violated in practice; every TRIPWIRED boundary held. So: correctness lives in tests that go RED when the code is wrong, and oracle absence is LOUD, never a silent green.

Run: `bun test`. Current measured gate counts + subsystem homes live in **rewrite/LEDGER.md** — read that for "where are we", not this skill. This skill is how to write a test that earns its keep.

## Two tiers

- **`test/unit/`** — pure logic + DB-touching units. No PHP. Includes the tripwires (below).
- **`test/parity/`** — `*_differential.test.ts` gates that diff a TS response against the live PHP response. **This is the correctness bar.** The differential workflow itself — in-process probes, driving the real PHP client via Chrome DevTools, scratch twins — is the **`dedalo-parity-debugging`** skill; read it before writing a new differential.

## THE GREEN-SUITE TRAP (the audit's central testing finding)

A differential test with no oracle to compare against passes **trivially**. On any machine without PHP creds, an ungated differential is a silent no-op that reads as green — false confidence, the exact failure mode the audit flagged (S2-40).

RULE: gate **every** oracle-touching test at collection time:

```ts
import { describe, test } from 'bun:test';
import { hasPhpCredentials } from './php_client.ts'; // :178
describe.if(hasPhpCredentials())('my differential', () => { /* … */ });
// or per-case: test.if(hasPhpCredentials())('…', async () => { … });
```

`hasPhpCredentials()` (`test/parity/php_client.ts:178`) is true when a live PHP server (base URL + dev creds) OR — under `ORACLE_MODE=fixtures` — the harvested golden store is available. When false, bun reports an explicit **SKIP** instead of a fake pass. 62 parity gates already use this pattern; copy it.

**The canary:** `test/parity/oracle_canary.test.ts` is deliberately NOT gated — it exists to FAIL when the oracle is absent, so a credless full-suite run cannot look clean. It stands down only for `ORACLE_OPTIONAL=1` (dev acknowledges no oracle) and is forced back on by `ORACLE_REQUIRED=1` (the CI parity job). Never gate this file; never `git`-commit a run that silenced it by accident.

**Never write a differential that could pass on an empty/degenerate response.** Assert on real emitted structure; a diff of `[]` vs `[]` is the trap wearing a costume.

## Fixture mode (DEC-14b) — credless replay

`ORACLE_MODE=fixtures` runs read-path differentials with **no network, no credentials**, replaying the 76 harvested golden gates (449 interactions) from `test/parity/fixtures/oracle_harvest/` (one JSON per gate), matched by canonical request hash — a **miss THROWS loudly**, it never falls through to green. Re-harvest with `bun run scripts/oracle_harvest.ts` (sets `ORACLE_HARVEST_GATE`, one gate per process — bun fires no exit hooks, hence the append-log design; never set `ORACLE_MODE=record` by hand on the full suite). **Write-path gates are fixture-exempt** — they mutate a DB, so they SKIP under fixtures. Authoritative: **engineering/ORACLE_HARVEST.md** (`oracleMode()` in `test/parity/oracle_fixtures.ts`).

**Corpus-bound = wrong shape (2026-08-19).** All 76 harvested gates carry `entity: monedaiberica`; on the vendored suite DB the tier measures 173 pass / 208 fail (186 = corpus absence). Do NOT restore the harvest DB to make them green — that tests an install, not the engine. LAW (AGENTS.md hard rules): a test uses the generic `test` TLD and BUILDS its situation (`src/core/test_data/` situations, `zz*` scratch TLDs, torn down after). Never `numisdata`/`oh`/`tch`/`rsc`/`ich`/`mdcat`… in a test. Ratchet: `generic_tld_tripwire` (shrink-only). It measures THREE trees (`SCAN_ROOTS`, widened 2026-08-22): `test/**/*.test.ts`, **`client/dedalo/test/client/js/**/*.js`** and **`src/core/test_data/**/*.ts`** — the browser suite and the test-data writers were added after `test_additional_text_area.js` was found binding the `dmm` install's "map of grapes" demo ontology (dmm480/507/506), propped up by a `src/core/test_data` fixture that PROVISIONED it so the binding would resolve; both were invisible to a `*.test.ts`-only census. **The client suite is under the law too**: it binds the generic `test` TLD and the canonical `test3` playground, and a write-heavy client suite takes its own test3 record (`SUITE_ISOLATION_RECORDS` in `src/core/test_data/manifest.ts`, bound by id in `client/dedalo/test/client/js/elements.js`). Replacement ledger: ORACLE_HARVEST.md "Generic-TLD replacement map".

## THE TEST DATABASE AND ITS MARKER (the law, 2026-08-19)

`bun run test:db:setup` builds the suite DB (`DEDALO_TEST_DATABASE`, else `<DB_NAME>_test`) from repo-vendored files: install seed → **marker** → generic `test` TLD ontology (from `src/core/test_data/test_tld_ontology.json`, through the engine's doors) → numisdata test ontology → hierarchies + tools. Definitions, not records: the corpus is a situation a gate ensures/drops itself.

**The marker IS the guarantee.** Step 2b writes one row into `dedalo_test_marker` (`src/core/test_data/test_database_marker.ts`): `id=1` PK, the purpose sentence pinned by a CHECK, the database it names, build stamp + git rev + seed/ontology sha256. It cannot be created by accident (that shape is a paragraph of deliberate typing), it cannot be *travelled* (a marker naming another database REFUSES — that is a misrouted restore), and it is written by that script and nothing else.

Every test-data writer calls `await assertTestDatabase('<door>')` **before its first write** and refuses otherwise, with nothing written:
`materializeTestTldOntology` · `ensureTestCorpus`/`dropTestCorpus`/`ensureMediaKit` · `ensureSituation`/`dropSituation` · `createScratchRecord`/`cleanScratchRecord`/`cleanScratchTipo` · `installAclIdentityFixture`/`removeAclIdentityFixture` · `seedTermChainIfAbsent`/`sweepTermChain`/`sweepSeedTermReferencerResidue` · `ensureSuiteLoginPassword`.

- **A NEW writer must call it too** — `test_db_marker_tripwire` derives the writer list from the sources (`src/core/test_data/**` + `test/helpers/**`, write-seam scan), so forgetting is red, and an exemption needs a written reason.
- **The one bypass** is the installer (`src/core/install/db_restore.ts`, `materializeTestTldOntology({allowAnyDatabase:true})`): a fresh real install has no marker and must still get the `test` TLD ONTOLOGY (definitions, no records). Do not add a second.
- **Named exemption** (one): `test_data/seed.ts` (test3 playground — an installer + maintenance-widget surface).
- **The client run is inside the law too (2026-08-19).** `bun run test:client` writes through a LIVE SERVER, so its writes never pass this process's guard. It therefore **starts its own server on the suite DB** and stops it (`scripts/client_test_server.ts`): no dev server to start first, no `SERVER_TCP_PORT` to pass. The target is **verified over the wire** — `/health` answers `test_database`, an opaque sha256 of the marker row (dev-mode-only, never the DB name), and a server without it (an app database) or with a foreign one is refused before Chrome launches. `--url` still works and is checked the same way. The run also sets the suite DB's own login credential (`src/core/test_data/suite_login.ts` — the seed ships `root` passwordless), so `--auth cookie` is a real password-verified login and `--auth mint` stays an escape hatch.
- Symptom → cause: `REFUSING to write test data into database '…'` means your process is pointed at a database the suite did not build. Run `bun run test:db:setup`; never "fix" it by writing the marker onto an install.

## THE TEST MEDIA ROOT AND ITS MARKER (the filesystem half, 2026-08-19)

The database was not the only shared surface — `MEDIA_PATH` was. Media derivatives, staged uploads, publication markers and the corpus's media files used to land in the **installation's** media tree. They now land in the suite's own:

```
<repo>/../private/test_media/<suite db name>/        ← .dedalo_test_media
```

`../private/` is already this checkout's non-served, non-repo state (`.env`, session store, `processes/`), and keying by the suite DB name keeps media and database ONE fixture (`files_info.file_path` rows name files in that tree). `bun run test:db:setup` **sweeps and rebuilds** it; `bun test` creates and marks it if missing (a fresh clone just works); `test/helpers/test_media_root.ts` is the ONE derivation, and it refuses a root that is, contains, or is contained by `MEDIA_PATH`.

**ONE KEY DOES BOTH HALVES.** `DEDALO_TEST_MEDIA_ROOT` (catalog scope `test_seam`) *becomes* `config.media.rootPath` **and** *arms* the refusal. Neither half is settable alone, so a run cannot be armed at the install's root, nor repointed with the guard asleep. Three setters, one per tier: `test/preload/test_media.ts`, `scripts/test_db_setup.ts`, `scripts/client_test_server.ts` (which hands it to the server it spawns for the browser suite).

**Armed, every media-root RESOLVER demands the marker** and refuses without it, naming itself and stating that nothing was written (`src/core/media/test_media_root.ts`): `requireMediaRoot` (path.ts — the one root resolver behind every quality path, segment, subtitle, staging dir and `deleted/` move), `media_protection.mediaRoot()`, `media_index.markerStoreBase()`, `provisionMediaTree`, `checkDirectories`, `tool_import_dedalo_csv`, and `ensureMediaKit` (which asks unconditionally — it is a test-only door). Unset — every real installation — the guard is one property read and returns.

- **A gate's OWN scratch root needs the declaration too.** "It is under /tmp" is a claim about a path, which is the class of guarantee this replaces. Use `test/helpers/media_scratch_root.ts`: `markMediaRoot(dir)` · `scratchMediaRoot(prefix)` · `resetMediaRoot(dir)` (rm + re-declare — `rmSync(root, {recursive:true})` takes the marker with it).
- Symptom → cause: `requireMediaRoot REFUSED: … carries no '.dedalo_test_media' marker` means a door was pointed at an undeclared directory. Declare the scratch root, or run `bun run test:db:setup`. **Never** create the marker inside an installation's media tree.
- Gate: `test/unit/test_media_root_tripwire.test.ts` — the door inventory is DERIVED from a source scan of every `config.media.rootPath` reader, each door is proved to refuse an unmarked root *with the directory still empty afterwards*, and a marked root is proved to write.

## The test corpus: what its values ARE (2026-08-19)

`src/core/test_data/test_corpus/` is DERIVED by `scripts/derive_test_corpus.ts` from the frozen harvest store and provisioned by a gate that calls `ensureTestCorpus(scope)` / `dropTestCorpus(scope)` itself (never the preload). Two properties decide what you may assert on it:

- **Most values are LIST PROJECTIONS, not stored bytes.** The store mostly shows records through reads, and a list read slices by lang, resolves labels and truncates. Measured 2026-08-19 over 1 018 written (record, component) pairs: **16 raw · 170 edit · 832 list projections** (81.7 %). Each record declares `component_sources: {tipo: 'raw'|'edit'|'list'}` and `reconstructed: true/false`, and the deriver always keeps the richest source it saw for a pair (10 upgrades, 88 poorer sources rejected in the last run). **Rule: never re-read a `list`-sourced component through the list pipeline and compare VALUES** — you truncate twice. Compare identity/order/presence there, and compare values only on `reconstructed: false` rows (what `read_differential` does). A component ABSENT from a reconstructed record is UNKNOWN, not empty.
- **Inverse edges are materialized from the far end.** A record is otherwise rebuilt from its own projections, so a locator that lives on A and points at B is invisible while walking B — and every index/inverse/children gate resolves 0 items. The deriver reads the computed inverse pages (`{type, section_tipo, section_id, from_component_top_tipo}`, PHP `parse_data`) and writes the locator onto the POINTING record, where the `matrix_*_relation_index_sync` trigger indexes it like a real save. Each one is listed as `inverse_edges[]` (`origin: 'inverse_edge'` + the gate/record/component that stated it) and a record that exists ONLY because of one is `edge_only: true`. An edge whose pointing record has no ontology clone, whose component does not store, or whose target is unmappable is REFUSED into `refused.json` (`inverse_edge_*`), never approximated. `relation_index_get_data_differential` is the worked example.

`refused.json` is the punch list: if your gate's records are in there, its corpus is incomplete — fix the derive, do not weaken the assertion.

## Scratch-write hygiene (non-negotiable)

The oracle shares the corpus Postgres — a careless write corrupts real records for both engines.

- DB writes go **ONLY** to `matrix_test` / provisioned test TLDs (`test2`, …) / `dedalo_ts_test_*` tables. **Never mutate a real record.** Round-trip/save gates create a **scratch twin** and delete it (before AND after — see `dataframe_roundtrip_differential.test.ts`, `delete_differential.test.ts`).
- **Session store isolation (S1-18):** `bun test` preloads `test/preload/session_db.ts` which points `DEDALO_SESSION_DB_PATH` (`src/core/security/session_store.ts:76`, re-read at call time) at a throwaway store. This exists because a test run once **WIPED the live session store**, logging everyone out. The guard is `test/unit/session_store_reset_guard.test.ts`. Do not read/write the live session DB from a test, and do not hardcode a path that bypasses the override.

## Deliberate TS↔PHP divergences — ledger, don't normalize

When TS intentionally differs from PHP (a PHP live defect, or a chosen wire improvement), the gate normalizes the oracle side to match — but that normalization must be **justified and recorded**, never a silent smoothing-over that hides a real regression. Record it in **engineering/wire_contract/**, one file per entry (e.g. **WC-001**: empty component value is `entries: []`, unified across all models — PHP emitted `null`) and update the gate to transform the fixture. A normalization key with no ledger entry is a bug in disguise; the reviewer's question is always "is this divergence deliberate and ledgered, or are you papering over a diff?".

## THE TRIPWIRE-TEST PATTERN — the enforcement backbone

Rule: **"tripwire or delete."** A documented invariant with no test that FAILS on violation will rot — the audit proved it. Every structural invariant in this codebase has a tripwire in `test/unit/` that greps the tree (or asserts a boundary) and reddens the moment the rule is broken. When you add an invariant, add its tripwire. When you rely on one, **prove it honest**: plant a violation, watch the exact tripwire go red, revert.

The eleven (index + invariants also in **rewrite/LEDGER.md** "Tripwire index"):

| Tripwire (test/…) | Invariant it guards |
|---|---|
| `unit/sql_confinement_tripwire.test.ts` | Tiered SQL confinement (T1–T4, DEC-09) |
| `unit/config_env_tripwire.test.ts` | No `process.env.` outside `src/config/` |
| `unit/module_state_tripwire.test.ts` | No cross-request module state (lifecycle-justified allowlists only) |
| `unit/diffusion_boundaries.test.ts` | diffusion→core direction; MariaDB confined to `targets/mariadb/` |
| `unit/boundary_seam_tripwire.test.ts` | core→diffusion seam grows facade-only (S3-02) |
| `unit/coex_tag_tripwire.test.ts` | COEX tags cite their DEC + have a COEXISTENCE.md row (DEC-19) |
| `unit/descriptor_completeness_tripwire.test.ts` | Component descriptors declare required facets (S2-26) |
| `unit/import_scc_tripwire.test.ts` | No static value-import cycle of size >1 (S2-20; allowlist empty) |
| `unit/ws_a_tripwires.test.ts` | `json_codec` at jsonb binds; no inline locator compares |
| `unit/client_serving.test.ts` | `client/` byte-identity to the PHP source |
| `parity/oracle_canary.test.ts` | Oracle absence is LOUD, never a silent green |

Why they exist (concrete breakage each prevents):
- **config_env** — a stray `process.env` read outside `src/config/` (the only reader is `readEnv`, `src/config/env.ts:98`) means a setting silently ignores the typed catalog / `.env` and "isn't taking effect".
- **module_state** — a module-level mutable `Map/Set/let` carrying request/principal/lang state bleeds one request's data into another under concurrency (cross-request lang bleed, wrong-user reads). Request state belongs in the 3 ALS stores (transaction, `request_lang.ts`, `security/request_context.ts`); request-derived caches come from `createOntologyCache`/`createDataCache` (`ontology/cache_factory.ts`), which are hub-registered by construction.
- **ws_a** — a jsonb bind that skips `encodeForJsonb` (`json_codec.ts:102`) hits the Bun.sql `::text::jsonb` trap (a plain object/native array gets mis-encoded into the jsonb param), so PHP reads back a payload it parses differently.
- **client_serving** — `client/` is byte-identical to PHP's; any drift means the copied vanilla-JS client renders against a contract the server no longer serves and silently crashes.

## Bun gotcha — `mock.module` leaks across files (this once reddened 7 gates)

`mock.module` is **process-GLOBAL**, and `mock.restore()` does **NOT** revert it. A mock installed in one test file stays installed for every file that runs after it. Pattern (see `test/unit/record_scope_gates.test.ts`): snapshot the REAL module exports at import time, then re-install them in an `afterEach`:

```ts
import * as record_scope from '../../src/core/security/record_scope.ts';
const REAL_RECORD_SCOPE = { ...record_scope };
afterEach(() => { mock.module('../../src/core/security/record_scope.ts', () => REAL_RECORD_SCOPE); });
```

A test that fails **only in full-suite / parallel order** but passes standalone is almost always this (a leaked module mock) or a scratch row/session-store collision — not a real regression. Check the leak before "fixing" the code. (One known-flaky exception is documented in project memory: the diffusion retry-queue test.)

## Checklist for a new test

1. Oracle-touching? → gate it `describe.if(hasPhpCredentials())`. Assert on real structure, not `[]`.
2. Writes the DB? → `matrix_test` / `dedalo_ts_test_*` only; scratch twin; clean up both ends; never the live session store. Writing through a NEW helper of your own? It calls `assertTestDatabase()` first (marker law above).
3. Diverges from PHP on purpose? → an `engineering/wire_contract/` entry + normalization key, not a silent smoothing.
4. New invariant? → new tripwire, and prove it red-on-violation before trusting it.
5. Uses `mock.module`? → snapshot + `afterEach` re-install, or it leaks.

Write-path primitives you may need to assert against: `withTransaction` (`db/postgres.ts:303`), `insertMatrixRecordWithCounter` (`db/matrix_write.ts:388`), `encodeForJsonb` (`db/json_codec.ts:102`), `compareLocators` (`concepts/locator.ts:133`), `dbTimestamp` (`db/db_timestamp.ts:34`).
