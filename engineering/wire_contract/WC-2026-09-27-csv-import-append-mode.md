# WC-2026-09-27-csv-import-append-mode — per-column APPEND mode in `tool_import_dedalo_csv`

- **Date:** 2026-09-27, adopted with the change that adds the per-column
  import mode to `tool_import_dedalo_csv` (descriptor facet `importAppend`,
  engine flag `SaveRequest.appendImport`, tool server + executor + client).
- **Decision:** DEC-12 (the invariant lands with its gates:
  `test/unit/descriptor_completeness_tripwire.test.ts` — every canonical model
  declares its policy; `test/unit/append_merge.test.ts` — the merge laws;
  `test/unit/save_append_import_native.test.ts` — the engine door and its
  backstop). A NEW capability, not a re-shaping of an existing field: every
  field below is additive, EXCEPT the replace-mode behaviour change named in
  §1 (a legacy envelope's frames: modified stamp, row lock, alias target).

## Shape before (PHP, and TS until 2026-09-26)

No mode. Every mapped column REPLACED the component's data: the executor sent
`changed_data: [{action:'set_data', id:null, value:<items>}]` per cell, and an
empty cell cleared the component (for translatable models, the current data
language). `ar_columns_map[i]` carried `tipo`, `map_to`, `checked`, `model`,
`decimal`; `get_section_components_list` answered `{components:[{label, value,
model}], label}`; the `validate_import` per-file report carried no per-column
mode. A flat `lat, lon` geolocation cell always became layer `1`.

## Shape now (TS)

1. **Request field** — `import_files` / `validate_import`
   `files[i].ar_columns_map[j].import_mode?: 'replace' | 'append'`. Absent
   means `'replace'` (the old behaviour, unchanged — except that the frames of
   a legacy `{data, dataframe}` envelope cell are now saved honouring the
   row's imported `dd197`/`dd201` modified stamp, their slot is read under
   the row lock, and on a `component_alias` column a frame without its own
   `main_component_tipo` pairs with — and replaces only the frames of — the
   alias TARGET, the tipo stored frames name). Any other value
   refuses the WHOLE file with `request.invalid_options`, before the dd800
   bulk-process record is created — nothing is written. No new error code, and
   no CSV header suffix (a suffix would collide with the `tipo_lang` /
   `tipo_dmy` / `tipo_<section_tipo>` header grammar).
2. **Append is refused per column, before any write**, for: a model whose
   descriptor `importAppend` policy is `{refuse}` (media, single-choice,
   opaque, derived — including `component_relation_children` and
   `component_relation_index`, whose values are computed from OTHER records),
   the `section_id` key column, and the audit tipos `dd197` / `dd199` /
   `dd200` / `dd201` (refused by tipo — also through a `component_alias` of
   one). The model is the one the SERVER resolves from the ontology (an
   alias's TARGET model), never the client's `model`. An append column on a
   `component_alias` keys everything stored — the stored items it reads, the
   item-id counter, frame pairing — by the alias TARGET (`resolveDataTipo`).
3. **Component list field** — `get_section_components_list` adds
   `import_append` to every entry of `components`: the model's policy
   (`'items'` | `'geo_layer'` | `'text_paragraphs'`), or `null` when append is
   refused. The client hides the mode selector on a `null`.
4. **Preflight report** — each `validate_import` file report gains
   `columns: [{index, column, tipo, model, mode: 'replace'|'append',
   refused: string|null}]`, one entry per IMPORTED column — every column the
   run reads, the `section_id` key column included (`mode: 'replace'`, or its
   refused append); a deselected column, or one ignored for a stale map or an
   unknown target (named in `errors`), has none (`[]` when the file itself is
   refused), and names every per-column append refusal in `errors`
   (same refusal the run would raise).
5. **Run semantics of an append column**:
   - `items` (literals and relations): the imported items are added after the
     stored ones. Stored items are kept byte-for-byte (never re-normalized, a
     stored duplicate is never collapsed). An item already present is SKIPPED
     and counted — relations by the insert law's key
     (`section_id|section_tipo|type|tag_id[|lang]`), literals per equality
     family inside the current language (`value`; iri `iri`+`label_id`; date
     the whole item — `start`, `end`, `period`, … — minus `id`/`lang` and the
     computed `time`, at the top level of a flat time-mode item as inside a
     part). Re-importing the same file
     changes nothing. The translations of one item share ONE id: a cell with
     several languages resolves it against the stored data before writing (a
     duplicate language names the stored item's id; none matching → one fresh
     id; languages disagreeing with the stored item fail the row); a single new
     translation takes the id its stored sibling languages give that position. Exceeding the `properties.data_limit` cap (the insert
     law's `selection_limit` refusal) fails the row (rolled back).
   - `geo_layer` (`component_geolocation`): each imported layer — or a flat
     `lat, lon` point, wrapped as a Point layer — is added to the stored item's
     `lib_data` under a **server-minted `layer_id`** (`max(every numeric
     layer_id and feature properties.layer_id) + 1`), every feature's
     `properties.layer_id` rewritten to it and `user_layer_name` set to
     `layer_<id>`. Stored layers and the stored centre are untouched; a layer
     whose geometry equals a stored one — or a stored item's centre, as a
     Point — is skipped (so re-importing a flat point stored as a bare centre
     adds nothing). Nothing stored: the model is single-value (only item 0 is
     read), so the FIRST imported item is stored as is and every later item's
     layers (a flat point as a Point layer) fold into its `lib_data` the same
     way — never N separate items, of which all but the first would be hidden.
   - `text_paragraphs` (`component_text_area`): per language, the imported text
     is appended as a new `<p>` paragraph; a fragment already present is
     skipped; a value carrying any Dédalo tag (`[index-…]`, `[tc-…]`, `[geo-…]`,
     …) fails the row (rolled back, earlier columns included; tags pair with
     `relation_index` `tag_id`, which an append cannot re-key). A
     multi-language cell never fails on ids: a language that already has a
     text is extended under that text's id (stored ids may differ per
     language); the languages without one share ONE id — a stored text id
     free in their slices, else one fresh id; blank texts take none.
   - An **empty cell** (or an empty language group, `{"lg-spa":[]}`) is a
     no-op — it never clears. So is an EMPTY literal entry inside a cell
     (`{"lg-spa":"","lg-eng":"x"}`, `[""]`: a `value` null/`''`; iri `iri` and
     `label_id` both blank; a date with no part): it is skipped, never added
     as a blank item, and takes no shared id. A multi-language cell on a
     NON-translatable column (stored in one `lg-nolan` slice; `component_iri`
     excepted, which slices by language either way) is appended as ONE save
     of all its values into that slice. An append that adds nothing writes no time-machine
     row and does not bump the record's modification stamp.
   - **Dataframe frames** paired to an appended item are re-paired through the
     final item ids (`id_key` remapped; a frame on a skipped duplicate pairs
     with the EXISTING item), deduplicated, and bounded by `data_limit`. A
     frame whose main has an append column in the row but no matching item
     (the cell empty, failed conform, or not carrying that id) fails the row.
     MIXED MODES fail the row: a replace-mode dataframe column whose frames
     name an append-mode main of the row, or whose slot already STORES frames
     of one (a replace write replaces the whole slot; an empty cell clears
     it); and a replace-mode column whose legacy envelope frames name an
     append-mode main. A replace dataframe column — empty or not — beside an
     append column it holds no frames of imports as usual.
   - **Time machine**: an append save that changes something writes the SAME
     time-machine row a replace save writes — one row per save,
     tagged with its language, holding the value after the save, under the run's bulk
     id (`saveTm` honoured as for replace). No baseline, no composed frames,
     no in-place row rewrite. Append-mode frames (a dataframe column, or a
     legacy envelope's) are saved with their own row, as a slot column's.
     The `dd800` bulk revert is unchanged by this entry: it infers the
     pre-run value from the history, so an append over a component whose only
     history is the run's own row is blanked by a revert. The exact revert —
     a pre-image recorded with every bulk save — is the pending bulk-revert
     undo-log change, with its own entry; not shipped.
   - **Replace mode, legacy envelope frames aimed at a non-dataframe slot**:
     still ONE `IGNORED … which is not a component_dataframe` warning per slot,
     `data` the slot's normalised frames (unchanged).
6. **Report** — a per-column warning `N already present, not added` in the
   file report's `warnings` (the existing `{section_id, component_tipo, msg,
   data, row}` shape; no new report field).

7. **Tool labels** (additive — tool-context `labels` are wire, precedent
   WC-2026-08-23-tool-export-register-labels). Every shipped language, one row
   per name:
   - `tools/tool_import_dedalo_csv/register.json`: `import_mode`, `replace`,
     `append`, `append_layer`, `append_no_tm_warning` (the column mode
     selector). No parity gate replays this tool's context, so no fixture and
     no exemption; the client suite gates their use.

The engine flag itself (`SaveRequest.appendImport`, and the internal
`SaveResult.appendedIdMap` / `appendSkipped`) is **NOT a wire field**: no rqo,
MCP schema or `dd_core_api` door can set it (`dd_core_api` builds its
SaveRequest field by field), so the only way onto the append path is the CSV
tool's per-column mode. Out of scope, still replace-only: the MARC21, Zotero
and RDF import doors.

## Reason

Institutions enrich catalogues incrementally — a second list of related
people, one more find-spot point, a further transcription paragraph — from
spreadsheets that know nothing of what is already stored. Replace forced a
round-trip export → merge by hand → re-import, where one wrong cell deleted
curated data. Append makes that addition safe (stored data is never touched)
and idempotent (duplicates are skipped and reported), and refuses loudly where
an append has no meaning instead of silently degrading to replace.

## Gate reconciliation

No parity gate replays `tool_import_dedalo_csv` (no `test/parity/` file names
the tool or its actions), so NO re-harvest and no fixture edit; an absent
`import_mode` is `'replace'`, the old shape. The behaviour is gated TS-natively by the three gates named under
**Decision** plus the tool's native import tests
(`test/unit/tool_import_dedalo_csv.test.ts`, `test/unit/import_csv*.test.ts`),
and above all the door gate `test/unit/import_csv_append_native.test.ts`
(through the real `import_files` / `validate_import` handlers). The client mode selector is gated in the browser suite
(`client/dedalo/test/client/js/test_tool_import_dedalo_csv.js`).

## Addendum 2026-09-27 — the revert line is closed; no TM switch

The pending change named in §5 (*Time machine*) is WC-2026-09-27-bulk-revert-undo-log. Every
save of a CSV run now records its undo pair — a hidden BEFORE image and the ordinary visible
after-row — whatever the old `time_machine_save` flag said (decision D1), so a revert
restores what the run replaced, exactly, append columns and envelope frames included. The
*Save time machine history on import* checkbox and the append-with-TM-off warning are removed
from the client, with the `append_no_tm_warning` label (§7 now lists `import_mode`,
`replace`, `append`, `append_layer`). `import_files` no longer reads `time_machine_save`; a
caller still sending it is not refused.

The same day's composed-row amendment (WC-2026-09-27-bulk-revert-undo-log §8) also retires
§5's "Append-mode frames … are saved with their own row, as a slot column's": no slot column,
envelope or append-mode frame writes a row under the slot tipo any more. Each is recorded in
the composed row (in a run, the composed pair) of the main its frames belong to — the main's
data followed by all its slots' frames — also when the main item was a duplicate and the
main's own save wrote nothing.

## Addendum 2026-10-07 — section-info columns in the component list

Correction to "Shape before": PHP `get_section_components_list` ALSO appended
every child of `dd196` (DEDALO_SECTION_INFO_SECTION_GROUP: `dd200`, `dd199`,
`dd197`, `dd201`, `dd271`, `dd1223`, `dd1224`, `dd1225`, `dd1596`) to every
section's list, for every caller. TS until 2026-10-07 omitted them (own subtree
only, never ledgered), so an exported CSV's audit columns came up unmapped in
the mapper and "not a component of section" in `validate_import`.

Now (TS): `components` gains those `dd196` component children, in ontology
order, after the section's own components — only when (a) the principal is a
GLOBAL ADMIN (the write door ignores a non-admin's column on them,
`componentRefusal`; the list must never offer a column the door drops), (b) the
section (virtual → real) has components of its own, (c) the section does not
suppress section-info (`dd542`, `dd15` — the WC-045 rule,
`logSectionSuppressesSectionInfo`). Single source:
`sectionInfoComponents()` in `src/core/resolve/section_elements_context.ts`.
Item shape unchanged (`{label, value, model, import_append}`; `import_append`
is `null` for the audit tipos). No fixture covers this action — no
re-harvest. Gate: `test/unit/tool_import_dedalo_csv.test.ts` (describe
"section-info columns (dd196 children) are offered and validate").

**Derived models are not offered** (user decision 2026-10-07, same day): the
list drops every item whose DOOR model — `getModelByTipo`, which hops a
`component_alias` to its target — is derived (registry `isDerivedModel`:
`component_inverse`, `component_relation_children`, `component_relation_index`,
`component_external`), own components and section-info alike. So `dd1596`
(`component_inverse`) is NO LONGER an item, and neither is a section's own
`component_relation_children` nor an alias of one. Divergence from PHP (which
listed them): the door refuses a column on a derived model in EVERY mode
(`derivedRefusal`), and the mapper never offers a column the door refuses.
The `validate_import` "not a component of section" MEMBERSHIP check is
unchanged — it still holds the derived tipos — so a hand-made map onto one
gets the precise derived refusal (`refused — derived …`), never "not a
component of section". Gates: same describe ("no listed item has a DERIVED
model", the built `zzcsvd` situation, "dd1596 … not listed, refused as derived
if hand-mapped") — server-side only: the client case feeds a stubbed list, so
it pins only client behaviour (an unlisted header stays unmapped), never the
server's offer.
