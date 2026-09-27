# WC-2026-09-27-csv-import-append-mode — per-column APPEND mode in `tool_import_dedalo_csv`

- **Date:** 2026-09-27, adopted with the change that adds the per-column
  import mode to `tool_import_dedalo_csv` (descriptor facet `importAppend`,
  engine flag `SaveRequest.appendImport`, tool server + executor + client).
- **Decision:** DEC-12 (the invariant lands with its gates:
  `test/unit/descriptor_completeness_tripwire.test.ts` — every canonical model
  declares its policy; `test/unit/append_merge.test.ts` — the merge laws;
  `test/unit/save_append_import_native.test.ts` — the engine door and its
  backstop). A NEW capability, not a re-shaping of an existing field: every
  field below is additive, EXCEPT the behaviour changes named in §1 (replace
  mode's legacy envelope frames, and the re-composition of their main's
  time-machine row) and §5 (the `dd800` bulk revert's per-language walk, its
  lang-less rule, its legacy-wipe rule, the stale-frames refusal and the
  per-main frame scoping — all of which apply to EVERY bulk run — and the
  `delete_data` wipe's per-language time-machine rows).

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
   alias TARGET, the tipo stored frames name; and, with time machine on, the
   main's own time-machine row of that cell is re-composed with the slots'
   frames as the row left them — the frames are saved without a row of their
   own, so this is where they are audited). Any other value
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
   - **Bulk revert**: before an append save's own time-machine row, a
     component whose pre-append value is NOT what its newest time-machine
     row holds — no history (and something stored), or STALE history (a
     later write ran with Time Machine off: a TM-off import, replace-mode
     legacy envelope frames) — gets a baseline row of its pre-append value
     (no bulk id), so the `dd800` revert restores exactly that instead of
     blanking the component or resurrecting the stale row. Decided by content
     (jsonb equality against the newest row the revert itself would walk).
     For a language-sliced model this is PER LANGUAGE (each time-machine row
     snapshots one language's slice): the probe reads that language's
     history exactly as the revert does, each row compared as its slice of
     that language. The `dd800` revert's pre-batch walk of a language-sliced
     component reads the rows TAGGED with the batch row's language plus any
     row whose data CARRIES that language (pre-migration rows without a tag,
     and the writers that tag one language but store all: tool_lang,
     propagate, the duplicate backfill), and restores ONLY that language,
     from the found row's slice — so a multi-language append reverts every
     language, not just the one whose row happened to sit below the batch,
     and an older all-language row never overwrites a language the batch did
     not touch. A LANG-LESS item (PHP-era data: no `lang` key, `''` or
     null) belongs to the language its row is TAGGED with: it is part of that
     language's slice (restored stamped with the language, as any save of the
     slice stamps it; the live value's lang-less items are replaced with it,
     never kept beside it), and the baseline probe slices the same way — a
     tagged row of lang-less items is no longer the EMPTY slice, which
     blanked the component on revert. This revert
     change applies to every bulk run, not only appends.
   - **Dataframe frames in an append save's time-machine rows**: an append
     save of a MAIN component composes the frames its dataframe slots hold
     (read under the row lock) after its own items, in BOTH its own row and
     its baseline — the PHP `get_time_machine_data_to_save` shape the restore
     doors already read. So the `dd800` revert of an append over a main whose
     slot already held frames restores the main AND its slot, instead of
     skipping it as `frameless_wipe` (the appended item used to stay). An
     ordinary save's rows stay frameless (unchanged). The main's OWN batch
     row is composed from the slots as the import ROW LEFT them (the row's
     frames are written after its main, so the row is re-composed at the end
     of the row's transaction); the baseline keeps the slots from before.
   - **Stale frames in a composed snapshot** (`bulk_revert_process`, EVERY
     bulk run — an append row and a PHP-era row are both composed): a
     composed snapshot's frames are the slot as it stood at its row, and a
     later frame edit writes no main row. When the live slot (this main's
     frames) equals neither the snapshot's frames nor ANY state the run or
     this revert left it in — the frames the BATCH row composed (an append's
     row, a replace envelope's re-composed row), the run's own newest slot
     row (a slot column), this revert's own newest slot row (a batch's slot
     row reverted before its main) — the slot changed after the run: the row
     is skipped with the NEW closed-vocabulary reason
     `frames_changed_since_run` (extends
     WC-2026-09-03-bulk-revert-skipped-typed-entries), nothing is written.
     Otherwise only THIS main's frames are replayed; frames paired with other
     mains in the same slot stay as they are live — EXCEPT a slot whose whole
     live content is what this revert itself just wrote there, which takes
     the snapshot WHOLE (as before this change: a PHP-era slot has no rows of
     its own, so its revert blanks it and only the main's composed row knows
     the other mains' frames).
   - **Record wipes already in the history**: a null-data time-machine row
     tagged with ONE language belongs to EVERY language's history only when
     it has the legacy wipe's SHAPE — untagged, or with a sibling null row
     (another component of the same record at the same timestamp: the wipe
     empties several at once). So a wipe written before the per-language
     pairs (or by PHP) still blanks every other language on the revert of a
     later run, while a LONE null row — PHP's per-language clear of one
     translatable component — is only its own language's history (read as a
     wipe, it blanked another language on revert instead of restoring it).
   - **Record wipe (`delete_data`) time-machine rows**: a language-sliced
     component gets ONE backfill/emptied pair PER LANGUAGE its stored value
     holds (lang-less items ride with the data-lang tag), each tagged with and
     sliced to that language — PHP wrote one pair tagged with the request's
     data lang, which every other language's history ignores: the revert of a
     later run on another language walked past the wipe and restored the
     values it had deleted. Unsliced models keep their one full-value pair.
   - **Replace mode, legacy envelope frames aimed at a non-dataframe slot**:
     still ONE `IGNORED … which is not a component_dataframe` warning per slot,
     `data` the slot's normalised frames (unchanged).
6. **Report** — a per-column warning `N already present, not added` in the
   file report's `warnings` (the existing `{section_id, component_tipo, msg,
   data, row}` shape; no new report field).

7. **Tool labels** (additive — tool-context `labels` are wire, precedent
   WC-2026-08-23-tool-export-register-labels). Every shipped language, one row
   per name:
   - `tools/tool_time_machine/register.json`: `bulk_revert_skipped_msg` (the
     bulk-revert result notice naming skipped rows). The frozen
     `tool_time_machine` context predates it:
     `test/parity/tool_element_context_differential.test.ts` exempts EXACTLY
     `{apply_value_confirm_msg (WC-2026-08-29-tm-apply-value-confirm-label),
     bulk_revert_skipped_msg}` — every exempted name must be a TS label, the
     frozen side must hold none — and compares the rest byte-for-byte (the
     case left `engineering/parity_baseline.json`'s red set with this entry).
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
(through the real `import_files` / `validate_import` handlers and the dd800
bulk revert). The client mode selector is gated in the browser suite
(`client/dedalo/test/client/js/test_tool_import_dedalo_csv.js`).
