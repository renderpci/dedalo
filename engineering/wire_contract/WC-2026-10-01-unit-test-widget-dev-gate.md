# WC-2026-10-01-unit-test-widget-dev-gate — `unit_test` serves its dev posture and refuses the test-table reset outside dev mode

- **Date:** 2026-10-01 (owner decision: the panel's dev-only options must not be
  offered by a server that cannot honour them). Builds on WC-021.
- **Shape before (PHP / TS):**
  - catalog entry `unit_test`: `value: null`.
  - `widget_request` `unit_test.create_test_record`: always runs (TRUNCATE +
    canonical test3 restore, WC-021), whatever `DEDALO_DEV_MODE` says.
- **Shape after (TS):**
  - catalog entry `unit_test`: `value: { dev_mode: bool, harness_available:
    bool, harness_missing: string[] }` (`unitTestPosture`, eager, fail-soft to
    `null` like every eager value). `harness_missing` = the registry's
    `devOnly` client libs (mocha, chai) that `resolveClientLibPath` cannot
    serve; empty when dev mode is off.
  - `create_test_record` with `DEDALO_DEV_MODE` off: `ok:false`,
    `maintenance.dev_mode_required` (409, operator disclosure), nothing
    written. With dev mode on: unchanged (WC-021).
  - `long_process_stream`: unchanged, available everywhere (it touches no data;
    it diagnoses proxy SSE buffering, useful on production installs).
  - client: "Open JS unit test" + the test list render only when
    `harness_available === true`; the reset form only when `dev_mode === true`;
    otherwise an info line says why. A null value hides both (fail closed).
- **Reason:** a production install (`bun install --production`: the Dockerfile
  default target, the code updater) has no mocha/chai even with dev mode on, so
  the runner page died on JSON 404s ("MIME type ('application/json') is not a
  supported stylesheet MIME type"); and the matrix_test reset is a
  development-server action an admin could reach by POST regardless of the UI.
- **Gate reconciliation:** `test/parity/widgets_differential.test.ts` already
  EXCLUDES `value` from the catalog diff (per-widget payloads) — no change.
  TS ground truth: `test/unit/unit_test_dev_gate_native.test.ts` (posture vs the
  on-disk probes, eager value = posture, the refusal and its position before
  the reset, the client render gates).
- **Fixture interaction (DEC-14b):** NO re-harvest; the frozen PHP fixtures
  carry `value: null` for this widget, which the catalog gate does not compare.

## Addendum 2026-10-09 — the reset refuses where the test3 playground does not exist

- **Why:** installer unification A2 made the install seed CORE-ONLY — an
  installation receives no `test` TLD and no test3 records (the playground is
  the SUITE database's, built by `bun run test:db:setup`). On a dev server
  running an installation's database, `create_test_record` would TRUNCATE
  `matrix_test` and write records no ontology node describes.
- **Shape after (TS):** `create_test_record` with `DEDALO_DEV_MODE` on and no
  `dd_ontology` row for the test3 section: `ok:false`,
  `maintenance.action_refused` (400, public), `publicMessage` naming the cause
  and the remedy ("The test TLD is not installed on this database: the test3
  playground exists only in the suite database (bun run test:db:setup, browse
  it with bun run test:client:server). Nothing was written."), coordinates
  `{widget_action: 'unit_test.create_test_record'}`. Checked AFTER the dev-mode
  refusal and BEFORE the reset. With the node present: unchanged (WC-021).
- **Gate:** `test/unit/unit_test_dev_gate_native.test.ts` — dev mode ON, the
  test3 node deleted inside a rolled-back transaction: the refusal code, the
  remedy in the public message, `matrix_test` row count unchanged; source order
  dev-mode guard → installed guard → reset.
- **Fixture interaction (DEC-14b):** none (no frozen fixture exercises the
  action on a database without the node).
