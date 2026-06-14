# tool_indexation

Side-by-side workspace for indexing a transcription (rich-text) against the thesaurus: the cataloguer selects a text fragment, links it to a thesaurus term (or a person / media descriptor), and the tool stores the link as an inline tag plus a portal locator.

## What it does / why & when to use it

`tool_indexation` opens a dedicated window that puts a **transcription** (a `component_text_area`, ontology tipo `rsc36`) next to a **thesaurus tree** and an **indexing portal**, so a person can build semantic links between fragments of running text and controlled-vocabulary terms. The tool itself is **UI-only**: it does no remotely callable work of its own. The actual persistence happens through existing component pipelines (inline tag in the text component, locator in the portal component) and through the focused server APIs `dd_component_text_area_api` and `dd_component_portal_api`.

Concrete heritage scenario: an oral-history archive has the verbatim transcript of an interview stored in the *Transcription* text-area component of the interview record. A documentalist opens the indexation tool on that transcript, selects the phrase "the bombing of the old market", expands the thesaurus to *Events → Civil war → Bombings*, and links the fragment to that term. The tool writes an inline `index` tag into the transcript (in every language copy) and a matching locator into the indexing portal. They can switch the left pane to the *People* section to tag a speaker, or to the *Media* component to follow along with the audio, mark each tag's review **state** (Normal / Deleted / To review), and attach a free-text **info note** (title + description) to a tag. The "Approach" selector lets them choose which top section/record the current indexation hangs from.

Use it when: someone needs to index long-form text (transcriptions, interviews, document bodies) against the thesaurus with visual fragment selection. Do not expect server actions on this class — it is a front-end orchestrator over `component_text_area`, `component_portal`, the thesaurus area and the indexing APIs.

## How it works (server + client)

**Server.** `tools/tool_indexation/class.tool_indexation.php` is a near-empty subclass of `tool_common`. Its only declared member is:

```php
public const API_ACTIONS = []; // SEC-024: UI-only tool, no remotely callable methods
```

An empty (but present) `API_ACTIONS` satisfies the SEC-024 dispatch requirement while exposing **nothing** to `dd_tools_api::tool_request`. Every write the tool triggers is routed through other, already-gated endpoints (see *Actions & options*), each of which performs its own `security::assert_section_permission(..., 2)` write check. The tool inherits all registry/config/context plumbing from `tool_common` (it overrides no lifecycle hooks).

**Client** (`tools/tool_indexation/js/`). The instance is `tool_indexation.js`; `render_tool_indexation.js` builds the UI; `tag_note.js` adds the per-tag info-note feature; `index.js` re-exports the module. The whole tool is driven by the element's `tool_config->ddo_map` — a list of role-tagged ddos resolved on `build()` into live instances:

| ddo_map `role` | Resolved into | Purpose |
| --- | --- | --- |
| `transcription_component` | `component_text_area` (rsc36) | The text being indexed; owns the inline tags. Used as the `id_base` for tag events. |
| `indexing_component` | `component_portal` | Stores indexation locators (one per tag); set as the thesaurus `linker`. |
| `media_component` | media component | Optional left-pane viewer (audio/video to follow). |
| `people_section` | section | Optional left-pane viewer for tagging people; linked to `indexing_component`. |
| `area_thesaurus` | thesaurus area | Left-pane tree, forced into `thesaurus_mode = 'relation'`, `linker = indexing_component`. |
| `status_user_component` / `status_admin_component` | components | Workflow status controls (rendered in `mini` view). |
| `references_component` | component (optional) | Inverse references tab. |

Layout: a Split.js two-pane window — left = thesaurus/people/media viewer (chosen with the **Viewer** selector, persisted in `localStorage`), right = the transcription text area with a language selector (the original language is forced from `related_component_lang` and labelled "Original"), plus tabbed *Indexation* / *Info* / *References* panels and the per-tag info panel.

Event flow: clicking a tag in the text fires `click_tag_index_<id_base>` (and `click_no_tag_<id_base>` to deselect); the tool subscribes on `init`, updates the active `tag_id` / `state`, and renders that tag's info note. Changing a tag's **state** calls `transcription_component.update_tag({type:'indexIn', tag_id, new_data_obj:{state}})`. Creating an info note creates a record in `rsc377` and writes title (`rsc379`) + description (`rsc380`) instances. Deleting a tag (`delete_tag()` in `tool_indexation.js`) double-confirms, then deletes the inline tag in all languages **and** the matching portal locator.

## Actions & options

This tool declares **no** API actions of its own:

| `API_ACTIONS` | Value |
| --- | --- |
| `tool_indexation` | `[]` (empty — UI-only, nothing dispatchable on this class) |

The server-side work the client triggers goes through these **other** endpoints (each enforces its own write gate). They are listed here so the reference is complete — they are *not* methods of `tool_indexation`:

