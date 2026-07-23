# component_dataframe

> **Canonical contract (id_key cutover, 2026-06).** A frame pairs to **exactly one data item** of a "main" component via that item's stable server-minted `id`, stored on the frame locator as **`id_key`**, with the positive marker **`type = 'dd490'`** (`DEDALO_RELATION_TYPE_DATAFRAME` / JS `DATAFRAME_TYPE`). Frames live in the **same section record** as the main component, in the `relation` JSONB column under the dataframe component's tipo.
>
> **`id_key` is the single pairing key.** The legacy pair `section_id_key` / `section_tipo_key` has been removed from all live dataframe code. It survives ONLY at two edges: the **old-CSV import** (which accepts a pre-v7 `section_id_key` as the `id_key` source, then strips it) and the historical **v6→v7 data migration** (which converted all stored frames to the `id_key` shape, and the physical `matrix_time_machine.section_id_key` column it left behind). **Even the relation sibling-order is now an id_key dataframe** (see *Relation ordering*).

## The match predicate (single authority)

The client's `component_common/js/dataframe.js` finder and the server's `dataframeEntryMatches()` (`src/core/concepts/subdatum.ts`, consumed by `src/core/relations/dataframe.ts`) are the ONLY pairing matchers. A frame matches a caller when:

```text
el.type === 'dd490'
AND el.from_component_tipo  === <slot tipo>        (when the caller supplies one)
AND el.main_component_tipo  === caller.main_component_tipo
AND el.id_key               === caller.id_key       (the main item id)
```

`isDataframeEntry()` (`src/core/concepts/subdatum.ts`) detects a frame purely by `type === 'dd490'`.

## End-to-end data flow

```text
 MAIN COMPONENT (e.g. portal numisdata32, item id = 1, links → material1/3)
        │  the main item id (1) is the pairing key — never the target section_id (3)
        ▼
 CLIENT render
   relation main:  section_record built per portal entry → self.locator.id (=1)
                   section_record.js get_component_data(dataframe_id_key = self.locator.id)
   literal main:   dataframe.js attach_item_dataframe(item.id)
        │  → self.data.id_key = 1
        ▼
 CLIENT save   common.js create_source → source.caller_dataframe = { id_key:1, … }
               component_dataframe.js create_new_section / link_record → value.id_key = 1
        ▼
 SERVER  dd_core_api handler reads source.caller_dataframe off the request
                     → save_component.ts threads it through as callerDataframe (id_key only)
        ▼
   read:  full slot → filter by dataframeEntryMatches(caller)                 [id_key]
   save:  caller-aware merge (relations/dataframe.ts); stamp caller.id_key
          on additions                                                        [id_key]
        ▼
 PERSISTED frame: { type:'dd490', section_tipo, section_id, id_key:1,
                    from_component_tipo, main_component_tipo, id }
```

**Time machine:** the main component's save records a TM row under the **main** tipo whose data is `[main items] + [ALL frames, all slots]` merged together (the same array the main column stores, since a paired component's stored value already carries both). Preview and restore both split that row back apart with the shared `stripDataframeFramesFromTmMain()` (`src/core/tm_record/tm_record.ts`), which strips every dd490-marked frame entry so a frame can never leak into the main column. The `matrix_id` selects the snapshot.

## `section_id_key` / `section_tipo_key` — where they remain (de-confusion)

Both the dataframe pairing AND the relation sibling-ordering have moved to `id_key`. These property names now survive only at the edges — do not "clean them up" there:

| Bucket | What it is | Status |
|---|---|---|
| **A. Dataframe pairing** | the pre-v7 shape of this component | **Removed** → `id_key` |
| **B. relation_parent ordering** | the per-parent sibling sort order on a `component_number` (`section_map → thesaurus → order`) | **Converted** → the order is now a dataframe of the child's **parent-link locator**, paired by `id_key` (see *Relation ordering* below) |
| **Old-CSV import** | reading a pre-v7 export envelope | **Kept** — accepts `section_id_key` as the `id_key` source, then strips it on write |
| **C. matrix_time_machine `section_id_key` column** | a physical DB column from the old split-storage TM | To be dropped |
| **D. one-time upgrade code** | the historical v6→v7 data migration (incl. its own dual-read) | Ran once, before the cutover; not carried into the current update catalog |

## Overview

