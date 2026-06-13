# component_date

## Overview

```json
{
    "could_be_translatable" : false,
    "is_literal": true,
    "is_related": false,
    "is_media": false,
    "modes": ["edit","list","tm","search"],
    "default_tools" : [
        "tool_time_machine",
        "tool_replace_component_data",
        "tool_add_component_data"
    ],
    "render_views" :[
        {
            "view"    : "default | mini",
            "mode"    : "edit | list"
        },
        {
            "view"    : "line | print",
            "mode"    : "edit"
        },
        {
            "view"    : "text",
            "mode"    : "list"
        }
    ],
    "data": "object",
    "sample_data": {
        "lg-nolan": [
            {
                "start" : {
                    "year": 2012,
                    "month": 11,
                    "day": 7,
                    "hour": 17,
                    "minute": 33,
                    "second": 49,
                    "time": 64638475292
                },
                "end" : {
                    "year": 2012,
                    "month": 12,
                    "day": 8,
                    "hour": 22,
                    "minute": 15,
                    "second": 35,
                    "time": 64641254135
                }
            },
            {
                "start": {
                    "year": 322,
                    "time": 10349337600
                }
            }
        ]
    },
    "value": "array of objects",
    "sample_value": [{
        "start" : {
            "year": -350
        }
    }]
}
```

!!! note "Flags are documentation-layer classifiers"
    `could_be_translatable`, `is_literal`, `is_related` and `is_media` are client-model classifiers derived from the component model and ontology (consumed by the render layer); they are **not** stored datum fields. For `component_date` they are fixed: it is a **literal-direct**, **non-translatable** component, so `is_literal:true` and `could_be_translatable:false`.

## Definition

`component_date` is a **literal-direct** component (base class `component_common`) that manages dates and time values. Because dates are language-independent, the component is forced to be **non-translatable**: the constructor always sets `$this->lang = DEDALO_DATA_NOLAN`, and `lg-nolan` is the only language key in its stored data.

Unlike free text, a date is structured: it is stored as a `dd_date` object (year / month / day / hour / minute / second / millisecond) rather than a string, so it can be sorted, searched with ranges, and rendered in different locale orders (`dmy`, `ymd`, `mdy`) without ambiguity. The component supports **partial** dates (a bare year, a year+month, etc.), **negative years** (BCE), and an absolute-seconds `time` value computed on save (via `add_time()`) so the database can range-query across the whole timeline.

The behaviour of the component is driven by the ontology property `date_mode`:

- **date** *(default)*: a single date container (`start`), down to day precision.
- **range**: a `start` date and an `end` date.
- **period**: a duration expressed as a `period` container (years / months / days), not an absolute point in time.
- **time**: a clock time only (hour / minute / second).
- **time_range**: a `start` and `end` clock time.
- **date_time**: a full date plus clock time (year → second).

!!! tip "When to use it (cultural-heritage examples)"
    - **date** — date of birth/death of a person, creation date of an artwork, date a photograph was taken.
    - **range** — the active period of a workshop, the span of an archaeological excavation campaign (`1999/01/01 <> 2008/09/30`), the floruit of an author.
    - **period** — the duration of a loan, a restoration that lasted *3 years 10 months*.
    - **time / time_range** — a precise time code in an audiovisual transcription, opening hours of a monument.
    - **date_time** — the exact timestamp of a registration event or a measurement reading.

    Use `component_input_text` instead when the date is **uncertain, descriptive or non-numeric** (e.g. *"first half of the 19th century"*, *"circa 1850"*), since those cannot be reduced to a numeric `dd_date`.

## Data model

**Data:** `object` with `lg-nolan` as the only property.

**Value:** `array` of `dd_date` containers (objects), or `null`.

**Storage:** the value lives in the matrix `date` column. The component reads/writes only the `lg-nolan` slot (it is never per-language).

```json
{
    "lg-nolan": [
        {
            "start": {
                "year": 1999, "month": 1, "day": 1,
                "time": 64249459200
            },
            "end": {
                "year": 2008, "month": 9, "day": 30,
                "time": 64562659200
            }
        }
    ]
}
```

Each array entry is one *record* (multiple entries are allowed). An entry is an object whose keys depend on `date_mode`:

| Container | Used by mode | Meaning |
| --- | --- | --- |
| `start` | date, range, time, time_range, date_time | the date / starting date |
| `end` | range, time_range | the ending date |
| `period` | period | a duration (not an absolute date) |

