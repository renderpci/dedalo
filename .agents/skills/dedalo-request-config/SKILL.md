---
name: dedalo-request-config
description: Working with Dédalo's request_config system for configuring sections, components, and data retrieval.
---

# Dédalo Request Config Skill

This skill provides guidance for working with Dédalo's `request_config` system - the mechanism that defines how sections and components retrieve and display their data.

## Overview

The `request_config` system bridges ontology definitions with API requests. It determines:
- **What** data to display (columns, fields)
- **How** to search for records
- **Where** to get the data (section tipos, external APIs)
- **Which** elements to show or hide

## Architecture

### File Structure

```
core/common/
├── class.common.php              # Main orchestrator (get_ar_request_config)
├── trait.request_config_utils.php # Validation, caching, pagination
├── trait.request_config_ddo.php   # DDO map processing
├── trait.request_config_v6.php    # V6 parsing (properties->source->request_config)
└── trait.request_config_v5.php    # V5 fallback (relation_nodes)
```

### Processing Flow

1. **Context Extraction** - Get tipo, section_tipo, section_id, mode, model
2. **Validation** - Verify section_tipo is valid section/area
3. **Cache Check** - Return cached result if available
4. **Properties Resolution** - Get properties (possibly from section_list child)
5. **Pagination Calculation** - Determine limit/offset
6. **Build Config** - Parse V6 or use V5 fallback
7. **Cache Result** - Store for future requests

---

## Key Concepts

### V6 vs V5 Configuration

| Aspect | V6 (Recommended) | V5 (Legacy) |
|--------|------------------|-------------|
| Definition | `properties->source->request_config` | Ontology `relation_nodes` |
| Style | Explicit JSON configuration | Implicit from hierarchy |
| Flexibility | High - full control | Limited - follows structure |
| Maintenance | Easier to modify | Requires ontology changes |

### Request Config Object Structure

```typescript
interface request_config_object {
  api_engine: 'dedalo' | 'zenon' | string;
  type: 'main' | string;
  sqo: {
    section_tipo: dd_object[];
    limit?: number;
    offset?: number;
    filter_by_list?: object;
    fixed_filter?: object;
  };
  show: {
    ddo_map: dd_object[];
    sqo_config: object;
    interface?: object;
  };
  search?: { ddo_map: dd_object[]; };
  choose?: { ddo_map: dd_object[]; };
  hide?: { ddo_map: dd_object[]; };
}
```

### DDO (Data Description Object)

Each item in `ddo_map`:

```typescript
interface dd_object {
  tipo: string;           // Ontology identifier
  model: string;          // Component model name
  section_tipo: string;   // Target section (or 'self')
  parent: string;         // Parent element tipo (or 'self')
  mode: string;           // Display mode
  view?: string;          // View variant
  label: string;          // Human-readable name
}
```

---

## Common Tasks

### Adding a Column to a Section List

1. **Locate the section's properties** in ontology
2. **Find or create `source->request_config`**
3. **Add ddo to `show->ddo_map`**:

```json
{
  "tipo": "component_tipo",
  "section_tipo": "self",
  "parent": "self"
}
```

### Creating an Autocomplete Configuration

Autocomplete needs three configurations:

```json
{
  "show": {
    "ddo_map": [{"tipo": "field1", "section_tipo": "self", "parent": "self"}]
  },
  "search": {
    "ddo_map": [{"tipo": "field1", "section_tipo": "self", "parent": "self"}],
    "sqo_config": {"limit": 30}
  },
  "choose": {
    "ddo_map": [
      {"tipo": "field1", "section_tipo": "self", "parent": "self"},
      {"tipo": "field2", "section_tipo": "self", "parent": "self"}
    ],
    "fields_separator": " | "
  }
}
```

### Configuring a Portal

Portals use `request_config` to define columns:

