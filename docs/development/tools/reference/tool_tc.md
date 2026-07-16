# tool_tc

Bulk-shifts every timecode mark (`[TC_HH:MM:SS.mmm_TC]`) in a transcription text component by a signed number of seconds, clamping any negative result to zero.

## What it does / why & when to use it

When an audiovisual recording is re-cut, re-encoded, or the transcription was timed against a rendition that starts a few seconds earlier or later, every timecode embedded in the transcript is off by the same amount. Re-timing hundreds of marks by hand is tedious and error-prone. `tool_tc` fixes them in one pass: you type an offset in seconds (positive to push the marks later, negative to pull them earlier) and it rewrites every `[TC_..._TC]` mark in the selected language's transcription data.

Concrete scenario: an oral-history interview's `component_av` is replaced with a re-encoded master whose timeline is shifted by +12 seconds. The transcript's timecodes now point 12 seconds too early. The cataloguer opens `tool_tc` on the transcription component, enters `12`, and applies — every mark advances by 12 seconds, the audio and text line up again, and the change is recorded through the standard save path (so it is reversible in the time machine).

Use it whenever a transcription's timecodes need a uniform shift. For per-mark editing, subtitle production, or printing, use the sibling transcription tools instead ([tool_subtitles](tool_subtitles.md), [tool_transcription](tool_transcription.md), and the transcript-print tool).

## How it works (server + client)

### Server

`tools/tool_tc/server/index.ts` exports one action, `change_all_timecodes`, gated `record` / level 2.

The handler (`changeAllTimecodes`):

1. Reads `component_tipo` (or `tipo`), `section_tipo`, `section_id`, `lang` (default `lg-nolan`) and `offset_seconds` (default `0`) from the request options, validating that the tipos are present and `section_id` is a positive integer.
2. Resolves the component model (`getModelByTipo`) and the section's matrix table (`getMatrixTableFromTipo`), reads the record (`readMatrixRecord`), and lifts the component's items for the requested language (`readComponentItems`).
3. For each item of that language (optionally narrowed to a single item by the numeric `key` filter), it runs `replaceTimecodes` (`src/core/media/tools/timecode.ts`) over the item's text value.
4. Only items whose text actually changed are written back through `saveComponentData` (`src/core/section/record/save_component.ts`) — the standard, transaction-wrapped, time-machine-audited save path.
5. Returns the map of changed marks keyed by item index (`{ "0": { oldTc: newTc, … } }`) when at least one item changed, or `false` when nothing changed, with a message like `ok. 3 item(s) updated`.

`replaceTimecodes` is a pure text transform: it collects the inner timecodes in document order, builds an `old → new` map clamping each result at zero (`Math.max(0, tcToSeconds(tc) + offsetSeconds)`), and applies the replacements. For **positive** offsets the map is applied in reverse document order so an earlier mark's new value can never overwrite a later mark's still-original value. On any parse failure it returns the text unchanged.

### Client

`tools/tool_tc/js/` follows the standard `tool_common` lifecycle. `build()` resolves the `main_element` role from the tool's `ddo_map` — the transcription component the offset applies to. `render_tool_tc.js` lays out a two-panel edit view: a **read-only preview** of the transcription component on the left, and on the right a **language selector**, an **offset input** (a text input, so a locale decimal separator is tolerated), and an **Apply** button. Applying validates that the offset is non-empty and non-zero (a native `alert` rejects an empty value), then calls `change_all_time_codes(offset_seconds)` and refreshes the preview to show the shifted marks. The request runs with `timeout: 120s` and `retries: 1` (a single attempt, to avoid a partial double-write).

## Actions & options

| Action | Gate | Options it reads |
| --- | --- | --- |
| `change_all_timecodes` | `record` / 2 | `component_tipo` (or `tipo`), `section_tipo`, `section_id`, `lang` (default `lg-nolan`), `offset_seconds` (default `0`), `key` (optional item-index filter) |

There is no `backgroundRunnable` and no lifecycle hook — the single action runs synchronously and returns the change map.

## How it is registered & surfaced

`tools/tool_tc/register.json` is a **column-keyed dump** (a seeded matrix-row snapshot, not hand-authored); `importTools()` passes it through as-is (see [register.json reference](../register_json.md)). Essentials it carries:

- `dd1326` name = `tool_tc`; `dd1327` version `2.0.2`; `dd1328` minimum Dédalo version `6.0.0`; `dd1644` developer = "Dédalo team".
- `dd799` label = *Time codes* (localized across project languages); `dd612` description = "Manages offset timecode of transcriptions tags by adding or subtracting seconds".
- `dd1350` **affected_tipos** = `["rsc36"]` — restricted to the transcription text component tipo.
- `dd1330` **affected_models** → the `component_text_area` model record (`dd1342`).
- `dd1331` **show_in_inspector** = dd64/1 (Yes) **and** `dd1332` **show_in_component** = dd64/1 (Yes): the button renders both in the inspector panel and inline on the component.
- `dd1354` **active** = dd64/1 (Yes).
- `dd1372` **labels**: `offset_in_seconds`, `apply`, `empty_offset_value`, read client-side via `get_tool_label(...)`.
- It declares **no** `dd1335` `properties`, so it opens in the standard in-page tool view rather than a separate window.

Surfacing is element-driven (`getElementTools`, `src/core/tools/registry.ts`): once the profile is authorized, the **Time codes** button attaches to the `component_text_area` whose tipo is `rsc36`, both in the section inspector and inline on the component.

## Examples

The RQO the client builds in `change_all_time_codes()`:

```js
const source = create_source(self, 'change_all_timecodes') // → tool_tc::change_all_timecodes(options)
const rqo = {
    dd_api  : 'dd_tools_api',
    action  : 'tool_request',
    source  : source,
    options : {
        component_tipo : self.main_element.tipo,          // the transcription component
        section_tipo   : self.main_element.section_tipo,  // rsc36
        section_id     : self.main_element.section_id,
        lang           : self.main_element.lang,
        offset_seconds : 12,   // signed; negative shifts earlier, clamped at 0
        key            : null  // null → every item of that lang; a number limits to one item
    }
}
data_manager.request({ body: rqo, retries: 1, timeout: 120 * 1000 })
// → response.result: { "0": { "00:01:37.960": "00:01:49.960", … } }  (or false when nothing changed)
```

## Related

- [tool_subtitles](tool_subtitles.md) — subtitle editing over the same transcription text.
- [tool_transcription](tool_transcription.md) — generates the transcription and its timecode marks in the first place.
- [tool_tr_print](tool_tr_print.md) — printable/formatted transcript rendering.
- [Creating new tools](../creating_tools.md) · [Server contract](../server_contract.md) · [register.json reference](../register_json.md) · [Security](../security.md).
- Source: `tools/tool_tc/server/index.ts`; the pure transform: `src/core/media/tools/timecode.ts` (`replaceTimecodes`), on top of the shared mark helpers in `src/core/resolve/tr_marks.ts`.
