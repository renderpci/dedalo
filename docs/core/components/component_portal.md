# component_portal

## Overview

```json
{
    "could_be_translatable" : false,
    "is_literal": false,
    "is_related": true,
    "is_media": false,
    "modes": ["edit","list","tm","search"],
    "default_tools" : [
        "tool_time_machine", 
        "tool_replace_component_data", 
        "tool_add_component_data"
    ],
    "render_views" :[
        {
            "view"    : "default | line ",
            "mode"    : "edit | list"
        },
        {
            "view"    : "content | indexation | mini | mosaic | tree",
            "mode"    : "edit"
        },       
        {
            "view"    : "text",
            "mode"    : "list"
        }
    ],
    "data": "array of locators",
    "sample_data": [{
        "type"                : "dd151",
        "section_tipo"        : "rsc197",
        "section_id"          : "1",
        "from_component_tipo" : "oh24"
    }],
    "value": "array of string",
    "sample_value": ["Marie Curie"]
}
```

## Definition

The primary role of a `component_portal` is to act as a bridge between sections, enabling the creation of relational links.
This is particularly useful in scenarios where data entities are interconnected, such as associating a person with multiple projects or linking artifacts to their respective excavation sites.

## Data model

**Data:** `array of locators`.

**Value:** `array` of `strings`, or `null`

**Storage:** In database component portal save his data in the global `relations` property as independent objects. The component obtain its data filtering objects in the `relations` array with its `tipo` in the `from_component_tipo` property of the locator.

```json
{
    "relations" : [{
        "type"                : "dd151",
        "section_tipo"        : "rsc197",
        "section_id"          : "1",
        "from_component_tipo" : "oh24"
    },
    {
        "type"                : "dd151",
        "section_tipo"        : "rsc167",
        "section_id"          : "8",
        "from_component_tipo" : "oh25"
    }]
}
```

Data storage format does not support internationalization for numbers, the float point is always set with . and does not use thousand separator. Component number can render an internationalization formats it in render->view to accommodate to specific formats as Spanish format 1.234,56 from data 1234.56.

When the component is instantiated, the component get his data from his section and only get the value without lang.

## Import model

By default import model use the JSON format of his data, but is possible to set the id when the portal call only to 1 specific section.

Default import:

```json
[{"type":"dd151","section_tipo":"rsc197","section_id":"1","from_component_tipo":"oh24"}]
```

A number sequence of section_id when the component_portal has only one target section:

```json
1,5,8
```

With multiple target sections the import allows the json format and the number sequence when the target section is defined in the first row of the CSV as `oh25_rsc197` when `oh24` is the `component_portal` and `rsc197` is the target `section`.



See the full number import definition [here](../importing_data.md#related-data).

## Properties

### sort_by_column

Allows users to persistently re-order **all** portal entries (the full stored locator array, across pagination) by the value of a column component in the target section, ascending or descending. For example, order the entries by time using a `component_date` column of the linked records.

To allow, include the `sort_by_column` into ontology properties.

```json
{
	"sort_by_column": true
}
```

Value shapes:

- `true` : every sortable column of the portal shows sort buttons in the list header (default view, edit mode).
- `array of column tipos` : restricts the sortable columns to the given component tipos, e.g. `["oh28"]`.

When enabled, clicking a column sort button resolves the new order in the server (a search over the target section restricted to the linked section_id list, ordered by the column component value) and **saves the re-ordered locator array** — it is a real data change, recorded in Time Machine like any other component save. Entries whose target record cannot be resolved (deleted records) fall to the end preserving their relative order; entries with empty column values sort after valued ones (`NULLS LAST`).

Manual drag and drop re-ordering remains always available regardless of this property; the column sort is a one-shot action, not a stored view preference. Columns whose component model is not sortable (`get_sortable()` false: check_box, select, radio_button, etc.) never show sort buttons. Portals with `source.mode` `external` are excluded (their data is not locally owned).

## Render Views

- Default: Standard presentation for general use.
- Line: Compact, single-line display.
- Mini: Minimalist view for limited space scenarios.
- Text: Focuses on textual content.
- Mosaic: Grid-based layout for visual content.
- Indexation: Specialized view for display thesaurus indexation data.

These views can be applied across different modes (edit, list, search) to tailor the user interface to specific needs.
