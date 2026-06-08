---
name: dedalo-datalist-resolution
description: How Dédalo resolves, caches, and serves component option lists (datalist) for select, check_box, radio_button, and relation-based components.
---

# Dédalo Datalist Resolution Skill

This skill covers the architecture and conventions for resolving `datalist` — the list of possible option values for selection-type components — from the server through to the JSON API output consumed by the client.

## Core Concept

**Datalist** is the set of selectable options for a component (e.g., the rows a `component_select` dropdown offers). It is *not* the component's stored data (which is the user's chosen locator(s)). Datalist lives in the **`data`** layer of the JSON output, not in `context`, because it is dynamic, DB-derived, and request-scoped (depends on lang, filters, and section_id).

---

## Canonical Resolver: `get_list_of_values()`

### Location
`core/component_common/class.component_common.php` — `component_common::get_list_of_values()`

### Signature
```php
public function get_list_of_values(
    string $lang = DEDALO_DATA_LANG,
    bool   $include_negative = false
) : object
```

### Return Structure
```php
$response = new stdClass();
$response->result  = [];   // array of {value: locator, label: string, section_id: int, hide: array}
$response->msg     = '';
$response->errors  = [];
```

Each item in `$response->result`:
```typescript
interface datalist_item {
  value:      locator;   // {section_id, section_tipo}
  label:      string;    // Display text (resolved in requested lang)
  section_id: number;    // Convenience copy from locator
  hide:       string[];  // Fields to hide in UI (from ddo_map hide config)
}
```

### Resolution Flow

1. **Cache lookup** — keyed by `{tipo}_{section_tipo}_{lang}_{mode}_{hash}`, where `hash` is `md5(json_encode(filter))` or `'full'` if no filter.
2. **Request config** — builds `dedalo_request_config` via `build_request_config()`, which yields a `ddo_map` and `sqo`.
3. **Filter application** (priority order):
   - `dedalo_request_config->sqo->fixed_filter` (from ontology `request_config`)
   - `properties->filtered_by_search_dynamic` (runtime, parsed via `parse_search_dynamic()`)
   - `properties->filtered_by_search` (static filter from ontology properties)
4. **Search execution** — `search::search_query_object()` runs the SQO against the DB.
5. **Label resolution** — each result locator gets its display label via `component_common::get_term_by_locators()`.
6. **Hide resolution** — `ddo_map` hide entries are resolved per result row.
7. **Sort** — results sorted alphabetically by label.
8. **Cache store** — full response cached for subsequent identical calls.

---

## Deprecated Alias: `get_ar_list_of_values()`

```php
/** @deprecated Use get_list_of_values() instead. */
public function get_ar_list_of_values(
    string $lang = DEDALO_DATA_LANG,
    bool   $include_negative = false
) : object {
    return $this->get_list_of_values($lang, $include_negative);
}
```

Kept for one release cycle as a thin BC alias. Do **not** call it in new code. The old SQO-based engine that lived inside it has been removed; all resolution now goes through the canonical `request_config`/`ddo_map` path.

---

## Override: `component_select_lang::get_list_of_values()`

`component_select_lang` overrides the canonical method because language lists are resolved from `DEDALO_PROJECTS_DEFAULT_LANGS` rather than from a DB search.

```php
// core/component_select_lang/class.component_select_lang.php
public function get_list_of_values(
    ?string $lang = DEDALO_DATA_LANG,
    bool    $include_negative = false
) : object
```

Returns the same `{result, msg, errors}` structure but populated from `lang::resolve_multiple()`.

---

## JSON Output Convention

All selection-type JSON files (`*_json.php`) follow the same pattern:

```php
// In the switch/case for mode:
case 'edit':
default:
    $value    = $this->get_data_lang();  // or get_data() / get_list_value()
    $datalist = $this->get_list_of_values(DEDALO_DATA_LANG)->result ?? [];
    break;

// After the switch, assign to output:
if (isset($datalist)) {
    $item->datalist = $datalist;
}
```

### Applicable JSON Files
| File | Notes |
|------|-------|
| `core/component_select/component_select_json.php` | Edit mode: `include_negative=true` |
| `core/component_radio_button/component_radio_button_json.php` | TM mode: only adds datalist when `caller_dataframe` is set |
| `core/component_check_box/component_check_box_json.php` | Uses `$this->get_datalist()` which internally calls `get_list_of_values()` |
| `core/component_select_lang/component_select_lang_json.php` | Uses the `component_select_lang` override |
| `core/component_relation_model/component_relation_model_json.php` | Standard pattern |
| `core/component_publication/component_publication_json.php` | Standard pattern |

### Client Consumption
The client reads `datalist` from `self.data.datalist`:
- `component_select`: `view_default_edit_select.js`
- `component_check_box`: `component_check_box.js`
- `component_radio_button`: `component_radio_button.js`

