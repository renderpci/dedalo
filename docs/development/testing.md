# Testing

> See also: [Development](index.md) · [Breaking change detection](breaking_change_detection.md) · [Runtime & request-scoped context](runtime_and_workers.md)

The Dédalo server ships its automated suite under `test/`, run by **`bun test`**
(`bun:test`, Bun's built-in Jest-compatible runner). Two things make this suite
different from an ordinary one, and both are on this page: the parity tier replays a
**frozen fixture store** rather than calling a live reference engine, and the invariants
of the codebase are enforced by **tripwire tests** — the rule is *tripwired or deleted*.

Read the green-suite trap section before you trust a green run.

## The suite at a glance

| Tier | Location | Runner | What it covers |
|---|---|---|---|
| Unit + DB gates | `test/unit/` | `bun test` | The engine's internals against pure logic or the real Postgres: codec round-trips, security fail-closed, locator law, media, import, RAG, tools, the write-path `*_native.test.ts` gates, and the tripwires. |
| Parity | `test/parity/` | `bun test` | `*_differential.test.ts` gates that replay the **frozen fixture store** and diff it against what the engine emits today. |
| Integration | `test/integration/` | `bun test` | Diffusion against the real MariaDB deployment. Skips (loudly, with a logged message) when the diffusion DB credentials or socket are absent. |
| Client harness | `client/dedalo/test/client/` | `bun run test:client` | The vanilla-JS client's Mocha/Chai suites, driven in headless Chrome against a running server. Not a `bun test` file. |

## Running the suite

```bash
bun test                       # everything (minutes)
bun test test/unit             # one directory
bun test test/parity           # replays the frozen store — credless, no oracle
bun test test/unit/save_roundtrip.test.ts
bun test --test-name-pattern "save round-trip"
```

Discovery and timeouts come from `bunfig.toml`:

- `root = "test"` confines discovery to the `test/` tree. This matters: `client/dedalo/`
  contains view files whose names match Bun's default test globs
  (`core/widgets/test/…`), and without the confinement Bun would try to run them.
- `timeout = 30000` — DB-touching gates get a generous budget.
- Two **preloads** run before any test module is imported:
  `test/preload/session_db.ts` points `DEDALO_SESSION_DB_PATH` at a throwaway sqlite
  store (a test run once wiped the live session store and logged everyone out —
  never bypass this by hardcoding a path), and `test/preload/component_registry.ts`
  registers the ontology↔components lookup that production boot performs as a
  module-load side effect.

The static gates are separate: `bunx tsc --noEmit` (strict, zero-new-errors) and
`bun run lint` (Biome, `biome.jsonc`).

## Tier 1 — unit and DB gates (`test/unit/`)

An ordinary `bun:test` file importing the module under test from `../../src/…`. Some
gates are pure; many run against the **real Postgres**, because the engine's contract is
the shape of that schema.

This tier also owns the **write-path contracts**. The parity tier can only replay reads
(see below), so every write contract — create, save, delete, duplicate, the Time Machine
audit rows, dataframe `id_key` stamping, portal writes, hierarchy provisioning — is
pinned by a TS-native gate. There are **17** of them, named `*_native.test.ts`
(`test/unit/observer_native.test.ts`, `test/unit/delete_multi_native.test.ts`,
`test/unit/portal_edit_writes_native.test.ts`, …). Their goldens were derived from the
pinned contract shapes, never from whatever the engine happened to emit — that is the
two-sided drift rule, and it is why they can still fail.

## Tier 2 — parity against the frozen fixture store (`test/parity/`)

A parity gate replays one request against the engine in-process (`dispatchRqo()`,
`src/core/api/dispatch.ts`) and diffs the result against the reference response that the
**retired v6 engine** produced for the identical request, harvested before the 2026-07-11
cutover and frozen in `test/parity/fixtures/oracle_harvest/` — **76 gate files, 449
recorded interactions**, matched by a canonical hash of the request.

This store is the read-path baseline of record. It is pinned to the DB snapshot taken at
the same instant as the final harvest: parity is only meaningful against DB state
compatible with the harvest, so restore-test against that pair and never mix.

### `ORACLE_MODE`

`oracleMode()` (`test/parity/oracle_fixtures.ts`) reads `process.env.ORACLE_MODE ?? 'fixtures'`.
An unknown value throws — a typo can never silently mean the default.

| Mode | Behavior |
|---|---|
| `fixtures` | **The default.** No network, no credentials. Each recorded response is served by request hash; a **miss throws loudly** and never falls through to green. |
| `record` | Historical. Froze a live reference response into the store. |
| `live` | Historical. Called the reference engine over HTTP. |

`record` and `live` remain selectable, but nothing answers them: the reference engine is
decommissioned, so **a re-harvest is impossible by definition**. Any change to a fixture
from here on is a deliberate contract edit and needs its `engineering/WIRE_CONTRACT.md`
entry in the same change.

Consequence for you: `bun test test/parity/` **runs green on a fresh clone with no
credentials at all**. It still needs the shared Postgres and the normal `../private/.env`
config, because the engine half of every diff runs for real.

### The green-suite trap

!!! warning "A green suite does NOT mean the assertions ran"
    Every differential is gated **at collection time** on an oracle-presence probe:
    `describe.if(<probe>)(…)` (or `test.if(<probe>)(…)` per case). When no oracle is
    available the body is never collected, so the gate **passes trivially**. Before the
    gating existed, an oracle-less run made about 83% of parity assertions vanish while the
    runner reported PASS with zero skips — pure false confidence.

The probe is a predicate exported by the parity API-client module in `test/parity/`. Under
the default `fixtures` mode it means *"is the harvested store on disk"*; under `live` it
meant *"are credentials configured"*. Copy the guard verbatim from a neighbouring
`*_differential.test.ts` — do not hand-roll one.

Two further rules follow from the same trap:

- **Never write a differential that could pass on an empty or degenerate response.**
  Assert on real emitted structure. A diff of `[]` against `[]` is the trap wearing a
  costume.
- A handful of tests still guard on the stricter *live*-oracle predicate (a value that can
  only be produced by an engine that no longer runs — for example a byte-compare of live
  Postgres sequence counters). Those report explicit **SKIP**. A skip is honest; a silent
  pass is not.

### The canary

`test/parity/oracle_canary.test.ts` is the one parity file that is **deliberately not
gated** — its whole job is to make an oracle-less run impossible to mistake for a verified
one. Never add a guard to it.

Under the default `fixtures` mode it asserts the store is present and non-empty, throws
with harvest guidance if it is not, and logs a `[oracle_canary]` line stating exactly what
the run does and does not verify: how many frozen responses are being served, from how many
harvested gate files, that read-path parity is verified against the **frozen** capture, and
how many fixture-exempt gates were skipped.

The fixture-exempt list (`FIXTURE_EXEMPT_GATES` in `test/parity/oracle_fixtures.ts`) is now
**empty**: the write-path gates that could not be served from a frozen response retired
with the reference engine, and their surviving contracts live in the `*_native.test.ts`
twins. `engineering/ORACLE_HARVEST.md` maps every retired gate to its twin.

`ORACLE_OPTIONAL=1` and `ORACLE_REQUIRED=1` still exist but only bite under an explicit
`ORACLE_MODE=live` run; they are vestigial in the default mode.

### Did my test actually assert anything?

The honest checks, in order of cost:

1. **Read the runner's own counts.** A differential that reports `0 pass, N skip` asserted
   nothing. Bun prints skips explicitly — that is the entire point of gating at collection
   time rather than returning early from the body.
2. **Watch the canary output.** It names the number of frozen responses being served.
3. **Break it on purpose.** Change the expected value, run the file, confirm it goes
   **red**, revert. A gate you have never seen fail is not a gate.
4. **A fixture miss is loud.** If your gate issues a request that was never harvested, the
   lookup throws and names the hash — it does not quietly return nothing.

### Normalization: ledger it, never smooth it over

`test/parity/normalize.ts` starts empty of cleverness. Every field it strips carries a
written justification in the file; anything not listed is compared byte-for-byte. Today it
strips only the per-session `csrf_token`, the transient `dedalo_last_error`, and the
recursive `debug` block.

When the engine **deliberately** differs from the frozen reference shape, the gate
transforms the reference side before diffing — and that transformation must be recorded as
a numbered entry in `engineering/WIRE_CONTRACT.md` (for example the unified empty-component
value `entries: []`). A normalization key with no ledger row is a regression in disguise.
The reviewer's question is always: *is this divergence deliberate and ledgered, or are you
papering over a diff?*

## The tripwires — the invariant-enforcement backbone

A documented invariant with no test that goes red on violation will rot. The 2026-07
foundation audit proved it from both sides: every invariant guarded only by prose had been
violated in practice; every tripwired boundary held. Hence the codebase's load-bearing
law — **invariants are tripwired or deleted**.

A tripwire is an ordinary test in `test/unit/` that greps the tree or asserts a boundary,
and reddens the moment a stated rule is broken. There are **23**, and they are what make
rules like *"no `process.env.` outside `src/config/`"* or *"no cross-request module state"*
mechanical instead of aspirational. A representative sample:

| Tripwire | Invariant it guards |
|---|---|
| `test/unit/sql_confinement_tripwire.test.ts` | Tiered SQL confinement — raw SQL only where it is allowed to live. |
| `test/unit/config_env_tripwire.test.ts` | No `process.env.` / `Bun.env` / `import.meta.env` outside `src/config/` — a stray read silently bypasses the typed catalog, and the setting "isn't taking effect". |
| `test/unit/module_state_tripwire.test.ts` | No cross-request module state. A module-level mutable `Map`/`Set`/`let` holding request, principal or language state bleeds one request into another under concurrency. |
| `test/unit/ws_a_tripwires.test.ts` | Every jsonb bind goes through the one codec; no inline locator comparisons. |
| `test/unit/import_scc_tripwire.test.ts` | No static value-import cycle of size > 1. |
| `test/unit/descriptor_completeness_tripwire.test.ts` | Component descriptors declare their required facets. |
| `test/unit/client_serving.test.ts` | The client serving contract: assets serve byte-identical to the `client/` tree on disk. |
| `test/unit/ci_workflow_tripwire.test.ts` | The CI wiring itself, including the two rules below. |
| `test/parity/oracle_canary.test.ts` | Oracle absence is loud, never a silent green. |

The **authoritative index is `engineering/TRIPWIRES.md`** — a machine-read contract, not a
status note. Two rules keep it from drifting:

- the `TRIPWIRES` array in `scripts/verify.ts` must equal that index **exactly**;
- `scripts/ci/hermetic.sh` runs a **subset** of the same list — the hosted CI tier may run
  fewer gates, never unknown ones.

Both are asserted by `test/unit/ci_workflow_tripwire.test.ts`, so adding a tripwire means
adding a row to the index *and* a line to `scripts/verify.ts` in the same change; either
alone is a red gate.

When you rely on a tripwire, **prove it honest**: plant a violation, watch that exact
tripwire go red, revert.

## `scripts/verify.ts` — the pre-merge gate

The deterministic "definition of done" for a change. It is *not* the full suite; it is the
fast gate that proves you did not break a tripwired invariant and that your change's
nearest gates still pass.

```bash
bun run scripts/verify.ts               # verify uncommitted work (vs HEAD)
bun run scripts/verify.ts --base master # verify the whole branch
bun run scripts/verify.ts --no-tests    # typecheck + lint only
bun run scripts/verify.ts --changed      # print the changed-file set and exit
```

Four stages, in cost order — typecheck (`bunx tsc --noEmit`), lint (`bunx biome check .`),
**all 23 tripwires**, then **neighbours**: the unit and parity test files that import any
`src/` file you touched, discovered from the git diff. Exit 0 only if every enabled stage
is green.

## `scripts/ci/hermetic.sh` — the DB-less tier

The public repo's CI runs on a bare hosted runner with no `../private/.env`, no Postgres
and no secrets. `scripts/ci/hermetic.sh` is the single source of truth for that tier —
both the GitHub workflow and the GitLab mirror invoke this one script, so the two platforms
cannot drift.

It runs `bun install --frozen-lockfile`, `bunx tsc --noEmit`, `bun run lint`, and the
**13** tripwires empirically proven to pass with no database (`DB_PORT` points at a
deliberately closed port, so an accidental DB touch fails loudly rather than silently
connecting). The 10 remaining tripwires — the ones needing the live Postgres, the client
tree or the fixture store — run in the self-hosted tier via `scripts/verify.ts`.

The script stubs **every** required-no-default key in `src/config/config.ts`. That list is
pinned by a rule of `ci_workflow_tripwire`, for a reason worth internalising: the first
version stubbed four of the eight required keys and passed on every developer machine —
because `../private/.env` was sitting right there, silently satisfying the other four. It
died on the first real runner. A gate that only passes because of your local environment is
not a gate. See `engineering/CI.md` for the full pipeline map.

## The client harness

```bash
bun run test:client        # scripts/client_test_runner.ts
```

The vanilla-JS client keeps its own in-browser **Mocha + Chai** suites, served at
`/dedalo/test/client/index.html` by a server running with `DEDALO_DEV_MODE=true`.
`scripts/client_test_runner.ts` drives them headlessly with Puppeteer: it launches Chrome,
opens the runner page, logs in through the client's own login form if
`page_globals.is_logged` is not `true`, clicks **run all**, polls until the button
re-enables, scrapes `window.global_stats` plus the per-group and per-suite DOM stats, and
**exits non-zero on any failure *or* any pending suite** (a suite that never completed is
not a pass).

It is deliberately **not** a `bun test` file — it needs a live server and a real browser,
so it stays outside `bunfig.toml` discovery and is invoked explicitly.

Operator facts:

- **Options** (each with an env fallback): `--url` (`TEST_URL`; otherwise built from
  `SERVER_TCP_PORT`, default `3500`), `--timeout` (`TEST_TIMEOUT`, default `300000` ms),
  `--headless` (`HEADLESS`, default `true` — pass `--headless false` to watch it run),
  `--user` / `--password` (`DEDALO_TEST_USER` / `DEDALO_TEST_PASSWORD`), and
  `--no-reseed`.
- **Credentials** resolve through the project env loader from `../private/.env`, exactly
  like the rest of the config. No secret needs to reach the command line.
- **Chrome** comes from `PUPPETEER_EXECUTABLE_PATH` if set, otherwise a system Chrome
  install via Puppeteer's `channel` — the bundled-Chromium download is deliberately not
  required.
- **Reseed.** The suites save random values into the shared `test3` playground records, so
  the runner restores the canonical `test3` fixture from its single verified source
  (`src/core/test_data/`) **before and after** the run. Suppress with `--no-reseed`. The
  reseed is DB-only: a long-lived dev server may still hold stale `test3`-derived caches
  afterwards, so restart it when full cache coherence matters.
- **In CI**, `scripts/ci/client_gate.sh` wraps all of this: it boots a server on port
  `3510` with every stateful surface pointed at scratch (socket, session sqlite, engine
  state file, diffusion job/activity tables), waits for `/health`, runs the suite, and
  tears everything down. That is what lets the gate run on the same machine as an
  interactive dev server without touching it. Note that `mocha` and `chai` are
  devDependencies — a runner that installed with `--production` cannot serve the harness.

## Scratch-write hygiene

Tests share the corpus Postgres with the running system. A careless write corrupts a real
record.

- **Never assert against a mutable production record.** Clone a **scratch twin**, exercise
  the real path against it, assert, and delete it — at both ends, not just in `afterAll`.
- DB writes go **only** to the scratch surfaces. The conventions live in one place,
  `test/helpers/test_data.ts` — do not invent new ones:
    - `test2` — a real ontology section resolving to `matrix_test`; use a reserved high
      `section_id` (900000+), clear of genuine records.
    - synthetic tipos (`testrt1`, `zztws*`, …) for write-kernel gates that must not touch a
      real section's ontology.
    - `test3` — only for gates that need the real playground ontology (children,
      relations). Create scratch records through `createSectionRecord()` and **never** touch
      the canonical ids.
    - `dedalo_ts_test_*` tables — the schema-enforced prefix for any scratch table
      (diffusion queues, writers, migrations).
- Clean up **everything you caused**, not just the row you created: Time Machine snapshots,
  activity rows, and diffusion log rows are all side effects of a write and will pollute the
  next gate.
- Never read or write the live session store. The `bunfig.toml` preload already redirects
  it; do not defeat the redirect.

## Writing a new test

Copy a neighbouring test in the right directory and adapt it — that is the fastest correct
path, and it inherits the guards.

**A pure or DB-backed gate** — the default for anything new:

1. Put it in `test/unit/` as `<thing>.test.ts` and import the module under test from
   `../../src/…`.
2. If it writes, use a scratch surface and clean up in `afterAll`.
3. If it asserts a *write* contract, model it on an existing `*_native.test.ts`: derive the
   golden from the specified contract, never from the engine's current output.

**A new invariant** — a rule you want to state in a header or a doc:

1. Write the tripwire in `test/unit/` first. If a rule cannot be mechanically checked, do
   not write the rule.
2. Add its row to `engineering/TRIPWIRES.md` **and** its line to `scripts/verify.ts` in the
   same change.
3. Plant a violation and confirm it goes red.

**A parity gate.** New read-path coverage cannot be harvested — there is nothing left to
harvest from. A new parity gate can only replay interactions already in the frozen store;
new coverage belongs in `test/unit/`, and any change to a fixture is a deliberate contract
edit with a `engineering/WIRE_CONTRACT.md` entry.

Finally, run your file while iterating and the gate before pushing:

```bash
bun test test/unit/my_thing.test.ts
bun run scripts/verify.ts
```

## A test that fails only in the full suite

Almost always one of two things, and almost never a real regression:

- **A leaked module mock.** `mock.module` is process-**global**, and `mock.restore()` does
  **not** revert it — a mock installed in one file stays installed for every file that runs
  after it. The pattern (see `test/unit/record_scope_gates.test.ts`): snapshot the real
  module's exports at import time and re-install them in an `afterEach`.

    ```ts
    import * as record_scope from '../../src/core/security/record_scope.ts';
    const REAL_RECORD_SCOPE = { ...record_scope };
    afterEach(() => {
        mock.module('../../src/core/security/record_scope.ts', () => REAL_RECORD_SCOPE);
    });
    ```

- **A scratch collision** — two gates reaching for the same scratch row, or a gate that did
  not clean up after itself.

Check both before you "fix" the code.

## See also

- [Development overview](index.md) — code style, commit convention, the broader dev guide
- [Breaking change detection](breaking_change_detection.md) — how contract stability is guarded
- [Runtime & request-scoped context](runtime_and_workers.md) — `handleRequest()` / `dispatchRqo()`, the surfaces these gates drive
- [Performance metrics](metrics.md) — latency signal in the runtime
- [Code documentation standard](code_documentation_standard.md) — doc-blocks inside the source
