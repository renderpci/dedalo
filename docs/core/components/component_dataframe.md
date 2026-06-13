# component_dataframe

## Overview

```json
{
    "could_be_translatable" : false,
    "is_literal"            : false,
    "is_related"            : true,
    "is_media"              : false,
    "extends"               : "component_portal",
    "modes"                 : ["edit","list","tm"],
    "default_tools"         : [
        "tool_time_machine"
    ],
    "render_views" :[
        {
            "view" : "default | mini | line",
            "mode" : "edit | list"
        }
    ],
    "data"        : "array of frame locators",
    "sample_data" : [
        {"type":"dd490","section_id":"3","section_tipo":"dd1706","id_key":2,"from_component_tipo":"dd560","main_component_tipo":"rsc217","id":1}
    ],
    "value"        : "array of frame locators",
    "sample_value" : [
        {"type":"dd490","section_id":"3","section_tipo":"dd1706","id_key":2,"from_component_tipo":"dd560","main_component_tipo":"rsc217","id":1}
    ]
}
```

!!! note "Typology"
    `component_dataframe` is a **related** component. In server context the class is a thin subclass of [component_portal](component_portal.md) (`class component_dataframe extends component_portal`), which extends `component_relation_common` and finally `component_common`. In client context it is an **alias** of `component_portal` (`export const component_dataframe = component_portal`) extended with a few dataframe-specific methods (`create_new_section`, `get_rating`). It therefore inherits the whole related-component contract — [locator](../locator.md) storage in the section `relations` container, `from_component_tipo` filtering, grid/export/diffusion resolution — and specialises it for one purpose: pairing **frame records** to individual data items of another component.

!!! info "About `default_tools`"
    Like its portal base, the toolbar is assembled from the model + ontology, not hardcoded by the class — the concrete list should be verified per instance in the ontology. A dataframe slot is non-translatable, so it never receives `tool_lang` / `tool_lang_multi`. In practice the frame editing surface is the **target section opened in a modal**, so most of the per-item tooling lives on the target record, not on the dataframe button. `tool_time_machine` is the only tool guaranteed by the verified source in this checkout (`tools/tool_time_machine`).

## Definition

`component_dataframe` is an auxiliary relation component that extends INDIVIDUAL data items of a **main component** with **frame records**: uncertainty, qualifiers, sources, or contextual information (in the spirit of Wikidata qualifiers and references).

**Why it exists.** The Dédalo data model stores values, but research data often needs statements *about* values: how certain is this date, who assigned this label, what is the source of this number, what is the confidence rating of this attribution. Putting that metadata inside the value itself would bloat every dato shape and break literal components; putting it in a free-standing record would lose the link to the specific value. The dataframe solves both: the frame content lives in a normal ontology-defined section (searchable, time-machine covered, diffusable like any record), and a small **pairing locator** ties each frame record to exactly one data item of the main component.

**When to use it.** Reach for a dataframe when you need to qualify *specific values*, not the whole record:

- An attribution that is uncertain only for the *second* of three authors, while the others are certain.
- A source/footnote that documents one particular reading of an inscription among several.
- A confidence *rating* on one of many proposed datings of an object.
- An IRI whose human-readable *label* must be stored and versioned (the built-in `component_iri` label slot).

It works for relation main components ([component_portal](component_portal.md), [component_select](component_select.md), [component_check_box](component_check_box.md), …) and for literal main components ([component_input_text](component_input_text.md), [component_text_area](component_text_area.md), [component_date](component_date.md), [component_number](component_number.md), [component_email](component_email.md), [component_iri](component_iri.md)).

**When not to use it.**

- To qualify the *whole record* (its state, its global source) -> use ordinary components in the section.
- To link the record to another record without per-item metadata -> use [component_portal](component_portal.md) directly.
- To store a value that every cataloguer types inline -> use the appropriate literal component; only add a dataframe when item-level metadata is genuinely needed.

!!! note "One frame slot, many pairings"
    A single `component_dataframe` instance (a *slot*, e.g. the IRI label slot `dd560`) holds the pairing locators for ALL items, and even for several main components of the same record. Each instance built with a *caller context* only sees its own paired subset; `get_data()` filters the section-wide relations bag down to the entries matching the caller. `get_data_unfiltered()` returns the whole slot.

## Data model

**Data type:** `array of frame locators` stored in the section record's `relations` container, keyed by the dataframe slot tipo — exactly like any relation component.

**Value type:** `array` of frame locators, or `null`.

### The pairing contract

Every value of every component carries a stable, server-minted item `id` (a per-component counter inside the section record). The dataframe pairs against that id, not against array position and not against the target record:

