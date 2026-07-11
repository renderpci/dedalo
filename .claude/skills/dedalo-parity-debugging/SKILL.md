---
name: dedalo-parity-debugging
description: The reusable workflow for the Dédalo PHP→TypeScript/Bun rewrite where the live PHP server is the ORACLE — differential parity gates, in-process probe scripts diffing TS vs PHP, driving the real PHP client via Chrome DevTools MCP to find client-contract bugs, scratch-twin write hygiene (never mutate real records), and the dev-server/env setup. Use when verifying a TS port matches PHP, when a component renders wrong in the browser, when writing a *_differential.test.ts gate, or when a bug is reported against the running client (e.g. "X is not resolved in client").
---

# Dédalo TS rewrite — PHP-oracle parity debugging

The rewrite lives in `/Users/render/Desktop/trabajos/dedalo/v7_ts/master_dedalo`. The PHP reference (`v7/master_dedalo`) is READ-ONLY and is the ORACLE: when TS and PHP disagree, PHP is right unless it is a pinned live defect. Master spec `rewrite/REWRITE_SPEC.md`; per-subsystem specs in `docs/*_SPEC.md`; running ledger `rewrite/STATUS.md` (house style: ✅ rows cite their gate test; open items carry a blocking reason; NEVER silently narrow scope — throw loudly + ledger).

## Environment

- **Live PHP + shared Postgres**: differential tests need `PHP_API_BASE_URL` / `PHP_API_USERNAME` / `PHP_API_PASSWORD` from `../private/.env` (creds `root` / `123123aS`). Shared DB `dedalo_mib_v7` via `/opt/homebrew/bin/psql -h /tmp -U render`. Both engines read the SAME database — reads are safe, writes are NOT (see scratch twins).
- **TS dev server** (needs `dangerouslyDisableSandbox`):
  ```
  SCRATCH=<session scratchpad>
  pkill -f "bun run src/server.ts"; sleep 1
  SERVER_TCP_PORT=3500 nohup bun run src/server.ts > $SCRATCH/server.log 2>&1 &
  ```
  Serves `http://localhost:3500/dedalo/core/page/?tipo=<tipo>&section_id=<id>&mode=edit&menu=true`. Restart after every source edit (no hot reload for the resolvers).
- **Full suite**: `bun test` (needs `dangerouslyDisableSandbox`; ~2-4 min). Typecheck: `bunx tsc --noEmit 2>&1 | grep "error TS"` (some pre-existing errors in tool_export/portal_drag/diffusion tests — filter them out).

## Three verification layers (use in order)

### 1. In-process probe script (fastest TS-vs-PHP diff)
Write to the session scratchpad, import BOTH the TS resolver and the `PhpApiClient` with ABSOLUTE paths, call the same RQO through each, diff the projections. Skeleton:
```ts
import { config } from '/Users/render/.../master_dedalo/src/config/config.ts';
import { PhpApiClient } from '/Users/render/.../master_dedalo/test/parity/php_client.ts';
import { readSection } from '/Users/render/.../master_dedalo/src/core/section/read.ts'; // (was resolve/read_rows.ts — deleted in the section rebuild)
const client = new PhpApiClient();
await client.login(config.phpReference.username as string, config.phpReference.password as string);
const { body } = await client.call(structuredClone(rqo) as Record<string, unknown>);
const phpData = (body.result as any).data;
const tsData = (await readSection(rqo)).data; // readSection returns {context, data}
// diff by a STABLE key: locator string, item id, tipo|section_tipo|section_id
```
Diff on SET membership by a stable key first (`missing in TS` / `extra in TS`), not deep-equal — ordering/duplicate mismatches are often separate (PHP-side) issues to isolate last. Run with `cd $SCRATCH && bun probe_x.ts` (dangerouslyDisableSandbox). Keep probes around — they are the cheapest regression check while iterating.