Each container is a `dd_date` object whose properties are all individually optional (a date may contain only some of them):

| Property | Type | Range |
| --- | --- | --- |
| `year` | number | any integer, may be negative (BCE) |
| `month` | number | 1–12 |
| `day` | number | 1–31 (validated against month length and leap years) |
| `hour` | number | 0–23 |
| `minute` | number | 0–59 |
| `second` | number | 0–59 |
| `millisecond` | number | 0–999 |
| `time` | number | absolute seconds; **computed on save** by `add_time()` / `convert_date_to_seconds()`, not entered by the user |

!!! warning "`time` is server-computed"
    On `save()` the component injects/recomputes the absolute-seconds `time` value for each container (`add_time()`); if an incoming `time` diverges from the recalculated one a WARNING is logged and the **calculated** value wins. Do not author `time` by hand — supply only year/month/day/hour/minute/second.

Examples:

A punctual date `2012-11-07`:

```json
[{ "start": { "year": 2012, "month": 11, "day": 7 } }]
```

A range `2012-11-07 17:33:49` → `2012-12-08`:

```json
[{
    "start": { "year": 2012, "month": 11, "day": 7, "hour": 17, "minute": 33, "second": 49 },
    "end":   { "year": 2012, "month": 12, "day": 8 }
}]
```

Year only (BCE) `-238`:

```json
[{ "start": { "year": -238 } }]
```

Month/year only `1238-10`:

```json
[{ "start": { "year": 1238, "month": 10 } }]
```

A period of *3 years 10 months*:

```json
[{ "period": { "year": 3, "month": 10 } }]
```

A clock time `17:33:49`:

```json
[{ "start": { "hour": 17, "minute": 33, "second": 49 } }]
```

When the component is instantiated, it gets its data from its section and only reads the value without language (`lg-nolan`).

## Ontology instantiation

`component_date` is defined as an ontology node (a `ddo`) under a section, exactly like any other component. The node carries `model`, `parent`/`section_tipo` wiring and the language flags; it must be **non-translatable**.

Node definition (illustrative):

```json
{
    "tipo"         : "rsc85",
    "model"        : "component_date",
    "parent"       : "rsc197",
    "section_tipo" : "rsc197",
    "translatable" : false
}
```

- `model` — `component_date` (force-corrected against the ontology model on instantiation).
- `parent` / `section_tipo` — the section (or grouper) this date belongs to; `section_tipo` is mandatory at instantiation time.
- `translatable` — must be `false`; the component additionally forces `lg-nolan` internally and logs an error in debug if the node is marked translatable.

A realistic `properties` block for a *creation date span* rendered as a range:

```json
{
    "date_mode": "range",
    "fields_separator": " <> ",
    "records_separator": " | ",
    "mandatory": false
}
```

