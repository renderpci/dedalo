# Dédalo v7 — TypeScript/Bun (master_dedalo) — THE engine since 2026-07-11

Native TS/Bun Dédalo server. **CUTOVER EXECUTED 2026-07-11**
(`rewrite/CUTOVER_RUNBOOK.md`): the PHP engine is decommissioned,
unmaintained DEAD CODE (`../../v7/master_dedalo` — historical reference
only); TS is the single engine and sole writer, and `client/` is the
PRIMARY, TS-OWNED client source.

**This file is the project's instructions for any coding agent.** It is the ONE
copy: `CLAUDE.md` is a symlink to it, so Claude Code and any tool following the
`AGENTS.md` convention read the same bytes and cannot drift. Never fork the two
(the "link, never duplicate" law applies to this file first).

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
  `engineering/ORACLE_HARVEST.md`).
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
  (S2-45). ONE carve-out (2026-07-11): the **tripwire index is a machine-read
  contract** and lives in `engineering/TRIPWIRES.md`, because `rewrite/` is not
  in the repo.
- **`rewrite/` is INTERNAL PROCESS and gitignored** — plans, status, history,
  the closed COEXISTENCE ledger, the runbooks. It is not on a clone, so **no
  gate, script or error message may read a path under it**. Anything mechanically
  enforced, or that a consumer of the engine needs, belongs in `engineering/`
  (permanent definitions) — that is the difference between the two directories.
- **Never silently narrow scope**: uncovered paths throw loudly and get a
  ledger line — in `rewrite/LEDGER.md` if it is state, but next to the code (a
  `reason` field, a named exemption) if a gate must verify it.
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

**`engineering/` = what the system IS** (permanent definitions, in the repo).
**`rewrite/` = how we GOT HERE** (process/history, gitignored, local-only).
When in doubt: if a gate reads it or a consumer needs it, it is `engineering/`.

| Doc | What |
|---|---|
| `engineering/REWRITE_SPEC.md` | Master spec: constraints, security chokepoints, architecture. |
| `engineering/TRIPWIRES.md` | **The tripwire index** — machine-read: `verify.ts` TRIPWIRES must equal it exactly. |
| `engineering/WIRE_CONTRACT.md` | Ledgered wire-shape divergences from PHP (WC-nn). |
| `engineering/RELATIONS_SPEC.md`, `engineering/SECTION_SPEC.md` | Family specs — **read the dated §1 addenda first**: the rebuilds they instruct already landed. |
| `engineering/DIFFUSION_SPEC.md` | Native diffusion subsystem (`src/diffusion/`, Bun-owns-MariaDB tiering). |
| `engineering/CONVENTIONS.md` | Error-handling/logging convention + the dynamic-import rules. |
| `engineering/ORACLE_HARVEST.md` | The frozen fixture store: how it replays, why a re-harvest is impossible, the retired-differential twin map. |
| `engineering/PRODUCTION.md` | Ops: supervision, socket, backups, health. |
| `engineering/STAGING_VALIDATION.md` | Exercise the ops hardening before production. |
| `engineering/CI.md` | CI/CD: pipeline map, hermetic vs self-hosted tiers, seam env, activation runbook. |
| *— internal, not in the repo —* | |
| `rewrite/LEDGER.md` | **Current state** — measured baselines, per-subsystem coverage, known-open gaps. Update rows in place. |
| `rewrite/STATUS.md` | Historical narrative ledger (long-form phase history; frozen — see its banner). |
| `rewrite/COEXISTENCE.md` | CLOSED PHP-coexistence ledger (COEX tags, removal conditions) — history since the cutover. |
| `rewrite/CUTOVER_RUNBOOK.md` | The one-day operator procedure that froze PHP and made TS the single engine. |
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

The authoritative tripwire list is **`engineering/TRIPWIRES.md`** (in the repo,
because it is machine-read; the rest of the coverage state stays in
`rewrite/LEDGER.md`). `scripts/verify.ts`
TRIPWIRES must match it — `test/unit/ci_workflow_tripwire.test.ts` guards the
CI wiring around them.

## Agent tooling layout

Vendor-neutral home, vendor-named aliases — one copy of everything, symlinked
so any agent tool finds it without a second source of truth:

| Real path (edit here) | Alias (committed symlink) | What |
|---|---|---|
| `AGENTS.md` | `CLAUDE.md` | These instructions. |
| `.agents/` | `.claude/` | Agent config root. |
| `.agents/skills/` | — | Project skills — the subsystem playbooks (`dedalo-ts-foundation` first; it maps the rest). |
| `.agents/workflows/` | — | Multi-agent workflows (e.g. `review-diff`). |

Rules:

- **Never duplicate an alias into a real file.** A second copy of `AGENTS.md`
  is a fork, not a convenience.
- **Machine-local state is never versioned** (`.agents/settings.local.json`,
  `.agents/scheduled_tasks.lock`) — the skills and workflows ARE.
- Git does not descend into a symlinked directory: ignore rules and any
  tool config must name the **real** path (`.agents/…`), never the alias, or
  they silently match nothing.
- Symlinks need `core.symlinks=true` on Windows checkouts; macOS/Linux (this
  project's targets) get them for free.