### 2. Differential gate (`test/parity/*_differential.test.ts`)
The durable form of a probe. Pattern (exemplar: `portal_edit_writes_differential.test.ts`):
- Self-skip when creds absent: `if (!hasPhpCredentials()) return;` in EVERY test + `beforeAll`.
- Drive the SAME RQO through `PhpApiClient.call()` and the TS `dispatchRqo`/`readSection`; compare a PROJECTION (define exactly which fields — the projection IS the contract; a field you exclude is a field you are not testing — see the client-bug lesson below).
- Table-driven over a corpus where possible (one `test()` per row).

### 3. Real client via Chrome DevTools MCP (finds CLIENT-CONTRACT bugs projections miss)
When a bug is reported against the running app ("X is not resolved in client"), the browser is the oracle for the WIRE contract:
```
navigate_page  → http://localhost:3500/dedalo/core/page/?tipo=...&section_id=...&mode=edit&menu=true
(wait ~4-5s for render)
take_screenshot → confirm the visual symptom / fix
list_console_messages {types:["error"]}
list_network_requests {resourceTypes:["xhr","fetch"]}  → find non-200s
get_network_request <reqid>  → read Request Body (the exact client RQO) + Response Body
```
A Bun 500 response embeds the error + stack as base64 in `<script id="__bunfallback">`; a 400 is a schema rejection with the failing path (`{"path":["show","ddo_map",0,"section_tipo"],"message":"Expected string, received array"}`). Reproduce the failing Request Body verbatim in a probe/gate, fix, restart server, re-navigate, confirm screenshot + zero errors. The Chrome session persists login (root).

## Scratch-twin write hygiene (MANDATORY for save/round-trip parity)

NEVER mutate a real record to test writes — both engines share one DB. Seed disposable TWIN records by SQL, mutate the twins, compare, delete in `afterAll`. Pattern: read-only parity on the real record first → SQL-seed twin-A and twin-B → TS mutates twin-A while PHP reads it, PHP mutates twin-B while TS reads it → `data::text` byte-diff + counter parity → `afterAll` cleanup incl. `matrix_time_machine` rows. This is a locked user decision for the §15657 dataframe round-trip.

## Isolating a diff (the discipline that converges fast)

1. Get `missing in TS` / `extra in TS` by stable key — ignore order/dupes at first.
2. For each MISSING item, find WHY PHP emits it: read the PHP class flow (`dedalo-server-debugging` skill), or probe PHP's raw output for that sub-item. Common causes seen: hide-block ddo not flattened, empty item not emitted, multi-target array flattened, self resolved to caller not targets, a whole model 500ing.
3. For each EXTRA item, check for a PHP DUPLICATE emission (PHP often emits the same item twice; TS set-equal is correct) — these are PHP-side and get ledgered, not "fixed" in TS.
4. Only AFTER the sets match, reconcile ordering/duplicates (usually the last, PHP-side, phase).

## Pinned PHP LIVE DEFECTS — do NOT replicate; diverge and gate asymmetrically

When PHP is provably wrong (crashes, ignores documented inputs, corrupts), TS does the CORRECT thing and the gate asserts the divergence on BOTH sides (an asymmetric/pin test), with a `(!)` note + reproduction in `rewrite/STATUS.md`. Never silently match a defect. Examples accumulated: TM read ignores `sqo.filter`; `component_calculation` READ crashes on unstored value (`array_sum`); counters double-unwrap kills `modify_counter`; the PHP install's backup cron produces ZERO-BYTE dumps (pg_dump 17 vs server 18); DROP…CASCADE footgun in `rebuild_db_functions`. If you find a new one, PIN it (assert both behaviors) and ledger it numbered.

## Discipline

- Verify EVERY claim differentially before writing it as done — no "this should match".
- Full suite green + zero fixture changes at each phase gate (a needed fixture change means behavior drifted — fix the code).
- Commit per phase: Conventional Commits, backtick Dédalo identifiers, end with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`. Never `git reset --hard` without double confirmation.
- Update `rewrite/STATUS.md` in the same commit as the fix — the ledger is the source of truth for what is/isn't covered.
