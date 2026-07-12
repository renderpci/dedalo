# component_filter_records

## Overview

```json
{
    "could_be_translatable" : false,
    "is_literal": true,
    "is_related": false,
    "is_media": false,
    "modes": ["edit","list","tm","search"],
    "default_tools" : [
        "tool_propagate_component_data",
        "tool_time_machine"
    ],
    "render_views" :[
        {
            "view"    : "default | line | print",
            "mode"    : "edit"
        },
        {
            "view"    : "default | mini | text",
            "mode"    : "list | tm"
        },
        {
            "view"    : "default",
            "mode"    : "search"
        }
    ],
    "data": "array of entries",
    "sample_data": [
        { "id": 1, "tipo": "mdcat3112", "value": [1, 8, 9] },
        { "id": 2, "tipo": "rsc202", "value": [8, 150, 201] },
        { "id": 3, "tipo": "oh1", "value": [1, 3, 4] }
    ],
    "value": "array of entries",
    "sample_value": [
        { "id": 1, "tipo": "mdcat3112", "value": [1, 8, 9] }
    ]
}
```

!!! note "Classifier flags"
    `could_be_translatable`, `is_literal`, `is_related` and `is_media` are client-model
    classifiers derived from the component typology, not stored datum fields. As a
    *literal-direct* component, `component_filter_records`
    is literal (`is_literal: true`), it is not a relation locator (`is_related: false`),
    not media (`is_media: false`), and not translatable
    (`could_be_translatable: false`): its single static instance is loaded under
    `DEDALO_DATA_NOLAN`.

## Definition

`component_filter_records` manages **record-level access control**: it stores, per target
section, the explicit list of record ids (`section_id`s) a given user is allowed to access.
It is a configuration component used **exclusively inside the Users section** (`dd128`),
where each user record carries one instance of it (the standard tipo is `dd478`,
`DEDALO_USER_COMPONENT_FILTER_RECORDS_TIPO`).

Dédalo already restricts access through **areas/projects** (see `component_filter` and
`component_filter_master`). Those grant or deny a user a *whole section/area*.
`component_filter_records` exists to provide a **finer grain**:
within a section the user is otherwise authorized for, restrict visibility down to a specific
set of record ids — regardless of project assignment.

The feature is gated by the global flag `DEDALO_FILTER_USER_RECORDS_BY_ID` (default `false`,
set in `../private/.env`). When enabled, the search engine is meant to read the logged user's
stored per-section id list and add a `section_id IN (...)` restriction to the section's search
query.

!!! danger "Gap: the enforcement gate is not implemented — edit UI works, search does not filter"
    The TS server implements the **edit-time datalist** (`getFilterRecordsDatalist()`,
    `src/core/resolve/filter_records_datalist.ts` — the authorized-sections list a
    profile can restrict), so the component's edit/search views render and save
    correctly. But `DEDALO_FILTER_USER_RECORDS_BY_ID` does not exist anywhere in the
    TS config catalog (`src/config/`), and no module under `src/core/search/` reads
    a stored filter or adds a `section_id IN (...)` restriction to a search query. A
    profile's stored per-section id list is therefore **not enforced** at search
    time on the TS server today, even though it can be configured through the UI.

**When to use it**

- A cataloguer should only see a handful of records of a section (e.g. only the 12
  archaeological objects on loan to their institution), even though they have read/write
  permission on that whole section.
- A reviewer is granted access to a curated subset of `oh1` (Cultural objects) records for
  a temporary campaign, without touching their project membership.

**When *not* to use it**

- To grant or deny access to an entire section/area — use the project filter components
  (`component_filter` / `component_filter_master`) instead.
- As a normal data field in cataloguing sections. This is a permissions/configuration
  component; it only makes sense inside the Users section and only takes effect with
  `DEDALO_FILTER_USER_RECORDS_BY_ID` turned on.

## Data model

**Data:** `array` of entry objects.

**Value:** `array` of entry objects (same shape as `data`), or `null`.

**Storage:** the component stores its data in the matrix **`misc`** column (a *direct
object*, not a relation locator). It is **not** translatable, so there is a single instance
under `DEDALO_DATA_NOLAN` and no per-language rows.

