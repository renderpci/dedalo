# WC-2026-08-09-ontology-tld-derived — `ontology7` is derived from its section, and says so on the wire

- **Date:** 2026-08-09.
- **Decision:** — (DEC-12 gate shipped with it: `test/unit/ontology_tld_native.test.ts`;
  boundary assertions added to `test/unit/transform_engine.test.ts`.)

## The defect

An administrator creating a record in an ontology section (`actv0`, `rsc0`, `dd0`…) had to
know, and retype, the section's own tld into the `ontology7` component. `ontology7` is
MANDATORY: `parseSectionRecordToOntologyNode` (`src/core/ontology/parser.ts:198-205`) returns
`null` without it, so the record produced no `dd_ontology` row and never appeared in the
ontology tree. No error was raised anywhere — `ontology_state.inspectOntology` reported
`inSync: true` over it, because a record that parses to no tipo cannot even be `missing`.

The value was never the administrator's to supply: a record of section `actv0` parses into node
tipo `actv<section_id>`, so `actv` is the only tld it can ever carry.

Census at adoption: **92 such records in `dedalo7_mht`** across 21 sections (`numisdata0` 16,
`tch0` 13, `mdcat0` 12, `qdp0` 9…). All 92 have `string IS NULL` outright — no term, no
properties. Their Time Machine holds only `ontology26`/`ontology15`/`ontology41`, never
`ontology5` or `ontology7`; all stamped `2025-04-15`, `user_id = -1`, by the **PHP** engine.
`dedalo7ts` has none.

## The rule

> **ONT-TLD** — a record of an ontology node section `<tld>0` (table `matrix_ontology`)
> declares `ontology7 = <tld>`.

Stated once, in `src/core/ontology/tld.ts requiredOntologyTld`. Two carve-outs:

- **`localontology0` is EXEMPT** — its records override a canonical node (e.g. `rsc12`), so
  their `ontology7` names the OVERRIDDEN node's tld on purpose.
- **`ontology35` (`matrix_ontology_main`) is out of scope** — it holds the tld being DEFINED,
  in `hierarchy6`, not `ontology7`. It is not `<tld>0`-shaped, so it falls out for free.

## Shape before (PHP)

PHP had no derivation and no enforcement. `ontology7` was an ordinary
`component_input_text`: emitted with the caller's matrix level (3 for an admin), freely
editable, freely clearable, and freely mistypeable — the `foreign` drift kind exists precisely
because `actv0/127` once declared `ontology7="act"`. A record saved without it was accepted and
silently dropped by the parser.

## Shape after (TS)

**One wire change**, in the structure context:

```
element ontology7, section_tipo '<tld>0'   →  "permissions": 1     (was: the caller's level)
```

Every OTHER element of the same section is untouched (`ontology5`, `ontology41`, … keep 3 for
an admin), and `ontology7` outside a `<tld>0` section is untouched (`localontology0` keeps 3).
Verified in-process against `dd0` and `rsc0`.

Level 1 is the mechanism, not a label: `component_input_text` renders a static
`div.content_value.read_only` at EXACTLY `permissions === 1`
(`client/dedalo/core/component_input_text/js/view_default_edit_input_text.js:138`, `:84`), and
drops its tools bar. `properties.show_interface.read_only` is the intuitive lever and does
**not** work — that model never reads it.

The cap lives in `src/core/resolve/structure_context.ts`, beside the consultation-only cap,
because that is the one point both stamping paths cross. `resolveComponentContextPermission`
(`security/permissions.ts`) computes only the MAIN element of a get_data; a section's component
elements are stamped by `section/read.ts`'s subdatum loop via `getPermissions` +
`inheritSubdatumPermission`, which never calls it. A rule stated only there left the field
editable in the one place it is actually shown — measured, not assumed.

**Three non-wire layers ship with it**, because the display cap governs one door of five:

1. **Birth** — `section/record/record_defaults.ts` seeds `ontology7` as a third named seed at
   the create chokepoint, `[{id:1, lang:"lg-nolan", value:"<tld>"}]`. `lg-nolan` matches
   4832/4832 stored items and `ontology_write.ts:540`, NOT `hierarchy_provision.ts:358`'s
   documented `lg-spa` one-off. This retires `ts_object/ts_api.ts`'s parent-copy, which
   inherited EMPTINESS from an already-broken parent — the mechanism that produced the shells.
