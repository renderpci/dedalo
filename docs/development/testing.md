# Testing

The Dédalo TS server ships its automated test suite under `test/`, run by
**`bun test`** (`bun:test` — Bun's built-in Jest-compatible runner). The suite is
built around one governing idea: **the live PHP server is the oracle.** Most tests
are *differential* — they replay an identical RQO against both the PHP reference
API and the TS server and diff the results — so parity with the system being
replaced is verified continuously, not asserted from memory.

The suite splits into two directories plus an out-of-band browser harness:

| Layer | Location | Runner | What it covers |
|-------|----------|--------|----------------|
| Differential parity | `test/parity/` | `bun test` | An RQO replayed against live PHP **and** TS, diffed (`*_differential.test.ts`) — read, save, count, menu, tools, areas, relations, ontology, … |
| Unit / integration | `test/unit/` | `bun test` | TS internals against the real DB or offline fixtures — codec round-trips, security fail-closed, media, RAG, import, locator law, `change_lang`, … |
| Client browser harness | `client/dedalo/test/client/` | `bun run test:client` (headless Chrome) | The copied vanilla-JS client's Mocha/Chai suites driven against the TS server |

!!! note "This replaces the PHP PHPUnit suite"
    The PHP reference kept its tests under `test/server/` (PHPUnit, `*_Test.php`,
    `BaseTestCase`, `phpunit.xml`) plus an in-browser Mocha harness and a manual
    diffusion acceptance gate. The TS rewrite carries **none** of that machinery.
    There is no `phpunit.xml`, no `vendor/bin/phpunit`, no `BaseTestCase`. The
    differential harness under `test/parity/` is the new center of gravity: it
    holds the port to the PHP contract byte-for-byte.

## Running the suite

```bash
# the whole suite (parity + unit)
bun test

# one directory
bun test test/unit
bun test test/parity

# one file
bun test test/parity/read_differential.test.ts

# tests whose name matches a pattern
bun test --test-name-pattern "save round-trip"
```

Discovery and timeouts are configured in `bunfig.toml`:

- `root = "test"` confines test discovery to the `test/` tree. This matters: the
  **copied client** (`client/dedalo/…`) contains view files whose names match the
  default test globs (`core/widgets/test/…`), and without the root confinement
  Bun would try to run them.
- `timeout = 30000` — parity tests talk to a live PHP server and the real DB, so
  the default timeout is generous.

The static/type gate is separate: `bun run lint` (Biome, config in `biome.json`)
and `tsc` (strict, `tsconfig.json` — `noUncheckedIndexedAccess`, `strict`, …).
Biome ignores `client/**`, the parity response fixtures, and the tool asset trees.

## Layer 1 — Differential parity (`test/parity/`)

This is the dominant layer. A `*_differential.test.ts` file:

1. logs a `PhpApiClient` into the **live PHP server** (`test/parity/php_client.ts`,
   base URL + dev credentials from `PHP_API_BASE_URL` / `PHP_API_USERNAME` /
   `PHP_API_PASSWORD` in `../private/.env`), maintaining the PHP session cookie
   and echoing the per-session CSRF token exactly as the browser client does;
2. calls the **same RQO** against the TS server in-process via `dispatchRqo()`
   (`src/core/api/dispatch.ts`) with a constructed `ApiRequestContext`;
3. **normalizes** both responses (`test/parity/normalize.ts`) and asserts they
   match.

```ts
// shape of a differential test (abridged, from start_differential.test.ts)
import { dispatchRqo } from '../../src/core/api/dispatch.ts';
import { PhpApiClient, hasPhpCredentials } from './php_client.ts';

const client = new PhpApiClient();
await client.login(config.phpReference.username, config.phpReference.password);
const { body: phpBody } = await client.call({ action: 'start', options: {} });

const outcome = await dispatchRqo({ action: 'start', dd_api: 'dd_core_api', options: {} }, adminContext);
// … project the comparable subset out of each and expect() them equal …
```

### Normalization is deliberately minimal

`test/parity/normalize.ts` **starts empty of cleverness.** Every field it strips
carries a written justification in the file; anything not listed is compared
byte-for-byte. This is a hard rule (harness honesty): over-normalization hides
real regressions. Today it strips only:

- top-level `csrf_token` (per-session random) and `dedalo_last_error` (transient);
- the `debug` key recursively (PHP dev-mode `exec_time` / `memory_usage` / `sqo`
  noise, absent when PHP runs in production mode).

### Guarding against a missing oracle

When the PHP credentials are not configured, `hasPhpCredentials()`
(`test/parity/php_client.ts`) returns false and each differential test **returns
early** rather than failing — so the suite still runs (unit layer + any
DB-backed checks) on a machine without a live PHP reference. A differential test
is only meaningful with the oracle present.

### Scratch-twin write hygiene

Write-path differentials never mutate real records. They clone a real record into
a **playground table/id** (e.g. `matrix_test`, high `section_id`s like `900002`),
exercise the full TS write path there, assert, and clean up in `afterAll`. See
`test/unit/save_roundtrip.test.ts` for the canonical pattern (clone → save →
assert per-key `jsonb_set` isolation + a `matrix_time_machine` audit row → delete).

### Fixtures

`test/parity/fixtures/` holds captured request/response pairs and SQL seeds
(`rqo_read_section.json` / `.response.json`, `dmm_map_of_grapes.seed.sql`,
`portal_drag_client_capture.json`, …). These let a few tests replay a captured
client interaction (e.g. a portal drag) deterministically without re-driving the
browser.

## Layer 2 — Unit / integration (`test/unit/`)

The unit layer exercises TS internals directly. Some tests are pure/offline;
many run against the **real Postgres** (the same DB the PHP server uses) because
the rewrite's contract is byte-compatibility with that schema. Representative
files:

- `json_codec_roundtrip.test.ts` / `matrix_write_roundtrip.test.ts` — the JSONB
  codec and per-key write isolation.
- `security_fail_closed.test.ts` / `search_gates.test.ts` / `csrf_handshake.test.ts`
  — the security gates deny by default.
- `locator_law.test.ts` — the PHP-faithful `compare_locators` predicate.
- `change_lang.test.ts` — request-scoped language override (see
  [Internationalization](internationalization.md)).
- `media_*.test.ts`, `import_*.test.ts`, `rag_*.test.ts`, `tool_*.test.ts` —
  media pipeline, importers, RAG, and tool servers.

A unit test is an ordinary `bun:test` file:

```ts
import { describe, expect, test } from 'bun:test';
// … import the module under test from ../../src/… …

describe('component save round-trip', () => {
    test('sibling component keys are untouched', async () => {
        // arrange in a playground row, act through the real path, assert
        expect(/* … */).toBe(/* … */);
    });
});
```

## Layer 3 — Client browser harness

The copied vanilla-JS client keeps its own in-browser **Mocha + Chai** suites,
served by `src/server.ts` under `/dedalo/test/client/`
(`client/dedalo/test/client/index.html`). Rather than open a browser by hand, the
TS repo drives them headlessly:

```bash
bun run test:client        # scripts/client_test_runner.ts
```

`scripts/client_test_runner.ts` launches headless Chrome (Puppeteer), opens the
runner page against the TS server, logs in through the client's own login form
(the same form that proved out against the TS-native auth/CSRF in Phase 7),
clicks "run all", scrapes `window.global_stats`, and exits non-zero on any
failure or pending test. It is deliberately **not** a `bun test` file — it needs
a live server plus a real browser, so it stays out of `bunfig.toml` discovery and
is invoked explicitly. See `rewrite/client_tests.md` for the operator guide.

## The diffusion engine has its own suite

The **diffusion engine** (the separate Bun process under `diffusion/api/v1/`) is
tested by its own `bun test` against MariaDB — independent of the work-system
suite documented here. Do not conflate the two.

## Writing a new test

The fastest path is to copy an existing test in the right directory and adapt it.

**A new differential (parity) test** — the default for any ported behavior:

1. Put it in `test/parity/` named `<thing>_differential.test.ts`.
2. Log a `PhpApiClient` into the live PHP server and capture the reference
   response for your RQO.
3. Call the same RQO through `dispatchRqo()` against the TS server.
4. Guard the body with `if (!hasPhpCredentials()) return;` so it no-ops without
   the oracle.
5. Project the *comparable* subset (or run both through `normalize.ts`) and
   `expect()` equality. If you must strip a volatile field, add it to
   `normalize.ts` **with a written justification** — never silently.

**A new unit test** — for TS internals with no PHP counterpart, or a focused
invariant:

1. Put it in `test/unit/` named `<thing>.test.ts`.
2. Import the module under test from `../../src/…`.
3. If it writes, use a playground table/id and clean up in `afterAll` — never
   touch a real record.

Run your file directly while iterating, then the whole suite before pushing:

```bash
bun test test/parity/my_thing_differential.test.ts
bun test
```

## See also

- [Development overview](index.md) — code style, commit convention, the broader dev guide
- [Breaking change detection](breaking_change_detection.md) — how contract stability is guarded in the TS rewrite
- [Runtime & request-scoped context](runtime_and_workers.md) — `handleRequest()` / `dispatchRqo()`, the surfaces the harness drives
- [Performance metrics](metrics.md) — latency signal in the TS runtime
