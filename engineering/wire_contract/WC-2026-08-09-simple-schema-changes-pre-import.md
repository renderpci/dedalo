# WC-2026-08-09-simple-schema-changes-pre-import — the ontology-update schema-changes artifact is diffed against the PRE-import schema

- **Date:** 2026-08-09 (CRAP defect-ledger D8).
- **Decision:** — (DEC-12 gate: `test/unit/ontology_update_schema_capture_native.test.ts`,
  which pins the CAPTURE ORDER; `test/unit/ontology_ingest.test.ts` keeps pinning
  `saveSimpleSchemaFile`'s pure differ and its PHP message bytes, unchanged.)

### Shape before (PHP, and TS until 2026-08-09)

`update_ontology` step 5 read the "old" section schema AFTER the row import and
the `dd_ontology` re-index, and only before `optimize_tables`:

```php
// core/area_maintenance/widgets/update_ontology/class.update_ontology.php:551-553
// (!) Must be captured BEFORE optimize_tables so the comparison reflects the …
$old_simple_schema_of_sections = hierarchy::get_simple_schema_of_sections();
```

The TS port reproduced that order faithfully (`ontology_update.ts`, the comment
"PHP order: snapshot old schema AFTER import/reindex, BEFORE optimize").

`hierarchy::get_simple_schema_of_sections` / the TS
`getSimpleSchemaOfSections` walk the ontology through UNCACHED reads
(`searchDdOntology` direct SQL + `getOrderedSubtree`, explicitly not cached), and
nothing between the two reads changes ontology structure — `optimizeTables` is
REINDEX/VACUUM and `clearOntologyDerivedCaches` only drops in-process caches. So
`oldSchema` was byte-identical to `newSchema`, the additions-only filter
`children.filter(child => !before.has(child))` returned `[]` for every tipo, and
`private/backups/ontology/changes/simple_schema_changes_<stamp>.json` was
**always** the two bytes `[]` — in PHP too. The one hard-fail tail step of the
whole pipeline produced a permanently empty record.

### Shape after (TS)

`oldSchema` is captured at the top of **Phase B**, before the first destructive
statement (next to the recovery snapshot) and after every refusal gate, so a
refused call still costs no ontology walk. `newSchema` stays where it was. The
artifact now carries the real pre/post-import delta:

```json
[{"tipo":"zz1","children_added":["zz2","zz3"]}]
```

The API response is untouched: `result`, `msg`, `errors` and `root_info` keep
their PHP bytes, including the
`OK. Saved a new simple schema changes file: <basename>` message and the
`Error saving simple_schema_file: …` hard-fail. `saveSimpleSchemaFile` itself is
not modified — additions-only semantics and its message bytes are unchanged;
only the capture POINT of its first argument moved.

### Reason

The consumer here is the operator (and PHP's own `get_simple_schema_changes`
reader), not the client. The artifact exists to answer "what did this ontology
update add to the section schema" — an audit question whose answer is destroyed
at the instant it is produced when both sides of the diff are read after the
import. Reproducing a fossil that never worked is not parity worth keeping: the
file's entire purpose is the divergence.

### Gate reconciliation

**No fixture re-harvest.** The oracle store holds read-path responses; this
touches neither the response nor any read path — it changes bytes written to a
private backup directory during an operator-only write pipeline. No parity gate
asserts the artifact's contents (there is no oracle for a file the PHP engine
also wrote empty).