2. **Save** — `section/record/save_component.ts` returns `{ok:false}` BEFORE the transaction for
   a mismatching **or cleared** value, naming the required tld. `ok:false`, not the
   `ExternalWriteRefused` throw: an import or API caller has made a fixable data mistake and
   deserves an actionable 400, not a 500. It is an ALLOWLIST — one permitted shape, a `set_data`
   carrying a non-empty ARRAY of correct items — because the first version inspected the value
   and wrapped a non-array into `[value]`, while the executor coerces a non-array to `[]`: a
   bare object carrying the CORRECT tld passed the guard and then CLEARED the component. A guard
   that models the write differently from the writer is not a guard. Both import doors now
   honour the returned `SaveResult` instead of discarding it.
3. **Import** — `ontology/data_io_import.ts normalizeOntologyTld` forces the target tld
   post-COPY. See below.

Anything that still slips through is REPORTED, on `OntologyState`'s `tldlessRecords` warning
channel, instead of skipped in silence.

## The tld-rename path (why the import is the enforcement point)

`move_tld` is **not** the tld-rename mechanism and cannot be. It renames *tipos* (`<tld>N`,
N≥1) — data sections and components. Across all five widget directories there are **zero**
`<tld>0` entries; `object_hierarchy_objet1_to_object1.json` renames `objet1`/`objet2`, the
thesaurus descriptor/model sections, never the ontology definition section `objet0`.

A tld is renamed in the ontology MASTER and redistributed as an ordinary ontology import.
Confirmed in `dedalo7_mht`: `objet` is completely gone (0 `dd_ontology` rows, no `ontology35`
registry row, no `objet0` section) while `object` exists at `ontology35/32`.

That put the risk in the import, in TWO places. The first was originally described here
INCORRECTLY — the entry claimed the import "recomputes `section_tipo` from the TARGET tld". It
did not, and the correction matters:

1. **`section_tipo` came from the FILE.** `importFromCopyFile` scoped only its DELETE to the
   target; the `\copy` inserted whatever the staged file carried. Importing an `objet0` export
   as tld `object` deleted the (empty) `object0`, re-inserted the rows as `objet0` — duplicating
   them, or violating the `(section_id, section_tipo)` unique index — and left the target
   section EMPTY, with every downstream guard operating on nothing. The section-scoped path now
   stages through a TEMP table and projects `:'tipo'` over the file's own column, so the rows
   land where the caller said. That is what makes export-as-X / import-as-Y a rename rather
   than a duplication. The whole-table path (`matrix_dd`) has no single target and keeps the
   direct COPY.
2. **`ontology7` came from the file too**, so without a rewrite the whole ontology parses into
   the OLD namespace — `foreign` drift a thousand rows at a time. This is also the one door
   neither the birth stamp nor the save refusal can see, being a raw `psql` COPY.

`normalizeOntologyTld(sectionTipo)` closes the second. A FAILED normalization is FATAL at both
callers (`importOntologyFile` returns `result:false`; `updateOntology` restores its snapshots
and aborts) — as a warning it let the update panel re-derive `dd_ontology` from un-normalized
rows and finish `result: true`. It passes `-X` to psql, because a server-side `.psqlrc` banner
on stdout was enough to make the row count unparseable and, before the callers were fatal,
silently skip the normalization. Two deliberate limits:

- rows that are not NODES are left alone: `jsonb_typeof(string) = 'object'` AND at least one key
  besides `ontology7` itself. A bare `IS NOT NULL` was too narrow twice over — `{}` and tld-only
  rows got stamped and MATERIALIZED as nameless nodes in the tree (the outcome the skip exists
  to prevent), while a row whose `string` is a JSON scalar made `jsonb_set` raise and, under
  `ON_ERROR_STOP`, aborted the whole section's normalization.
