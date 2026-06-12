# component_dataframe

## Overview

```json
{
    "could_be_translatable" : false,
    "is_literal": false,
    "is_related": true,
    "is_media": false,
    "extends": "component_portal",
    "modes": ["edit","list","tm"],
    "render_views" :[
        {
            "view"    : "default | mini | line",
            "mode"    : "edit | list"
        }
    ],
    "data": "object",
    "server_sample_data": {
        "relations":[
            {"type":"dd490","section_id":"3","section_tipo":"dd1706","id_key":2,"from_component_tipo":"dd560","main_component_tipo":"rsc217","id":1}
        ]
    },
    "value": "array of frame locators",
    "sample_value": [
        {"type":"dd490","section_id":"3","section_tipo":"dd1706","id_key":2,"from_component_tipo":"dd560","main_component_tipo":"rsc217","id":1}
    ]
}
```

## Definition

Component dataframe is an auxiliary relation component that extends INDIVIDUAL data items of a main component with **frame records**: uncertainty, qualifiers, or contextual information (in the spirit of Wikidata qualifiers and references).

**Why it exists.** The Dédalo data model stores values, but research data often needs statements *about* values: how certain is this date, who assigned this label, what is the source of this number. Putting that metadata inside the value itself would bloat every dato shape and break literal components; putting it in a free-standing record would lose the link to the specific value. The dataframe solves both: the frame content lives in a normal ontology-defined section (searchable, time-machine covered, diffusable like any record), and a small **pairing locator** ties each frame record to exactly one data item of the main component.

It works for relation main components (`component_portal`, `component_select`, `component_check_box`…) and for literal main components (`component_input_text`, `component_text_area`, `component_date`, `component_number`, `component_email`, `component_iri`).

!!! note "One frame slot, many pairings"
    A single `component_dataframe` instance (a *slot*, e.g. the IRI label slot `dd560`) holds the pairing locators for ALL items and even for several main components of the same record. Each instance built with a caller context only sees its own paired subset.

## How it works

### The pairing contract

Every value of every component carries a stable, server-minted item `id` (a per-component counter inside the section record). The dataframe pairs against that id:

```
main component data item              frame locator (relations container)
{ "id": 2, "iri": "https://..." } ←── { "type": "dd490", "id_key": 2,
                                        "main_component_tipo": "rsc217",
                                        "from_component_tipo": "dd560",
                                        "section_tipo": "dd1706", "section_id": "3" }
```

A frame locator matches a main item when these four properties agree (the *match predicate*):

| property | meaning |
|---|---|
| `type` | always `dd490` (`DEDALO_RELATION_TYPE_DATAFRAME`) — the positive marker that an entry is a frame pairing |
| `from_component_tipo` | the dataframe slot (which `component_dataframe` owns this frame) |
| `main_component_tipo` | the main component the frame extends |
| `id_key` | the main data item's `id` — **never** a target section_id, **never** an array index |

`section_tipo` / `section_id` of the locator point at the frame **target record** (where the frame fields actually live).

### Lifecycle

- **Create** — the user activates the frame button on a value: a new target record is created and the pairing locator saved. If the value is not persisted yet, pending changes are saved first (*save-then-attach*): ids are minted server-side only, atomically.
- **Update / reorder** — pairing is untouched: the item `id` is immutable and order-independent. Re-pointing a relation locator to another target also keeps its frame (the frame qualifies the *statement*, not the target).
- **Delete** — removing a main item cascades server-side: the paired frame locators are removed (for translatable literals, only when the id is gone from every language). Frame **target records survive** — the time machine needs them to render past states — and are reclaimed later by maintenance (see below), unless the ontology opts into `delete_policy: "delete_target"`.
- **Time machine** — frames are saved merged into the main component's TM row, so a TM snapshot always holds the full statement (value + frames).
- **Writes are caller-aware** — clearing the frames of one item never touches the sibling frames of other items sharing the slot.

## Data model

**Data:** `object`. Frame locators are stored in the section record's `relations` container, keyed by the dataframe slot tipo — exactly like any relation component.

**Value:** `array` of frame locators, or `null`.

**Storage** (record with one IRI value `id:2` paired with label record `dd1706:3`):

```json
{
   "relations": [
        {"type":"dd490","section_id":"3","section_tipo":"dd1706","id_key":2,"from_component_tipo":"dd560","main_component_tipo":"rsc217","id":1}
    ]
}
```

Note that the frame locator carries its **own** `id` (it is itself a data item of the dataframe component) — do not confuse it with `id_key`, the pairing key.

