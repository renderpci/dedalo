# WC-2026-09-30-ontology-identifier-grammar — dd_ontology identifiers obey one grammar, read and write

- **Date:** 2026-09-30 (audit 2026-09-26, SURF-1 read + write; CLOSURE_PLAN Step 4).
- **Decision:** owner decision 2026-09-30 — the CHECK lands `NOT VALID` + report + repair
  tool on installs that already hold violating rows (never a boot refusal). Three further
  calls are flagged for owner review at the end.
- **Doors:** every consumer of a component_alias target (the search engine, the model hop,
  the data-node hop `dataNodeOf` that the translatable and save-lang rules read — ONE alias
  hop for the translatable and lang-versions flags, no separate lang-versions hop); the dd_ontology write doors
  (`src/core/db/dd_ontology.ts` `upsertDdOntologyNode`, `updateDdOntologyColumns`,
  `createRecoverySlice`); the archive restore plan (`src/core/archive/restore.ts`); the
  ontology parser (`src/core/ontology/parser.ts`) and the rebuild (`ontology_state.ts`); the
  ontology update (`ontology_update.ts`); migration `0013_dd_ontology_identifier_grammar.sql`.

## Shape before

- `properties.alias_of` was checked only for "non-empty string, target exists, target not an
  alias", by TWO readers (resolver.ts, alias.ts). A row planted under a tipo carrying SQL
  (`zzs'||pg_sleep(0)||'1`) existed, so the hostile string became the alias's data tipo and
  was interpolated into every search builder family, the join-path hop and the order key.
  Refusals carried `{tipo, alias_of}` with the raw value.
- dd_ontology had no CHECK on any identifier column; neither write door validated one.
  `updateDdOntologyColumns` INSERTed a partial row (no tld, no model) for an absent tipo.
- The parser composed a reference from a locator (`<tld><section_id>`) unchecked: a
  section_id `'1 OR'` projected the parent `zzgs1 OR` into dd_ontology.
- The recovery slice and the archive restore copied rows through unchecked.
- `createBackupTable` / `restoreFromBackupTable` (PHP dd_ontology_bk protocol) were exported
  with no caller.

## Shape after

- **Alias read.** ONE reader, `resolver.ts aliasTargetTipoOf`; alias.ts delegates. Order:
  `missing` → `grammar` (`isValidTipo`, before any row lookup) → `absent` → `chained`. Every
  refusal is `ontology.invalid_node` with coordinates `{tipo, alias_of, reason}`, where
  `alias_of` is `JSON.stringify(value).slice(0, 64)` (the message carries the same escaped
  value). Messages keep their sentences ("alias_of is required", "does not exist",
  "alias-of-alias refused").
- **Search sinks.** The filter leaf (`BuilderContext.tipo`), the join-path hop key and the
  order key take their data tipo only from `identifier_gate.ts resolveSqlDataTipo`, branded
  `SqlTipo` (minted only by `asSqlTipo`). A value that came through an alias must pass
  `assertValidTipo` (never the bare-column allowance): refused `request.invalid_tipo` at
  `where` = `filter alias target` / `join path alias target` / `order alias target`. The
  pseudo-tipo `section_id` (resolves to itself) is still admitted — the rsc80 fixed_filter.
- **Write doors.** `upsertDdOntologyNode` (whole row) and `updateDdOntologyColumns` (the tipo
  and every identifier column given) run `ddOntologyIdentifierViolations` before any SQL and
  refuse `ontology.invalid_node` with `{tipo, violations: '<rule>:<reason>,…'}`. A database
  refusal — 23514 on one of the six grammar constraints, or 22001 — is converted by
  `ddOntologyConstraintRefusal` to `ontology.invalid_node` with
  `{tipo, constraint, hint: 'run reconcile ontology_identifiers'}` (22001 → `constraint:
  'column_length'`).
- **No INSERT fallback.** `updateDdOntologyColumns` on an absent tipo answers `false` and
  writes nothing. Its one caller (`syncOrderToDdOntology`) already skipped absent rows.
- **Dead doors deleted.** `createBackupTable`, `restoreFromBackupTable`. `dropBackupTable`
  stays (it clears a table an upgraded install may still hold).
- **Parser.** `getTermIdFromLocator` answers null when the composed reference fails
  `isValidTipo` — the parser's existing "unresolvable reference → null" rule. The new
  `parseSectionRecordToOntologyNodeWithDefects` returns `{node, defects}`: a defective
  `parent` / `model_tipo` (grammar, or longer than its column) becomes null, a defective
  `relations` entry is skipped, a defective `properties.alias_of` is removed (the alias reader
  then refuses the node `missing`). `parseSectionRecordToOntologyNode` delegates and logs one
  warning per defect.
- **OntologyState.** New `invalidReferenceNodes: number` and `invalidReferenceRecords:
  {source: '<section_tipo>/<section_id>', tipo, column, value}[]` — a warning channel like
  `tldlessRecords`, NOT a drift kind; `rebuildOntology` keeps `ok` = converged and appends
  the named records to `msg`. A tld is never refused for one bad source record.
  `rebuildOntology(tld, userId, {reclaimIds})` also deletes the given row ids inside the
  rebuild's transaction (the repair of rows filed under another tld).