| Endpoint · action | Reads (RQO `source` / `options`) | Effect |
| --- | --- | --- |
| `dd_component_text_area_api::delete_tag` | `source`: `section_tipo`, `section_id`, `tipo` (rsc36), `lang`; `options`: `tag_id`, `type` (`'index'`) | Scrubs the inline tag from every language copy of the text component. Requires section write (level 2). |
| `dd_component_text_area_api::get_tags_info` | `source`: text-component locator | Returns structured tag metadata so the client can render tag panels. |
| `dd_component_portal_api::delete_locator` | `source`: `section_tipo`, `section_id`, `tipo`; `options`: `locator` (e.g. `{tag_id, type:"dd96"}`), `ar_properties` (e.g. `['tag_id','type']`) | Removes matching portal locators and saves. Requires section write (level 2). |

Other client interactions are plain component / data_manager calls, not tool dispatches: `component_text_area.update_tag(...)` (tag state and note data), `data_manager.request({action:'create'|'read', ...})` (create the info-note record, load the "Approach" related-sections list), and the local `status` table for the persisted Approach/Viewer selections.

## How it is registered & surfaced

`tools/tool_indexation/register.json` is a **legacy v6** file (a raw record dump with `components`/`relations` keys); `tools_register` auto-converts it at registration (the `components` key triggers the v6 converter). Essentials it carries:

- `dd1326` name = `tool_indexation`; `dd1327` version `2.0.2`; `dd1328` minimum Dédalo version `6.0.0`; `dd1644` developer = "Dédalo team".
- `dd799` label = *Indexing tool* (localized across project languages); `dd612` description = "Create links between text fragments and thesaurus terms".
- `dd1350` **affected_tipos** = `["rsc36"]` → the tool is restricted to that `component_text_area` (the transcription component).
- `dd1335` **properties** = `{ "open_as": "window", "windowFeatures": null }` → opens in its own window.
- `dd1372` **labels** supply the localized UI strings the client reads via `get_tool_label(...)` — `delete_tag`, `warning_delete_tag`, `error_delete_tag`, `error_delete_locator` (and `create_tag_info_note`).
- The affected_models / show_in_inspector / show_in_component / active flags (`dd1330` / `dd1331` / `dd1332` / `dd1354`) are present as **relations** to their ontology records rather than inline values in this v6 dump.

Surfacing (in `common::get_tools()`): because the tool is restricted by `affected_tipos` to `rsc36`, the **Indexing tool** button attaches to that transcription component (and to elements that name it in `properties->tool_config`). It opens as a standalone window rather than an inspector panel. The note feature uses fixed ontology tipos: indexation note section `rsc377`, title `rsc379`, description `rsc380`.

## Examples

Deleting a tag — the two server calls the client makes (issued by `tool_indexation.js::delete_tag` via the component instances, which build the RQO for the dd_component_*_api endpoints):

```js
// 1) remove the inline tag from every language of the text component
await self.transcription_component.delete_tag(
    tag_id,          // e.g. "2"
    'index'          // tag type
)
// → dd_component_text_area_api::delete_tag
//   source:{section_tipo, section_id, tipo:'rsc36', lang}, options:{tag_id, type:'index'}

// 2) remove the matching portal locator
await self.indexing_component.delete_locator(
    { tag_id: tag_id, type: DD_TIPOS.DEDALO_RELATION_TYPE_INDEX_TIPO }, // {tag_id, type:"dd96"}
    ['tag_id', 'type']                                                  // properties to compare
)
// → dd_component_portal_api::delete_locator
```

Loading the "Approach" list (top sections/records the indexation hangs from) is a normal read RQO, not a tool dispatch:

```js
const rqo = {
    action : 'read',
    source : { action:'related_search', model:'component_text_area', tipo:'rsc36',
               section_tipo, section_id, lang, mode:'related_list' },
    sqo    : { section_tipo:['all'], mode:'related', limit:10, offset:0, full_count:false,
               filter_by_locators:[{ section_tipo, section_id }] }
}
const api_response = await data_manager.request({ body: rqo })
```

## Related

- [Creating new tools](../creating_tools.md) · [Server contract](../server_contract.md) — the tool model, `API_ACTIONS` (incl. the empty-array UI-only case), gates and lifecycle this page builds on.
- [tool_export](tool_export.md) — contrast: a section tool with a real dispatchable action; see [Exporting data](../../../core/exporting_data.md).
- `tool_subtitles`, `tool_transcription`, `tool_tc`, `tool_tr_print` — sibling tools working over the same transcription / AV text components and their timecode/indexation tags (reference pages pending).
- Server endpoints used by the client: `core/api/v1/common/class.dd_component_text_area_api.php` (`delete_tag`, `get_tags_info`), `core/api/v1/common/class.dd_component_portal_api.php` (`delete_locator`).
- Source: `tools/tool_indexation/class.tool_indexation.php`, `tools/tool_indexation/register.json`, `tools/tool_indexation/js/{tool_indexation,render_tool_indexation,tag_note,index}.js`, `tools/tool_indexation/css/tool_indexation.less`.