Each entry pairs a target **section `tipo`** with the array of allowed **`section_id`s** for
that section, plus the standard counter-assigned `id`:

```json
[
    { "id": 1, "tipo": "mdcat3112", "value": [1, 8, 9] },
    { "id": 2, "tipo": "rsc202",    "value": [8, 150, 201] },
    { "id": 3, "tipo": "oh1",       "value": [1, 3, 4] }
]
```

- `id` — counter-assigned entry id, used to target `update`/`remove` operations on the item
  array.
- `tipo` — the target section ontology tipo the restriction applies to.
- `value` — array of integer `section_id`s the user may access in that section. Client-side
  the input is validated to **positive, de-duplicated integers**; search mode keeps the raw
  comma split until saved.

In the JSON-API datum the array is delivered under the `data` item's **`entries`** property,
and in `edit` mode the resolved list of authorized sections is attached as `datalist` (see
below).

!!! warning "Consumption shape vs storage shape — no TS search consumer exists yet"
    No TS search consumer reads this stored filter today (see the gap noted above). The stored
    shape is the raw `entries` array (`[{id, tipo, value}, ...]`); a search consumer needs the
    data as a **map keyed by `section_tipo`** (`section_tipo` → array of ids) to apply it as a
    `section_id IN (...)` restriction. Building that consumer means transforming the stored
    `entries` array into that map — the two shapes are not interchangeable.

## Ontology instantiation

Define the node like any other component, declaring its `model`, `tipo`, `parent` (the
section it lives in) and the language descriptors. Because it is non-translatable, it is
instantiated under `lg-nolan`.

Node definition (the canonical placement is the Users section `dd128`, tipo `dd478`):

```json
{
    "tipo"          : "dd478",
    "model"         : "component_filter_records",
    "parent"        : "dd128",
    "section_tipo"  : "dd128",
    "lg-eng"        : "Filter records by id",
    "translatable"  : false
}
```

Minimal/empty `properties` block (this component takes no required ontology properties):

```json
{
    "properties": {}
}
```

`section_tipo`/`parent` wire the component into its owning section. The TS server has no
per-component factory to call: the descriptor at
`src/core/components/component_filter_records/descriptor.ts` (`column: 'misc'`, no
`classSupportsTranslation` flag) resolves through the same generic
`src/core/resolve/component_data.ts` as any other literal component, and the
authorized-sections datalist is built by `getFilterRecordsDatalist(userId, lang)`
(`src/core/resolve/filter_records_datalist.ts`).

## Properties & options

This component defines **no bespoke ontology properties**. Its `properties` block is normally
empty (`{}`), as shown in the shipped sample context. Behaviour is driven by:

- the **`datalist`** — *not* an ontology property, computed server-side by
  `getFilterRecordsDatalist()` (`src/core/resolve/filter_records_datalist.ts`, built from
  `getAuthorizedAreasForUser()`, `src/core/security/permissions.ts`). It lists every section
  the logged user is authorized for, keeping only areas whose `model === 'section'` and whose
  permission `value >= 2` (write or higher), resolving each section label from the ontology and
  sorting alphabetically by label. Each datalist item is `{ tipo, permissions, label }`.
