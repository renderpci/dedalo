---
description: Dédalo CSV import data flow, v7 format requirements, and conform_import_data patterns
---

# Dédalo CSV Import — Architecture & v7 Data Format

## Overview

The CSV import pipeline: **Export** (`tool_export`) → **CSV file** → **Import** (`tool_import_dedalo_csv`) → **`conform_import_data()`** → **`set_data_lang()`/`set_data()`** → **Database**.

## Key Files

| File | Role |
|------|------|
| `tools/tool_export/class.tool_export.php` | Exports data to grid (CSV/TSV/Excel). `stream_export_grid()` uses two-pass NDJSON streaming. |
| `tools/tool_export/js/render_tool_export.js` | Client-side CSV/TSV download via `dd_grid.render()` |
| `tools/tool_import_dedalo_csv/class.tool_import_dedalo_csv.php` | Core import: `import_dedalo_csv_file()` iterates CSV rows, maps columns, calls `conform_import_data()`, saves |
| `tools/tool_common/class.tool_common.php` | `read_csv_file_as_array()` — BOM removal, UTF-8 encoding, header skip |
| `core/component_common/class.component_common.php` | Base `conform_import_data()`, `set_data()`, `set_data_lang()`, `import_save()` |
| `core/component_input_text/class.component_input_text.php` | Overrides `conform_import_data()` |
| `core/component_text_area/class.component_text_area.php` | Overrides `conform_import_data()` with HTML normalization |
| `core/component_email/class.component_email.php` | Overrides `conform_import_data()` |
| `core/component_number/class.component_number.php` | Overrides `conform_import_data()` with decimal handling |
| `core/component_date/class.component_date.php` | Overrides `conform_import_data()` with date parsing |
| `core/component_iri/class.component_iri.php` | Overrides `conform_import_data()` with IRI validation |
| `core/component_relation_common/class.component_relation_common.php` | Overrides `conform_import_data()` with locator construction |
| `test/server/tools/tool_import_dedalo_csv_Test.php` | PHPUnit tests for import + conform methods |
| `test/server/files/import_csv/` | Test CSV files |

## v7 Data Format (Critical)

### The Problem
`set_data_lang()` at `component_common:968` **silently skips non-object items** with `continue`. Any `conform_import_data()` that returns plain string arrays like `["Hello"]` will have their data **silently dropped** when the import tool uses the `update_data_value('set_data')` → `set_data_lang()` path.

### v6 vs v7 Format

| Component | v6 format | v7 format |
|---|---|---|
| `component_input_text` | `["Hello","World"]` | `[{value:"Hello",lang:"lg-eng"},{value:"World",lang:"lg-eng"}]` |
| `component_text_area` | `["<p>Hello</p>"]` | `[{value:"<p>Hello</p>",lang:"lg-eng"}]` |
| `component_number` | `[5.87]` | `[{value:5.87}]` |
| `component_email` | `["a@b.com"]` | `[{value:"a@b.com"}]` |
| `component_date` | `[{start:{year:2023,...}}]` | `[{id:1,start:{year:2023,...},lang:"lg-nolan"}]` (no `value` property) |
| `component_iri` | `[{iri:"http://..."}]` | `[{id:1,iri:"http://...",lang:"lg-nolan"}]` |
| Relation components | `[{section_id:1,section_tipo:"oh1"}]` | Same + `id` property |

### Rules for `conform_import_data()` Return Values

1. **Always return arrays of objects** — never plain strings/numbers
2. **Value-property components** (`$components_using_value_property`): wrap as `[(object)['value' => $val]]`
3. **Non-value-property components** (date, IRI, relations): return objects with their native properties (`start`, `iri`, `section_id`, etc.)
4. **`id` property**: auto-assigned by `set_data()` if missing — do NOT manually assign in `conform_import_data()`
5. **`lang` property**: auto-assigned by `set_data_lang()` — do NOT manually assign in `conform_import_data()`
6. **Multi-language objects** like `{"lg-eng":"Hello","lg-spa":"Hola"}`: pass through as-is; the import tool iterates `lg-*` keys and calls `set_data_lang($value, $lang)`

## Import Data Flow (Detailed)

### 1. CSV Structure
- **Header row**: column names matching ontology tipos (e.g., `section_id;test52;test17;test211`)
- **Data rows**: string values; JSON for complex types
- **Separator**: semicolon (`;`) by default

### 2. Column Mapping (`ar_columns_map`)
Each column has a mapping object:
```json
{
    "tipo": "test52",
    "label": "input_text",
    "model": "component_input_text",
    "column_name": "test52",
    "checked": true,
    "map_to": "test52",
    "decimal": "."
}
```
- `model === 'section_id'` or `'component_section_id'`: skip (handled separately)
- `checked === false` or `map_to` missing: skip column
- Header must match `column_map->tipo` for the column to be processed

### 3. Row Processing (`import_dedalo_csv_file()`)
```
For each CSV row (skip header):
  1. Extract section_id → create/update section record
  2. For each column:
     a. Skip if model=section_id, unchecked, or header mismatch
     b. Trim value, unescape U+003B → ;
     c. Resolve component_tipo from map_to
     d. Get component instance (model_name, tipo, section_id, 'list', lang)
     e. Call conform_import_data($value, $column_name)
     f. If errors → log and continue
     g. Switch on component type:
        - created_date/modified_date → set_data() + set section timestamp
        - created_by_user/modified_by_user → set_data() + set section userID
        - translatable + object conformed_value → iterate lg-* keys, call set_data_lang($v_value, $v_key)
        - default → update_data_value({action:'set_data', value:$conformed_value})
     h. Call import_save()
```

