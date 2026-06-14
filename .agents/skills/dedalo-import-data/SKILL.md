---
name: dedalo-import-data
description: The Dédalo v7 import data model — CSV import tool, per-component conform_import_data contract, v7 dato shapes, the dedalo_data wrapper and export round-trips. Use when modifying tools/tool_import_dedalo_csv, any component conform_import_data method, component_common::get_raw_value/unwrap_dedalo_data, tool_export 'dedalo_raw' format, or docs/core/importing_data.md.
---

# Dédalo v7 import data model

The CSV import tool (`tools/tool_import_dedalo_csv/class.tool_import_dedalo_csv.php`) transforms CSV cells into v7 component datos through per-component `conform_import_data()` methods. Import/export is critical: a raw export (`dedalo_raw`) re-imported MUST reproduce the exact stored datos (round-trip invariant, covered by `test_import_files_raw_export_round_trip`).

## The v7 dato shapes (what conform must produce)

Arrays of objects; the data property depends on the component type:

| Model | Item shape | Notes |
|---|---|---|
| input_text / text_area / html_text / email / number / json / password | `{"value":<v>,"lang":"lg-x","id":N}` | listed in `component_common::$components_using_value_property` |
| date | `{"start":{dd_date},"end":{dd_date},"id":N}` | `time` (seconds) injected on save by `component_date::add_time` |
| iri | `{"iri":"https://...","id":N,"lang":"lg-x","label_id":M}` | `label_id` targets the label dataframe; `title` deprecated. `id` is user-settable (pairs value↔dataframe) — the documented exception to "omit id" |
| geolocation | `{"lat":F,"lon":F,"zoom":I,"alt":I,"lib_data":[{layer_id,layer_data:{FeatureCollection}}],"id":N}` | nolan, monovalue; flat-string import order is `lat, lon[, zoom[, alt]]` (GeoJSON coordinates are the opposite `[lon,lat]`) |
| relations (select, check_box, radio, portals, select_lang, relation_*) | locator `{"section_tipo","section_id","type","from_component_tipo"}` | no `lang`/`id` |

`id` and `lang` are auto-assigned on save when omitted (`set_data` → `set_data_item_counter`; non-object items get the instance lang). v6 plain arrays (`["x"]`, `[104]`) are accepted input and auto-normalized.

## conform_import_data contract

Signature `(string $import_value, string $column_name) : object`. Response: `result` (the conformed dato), `errors` (array of failed objects), optional `warnings` (same shape, non-fatal — value IS imported), `msg` ('OK' or error). Failed/warning object shape is fixed — the report depends on it:

```php
$failed = new stdClass();
    $failed->section_id     = $this->section_id;
    $failed->data           = stripslashes( $import_value );
    $failed->component_tipo = $this->get_tipo();
    $failed->msg            = 'IGNORED: ...';
```

`result` must be one of: **array of v7 items** | **object keyed by lang (`lg-*`) whose values are arrays of v7 items** (multi-language input) | **null** (empty cell → CLEARS existing data; for translation-supporting components only the current lang is cleared, because the `set_data` action routes through `set_data_lang`). Errors → row value ignored; empty `errors` + null result is the valid "clear" case (set `msg='OK'`).

Overrides live in: input_text, text_area, number, email, date, iri, relation_common (covers all relation models), select_lang, json, geolocation. Everything else falls to `component_common::conform_import_data` (wraps plain values into `{value}` only for `$components_using_value_property` models).

`$column_name` can carry suffixes: `tipo_dmy|mdy|ymd` (date format order), `tipo_sectiontipo` (relation target). **The tool matches CSV header against the column map `tipo` EXACTLY** (suffix included); mismatches are silently skipped.

## The dedalo_data wrapper

Raw exports (`tool_export` `dedalo_raw` → single chokepoint `component_common::get_raw_value()` ~line 1611) wrap every dato as `['dedalo_data' => $dato]` (assoc array — `dd_grid_cell_object::set_value()` requires `?array`; serializes as the `{"dedalo_data":...}` object). NOT wrapped: `component_section_id` (must stay a plain int for record matching) and null datos (empty cells).