```text
main component data item              frame locator (relations container)
{ "id": 2, "iri": "https://..." } ←── { "type": "dd490", "id_key": 2,
                                        "main_component_tipo": "rsc217",
                                        "from_component_tipo": "dd560",
                                        "section_tipo": "dd1706", "section_id": "3" }
```

A frame locator matches a main item when these four properties agree (the *match predicate*, `trait.dataframe_common::dataframe_entry_matches()`):

| property | meaning |
|---|---|
| `type` | always `dd490` (`DEDALO_RELATION_TYPE_DATAFRAME`, `core/base/dd_tipos.php`) — the positive marker that an entry is a frame pairing |
| `from_component_tipo` | the dataframe slot (which `component_dataframe` owns this frame) |
| `main_component_tipo` | the main component the frame extends |
| `id_key` | the main data item's `id` — **never** a target section_id, **never** an array index |

`section_tipo` / `section_id` of the locator point at the frame **target record** (where the frame fields actually live).

### Storage shape

Record with one IRI value `id:2` paired with label record `dd1706:3`, through slot `dd560`, extending main component `rsc217`:

```json
{
   "relations": [
        {"type":"dd490","section_id":"3","section_tipo":"dd1706","id_key":2,"from_component_tipo":"dd560","main_component_tipo":"rsc217","id":1}
    ]
}
```

Note that the frame locator carries its **own** `id` (it is itself a data item of the dataframe component) — do not confuse it with `id_key`, the pairing key.

**Literal main: text with a source qualifier.** A [component_input_text](component_input_text.md) (tipo `oh22`) with two values, the second one qualified by a frame stored in target section `oh57`:

```json
{
    "string": {
        "oh22": [
            {"id": 1, "lang": "lg-eng", "value": "First testimony"},
            {"id": 2, "lang": "lg-eng", "value": "Second testimony"}
        ]
    },
    "relations": [
        {"type":"dd490","section_id":"12","section_tipo":"oh57","id_key":2,"from_component_tipo":"oh115","main_component_tipo":"oh22","id":1}
    ]
}
```

The edit view renders the frame button next to the second value; reordering or editing the values never breaks the pairing because it follows `id:2`, not the position.

**Relation main: portal informant with a certainty frame.** A [component_portal](component_portal.md) (tipo `oh24`) pointing at person records, where the first link carries a frame:

```json
{
    "relations": [
        {"type":"dd151","section_id":"14","section_tipo":"rsc197","from_component_tipo":"oh24","id":1},
        {"type":"dd151","section_id":"20","section_tipo":"rsc197","from_component_tipo":"oh24","id":2},
        {"type":"dd490","section_id":"5","section_tipo":"ds1","id_key":1,"from_component_tipo":"oh115","main_component_tipo":"oh24","id":1}
    ]
}
```

The frame stays attached to portal row `id:1` even if that locator is later re-pointed to a different person record, and even when the same target person is linked twice.

!!! warning "Legacy (pre-migration) shape"
    Data written before the v7 unification uses `section_id_key` / `section_tipo_key` instead of `type` + `id_key`, and relation mains were keyed by the TARGET record's section_id. All readers **dual-read** both shapes (the match predicate and `$test_equal_properties` cover both); the `7.0.1` update (`dataframe_v7_migration`) rewrites matrix data, time machine and activity log to the unified contract. Until then, unmigrated entries keep working through dual-read.

### Lifecycle

- **Create** — the user activates the frame button on a value: a new target record is created (`create_new_section`) and the pairing locator saved. If the value is not persisted yet, pending changes are saved first (*save-then-attach*, single-writer rule): ids are minted server-side only, atomically, then the attach is repeated against the real id.
- **Update / reorder** — pairing is untouched: the item `id` is immutable and order-independent. Re-pointing a relation locator to another target also keeps its frame (the frame qualifies the *statement*, not the target).
- **Delete** — removing a main item cascades server-side (`trait.dataframe_common::remove_dataframe_data_by_id()`): the paired frame locators are removed (for translatable literals, only when the id is gone from every language). Frame **target records survive by default** — the time machine needs them to render past states — and are reclaimed later by maintenance, unless the ontology opts into `dataframe.delete_policy: "delete_target"`.
- **Time machine** — frames are saved merged into the main component's TM row (`get_time_machine_data_to_save()`), so a TM snapshot always holds the full statement (value + frames).
- **Writes are caller-aware** — `set_data()` preserves the sibling frames of other items sharing the slot, so clearing the frames of one item never wipes another item's frames.

## Ontology instantiation

A `component_dataframe` is created as an ontology node whose `model` is `component_dataframe`. Its `parent` is normally the **main component** it extends; its portal `request_config` points at the frame **target section** (the section whose records hold the frame fields). Because it is a portal subclass it is non-translatable, so its language is `lg-nolan`.

Node definition (shape):