- **Recovery slice.** `createRecoverySlice(tlds)` → `{created, skipped: string[]}`: violating
  rows are left out (the `LIKE … INCLUDING ALL` slice carries the CHECKs validated, so the
  file is certified loadable); `buildRecoveryVersionFile` names them in `errors`.
- **Archive restore.** A node the restore would insert or overwrite that breaks the grammar is
  refused at PLAN time: `archive.refused` naming the tipo, before any write (a dry run shows
  it).
- **Migration 0013** (SHARED-SCHEMA ADDITIVE, rule 4 — meaning documented in the
  `dd_ontology.ts` header), six CHECKs added `NOT VALID`, idempotently:
  `dd_ontology_tipo_grammar` (`^[a-z]+[0-9]+$`, ≤32), `dd_ontology_parent_grammar` (NULL or
  the same, ≤32), `dd_ontology_model_tipo_grammar` (NULL or the same, ≤8),
  `dd_ontology_tld_grammar` (NULL or `^[a-z]{2,}$`, ≤32), `dd_ontology_tipo_in_tld` (NULL tld,
  or the tipo's letter prefix IS the tld), `dd_ontology_alias_of_grammar` (when `properties` is
  an object carrying the key: a string in the tipo grammar, ≤32). The migration never runs
  VALIDATE.
- **Report + repair.** Reconcile `ontology_identifiers`
  (`src/core/ontology/identifier_grammar.ts`, schedule `boot`, dry — no autoApply). Dry:
  `drift` = violating rows, `detail = {rows: [{id, tipo, tld, violations, action,
  rebuildTld?}], constraints: {<name>: 'absent'|'not_valid'|'valid'}}`. Apply: rows with a
  valid tipo whose prefix is a safe tld WITH source records → `rebuild` (`rebuildOntology`
  of that tld, the rows reclaimed by id); every other row → `delete`. The deletes run FIRST
  (before any rebuild could wipe such a row unrecorded under its tld); each deleted row is
  returned whole in `detail.deleted` AND logged whole (one JSON-escaped line per row, capped
  at 8192 characters). Then `validateDdOntologyIdentifierConstraints()` VALIDATEs each NOT
  VALID constraint whose rule has zero violating rows. A VALIDATE that fails after the
  deletes never loses the report: `run()` still returns `detail.deleted`, with
  `detail.validation_error` (a deliberate sentence; the raw failure goes to the server log)
  and `detail.constraints` = the pre-apply states. **Deletion happens only on an operator
  apply.**
- **Ontology update.** After its re-derive, `updateOntology` runs the same validation; rows
  still violating keep their constraints NOT VALID and add ONE line to `response.errors`
  (count, first 10 `tipo:rule`, "run reconcile ontology_identifiers"). The update does not
  fail.
- **Unrepaired installs.** A NOT VALID CHECK re-checks a legacy violating row on ANY UPDATE:
  the `order_number` sync of such a row is refused, typed (`ontology.invalid_node`,
  `constraint`), until the reconcile repairs it.

## Reason

An alias target, a parent, a model_tipo and a tld are IDENTIFIERS: the search engine
interpolates them into JSONB paths and SQL, the tree walks follow them. A value the ontology
swaps in behind a gated tipo was an unguarded SQL sink. The DB CHECK is the only guard no
future door can forget; NOT VALID keeps installs with legacy data updating.

## Owner calls (flagged for review)

1. **`dd_ontology_tipo_in_tld`** is included (recommended: a tipo filed under a foreign tld is
   what ONT-TLD forbids and what `deleteTldNodes(tld)` can never take back). Declining = drop
   the constraint by name from 0013 and the rule from `ddOntologyIdentifierViolations`.
2. **Apply deletes unaddressable rows, no quarantine table** (the Dédalo way: no bespoke
   tables); the whole rows are kept in the reconcile report and in the log.
3. **An invalid reference is projected as NULL** (parent/model_tipo), not the whole node
   skipped: the node's other columns stay usable and inspect stays in sync; the defect rides
   `invalidReferenceRecords`.

## Gate reconciliation

No parity fixture recorded a non-grammar identifier; no fixture edit, no re-harvest. Gates:
`test/unit/alias_target_grammar_native.test.ts` (G1),
`test/unit/search_alias_sink_native.test.ts` (G2),
`test/unit/dd_ontology_identifier_grammar_native.test.ts` (G3, the truth table: predicate =
CHECK = door),
`test/unit/dd_ontology_grammar_migration_native.test.ts` (G4, NOT VALID + report + repair),
`test/unit/ontology_state_identifier_grammar_native.test.ts` (G5);
`test/unit/dd_ontology_write.test.ts` (absent tipo → false, no row);
`test/unit/component_alias.test.ts` (messages unchanged).
