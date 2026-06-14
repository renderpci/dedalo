# Testing

Dédalo v7 ships an automated test suite under `test/`. It splits into three layers,
each with a different purpose, runner and CI status:

| Layer | Location | Runner | What it covers | In CI |
|-------|----------|--------|----------------|-------|
| Server | `test/server/` | PHPUnit (`vendor/bin/phpunit`) | The PHP core: components, API, search, security, tools, ontology, hierarchy, … | Yes (full suite) |
| Client | `test/client/` | Mocha + Chai, in a browser | The live JS modules against a real API (instance lifecycle, component render) | No (manual) |
| Acceptance | `test/acceptance/` | Plain PHP CLI | One end-to-end diffusion gate against a live dev stack | No (manual) |

The server layer is the dominant one — 157 `*_Test.php` files — and the only layer
gated by CI. The client harness and the acceptance gate are run by hand.

## Layer 1 — Server (PHPUnit)

The bulk of the suite. Each subdirectory of `test/server/` is wired as its own PHPUnit
testsuite in `test/server/phpunit.xml`, so a suite name maps directly to a directory.

### Directory layout

```text
test/server/
├── phpunit.xml            # suite definitions + PHP ini
├── bootstrap.php          # loaded before any test (see below)
├── class.BaseTestCase.php # base class every test extends
├── api/                   # API entrypoints           (suite "API")
├── components/            # one file per component model (the bulk)
├── contract/              # API response-shape snapshots (suite "contract")
├── search/                # SQO → SQL building
├── security/              # permissions / access
├── login/                 # auth + login_test::force_login helper
├── tools/                 # tool availability + parity snapshots
├── ontology/ ontology_engine/
├── ts_object/ hierarchy/  # thesaurus tree
├── diffusion/ section_record/ dd_grid/ section_map/ …
└── components/data.php    # random-value fixture generators
    components/elements.php
```

PHPUnit is a Composer dev dependency (`phpunit/phpunit: ^13.0`, requiring PHP `>=8.4`)
installed at `vendor/bin/phpunit`. Install it with `composer install` if it is missing.

### Running it

Run from `test/server` (the working directory matters — `phpunit.xml` and the relative
suite paths are resolved from there):

```bash
# from test/server — full suite (exactly what CI runs)
../../vendor/bin/phpunit

# a single suite (suite name == directory name)
../../vendor/bin/phpunit --testsuite "components"
../../vendor/bin/phpunit --testsuite "search"
../../vendor/bin/phpunit --testsuite "API"

# a single test method, across the whole suite
../../vendor/bin/phpunit --filter test_get_data

# coverage (slow)
../../vendor/bin/phpunit --coverage-html coverage/
```

A single file can also be targeted from the repo root:

```bash
vendor/bin/phpunit test/server/components/component_text_area_Test.php
```