- the **restore** path (`ontology_update`'s snapshot rollback) does NOT normalize. A restore's
  contract is "put back exactly what was here"; rewriting values during a rollback would make
  the rollback a lie.

**`move_tld` now REFUSES a `<tld>0` entry** (`update/transform/tipos.ts`), naming the ontology
master path instead. Not a gap being filled — an operation that cannot work: the rows carry
their tld in `ontology7`, a bare string no tipo rewrite reaches, and `matrix_ontology`'s UNIQUE
`(section_id, section_tipo)` makes the bulk UPDATE abort part-way. With no transaction and no
rollback there (WC-025), that leaves the database half-renamed and unrecoverable.

## Second wire change — the drift report

`OntologyState` (the `tool_ontology_parser` inspect response, emitted raw by
`toolOntologyParserInspect`) gains:

- `tldlessNodes: number`, beside `foreignNodes`;
- `tldlessRecords: string[]` — those records as `<section_tipo>/<section_id>`, the only handle
  that exists for them (a record with no tld parses into no namespace, so there is no tipo);
- `importOntologyFile`'s response gains `tld_normalized` (rows rewritten);
- `tool_ontology_parser` gains the developer-gated `repair_tlds` action.

`OntologyDriftKind` is UNCHANGED — see below.

`tldless` is a WARNING CHANNEL, **not a drift kind**, and that distinction was itself a
correction. Filed as drift it made `inSync` false, which the parser client paints red — while
nothing may write those records, so Reconcile and Regenerate both reported success against a
panel that could never go green again. `drift` means "dd_ontology disagrees with what the
source parses to"; a record that parses to nothing is absent from both sides and disagrees with
nothing. The client renders it as its own `warn` state beside the check, and the existing gate
that enumerates the kinds needs no edit.

`reconcileConverged` survives for one narrower job: if the section holds records but NOT ONE
parsed, the tld has no projection at all, and a rebuild that deleted every node and re-inserted
none must not report success.

`inspectOntology` also REFUSES to attribute a parse failure to the records when the cause is
shared: if `ontology7` itself cannot be resolved in `dd_ontology` (mid-update, partial import,
half-installed ontology) EVERY record parses to null, and an earlier version named 1726 healthy
records as the operator's fault. One shared cause is never N record-level defects.

**The read-only cap needs a repair door, and has one.** Capping `ontology7` removed the only
place an operator could correct a record whose tld is wrong — while inspect still told them to
"fix the record's ontology7". `repair_tlds` runs `normalizeOntologyTld` over the selected tlds.
Deliberately NOT folded into reconcile: reconcile writes the PROJECTION, this writes the
SOURCE, and those are different blast radii an operator is entitled to choose between.

## Reason

The client is the consumer, and the client's only read-only affordance for
`component_input_text` is `permissions === 1`. Emitting the caller's real level there meant the
form invited an edit that could only ever destroy the record. Deriving the value and stamping
it read-only removes the decision rather than documenting it.

## Gate reconciliation

- `test/unit/ontology_tld_native.test.ts` (new, 23 cases) — the `requiredOntologyTld` table
  including both carve-outs and the exact `<tld>0` shape match; the birth stamp and that the
  stamped record PARSES; the save refusal for a wrong tld, an empty value and a removal, that
  it refuses BEFORE writing, and that the CORRECT tld still saves; the `permissions === 1` cap
  asserted through `buildStructureContext` with siblings and `localontology0` left at 3;
  `normalizeOntologyTld` including the `string IS NULL` skip and idempotency; and the `tldless`
  drift including that reconcile still converges. Scratch tlds `zztl`/`zztm`, zero residue.
- `test/unit/transform_engine.test.ts` — three added cases pin the move_tld boundary: a
  bare-tld entry stays rejected by `TIPO_RE` (so nobody loosens it to "support" renames), a
  `<tld>0` entry is refused with the pointer to the ontology master, and a refusal does not
  cancel the safe entries beside it.
- `test/unit/hierarchy_provision_native.test.ts` — unaffected: provisioning writes `ontology7`
  through `updateMatrixKeyData`, which REPLACES the component key, so the `lg-spa` descriptor
  bytes are unchanged by the `lg-nolan` birth seed landing first.
- **No re-harvest.** The frozen store carries no fixture of an `ontology7` permission stamp on
  a `<tld>0` section. Its two `ontology7` occurrences are unrelated surfaces:
  `component_datalist_lifecycle_differential` holds security-access GRANT rows keyed on section
  `ontology1` (not `<tld>0`, and built by `security_access_datalist.ts`, not this cap), and
  `section_elements_context_differential` holds a `section_map.thesaurus.term` config array.
