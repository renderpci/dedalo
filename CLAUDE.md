# Dédalo v7 — TypeScript/Bun (master_dedalo) — THE engine since 2026-07-11

Native TS/Bun Dédalo server. **CUTOVER EXECUTED 2026-07-11**
(`rewrite/CUTOVER_RUNBOOK.md`): the PHP engine is decommissioned,
unmaintained DEAD CODE (`../../v7/master_dedalo` — historical reference
only); TS is the single engine and sole writer, and `client/` is the
PRIMARY, TS-OWNED client source.

## ⚠️ THE VERIFICATION STORY (read this first — post-oracle)

The live-oracle era is over. The baselines of record are FROZEN:

- **Read-path parity** replays the frozen fixture store
  (`test/parity/fixtures/oracle_harvest/`, final harvest 2026-07-11) —
  `ORACLE_MODE` defaults to `fixtures`; plain `bun test test/parity/` runs
  credless and green. The store is PINNED to the same-instant DB snapshot
  (`private/backups/db/2026-07-11_102750.….custom.backup`) — restore-test
  against that pair, never mix.
- **Write-path contracts** live in the TS-native `test/unit/*_native.test.ts`
  gates (DEC-14b — each retired differential's twin is mapped in
  `rewrite/ORACLE_HARVEST.md`).
- A re-harvest is IMPOSSIBLE by definition. Any fixture change is a
  deliberate contract edit and needs its `engineering/WIRE_CONTRACT.md`
  entry the same day — the WC ledger remains the wire law.
- Never assert against a mutable production record — use scratch twins
  (see the `dedalo-parity-debugging` skill; its live-oracle workflow is
  historical).

## Hard rules

- **`client/` is the TS-OWNED primary client source** (since the cutover;
  `scripts/sync_client.sh` is retired and refuses to run). Edit it directly;
  the gate is serving self-consistency (`client_serving.test.ts`) +
  `bun run test:client`. The old law still holds in spirit: when a widget
  renders blank, fix the server payload first — the client is vanilla JS
  with an exact wire contract.
- **`../private/.env` is append-only**, documented keys only. Config is
  read through `readEnv`/the typed catalog — `process.env.` outside
  `src/config/` fails the tripwire.
- **Invariants are tripwired or deleted** (DEC-12). If you state a rule in a
  header/README, add a mechanical gate. Coverage-state lists live ONLY in
  `rewrite/LEDGER.md` / `rewrite/STATUS.md` — headers may link, never duplicate
  (S2-45).
- **Never silently narrow scope**: uncovered paths throw loudly and get a
  ledger line.
- **DB writes in tests only on scratch surfaces**; clean up after.

## Commands

- `bun run dev` — server (unix socket / port per `../private/.env`).
- `bun test test/unit/…` / `bun test test/parity/…` — targeted gates
  (full `bun test` takes minutes; parity replays the frozen store, no
  oracle, no creds).
- `bun run test:client` — the byte-identical client suite against a
  `DEDALO_DEV_MODE=true` server (target: `rewrite/client_tests.md`).
- `bunx tsc --noEmit` — zero-NEW-errors rule (pre-existing baseline is
  ledgered in `rewrite/LEDGER.md`).
- `bun run lint` — biome (burn-down owned by a dedicated pass).

## Docs index

| Doc | What |
|---|---|
| `rewrite/LEDGER.md` | **Current state** — measured baselines, per-subsystem coverage, tripwire index. Update rows in place. |
| `rewrite/STATUS.md` | Historical narrative ledger (long-form phase history; being frozen — see its banner). |
| `engineering/WIRE_CONTRACT.md` | Ledgered wire-shape divergences from PHP (WC-nn). |
| `rewrite/REWRITE_SPEC.md` | Master spec: constraints, security chokepoints, architecture. |
| `engineering/RELATIONS_SPEC.md`, `engineering/SECTION_SPEC.md` | Family specs — **read the dated §1 addenda first**: the rebuilds they instruct already landed. |
| `engineering/DIFFUSION_SPEC.md` | Native diffusion subsystem (`src/diffusion/`, Bun-owns-MariaDB tiering). |
| `engineering/CONVENTIONS.md` | Error-handling/logging convention + the dynamic-import rules. |
| `rewrite/COEXISTENCE.md` | PHP-coexistence scaffolding ledger (COEX tags, removal conditions, cutover blockers). |
| `engineering/PRODUCTION.md` | Ops: supervision, socket, backups, health. |
| `rewrite/CI.md` | CI/CD: pipeline map, hermetic vs self-hosted tiers, seam env, activation runbook. |
| `rewrite/CUTOVER_RUNBOOK.md` | The one-day operator procedure that freezes PHP and makes TS the single engine (COEX walk, parity flip, client ownership). |
| `rewrite/client_tests.md` | Client-gate baseline. |
| `audits/2026-07_foundation/` | Foundation audit: FINDINGS / DECISIONS / REMEDIATION (finding ids like S2-26 resolve here). |

## Architecture in one breath

Ontology-driven: `dd_ontology` defines everything; `src/core/ontology/resolver.ts`
is the cached accessor layer. Reads flow RQO → `core/api/dispatch.ts` →
`section/read.ts` (context+data, the PHP build_json_rows shape) with
relations expanding through `core/relations/registry.ts`. Component models
are declarative descriptors (`core/components/README.md` — the honest
model-addition checklist). Writes go through `section/record/save_component.ts`
(tx-wrapped, TM-audited) + `db/matrix_write.ts`/`json_codec.ts`. SQL
confinement is tiered (README "Hard rules"). Diffusion is native under
`src/diffusion/` (facade: `diffusion/api/`). Request identity (lang,
principal) is ALS-scoped — never captured at module level.

## Tripwires

The authoritative tripwire list is the **"Tripwire index" in `rewrite/LEDGER.md`**
(S2-45: coverage lists live there, never in headers). `scripts/verify.ts`
TRIPWIRES must match it — `test/unit/ci_workflow_tripwire.test.ts` guards the
CI wiring around them.