### 4. `set_data()` Auto-Wrapping
At `component_common:878-885`:
- Non-object elements → wrapped into `{value: $element, lang: $this->lang}` (if translatable)
- Missing `id` → auto-assigned via `set_data_item_counter()`
- Empty arrays `[null]`, `['']` → converted to null

### 5. `set_data_lang()` Behavior
At `component_common:951-1029`:
- **Requires array of objects** — non-object items are logged as error and skipped
- Clones each item, forces `lang` property
- Merges with existing data (removes old items of same lang, keeps other langs)
- Calls `set_data()` with merged result

## Component-Specific `conform_import_data()` Patterns

### component_input_text
- JSON decode → normalize array items to `{value: $val}` objects
- Plain string → `[(object)['value' => $import_value]]`
- Empty → null
- Malformed JSON (`["` prefix) → error

### component_text_area
- Same as input_text but with HTML normalization:
  - Wrap in `<p>...</p>` if missing
  - Replace `<br>` → `</p><p>`
  - Replace `\n`/`\r\n` → `</p><p>`
- JSON object with `lg-*` keys → normalize each key's values

### component_email
- JSON decode → normalize array items to `{value: $val}` objects
- Plain string → `[(object)['value' => trim($import_value)]]`
- Empty → null

### component_number
- JSON decode → normalize non-object items to `{value: $val}` objects
- Plain string → convert via `string_to_number()` → `[(object)['value' => $number]]`
- Supports decimal separator config via `$column_map->decimal`
- Non-numeric → error

### component_date
- JSON decode → extract lang-specific data if object with `lg-*` key
- Plain string → parse via `dd_date` (supports ymd, dmy, mdy, range `<>`, multi `|`)
- Returns array of date objects with `start`/`end` properties (NO `value` property)
- `set_data()` auto-assigns `id` and `lang`

### component_iri
- JSON decode → validate IRI protocol
- Translatable: object with `lg-*` keys → validate each lang
- Plain string → parse via `conform_string_import_data()` (supports `label, iri` format)
- Returns array of IRI objects with `iri` property (NO `value` property)

### component_relation_common
- JSON decode → validate locators
- Plain string/int → construct locator from `column_name` target section_tipo
- Returns array of `locator` objects (section_id, section_tipo, from_component_tipo, type)

### component_common (base fallback)
- For components without their own override
- JSON decode → normalize array items to `{value: $val}` for `$components_using_value_property`
- Non-JSON non-empty string → wrap as `[(object)['value' => $val}]` for value-property components
- Non-value-property components → pass through (set_data handles wrapping)

## Export Format (`dedalo_raw` vs `standard`)

- **`dedalo_raw`**: Headers use ontology tipos (e.g., `dd199` instead of "Creation date"). Used for round-trip import/export.
- **`standard`**: Headers use human-readable labels. Not suitable for automated re-import.
- **`grid_value`**: Returns raw grid cell objects. Used internally.
- **`value`**: Returns plain values without structure.

## Common Pitfalls

1. **Returning plain strings from `conform_import_data()`** → silently dropped by `set_data_lang()`
2. **Using `set_data()` instead of `set_data_lang()` for translatable components** → `lang` not assigned on object items
3. **Forgetting `decimal` config for `component_number`** → comma-separated numbers parsed incorrectly
4. **Missing `from_component_tipo` in relation locators** → locator validation fails
5. **Not handling `lg-nolan` unwrap** → Nolan components store data under `lg-nolan` key which must be extracted before saving
6. **Setting `save_modified = false` for modified_date/modified_by_user** → prevents section from being marked as modified after import
7. **Bulk process components** (`DEDALO_BULK_PROCESS_FILE_TIPO`, `DEDALO_BULK_PROCESS_LABEL_TIPO`) use `set_data()` directly with pre-built `{value: $val}` objects — this is correct and doesn't need `set_data_lang()`

## Testing

```bash
# Run import tool tests
vendor/bin/phpunit test/server/tools/tool_import_dedalo_csv_Test.php

# Run specific component conform tests
vendor/bin/phpunit test/server/components/component_input_text_Test.php
vendor/bin/phpunit test/server/components/component_text_area_Test.php
vendor/bin/phpunit test/server/components/component_email_Test.php
vendor/bin/phpunit test/server/components/component_number_Test.php

# Test CSV files location
test/server/files/import_csv/export_test_unit-test3.csv
test/server/files/import_csv/export_test_unit-simple-test3.csv
```

## When Adding a New Component with CSV Import

1. Override `conform_import_data(string $import_value, string $column_name): object` in the component class
2. Return `array of objects` — never plain strings
3. For value-property components: wrap as `[(object)['value' => $conformedVal]]`
4. For non-value-property components: return objects with native properties
5. Do NOT assign `id` or `lang` — `set_data()`/`set_data_lang()` handles this
6. Add test cases in both the component test file and `tool_import_dedalo_csv_Test.php`
7. Test with: plain string, JSON array, JSON object (multi-lang), empty, malformed