Import unwraps once: `component_common::unwrap_dedalo_data($cell)` called in the tool's column loop before conform. Rules (all deliberate — do not relax):
- The wrapper is recognized only when `dedalo_data` is the **SOLE** property — `{"dedalo_data":1,"other":2}` is a legitimate component_json value and passes through unchanged.
- Re-encode with `JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES` (must match tool_export's encoding for byte-identical round-trips).
- Inner `null` → `value=''`, `wrapped=false` (behaves as empty cell).
- The tool sets `$component->import_data_is_wrapped` (declared bool on component_common): **component_json** uses it to disambiguate a v7 envelope from a literal JSON value with the same shape — without the flag the ENTIRE decoded cell goes inside `value` as the monovalue (component_json also accepts the legacy `{"lg-nolan":[{value items}]}` envelope).

## Tool flow per cell (import_dedalo_csv_file)

unwrap → conform → on errors push to `$failed_rows` and skip column → branch:
1. **Metadata tipos** (dd199/dd201 created/modified date, dd200/dd197 users): set on section, `save_modified=false` for modified*.
2. **Multi-lang object result** (`is_object` + translatable): iterate `lg-*` keys → `set_data_lang($items, $lang)` per lang.
3. **Flat multi-lang array** (translatable + array items carrying `lang`): group by item lang (items without lang → component lang) → `set_data_lang` per group. This is the raw-export shape for translatable components — `update_data_value('set_data')` would force every item to one lang and collapse translations (the bug this branch fixes).
4. **Default**: relation results get per-locator validation; `lg-nolan`-keyed objects unwrapped; then `update_data_value({action:'set_data', value})` → internally `set_data_lang($value, $component->lang)`.
All branches: `import_save()===false` → push failed row ('component rejected the data on save' — e.g. component_email::save rejects invalid emails). `set_data_lang` semantics: replaces ONLY the given lang's items, preserves other langs — so both multi-lang input forms merge identically.

Report channels: `failed_rows` (ignored values), `warning_rows` (imported but needs attention — e.g. select_lang code not in DEDALO_PROJECTS_DEFAULT_LANGS), rendered by `js/render_tool_import_dedalo_csv.js::render_final_report`.

## Gotchas (each one was a real bug)

- `json_handler::is_json()` is true ONLY for strings starting `[` or `{` — scalars like `'42'`/`'null'`/`'"x"'` need `json_decode` + `json_last_error()` fallbacks.
- `dd_date` properties are **private**: read errors via `get_errors()` (a direct `$dd->errors` silently reads null inside `empty()`); instances don't iterate in `foreach`/the validating constructor — normalize via `json_decode(json_encode($dd))` (its `jsonSerialize` strips nulls/errors). Never `(array)`-cast a dd_date.
- Always `is_string()`-guard before `substr()`/`trim()`/`has_protocol()` on decoded JSON properties — `{"value":{"a":1}}` or `{"iri":["x"]}` must produce a failed row, not a TypeError (a TypeError kills the whole import run).
- Preserve unknown/extra item properties when rebuilding objects in conform — and ALWAYS copy `lang` for translation-supporting components (component_iri lost translations this way).
- `supports_translation` (class property: only string_common-family and iri are true) is what `set_data_lang` checks — distinct from the ontology `translatable` flag the tool reads.
- `'0'` is a legitimate value: every `empty($import_value)` check needs `&& $import_value!=='0'`.
- Non-JSON strings that start `["` or end `"]` are malformed JSON, not text: use `component_common::is_plain_bracket_string()` (`[Ac]` legends are valid text).
- Multi-value flat separators: emails ` | ` (fixed), iri records ` | ` / fields `, ` (configurable via properties), relations `,` (section_id list), lang codes `,` (lowercase `/^lg-[a-z0-9]+$/`), dates `|` (multi) + `<>` (range).

## Testing

- `test/server/tools/tool_import_dedalo_csv_Test.php` — unit + end-to-end against section `test3` record 1 (tipos: test52 input_text, test145 date, test208 email, test100 geolocation, test18 json, test89 select_lang, test88 check_box, test102 section_id). Key tests to keep green when touching anything here: `test_import_files_raw_export_round_trip` (CSV built from real `get_raw_value()`, datos must be identical after import — compare via the json-round-trip `canonicalize_data` helper), `test_import_files_v7_formats`, `test_import_files_lang_keyed_object`.
- Per-component conform tests in `test/server/components/component_*_Test.php` (`--filter conform`); wrapper tests in `component_common_Test.php` (`test_unwrap_dedalo_data`, `test_get_raw_value` expects the wrapper shape).
- Fixtures: `test/server/files/import_csv/` (`;` delimiter, doubled-quote escaping; literal `;` in values escaped as `U+003B`). Run: `vendor/bin/phpunit -c test/server/phpunit.xml test/server/tools`.
- User docs to keep in sync: `docs/core/importing_data.md` (v7 canonical / v6 accepted, per-component flat-string alternatives, wrapper, empty-cell warning).