```json
{
  "source": {
    "request_config": [{
      "sqo": {
        "section_tipo": [{"value": ["target_section"], "source": "section"}]
      },
      "show": {
        "ddo_map": [
          {"tipo": "column1", "section_tipo": "self", "parent": "self"},
          {"tipo": "column2", "section_tipo": "self", "parent": "self"}
        ],
        "sqo_config": {"limit": 50}
      }
    }]
  }
}
```

---

## Self Resolution

The `self` keyword resolves at runtime:

| Property | Resolves To |
|----------|-------------|
| `section_tipo: "self"` | Current section_tipo or array |
| `parent: "self"` | Current element's tipo |

**Example**:
```json
{"tipo": "numisdata27", "section_tipo": "self", "parent": "self"}
```
When used in section `numisdata3`, becomes:
```json
{"tipo": "numisdata27", "section_tipo": "numisdata3", "parent": "numisdata3"}
```

---

## Pagination

### Priority Order

1. API request (`dd_core_api::$rqo->sqo->limit`)
2. Instance pagination (`$this->pagination->limit`)
3. Properties config (`request_config->show->sqo_config->limit`)
4. Mode/model defaults

### Default Limits

| Caller | Mode | Default |
|--------|------|---------|
| section | edit | 1 |
| section | list | 10 |
| component | edit | 10 |
| component | list | 1 |

---

## Caching

- Cache key: `{tipo}_{section_tipo}_{external}_{mode}_{section_id}`
- Cleared when array exceeds 1000 entries
- **Disabled** when `fixed_filter` is used (section_id dependent)

---

## Interface Controls

Control UI elements via `show->interface`:

```json
{
  "interface": {
    "read_only": false,
    "button_add": true,
    "button_delete": true,
    "button_link": true,
    "button_edit": false,
    "tools": true
  }
}
```

---

## External APIs

For external APIs (Zenon, etc.):

1. Set `api_engine` to external name
2. Configure `api_config` in target section's properties

```json
{
  "api_engine": "zenon",
  "sqo": {"section_tipo": [{"value": ["zenon1"], "source": "section"}]},
  "show": {
    "ddo_map": [{"tipo": "zenon5", "section_tipo": "self", "fields_map": true}]
  }
}
```

---

## Debugging

### Empty ddo_map

1. Check `section_tipo` is valid
2. Verify TLD is installed (`ontology_utils::check_active_tld`)
3. Ensure user has permissions (>= 1)

### Wrong Section Resolution

1. `self` not resolving - check context
2. Multiple sections - verify `ar_section_tipo` extraction

### Cache Issues

1. `fixed_filter` disables caching
2. Clear cache by changing cache key parameters

### V5 Fallback Triggered

1. Ensure `properties->source->request_config` exists
2. Validate JSON in ontology properties

---

## Best Practices

1. **Always use V6 configuration** for new definitions
2. **Use `self` references** instead of hardcoding
3. **Separate show/search/choose** for autocomplete
4. **Set appropriate limits** for performance
5. **Use `get_ddo_map`** for shared definitions
6. **Test permissions** with different users

---

## Code References

### Getting Request Config

```php
// Get full array
$ar_request_config = $section->get_ar_request_config();

// Get first object
$request_config_object = $section->get_request_config_object();
```

### Processing DDO Map

```php
// Located in trait.request_config_ddo.php
protected function process_ddo_map(array $ar_ddo_map, object $context, string $map_type) : array;
protected function process_single_ddo(object $current_ddo, object $context, string $map_type) : ?object;
```

### Building Section Tipo DDO

```php
// Located in trait.request_config_utils.php
protected function build_sqo_section_tipo_ddo(array $ar_section_tipo) : array;
```

---

## Related Documentation

- `/docs/core/request_config.md` - Full architecture documentation
- `/docs/core/request_config_examples.md` - Practical examples
- `/docs/core/rqo.md` - Request Query Object
- `/docs/core/sqo.md` - Search Query Object
- `/docs/core/ontology/request_config_presets.md` - User-defined layouts
