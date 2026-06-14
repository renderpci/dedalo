# component_info

## Overview

```json
{
    "could_be_translatable" : false,
    "is_literal"            : true,
    "is_related"            : false,
    "is_media"              : false,
    "modes"                 : ["edit","list","tm","search"],
    "default_tools"         : [],
    "render_views" :[
        {
            "view" : "default | line",
            "mode" : "edit"
        },
        {
            "view" : "default",
            "mode" : "list | tm"
        },
        {
            "view" : "mini",
            "mode" : "edit | list"
        }
    ],
    "data"        : "array of items (one per widget IPO output)",
    "sample_data" : [
        {
            "id": 2,
            "value": {
                "id"      : "indexation",
                "key"     : 0,
                "value"   : 90,
                "widget"  : "descriptors",
                "locator" : {
                    "type"                : "dd151",
                    "section_id"          : "1",
                    "section_tipo"        : "rsc167",
                    "from_component_tipo" : "oh25"
                }
            }
        }
    ],
    "value"        : "array of computed widget outputs",
    "sample_value" : ["90", "College | Other learning | Housekeeping"]
}
```

!!! note "Typology"
    `component_info` is an **info** component: a *literal* component (`is_literal: true`) whose value is **computed dynamically from widgets** rather than typed by a cataloguer. It extends `component_common` directly (same base as `component_input_text`). As the [components index](index.md) puts it: *"Info components need other components to calculate their own data, but the result is saved as direct data, so the component reads and saves like any other literal component."* In practice this instance computes its value on every load (`use_db_data = false`) and rarely persists it.

!!! info "About `default_tools`"
    `component_info` overrides `get_tools()` to return an **empty array** — it never adds `tool_lang`, `tool_time_machine` or any default toolbar tool. The tools you may see in the rendered output (e.g. `tool_indexation`, `tool_transcription`, `tool_lang`) are not the component's tools: they are emitted **per widget output item** inside `data` as `tool_context`, attached by the individual widget (e.g. the `media_icons` widget). They are read-only context.

## Definition

`component_info` is an **information / aggregation** component. Unlike a data-owning field such as [component_input_text](component_input_text.md), it does not hold a value the user types. Instead it acts as a **container for one or more widgets** declared in its ontology `properties`; each widget computes its own data dynamically from other components of the current record (or related records) and the component_info value is the concatenation of all widget outputs.

**Why it exists.** Many catalogue screens need a synthesised, read-only panel that summarises or links to information living elsewhere in the record: a strip of media-icon shortcuts with direct links to the transcription / indexation / translation tools, a digitization-progress percentage, the full list of thesaurus descriptors attached to an oral-history record, an aggregated state indicator, a computed sum of measurements. `component_info` is the building block for all of these. It reads from other components, runs the widget's Input-Process-Output (IPO) definition, and presents the result — without the cataloguer ever editing it directly.

**When to use it.**