```json
{
    "could_be_translatable" : false,
    "is_literal"            : false,
    "is_related"            : true,
    "is_media"              : false,
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
    `component_dataframe` is a **related** component. On the client it is an **alias** of `component_portal` (`export const component_dataframe = component_portal`) with a few dataframe-specific additions (`create_new_section`, `get_rating`). Server-side it reuses the same shared portal engine: the descriptor `src/core/components/component_dataframe/descriptor.ts` registers `resolveData: 'portal'` (`src/core/relations/models/portal.ts`), so it gets the whole related-component contract ([locator](../locator.md) storage in the section `relations` container, `from_component_tipo` filtering, grid/export/diffusion resolution) from the shared relation engines, and adds one purpose of its own: pairing **frame records** to individual data items of another component. The id_key pairing/merge algebra itself (not row emission) lives in `src/core/relations/dataframe.ts`.

!!! info "About `default_tools`"
    As for the portal model it shares, the toolbar is assembled from the model + ontology, never hardcoded — the concrete list should be verified per instance in the ontology. A dataframe slot is non-translatable, so it never receives `tool_lang` / `tool_lang_multi`. In practice the frame editing surface is the **target section opened in a modal**, so most of the per-item tooling lives on the target record, not on the dataframe button. `tool_time_machine` is the only tool guaranteed by the verified source in this checkout (`tools/tool_time_machine`).

## Definition

`component_dataframe` is an auxiliary relation component that extends INDIVIDUAL data items of a **main component** with **frame records**: uncertainty, qualifiers, sources, or contextual information (in the spirit of Wikidata qualifiers and references).

**Why it exists.** The Dédalo data model stores values, but research data often needs statements *about* values: how certain is this date, who assigned this label, what is the source of this number, what is the confidence rating of this attribution. Putting that metadata inside the value itself would bloat every data shape and break literal components; putting it in a free-standing record would lose the link to the specific value. The dataframe solves both: the frame content lives in a normal ontology-defined section (searchable, time-machine covered, diffusable like any record), and a small **pairing locator** ties each frame record to exactly one data item of the main component.

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
    A single `component_dataframe` instance (a *slot*, e.g. the IRI label slot `dd560`) holds the pairing locators for ALL items, and even for several main components of the same record. When a caller context is supplied, the read filters the section-wide relations bag down to just the entries matching that caller (the *match predicate* below); without one, the whole slot is returned.

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

A frame locator matches a main item when these four properties agree (the *match predicate*, `dataframeEntryMatches()`, `src/core/concepts/subdatum.ts`):

| property | meaning |
|---|---|
| `type` | always `dd490` (`DEDALO_RELATION_TYPE_DATAFRAME`) — the positive marker that an entry is a frame pairing |
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
    Data written before the v7 unification used `section_id_key` / `section_tipo_key` instead of `type` + `id_key`, and relation mains were keyed by the TARGET record's section_id. **Dual-read has been removed**: readers and the match predicate (`dataframeEntryMatches`, `isDataframeEntry`) recognise only the `type` + `id_key` shape. A database still carrying that legacy shape needed a one-time re-key of matrix data, time machine and the activity log to the unified contract before the cutover; an unmigrated legacy frame won't pair (it simply won't render). The only remaining tolerance for a legacy *input* shape is the **old-CSV import**, which accepts a pre-v7 export's `section_id_key` as the `id_key` source and strips the legacy keys on write.

### Lifecycle

- **Create** — the user activates the frame button on a value: a new target record is created (`create_new_section`) and the pairing locator saved. If the value is not persisted yet, pending changes are saved first (*save-then-attach*, single-writer rule): ids are minted server-side only, atomically, then the attach is repeated against the real id.
- **Update / reorder** — pairing is untouched: the item `id` is immutable and order-independent. Re-pointing a relation locator to another target also keeps its frame (the frame qualifies the *statement*, not the target).
- **Delete** — removing a main item cascades server-side: `removeDataframeDataById()` (`src/core/relations/save.ts`), wired into the component save path for a removed item, strips the paired frame locators from every dataframe slot declared on the main component. Frame **target records survive by default** — the time machine needs them to render past states — and are reclaimed later by maintenance, unless the ontology opts into `dataframe.delete_policy: "delete_target"` (which soft-deletes the unlinked targets instead). The same cascade runs for inverse-reference cleanup when a whole record is deleted (`src/core/section/record/delete_record.ts`).
- **Time machine** — frames are saved merged into the main component's TM row, so a TM snapshot always holds the full statement (value + frames); `stripDataframeFramesFromTmMain()` (`src/core/tm_record/tm_record.ts`) splits them back apart for preview and restore.
- **Writes are caller-aware** — the save path preserves the sibling frames of other items sharing the slot (`filterCallerEntries()`/`mergeCallerEntries()`, `src/core/relations/dataframe.ts`), so clearing the frames of one item never wipes another item's frames.

## Ontology instantiation

A `component_dataframe` is created as an ontology node whose `model` is `component_dataframe`. Its `parent` is normally the **main component** it extends; its portal `request_config` points at the frame **target section** (the section whose records hold the frame fields). Like the portal model it shares, it is non-translatable, so its language is `lg-nolan`.

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

1. On the **main component instance**, the flag `has_dataframe: true`. **Required for literal mains** (input_text, text_area, date, number, email): the literal's JSON controller reads it (to add the RQO + build the subdatum) and its views call `attach_item_dataframe`, which no-ops without it. **Relation mains (portal, autocomplete, select…) ignore the flag** — they render each linked record as a `section_record`, so the slot ddo in `show.ddo_map` (step 2) is enough. A relation dataframe therefore works with no `has_dataframe`; a literal one does not — see *has_dataframe* below.
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

At construction the dataframe instance is created with a **caller_dataframe** object (carrying `id_key` / `main_component_tipo` for the item it is paired with); this context is expected in non-search modes. `section_tipo` / `parent` of the *target* records are not the dataframe node's own section; persistence still flows through the main record's section (the single database writer), with the frame locators living in that record's `relations` container.

## Properties & options

Dataframe configuration is split across two nodes: a flag on the **main component**, and a block on the **dataframe slot node**. All live in the ontology `properties` JSON.

### has_dataframe *(on the main component)*

- **Values:** `true` | `false` (default `false`).
- **Effect:** activates dataframe handling for the *main* component's data. When set, the read path (`src/core/section/read.ts`, the `has_dataframe` branch) adds the RQO to the context and builds the per-item frame subdatum, and the edit/list views attach the dataframe control per value item. This is what makes the frame button appear next to each value.
- **Literal vs relation (important).** The flag is **only consulted by literal mains**. A **relation main** (portal, autocomplete, select, check_box…) activates its dataframe purely from the `component_dataframe` ddo in `show.ddo_map` (rendered through the `section_record` path) and never reads `has_dataframe`. So a working relation dataframe with no flag is **not** a template for a literal — the literal needs the flag or its button never renders. Must be boolean `true` (`===true`); `"true"` / `1` will not pass the strict-typed controllers.

### dataframe.delete_policy *(on the dataframe slot node)*

- **Values:** `"unlink"` (default) | `"delete_target"`. Read from `properties.dataframe.delete_policy` by `removeDataframeDataById()` (`src/core/relations/save.ts`) when a paired main item is deleted.
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

### source *(the shared portal contract)*

- **Values:** the standard portal `source` / `request_config` object.
- **Effect:** on a dataframe slot node, `source.request_config.sqo.section_tipo[0]` names the frame **target section** that `create_new_section` will create records in and open in the modal. The `show.ddo_map` resolves how the frame target is summarised. See [component_portal](component_portal.md) for the full portal `source` contract.

### role: "rating" *(ddo-level, in the slot request_config)*

- **Values:** set `"role": "rating"` on a ddo inside the slot's `request_config.hide.ddo_map`, pointing at a [component_radio_button](component_radio_button.md) in the target section.
- **Effect:** the client resolves that component's value against its datalist and paints the frame button with the rating's colour (and contrast-aware text colour). Used to surface a confidence/quality rating directly on the frame button without opening the modal. The ddo lives in `hide` so the rating is fetched for display only.

### Worked example — uncertainty rating on a literal

Complete ontology config to add a coloured "uncertainty" rating to each value of a **literal** main.
Tipos here are placeholders: literal main `lit5` in section `lit5_section`, dataframe slot `lit5_df`,
frame target section `unc1` holding a `component_radio_button` `unc_rating` (with a colour datalist).

**1. Main literal instance** (`lit5`) — the activation flag plus the slot ddo:

```json
{
    "properties": {
        "has_dataframe": true,
        "source": {
            "request_config": [{
                "show": {
                    "ddo_map": [
                        {"tipo": "lit5_df", "model": "component_dataframe", "parent": "self", "view": "default", "section_tipo": "lit5_section"}
                    ]
                }
            }]
        }
    }
}
```

**2. Dataframe slot node** (`lit5_df`) — points its portal at the frame target section (`unc1`), and
declares the rating ddo in `hide.ddo_map`:

```json
{
    "model": "component_dataframe",
    "parent": "lit5",
    "properties": {
        "source": {
            "mode": "list",
            "request_config": [{
                "sqo": { "section_tipo": [{"tipo": "unc1"}] },
                "show": {
                    "ddo_map": [
                        {"tipo": "unc_label", "model": "component_input_text", "parent": "self", "section_tipo": "self", "view": "text"}
                    ],
                    "fields_separator": ", "
                },
                "hide": {
                    "ddo_map": [
                        {"tipo": "unc_rating", "model": "component_radio_button", "role": "rating", "parent": "self", "section_tipo": "self"}
                    ]
                }
            }]
        }
    }
}
```

**3. Frame target section** (`unc1`) contains the `component_radio_button` `unc_rating` whose **datalist
options carry the colours** (the option provides the hex the client paints onto the button).

**4. Result** — open a `lit5_section` record in edit: each text value shows a round rating button; click
it to create/open the `unc1` frame record and pick a rating; the button takes that colour. The same
button also renders in **read-only** contexts — Time Machine previews and read-only users (the literal
edit views attach the dataframe in both the writable and read-only render branches).

!!! note "Standard context properties"
    Like every component, `component_dataframe` honours the generic ontology context blocks carried into the datum `context`: `css`, `request_config` (RQO) and `view`. Any other custom key seen in production should be verified in the ontology.

!!! warning "Deprecated"
    `component_iri` shipped a literal `title` property that stored the IRI label inline; it is **deprecated** in favour of the `dd560` label dataframe slot. Title resolution still falls back to that literal for unmigrated data. A maintenance conversion that turns those literals into label frame records and strips the property has no confirmed implementation in this checkout.

## Render views & modes

The dataframe surface is intentionally minimal: a small button per value item. Views are dispatched by the per-mode render files; only the `list` render files ship (`view_default_list_dataframe.js`, `view_mini_list_dataframe.js`) because the button is rendered in both edit and list contexts of the *main* component.

| View | edit | list / tm | Notes |
| --- | :---: | :---: | --- |
| `default` | yes | yes | Round `button.activate` showing `properties.label` (or `?`). With no frame yet, first interaction reveals a `button.add` (the `+`) that creates the target record; with a frame, it opens the target section in a modal. |
| `mini` | yes | yes | Same button rendered inside a `component_dataframe_mini` wrapper for tight spaces (e.g. inline next to a value). No add/modal chrome beyond the button. |
| `line` | yes | yes | Inline variant; used by `component_iri`, where the dataframe button sits inside a `column_component_dataframe` next to the IRI's input. |

Modes:

- **edit** — read/write through the main record. The button creates target records (`create_new_section`) and opens them in a modal (`open_target_section`); the modal footer offers a soft delete that calls `unlink_record()`. **Read-only edit render** (`permissions === 1`) still shows the (read-only) button: the literal edit views attach the dataframe in *both* the writable (`get_content_value`) and read-only (`get_content_value_read`) branches. The **Time Machine** tool uses exactly this path — it renders the main component in edit mode with `permissions = 1` (`render_tool_time_machine.js`), so the historical rating shows in the TM preview.
- **list / tm** — read-only; the same button renders, coloured by the rating ddo when present. In `tm` (Time Machine) the frames are read from the merged TM row (the TM tool also drives the *edit*-mode read-only preview described above).
- **search** — there is no dedicated search render view; the JSON controller tolerates `search` mode (it does not require a caller_dataframe there) but the component is not a primary search input. Search over frame *content* is done on the target section.

DOM (list / default): `wrapper_component component_dataframe <tipo> <mode>` -> `content_data` -> `content_value` -> `span.button.activate` (+ optional `span.button.add.icon`).

## Import / export model

**Export.** A component that hosts frames exports them alongside its data inside the [dedalo_data wrapper](../importing_data.md). `buildRawCell()` (`src/diffusion/export/grid.ts`) collects the slot's frame locators via `getDataframeChildTipos()` and emits them next to the value:

```json
{"dedalo_data": {"data": [{"id":2,"value":"Second testimony","lang":"lg-eng"}], "dataframe": [{"type":"dd490","section_id":"12","section_tipo":"oh57","id_key":2,"from_component_tipo":"oh115","main_component_tipo":"oh22"}]}}
```

Explicit item ids round-trip, which is exactly what keeps `id_key` valid across an export/import cycle.

**Import.** `unwrapDedaloData()` (`src/core/tools/import_data.ts`) already parses the `{"dedalo_data":{"data":…, "dataframe":[...]}}` envelope and extracts the frame array as a distinct field, including the case of a `dataframe`-only envelope with no `data`.

!!! warning "Gap: extracted frames are not written"
    The CSV import driver (`src/core/tools/import_csv.ts`) and the import executor (`src/core/tools/import_execute.ts`) do not consume the `dataframe` field `unwrapDedaloData()` extracts — the frames are parsed out of the envelope and then dropped. Writing them (replacing the component's previous frames per slot, preserving frames of other components sharing the same slot, and accepting a pre-v7 export's `section_id_key` as the `id_key` source) has no confirmed port in this checkout. Only the main `data` half of the envelope round-trips today.

See [importing data](../importing_data.md) and [exporting data](../exporting_data.md).

## Relation ordering (the order is a dataframe)

The sibling sort order of `component_relation_parent` children is itself a dataframe, paired by `id_key` like everything else — there are no exceptions to the contract.

- **What stores it.** A section that participates in ordered hierarchies declares an order component (`section_map → thesaurus → order`, a `component_number`). A child's position under one parent is a single value item of that order component.
- **The pairing key.** The order value pairs by `id_key` = the **id of the child's parent-link locator** (the entry in the child's `component_relation_parent` that points at this parent). A different parent means a different parent-link locator, a different `id`, and therefore an independent order. Stored shape: `{ value, id_key }` (the old `{ value, section_tipo_key, section_id_key }` is retired).
- **Inline helpers.** `src/core/relations/dataframe.ts` exposes the id_key-keyed accessors `getInlineDataByIdKey()`, `addInlineValueByIdKey()`, `removeInlineByIdKey()`, `getInlineValueByIdKey()`, `updateInlineValueByIdKey()`.
- **Writing.** Adding a parent link pre-allocates the parent locator's `id` before the order value is stamped, so the order can pair before the save mints ids; removing a parent resolves the id from the stored locator. Sorting and sibling-order recalculation resolve each child's parent-link id via `resolveParentLinkIdKey()` (`src/core/relations/children.ts`).
- **Reading (list order).** Because `id_key` differs per child, the order cannot be a single constant JSONB predicate. `resolveParentLinkIdKey()` resolves each child's `id_key` + order value, and the children engine (`src/core/relations/children.ts`) applies the order as a stable ascending in-process sort (children without an order value sink last) — rather than pushing a precomputed `array_position(...)` ordering into SQL, so paging a very large sibling set costs a full-child-list read.

## Notes

- **Diffusion.** Two opt-in mechanisms:
    - On the **main component's** diffusion ddo, an opt-in flag publishes the data items with their paired frame locators attached as a `dataframe` property, joined by item id.
    - A **`component_dataframe` ddo** in the diffusion map (with `parent` set to the main component tipo) publishes the parent-scoped frame locators; the chain processor recursion follows them into the frame target section records. Published locators carry `id_key` as the join key. See the *dedalo-diffusion* skill.
- **Maintenance.** The `dataframe_control` widget (`src/core/area_maintenance/widgets/dataframe_control.ts`) scans for frame locators whose main item no longer exists (orphans), reporting up to 500 in detail, and can remove them in place (target records are never deleted by this scan).
- **Observers / observables.** Not used by the dataframe button itself; observer/observable wiring, when needed, is configured in the ontology `properties` like any other component (see the index page *Observers and observables* section).
- **component_iri integration.** `component_iri` ships with a fixed label slot: each IRI row's `id` pairs with a label record in target section `dd1706` through slot `dd560`. The IRI's title resolution reads the paired label and falls back to a deprecated literal `title` property for unmigrated data.
- **Security.** Follows the same relation-component persistence rules as every other relation model; direct, unauthenticated access fails closed.
- **Related components:** [component_portal](component_portal.md) (the shared portal engine on the server, the client alias in the browser), [component_iri](component_iri.md) (built-in label dataframe), [component_input_text](component_input_text.md), [component_text_area](component_text_area.md), [component_date](component_date.md), [component_number](component_number.md), [component_email](component_email.md), [component_select](component_select.md), [component_check_box](component_check_box.md), [component_radio_button](component_radio_button.md).