# component_relation_model

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
    "render_views" :[
        {
            "view" : "default | line",
            "mode" : "edit"
        },
        {
            "view" : "text | mini",
            "mode" : "list"
        }
    ],
    "data"        : "array of locators",
    "sample_data" : [{
        "id"                  : 1,
        "type"                : "dd98",
        "section_tipo"        : "dd922",
        "section_id"          : "1",
        "from_component_tipo" : "test169"
    }],
    "value"        : "array of strings",
    "sample_value" : ["Categoría Laboral / Cargo"]
}
```

!!! note "Typology"
    `component_relation_model` is a **related** component. In server context it extends the abstract base [`component_relation_common`](base_classes.md) (`core/component_relation_common/class.component_relation_common.php`), which in turn extends `component_common`. Like every related component, it stores [locators](../locator.md) pointing at other records rather than literal data, and resolves its displayed `value` from the *target* section. It is enumerated in `component_relation_common::get_components_with_relations()`.

!!! info "Client is an alias of component_select"
    The client class is a thin alias: `core/component_relation_model/js/component_relation_model.js` exports `component_relation_model = component_select`. All client behaviour (render files, views, edit/list/search UI) is therefore [component_select](component_select.md)'s. The server side, however, is its own class with model-specific target resolution.

!!! info "TS server implementation"
    The descriptor `src/core/components/component_relation_model/descriptor.ts` registers `resolveData: selectFamilyResolver` (`src/core/relations/models/select_family.ts`) — the same read-side resolver as `component_select`, resolving options/labels via `src/core/relations/datalist.ts`. **Gap:** the distinctive PHP **target resolution** described below (`get_ar_target_section_tipo()`'s hierarchy-derived target vs. `target_mode: 'free'` / `target_values`) has no dedicated TS port in this checkout — `target_mode` / the hierarchy-target-section lookup do not appear in `src/core/relations/request_config/` or `src/core/ontology/resolver.ts`. Until it lands, this component resolves the same as `component_select` (target sections come from `sqo.section_tipo`, not from hierarchy inference). See the *dedalo-relations-ts* skill and `rewrite/STATUS.md`.

## Definition

`component_relation_model` creates a **model-type relation** between the current record and another record, where the link is constrained to a *target section that is itself derived from the ontology hierarchy model*. Its default relation type is `DEDALO_RELATION_TYPE_MODEL_TIPO = 'dd98'`, distinct from the generic link type `dd151` used by [component_portal](component_portal.md).

The defining trait is **target resolution**: the component does not hardcode which section it points at. It resolves the target section tipo(s) at runtime via `get_ar_target_section_tipo()`, which has two modes:

- **Hierarchy mode** (default): it looks up the hierarchy section that owns the current `section_tipo` (`hierarchy::get_hierarchy_section()` with `DEDALO_HIERARCHY_TARGET_SECTION_TIPO`), reads the *target model component* of that hierarchy (`DEDALO_HIERARCHY_TARGET_SECTION_MODEL_TIPO`) and uses its value as the target section tipo. When nothing resolves, it falls back to a prefix-based calculation: `get_tld_from_tipo($section_tipo) . '2'` (e.g. a `rsc...` section falls back to `rsc2`).
- **Free mode** (`properties->target_mode === 'free'`): it uses the section tipos listed directly in `properties->target_values`, bypassing hierarchy lookup entirely.

**Why it exists.** In Dédalo, a thesaurus / hierarchy is split into a *structure* (the hierarchy definition) and the *records* it governs. A model relation lets a record inside a hierarchy-driven section point at the canonical "model" section that the hierarchy declares as its target, without the cataloguer or the ontology author having to repeat that target tipo in every node. The component asks the hierarchy "which section do you model?" and offers exactly those records.

**When to use it.**

- A field whose valid options are the records of whatever section the *hierarchy* declares as its target model, so the target follows the hierarchy configuration rather than being fixed in the field itself.
- A fixed-but-declarative variant: pin the target with `target_mode: 'free'` + `target_values` when you want the simple, explicit list-of-targets behaviour but still want the model relation type (`dd98`) and the select UI.

**When not to use it.**

- A generic link to one or more arbitrary sections with autocomplete / tree / mosaic UI -> use [component_portal](component_portal.md) (relation type `dd151`).
- A flat single/multiple choice from a target component's option list with select / radio / checkbox UI -> use [component_select](component_select.md), [component_radio_button](component_radio_button.md) or [component_check_box](component_check_box.md).
- A thesaurus parent / child / equivalence relation -> use [component_relation_parent](component_relation_parent.md), [component_relation_children](component_relation_children.md) or [component_relation_related](component_relation_related.md).

## Data model

**Data:** `array of locators`.

**Value:** `array` of `strings`, or `null`. The displayed value is resolved from the *target* record, never stored locally.

**Storage shape.** A component never touches the database; it reads and writes through its section. A related component's own locators live in the section matrix `relation` column as a JSONB map `{from_component_tipo: [locators]}`, and the section also maintains a global `relations` container that aggregates every locator across the record. `component_relation_model` slices its own subset out of that bag by matching `from_component_tipo` (its own `tipo`) and `section_tipo`.

The canonical locator shape for this component is `{id, type, section_tipo, section_id, from_component_tipo}`:

```json
[
    {
        "id"                  : 1,
        "type"                : "dd98",
        "section_tipo"        : "dd922",
        "section_id"          : "1",
        "from_component_tipo" : "test169"
    }
]
```

- `type` — the relation-type tipo. Defaults to the subclass `$default_relation_type`, which for this component is `DEDALO_RELATION_TYPE_MODEL_TIPO = 'dd98'`. `validate_data_element()` injects it on every incoming locator.
- `section_tipo` / `section_id` — point at the target record (one of the resolved `get_ar_target_section_tipo()` sections).
- `from_component_tipo` — the owning component's own `tipo`; `validate_data_element()` forces this to the instance `tipo` (cloning the locator first to protect observers) so a single section-wide relations bag can serve many distinct relation components.
- `id` — the per-item counter id used to pair the locator across operations.

!!! note "No directionality flag"
    Unlike [component_relation_related](component_relation_related.md), this component does **not** set `$default_relation_type_rel` (it stays `null`), so model locators carry no `type_rel` uni/bi/multidirectional marker by default. The link is stored on the originating side.

!!! note "Duplicate detection"
    Adding a locator de-dupes against the existing data using `$test_equal_properties = ['section_tipo','section_id','type','from_component_tipo']` (this component overrides the base list to include `type`), via the lookup map keyed by `get_locator_properties_to_check()`. Auto-references and malformed locators are rejected by `validate_data_element()`.

## Ontology instantiation

A `component_relation_model` is created as an ontology node whose `model` is `component_relation_model`. Its `parent` is the section (or grouper) it belongs to, and its `section_tipo` wires it into that section. The node declares its label through the standard `lg-*` term; related components are non-translatable, so `translatable` is `false`.

Node definition (shape):

```json
{
    "tipo"         : "test169",
    "model"        : "component_relation_model",
    "parent"       : "test3",
    "section_tipo" : "test3",
    "lg-eng"       : "Job category",
    "lg-spa"       : "Categoría laboral",
    "translatable" : false,
    "properties"   : { }
}
```

Realistic `properties` block — **free mode**, pinning the target section and the column the option list shows (verified from `samples/context.json`):

```json
{
    "source": {
        "mode": "autocomplete",
        "request_config": [
            {
                "sqo": { "section_tipo": [] },
                "show": {
                    "ddo_map": [
                        {
                            "tipo": "dd924",
                            "parent": "self",
                            "section_tipo": "self",
                            "value_with_parents": false
                        }
                    ],
                    "fields_separator": ", "
                }
            }
        ]
    },
    "target_mode"   : "free",
    "target_values" : ["dd922"]
}
```

Hierarchy-mode `properties` simply omit `target_mode` / `target_values`; the component then resolves the target from the hierarchy's declared model section at runtime:

```json
{
    "source": {
        "mode": "autocomplete",
        "request_config": [ { "show": { "ddo_map": [ { "tipo": "dd924", "parent": "self", "section_tipo": "self" } ] } } ]
    }
}
```

`section_tipo` / `parent` tell the section which column owns this component's locators; on save the section is the single writer to the database. The JSON controller (`component_relation_model_json.php`) adds the resolved targets to the datum context via `set_target_sections()` (each `{tipo, label}`), so the client knows which sections it may link to. In `edit` mode the controller also attaches the datalist (`get_list_of_values()`) of selectable options.

## Properties & options

Properties live in the ontology node `properties` JSON. Verified names consumed by this component:

### target_mode

- **Values:** `"free"` | *(absent / any other value)* (default: hierarchy resolution).
- **Effect:** selects how `get_ar_target_section_tipo()` resolves the target section(s). `"free"` reads `target_values` directly from the ontology; the default (absent) calculates the target from the owning hierarchy's target model component, with the `prefix.'2'` fallback.

### target_values

- **Values:** array of section tipos, e.g. `["dd922"]`.
- **Effect:** used **only when** `target_mode` is `"free"`. The explicit list of target section tipos the relation may point at. Cast to array, so a single string is accepted.

### source

- **Values:** object `{mode, request_config}` (the standard related-component source descriptor).
- **Effect:** drives the option list / lookup. `mode` is typically `"autocomplete"`; `request_config` carries the `sqo` / `show.ddo_map` that decide which target component value labels the options. Same structure used by [component_portal](component_portal.md) and [component_select](component_select.md). Consumed when building `get_list_of_values()` / the datalist.

### has_dataframe

- **Values:** `true` | `false` (default `false`).
- **Effect:** marks the component as paired with a [component_dataframe](component_dataframe.md), inherited from the base related-component machinery (`add_locator_to_data` / `remove_locator_from_data` cascade dataframe rows). See the *dedalo-dataframe* skill.

!!! note "Standard context properties"
    Like every component, `component_relation_model` also honours the generic ontology context blocks carried into the datum `context`: `css` (style stamped on `.wrapper_component`), `request_config` (RQO) and `view` (the render view to use). These are not component-specific options. Any other custom key seen in production should be verified in the ontology.

!!! warning "sort_by_column"
    `get_sortable()` returns `true` for this component, so its locator list is sortable and column-sort is available in principle. The `sort_by_column` property and the column-sort UI are documented under [component_portal](component_portal.md#properties); if you rely on it here, verify the behaviour in the ontology for your instance.

## Render views & modes

Because the client class is an alias of [component_select](component_select.md), the views and modes are component_select's, dispatched from the select render files. Verified from `core/component_select/js/` and the CSS in `core/component_relation_model/css/component_relation_model.less` (which styles `view_default` and `view_line`):

| View | edit | list / tm | search | Notes |
| --- | :---: | :---: | :---: | --- |
| `default` | yes | — | (via search render) | Full wrapper: label, buttons, `content_data` with a `<select>` per locator (max-width 80%) and a per-row `remove` button. |
| `line` | yes | — | — | Block layout, compact inline (no label chrome). |
| `text` | — | yes | — | Plain text of the resolved value(s) for list / tm. |
| `mini` | — | yes | — | Minimal list rendering. |

Modes:

- **edit** — read/write a real record; the controller resolves `get_data()` plus the `datalist` from `get_list_of_values()`, and adds the resolved `target_sections` to the context. The user picks target records from the select.
- **list / tm** — read-only listing; both resolve through `get_list_value()`. `tm` (Time Machine) reuses the list render.
- **search** — builds an SQO filter input through the shared related search traits (`search_component_relation_common` / `_tm`). Saves are blocked in search mode.

## Import / export model

**Import.** The default import format is the JSON locator array of the component data; when the relation targets a single section the import can also be a sequence of `section_id` values. `conform_import_data()` (inherited from the base) injects `type` (`dd98`) and `from_component_tipo`, and resolves the target via `get_ar_target_section_tipo()` (the column name may carry the explicit target as `<component_tipo>_<section_tipo>`, e.g. `test169_dd922`). An empty cell clears the existing data.

Default import (JSON locators):

```json
[{"type":"dd98","section_tipo":"dd922","section_id":"1","from_component_tipo":"test169"}]
```

A number sequence of `section_id` when there is a single resolved target section:

```json
1,5,8
```

With multiple resolved targets, define the target section in the column header as `<component_tipo>_<section_tipo>` (e.g. `test169_dd922`). See the full related-data definition in [importing data](../importing_data.md#related-data).

**Export.** Related components resolve each locator against its target section/component. `get_export_value()` (base) iterates the locators and, per the `ddo_map`, instantiates each child component against `locator->section_id` / `locator->section_tipo` to resolve the displayed sub-columns; `get_grid_value()` does the same for the grid. See [exporting data](../exporting_data.md).

## Notes

- **Server / client split.** Only the JS layer aliases [component_select](component_select.md). The PHP class is its own (`component_relation_model extends component_relation_common`) and contributes the model relation type (`dd98`) and the `get_ar_target_section_tipo()` resolution. Do not assume the PHP class behaves like `component_select` server-side.
- **Default tools.** A non-translatable related instance exposes `tool_propagate_component_data` and `tool_time_machine` in `context.tools` (verified from `samples/context.json`). Tools are read-only context, assembled from the model + ontology, not hardcoded in the component.
- **Observers / observables.** Wiring, when needed, is configured in the ontology `properties` like any other component (see the index page *Observers and observables* section), not in the component code. Related components inherit `set_data_external()` from the base for observer-driven data updates.
- **Inherited behaviours.** From `component_relation_common`: locator normalization / validation (`validate_data_element`), `add_locator_to_data` / `remove_locator_from_data` (with dataframe cascade), grid / export / diffusion resolution, the relation-table persistence flag `$save_to_database_relations`, JSON diffusion output format (`['sql' => 'json']`), parent-reference cleanup on delete, and the shared search traits.
- **Related components:** [component_portal](component_portal.md), [component_select](component_select.md), [component_relation_related](component_relation_related.md), [component_relation_parent](component_relation_parent.md), [component_relation_children](component_relation_children.md), [component_radio_button](component_radio_button.md), [component_check_box](component_check_box.md), [component_dataframe](component_dataframe.md).
