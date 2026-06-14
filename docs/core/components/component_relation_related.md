# component_relation_related

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
            "view" : "default | line | content | indexation | mosaic | tree | mini",
            "mode" : "edit"
        },
        {
            "view" : "default | line | text | mini",
            "mode" : "list"
        }
    ],
    "data" : "array of locators",
    "sample_data" : [{
        "id"                  : 1,
        "type"                : "dd89",
        "type_rel"            : "dd620",
        "section_id"          : "2",
        "section_tipo"        : "test3",
        "from_component_tipo" : "test54"
    }],
    "value" : "array of string",
    "sample_value" : ["Bronze (related term)"]
}
```

!!! note "Typology"
    `component_relation_related` is a **related** component. It does not own a literal value: it stores an array of [locators](../locator.md) pointing at other records and resolves the displayed strings from the *target* section/component. In server context it extends the abstract base `component_relation_common` (`core/component_relation_common/class.component_relation_common.php`), which extends `component_common`. On the client it is a direct **alias of [component_portal](component_portal.md)** (`export const component_relation_related = component_portal`), so it reuses the portal UI, render and data-management code; the related-specific behaviour (reference resolution, directionality) lives in the PHP class.

!!! info "About `default_tools`"
    The list above is what an instance receives in `context.tools` (verified from the model sample `samples/context.json`): `tool_propagate_component_data` and `tool_time_machine`. The component is non-translatable, so the language tools are not added. The toolbar is assembled from the model + ontology; the component class does not hardcode it. The controller forces `properties->show_interface->button_add = false` so the client does not draw the generic *add* button — references are managed through the thesaurus/relation UI.

## Definition

`component_relation_related` manages **associative (non-hierarchical) relationships between thesaurus terms**. Where [component_relation_parent](component_relation_parent.md) and [component_relation_children](component_relation_children.md) model the vertical *broader/narrower* axis of a thesaurus, `component_relation_related` models the horizontal *see-also / related-term* axis (the ISO-25964 *RT* relationship): it links a term to other terms that are semantically associated but not in its branch.

**Why it exists.** A controlled vocabulary needs more than a tree. A term such as *Birds* should point sideways to *Ornithology*; a material *Bronze* relates to *Copper* and *Tin*; an iconographic subject *Baptism* relates to *John the Baptist*. These are cross-branch associations that the parent/children hierarchy cannot express. `component_relation_related` provides that link and, crucially, can compute the **back-references** (terms that point *to* the current term) so the relationship can be navigated from both ends without storing it twice — see *Directionality* below.

**When to use it.**

- Thesaurus *related term* (RT) links: *see also*, *associated with*, *compare with*.
- Cross-branch semantic associations inside a single thesaurus / hierarchy section (the typical target section is the same thesaurus the term lives in).
- Cases where you want the relationship reachable from both records but stored once (bidirectional / multidirectional types).

**When not to use it.**

- A broader/narrower hierarchical link between terms -> use `component_relation_parent` / `component_relation_children`.
- A generic relation from a catalogue record to another section (a person, a place, an object) -> use [component_portal](component_portal.md) (relation type `dd151`).
- A pick-from-list relation rendered as a dropdown / checkboxes -> use [component_select](component_select.md), [component_check_box](component_check_box.md) or [component_radio_button](component_radio_button.md).

## Data model

**Data:** `array of locators`.

**Value:** `array` of `strings`, or `null`. The value is **not stored**; it is resolved from the target term (its `component_input_text` thesaurus term, optionally with parents) when the component is read.

**Storage shape.** A component never touches the database; it reads and writes through its section. A related component's own locators live in the section matrix `relation` column as a JSONB map `{component_tipo: [locators]}`, and the section also keeps a global `relations` bag (`section::get_relations('relations')`) aggregating every locator in the record. The component slices its own subset out of that global array by matching `from_component_tipo` (and `section_tipo`).

The canonical locator for this component carries `type = dd89` (the related relation-type tipo) and `type_rel` (the directionality tipo, default `dd620`):

```json
[
    {
        "id"                  : 1,
        "type"                : "dd89",
        "type_rel"            : "dd620",
        "section_id"          : "2",
        "section_tipo"        : "test3",
        "from_component_tipo" : "test54"
    }
]
```

- `type` — relation-type tipo, defaults to the subclass `$default_relation_type = DEDALO_RELATION_TYPE_RELATED_TIPO ('dd89')`. Injected/normalised by `validate_data_element()`.
- `type_rel` — directionality tipo (`dd620` unidirectional / `dd467` bidirectional / `dd621` multidirectional), from `$relation_type_rel`.
- `section_tipo` / `section_id` — point at the *target* term record.
- `from_component_tipo` — the owning component's own `tipo`; this is what lets the section-wide relations bag serve many distinct relation components. `validate_data_element()` forces it to `$this->tipo` (cloning the locator first to protect observers), rejects auto-references and malformed locators, and de-dupes via a lookup map.
- `id` — per-item counter id.

Because the component is non-translatable, it is instantiated with `lang = lg-nolan`; locators have no `lang` key.

!!! note "Stored data vs. calculated references"
    `get_data()` returns only the **stored** locators (relations authored on this record). `get_calculated_references()` resolves the **back-references** — locators on *other* records that point here — for bidirectional / multidirectional types. `get_data_with_references()` merges both. In the API payload the stored locators are surfaced under `data.entries`; the calculated references are attached to the item as `item.references` (skipped in `search` mode). See *Directionality*.

!!! note "Datum vs. API `entries`"
    The transmitted unit is a `{context, data}` datum (the JSON-API contract). `data` carries the locators (`data.entries`) plus `parent_tipo`, `parent_section_id`, `pagination` and, when present, `references`; `context` carries the description (`tipo`, `model`, `mode`, `lang`, `label`, `properties`, `permissions`, `tools`, `view`, `request_config`, `fields_separator`) and never the resolved value strings, which are delivered as subdata of the target components. See the *dedalo-context-data-layers* skill for the layering rules.

## Ontology instantiation

A `component_relation_related` is created as an ontology node whose `model` is `component_relation_related`. Its `parent` is the section (or grouper) it belongs to, and `section_tipo` wires it into that section — typically a thesaurus / hierarchy section, since related terms point back into the same vocabulary.

Node definition (shape):

```json
{
    "tipo"         : "test54",
    "model"        : "component_relation_related",
    "parent"       : "test45",
    "section_tipo" : "test3",
    "lg-eng"       : "Related terms",
    "lg-spa"       : "Términos relacionados",
    "translatable" : false,
    "properties"   : { }
}
```

Realistic `properties` block (verified shape, from `samples/context.json`) — a related-term field over the same thesaurus section, unidirectional, showing the target term column:

```json
{
    "source": {
        "records_mode": "list",
        "request_config": [
            {
                "show": {
                    "ddo_map": [
                        {
                            "tipo": "test52",
                            "parent": "test54",
                            "section_tipo": "self"
                        }
                    ]
                }
            }
        ]
    },
    "config_relation": {
        "relation_type"     : "dd89",
        "relation_type_rel" : "dd620"
    },
    "show_interface": {
        "button_add"                    : false,
        "button_delete"                 : true,
        "button_delete_link"            : true,
        "button_delete_link_and_record" : true,
        "button_link"                   : true,
        "button_list"                   : true,
        "button_save"                   : true,
        "show_autocomplete"             : true,
        "show_section_id"               : true,
        "list_from_component_data"      : true,
        "tools"                         : true,
        "label"                         : true
    }
}
```

`section_tipo` / `parent` tell the section which subset of the global `relations` bag this component owns; on `save()` the locator array is persisted through `section_record->save_component_data()` into the matrix `relation` column, and the relation-table persistence flag `$save_to_database_relations = true` (inherited) keeps the relations index in sync. The section is the single writer to the database.

The constructor (`component_relation_common::__construct()`) reads `properties->config_relation->relation_type` / `relation_type_rel` and falls back to the subclass defaults (`dd89` / `dd620`) when they are absent.

## Properties & options

All properties are optional and live in the ontology node `properties` JSON. Verified names consumed by this component / its base.

### config_relation

- **Values:** an object `{relation_type, relation_type_rel}`.
- **Effect:** overrides the relation-type tipos written into each locator.
  - `relation_type` — defaults to `dd89` (`DEDALO_RELATION_TYPE_RELATED_TIPO`). Stored as the locator `type`.
  - `relation_type_rel` — directionality, defaults to `dd620`. Accepted values:
    - `dd620` — **unidirectional** (`DEDALO_RELATION_TYPE_RELATED_UNIDIRECTIONAL_TIPO`). The locator is stored only on the originating record; no back-reference is computed.
    - `dd467` — **bidirectional** (`DEDALO_RELATION_TYPE_RELATED_BIDIRECTIONAL_TIPO`). Direct references to the current term are resolved and surfaced.
    - `dd621` — **multidirectional** (`DEDALO_RELATION_TYPE_RELATED_MULTIDIRECTIONAL_TIPO`). References are resolved **recursively** to build the full graph of associated terms (references-to-references and references-to-data), de-duplicated through a static resolved cache.

### source

- **Values:** an object `{records_mode, request_config}` (the standard relation `source` block).
- **Effect:** defines how the picker/list resolves the target section and which columns are shown. `request_config[].show.ddo_map` lists the target components instantiated to resolve labels; `section_tipo: "self"` points the relation back at the component's own section (the usual thesaurus case). `records_mode` (`"list"`) controls how options are presented.

### show_interface

- **Values:** an object of boolean / option flags controlling which buttons and behaviours the client renders (`button_link`, `button_delete`, `button_delete_link`, `button_delete_link_and_record`, `button_list`, `button_save`, `show_autocomplete`, `show_section_id`, `list_from_component_data`, `tools`, `label`, `button_edit_options`, ...).
- **Effect:** UI toggles only. Note the controller **forces `show_interface->button_add = false`** at runtime, so even if the ontology sets it `true` the generic add button is suppressed for this component.

### sort_by_column

- **Values:** `true` | array of column tipos. (Inherited from the portal/relation base; `get_sortable()` returns `true` for this component, so it participates in list sorting.)
- **Effect:** persistently re-orders the stored locator array by the value of a target-section column, saving the new order as a real data change. See [component_portal](component_portal.md#sort_by_column) for the full semantics.

!!! note "Standard context properties"
    Like every component, `component_relation_related` also honours the generic ontology context blocks carried into the datum `context`: `css` (style stamped on `.wrapper_component`), `request_config` (the RQO, built from `source.request_config`) and `view` (the render view). These are not component-specific options. Any other custom key seen in production should be verified in the ontology.

## Render views & modes

On the client the component is an alias of [component_portal](component_portal.md), so it inherits the portal's `render_views`. Verified from `core/component_portal/js/component_portal.js`:

| View | edit | list / tm | search | Notes |
| --- | :---: | :---: | :---: | --- |
| `default` | yes | yes | (via search render) | Full portal wrapper: label, buttons, paginated list of related-term rows. |
| `line` | yes | yes | — | Compact inline list. |
| `text` | — | yes | — | Plain joined string of the resolved term labels. |
| `mini` | yes | yes | — | Minimal presentation for limited space. |
| `content` | yes | — | — | Content-focused layout. |
| `indexation` | yes | — | — | Thesaurus indexation layout (term + path). |
| `mosaic` | yes | — | — | Grid-based visual layout. |
| `tree` | yes | — | — | Tree presentation for hierarchical navigation. |

Modes:

- **edit** — read/write the related-term locators; add via the thesaurus/autocomplete picker, remove via the delete-link buttons. Calculated back-references are attached to the item (`item.references`) so bidirectional/multidirectional associations are visible.
- **list / tm** — read-only listing of resolved term labels; `tm` (Time Machine) reuses the list render and, in the controller, injects `parent_tipo` / `parent_section_id` into each subdata item.
- **search** — builds an SQO filter input. Reference calculation is **skipped** in search mode (`if ($mode!=='search')`).

DOM follows the portal structure: `wrapper_component component_relation_related <tipo> <mode>` (the CSS hook is `.component_relation_related.view_default > .content_data`, defined in `css/component_relation_related.less`).

## Import / export model

`component_relation_related` uses the shared related-data import/export model (inherited from `component_relation_common`).

**Import.** `conform_import_data()` accepts the same forms as [component_portal](component_portal.md):

- The default **locator JSON** (the component's own data shape):

```json
[{"type":"dd89","type_rel":"dd620","section_id":"2","section_tipo":"test3","from_component_tipo":"test54"}]
```

- A **number sequence of `section_id`** when the target section is unambiguous (a single resolvable `target_section_tipo`):

```json
2,5,8
```

- With multiple target sections, the target is declared in the CSV column name as `<component_tipo>_<target_section_tipo>` (e.g. `test54_test3`). The column name is split on the locator delimiter; the first segment is treated as the `from_component_tipo` and is **forced to the current component's `tipo`** if it does not match (so a human-friendly column header like `related_test3` still resolves). An empty cell is valid and clears the existing data. Ambiguous multi-target imports without a clear target are rejected and logged as `IGNORED`.

See [importing data — Related data](../importing_data.md#related-data).

**Export.** `get_export_value()` / `get_grid_value()` iterate the locators and, per the `show.ddo_map`, instantiate each named child component against the target `section_id` / `section_tipo` to resolve the sub-columns (term labels, optionally with parents). For diffusion, related components override the output format: `$diffusion_output_format = ['sql' => 'json']`, so the locator array is emitted as JSON in SQL targets. See [exporting data](../exporting_data.md).

## Notes

- **Directionality is the differentiator.** Unidirectional (`dd620`) stores the link only on the originating side. Bidirectional (`dd467`) and multidirectional (`dd621`) compute back-references at read time: `get_references()` runs a search over the target section's `relations` for locators that point at the current `{section_tipo, section_id, from_component_tipo}`; `get_references_recursive()` walks the graph for multidirectional, guarding against cycles with the static `$references_recursive_resolved_cache` (a `section_tipo_section_id_lang` pseudo-locator set). This lets a *related* link be navigated from either term without writing two locators.
- **Reference labels.** `get_calculated_references(false)` resolves each back-reference to a display label via `component_relation_common::get_locator_value()` using the component's `request_config->show->ddo_map` and `fields_separator` (default `" | "`).
- **Sorting.** `get_sortable()` is overridden to `true`; `get_order_path()` builds the column-order path as `[self component, thesaurus term component (DEDALO_THESAURUS_TERM_TIPO)]` so list ordering keys on the resolved term.
- **Duplicate guard.** `public array $test_equal_properties = ['section_tipo','section_id','type','from_component_tipo']` defines locator equality for the add/de-dupe path.
- **Default tools.** A standard instance exposes `tool_propagate_component_data` and `tool_time_machine` in `context.tools` (read-only context).
- **Observers / observables.** No component-specific subscriptions ship in the class; observer/observable wiring, when needed, is configured in the ontology `properties` like any other component (see the [index](index.md) *Observers and observables* section).
- **Permissions.** Resolved via `get_component_permissions()` (0 none / 1 read / 2 read+write / 3 admin). The controller only resolves data when `permissions > 0`; saves require level >= 2 and are short-circuited when `save_to_database === false`.
- **Related components:** [component_portal](component_portal.md) (its client alias and generic-relation sibling), [component_select](component_select.md), [component_check_box](component_check_box.md), [component_radio_button](component_radio_button.md), [component_dataframe](component_dataframe.md), [component_input_text](component_input_text.md) (the typical target term component).
