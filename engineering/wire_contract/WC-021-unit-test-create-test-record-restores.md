# WC-021 — `unit_test.create_test_record` restores the canonical test3 fixture (PHP twin stays live-defective)

- **Date:** 2026-07-10 (single-verified-source rebuild of the test3 playground
  data; owner decision — the maintenance reset must actually RESTORE the
  playground, not destroy it).
- **Shape:** wire strings unchanged (`dd_area_maintenance_api` /
  `widget_request` / model `unit_test` / action `create_test_record`; msg
  `OK. Request done unit_test::create_test_record`). TS behavior: TRUNCATE
  matrix_test, restart its id sequence, insert the FULL canonical record set
  from `src/core/test_data/test3_canonical.json` (records 1/2/27; shape
  contract in `src/core/test_data/manifest.ts`), exact-set the `test3`
  matrix_counter to MAX(section_id). Surgical sibling for harnesses:
  `restoreCanonicalTest3()` (test3 rows only, raise-only counter, no
  truncate/sequence touch).
- **Divergence:** the PHP twin is live-defective — its `test_data.json` still
  carries V6 column shapes AND re-appends the explicit
  section_id/section_tipo columns, so the PHP reset TRUNCATEs then DIES
  (`column "section_id" specified more than once`), leaving matrix_test EMPTY
  with `result:false`. PHP restores nothing; TS restores everything.
  Coexistence (shared DB): a PHP-triggered reset still empties the table —
  the TS harness self-heals (`ensureCanonicalTest3()` in the shape-dependent
  gates, plus the client-runner reseed) and the widget re-populates on demand.
- **Gate reconciliation:** `test/parity/widget_request_differential.test.ts`
  pins BOTH sides in one snapshot-protected test (PHP: result:false +
  duplicate-column msg + empty table; TS: exactly the canonical records +
  exact counter). Fixture truth: `test/unit/test3_canonical_fixture.test.ts`
  (tripwire — coverage vs the test3 ontology subtree, REQUIRED_SHAPES,
  restore/reset round-trips).