- the global config constant **`DEDALO_FILTER_USER_RECORDS_BY_ID`** (`true`/`false`,
  default `false`) — meant to enable/disable the whole feature at the search layer. **Not
  present in the TS config catalog** (`src/config/`) — see the gap noted under
  [Definition](#definition).

The standard generic component properties (e.g. `mandatory`, `css`, `request_config`) may be
attached through the ontology node like any component; none are specific to or required by
`component_filter_records`. If you need behaviour beyond the above, *verify in ontology*.

## Render views & modes

The client model wires modes to renders in `js/component_filter_records.js`
(`edit`, `list`, `tm` → `list` render, `search`). The views actually present in the source:

| Mode | View | Source | Behaviour |
| --- | --- | --- | --- |
| `edit` | `default` | `view_default_edit_filter_records.js` | Grid (`tipo` / section label / value input). One editable comma-separated id input per authorized section from the `datalist`. Header row with `tipo`, `Section`, `Value`. |
| `edit` | `line` | `view_default_edit_filter_records.js` | Same render as `default`, label removed (compact inline). |
| `edit` | `print` | `render_edit_component_filter_records.js` | Same render as `default` but forced read-only (`permissions = 1`): rows render through `get_content_value_read`, only entries present in the value are shown. |
| `list` / `tm` | `default` | `view_default_list_filter_records.js` | Read-only string: each entry serialized as JSON, joined by `context.fields_separator`. |
| `list` / `tm` | `mini` | `view_mini_list_filter_records.js` | Minimal wrapper, same JSON-joined string. |
| `list` / `tm` | `text` | `view_text_list_filter_records.js` | Plain `span`, entries serialized as JSON, newline-separated. |
| `search` | `default` | `render_search_component_filter_records.js` | One text input per authorized section; on change publishes `change_search_element` (raw comma split, no integer validation). |

`tm` (Time Machine) reuses the `list` render. The shared change logic lives in
`change_handler()` / `build_changed_data_item()` in the client model: in `edit` it saves on
every change (`change_value`), in `search` it updates the instance and publishes the search
event.

!!! note "Permission-aware edit render"
    In `edit`, when `permissions === 1` the view renders only the stored entries read-only;
    with write permission (`> 1`) it renders one editable input per authorized section and
    exposes the toolbar buttons (tools + fullscreen).

## Import / export model

`component_filter_records` defines no import, export or diffusion handling of its own — it
goes through the shared engines like any other literal component. Its data is a plain JSON
array of entries, so import/export use that array directly:

```json
[
    { "id": 1, "tipo": "mdcat3112", "value": [1, 8, 9] },
    { "id": 2, "tipo": "rsc202",    "value": [8, 150, 201] }
]
```

Because this is a configuration component living in the Users section, it is rarely part of
ordinary catalogue import/export flows. See the general
[importing data](../importing_data.md) and [exporting data](../exporting_data.md) docs for the
shared component contract (the `dedalo_data` wrapper, atoms, NDJSON flat-table protocol).

## Notes

- **Typology:** literal-direct component (data column `misc`). The TS server has no class
  hierarchy — `src/core/components/component_filter_records/descriptor.ts` declares
  `column: 'misc'`. It is *not* a relation component despite pointing at section records — the
  targets are stored as bare integer ids inside `value`, not as locators.
- **Default tools** (from the shipped `context.json`): `tool_propagate_component_data` and
  `tool_time_machine`. Saves are recorded in Time Machine like any component
  (`tm` mode is read-only).
- **Server entry point — gap.** No TS module reads a user's stored filter-records list into the
  search path (see the gap under [Definition](#definition)) — there is no reader wired into the
  TS search path at all yet, so the stored list has no effect unless
  `DEDALO_FILTER_USER_RECORDS_BY_ID` gains a TS implementation.
- **Datalist source:** `getFilterRecordsDatalist()` (`src/core/resolve/filter_records_datalist.ts`)
  depends on the *logged user's* authorized areas, so the set of selectable sections in
  `edit`/`search` reflects current permissions, filtered to sections with write-or-higher access
  (`value >= 2`).
- **Observers/observables:** none configured for this component.
- **Read path — datalist attachment split by pipeline.** The plain section read
  (`src/core/section/read.ts`, `emitDdoData`) only **stubs an empty `datalist: []`** on a
  `component_filter_records` item (it has no principal in scope, and this stub exists solely
  to stop the client's `render_search_component_filter_records` from crashing on
  `datalist.length`). The **real**, user-scoped datalist (`getFilterRecordsDatalist()`) is
  attached only by the component-level `get_data` dispatch path
  (`src/core/api/dispatch.ts`, the `model === 'component_filter_records'` branch), which has
  the calling principal available. A caller relying on the full-section read alone will see an
  empty datalist, not the authorized-sections list.
- **Related components:**
  `component_filter` and `component_filter_master` (project/area-level access),
  `component_security_access` (also stored in `misc`), and
  [component_portal](component_portal.md) (relation-based linking, by contrast).