```json
{
    "tipo"         : "oh115",
    "model"        : "component_dataframe",
    "parent"       : "oh22",
    "section_tipo" : "oh1",
    "lg-eng"       : "Source frame",
    "lg-spa"       : "Marco de fuente",
    "translatable" : false,
    "properties"   : { }
}
```

Realistic `properties` block for the dataframe slot node — a portal `source` whose `sqo.section_tipo` is the frame target section, plus the optional delete policy:

```json
{
    "source": {
        "mode": "list",
        "request_config": [{
            "sqo": {
                "section_tipo": [{"tipo": "oh57"}]
            },
            "show": {
                "ddo_map": [
                    {"tipo": "oh58", "model": "component_input_text", "parent": "self", "section_tipo": "self", "view": "text"}
                ],
                "fields_separator": ", "
            }
        }]
    },
    "dataframe": {
        "delete_policy": "delete_target"
    }
}
```

**Wiring it into a main component.** Two things must be present:

1. On the **main component instance**, the flag `has_dataframe: true` (read by the main component's own JSON controller and views via `trait.dataframe_common`).
2. The main instance's `request_config` `show.ddo_map` must include a ddo pointing at the dataframe slot, so the subdatum builder knows which frame slot to attach per value item:

```json
{
    "source": {
        "request_config": [{
            "show": {
                "ddo_map": [
                    {"tipo": "oh115", "model": "component_dataframe", "parent": "self", "view": "line", "section_tipo": "oh1"}
                ]
            }
        }]
    }
}
```

At construction the dataframe instance is created with a **caller_dataframe** object (carrying `id_key` / `main_component_tipo` for the item it is paired with). The JSON controller (`component_dataframe_json.php`) treats this as mandatory in non-search modes and logs an error if it is missing. `section_tipo` / `parent` of the *target* records are not the dataframe node's own section; persistence still flows through the main record's section (the single database writer), with the frame locators living in that record's `relations` container.

## Properties & options

Dataframe configuration is split across two nodes: a flag on the **main component**, and a block on the **dataframe slot node**. All live in the ontology `properties` JSON.

### has_dataframe *(on the main component)*

- **Values:** `true` | `false` (default `false`).
- **Effect:** activates dataframe handling in the *main* component's JSON controller and views. When set, the controller adds the RQO to the context, `trait.dataframe_common::build_dataframe_subdatum()` builds the per-item frame subdatum, and the edit/list views attach the dataframe control per value item. This is what makes the frame button appear next to each value. See the *dedalo-dataframe* skill.

### dataframe.delete_policy *(on the dataframe slot node)*

- **Values:** `"unlink"` (default) | `"delete_target"`. Read by `trait.dataframe_common::get_dataframe_delete_policy()` from `properties->dataframe->delete_policy`.
- **Effect:** controls what happens to frame **target records** when a paired main item is deleted.
    - `unlink` — only the pairing locators are removed; the target records survive (the time machine needs them) and are reclaimed later by maintenance.
    - `delete_target` — for frame-private sections where an unlinked record is meaningless, the cascade also **soft-deletes** the unlinked target records (recoverable from the time machine).

```json
{
    "dataframe": {
        "delete_policy": "delete_target"
    }
}
```

### source *(inherited from component_portal)*

- **Values:** the standard portal `source` / `request_config` object.
- **Effect:** on a dataframe slot node, `source.request_config.sqo.section_tipo[0]` names the frame **target section** that `create_new_section` will create records in and open in the modal. The `show.ddo_map` resolves how the frame target is summarised. See [component_portal](component_portal.md) for the full portal `source` contract.

### role: "rating" *(ddo-level, in the slot request_config)*

- **Values:** set `"role": "rating"` on a ddo inside the slot's `request_config.hide.ddo_map`, pointing at a [component_radio_button](component_radio_button.md) in the target section.
- **Effect:** the client `get_rating()` resolves that component's value against its datalist and paints the frame button with the rating's colour (and contrast-aware text colour). Used to surface a confidence/quality rating directly on the frame button without opening the modal. The ddo lives in `hide` so the rating is fetched for display only.

!!! note "Standard context properties"
    Like every component, `component_dataframe` honours the generic ontology context blocks carried into the datum `context`: `css`, `request_config` (RQO) and `view`. Any other custom key seen in production should be verified in the ontology.

!!! warning "Deprecated"
    `component_iri` shipped a literal `title` property that stored the IRI label inline; it is **deprecated** in favour of the `dd560` label dataframe slot. `resolve_title()` still falls back to it for unmigrated data, and `materialize_iri_titles` converts those literals into label frame records and strips the property.

## Render views & modes

The dataframe surface is intentionally minimal: a small button per value item. Views are dispatched by the per-mode render files; only the `list` render files ship (`view_default_list_dataframe.js`, `view_mini_list_dataframe.js`) because the button is rendered in both edit and list contexts of the *main* component.

| View | edit | list / tm | Notes |
| --- | :---: | :---: | --- |
| `default` | yes | yes | Round `button.activate` showing `properties.label` (or `?`). With no frame yet, first interaction reveals a `button.add` (the `+`) that creates the target record; with a frame, it opens the target section in a modal. |
| `mini` | yes | yes | Same button rendered inside a `component_dataframe_mini` wrapper for tight spaces (e.g. inline next to a value). No add/modal chrome beyond the button. |
| `line` | yes | yes | Inline variant; used by `component_iri`, where the dataframe button sits inside a `column_component_dataframe` next to the IRI's input. |

Modes:

- **edit** — read/write through the main record. The button creates target records (`create_new_section`) and opens them in a modal (`open_target_section`); the modal footer offers a soft delete that calls `unlink_record()`.
- **list / tm** — read-only; the same button renders, coloured by the rating ddo when present. In `tm` (Time Machine) the frames are read from the merged TM row.
- **search** — there is no dedicated search render view; the JSON controller tolerates `search` mode (it does not require a caller_dataframe there) but the component is not a primary search input. Search over frame *content* is done on the target section.

DOM (list / default): `wrapper_component component_dataframe <tipo> <mode>` -> `content_data` -> `content_value` -> `span.button.activate` (+ optional `span.button.add.icon`).

## Import / export model

**Export.** A component that hosts frames exports them alongside its dato inside the [dedalo_data wrapper](../importing_data.md). `trait.dataframe_common::get_export_dataframe_data()` collects the slot's frame locators and they are emitted next to the value:

```json
{"dedalo_data": {"dato": [{"id":2,"value":"Second testimony","lang":"lg-eng"}], "dataframe": [{"type":"dd490","section_id":"12","section_tipo":"oh57","id_key":2,"from_component_tipo":"oh115","main_component_tipo":"oh22"}]}}
```

Explicit item ids round-trip, which is exactly what keeps `id_key` valid across an export/import cycle.

**Import.** On import the dato is saved as usual, then `import_dataframe_data()` writes the frames, replacing the component's previous frames in each slot (frames of *other* components sharing the slot are preserved). A `{"dedalo_data":{"dataframe":[...]}}` envelope without `dato` writes only the frames. See [importing data](../importing_data.md) and [exporting data](../exporting_data.md), and the *dedalo-import-data* / *dedalo-export* skills.

## Notes

- **Diffusion.** Two opt-in mechanisms:
    - On the **main component's** diffusion ddo, `"fn": "get_diffusion_data_with_dataframe"` (in `trait.dataframe_common`) publishes the data items with their paired frame locators attached as a `dataframe` property, joined by item id.
    - A **`component_dataframe` ddo** in the diffusion map (with `parent` set to the main component tipo) calls `get_diffusion_data()`, which publishes the parent-scoped frame locators; the chain processor recursion follows them into the frame target section records. Published locators carry `id_key` as the join key. See the *dedalo-diffusion* skill.
- **Maintenance and migration.**
    - The `7.0.1` update block runs `dataframe_v7_migration` (`core/base/upgrade/class.dataframe_v7_migration.php`): re-keys legacy locators to the unified contract across matrix tables, time machine (resolved row-locally, since TM rows store main + frames merged) and activity log. Idempotent, batched, dry-run capable; ambiguous pairings attach to the first match and are reported; unresolvable entries stay legacy (dual-read) and are reported.
    - The `dataframe_control` widget (`core/area_maintenance/widgets/dataframe_control/`) reports frame locators whose main item no longer exists (orphans) and frames pending migration, and can remove orphan locators (target records are never deleted there).
- **Observers / observables.** Not used by the dataframe button itself; observer/observable wiring, when needed, is configured in the ontology `properties` like any other component (see the index page *Observers and observables* section).
- **component_iri integration.** `component_iri` ships with a fixed label slot: each IRI row's `id` pairs with a label record in target section `dd1706` through slot `dd560`. `resolve_title()` reads the paired label and falls back to the deprecated literal `title` for unmigrated data.
- **Security.** Inherits the relation-component persistence flags; the JSON controller fails closed on direct HTTP access (SEC-026) and logs an error when the mandatory `caller_dataframe` is missing outside search mode.
- **Related components:** [component_portal](component_portal.md) (server base / client alias), [component_iri](component_iri.md) (built-in label dataframe), [component_input_text](component_input_text.md), [component_text_area](component_text_area.md), [component_date](component_date.md), [component_number](component_number.md), [component_email](component_email.md), [component_select](component_select.md), [component_check_box](component_check_box.md), [component_radio_button](component_radio_button.md).