Instantiation through the shared factory (see [index](index.md#instantiation)):

```php
$component = component_common::get_instance(
    'component_date',   // model
    'rsc85',            // tipo
    $section_id,        // section id (or null)
    'edit',             // mode
    DEDALO_DATA_NOLAN,  // lang (forced to lg-nolan anyway)
    'rsc197'            // section_tipo
);
```

## Properties & options

Properties are read from the ontology node (`get_properties()`); the JS model reads the same object from `context.properties`.

### `date_mode`

Options: `date` | `range` | `period` | `time` | `time_range` | `date_time`

The kind of date the component manages and renders. Default is `date` (`component_date::$default_date_mode`). Read server-side by `get_date_mode()` / `get_date_mode_static()` and client-side by `get_date_mode()`; it drives both the rendered input widget and the text resolution (`data_item_to_value()`).

```json
{ "date_mode": "range" }
```

!!! note "Mode aliases"
    The value `datetime` is **deprecated/invalid** — the code logs an error and treats it as `date_time`. Always write `date_time`.

### `fields_separator`

The string placed **inside** a single record between its parts (e.g. between the start and end of a range) when the date is rendered as plain text or exported.

```json
{ "fields_separator": " <> " }
```

Produces text like `-200 <> 50/11`.

### `records_separator`

The string placed **between multiple records** (when the component holds more than one date) in text/export output. Defaults to `' | '` in the export path.

```json
{ "records_separator": " | " }
```

Produces `26/10/2023 | 18/11/2000`.

### `mandatory`

Options: `true` | `false`

Marks the component as required; the UI informs the user that a value must be entered.

### `multi_value`

Options: `true` | `false`

Allows more than one date record in the same component (the stored value becomes an array with several entries). Seen in the component sample context.

### `has_dataframe`

Options: `true` | `false`

Enables a paired [dataframe](component_dataframe.md) subdatum for the component (read by the JSON controller via `build_dataframe_subdatum()`).

!!! note "Date input order is global, not a property"
    The day/month/year *display order* (`dmy` / `ymd` / `mdy`) is **not** a per-component property: it comes from the application setting `page_globals.dedalo_date_order` and from the optional CSV header suffix on import (e.g. `rsc85_dmy`). Verify any other custom keys in the ontology before relying on them.

## Render views & modes

Modes: `edit`, `list`, `tm` (Time Machine, read-only — `tm` reuses the `list` renderer), `search` (builds SQO date filters; saves are blocked).

| View | edit | list | Notes |
| --- | :---: | :---: | --- |
| `default` | ✓ | ✓ | standard input group per `date_mode`; uses the flatpickr calendar in edit |
| `mini` | ✓ | ✓ | compact variant for tight layouts |
| `line` | ✓ | — | inline single-line edit |
| `print` | ✓ | — | edit renderer forced to read-only (`permissions = 1`), shares the `default` view markup |
| `text` | — | ✓ | plain text list output |

The rendered widget itself depends on `date_mode`: edit/search use dedicated input builders `render_input_element_date` / `_range` / `_period` / `_time` / `_time_range`. The `default` view applies the `date_mode` value as a CSS class on the `content_value` for per-mode styling (`core/component_date/css/component_date.less`).

## Import / export model

**Import.** Dates are language-less, so the canonical import payload is the JSON array of `dd_date` objects (the component's value):

```json
[{ "start": { "year": 1238, "month": 10, "day": 9 } }]
```

`conform_import_data()` also accepts **flat-string** shorthands in the CSV cell:

- A flat date: `-205/05/21`
- A flat range with `<>`: `-205/05/21 <> 185/01/30`
- Multiple records with `|`: `1852/12/22 | 1853/02/18`
- Range + multi-value combined: `1852/12/22 <> 1852/12/25 | 1853/02/18`
- Alternative separators `-` and `.`: `2012-12-22`, `2012.12.22`
- Alternative field order via the column-header suffix: `rsc85_dmy` (`22/12/2023`), `rsc85_mdy` (`12/22/2023`); default is `ymd`.

Negative (BCE) years are supported at either edge of the string (`-200/05/01` or `01/05/-200`). Malformed items are skipped and reported in `response->errors` rather than stored.

See the full date import definition [here](../importing_data.md#dates).

**Export.** `get_export_value()` emits one export atom per data record, each resolved through `data_item_to_value()` using the component's `date_mode`; records are joined with `records_separator` (default `' | '`). See [exporting data](../exporting_data.md).

## Notes

- **Save override.** `save()` validates the data is an array and runs `add_time()` over every record to (re)compute the absolute-seconds `time` before delegating to `component_common::save()`. Empty data saves an empty value (date deletion); saving is refused in `search`/`tm` modes.
- **Search.** Date search is handled by `trait.search_component_date` (and the `_tm` twin). `get_final_search_range_seconds()` widens a partial query (e.g. a bare year `1930`) into a seconds range so it matches every finer-grained date inside it.
- **Diffusion.** `get_diffusion_value()` overrides the common method to produce a MySQL-friendly `Y-m-d H:i:s` string per mode (ranges joined with `,`, periods rendered as *"N years N months N days"*). Only the first record is currently published when several exist.
- **Helpers.** `get_date_now()` returns the current moment as a `dd_date`; `get_calculation_data()` exposes the value as a unix timestamp (or `dd_date`) for info/calculation components.
- **Deprecated methods.** `get_stats_value_with_valor_arguments()` and `data_to_text()` are marked `@deprecated` — do not use them.
- **Default tools.** `tool_time_machine`, `tool_replace_component_data`, `tool_add_component_data` (the component sample also exposes `tool_propagate_component_data`). There is no `tool_lang` because the component is non-translatable.
- **Client editor.** The edit/search views lazy-load the bundled `flatpickr` calendar (`load_editor()`).

Related components: [component_input_text](component_input_text.md) (for descriptive / uncertain dates), [component_number](component_number.md) (numeric literals), [component_dataframe](component_dataframe.md) (pairing qualifiers/uncertainty with a date item), [component_portal](component_portal.md) (which can `sort_by_column` on a date column). See the typology overview in the [components index](index.md).
