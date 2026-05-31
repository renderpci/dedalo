---
name: dedalo-context-data-layers
description: How Dédalo builds, structures, and consumes the context and data layers in JSON API output for sections, components, and portals.
---

# Dédalo Context & Data Layers Skill

This skill covers the two-layer JSON architecture that every Dédalo API response follows: **`context`** (structural/configuration) and **`data`** (instance-specific values). Understanding the boundary between these layers is essential for modifying JSON controllers, debugging missing data, and deciding where new properties belong.

---

## Top-Level Structure

Every `get_json()` call returns:

```json
{
  "context": [dd_object, dd_object, ...],
  "data":    [data_item, data_item, ...],
  "debug":   {}  // only when SHOW_DEBUG=true
}
```

Built by `common::build_element_json_output($context, $data)` at `core/common/class.common.php:1221`.

---

## Context Layer

### Purpose
Context describes **what** an element is and **how** to display it. It is structural, relatively stable, and can be cached per `tipo` + `section_tipo` + `mode`.

### Builder
`common::get_structure_context(int $permissions, bool $add_request_config)` at `core/common/class.common.php:1312`.

Returns a `dd_object` with these core properties:

| Property | Type | Description |
|----------|------|-------------|
| `tipo` | string | Ontology identifier |
| `section_tipo` | string | Target section |
| `model` | string | Class name (e.g. `component_text_area`) |
| `legacy_model` | string\|null | Pre-v6 model name |
| `parent` | string | Parent tipo (resolved from session → `from_parent` → section_tipo → ontology) |
| `parent_grouper` | string\|null | Structure parent for grouping |
| `lang` | string | Current language |
| `mode` | string | Display mode (`edit`, `list`, `tm`, `search`) |
| `label` | string | Human-readable label (overridable via `properties->label`) |
| `translatable` | bool | Whether the element supports translation |
| `properties` | object | Ontology properties (cloned to prevent mutation) |
| `css` | string\|null | CSS class (removed in list mode for non-sections) |
| `permissions` | int | User permission level (0=none, 1=read, 2=write) |
| `tools` | array | Tool context objects (edit mode for components, list mode for sections) |
| `buttons` | array | Button context objects |
| `request_config` | array\|null | Only when `add_request_config=true` |
| `columns_map` | array\|null | Only when `request_config` is present |
| `sortable` | bool | Whether the element can be sorted |
| `view` | string | View variant (default `"default"`) |
| `children_view` | string\|null | Forced view for children |

### Component-specific context additions
Components add extra context properties in `get_structure_context()`:

| Property | When | Description |
|----------|------|-------------|
| `path` | `sortable=true` | Order path for column sorting |
| `search_operators_info` | `mode=search` | Search operator tooltips |
| `search_options_title` | `mode=search` | Search panel title |
| `new_dataframe` | `mode!=search` | Dataframe child tipo |
| `show_interface` | shared sections | Button visibility overrides |
| `filter_by_list` | `properties->source->filter_by_list` | Pre-resolved filter options |
| `state_of_component` | `properties->state_of_component` | Widget state config |

### Section-specific context additions
Sections add:

| Property | Description |
|----------|-------------|
| `section_map` | Maps generic names to specific tipos (e.g. `term` → `hierarchy25`) |
| `config->relation_list_tipo` | The `relation_list` child tipo |
| `matrix_table` | DB table name for the section |
| `sqo_session` | Synced SQO from session for pagination consistency |

### Context types
- **`default`**: Full context via `get_structure_context()` — includes tools, buttons, permissions.
- **`simple`**: Lightweight context via `get_structure_context_simple()` — skips tools, buttons, permission calculation. Used for filter lists, autocomplete targets, etc.

### Caching
- Cache key: `{tipo}_{section_tipo}_{mode}`
- Stored in `self::$cache_structure_context`
- Cache size managed via `manage_cache_size()` (prevents memory leaks)
- Context is **not** request-scoped — same tipo/mode returns the same dd_object across section_ids

---

## Data Layer

