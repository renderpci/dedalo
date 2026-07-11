# component_portal

## Overview

```json
{
    "could_be_translatable" : false,
    "is_literal"            : false,
    "is_related"            : true,
    "is_media"              : false,
    "modes"                 : ["edit","list","tm","search"],
    "default_tools" : [
        "tool_propagate_component_data",
        "tool_time_machine"
    ],
    "render_views" : [
        {
            "view" : "default | line | text",
            "mode" : "edit | list"
        },
        {
            "view" : "content | indexation | mosaic | tree",
            "mode" : "edit"
        },
        {
            "view" : "mini",
            "mode" : "list"
        }
    ],
    "data"        : "array of locators",
    "sample_data" : [{
        "id"                  : 1,
        "type"                : "dd151",
        "section_tipo"        : "rsc197",
        "section_id"          : "1",
        "from_component_tipo" : "oh24"
    }],
    "value"        : "array of strings",
    "sample_value" : ["Marie Curie"]
}
```

!!! note "Typology"
    `component_portal` is a **related** component. It does not own a literal value: it stores an array of [locator](../locator.md) objects that point at records in other (or the same) section, and the displayed `value` is resolved on demand from the *target* records. In server context it extends the abstract base `component_relation_common` (the shared base for every relation component: `component_select`, `component_check_box`, `component_radio_button`, `component_relation_*`, `component_filter`, `component_publication`, `component_inverse`, `component_dataframe`), which in turn extends `component_common`.

!!! info "About `default_tools`"
    The toolbar is assembled from the model + ontology; the component class does not hardcode it. The verified model sample (`samples/context.json`) ships `tool_propagate_component_data` and `tool_time_machine`. Because `component_portal` is **not** translatable, the language tooling (`tool_lang` / `tool_lang_multi`) is never added. Tools are read-only context.

!!! note "Legacy models"
    `component_portal` absorbed the former `component_autocomplete` / `component_autocomplete_hi` (pre-v6) functionality; you may still see `legacy_model: "component_autocomplete_hi"` in older ontology nodes. New nodes use `component_portal`.

!!! info "TS server implementation"
    In the TypeScript/Bun rewrite, PHP's `component_relation_common`/`component_portal` classes are replaced by a shared engine + a per-model registry, not by a class hierarchy. The descriptor `src/core/components/component_portal/descriptor.ts` registers `resolveData: portalResolver` (`src/core/relations/models/portal.ts`), which resolves the child ddo map (client-supplied map, or the list-cell effective config, or the component's own v6 config via `buildRequestConfigForElement`, `src/core/relations/request_config/build.ts`) and delegates paging/expansion/re-stamping to the shared `expandPortal` engine (`src/core/relations/relation_core.ts`). The same resolver backs the legacy `component_autocomplete` / `component_autocomplete_hi` aliases and (until they get their own particularity) `component_relation_parent`, `component_dataframe` and `component_external`. Write-side particularities (`sort_data`, `sort_by_column`, `add_new_element`, `delete_locator`) live in `src/core/relations/save.ts`. See `engineering/RELATIONS_SPEC.md` and the *dedalo-relations-ts* skill.

## Definition

`component_portal` is the relational workhorse of Dédalo: it links the host record to one or more records in a target section and presents those linked records as a list (autocomplete to find/add, open to navigate, drag-to-reorder, remove). It is the v7 successor of the old autocomplete components and is by far the most common way to express a *reference to another record* in a catalogue.

**Why it exists.** A cultural-heritage record is rarely self-contained: an object has an *author*, a *material*, a *find spot*; a person has *projects*, *publications*, *related people*. Each of those is a record in its own section, not a literal string. `component_portal` stores the connection as a [locator](../locator.md) instead of copying the target's text, so the link stays live — rename the authority record once and every portal that points at it shows the new term. It supports many-to-many cardinality, so the same authority can be reused across thousands of records.

**When to use it.**

