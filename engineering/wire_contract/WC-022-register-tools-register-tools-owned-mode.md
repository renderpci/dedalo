# WC-022 — `register_tools.register_tools` OWNED-mode report items (TS installer shape, not PHP `file_info` rows)

- **Date:** 2026-07-10 (UPDATE_PROCESS Phase 1 — the register_tools import
  unlocked behind the standalone-ownership gate).
- **Shape:** only reachable when `core/update/ownership.ts engineOwnsInstall()`
  is true (historically the TS install seal + `DEDALO_ENGINE_OWNS_INSTALL`;
  the gate collapsed to ALWAYS TRUE at the 2026-07-11 cutover — PHP retired). Envelope bytes match the oracle
  (`class.register_tools.php::register_tools`): `result` = per-tool array
  (truthy), `msg` = `OK. Request done successfully` |
  `Warning! Request done with errors`, `errors` = flat per-tool error strings.
- **Divergence:** the per-tool `result` items are the TS installer shape
  `{name, dir, version, imported, errors, warnings}`
  (`src/core/install/register_tools.ts` precedent) instead of PHP's
  `tools_register::import_tools` objects (`file_info`, ontology-merge fields).
  The byte-identical client renders the envelope generically
  (`render_register_tools.js` print_response: msg + joined errors + a JSON
  tree of the whole envelope, then repaints from `get_value`), so no client
  field-access depends on the item shape; the TS items are the more useful
  diagnostic rows.
- **Coexisting (gate closed) is UNCHANGED:** the dry-run diff report
  (`dry_run/total/invalid_count/would_change_count/report`) stays byte-frozen
  — pinned by `test/parity/widget_request_differential.test.ts`.
- **Gates:** `test/unit/register_tools_widget.test.ts` (open-mode bytes via
  mocked gate + importTools spy proving `{dryRun:false}`; closed-mode dry-run
  envelope); `test/unit/update_ownership_tripwire.test.ts` (the action is
  gated, EXPECTED_GATED-frozen, and its open branch is NOT a stub).
