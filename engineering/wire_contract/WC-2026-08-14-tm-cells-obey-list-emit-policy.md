# WC-2026-08-14-tm-cells-obey-list-emit-policy — Time Machine cells obey list emit policy

- **Date:** 2026-08-14. Adopted with the Time Machine unification (S2).
- **Decision:** DEC-15 (deliberate divergence), DEC-14b (differential retirement).

## Shape before (PHP / TS-before)

`read_tm.ts` `emitScalarCell` pushed `readComponentItems()` **directly onto
`emission.items`**, bypassing `emitDdoData` and therefore the entire
`EMIT_HOOKS` chain. Consequences on the wire, all of them accidental:

- `component_text_area` columns emitted the **full stored value** — no
  `TEXT_AREA_LIST_MAX_CHARS` (130) truncation, no `LIST_SOURCE_CAP` (16 KB,
  DOS-01), no `addTagImgOnTheFly`. An oral-history transcript column emitted
  hundreds of characters of raw `[TC_00:00:00.000_TC]` /
  `[index-n-111--data::data]` markup into a list cell.
- `dd577` (What) rendered `«term» [tipo]` but `dd1772` (Where) rendered the bare
  term — the same transform applied to one of the two columns that need it,
  because it lived inside `emitTmRow`'s tipo switch rather than in the record.
- `dd1573` (Id) was never emitted as a real column.
- every scalar item carried the hardcoded `lang: 'lg-nolan'`.
- no `fallback_value` key on text_area cells (the model that attaches it
  unconditionally).

## Shape after (TS)

The default cell branch routes through the generic `emitDdoData` in
`mode: 'list'` over the virtual dd15 record (`buildTmSectionRecord`), so every
emit hook fires exactly as it does in the section's own list:

- text_area cells truncate at 130 chars, cap the source at 16 KB and resolve
  tags to `<img>` — **in the dd15 browse and in `tool_time_machine` alike**;
- `dd577` **and** `dd1772` both render `«term» [tipo]` via one exported
  `ontologyTermLabel(tipo, lang)`;
- `dd1573` is a real emitted column;
- `item.lang` carries the **snapshot's own lang** (see the audit-lang rule
  below) instead of the hardcoded `lg-nolan`;
- `fallback_value` is attached where the model attaches it.

`tmEnvelopeExtra` is UNCHANGED and stays per-row: `read_source.ts` declares
`envelopeExtra` as the sanctioned source-specific seam, and the client reads
`options.locator.matrix_id` off it for restore and note creation.

### The audit-lang rule (new, explicit)

A Time Machine cell renders the **snapshot's own lang** — `row.lang` for a
per-component row, the stored value verbatim for a section-snapshot row — and
**never** the request data lang. `matrix_time_machine` carries its own `lang`
column; `emitScalarCell`'s comment ("the TM list shows the stored value
verbatim") was a contract, not an omission. Routing TM cells through the generic
emitter without stating this rule would make a row recorded in `lg-eng` render
**blank** when browsed under `lg-spa` — on the surface a user reads to decide
whether to restore. `emitDdoData` therefore takes an explicit lang override and
the TM read source passes it; `component_text_area`'s `resolveEmitLang` /
`getOriginalLang` honour it and never fall back to `readMatrixRecord` (dd15 is
deliberately outside `MATRIX_TABLE_ALLOWLIST`, so that lookup throws).

### Named exemption — unresolvable component tipo

`emitDdoData` throws where `emitScalarCell` silently emitted. A TM row whose
component tipo no longer resolves a model (decade-old history on a long-lived
install, an ontology node since removed) must not 500 the browse. Such a cell
emits an explicit item flagged `error: 'unresolved_component_tipo'` with a
human-readable `reason` field, empty entries, in place — a NAMED exemption, not
a silent narrowing.

## Reason

Two emit pipelines is the defect; the untruncated cell is only its most visible
symptom. The client is vanilla JS with an exact wire contract and has no
truncation of its own — the server is where list-display policy lives, and there
is exactly one implementation of it (`EMIT_HOOKS`). Every item above is that one
implementation finally reaching dd15.

## Gate reconciliation

The five TM differentials are **retired into TS-native twins** rather than
reconciled (DEC-14b). They cannot be replayed in any current environment: the
fixtures were harvested 2026-07-11 against a live shared DB whose rows exist
only in `dedalo7_mdcat` (`matrix_id` 51071497 …), the pinned
`2026-07-11_102750` snapshot is gone from `private/backups/db/`, and
`test/preload/test_database.ts` hard-points the suite at `<app db>_test` — which
`scripts/test_db_setup.ts` builds "from files vendored in this repo, never by
copying a live database". A synthetic install DB can never contain harvested
rows from a live one, so the gates were already red (7–10 failures) on a clean
tree before this change, under every DB choice.

Retired and mapped in `engineering/ORACLE_HARVEST.md` the same day:
`tm_read_differential`, `tm_bare_list_differential`,
`tm_component_history_differential`, `tm_component_value_differential`,
`tm_relation_filter_differential`.

Replacement TS-native gates: `tm_emit_hooks_native` (truncation, source cap,
tag resolution), `tm_lang_policy_native` (the audit-lang rule),
`tm_component_value_native`, and `tm_emit_row_context_native` rewritten as a
CONTRACT test (asserted shapes) rather than a mirror of the deleted code.