### Purpose
Data contains the **instance-specific** values for a given section_id. It is dynamic, request-scoped, and cannot be cached across section_ids.

### Builder
Each component's `{model}_json.php` file builds data items. The base pattern is:

```php
$item = $this->get_data_item($value);
$data[] = $item;
```

### Data Item Structure
`component_common::get_data_item($value)` at `core/common/class.common.php:3529` returns:

| Property | Type | Description |
|----------|------|-------------|
| `section_id` | int | Record identifier |
| `section_tipo` | string | Record section |
| `tipo` | string | Component tipo |
| `mode` | string | Current mode |
| `lang` | string | Current language |
| `from_component_tipo` | string | Origin component (for portal children) |
| `entries` | mixed | The actual data value(s) |

### Mode-dependent value resolution

| Mode | Typical method | Description |
|------|---------------|-------------|
| `edit` | `get_data_lang()` | Full data in the current language |
| `list` | `get_value()` / `get_list_value()` | Display-ready label(s) |
| `tm` | `get_value()` / `get_list_value()` | Time Machine version of list data |
| `search` | `get_data()` | Raw data for search indexing |
| `solved` | `get_value()` | Resolved literal value |

### Component-specific data additions
Components extend the base data item with extra properties:

| Component | Property | Description |
|-----------|----------|-------------|
| `component_select` | `datalist` | Available options for the dropdown |
| `component_radio_button` | `datalist` | Available radio options |
| `component_check_box` | `datalist` | Available checkbox options |
| `component_portal` | `pagination`, `parent_tipo`, `parent_section_id` | Portal row metadata |
| `component_text_area` | `fallback_value`, `tags_persons`, `related_sections` | Rich text extras |
| `component_text_area` (tm) | `parent_section_id`, `matrix_id`, `created_by_user_id` | Time Machine metadata |

---

## The Context vs. Data Boundary

### Rule of thumb
- **Context**: Would be the same regardless of which `section_id` is loaded. Structural, cacheable, per-tipo.
- **Data**: Changes per `section_id`. Dynamic, request-scoped, not cacheable across instances.

### Common decision points

| Property | Layer | Why |
|----------|-------|-----|
| `datalist` (select options) | **data** | Depends on lang, filters, and sometimes section_id (dynamic filters) |
| `request_config` | **context** | Defines how to search, same structure for all records |
| `properties` | **context** | Ontology definition, same for all instances |
| `tools` | **context** | Available tools don't change per record |
| `permissions` | **context** | Component-level permission (same for all records of that tipo) |
| `filter_by_list` | **context** | Pre-resolved filter options (computed once) |
| `pagination` | **data** | Depends on the specific record's data volume |
| `fallback_value` | **data** | Computed from the record's actual data |
| `target_sections` | **context** | Which sections the component can point to |

### When in doubt
Ask: *"If I load this component for section_id=1 vs section_id=2, would this property be different?"*
- **Yes** → `data`
- **No** → `context`

---

## Subdatum

Portal and section JSON controllers resolve **child elements** (columns, related components) via `common::get_subdatum()` at `core/common/class.common.php:1848`.

### Flow
1. Collect `request_config` from `$this->context->request_config`
2. Build `full_ddo_map` from all request_config objects (show + hide)
3. For each locator in the portal's data:
   - Match DDOs by `section_tipo`
   - Instantiate each child element (section or component)
   - Inject `request_config`, `from_parent`, permissions, view
   - Call `get_json()` on each child → merge child's `context` and `data` into parent arrays
4. Return `{context: [...], data: [...]}`

### Key behaviors
- **Permissions inheritance**: If user can read the portal but not the target section, child components get minimum read permission (1)
- **Mode propagation**: `tm` mode propagates from parent; otherwise DDO mode or parent mode is used
- **Dataframe special case**: Dataframes use the main component's section_tipo (not the locator's) and the main section_id
- **Row coherence**: Each subdata item gets `row_section_id` and `parent_tipo` to preserve row identity

---

## JSON Controller Pattern

Every `{model}_json.php` file follows the same scaffold:

