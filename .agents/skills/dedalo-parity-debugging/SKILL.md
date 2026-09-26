---
name: dedalo-parity-debugging
description: Post-cutover debugging workflow for the Dédalo v7 TS/Bun engine — triaging a red test/parity/*_differential.test.ts that replays the FROZEN 2026-07-11 fixture store (ORACLE_MODE, test/parity/oracle_fixtures.ts, oracle_canary, engineering/parity_baseline.json), deciding engine bug vs deliberate divergence vs corpus absence, editing a fixture only as a same-day engineering/wire_contract/ entry, finding a retired differential's TS-native twin (engineering/ORACLE_HARVEST.md, engineering/twin_map.json), in-process probe scripts against our own engine, and driving the vanilla-JS client via Chrome DevTools MCP against bun run test:client:server or the dev server with a minted session cookie. Use when a parity gate reds or parity_baseline_tripwire fails, when "fixture miss" / "no recorded interaction" throws, when a component renders wrong in the browser, when a bug is reported against the running client ("X is not resolved in client"), or when a write must be verified on scratch surfaces of the suite DB.
---

# Dédalo v7 — parity & client debugging (post-cutover)

**Every path here is RELATIVE to the repo root** (the directory holding `package.json`, `src/`, `test/`). Never hard-code an absolute path or a credential.

There is no live oracle. The PHP engine was decommissioned 2026-07-11; `v7_php_frozen/master_dedalo` (outside the repo) is historical reference for *how a behaviour was ported*, never something to verify against. What remains:

- **Read-path parity** — `test/parity/*_differential.test.ts` replaying the frozen fixture store `test/parity/fixtures/oracle_harvest/` (`ORACLE_MODE` defaults to `fixtures`).
- **Write-path contracts** — TS-native `test/unit/*_native.test.ts` gates.
- **The client** — vanilla JS under `client/`, TS-owned, with an exact wire contract.

## 1. Triage a red parity gate

The parity tier is red on the suite DB **by construction**: every harvested gate was recorded against one installation's records (`entity: monedaiberica`), which the suite DB does not hold. So "red" alone says nothing. Ask, in order:

1. **Is it a known red?** Permanent reds are frozen per file AND per test name in `engineering/parity_baseline.json` (`parity_baseline_tripwire`; standalone: `bun run scripts/parity_baseline.ts --check`). A red NOT listed there is a regression. A listed red that now passes is ALSO a gate failure — bank the improvement (`scripts/parity_baseline.ts`), never hand-edit the JSON.
2. **Fixture miss?** A request with no recorded interaction THROWS naming the hashed (and, for a `test`-TLD gate, the `unmapRqo`-unmapped) request. The gate changed its RQO, or the mapping in `src/core/test_data/test_tld_tipo_map.json` does not cover a new term. A re-harvest is impossible — fix the gate's request or the map.
3. **Corpus absence?** The record the frozen answer describes is not on the suite DB (or is in the derived corpus's `refused.json`). Not an engine bug. The cure is the generic-TLD twin, not restoring the harvest-day snapshot.
4. **Deliberate divergence?** TS intentionally differs from the frozen PHP shape. It must already have an `engineering/wire_contract/` entry and a gate-side transform of the fixture side (e.g. WC-001 `entries: []`, applied in `test/parity/normalize.ts`). No entry → it is not deliberate yet.
5. **Engine bug.** Everything else. Fix the engine; the frozen shape is the contract.

**Never edit a fixture to make a gate green.** A fixture change is a deliberate contract edit: it ships with its `engineering/wire_contract/` entry the same day (rules: `engineering/WIRE_CONTRACT.md`), stating what changed and why.

## 2. Retired differentials and their twins

Most write-path and many corpus-bound differentials are GONE; their contracts live in TS-native twins. Where a contract went:

- `engineering/ORACLE_HARVEST.md` — the DEC-14b punch list and § Generic-TLD replacement map (prose, one row per retired gate).
- `engineering/twin_map.json` — derived by `scripts/twin_map.ts` from each twin's `@twin-of` / `@twin-status` header directives (retired / frozen-record / supplement). Example: the portal edit write contracts live in `test/unit/portal_edit_writes_native.test.ts`.

A NEW contract is a native gate in `test/unit/`, building its situation on the generic `test` TLD (`dedalo-ts-testing`). Never a new differential; never `test.if(hasLivePhpOracle())` (false forever — `oracle_canary` names such blocks as permanently unreachable).

## 3. In-process probe script (fastest)

Put a probe at the repo root (`probe_<name>.ts` — gitignored) so every import is relative. Two useful shapes:

- **Engine vs frozen capture** — under fixture mode `PhpApiClient.call()` (`test/parity/php_client.ts`) serves the frozen interaction with no network; diff it against the TS read (`readSectionRows` / `readSection` in `src/core/section/read.ts`) on the same RQO, through the same normalizers the gate uses (`test/parity/normalize.ts`).
- **Engine vs itself** — call the dispatcher (`dispatchRqo` in `src/core/api/dispatch.ts`) or the subsystem function directly to isolate a layer.

Diff on SET membership by a stable key first (locator string, `tipo|section_tipo|section_id`) — `missing in TS` / `extra in TS` — and reconcile order/duplicates last. A probe reads whichever database `../private/.env` points at (the `bun test` preloads that repoint to the suite DB do not run for `bun probe_x.ts`). To probe the suite DB, set `DB_NAME=<app db>_test` in the probe's environment (process env outranks `.env`). Never probe-write the application database.

## 4. Driving the client (Chrome DevTools MCP)

When a bug is reported against the running app, the browser shows the WIRE contract a projection misses. Two servers to drive:

- **`bun run test:client:server`** — the suite server on the suite DB, same login credential and fixtures as `bun run test:client`, kept alive for browsing. Preferred: nothing you do there touches application data.
- **`bun run dev`** (`scripts/dev.ts`: `bun --watch` under a supervisor + the CSS watcher) — the port comes from `SERVER_TCP_PORT` in `../private/.env`. It reloads on TS edits; no manual restart. `.less` edits need `bun run css:build`; tool JS has no cache-bust (hard reload). Login is real: mint a session (`createSession` in `src/core/security/session_store.ts`) and inject it as the `dedalo_ts_session` cookie via the browser API (in-page `document.cookie` cannot set it); revoke it after.

```
navigate_page  → <origin>/dedalo/core/page/?tipo=<tipo>&section_id=<id>&mode=edit&menu=true
take_screenshot → confirm the visual symptom / fix
list_console_messages {types:["error"]}
list_network_requests {resourceTypes:["xhr","fetch"]}  → find the failing call
get_network_request <reqid>  → the exact client RQO + response body
```

Attach a dialog handler first: one `alert()`/`confirm()` freezes the renderer and every later call times out with a misleading protocol error. API failures are **envelope v2 JSON** — `{"ok": false, "request_id": …, "error": {"code", "category", "message", "label_key", "retryable", "details"?}}` (`engineering/ERRORS_SPEC.md`, `dedalo-errors-ts`); `DEDALO_DEBUG_API_ERRORS=true` echoes the exception text on a dev server, and `request_id` joins the response to the server log. Reproduce the failing request body verbatim in a probe or native gate, fix, re-navigate, confirm screenshot + zero console errors.

When a widget renders blank, **fix the server payload first** — the client is vanilla JS with an exact wire contract (`dedalo-section-family-ts` for the section context fields it requires).

## 5. Scratch-surface write hygiene

Writes are verified on the **suite DB** (marker-guarded — every test-data writer calls `assertTestDatabase()`), never on the application database and never on a record you did not create. Build the surface through the engine's own write path (`ensureSituation` on a `zz*` TLD, `createScratchRecord`, explicit-id fixtures), mutate it through the real door (`save_component.ts`, `src/core/relations/save.ts`, the API), assert, and clean before AND after with a zero-residue check — including `matrix_time_machine` rows. There is no reserved `section_id` band.

## Isolating a diff (the discipline that converges fast)

1. Get `missing in TS` / `extra in TS` by stable key — ignore order/dupes at first.
2. For each MISSING item, find why the frozen capture has it: read the ported TS path, and — as history — the frozen PHP class it came from. Common causes seen: hide-block ddo not flattened, empty item not emitted, multi-target array flattened, self resolved to caller not targets.
3. For each EXTRA item, check for a duplicate emission in the frozen capture (PHP often emitted the same item twice; TS set-equal is correct) — a divergence to ledger, not to replicate.
4. Only AFTER the sets match, reconcile ordering/duplicates.

## Known PHP defects — do not replicate

Where the frozen PHP behaviour was provably wrong (crashes, ignored documented inputs, corrupted data), TS does the CORRECT thing and the divergence is a `engineering/wire_contract/` entry with a gate that pins the TS side. Never silently match a defect.

## Discipline

- Verify every claim before writing it as done — no "this should match".
- Judge regressions by diffing failing-test NAMES against a baseline (`engineering/parity_baseline.json`, `engineering/unit_baseline.json`), never by pass/fail counts.
- Commit per logical change: Conventional Commits, concise. Never `git reset --hard` without explicit confirmation.
- State that a gate or a skill must verify belongs in `engineering/` or next to the code; measured state goes to rewrite/LEDGER.md (gitignored, local-only).
