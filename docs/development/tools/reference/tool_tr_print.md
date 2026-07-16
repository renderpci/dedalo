# tool_tr_print

Renders a print-ready, formatted version of an interview transcription, with per-element visibility toggles for timecodes, persons, indexations, notes, languages and dividing lines. UI-only — no remotely callable server methods.

## What it does / why & when to use it

A stored transcription is a stream of running text sprinkled with Dédalo tag markup — timecode marks, speaker (person) tags, indexation anchors, notes, reference and language markers. That raw markup is right for editing but wrong for reading or handing to a researcher. `tool_tr_print` turns it into a clean, human-readable layout you can print or export from the browser, and lets you decide which classes of annotation appear.

Concrete scenario: an oral-history archive wants a paper transcript of an interview for a reading-room dossier. The editor opens the transcription record, presses **Print transcription** on the transcription component, and gets a formatted view. They switch to the *Default* structured layout so each timecoded passage becomes a table row with its indexation terms in a sidebar, hide the raw timecodes and language markers with the left-panel checkboxes, keep person names and notes, turn on dividing *Lines* between passages, and print. A metadata header aggregating the interview session, interviewees and camera operators sits above the text.

Use it to produce a readable or printable rendering of a finished transcription. It does not edit the transcript (that is the record's own text component and [tool_subtitles](tool_subtitles.md)), does not generate the transcription ([tool_transcription](tool_transcription.md)), and does not shift timecodes ([tool_tc](tool_tc.md)).

## How it works (server + client)

**Server.** `tools/tool_tr_print/` ships **no `server/` package** — there is no `server/index.ts`, so `dd_tools_api.tool_request` refuses any action named against this tool at the dispatch gate (`tool has no server module`). There is no `backgroundRunnable` and no lifecycle hook. All behavior is client-side; the tool never writes anything.

**Client** (`tools/tool_tr_print/js/`). The instance is `tool_tr_print.js`; `render_tool_tr_print.js` builds the UI. Following the `tool_common` lifecycle:

- `init()` seeds the project languages and the source language from the caller.
- `build()` resolves `self.transcription_component` — the `component_text_area` whose tipo matches the caller — snapshots `self.ar_raw_data` from its `data.value`, and pre-fetches tag resolution data via `self.transcription_component.get_tags_info(['index','note','reference'])`, stored on `self.tags_info`.
- `edit()` builds a two-column layout: a **left** control panel and a **right** transcript pane (with a metadata header above the body). `tags_to_html()` expands the raw markup into display HTML via `tr.add_tag_img_on_the_fly`.

A **view-mode selector** offers three renderings of the transcript:

- **Original** (default) — the raw markup converted to inline HTML, tag images preserved as-is.
- **Default** — a structured table layout (`render_default`): each raw block is split into paragraphs, and each tag class is resolved individually — timecodes to `.tc` spans, indexation `indexIn`/`indexOut` marks to cross-linked anchors with a sidebar of resolved terms, `person` and `note` marks to labelled blocks (matched by `{section_tipo, section_id, component_tipo}` locator), references stripped, language marks to `.lang` spans.
- **Source** — the raw tag string shown as plain text.

The **left panel** carries a language selector plus visibility checkboxes that toggle DOM elements directly (immediate, no re-render): *Header*, *Time Codes*, *Persons*, *Indexations*, *Indexations info*, *Annotations*, *Languages*, and *Lines* (draws separators between timecoded passages). The header (`render_header`) aggregates the transcription's `data.related_sections` context (labels and component values for each related section) and person badges from `data.tags_persons`.

!!! warning "Tag resolution depends on an unregistered component API"
    The *Default* and header renderings resolve index/note tags through `component_text_area.get_tags_info(...)`, which routes to the `dd_component_text_area_api` endpoint. That API class is **not registered** in `src/core/api/dispatch.ts` on this engine (only `dd_component_portal_api` and `dd_component_av_api` are), so `get_tags_info` is not currently callable — the same gap noted for [tool_indexation](tool_indexation.md). The *Original* and *Source* views, which do not need it, are unaffected. Treat resolved-tag rendering as unverified until that endpoint is available.

## Actions & options

`tool_tr_print` exposes **no** API actions:

| `apiActions` | Notes |
| --- | --- |
| *(no server module)* | UI-only tool. No action is dispatchable through `dd_tools_api`. No `backgroundRunnable`, no lifecycle hook. |

The meaningful "options" are the client-side display toggles and the view-mode selector described above; none are server parameters.

## How it is registered & surfaced

`tools/tool_tr_print/register.json` is a **column-keyed dump** (a seeded matrix-row snapshot); `importTools()` passes it through as-is (see [register.json reference](../register_json.md)). Essentials:

- `dd1326` name = `tool_tr_print`; `dd1327` version `1.0.2`; `dd1328` minimum Dédalo version `6.0.0`; `dd1644` developer = "Dédalo team".
- `dd799` label = *Print transcription* (localized); `dd612` description = "Generates a printable version of the interview transcript. Allows you to customize the printout by adding or removing tags for time code, indexing, people, etc." (localized).
- `dd1350` **affected_tipos** = `["rsc36"]` — the transcription text component tipo.
- `dd1330` **affected_models** → the `component_text_area` model record (`dd1342`).
- `dd1332` **show_in_component** = dd64/1 (Yes); it carries **no** `dd1331`, so `show_in_inspector` is false — the button renders inline on the component, not in the inspector.
- `dd1354` **active** = dd64/1 (Yes).
- `dd1335` **properties** = `{ "open_as": "window", "windowFeatures": null }` — it opens in its own window (it needs the room for the two-column print layout).

Surfacing is element-driven (`getElementTools`): once authorized, the **Print transcription** button attaches inline to the `component_text_area` whose tipo is `rsc36`, and opens as a standalone window.

## Examples

The tool is UI-only, so there is no `tool_request` to `tool_tr_print`. The transcript body is built client-side by iterating the component's raw data and expanding tags:

```js
// build() snapshot + prefetch
self.transcription_component = self.ar_instances.find(el => el.tipo === self.caller.tipo)
self.ar_raw_data             = self.transcription_component.data.value          // [{ value: '<p>…[TC_…_TC]…</p>' }, …]
self.tags_info               = await self.transcription_component.get_tags_info(['index','note','reference'])

// render (Original view): expand each raw block to display HTML
for (const item of self.ar_raw_data) {
    const html = self.tags_to_html(item.value || '')   // → tr.add_tag_img_on_the_fly(value)
    right_container_text.insertAdjacentHTML('beforeend', html)
}
```

## Related

- [tool_transcription](tool_transcription.md) — generates the transcription this tool renders.
- [tool_subtitles](tool_subtitles.md) — edits the same transcription for subtitle production.
- [tool_tc](tool_tc.md) — offsets all `[TC_..._TC]` timecodes in the transcript.
- [tool_indexation](tool_indexation.md) — indexes the transcript against the thesaurus (same tag classes rendered here).
- [Creating new tools](../creating_tools.md) · [Server contract](../server_contract.md) — the UI-only, no-`server/`-package case.
- The component this tool renders: [`component_text_area`](../../../core/components/component_text_area.md).
- Source: `tools/tool_tr_print/js/{tool_tr_print,render_tool_tr_print,index}.js`; `tools/tool_tr_print/register.json` (no `server/` package).
