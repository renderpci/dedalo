# component_inverse

## Overview

```json
{
    "could_be_translatable" : false,
    "is_literal"            : true,
    "is_related"            : false,
    "is_media"              : false,
    "modes"                 : ["edit","list","tm","search"],
    "default_tools"         : [],
    "render_views" : [
        {
            "view" : "default | line",
            "mode" : "edit"
        },
        {
            "view" : "mini | print",
            "mode" : "edit"
        },
        {
            "view" : "default | mini | text",
            "mode" : "list | tm"
        }
    ],
    "data"        : "array of inverse locators (computed, never stored)",
    "sample_data" : [
        {
            "id"                  : 1,
            "section_id"          : "1",
            "section_tipo"        : "rsc550",
            "from_component_tipo" : "tch171",
            "from_section_tipo"   : "tch1",
            "from_section_id"     : "1"
        }
    ],
    "value"        : "array of caller section_id strings",
    "sample_value" : ["1", "3"]
}
```

!!! note "Typology"
    `component_inverse` is an **info** component (the "literal-info" branch of the typology). Like every info component it extends `component_common` and behaves as a literal at read time — its resolved value is surfaced through its own section exactly like a direct component — but it owns no data of its own: the value is *calculated on the fly* from the relations that point **at** the current record. Its sibling info component is `component_info`. Contrast the related branch ([component_portal](component_portal.md), [component_select](component_select.md)) which stores and resolves outgoing [locators](../locator.md).

!!! info "About `default_tools`"
    The sample model ships with an empty `tools` array (verified in `samples/context.json`). `component_inverse` is non-translatable and read-only, so the language and propagation tooling that translatable/writable components receive does not apply. As always the toolbar is assembled from the model + ontology; the component class does not hardcode it.

## Definition

`component_inverse` displays the **backlinks** of a record: the list of other records, in other sections, that reference the current record through a relation field (a [component_portal](component_portal.md), a relation component, or a [component_dataframe](component_dataframe.md)). It answers the question *"who points at me?"* without storing that list anywhere.

**Why it exists.** Relations in Dédalo are stored on one side only — the section that owns the [component_portal](component_portal.md) (or other relation component) writes the locator into its `relations` array. The pointed-at record holds nothing. Without `component_inverse` the inverse direction would be invisible to the cataloguer, or it would have to be duplicated and kept in sync by hand. `component_inverse` computes the inverse direction dynamically (`section_record::get_inverse_references()` → `search_related::get_referenced_locators()`), so the backlink list is always correct and never drifts from the authoritative outgoing relation.

**When to use it.**

- Show, on a *Restoration Intervention* record (`rsc550`), every *Catalogue* record (`rsc555`) whose portal references this intervention — a read-only "referenced by" panel.
- Show, on an *Informant* / *Person* record, all the *Oral source* and *Cultural item* records that cite this person, even though only those records carry the relation.
- Any "appears in", "cited by", "used in", "referenced by" panel where the relation is authored on the **other** section and you only want to read it back.

**When not to use it.**

- You want to *create or edit* the relation — author it on the owning side with a [component_portal](component_portal.md), [component_select](component_select.md) or a relation component. `component_inverse` is strictly read-only; its `save()` is a logged no-op.
- You want a value the cataloguer types or that belongs to this record — use a literal-direct component such as [component_input_text](component_input_text.md).
- You need a stored, hand-orderable list — `component_inverse` has nothing to store and nothing to sort persistently; its content is recomputed on every load.

## Data model

**Data type:** `array of inverse locators`. Each entry is a locator object describing one incoming reference. It is computed, never persisted.

**Value type:** `array` of caller `section_id` strings (the `from_section_id` of each inverse locator), or an empty array.

**Storage shape.** This component has **no value to store**. `get_data()` ignores any matrix value and instead resolves the inverse references live:

```php
$section_record = $this->get_my_section_record();
$data           = $section_record->get_inverse_references();
$this->data_resolved = $data; // cached for the request only
```

`get_inverse_references()` builds a minimal filter locator for the current `{section_tipo, section_id}` and runs a `mode='related'` search (`search_related::get_referenced_locators()`) over all matrix tables; each matching relation row is decoded and decorated with `from_section_tipo`, `from_section_id` (and it already carries `from_component_tipo`). If the section has no `section_id` yet (a brand-new, unsaved record), the result is an empty array.

Each computed inverse locator looks like this:

```json
{
    "id"                  : 1,
    "section_id"          : "1",
    "section_tipo"        : "rsc550",
    "from_component_tipo" : "tch171",
    "from_section_tipo"   : "tch1",
    "from_section_id"     : "1"
}
```

