# WC-060 — `inspect_ontologies`: a misfiled source record is drift kind `foreign`, not a phantom `missing`

`dd_ontology(tld)` is the projection of `matrix_ontology` section `<tld>0`, but a node's
tipo AND tld come from the RECORD's `ontology7`, not from the section it sits in.
`parseMatrixNodes(tld)` did not filter by tld while `storedNodes(tld)` read
`WHERE tld = $1`, so a record with a typo'd `ontology7` (live: `actv0/127` declares
`"act"`) parsed into another tld's namespace and could never appear in `stored`. It was
reported `missing` FOREVER, re-upserted by every reconcile — breaking the module's own
idempotency claim — and **written into the other tld's namespace** by a per-tld
operation, where `deleteTldNodes(tld)` could never take it back. `reconcile_ontologies`
therefore reported a permanent FALSE failure for a TLD it could never fix.

Both sides of the diff are now scoped to the inspected tld. Wire additions, all
backward-compatible:

- `states[].drift[].kind` gains **`'foreign'`** (`diffColumns:['tld']`), plus optional
  `source` (`'<section_tipo>/<section_id>'`) and `declaredTld`;
- `states[].foreignNodes` (count) is new;
- `states[].matrixNodes` now counts the tld's OWN nodes only — unchanged for every tld
  with no misfiled record.

Existing kinds are byte-unchanged. `ensureOntology`/`rebuildOntology` now REFUSE the
cross-namespace write and name the culprit.

**Client (closed same day):** `render_tool_ontology_parser.js` counted drift kinds by
name (`{missing, stale, orphaned}`) and its detail join had no `foreign` term, so a
foreign-only tld rendered a red "check failed" with an EMPTY reason — on the one panel
built to diagnose exactly this. It now renders `N misfiled`, counts any kind it does not
recognise as `N other`, and falls back to `out of sync` rather than an empty reason, so a
future kind can never blank the panel again.

Gate: `test/unit/ontology_state_foreign_tld.test.ts`.