Snapshot / parity tests regenerate their baselines with an environment flag (see
[Contract tests](#contract-tests-shape-stability) below):

```bash
UPDATE_SNAPSHOTS=true ../../vendor/bin/phpunit --testsuite contract
```

### `phpunit.xml`

The config is deliberately small:

- `bootstrap="bootstrap.php"` — loaded once before any test.
- `cacheResult="false"` — no test-result cache; every run is from scratch.
- `error_reporting` is pinned to `E_ALL & ~E_NOTICE & ~E_DEPRECATED`. This re-enables
  `E_WARNING` so warnings **surface in the output**, while notices and deprecations
  stay muted until the legacy noise is baselined. This only changes what PHP *reports* —
  it does **not** make warnings fail the suite.
- One `<testsuite>` per directory. Two exclude a sub-path: `contract` excludes
  `contract/snapshots`, and `db` excludes `db/acc`. The `<source>` block globally
  excludes `*/acc` and `*/files`.

> **`acc` directories are always ignored** — across the whole repo, not just tests.

### `bootstrap.php`

The bootstrap is a safety gate as much as a loader. It:

- runs under `declare(strict_types=1)` and defines `SHOW_DEBUG`, `IS_UNIT_TEST=true`
  and `TEST_USER_ID=-1` (the `DEDALO_SUPERUSER` root development user), then loads
  `config/config.php`;
- **refuses to run unless `DEVELOPMENT_SERVER===true`** and dies if the system is in
  maintenance mode — a hard guard against ever pointing the suite at production;
- defines `TEST_HOST` and `DEDALO_API_URL_UNIT_TEST` for the internal API calls that
  some tests make;
- requires `class.BaseTestCase.php`, `login/login_Test.php` and the component fixtures
  `components/data.php` + `components/elements.php`;
- logs out any stale session, installs the `PHPUnitUtil::callMethod()` reflection helper
  (for exercising private methods), and creates a Postgres
  `duplicate_table_with_independent_sequences()` function used by the DB tests.

### `BaseTestCase` and conventions

Every server test extends `BaseTestCase` (`test/server/class.BaseTestCase.php`). Its
`setUp()` does the per-test housekeeping that keeps security and tool tests from
cascade-failing:

- logs in the test user via `login_test::force_login()`;
- forces `is_global_admin` / `is_developer` on the session;
- grants permissions (level `2`) on the canonical test sections `test3`, `oh1`,
  `rsc197`, `dd88` (plus the ontology section) and rebuilds the in-memory permissions
  cache (`security::reset_permissions_table()` + a direct
  `security::$permissions_table_cache` repopulation).

Useful helpers on the base class:

| Helper | Use |
|--------|-----|
| `user_login()` | ensure / re-assert the logged test user |
| `get_sample_data($model)` | load `core/<model>/samples/data.json` |
| `execution_timing($action, $callback, $estimated_ms, …)` | run a callback `n` times and assert it stays under `1.6 ×` the estimate (perf guard) |

**Naming.** Files are `<thing>_Test.php`; the class is usually
`final class <model>_test extends BaseTestCase`; test methods are `test_*`. Within
`components/` there are three flavours: the base `component_<x>_Test.php`, the search
variant `component_<x>_Search_Test.php`, and the dataframe variant
`component_<x>_dataframe_Test.php`.

Most assertions are type/shape checks (`assertTrue(gettype(...)===...)`) layered with
targeted behavioural checks. Search tests use a `#[DataProvider]` to feed an SQO and
assert the produced SQL string.

### Fixtures

Test data is canonical and fixed, not generated per run:

- The canonical fixture tipos are **`test52`** / **`test80`** (`component_input_text`)
  in section **`test3`**, instantiated with `component_common::get_instance(...)`.
- Per-model sample data lives in `core/<model>/samples/data.json`, read via
  `get_sample_data()`.
- Random-value generators (for stress / shape tests) live in
  `test/server/components/data.php`; `elements.php` carries element fixtures.

### Contract tests (shape stability) {#contract-tests-shape-stability}

`test/server/contract/` is "snapshot" testing: it freezes the JSON **shape** of API
responses so an accidental structural change is caught. `ApiContractSnapshotTest.php`
(extends `BaseTestCase`) drives real entrypoints —
`dd_diffusion_api::get_ontology_map()` / `validate()`,
`dd_utils_api::get_login_context()` / `get_element_context()`, and
`component_input_text->get_json()` — and asserts each matches a stored baseline in
`contract/snapshots/` via `SnapshotComparator.php`.

```bash
# run the contract suite
../../vendor/bin/phpunit --testsuite contract

# one contract test
../../vendor/bin/phpunit --filter test_get_ontology_map_contract

# regenerate baselines after an INTENTIONAL shape change
# (the test then skips for that run)
UPDATE_SNAPSHOTS=true ../../vendor/bin/phpunit --testsuite contract
```

A sibling "parity" pattern lives in `test/server/tools/`
(`get_tools_availability_Test.php`, `tool_caches_Test.php`, `tools_register_Test.php`)
checked against `snapshots/get_tools_parity.json`.

For the full breaking-change story (method-signature tracking, data-model change
detection, when a contract change is breaking vs. safe), see
[breaking_change_detection.md](breaking_change_detection.md).

## Layer 2 — Client browser harness

A Mocha (BDD) + Chai harness that runs **in the browser** against the live JS modules
and a real API — there is no headless mocking. Run it by opening the runner in a
browser:

```text
test/client/index.html
```

How it is wired:

- `index.html` is a terminal-style runner: a sidebar plus an iframe. `js/list.js`
  enumerates `list_of_test` (lifecycle suites) and `livecycle_detail` (per-component
  suites); each name maps to a `js/test_<area>.js` file.
- `js/index.js` bootstraps the page (`get_environment`, login via `instances.js`), then
  `load_test()` loads `frame.html` per test.
- `js/frame_runner.js` runs inside the iframe: it imports the selected test file, runs
  Mocha, and `postMessage`s pass/fail/end back to the parent.
- `js/test_bootstrap.js` (a classic, CSP-compliant script) sets up Mocha BDD and the
  global `assert = chai.assert` before the module runners. `js/exec.js` is a legacy
  no-op.

This layer has **no CI hook** — run it manually after touching client JS.

## Layer 3 — Acceptance gate

A single manual end-to-end gate for the diffusion system:

```bash
php test/acceptance/diffusion_acceptance.php
```

It runs against a **live dev stack** (PostgreSQL + the Bun diffusion engine + a seeded
diffusion ontology) and checks: engine-socket reachability, server-to-server token
auth, SQL/RDF/XML element resolution, the publish pipeline, and the hybrid
delete / pending-retry cycle.

It is **fail-closed** (refuses to run unless `DEVELOPMENT_SERVER===true`) and uses a
**fabricated record id (`99900199`)** so no real data is touched; activity rows it
creates are cleaned up afterwards. It is **not in CI** — it is the manual,
production-quality gate.

> The diffusion **engine itself** (the Bun/TypeScript code under `diffusion/api/v1/`)
> has its own separate test suite — `bun test` against MariaDB — run by the
> `bun-test.yml` workflow, not by PHPUnit.

## Continuous integration

The CI hooks live in `.github/workflows/`:

| Workflow | Triggers | Runs |
|----------|----------|------|
| `phpunit.yml` | push / PR to `v7_developer` or `master` | the **full** server suite |
| `bun-test.yml` | changes under `diffusion/api/v1/**` | the diffusion engine (`bun test` + `tsc`) |

`phpunit.yml` spins up Postgres 18, sets up PHP 8.4 (`mbstring`, `pdo`, `pdo_pgsql`),
generates configs from `config/sample.config*.php` (forcing `DEVELOPMENT_SERVER=true`),
loads `install/db/dedalo6_install.pgsql.gz`, runs `composer install`, then runs
`../../vendor/bin/phpunit` in `test/server` — **the entire suite, not a subset**.
Post-steps run the signature- and ontology-tracker checks with
`continue-on-error: true`.

`bun-test.yml` provisions MariaDB 11, pins the Bun runtime, typechecks, and runs the
engine's integration tests against a dedicated throwaway database.

The remaining workflows — `phpstan.yml`, `phpmd.yml`, `php-lint.yml`, `codeql.yml`,
`secrets-scan.yml` — are **static analysis**, not the test suite. The client harness and
the acceptance gate have **no CI hook**; both are manual.

## Writing a new server test

The fastest path is to copy an existing test in the right subdirectory and adapt it.
A new component test looks like this:

```php
<?php declare(strict_types=1);
// bootstrap (resolves config, login, fixtures, the dev-server guard)
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';

final class component_my_thing_test extends BaseTestCase {

    public static $model        = 'component_my_thing';
    public static $tipo         = 'test52';   // canonical fixture tipo in test3
    public static $section_tipo = 'test3';

    public function test_set_data() : void {

        $component = component_common::get_instance(
            self::$model,
            self::$tipo,
            1,                 // section_id
            'edit',            // mode
            DEDALO_DATA_NOLAN, // lang
            self::$section_tipo
        );

        // exercise the component, then assert shape / behaviour
        $this->assertTrue( gettype($component->get_dato()) === 'array' );
    }
}
```

Checklist:

1. Put the file in the subdirectory whose suite it belongs to (`components/`,
   `search/`, `security/`, …) and name it `<thing>_Test.php`. It is picked up
   automatically — there is **no** entry to add to `phpunit.xml`.
2. Start with `<?php declare(strict_types=1);` and require `bootstrap.php`.
3. Extend `BaseTestCase` so login, permissions and fixtures are in place; declare the
   class `final` and methods as `test_*`.
4. Build instances through the framework
   (`component_common::get_instance(...)`, `section::get_instance(...)`) using the
   canonical fixtures (`test3` / `test52` / `test80`) rather than inventing data.
5. For private methods, use `PHPUnitUtil::callMethod($obj, $name, $args)`.
6. For API response shapes, prefer a **contract** test (add a method to
   `ApiContractSnapshotTest.php` and generate its baseline with
   `UPDATE_SNAPSHOTS=true`) over hand-asserting every key.
7. Run your file directly while iterating, then run the whole suite before pushing:
   ```bash
   vendor/bin/phpunit test/server/components/component_my_thing_Test.php
   ```

## See also

- [Development overview](index.md) — code style, commit convention, the broader dev guide
- [Breaking change detection](breaking_change_detection.md) — contract snapshots, signature & data-model tracking, and the CI gate
- [Performance metrics](metrics.md) — `execution_timing()` and the per-subsystem metrics the tests can lean on