- `section_tipo` / `section_id` — the **current** record (the one being read).
- `from_section_tipo` / `from_section_id` — the **caller** record that points at us (the backlink target).
- `from_component_tipo` — the relation component on the caller side that authored the reference (e.g. the portal tipo `tch171`).

!!! note "The ontology `misc` column"
    The class header notes that any configuration this component may carry lives in the matrix `misc` column, not the data column — because the data column is never read or written for `component_inverse`. There is no value array to persist.

!!! note "Datum vs. API `entries`"
    The transmitted unit is the `{context, data}` datum (the JSON-API contract). In the API payload the computed inverse locators are surfaced under `data.entries` alongside `parent_tipo`, `row_section_id` and `changed_data` (always empty). `context` carries the description (`tipo`, `model`, `mode`, `lang`, `label`, `properties`, `css`, `permissions`, `view`) and never the values. See the *dedalo-context-data-layers* skill for the full layering rules. A representative payload (verified from `samples/api_data.json`):

    ```json
    {
        "section_id"   : 1,
        "section_tipo" : "rsc550",
        "tipo"         : "rsc555",
        "mode"         : "edit",
        "lang"         : "lg-nolan",
        "entries"      : [
            {
                "id"                  : 1,
                "section_id"          : "1",
                "section_tipo"        : "rsc550",
                "from_component_tipo" : "tch171",
                "from_section_tipo"   : "tch1",
                "from_section_id"     : "1"
            }
        ],
        "row_section_id" : 1,
        "parent_tipo"    : "rsc550",
        "changed_data"   : []
    }
    ```

## Ontology instantiation

A `component_inverse` is created as an ontology node whose `model` is `component_inverse`. Its `parent` (and `section_tipo`) wire it into the section whose *backlinks* you want to display. Because it is non-translatable, the component is forced to `lg-nolan` at construction. There is no `is_translatable` to set true here.

Node definition (shape):

```json
{
    "tipo"         : "rsc555",
    "model"        : "component_inverse",
    "parent"       : "rsc550",
    "section_tipo" : "rsc550",
    "lg-eng"       : "Catalogue",
    "lg-spa"       : "Catálogo",
    "translatable" : false,
    "properties"   : { }
}
```

Realistic `properties` block (this component reads only the two grid/flatten separators; the rest of `properties` is the generic context — `css`, `view`, `request_config`):

```json
{
    "css" : {
        ".wrapper_component" : {
            "max-height"       : "5.5rem",
            "text-align"       : "center",
            "grid-column"      : "span 1",
            "background-color" : "#ee9916"
        },
        ".wrapper_component>.label"        : { "color" : "#ffffff" },
        ".wrapper_component>.content_data" : { "color" : "#ffffff" }
    },
    "fields_separator"  : ", ",
    "records_separator" : " | "
}
```

`section_tipo` / `parent` tell the section which node this component belongs to, but on `save()` nothing is written — the section is never asked to persist component data for an inverse field. The inverse list is recomputed from the live relations every time the section is loaded.

!!! warning "No defaults, no save"
    `component_inverse` overrides `save()` to a logged no-op (it returns `true` after writing a WARNING). `properties->dato_default` is meaningless for it (there is nothing to seed), and Time Machine never records inverse data — the authoritative data is the outgoing relation on the other section, which has its own Time Machine history.

## Properties & options

`component_inverse` reads only the two presentation separators from the ontology `properties` JSON; both are optional and used solely when the inverse list is flattened to a single string for grid display or flat-table export.

### fields_separator

- **Values:** string (default `", "`).
- **Effect:** the separator used **inside** a single caller-pair column when several callers of the same `(from_section_tipo, from_component_tipo)` pair are joined into one grid/export cell. Read in `get_grid_value()` and consumed by `get_export_value()` as the per-pair leaf separator.

### records_separator

- **Values:** string (default `" | "`).
- **Effect:** the separator stamped on the grid row (`dd_grid_cell_object::set_records_separator()`) used to join the component's columns when the inverse component is flattened to a single grid string.

!!! note "Standard context properties"
    Like every component, `component_inverse` honours the generic ontology context blocks carried into the datum `context`: `css` (style stamped on `.wrapper_component`), `view` (the render view) and `request_config` (RQO). These are not component-specific options. **No other property names are consumed by this component's class** — `mandatory`, `unique`, `validation`, `dato_default`, `has_dataframe`, etc. have no effect here. Any other key seen in production should be verified in the ontology.

