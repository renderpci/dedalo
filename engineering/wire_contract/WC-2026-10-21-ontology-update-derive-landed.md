# WC-2026-10-21-ontology-update-derive-landed — an ontology update whose dd_ontology re-derive fails after the import is reported as landed, never rolled back

- **Date:** 2026-10-21 (W4 cross-write:r3, review-diff finding "A throw during the
  dd_ontology re-derive restores the old matrix rows under tlds already re-derived from the
  new ones"). Amends `WC-2026-10-21-ontology-recovery-single-flight` (the landed tail).
- **Decision:** DEC-12 (gated: `ontology_update_derive_throw_native`).
- **Shape before (TS):** `update_ontology` (and the installer's ontology door, the same shared
  layer) marked the import completed only after the per-tld re-derive. A throw escaping the
  re-derive after one tld had committed restored the Phase-B snapshots: the OLD
  `matrix_ontology` rows came back under the dd_ontology already derived from the NEW ones,
  answered `'Error. Import failed — matrix rows restored; …'`.
- **Shape after (TS):** the import is LANDED once Phase C has committed every slice. A
  re-derive failure after that — rolled back or thrown — restores nothing: the update goes
  on (dependency report, grammar, optimize, schema file) and answers `ok:true` with
  `'Warning! Request done with errors …'`; `errors[]` gains
  `'the ontology rows of this update were imported; re-deriving dd_ontology from them failed
  (see the server log) — rebuild the ontology of: <tld>, …'` naming every node-deriving tld of
  the update (the raw error goes to the server log). The installer still treats any error as
  a failed install.
- **Reason:** the matrix rows are the source of truth and the re-derive is per-tld committed
  work; a restore after the first commit leaves a tld whose dd_ontology is not the parse of
  its rows — the state neither version was ever in. A landed import with a named rebuild is
  recoverable by the existing per-tld rebuild.
- **Gate reconciliation:** TS-only (update panel, no oracle shape; no fixture or re-harvest).