!!! warning "Legacy (pre-migration) shape"
    Data written before the v7 unification uses `section_id_key`/`section_tipo_key` instead of `type`+`id_key`, and relation mains were keyed by the TARGET record's section_id. All readers dual-read both shapes; the `7.0.1` update (`dataframe_v7_migration`) rewrites matrix data, time machine and activity log to the unified contract.

## Configuration

Enabling frames on a component instance is ontology configuration (no code):

**On the main component instance:**

`has_dataframe`

options: true | false

Activates the dataframe handling in the component's JSON controller and views.

```json
{
    "has_dataframe": true
}
```

The instance's request_config `show.ddo_map` must include a ddo pointing at the dataframe slot:

```json
{
    "source": {
        "request_config": [{
            "show": {
                "ddo_map": [
                    {"tipo": "dd560", "model": "component_dataframe", "parent": "self", "view": "line", "section_tipo": "rsc205"}
                ]
            }
        }]
    }
}
```

**On the dataframe slot node** (the `component_dataframe` ontology node): its portal request_config points at the frame **target section** (the section whose records hold the frame fields).

`dataframe.delete_policy`

options: `"unlink"` (default) | `"delete_target"`

With `unlink`, removing a main item only removes the pairing locators (target records survive for the time machine and are reclaimed by maintenance). With `delete_target` — for frame-private sections where an unlinked record is meaningless — the cascade also soft-deletes the unlinked target records (recoverable from the time machine).

```json
{
    "dataframe": {
        "delete_policy": "delete_target"
    }
}
```

## Examples

### Literal main: text with a source qualifier

A `component_input_text` (tipo `oh22`) with two values, the second one qualified by a frame stored in section `oh57`:

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

### Relation main: portal informant with a certainty frame

A `component_portal` (tipo `oh24`) pointing at person records, where the first link carries a frame:

```json
{
    "relations": [
        {"type":"dd151","section_id":"14","section_tipo":"rsc197","from_component_tipo":"oh24","id":1},
        {"type":"dd151","section_id":"20","section_tipo":"rsc197","from_component_tipo":"oh24","id":2},
        {"type":"dd490","section_id":"5","section_tipo":"ds1","id_key":1,"from_component_tipo":"oh115","main_component_tipo":"oh24","id":1}
    ]
}
```

The frame stays attached to portal row `id:1` even if that locator is later re-pointed to a different person record, and even when the same target is linked twice.

### component_iri labels

`component_iri` ships with a fixed label slot: each IRI row's `id` pairs with a label record in section `dd1706` through slot `dd560`. `resolve_title()` reads the paired label and falls back to the deprecated literal `title` property for unmigrated data.

## Import model

Components hosting frames export them alongside the dato inside the [dedalo_data wrapper](../importing_data.md#the-dataframe-envelope):

```json
{"dedalo_data": {"dato": [{"id":2,"value":"Second testimony","lang":"lg-eng"}], "dataframe": [{"type":"dd490","section_id":"12","section_tipo":"oh57","id_key":2,"from_component_tipo":"oh115","main_component_tipo":"oh22"}]}}
```

On import the dato is saved as usual, then the frames are written replacing the component's previous frames in each slot (frames of other components sharing the slot are preserved). A `{"dedalo_data":{"dataframe":[...]}}` envelope without `dato` writes only the frames. Explicit item ids round-trip, which is what keeps `id_key` valid across export/import.

## Diffusion

Two opt-in mechanisms:

- On the **main component's** diffusion ddo: `"fn": "get_diffusion_data_with_dataframe"` publishes the data items with their paired frame locators attached as a `dataframe` property, joined by item id.
- A **`component_dataframe` ddo** in the diffusion map (with `parent` set to the main component tipo) publishes the parent-scoped frame locators; the chain processor recursion follows them into the frame target section records.

## Maintenance and migration

- **Migration** — the `7.0.1` update block runs `dataframe_v7_migration`: re-keys legacy locators to the unified contract across matrix tables, time machine (resolved row-locally, since TM rows store main + frames merged) and activity log. Idempotent, batched, dry-run capable; ambiguous pairings attach to the first match and are reported; unresolvable entries stay legacy (dual-read) and are reported.
- **Integrity** — the `dataframe_control` widget in the maintenance area reports frame locators whose main item no longer exists (orphans) and frames pending migration, and can remove orphan locators (target records are never deleted there).
- **iri titles** — `materialize_iri_titles` converts deprecated literal `title` values into label frame records, then strips the property.