## Render views & modes

Views are selected from `context.view` (default `default`) and dispatched by the per-mode render files (`render_edit_component_inverse.js`, `render_list_component_inverse.js`). Verified from the source:

| View | edit / search | list / tm | Notes |
| --- | :---: | :---: | --- |
| `default` | yes | yes | Edit: full wrapper (`label`, `buttons` only when `permissions > 1`, `content_data`) with one `content_value` per inverse locator, each showing the caller `from_section_id` in a `span.inverse_show_section_id`. List: `build_wrapper_list` with the first entry's `from_section_id` as the value string. |
| `line` | yes | — | Edit only; same as default but the label node is suppressed (compact inline, `.view_line { display:inline-block }`). |
| `mini` | yes | yes | Minimal `build_wrapper_mini`; injects the first caller `from_section_id` as text. Used by service autocomplete / datalist. |
| `text` | — | yes | Plain `<span class="wrapper_component component_inverse <mode> view_text">` containing the first caller `from_section_id`. |
| `print` | yes | — | Reuses the `default` edit view but forces read-only rendering (`self.permissions = 1`). |

Modes (`render_edit` serves `edit` and `search`; `render_list` serves `list` and `tm`):

- **edit** — read-only display of the live inverse list. Buttons appear only for `permissions > 1`, but there is no writable input; the component renders one read-only `content_value` per backlink. Note `search` is wired to the **same** render as `edit` in the JS model (`component_inverse.prototype.search = render_edit_component_inverse.prototype.edit`), so there is no dedicated search-filter UI — `component_inverse` is not a meaningful search target.
- **list / tm** — read-only listing; `tm` (Time Machine) reuses the list render verbatim (`prototype.tm = render_list_component_inverse.prototype.list`). The JSON controller calls `get_list_value()` for both.

DOM (edit / default): `wrapper_component component_inverse <tipo> <mode>` → `label`, `buttons`, `content_data` → one or more `content_value` → `span.inverse_show_section_id`.

## Import / export model

**Import.** `component_inverse` has nothing to import. Its `save()` is a no-op, so any import value routed to an inverse column is silently ignored — the inverse list is derived from the *outgoing* relations on the other section. To populate backlinks, import the relation on the **owning** side (the [component_portal](component_portal.md) / relation component), not here. See [importing data](../importing_data.md).

**Export.** `get_export_value()` follows the atoms contract (`component_common::get_export_value`): one atom per inverse locator. The `(from_section_tipo, from_component_tipo)` pair travels as a **sub-segment**, so each distinct calling pair becomes its own export column; multiple callers of the same pair join inside the cell using `fields_separator`. The exported atom value is the caller `from_section_id` (cast to int):

```json
[
    { "from_section_tipo": "tch1", "from_component_tipo": "tch171", "from_section_id": 1 },
    { "from_section_tipo": "tch1", "from_component_tipo": "tch171", "from_section_id": 3 }
]
```

For grid display `get_grid_value()` collapses the component to a **single row** (the current instance) with one column per `(section_tipo, from_section_tipo, tipo, from_component_tipo)` combination — the inverse data never produces grid rows, only columns. See [exporting data](../exporting_data.md).

## Notes

- **No storage, computed live.** The defining trait: `get_data()` ignores the matrix data column and computes the backlinks via `get_my_section_record()->get_inverse_references()` → `search_related::get_referenced_locators()` (a `mode='related'` search with `set_breakdown(true)` over all matrix tables). The result is cached in `data_resolved` for the duration of the request only.
- **Read-only by design.** `save()` is overridden to log a WARNING and return `true` without persisting. Empty `section_id` (unsaved record) yields an empty list. Time Machine does not track inverse data.
- **Observers / observables.** None ship for this component. As a purely derived read-only view it does not publish or observe data changes; its content simply re-resolves whenever the host record is reloaded.
- **Default tools.** The sample model exposes no tools (`tools: []`). Tools, when added, are read-only context like any component.
- **Permissions.** Resolved via `get_component_permissions()` (0 none / 1 read / 2 read+write / 3 admin). The JSON controller emits data only for `permissions > 0`. Even at level 2–3 the component stays read-only (no input element); buttons render only above level 1.
- **Related components:** [component_portal](component_portal.md), [component_select](component_select.md), [component_check_box](component_check_box.md), [component_dataframe](component_dataframe.md), [component_input_text](component_input_text.md). The outgoing/authoritative side is always one of the relation components; `component_inverse` only reflects them back.