- A dashboard-style panel that aggregates / summarises data already stored in other components of the section (e.g. an oral-history record's *Information* block showing media icons + descriptor count).
- Computed read-outs that should appear in a record but are derived, not entered: archive state, digitization percentage, a roll-up of descriptors across linked tapes.
- A place to surface contextual tool shortcuts (indexation, transcription, translation) computed against the current media.
- A diffusion/export field whose published value is the formatted result of a widget calculation (see `get_diffusion_value`).

**When not to use it.**

- Free text the cataloguer types -> use [component_input_text](component_input_text.md) or [component_text_area](component_text_area.md).
- A pointer to another record -> use a related component such as [component_portal](component_portal.md) or [component_select](component_select.md).
- A simple cross-section reverse listing of "who points at me" without per-widget computation -> consider `component_inverse` (the other info-typology component).
- A static numeric field -> use [component_number](component_number.md).

## Data model

**Data:** `array of items`. Each item is `{id, value}` where `value` is the object produced by a widget IPO **output** entry. There is **no `lang` key** — the component is non-translatable (its data lives under `lg-nolan`).

**Value:** `array` of computed widget outputs, or `null`. The flat string value (`get_value()`, used by diffusion) is the export atoms flattened with the records separator.

**Storage shape.** A component never touches the database. `component_info` is special: with `use_db_data = false` (the default) the value is **regenerated on every load** by iterating the configured widgets and merging their `get_data()` results, so nothing is read from the matrix data column for the value. The class doc notes that any persisted *widget configuration* would live in the matrix `misc` column; the displayed value itself is computed, not stored.

Each data item carries the widget's output object. A scalar widget output:

```json
[
    {
        "id": 2,
        "value": {
            "id"      : "indexation",
            "key"     : 0,
            "value"   : 90,
            "widget"  : "descriptors",
            "locator" : {
                "type"                : "dd151",
                "section_id"          : "1",
                "section_tipo"        : "rsc167",
                "from_component_tipo" : "oh25"
            }
        }
    }
]
```

A widget output may instead be a **structured grid value** (a `dd_grid_cell_object` tree of columns/rows), used by widgets like `descriptors` that produce a multi-column table, or a **bundle of named sub-outputs** each carrying its own `tool_context` (as the `media_icons` widget does, exposing `id`, `tc`, `transcription`, `indexation`, `translation`). The shape of `value` is therefore widget-defined; `component_info` only aggregates.

!!! note "Datum vs. API `entries`"
    The transmitted unit is a `{context, data}` datum (the JSON-API contract). In the API payload the value items are surfaced under `data.entries`, and the client `get_widgets()` reads `self.data.entries` (plus `self.data.datalist`) and partitions them per widget by the `widget` key. `context` carries the description (`tipo`, `model`, `mode`, `properties.widgets`, `permissions`, `view`, `fields_separator`) and never the values. See the *dedalo-context-data-layers* skill for the full layering rules.

## Ontology instantiation

A `component_info` is created as an ontology node whose `model` is `component_info`. Its `parent` is the section (or grouper) it belongs to, and its `section_tipo` wires it into that section. It is declared **non-translatable** (`lang` resolves to `lg-nolan`), and its behaviour is driven almost entirely by the `widgets` array in `properties`.

Node definition (shape, from the verified sample `oh87` on section `oh1`):

```json
{
    "tipo"         : "oh87",
    "model"        : "component_info",
    "parent"       : "oh1",
    "section_tipo" : "oh1",
    "parent_grouper": "oh31",
    "lg-eng"       : "Information",
    "translatable" : false,
    "properties"   : { }
}
```

Realistic `properties` block declaring two widgets (a media-icon strip and a descriptors roll-up), verified against the sample context:

```json
{
    "widgets": [
        {
            "widget_name": "media_icons",
            "path"       : "/oh/media_icons",
            "widget_info": "Create a simple list of media element icons when default quality file exists. Add direct links to process",
            "ipo": [
                {
                    "input": {
                        "type"  : "component_data",
                        "source": [
                            { "section_id": "current", "section_tipo": "current", "component_tipo": "oh25" }
                        ],
                        "paths" : [
                            [ { "var_name": "av", "section_tipo": "rsc167", "component_tipo": "rsc35" } ]
                        ]
                    },
                    "process": null,
                    "output": [
                        { "id": "id",            "label": "id", "value": "link" },
                        { "id": "tc",            "label": "tc", "value": "text" },
                        { "id": "transcription", "label": "tool_transcription", "value": "link", "process_section_tipo": "oh81" },
                        { "id": "indexation",    "label": "tool_indexation",    "value": "link", "process_section_tipo": "oh83" },
                        { "id": "translation",   "label": "tool_lang",          "value": "link", "process_section_tipo": "oh85" }
                    ]
                }
            ]
        },
        {
            "widget_name": "descriptors",
            "path"       : "/oh/descriptors",
            "widget_info": "state of the av process and create a simple list of all descriptors associated to current record",
            "ipo": [
                {
                    "input": {
                        "type"  : "component_data",
                        "source": [
                            { "section_id": "current", "section_tipo": "current", "component_tipo": "oh25" }
                        ],
                        "paths" : [
                            [ { "var_name": "indexation", "section_tipo": "rsc167", "component_tipo": "rsc860" } ]
                        ]
                    },
                    "process": null,
                    "output": [
                        { "id": "indexation", "label": "digitization", "value": "int" },
                        { "id": "terms",      "label": "descriptors",  "value": "text" }
                    ]
                }
            ]
        }
    ],
    "show_in_modes": ["list","edit"],
    "mode": "list"
}
```

On load, `get_data()` iterates `properties->widgets`, instances each one through `widget_common::get_instance()` (passing the current `section_tipo` / `section_id` / `mode`), **skips async widgets** (those whose `is_async()` returns true load their data client-side via API), calls the widget's `get_data()`, and merges every widget's output into one flat array. The component is not the writer; it inherits `component_common::save()`, but in normal use `use_db_data === false` means the value is computed, not persisted.

## Properties & options

All properties live in the ontology node `properties` JSON. Verified names consumed by this component:

### widgets *(required)*

- **Values:** an array of widget descriptor objects. **This is the core property** — an empty/missing `widgets` array makes `get_data()`, `get_data_parsed()`, `get_data_list()`, `get_grid_value()` and `get_export_value()` log an error and return null/empty.
- Each descriptor object carries:
    - **`widget_name`** — the widget class name, e.g. `"media_icons"`, `"descriptors"`. The client imports `core/widgets{path}/js/{widget_name}.js` and the server includes `core/widgets{path}/class.{widget_name}.php`.
    - **`path`** — the widget folder path under `core/widgets`, e.g. `"/oh/media_icons"`. Used by both server `include` and client dynamic `import` (also enables packer file discovery).
    - **`ipo`** — array of **Input-Process-Output** objects. Each `ipo` entry has `input` (`type`, `source`, `paths` describing which component(s) of which record(s) to read), `process` (optional transform), and `output` (array of `{id, label, value}` maps). Each `output` object becomes one logical column in grid/export.
    - **`widget_info`** — free-text developer note describing what the widget does (informational only).

### show_in_modes

- **Values:** array of mode strings, e.g. `["list","edit"]`.
- **Effect:** declares the modes in which the component is meant to be shown. This is a generic ontology/render-level hint carried in the context; it is *not* read inside `component_info`'s own PHP. Verify in the section render layer when relying on it.

### mode

- **Values:** mode string, e.g. `"list"`.
- **Effect:** an ontology-level default mode hint carried into context. The effective mode at runtime comes from how the instance is requested (`edit` / `list` / `tm` / `search`).

### observe / observers

- **Values:** the standard ontology observer/observable blocks (see the [components index](index.md#observers-and-observables)). The verified sample declares an `observe` block keyed on `component_tipo` with a server `filter`, so the info panel can be re-resolved when an observed component changes.
- **Effect:** generic observer wiring, not specific to this component.

!!! note "Standard context properties"
    Like every component, `component_info` honours the generic context blocks `css`, `request_config` (RQO) and `view`. It additionally reads `properties->records_separator` (default `" | "`) and `properties->fields_separator` (default `", "`) when flattening widget outputs in `get_grid_value()`. Any other custom key seen in production should be verified in the ontology.

!!! warning "No bespoke storage"
    There is no `dato_default`, `mandatory`, `unique` or `validation` for this component — those are input-field concerns. `component_info` neither validates nor seeds input; it computes.

## Render views & modes

Views are selected from `context.view` (default `default`) and dispatched by the per-mode render files (`render_edit_component_info.js`, `render_list_component_info.js`). The client `component_info` prototype maps `tm` -> the list renderer and `search` -> the edit renderer. Verified from the source:

| View | edit | list / tm | Notes |
| --- | :---: | :---: | --- |
| `default` | yes | yes | Full wrapper: `label`, `buttons` (edit + write perms only), `content_data` with one `content_value` per widget. Each `content_value` shows a "Loading widget.." placeholder, then builds and fades in the widget node asynchronously. |
| `line` | yes | — | Same as default but with `label: null` (compact inline). |
| `print` | yes | — | Falls through to the `default` view but forces `permissions = 1` (read-only) and tags the wrapper for print. |
| `mini` | yes | yes | Minimal `wrapper_mini`; joins `data.entries` with `context.fields_separator` and inserts as a plain string. Used by service autocomplete / datalist contexts. |

Modes (inherited from `component_common`):

- **edit** — renders the widget panel; buttons appear only when `permissions > 1`. Widgets are built per `content_value`. There is no value the user edits directly; `change_mode()` is a no-op catch. `update_data_value()` is overridden to re-sync each widget instance's `value` and publish an `update_widget_value_{i}_{widget_id}` event after a data update.
- **list / tm** — read-only listing; `tm` reuses the list renderer. In the JSON controller, list/tm reads `get_list_value()` (which equals `get_data()`) unless `use_db_data === true`, in which case it reads `get_db_data()` (DB data, falling back to computed data when empty).
- **search** — the client maps `search` to the edit renderer. As an info component with no stored literal, it is not a typical search-filter field.

DOM (edit / default): `wrapper_component component_info <tipo> <mode>` -> `label`, `buttons_container`, `content_data` -> one `content_value widget_item_<widget_name>` per widget -> the widget's own `wrapper_widget` node. `content_data` uses `display: contents` so widgets participate directly in the parent grid.

## Import / export model

**Import.** `component_info` defines **no `conform_import_data()`** and owns no user-entered data, so there is nothing meaningful to import — the value is recomputed from the widgets on every load. It is not part of the typed-field import flow. See [importing data](../importing_data.md) for the components that do support import.

**Export.** `get_export_value()` implements the atoms-based export contract: **one atom per widget IPO `output` entry**. The output `id` travels as the segment `sub_id`, so each widget output becomes its **own column** (label = the output `id` verbatim), replacing the legacy `_widget_`-suffixed column ids. Object/array values are JSON-encoded defensively. `get_grid_value()` produces the equivalent client grid: one column per output, grouped under the component, joined with `records_separator` / `fields_separator`. See [exporting data](../exporting_data.md) and the *dedalo-export* skill.

**Diffusion.** `get_diffusion_value(?lang, ?option_obj)` returns the flattened `get_valor()` value with `<mark>` tags stripped. With an `option_obj->key_values` array it splits the value on `separator` (default `", "`) and selects only the indexed slices — used by SQL diffusion to publish a chosen part of a computed value (e.g. `mdcat1181`).

## Notes

- **Computed, not stored.** The defining trait: `use_db_data = false`, `get_sortable()` returns `false`, and `get_tools()` returns `[]`. The component is read-only from the cataloguer's perspective; its value is the merged output of its widgets.
- **Widgets are the unit of work.** Server widgets extend `widget_common` and are loaded via `widget_common::get_instance()` from `core/widgets/<path>/class.<widget_name>.php`; client widgets are dynamically imported from `core/widgets/<path>/js/<widget_name>.js`. The IPO (Input-Process-Output) ontology definition drives all data resolution. Async widgets (`is_async()` true) are skipped server-side and self-load on the client.
- **Per-item tools.** Toolbar shortcuts (`tool_indexation`, `tool_transcription`, `tool_lang`, etc.) are emitted by widgets as `tool_context` inside individual `data.entries` items — not as the component's `context.tools`.
- **Observers / observables.** Configured in the ontology `properties` (`observe` / `observers`) like any other component (see the index page *Observers and observables* section); the verified sample observes another component and re-resolves via a server filter.
- **Permissions.** Resolved via `get_component_permissions()` (0 none / 1 read / 2 read+write / 3 admin). Edit-mode buttons require level > 1; the `print` view forces read-only (level 1).
- **Related components:** the other info-typology component is `component_inverse`; for typed/literal fields see [component_input_text](component_input_text.md), [component_text_area](component_text_area.md), [component_number](component_number.md); for relations see [component_portal](component_portal.md), [component_select](component_select.md). Widget grid/export output rides the shared `dd_grid_cell_object` / export-atom contract used across components.
