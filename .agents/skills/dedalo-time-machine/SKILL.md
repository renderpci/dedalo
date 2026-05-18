---
name: dedalo-time-machine
description: Dédalo Time Machine (dd15) architecture, data model, and component integration patterns.
---

# Dédalo Time Machine Skill

Covers the Time Machine virtual section (`dd15`), its `matrix_time_machine` table, and how components interact with TM records.

## Key Constants

Defined in `core/base/dd_tipos.php`:

| Constant | Value | Meaning |
|---|---|---|
| `DEDALO_TIME_MACHINE_SECTION_TIPO` | `dd15` | TM virtual section tipo |
| `DEDALO_TIME_MACHINE_COLUMN_ID` | `dd1573` | Row primary key (`id` column) |
| `DEDALO_TIME_MACHINE_COLUMN_SECTION_ID` | `dd1212` | Source record section_id |
| `DEDALO_TIME_MACHINE_COLUMN_SECTION_TIPO` | `dd1772` | Source record section_tipo |
| `DEDALO_TIME_MACHINE_COLUMN_TIPO` | `dd577` | Component tipo that changed |
| `DEDALO_TIME_MACHINE_COLUMN_TIMESTAMP` | `dd559` | When the change happened |
| `DEDALO_TIME_MACHINE_COLUMN_USER_ID` | `dd578` | User who made the change |
| `DEDALO_TIME_MACHINE_COLUMN_BULK_PROCESS_ID` | `dd1371` | Bulk process identifier |
| `DEDALO_TIME_MACHINE_COLUMN_DATA` | `dd1574` | The actual changed data |

## Critical Architecture Point: section_tipo Mismatch

**The most important thing to understand about TM:**

The `matrix_time_machine` table has a `section_tipo` column, but it stores the **data section tipo** (e.g. `mdcat2949`, `oh1`), NOT the TM section tipo (`dd15`).

This means:
- DDO paths reference `dd15` as `section_tipo`
- DB rows have `section_tipo` = the original data section (e.g. `mdcat2949`)
- Direct comparison `first_path->section_tipo === row->section_tipo` **always fails** for TM records

The `search_tm` class confirms this in `build_main_where()`:
> *"matrix_time_machine table do not have self section_tipo column."*

## matrix_time_machine Table Structure

Flat columns (not JSONB like regular sections):

| Column | Type | Description |
|---|---|---|
| `id` | int (PK) | Auto-increment primary key |
| `section_id` | int | The source record's section_id |
| `section_tipo` | text | The source record's section_tipo (NOT dd15) |
| `tipo` | text | Component tipo that was modified |
| `lang` | text | Language of the modified data |
| `timestamp` | text | When the change occurred |
| `user_id` | int | User ID who made the change |
| `bulk_process_id` | int/null | Bulk operation identifier |
| `data` | jsonb | The actual component data that changed |

**No `relation` column** — TM rows use flat columns, not the `relation` JSONB pattern used by regular sections.

## Component Models for TM Columns

Defined in `ontology_node` as temporal models (until ontology is updated):

| Tipo | Model | TM Column |
|---|---|---|
| `dd1573` | `component_number` | `id` |
| `dd1212` | `component_number` | `section_id` |
| `dd1772` | `component_input_text` | `section_tipo` |
| `dd577` | `component_input_text` | `tipo` |
| `dd559` | `component_date` | `timestamp` |
| `dd578` | `component_portal` | `user_id` |
| `dd1371` | `component_number` | `bulk_process_id` |
| `dd1574` | `component_json` | `data` |

## How TM Components Get Their Data

TM components cannot read from DB directly (unlike regular sections). Instead:

1. `tm_record::get_section_record()` creates a `section_record` for `dd15` + `$id`
2. It transforms flat DB columns into component-formatted data objects
3. Data is injected into the `section_record` via `set_section_record_factory()`
4. The `section_record` is cached in `section_record_instances_cache`
5. Components created with `component_common::get_instance()` read from this cache

### Example: user_id (dd578 → component_portal)

```php
// tm_record creates a locator for the user
$user_locator = new locator();
    $user_locator->set_section_tipo(DEDALO_SECTION_USERS_TIPO);
    $user_locator->set_section_id($user_id);
    $user_locator->set_type(DEDALO_RELATION_TYPE_LINK);
    $user_locator->set_from_component_tipo(DEDALO_TIME_MACHINE_COLUMN_USER_ID);

// Injected into section_record as component_portal data
$this->set_section_record_factory(
    DEDALO_TIME_MACHINE_COLUMN_USER_ID, // 'dd578'
    [$user_locator],
    $section_record
);
```

### Example: timestamp (dd559 → component_date)

```php
$date = dd_date::get_dd_date_from_timestamp($timestamp);
$date_value = new stdClass();
    $date_value->id    = 1;
    $date_value->start = $date;

$this->set_section_record_factory(
    DEDALO_TIME_MACHINE_COLUMN_TIMESTAMP, // 'dd559'
    [$date_value],
    $section_record
);
```

## Search in TM Mode

`search_tm` extends `search` with:
- Fixed `$matrix_table = 'matrix_time_machine'`
- Empty `build_main_where()` (no self section_tipo filter)
- Default order: `timestamp DESC`
- Select: `*` (all flat columns)

SQO mode `'tm'` triggers `search_tm` via `search::get_instance()`.

## Component Instantiation for TM

When creating components for TM records:

```php
// CORRECT: use 'tm' mode and dd15 as section_tipo with row->id as section_id
$component = component_common::get_instance(
    $model,
    $tipo,           // e.g. 'dd578'
    (int)$row->id,   // TM row primary key, NOT row->section_id
    'tm',             // mode must be 'tm'
    DEDALO_DATA_NOLAN,
    DEDALO_TIME_MACHINE_SECTION_TIPO,  // 'dd15'
    false
);
```

```php
// WRONG: using row->section_tipo and row->section_id
$component = component_common::get_instance(
    $model,
    $tipo,
    $row->section_id,    // This is the SOURCE record's section_id
    'edit',               // Wrong mode
    DEDALO_DATA_NOLAN,
    $row->section_tipo,   // This is the SOURCE section_tipo (e.g. mdcat2949)
    false
);
```

## Common Pitfalls

1. **section_tipo mismatch**: DDO paths have `dd15`, rows have data section_tipo. Always use `dd15` for TM component instantiation.
2. **section_id vs id**: TM components need `row->id` (the TM PK), not `row->section_id` (the source record's section_id).
3. **No relation column**: TM rows don't have `row->relation->{$tipo}`. Data is in flat columns and accessed via `section_record` cache.
4. **Data must be pre-populated**: Before creating TM components, call `tm_record::get_section_record()` to populate the `section_record` cache. Without this, components will find no data.
5. **Mode must be 'tm'**: Components in TM context should use mode `'tm'`, not `'edit'`. The `set_data_default()` method explicitly warns about this.
6. **TM records are read-only**: `tm_record::save()` blocks saves for `dd15` section_tipo. Never attempt to write TM records.

## Key Files

| File | Purpose |
|---|---|
| `core/tm_record/class.tm_record.php` | TM record management, `get_section_record()` data transformation |
| `core/tm_record/class.tm_record_data.php` | TM data persistence layer |
| `core/db/class.tm_db_manager.php` | DB operations for `matrix_time_machine` |
| `core/search/class.search_tm.php` | Search class for TM table |
| `core/section_record/class.section_record.php` | Record cache (line 1524: special TM handling) |
| `core/base/dd_tipos.php` | TM constant definitions |
| `core/ontology_engine/class.ontology_node.php` | Temporal model resolution for TM tipos |