- Link a record to one or more records in another section: *Author*, *Owner*, *Find spot*, *Related objects*, *Bibliography*, *Birth town*.
- Build a curated, ordered list of references the cataloguer adds by autocomplete and re-orders by hand (or by a target column with [`sort_by_column`](#sort_by_column)).
- Surface calculated / inverse relations read-only via `source.mode: external` (e.g. *all coins of this type*, computed from the inverse side).
- Expose a thesaurus / hierarchy branch for picking terms (the `tree` and `indexation` views).

**When not to use it.**

- A literal short string the cataloguer types directly (*Title*, *Inventory number*) -> use [component_input_text](component_input_text.md).
- A bounded, mutually-exclusive choice rendered as a dropdown or radios -> use `component_select` / `component_radio_button` (also relation components, but with a fixed option list and single/low cardinality UX).
- A multi-select rendered as a tick list -> use [component_check_box](component_check_box.md).
- Frame data (uncertainty, qualifiers) attached to another component's items -> use [component_dataframe](component_dataframe.md).

## Data model

**Data:** `array of locators`.

**Value:** `array` of `strings`, or `null`. The value is **not** stored on the portal; it is resolved from the target record(s) at read time (see [Value resolution](#value-resolution)).

**Storage shape.** A component never touches the database; it reads and writes through its section. Relation components do not store their items in the matrix `data` column — they store them in the matrix **`relation`** column as a JSONB map keyed by component tipo, and the section additionally aggregates every locator of the record into a single section-wide `relations` container (`section::get_relations('relations')`). A portal slices its own subset out of that bag by matching `from_component_tipo` (and `section_tipo`). That single shared relations bag is exactly what lets many distinct relation components live on one record without colliding.

A portal's stored data is therefore an **array of locator objects**:

```json
[
    {
        "id"                  : 1,
        "type"                : "dd151",
        "section_tipo"        : "rsc197",
        "section_id"          : "1",
        "from_component_tipo" : "oh24"
    },
    {
        "id"                  : 2,
        "type"                : "dd151",
        "section_tipo"        : "rsc167",
        "section_id"          : "8",
        "from_component_tipo" : "oh24"
    }
]
```

Locator fields:

- `type` — the relation-type tipo. Defaults to the portal's `$default_relation_type`, which for `component_portal` is `DEDALO_RELATION_TYPE_LINK` = **`dd151`** (the generic link type). Set in the constructor from `properties->config_relation->relation_type`.
- `section_tipo` / `section_id` — point at the target record.
- `from_component_tipo` — names the component that owns the locator. `validate_data_element()` **forces** this to the owning portal's own `tipo` (cloning the incoming locator first to protect observers), which is how the section-wide relations bag is partitioned per component.
- `id` — per-item counter id used for ordering and dataframe pairing.
- `type_rel` *(optional)* — directionality (uni / bi / multidirectional); see [Directionality](#directionality).
- `tag_id` *(optional)* — present for indexation locators.

`component_portal` is **non-translatable** (`could_be_translatable: false`), so its locators have no `lang`; an instance is built in `lg-nolan`. The *resolved value* is still shown in the application/data language because the target component is instantiated in that language at resolution time.

!!! note "Datum vs. API `entries`"
    The transmitted unit is a `{context, data}` datum (the JSON-API contract). In the API payload the locator array is surfaced under `data.entries` (each entry carrying a `paginated_key`), accompanied by `parent_tipo`, `parent_section_id` and `pagination`. The displayed strings of the linked records arrive as **subdata**: the controller resolves each target via `get_subdatum()` and appends the target components' datums, merging their context with `common::merge_unique_context()`. `context` carries the description (`tipo`, `model`, `mode`, `lang`, `label`, `properties`, `permissions`, `tools`, `request_config`, `view`) and never the values. See the *dedalo-context-data-layers* and *dedalo-datalist-resolution* skills for the full layering rules.

### Value resolution

The displayed strings come from the *target* section/component, never from the portal:

- `component_relation_common::get_locator_value($locator, $lang, $show_parents, $ar_components_related)` resolves one locator. By default it calls `ts_object::get_term_by_locator($locator, $lang, true)`. With `$ar_components_related` it instantiates each named target component in the target record and collects its `get_value()`; with `$show_parents` it prepends the term and walks `component_relation_parent::get_parents_recursive()` (ancestor chain).
- For grid and export, `get_grid_value()` / `get_export_value()` iterate the locators and, driven by the `request_config` `show.ddo_map`, instantiate each child component against the locator's `section_id` / `section_tipo` to resolve sub-columns.
- The selectable option list (datalist / autocomplete suggestions) comes from the target component's `get_list_of_values()`, served through `relation_list` (`core/relation_list/class.relation_list.php`).

## Ontology instantiation

A `component_portal` is created as an ontology node whose `model` is `component_portal`. Its `parent` is the section (or grouper) it belongs to, and its `section_tipo` wires it into that section. The node declares its label through the standard `lg-*` term; `translatable` is `false` for a portal.

Node definition (shape):

```json
{
    "tipo"         : "rsc91",
    "model"        : "component_portal",
    "parent"       : "rsc197",
    "section_tipo" : "rsc197",
    "lg-eng"       : "Birth town",
    "lg-spa"       : "Localidad de nacimiento",
    "translatable" : false,
    "properties"   : { }
}
```

The behaviour of a portal is driven almost entirely by its `properties->source` block, which carries the **request_config** that defines the target section(s) and the columns to `show` / `choose` / `search`. A realistic `properties` block for a "Birth town" portal pointing at one geographic section and showing the term with its ancestor chain:

```json
{
    "source": {
        "mode": "autocomplete",
        "request_config": [{
            "sqo": {
                "section_tipo": [{ "value": ["rsc197"], "source": "section" }]
            },
            "show": {
                "ddo_map": [{
                    "tipo": "rsc91",
                    "parent": "self",
                    "section_tipo": "self",
                    "value_with_parents": true
                }],
                "fields_separator": ", "
            },
            "choose": {
                "ddo_map": [{
                    "tipo": "rsc91",
                    "parent": "self",
                    "section_tipo": "self",
                    "value_with_parents": true
                }],
                "sqo_config": { "limit": 30 },
                "fields_separator": " | "
            }
        }]
    }
}
```

`section_tipo` / `parent` tell the section which relation slot owns this portal's locators; on save the section is the single writer to the database (the locators land in the `relation` column and the record-wide `relations` bag). The portal's `request_config` is parsed (TS: `buildRequestConfigForElement` in `src/core/relations/request_config/build.ts`, dispatching to the v6 or v5 builder) into a ready-to-use `request_config` array on the context (`api_engine: "dedalo"`, `type: "main"`), which the client uses to build the data/list/search RQO.

!!! info "Relation table persistence"
    Relation components carry `$save_to_database_relations = true`: on save they also propagate their locators to the relation table for fast querying. Set it to `false` only for special bulk paths (e.g. geonames imports) where relation-table writes are skipped.

## Properties & options

All properties are optional and live in the ontology node `properties` JSON. Verified names consumed by this component (server class + client JS):

### source

- **Values:** an object `{mode, request_config}`.
- **`source.mode`:** `"autocomplete"` (default behaviour — the user finds and links target records via the autocomplete service) or `"external"`. With **`external`** the portal data is *calculated*, not user-owned: in `edit` (non-pagination) requests the controller calls `set_data_external()` to recompute the locators (inverse / dependent relations), `regenerate_component()` does the same on cache rebuild, and the UI hides add/link/tree buttons and tools, showing only the external + list buttons.
- **`source.request_config`:** the per-portal RQO template: `sqo` (which target section(s), via `section_tipo` sources such as `section`, `hierarchy_types`, …), `show` (the `ddo_map` columns rendered for each linked record + `fields_separator`), `choose` (the columns offered in the autocomplete picker), and `search`. This is the heart of a portal's configuration — it defines both *what it links to* and *how each linked record is displayed*.

### config_relation

- **Values:** an object `{relation_type, relation_type_rel}`.
- **Effect:** read in the base constructor. `relation_type` overrides the locator `type` (default `dd151`); `relation_type_rel` sets directionality (locator `type_rel`). See [Directionality](#directionality). Also carries `tag_id` config for indexation portals.

### sort_by_column

- **Values:** `true` | array of column component tipos (e.g. `["oh28"]`). Default: unset (off).
- **Effect:** lets the cataloguer persistently re-order **all** portal entries (the full stored locator array, across pagination) by the value of a column component in the target section, ascending or descending — e.g. order linked events by a `component_date` column. `true` shows sort buttons on every sortable column of the list header (default view, edit mode); the array form restricts which columns get them. Clicking a sort button resolves the new order on the server (a search over the target section restricted to the linked `section_id` list, ordered by the column value, `NULLS LAST`) and **saves the re-ordered locator array** — a real data change recorded in Time Machine. Unresolvable (deleted) targets fall to the end preserving relative order. Columns whose model is not sortable (`get_sortable()` false) never show buttons. `source.mode: external` portals are excluded (their data is not locally owned). Manual drag-and-drop re-ordering is always available regardless of this flag.

```json
{ "sort_by_column": true }
```

TS: `applySortByColumn` (`src/core/relations/save.ts`) — property-gated (`true` | allowlist array), the column must be a `show.ddo_map` entry of the component's own edit config, and the stored locators are re-ranked via a target-section search ordered on that column (unranked locators keep relative order at the end).

### data_limit

- **Values:** integer. Default: unset (no limit).
- **Effect:** maximum number of linked records allowed. When the current entry count reaches `data_limit`, the client (`data_limit_reached()`) blocks the add/link action and alerts the user (label `exceeded_limit`). A soft client-side cap, useful for "exactly one author" style fields without dropping to a single-value select.

### draggable_to

- **Values:** array of component tipos the entries may be dragged into.
- **Effect:** enables cross-portal drag-and-drop. `drag_and_drop.js` reads `properties.draggable_to`; a target portal accepts a drop only when its own `tipo` is found in the dragged source's `draggable_to` list. Used to move a linked record from one portal to another (e.g. promote a "candidate" link to a "confirmed" link).

### with_value

- **Values:** an object `{mode, view}`.
- **Effect:** in `list` line view, double-clicking an entry switches the portal to the `mode` / `view` declared here (defaults `edit` / `line`) — the inline "open for editing" transition. Only fires for users with write permission and when the portal is not read-only.

### service_autocomplete

- **Values:** an object (service-autocomplete configuration) or `null`.
- **Effect:** passed straight to the `service_autocomplete` instance the edit render spins up when the user activates the picker (`render_edit_component_portal.js`). Configures the external autocomplete service used to find target records.

!!! note "Standard context properties"
    Like every component, `component_portal` also honours the generic ontology context blocks carried into the datum `context`: `css` (style stamped on `.wrapper_component`), `request_config` (the parsed RQO) and `view` (the render view to use). Observer/observable wiring (`observe` / `observers`) is configured here too — see [Notes](#notes). Any other custom key seen in production should be **verified in the ontology**.

## Render views & modes

Views are selected from `context.view` (default `default`) and dispatched by the per-mode render files. The `render_views` map registered in `component_portal.js` is authoritative:

| View | edit | list / tm | Notes |
| --- | :---: | :---: | --- |
| `default` | yes | yes | Full list: label, buttons (add / link / open / autocomplete), `content_data` with one row per linked record; sort buttons in the header when `sort_by_column` is on. |
| `line` | yes | yes | Compact single-line list; in list mode supports the [`with_value`](#with_value) double-click-to-edit transition. |
| `text` | yes | yes | Plain joined text of the resolved values, no chrome. (Registered for both edit and list.) |
| `mini` | — | yes | Minimal inline view, used by the service autocomplete / tight layouts. |
| `mosaic` | yes | — | Grid layout of linked records (visual / media-heavy targets). |
| `tree` | yes | — | Picks target records from a thesaurus / hierarchy tree; links with `type` forced to `dd151`. |
| `indexation` | yes | — | Specialised thesaurus indexation view (uses `config_relation` `tag_id`, `top_locator` from `tool_indexation`). |
| `content` | yes | — | Renders the linked records' content inline. |

!!! note "search mode"
    `search` mode reuses the edit/list render pipeline via `render_search_component_portal.js`: the portal becomes an SQO filter input (autocomplete over the target section, `action: 'resolve_data'`), and the picked locators are carried as the filter source value. Saves are blocked in search mode.

Modes:

- **edit** — read/write: autocomplete-add, link existing, open target, drag-reorder, remove (`remove_element` with `delete_link` or `delete_all`), `data_limit` cap, `sort_by_column` re-order, and `external` recalculation.
- **list / tm** — read-only listing; `tm` (Time Machine) reuses the list render (list mode `limit` is always 1 per row).
- **search** — builds the SQO filter input; saves blocked.

DOM (edit / default): `wrapper_component portal <tipo> <mode>` -> `label`, `buttons_container`, `content_data` -> one row (`content_value`) per linked record, each resolving the target's `show.ddo_map` columns.

## Import / export model

**Import.** Handled by the shared `component_relation_common::conform_import_data()`. The default format is the JSON locator array; convenience short forms are accepted because the column head already names the component and the component knows its own `type`:

Default (full or trimmed locators — `type` / `from_component_tipo` may be omitted, they are injected):

```json
[{"type":"dd151","section_tipo":"rsc197","section_id":"1","from_component_tipo":"oh24"}]
```

```json
[{"section_id":"2","section_tipo":"rsc197"}]
```

A comma-separated list of target `section_id`s, valid when the portal has a single target section (the section_tipo is resolved from the portal's `ar_target_section_tipo`):

```text
1,5,8
```

With multiple possible target sections, disambiguate by naming the target in the column head as `oh24_rsc197` (`oh24` = the portal tipo, `rsc197` = the target section); then the integer-sequence form is accepted. Importing an integer sequence without a clear single target is rejected and logged (`IGNORED: Trying to import multiple section_tipo without clear target`); invalid `section_id` / `section_tipo` and malformed locators are likewise rejected per row. An empty cell clears the component data. See [Related data](../importing_data.md#related-data).

**Export.** `get_export_value()` (inherited from `component_relation_common`) emits one export atom per locator, resolving each via the `show.ddo_map` — instantiating the named target component(s) against the locator's `section_id` / `section_tipo` and collecting their value. The `ddo_map` drives the sub-columns, so a portal can export the target's term, its model, its parents (`value_with_parents`), etc., joined by the configured `fields_separator`. Relations export as JSON in SQL diffusion contexts (`$diffusion_output_format = ['sql' => 'json']`). See [exporting data](../exporting_data.md).

## Notes

- **Directionality.** `config_relation->relation_type_rel` (locator `type_rel`) records uni / bi / multidirectional relations. Unidirectional stores the locator only on the originating side; bidirectional / multidirectional also write the inverse locator into the target record so the relation is queryable from both records. A plain link portal leaves `type_rel` unset.
- **Remove semantics.** `remove_element()` takes `remove_mode`: `delete_link` (default — unlink only) or `delete_all`. `delete_all` hard-deletes the **target** section record and therefore requires write/delete permission on the *target* section itself (REL-06) — permission on the host record is not sufficient. TS: bulk partial-locator removal is `deletePortalLocator` (`src/core/relations/save.ts`, the `dd_component_portal_api.delete_locator` action); `delete_all`'s target-record hard-delete is not yet ported.
- **Observers / observables.** Portals are a common observer target: e.g. a numismatic *coins* portal observes a *type* field and recomputes its own data with `set_data_external` on change. Wiring lives in the ontology `properties` (`observe` / `observers`), not in the component code — see the *Observers and observables* section of the [components index](index.md).
- **Default tools.** The verified model sample exposes `tool_propagate_component_data` and `tool_time_machine`; the toolbar is assembled from the model + ontology, not hardcoded, and narrows further for `external` portals (tools off).
- **Permissions.** Resolved via `get_component_permissions()` (0 none / 1 read / 2 read+write / 3 admin). Read users (level 1) get the read-only list; add / link / remove / re-order require level >= 2.
- **Inherited behaviours.** From `component_relation_common`: locator normalization/validation (`validate_data_element`, de-dupe via `get_locator_properties_to_check()` and `test_equal_properties`), `add_locator_to_data` / `remove_locator_from_data` (with dataframe cascade), grid/export/diffusion resolution, parent-reference cleanup on delete (`remove_parent_references`), and the shared search traits (`search_component_relation_common` / `_tm`).
- **Related components:** [component_check_box](component_check_box.md), [component_dataframe](component_dataframe.md), [component_inverse](component_inverse.md), `component_select`, `component_radio_button`, `component_relation_parent`, `component_relation_children`, `component_relation_related`, `component_publication`, [component_input_text](component_input_text.md) (the literal counterpart for non-relational fields).
