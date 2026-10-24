# WC-2026-10-21-ontology-projection-guard — tool_ontology admits only ontology node sections; a record never projects outside its own namespace

- **Date:** 2026-10-21 (audit 2026-09-26, Step 5 ONT-2). Amends WC-043 / WC-058.
- **Decision:** owner decision D1 (2026-09-30): `ontology1..N` is not admitted.
- **Shape before (PHP / TS):** `tool_ontology::set_records_in_dd_ontology` accepted any
  `section_tipo`. A record whose `ontology7` named another tld OVERWROTE that tld's canonical
  node (`zzgua0/5` with `ontology7='zzgub'` wrote `zzgub5`); a record of a section no tld governs
  (`test3`, `ontology1`) carrying an `ontology7` was projected as a node; list mode resolved
  the client's sqo over ANY section and re-attributed the matched ids to
  `options.section_tipo`. On `ontology35` an active tld got only its `<tld>0` root re-planted.
- **Shape after (TS):**
  - **Admission, before any search or write:** `ontology35` → the activation route; a governed
    `<tld>0` section → the projection route; anything else (`ontology1..N`, `localontology0`,
    `test3`, …) → `request.invalid_options`, public message
    `section_tipo '<x>' is not an ontology node section`. Deliberately narrower than the
    tool's declared dd1350 rule.
  - **List mode:** the sqo's `section_tipo` must be exactly `['<section_tipo>']` (the bare
    string `'<section_tipo>'` is the same axis and is accepted), else
    `request.invalid_options` (`sqo section_tipo must be exactly ['<x>']`). The assembler
    scopes the whole query to that axis, so every matched row is a record of `<section_tipo>`
    and its id is read under it (on `ontology35`, as a registry id). A sqo with
    `children_recursive: true` is REFUSED on both routes (`request.invalid_options`,
    `a children_recursive sqo cannot scope this action: …`), nothing written: the search layer
    merges descendant ids of ANY section into one section_id list the axis then scopes
    (`src/core/search/sql_assembler.ts` childrenRecursiveFilter), so it would select same-id
    records of `<section_tipo>` the caller never chose and lose the real descendants
    (measured: `zzgua0/1` with descendant `zzgub0/8` matches `zzgua0/8`). Projection of
    descendants under their OWN sections is NOT delivered; it needs the assembler to return
    them per section (open, outside this entry).
  - **Per record:** a record parsing into another namespace is an error line
    (`<x>0/<id> declares tld '<y>' (parses to '<tipo>'), not '<x>' — nothing written`); the
    rest of the batch still runs (partial success, unchanged); a batch where every record
    fails answers `tool.action_failed` as before. ONLY that refusal is tolerated (it is its
    own class, `ForeignOntologyNodeRefused`, code `ontology.invalid_node`): a grammar or
    DB-constraint `ontology.invalid_node` from the write stays fatal to the batch, as it was
    before this entry.
  - **`ontology35`:** "active" stays what it was (PHP `check_active_tld` = getActiveTlds: the
    tld still has dd_ontology rows — NOT the hierarchy4 flag; owner question Q1 open). An
    ACTIVE tld whose projection DRIFTED (inspectOntology) is now re-derived in full
    (`rebuildOntology`, `mainNode: 'existing'`): a partial projection, e.g. root-only, gets
    every node back. An active tld already in sync only gets its `<tld>0` root re-planted (the
    PHP behaviour), so a list-mode run over the registry rewrites only what is broken; its
    residual cost is one parse per matched tld (~0.14 ms per node, measured) plus a rebuild per
    drifted tld, synchronous in the request. A tld with NO rows is left empty — it cannot be
    re-activated through this action — and nothing is ever retracted here: under this
    definition the old "inactive ⇒ retract" branch was unreachable (a tld with rows is active
    by construction), so it is gone. Retraction and re-activation become real only if
    activation is keyed on hierarchy4 (Q1). "Active" is decided UNDER the tld's projection
    lock and read live, not from the getActiveTlds cache (closure r1): a teardown whose
    retract committed first leaves the tld empty instead of getting its root re-planted (WC
    ontology-record-lifecycle, Concurrency; gate ontology_projection_race_native R6/R7).
  - The `<tld>0` root re-derived by the activation and by the ontology update hangs under its
    typology grouper `ontologytype<N>` by NAME; the grouper tld (its registry row, its
    `ontologytype0/<N>` record, its node) is not written.
  - `setRecordsInDdOntology` refuses a non-governed section (`Error. '<x>' is not an ontology
    node section`); `insertDdOntologyRecord` throws `ontology.invalid_node` for it.
- **Reason:** addressing rule INV-A — a governed record `<tld>0/<id>` may only ever project the
  node `<tld><id>`; the tipo is derived from the address, never from record data.
- **Gate reconciliation:** TS-native `test/unit/ontology_projection_guard_native.test.ts`
  (G2a/b/c/d/e/f, list-mode success path included; G2d's control pins the assembler's
  re-attribution, so it goes red when the assembler is fixed and the refusal can be lifted), `test/unit/tool_ontology.test.ts`,
  `test/unit/tool_ontology_scope.test.ts`, `test/unit/ontology_derive_packages_native.test.ts`
  (G1d root under its grouper by name, G1e activation: drifted / converged / no rows). No parity gate replays
  this action; no re-harvest.
