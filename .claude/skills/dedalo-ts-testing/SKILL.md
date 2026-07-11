---
name: dedalo-ts-testing
description: How to test the Dédalo v7 TypeScript/Bun rewrite oracle-honestly — the two tiers (test/unit/ pure+DB, test/parity/ differential vs the LIVE PHP oracle), the green-suite trap (differentials pass TRIVIALLY when PHP creds are absent), the eleven tripwire tests that are the invariant-enforcement backbone, and scratch-write hygiene. Use when writing or debugging any *.test.ts or *_differential.test.ts, when a test fails only in full-suite/parallel order, when oracle-gating with describe.if(hasPhpCredentials()) / test.if(...), running ORACLE_MODE=fixtures/record harvest (scripts/oracle_harvest.ts), asking "is this test actually asserting anything or silently green", adding or trusting a tripwire, chasing a mock.module leak across files ("mock.restore doesn't revert"), a wiped session store, or a deliberate TS↔PHP wire divergence (WC-001, entries:[]). Symbols: hasPhpCredentials (test/parity/php_client.ts:178), oracleMode/ORACLE_MODE (test/parity/oracle_fixtures.ts), oracle_canary.test.ts, DEDALO_SESSION_DB_PATH. Sibling: dedalo-parity-debugging for the differential probe/browser workflow. Authoritative: rewrite/LEDGER.md (tripwire index + measured state), rewrite/ORACLE_HARVEST.md, engineering/WIRE_CONTRACT.md.
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

`ORACLE_MODE=fixtures` runs read-path differentials with **no network, no credentials**, replaying 57 harvested golden gates from `test/parity/fixtures/oracle_harvest/` (one JSON per gate), matched by canonical request hash — a **miss THROWS loudly**, it never falls through to green. Re-harvest with `bun run scripts/oracle_harvest.ts` (sets `ORACLE_HARVEST_GATE`, one gate per process — bun fires no exit hooks, hence the append-log design; never set `ORACLE_MODE=record` by hand on the full suite). **Write-path gates are fixture-exempt** — they mutate a DB, so they SKIP under fixtures. Authoritative: **rewrite/ORACLE_HARVEST.md** (`oracleMode()` in `test/parity/oracle_fixtures.ts`).

## Scratch-write hygiene (non-negotiable)

The oracle shares the corpus Postgres — a careless write corrupts real records for both engines.

- DB writes go **ONLY** to `matrix_test` / provisioned test TLDs (`test2`, …) / `dedalo_ts_test_*` tables. **Never mutate a real record.** Round-trip/save gates create a **scratch twin** and delete it (before AND after — see `dataframe_roundtrip_differential.test.ts`, `delete_differential.test.ts`).
- **Session store isolation (S1-18):** `bun test` preloads `test/preload/session_db.ts` which points `DEDALO_SESSION_DB_PATH` (`src/core/security/session_store.ts:76`, re-read at call time) at a throwaway store. This exists because a test run once **WIPED the live session store**, logging everyone out. The guard is `test/unit/session_store_reset_guard.test.ts`. Do not read/write the live session DB from a test, and do not hardcode a path that bypasses the override.

## Deliberate TS↔PHP divergences — ledger, don't normalize

When TS intentionally differs from PHP (a PHP live defect, or a chosen wire improvement), the gate normalizes the oracle side to match — but that normalization must be **justified and recorded**, never a silent smoothing-over that hides a real regression. Record it in **engineering/WIRE_CONTRACT.md** (e.g. **WC-001**: empty component value is `entries: []`, unified across all models — PHP emitted `null`) and update the gate to transform the fixture. A normalization key with no WIRE_CONTRACT row is a bug in disguise; the reviewer's question is always "is this divergence deliberate and ledgered, or are you papering over a diff?".

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
2. Writes the DB? → `matrix_test` / `dedalo_ts_test_*` only; scratch twin; clean up both ends; never the live session store.
3. Diverges from PHP on purpose? → WIRE_CONTRACT.md row + normalization key, not a silent smoothing.
4. New invariant? → new tripwire, and prove it red-on-violation before trusting it.
5. Uses `mock.module`? → snapshot + `afterEach` re-install, or it leaks.

Write-path primitives you may need to assert against: `withTransaction` (`db/postgres.ts:303`), `insertMatrixRecordWithCounter` (`db/matrix_write.ts:388`), `encodeForJsonb` (`db/json_codec.ts:102`), `compareLocators` (`concepts/locator.ts:133`), `dbTimestamp` (`db/db_timestamp.ts:34`).