```php
<?php declare(strict_types=1);
if (!isset($this)) { http_response_code(404); exit; }

// 1. Configuration vars
$permissions = $this->get_component_permissions();
$mode        = $this->get_mode();

// 2. Context
$context = [];
if ($options->get_context === true) {
    switch ($options->context_type) {
        case 'simple':
            $this->context = $this->get_structure_context_simple($permissions, $add_request_config);
            break;
        default:
            $this->context = $this->get_structure_context($permissions, $add_request_config);
            // ... component-specific context additions
            break;
    }
    $context[] = $this->context;
}

// 3. Data
$data = [];
if ($options->get_data === true && $permissions > 0) {
    // mode-dependent value
    switch ($mode) {
        case 'list': case 'tm': $value = ...; break;
        case 'edit': default:   $value = ...; break;
    }

    $item = $this->get_data_item($value);
    // ... component-specific data additions (datalist, pagination, etc.)
    $data[] = $item;

    // subdatum (if portal/dataframe children exist)
    if (!empty($value) && !empty($this->context->request_config)) {
        $subdatum = $this->get_subdatum($this->tipo, $value);
        array_push($context, ...$subdatum->context);
        array_push($data, ...$subdatum->data);
    }
}

// 4. Return
return common::build_element_json_output($context, $data);
```

---

## Client Consumption

The client receives the JSON and splits it:

- **`self.context`** → `self.datum.context[i]` matched by `tipo` + `section_tipo` + `mode`
- **`self.data`** → `self.datum.data[i]` matched by `tipo` + `section_tipo` + `section_id` + `parent`

Key client files:
- `core/common/js/common.js` — `get_columns_map`, context/data matching
- `core/section/js/section_record.js` — instance creation from context+data
- `core/component_common/js/common.js` — `build` method populates `self.data` and `self.context`

---

## Debugging

### Missing data item
1. Check `permissions > 0` — data is skipped entirely when permissions are 0
2. Check `$options->get_data === true` — some calls request context only
3. Verify the component's `get_data_lang()` / `get_value()` returns non-empty data

### Missing context item
1. Check `$options->get_context === true`
2. Verify `get_structure_context()` is not hitting a cached stale entry
3. Check `context_type` — `simple` mode omits tools, buttons, permissions

### Subdatum empty
1. Verify `request_config` exists in `$this->context->request_config`
2. Check `ddo_map` has entries for the target section_tipo
3. Ensure locators have the correct `section_tipo` matching DDO definitions

### Context/data mismatch on client
1. The client matches by `tipo` + `section_tipo` + `mode` (context) and `tipo` + `section_tipo` + `section_id` (data)
2. Duplicated context items are filtered in `sections_json.php` by `tipo + section_tipo + mode`
3. If a component appears in multiple portal rows, each data item gets `row_section_id` for row coherence

---

## Code References

| What | File | Line |
|------|------|------|
| `build_element_json_output` | `core/common/class.common.php` | ~1221 |
| `get_json` | `core/common/class.common.php` | ~1243 |
| `get_structure_context` | `core/common/class.common.php` | ~1312 |
| `get_structure_context_simple` | `core/common/class.common.php` | ~1815 |
| `get_subdatum` | `core/common/class.common.php` | ~1848 |
| `get_data_item` | `core/component_common/class.component_common.php` | ~3529 |
| Section JSON controller | `core/section/section_json.php` | 1-56 |
| Portal JSON controller | `core/component_portal/component_portal_json.php` | 1-129 |
| Select JSON controller | `core/component_select/component_select_json.php` | 1-131 |
| Text area JSON controller | `core/component_text_area/component_text_area_json.php` | 1-271 |

---

## Related Skills

- **dedalo-datalist-resolution** — How `datalist` (a data-layer property) is resolved for selection components
- **dedalo-request-config** — How `request_config` (a context-layer property) is built from ontology
- **dedalo-flow-analysis** — Tracing data from API response through the client lifecycle
- **dedalo-ontology-mapping** — How ontology properties feed into both context and data resolution
