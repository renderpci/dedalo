---
name: dedalo-ts-write-path
description: Writing to the SHARED matrix Postgres safely in the Dédalo v7 TypeScript/Bun rewrite — the one JSONB serializer (encodeForJsonb), the ::text::jsonb Bun.sql bind trap, transaction wrapping (withTransaction), the locator equality law (compareLocators), the one TM/data timestamp (dbTimestamp), atomic matrix DML (insertMatrixRecordWithCounter / updateMatrixRecord / deleteMatrixRecord), and PHP↔TS byte-coexistence on the same DB. Use when editing src/core/section/record/** (create/save/delete/duplicate_record.ts, save_component.ts), src/core/relations/save.ts, src/core/db/{json_codec,postgres,matrix_write,db_timestamp}.ts, src/core/concepts/locator.ts, ANY INSERT/UPDATE/DELETE touching matrix_* or dd_ontology, any save/delete/duplicate/counter/timestamp/locator work, or debugging "PHP reads my TS-written record differently", ERR_POSTGRES_UNSAFE_TRANSACTION, a lost update, a double-encoded jsonb string scalar, or a wrong-row write. Tripwires: ws_a_tripwires, sql_confinement_tripwire, module_state_tripwire, coex_tag_tripwire. Authoritative: rewrite/COEXISTENCE.md, engineering/CONVENTIONS.md; current state: rewrite/LEDGER.md.
---

# Dédalo v7 write path (shared matrix Postgres)

The TS engine writes to the **same Postgres** a live PHP Dédalo reads and writes (`rewrite/COEXISTENCE.md`). PHP is a byte-coexistent oracle: a record you write with TS must be **indistinguishable** from a PHP-written one everywhere it matters, or PHP silently mis-reads it, mis-orders it, or overwrites it. This is not a nicety — every rule below is a fixed S1/S2 finding from the foundation audit (`audits/2026-07_foundation/general/`), and each is guarded by a **tripwire** because "documented but untripwired invariants all rotted" is that audit's central lesson. Break a rule and the guard test goes red; there is no "I'll be careful" path.

**The load-bearing rule:** never hand-roll a matrix write. Serialize JSONB with `encodeForJsonb`, run DML through `db/matrix_write`, wrap saves in `withTransaction`, compare locators with `compareLocators`, and stamp time with `dbTimestamp`. Five helpers, no exceptions.

Current measured state (gate numbers, open gaps, subsystem homes): **`rewrite/LEDGER.md`** — read it, do not restate it here.

## 1. The ONE JSONB serializer — `encodeForJsonb`

`encodeForJsonb(value)` (`src/core/db/json_codec.ts:102`) returns a branded `RawJsonText` and is the ONLY thing allowed to produce the JSON string for a matrix JSONB write.

Why it exists: raw `JSON.stringify` silently drops `undefined` object properties and encodes `NaN`/`undefined` array slots as `null`. On a private DB that's sloppy; on the SHARED DB the stored shape then **diverges from PHP `json_encode`** for the same logical value, and PHP reads back a different object → coexistence corruption (an S1). The codec pins the PHP-compatible encoding in one place.

Enforced by: **`test/unit/ws_a_tripwires.test.ts`** (§S2-07, "json_codec owns encoding").

## 2. The `::text::jsonb` bind trap (Bun.sql)

Bun.sql infers a bound plain object / native array as jsonb and **JSON-encodes it itself**. If you pass `encodeForJsonb`'s output (already a JSON string) to a `$n::jsonb` param, it arrives **double-encoded** — stored as a jsonb *string scalar* `'"{...}"'` instead of the object. This bit the TM repair script twice.

The rule: bind app-encoded JSON as **`$n::text::jsonb`** (text in, cast to jsonb server-side — no Bun re-encode). For arrays passed as a param, use **`string_to_array($n, ',')`** (live example: `src/core/relations/select_lang.ts:73`, `= ANY(string_to_array($2, ','))`).

Enforced by: **`ws_a_tripwires.test.ts`** greps `src/` + `tools/` for any bare `$n::jsonb` bind outside a small object-binding allowlist and fails.

## 3. Wrap saves in `withTransaction` — never raw `BEGIN`

`withTransaction(work)` (`src/core/db/postgres.ts:303`) reserves ONE pooled connection, opens `BEGIN…COMMIT/ROLLBACK` on it, and stashes the reserved handle in an **AsyncLocalStorage** so every ambient `sql\`…\`` issued inside `work` routes onto that same reserved connection — reproducing PHP's one-connection transaction semantics.

Why: a save reads-then-writes under `SELECT … FOR UPDATE`. If the lock and the write land on **different pooled connections**, the lock is worthless and a concurrent PHP/TS writer clobbers you — the lost-update bug (S1-02 / DEC-01). Wrapping keeps the `FOR UPDATE` row-lock held to commit.

Never issue a raw `BEGIN`: **Bun pooled connections reject it** with `ERR_POSTGRES_UNSAFE_TRANSACTION`. Nested `withTransaction` is a no-op join (no inner BEGIN/savepoint); the outer commit is authoritative. In-tx cache seeding is blocked — deferred cache clears replay on commit (see §6).

## 4. The locator law — `compareLocators`

A locator (`section_tipo` + `section_id` + component coords) is how two records point at each other. Equality has **exact PHP `property_exists` semantics** and lives in ONE place: `compareLocators` (`src/core/concepts/locator.ts:133`) / `isLocatorInArray`.

Why it is a law: two matchers that disagree by even a hair (e.g. an inline `String(section_id) === …` vs the canonical 5-field predicate) resolve the "same" locator to **different rows** → you write to, or delete an inverse-ref from, the WRONG record (S1-06 / S2-03 / S2-04, DEC-21). NEVER inline a `String(section_id)` compare or a 2-field join.

Enforced by: **`ws_a_tripwires.test.ts`** (locator-law section) — grep for inline locator compares outside the allowlisted files (which use deliberate creation-time normalization, not stored-locator equality, and are documented in the test).

## 5. The ONE timestamp — `dbTimestamp`

Every TM/data stamp path uses `dbTimestamp()` (`src/core/db/db_timestamp.ts:34`), which emits **wall-clock time in `config.timezone` (DEDALO_TIMEZONE)** — matching PHP `get_timestamp_now_for_db` (PHP calls `date_default_timezone_set`, so its stamps are local wall-clock, not UTC).

Why: if TS stamps UTC while PHP stamps local, the Time Machine history **interleaves out of order** and a restore replays the wrong sequence (S1-03). One helper, timezone-aware, everywhere.

## 6. Atomic matrix DML — `db/matrix_write` only

All matrix `INSERT/UPDATE/DELETE` goes through `src/core/db/matrix_write.ts` — never ad-hoc SQL against `matrix_*`. This is **tiered SQL confinement T2** (DEC-09), enforced by **`test/unit/sql_confinement_tripwire.test.ts`** (T1 = `new SQL(` only in `postgres.ts`; T2 = matrix DML via `matrix_write` + `json_codec`; T3 = `dd_ontology` reads via `core/ontology` accessors; T4 = named subsystem tables keep local SQL, one owner each).

Key exports and their pinned guarantees:
- `insertMatrixRecordWithCounter` (`:388`) — counter allocation is **atomic and self-heals**: on a `23505` unique violation it realigns the counter to `MAX(section_id)` and retries once (S2-01).
- `updateMatrixRecord` / `updateMatrixKeyData` / `updateMatrixKeysData` — per-key jsonb writes (the save path).
- `deleteMatrixRecord` (`:533`) — the row delete inside the atomic delete phase.
- `allocateComponentItemId` / `absorbComponentItemIds` — per-item id counters (PHP counters live in the `meta` column; absorb raises meta to max id).

Record-lifecycle homes (the callers): `src/core/section/record/{create,save,delete,duplicate}_record.ts` + `save_component.ts`, and relation save hooks in `src/core/relations/save.ts`.

**Atomicity invariants (all tripwired by their DEC/finding tags via `coex_tag_tripwire`, verified by dedicated gates):**
- **Delete is one transaction** (S2-02): snapshot + TM audit row + inverse-reference rewrites + the row delete all commit together; **media file moves and diffusion unpublish run POST-COMMIT** (irreversible side-effects never inside the tx). See `record/delete_record.ts`.
- **Dataframe cascade on all three removal paths** (S1-05): removing a locator/item strips its paired frame entries (`delete_record.ts` per-removed-locator cascade; `save_component.ts` `remove` cascade).
- **Duplicate refreshes media `files_info`** (S1-04): every copied media item re-scans against the new paths and persists the refreshed `files_info` onto the new row (per-key write, no TM). See `record/duplicate_record.ts`.

## Caches & request state (why writes never leak across requests)

The write path's transaction ALS is one of **three AsyncLocalStorage stores** that thread request/principal/lang state — the tx client (`postgres.ts`, §3) plus request-lang (`currentApplicationLang`/`currentDataLang`, seeds TM/data stamps and lang-scoped writes) and request-context (`currentPrincipal`, seeds the audit actor). A write that reads the wrong principal or lang stamps the wrong row. **Never hand-roll a module-level `Map`/`Set`/`let` carrying request/principal/lang state** — that is cross-request bleed; use `createOntologyCache`/`createDataCache` (`src/core/ontology/cache_factory.ts`) for request-derived caches. Guarded by `test/unit/module_state_tripwire.test.ts`.

Full model — the three stores, the cache factories, in-tx seeding rules, background-job identity threading: the **`dedalo-ts-isolation-caching`** skill. Authoritative: `engineering/REQUEST_ISOLATION.md`.

## Config

Read env only via `readEnv` / `requireEnv` (`src/config/env.ts`); typed catalog in `src/config/config.ts` (`config.timezone`, `config.ops.*`, etc.). **No direct `process.env` outside `src/config/`** — tripwired by `test/unit/config_env_tripwire.test.ts`.

## Verifying a write against the oracle

Differential write gates need live PHP on the same Postgres — see the **`dedalo-parity-debugging`** skill for the harness. Gate with `describe.if(hasPhpCredentials())` (`test/parity/php_client.ts:178`); `ORACLE_MODE=fixtures` (`test/parity/oracle_fixtures.ts`) replays recorded pairs offline (`engineering/ORACLE_HARVEST.md`, DEC-14b); `test/parity/oracle_canary.test.ts` makes oracle absence LOUD (never a silent green).

**Scratch-write hygiene — NEVER mutate a real record.** Round-trip/save/delete tests write only to scratch twins: `matrix_test`, provisioned test TLDs, or `dedalo_ts_test_*`. A test that touches a real §id is a bug even if it passes.

## When you add a new write path

1. Serialize JSONB with `encodeForJsonb`; bind it `$n::text::jsonb` (arrays via `string_to_array`).
2. Route DML through `db/matrix_write`; wrap the save in `withTransaction`.
3. Compare locators with `compareLocators`; stamp with `dbTimestamp`.
4. Keep irreversible side-effects (media/diffusion) POST-COMMIT.
5. Add/extend a scratch-twin differential gate; if a rule needs a NEW allowlist entry, tag it with its DEC and add the `rewrite/COEXISTENCE.md` row (`coex_tag_tripwire` requires both).

Authoritative rules: `rewrite/COEXISTENCE.md` (COEX rules, DEC-19), `engineering/CONVENTIONS.md` (§1 errors — fail loud, never silently narrow; §2 dynamic imports), `engineering/REQUEST_ISOLATION.md` (the ALS model). Current gate/gap state: `rewrite/LEDGER.md`.