---

## `component_check_box::get_datalist()`

This is a **component-specific convenience** that wraps the canonical resolver and adds tool-specific hydration:

```php
// core/component_check_box/class.component_check_box.php
public function get_datalist(?string $lang = DEDALO_DATA_LANG) : array {
    $list_of_values_response = $this->get_list_of_values($lang ?? DEDALO_DATA_LANG, false);
    $datalist = $list_of_values_response->result ?? [];
    // ... tool hydration (tool_cataloging, etc.)
    return $datalist;
}
```

Returns `array` (not `object`), which is why the JSON file uses `$this->get_datalist()` instead of `get_list_of_values()->result`.

---

## `get_list_value()` (label lookup)

Used in list/tm modes to show the human-readable label for the currently stored locator(s):

```php
// core/component_relation_common/class.component_relation_common.php
public function get_list_value() : array {
    $list_value = [];
    $list_of_values = $this->get_list_of_values(DEDALO_DATA_LANG);
    foreach ($list_of_values->result as $item) {
        $locator = $item->value;
        if (locator::in_array_locator($locator, $data, ['section_id','section_tipo'])) {
            $list_value[] = $item->label;
        }
    }
    return $list_value;
}
```

---

## Other `get_datalist()` Methods (Out of Scope)

Several components have their own `get_datalist()` with different signatures/semantics. These are **not** part of the unified datalist resolution and must not be confused with it:

| Component | Signature | Purpose |
|-----------|-----------|---------|
| `component_filter` | `get_datalist(): array` | Thesaurus term tree |
| `component_media_common` | `get_datalist(): array` | Media quality variants |
| `component_security_access` | `get_datalist(int $user_id)` | Permission matrix |
| `component_filter_records` | `get_datalist(): array` | Filter record options |

---

## Caching

- **Static cache**: `self::$list_of_values_data_cache` on `component_common`.
- **Cache key**: `{tipo}_{section_tipo}_{lang}_{mode}_{filter_hash}`
- **Filter hash**: `md5(json_encode($filter))` when a filter is active, `'full'` otherwise.
- Filters considered for hash: `sqo->fixed_filter`, `properties->filtered_by_search_dynamic`, `properties->filtered_by_search`.
- **Orphaned cache**: `self::$ar_list_of_values_data_cache` is deprecated and should be removed in a future cleanup.

---

## Filtering Mechanisms

### `fixed_filter` (from request_config)
Defined in the ontology's `properties->source->request_config->sqo->fixed_filter`. Applied first. Static per tipo/mode.

### `filtered_by_search` (from component properties)
Defined in `properties->filtered_by_search`. A static JSON filter object applied when no `fixed_filter` exists.

### `filtered_by_search_dynamic` (from component properties)
Defined in `properties->filtered_by_search_dynamic`. Contains dynamic tokens like `{{section_id}}` that are resolved at runtime via `parse_search_dynamic()` before being set as the SQO filter.

Priority: `fixed_filter` > `filtered_by_search_dynamic` > `filtered_by_search`.

---

## Debugging

### Empty datalist
1. Check `request_config` exists in ontology properties (`source->request_config`).
2. Verify `ddo_map` has entries for the target section.
3. Check `sqo->filter` is not excluding all records.
4. Ensure the target section has records in the requested lang.

### Wrong filter applied
1. Inspect `$this->properties->filtered_by_search*` on the component instance.
2. Check cache hash — if a previous call with a different filter was cached, the hash should differ.
3. Use `dump($this->get_list_of_values($lang))` to see the raw response.

### `component_select_lang` returns unexpected langs
1. Check `DEDALO_PROJECTS_DEFAULT_LANGS` constant.
2. The override bypasses DB search entirely — verify `lang::resolve_multiple()` output.

---

## Code References

| What | File | Line |
|------|------|------|
| Canonical resolver | `core/component_common/class.component_common.php` | ~2404 |
| Deprecated alias | `core/component_common/class.component_common.php` | ~2385 |
| select_lang override | `core/component_select_lang/class.component_select_lang.php` | ~194 |
| check_box get_datalist | `core/component_check_box/class.component_check_box.php` | ~57 |
| get_list_value | `core/component_relation_common/class.component_relation_common.php` | ~2641 |
| widget state usage | `core/widgets/state/class.state.php` | ~416 |
| filter_list_data | `core/component_relation_common/class.component_relation_common.php` | `get_filter_list_data()` |

---

## Related Skills

- **dedalo-request-config** — How `request_config` and `ddo_map` are built (the engine `get_list_of_values()` relies on).
- **dedalo-ontology-mapping** — How ontology properties define `filtered_by_search` and `request_config`.
- **dedalo-flow-analysis** — Tracing data from API response to client component.
