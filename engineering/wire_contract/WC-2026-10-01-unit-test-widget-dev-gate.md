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
