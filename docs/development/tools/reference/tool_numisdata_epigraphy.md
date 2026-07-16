# tool_numisdata_epigraphy

Specialist workbench for transcribing the epigraphy of numismatic objects — legends, designs, symbols, marks and edge inscriptions — using an epigraphy thesaurus as a glyph picker feeding Unicode text components. UI-only — no remotely callable server methods.

## What it does / why & when to use it

Coin inscriptions are hard to transcribe: legends run along the rim in ancient or non-Latin scripts, and the exact glyphs (ligatures, retrograde letters, monograms, control marks) rarely exist on a keyboard. `tool_numisdata_epigraphy` lays out every epigraphic facet of a coin record side by side with an **epigraphy thesaurus** that supplies the glyphs, so a numismatist can build the transcription by picking characters rather than fighting an input method.

Concrete scenario: cataloguing a Roman provincial bronze, a numismatist opens the tool on the coin record. The left column shows the epigraphy thesaurus glyph picker; the right column exposes the coin's facets — obverse and reverse **legends**, **designs**, **symbols** and **marks**, plus **edge design** and **edge legend** — each as an autocomplete/portal component with a read-only text read-out mirroring its saved value, and a "Used in: N" badge showing how many records reference it. They select the obverse legend field, pick glyphs from the thesaurus into its Unicode text, and move to the countermark facet.

Use it for structured epigraphic transcription of coins and similar objects. For plain audiovisual/document transcription use [tool_transcription](tool_transcription.md); for arranging coins into collections and lots, see `tool_numisdata_order_coins`.

## How it works (server + client)

**Server.** `tools/tool_numisdata_epigraphy/` ships **no `server/` package** — there is no `server/index.ts`, so `dd_tools_api.tool_request` refuses any action named against this tool at the dispatch gate (`tool has no server module`). There is no `backgroundRunnable` and no lifecycle hook. All writes happen through the **components** the tool hosts (their own save paths), not through the tool.

**Client** (`tools/tool_numisdata_epigraphy/js/`). The instance is `tool_numisdata_epigraphy.js`; `render_tool_numisdata_epigraphy.js` builds the UI. Following the `tool_common` lifecycle:

- `init()` seeds the project languages and the source language from the caller.
- `build()` resolves each facet role from the tool's `ddo_map` into a live instance on `self[role]`, iterating the fixed role list:

  `coins`, `epigraphy`, `obverse_legend`, `reverse_legend`, `obverse_desing`, `reverse_desing`, `obverse_symbol`, `reverse_symbol`, `obverse_mark`, `reverse_mark`, `edge_desing`, `edge_legend`.

  A role absent from the ontology `ddo_map` is warned and skipped (non-fatal — the render layer null-guards every facet).

!!! note "`desing` is the ontology spelling"
    The design roles are spelled `obverse_desing` / `reverse_desing` / `edge_desing` in the `ddo_map` and in the code — a legacy spelling reproduced verbatim here. It is not a typo to "fix": renaming it would require a matching ontology migration.

`edit()` builds a two-column layout: the **left** column renders the `epigraphy` thesaurus component (the glyph picker); the **right** column renders up to ten portal/autocomplete facet sub-components (coins, legends, designs, symbols, marks, edge design/legend) each paired with a read-only text container that mirrors its current saved value. `update_text_nodes` keeps those read-outs in sync — it runs on the initial render and again whenever a facet component fires a `save_*` event via `event_manager`. Selecting a different coin reloads the facet components through `get_component(...)` (the previous instance is torn down via `to_delete_instances`).

The client makes two kinds of server call, and neither is an action of this tool:

- `get_relations({data, count})` — a `related_search` read (`count` action by default) that powers the "Used in: N" badge; on `count:false` it issues a `read` for full relation records.
- `get_user_tools(ar_requested_tools)` — the shared `dd_tools_api` `user_tools` action, returning the simple tool-context for each requested tool the user is authorized for.

## Actions & options

`tool_numisdata_epigraphy` exposes **no** API actions:

| `apiActions` | Notes |
| --- | --- |
| *(no server module)* | UI-only tool. No action is dispatchable through `dd_tools_api`. No `backgroundRunnable`, no lifecycle hook. |

The tool is configured entirely through the element's `tool_config.ddo_map` roles listed above; there are no user-set server options.

## How it is registered & surfaced

`tools/tool_numisdata_epigraphy/register.json` is a **column-keyed dump** (a seeded matrix-row snapshot); `importTools()` passes it through as-is (see [register.json reference](../register_json.md)). Essentials:

- `dd1326` name = `tool_numisdata_epigraphy`; `dd1327` version `2.0.1`; `dd1328` minimum Dédalo version `6.0.0`; `dd1644` developer = "Dédalo team".
- `dd799` label = *Epigraphic descriptions* (localized); `dd612` description = "Transcription of legends, countermarks of numismatic objects." (localized).
- `dd1354` **active** = dd64/1 (Yes).
- `dd1335` **properties** = `{ "open_as": "window", "windowFeatures": null }` — it opens in its own window.
- `dd1372` **labels**: `used_in`, read client-side via `get_tool_label(...)`.
- It carries **no** `dd1350` affected_tipos and **no** `dd1330` affected_models. `dd1331` **show_in_inspector**, `dd1332` **show_in_component** and `dd1333` **always_active** all point at dd64/2 (No).

Because there are no affected models/tipos and the show flags resolve to No, the tool does **not** attach by model or tipo matching, nor render through the standard inspector/component flags. It surfaces only where an element's `properties->tool_config` explicitly names it and provides the facet `ddo_map` — the configuration-driven surfacing path (`getElementTools`, `src/core/tools/registry.ts`). It opens as its own window.

## Examples

The tool is UI-only, so there is no `tool_request` to `tool_numisdata_epigraphy`. The "Used in" badge is a normal `related_search` `count` request:

```js
const rqo = {
    action  : 'count',
    source  : { action:'related_search', model:'section', tipo:data.section_tipo,
                section_tipo:data.section_tipo, section_id:data.section_id,
                lang:page_globals.dedalo_data_lang, mode:'related_list' },
    sqo     : { section_tipo:['all'], mode:'related',
                filter_by_locators:[{ section_tipo:data.section_tipo, section_id:data.section_id }] },
    retries : 5,
    timeout : 20 * 1000
}
const api_response = await data_manager.request({ body: rqo })
// → api_response.result: { total: N }   (count mode)
```

Facet roles are resolved from the `ddo_map` during `build()`:

```js
const roles = ['coins','epigraphy','obverse_legend','reverse_legend',
    'obverse_desing','reverse_desing','obverse_symbol','reverse_symbol',
    'obverse_mark','reverse_mark','edge_desing','edge_legend']
for (const role of roles) {
    const ddo = self.tool_config.ddo_map.find(el => el.role === role)
    if (!ddo) continue // role not configured → skipped (non-fatal)
    self[role] = self.ar_instances.find(el => el.tipo === ddo.tipo)
}
```

## Related

- `tool_numisdata_order_coins` — groups and sorts coins into collections and lots (numismatic sibling).
- [tool_transcription](tool_transcription.md) — general audiovisual/document transcription.
- [Creating new tools](../creating_tools.md) · [Server contract](../server_contract.md) — the UI-only, no-`server/`-package case; `ddo_map`-driven surfacing.
- Source: `tools/tool_numisdata_epigraphy/js/{tool_numisdata_epigraphy,render_tool_numisdata_epigraphy,index}.js`; `tools/tool_numisdata_epigraphy/register.json` (no `server/` package).
