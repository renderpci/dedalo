# tool_transcription

Turns time-based and document media into editable text: in-browser Whisper speech-to-text on audio/video, server-side automatic transcription via Babel, PDF text extraction, audio format conversion for the recognizer, remote-process monitoring, and VTT subtitle generation.

## What it does / why & when to use it

Oral-history and audiovisual archives accumulate hours of recorded interviews and stacks of scanned documents that are useless for search and publication until someone produces a text transcript. `tool_transcription` is the workbench that produces that text directly inside a record, next to the media, so the result lands in the record's transcription component without copy-paste.

Concrete scenario: an oral-history project (rsc167-style AV section) holds a 90-minute recorded interview in a `component_av` element, with an empty `component_text_area` transcription field beside it. The archivist opens the transcription tool on the interview. The tool window shows the editable transcription text area on the left and the media player on the right. They pick a Whisper quality (small / large / large_turbo) and press **Automatic transcription**: the browser loads the Whisper model (WebGPU when available, WASM as the compatible fallback), the tool builds a recognizer-friendly audio rendition (WAV, 16 kHz, mono) on the server, streams the audio through the model, and writes the result back into the text area as Dédalo-format paragraphs with `[TC_hh:mm:ss.mmm_TC]` timecode tags. The archivist then corrects the text, sets a characters-per-line value and presses **Build subtitles** to emit a `.vtt` file synced to the AV duration. For very large jobs, an engine configured with `type: "server"` hands the work to a Babel transcription service instead, which runs as a background process the tool polls by PID.

The same tool also surfaces on `component_pdf` (extract text from a scanned/born-digital PDF via `pdftotext`) and on `component_image`. Use it whenever you need machine-generated text from a media element rather than re-keying it. For the *printable* / formatted rendering of a finished transcript and its VTT, use [tool_tr_print](index.md); for hand-editing subtitles in a rich editor, [tool_subtitles](tool_subtitles.md); for shifting all timecodes at once, [tool_tc](index.md).

## How it works

### Server

`tools/tool_transcription/server/index.ts` — per `rewrite/STATUS.md`, the **local half is fully done** (browser-Whisper flow works end-to-end) and `automatic_transcription` (the remote-ASR submit) is done as a **provider seam**; two PHP actions have **no TS route at all**:

| Action | TS status |
| --- | --- |
| `create_transcribable_audio_file` | ✅ ported |
| `delete_transcribable_audio_file` | ✅ ported |
| `automatic_transcription` | ✅ ported (submit-only; see below) |
| `check_server_transcriber_status` | ⬜ **not registered** — absent from `apiActions`, so a `tool_request` for it is unroutable (dispatch gate 6, `tool method not allowed`) |
| `build_subtitles_file` | ⬜ **not registered** — same gap |
| `get_text_from_pdf` | not exposed on either engine (PHP removed it from `API_ACTIONS` for the same SEC-024 reason this page already documents; use [tool_pdf_extractor](index.md) instead) |

The three ported actions:

- **Audio conversion** — `create_transcribable_audio_file`/`delete_transcribable_audio_file` (`src/core/media/tools/transcription.ts::ensureTranscribableAudio`/`deleteTranscribableAudio`) build/remove a temporary `audio_tr` quality (WAV/16 kHz/mono) via real ffmpeg, idempotently; the deleted file is hard-removed (not sent to trash/time machine).
- **Remote ASR submit** — `automaticTranscription` ensures the audio quality, then submits the audio URL to the configured transcriber provider (`resolveTranscriberProvider`, `src/core/tools/transcription_asr.ts` — a provider-seam abstraction, verified with a **stub** provider) and returns the job PID. ⬜ **The async result poll is ledgered** — because `check_server_transcriber_status` has no route, there is no way for the client to learn when a submitted remote job finishes on a TS-served install; the browser-Whisper local path is the working alternative until this seam is closed.
- **Subtitles** — `build_subtitles_file` has no TS route; generating a `.vtt` from a finished transcript is not available through this tool on the TS engine (verify whether [tool_subtitles](tool_subtitles.md) covers your use case instead, or track this gap against `rewrite/STATUS.md`).

Permission gating: PHP asserts imperatively per method against the nested `media_ddo`/`transcription_ddo` locator (write level 2 + record-in-scope), not a top-level RQO field the declarative gate kinds can name directly — so on TS, `apiActions` declares `permission: null` for all three actions and each handler runs the identical `record`/2 gate (`assertActionPermission`) against the lifted locator itself, reproducing the exact PHP semantics via the same gate function the framework would otherwise call declaratively. Tool configuration (transcriber URIs/keys, quality list) is read through `getToolConfig('tool_transcription')`.

### Client

`tools/tool_transcription/js/` wires the standard lifecycle on top of `tool_common` (`init`/`build`/`edit`/`render`). The tool opens in its own window (`properties.open_as: "window"`). `build()` resolves five components from the tool's `ddo_map` into instance roles: `media_component` (the AV/PDF/image being transcribed), `transcription_component` (the target `component_text_area`), `status_user_component`, `status_admin_component` and `references_component`; it forces the text area to the media's original language when `related_component_lang` is set, and loads a `relation_list` (related-search RQO) so the user can pick the top section. `render_tool_transcription.js` lays out the text area + player, a header with buttons to jump to related tools (`tool_tr_print`, `tool_time_machine`) via `open_tool(...)`, an **Insert tag** control, a **Build subtitles** button with a characters-per-line input (persisted in `localStorage`), and the **Automatic transcription** block with engine/quality/device selectors.

Two transcription paths, chosen by the configured engine's `type`:

- `type: "browser"` (default, e.g. the `local` engine) → `automatic_transcription()` (client) spins up `transcribers/browser_whisper/browser_whisper.js` as a Web Worker (Transformers.js Whisper), first calls the server `create_transcribable_audio_file` action to get the 16 kHz WAV URL, decodes it via `AudioContext`, posts the channel data + model + device (`webgpu`/`wasm`) to the worker, streams status/progress labels into the UI, and on `end` parses the worker output into Dédalo paragraph+timecode format and `set_value`s it into the text area (then fires `delete_transcribable_audio_file`). It checks `ua.check_transformers_webgpu()` and warns before running on a non-WebGPU browser.
- `type: "server"` (e.g. Babel) → `automatic_transcription_server()` (client) sends the `automatic_transcription` action, stores the returned `pid` in the local status DB, and polls `check_server_transcriber_status` every ~4 s until the server reports done, then refreshes the text component. ⬜ **On TS this poll 400s** — `check_server_transcriber_status` has no route (see above); the submit call itself works, but the client never learns the result.

Styling: `css/tool_transcription.less`.

## Actions & options

`apiActions` declares three actions, each `permission: null` + an imperative `record`/2 gate on the nested locator (see above):

| Action | Gate | Key options it reads |
| --- | --- | --- |
| `automatic_transcription` | `record`/2 on `transcription_ddo.section_tipo`/`section_id` | `source_lang` (`lg-…`), `transcription_ddo` `{component_tipo, section_id, section_tipo}` (where the text is written), `media_ddo` `{…}` (source AV), `transcriber_engine`, `transcriber_quality`, `config` (optional) |
| `create_transcribable_audio_file` | `record`/2 on `media_ddo.section_tipo`/`section_id` | `media_ddo` `{component_tipo, section_id, section_tipo}` — builds the temporary `audio_tr` WAV/16 kHz/mono and returns its URL |
| `delete_transcribable_audio_file` | `record`/2 on `media_ddo.section_tipo`/`section_id` | `media_ddo` `{…}` — hard-deletes the `audio_tr` file |
| `check_server_transcriber_status` | — | ⬜ **not registered** (unroutable) |
| `build_subtitles_file` | — | ⬜ **not registered** (unroutable) |

Notes:

- `get_text_from_pdf` is not exposed on either engine — use [tool_pdf_extractor](index.md).
- None of the three ported actions is in `backgroundRunnable`; the remote-ASR submit returns immediately with a job PID (the polling that would normally follow is the ledgered gap), and the browser-Whisper path runs entirely in the user's browser.
- Engine names and qualities come from the tool config (`getToolConfig('tool_transcription')` — same dd996/dd1633 resolution as every other tool): the shipped default ships `transcriber_engine` `[{name:"local", type:"browser", label:"Local transcriber"}]` (`client:true`) and a `transcriber_quality` list, default `large` (`client:true`). A server-type engine (e.g. Babel) needs its `uri`/`key` configured — the TS `resolveTranscriberProvider`/`resolveTranscriberConfig` (`src/core/tools/transcription_asr.ts`) has been verified with a **stub** provider only; a real Babel HTTP round-trip is not yet live-verified.

## How it is registered & surfaced

`tools/tool_transcription/register.json` is a **column-keyed dump** (`string`/`relation`/`misc`/… keyed by component tipo — a seeded matrix-row snapshot, not a hand-authored file); `importTools()` passes it through as-is (see [register.json reference](../register_json.md)). Essentials it declares:

- `name` (dd1326): `tool_transcription`; `version` (dd1327): `3.0.3`; `dedalo_version_min` (dd1328): `6.6.0`; developer (dd1644): "Dédalo team"; label (dd799): "Transcription".
- **affected_models** (dd1330 → dd1342 model records, section_ids 8 / 20 / 30): `component_av`, `component_image`, `component_pdf`. The tool therefore attaches inline to those media components.
- **active** (dd1354 → dd64 §1 = Yes): registered active.
- **show_in_inspector** (dd1331 → dd64 §1 = Yes) **and** **show_in_component** (dd1332 → dd64 §1 = Yes): both true — the button renders both in the inspector panel and inline in the component.
- `properties` (dd1335): `{ "open_as": "window", "windowFeatures": null }`.
- `default_config` (dd1633): the `transcriber_engine` / `transcriber_quality` blocks described above.
- UI labels (dd1372): a large multilingual set (`automatic_transcription`, `build_subtitles`, `quality`, `engine`, `chars_per_line`, `processing_audio`, `initializing`, `setting_up`, `transcription_completed`, `cpu_device`, `large`/`small`/`medium`/`large_turbo`, …), fetched client-side via `get_tool_label(...)`.

Surfacing is element-driven (`getElementTools`, `src/core/tools/registry.ts`): once the user's profile is authorized for the tool, its button appears on any `component_av`, `component_image` or `component_pdf` element (matched against `affected_models`). The transcription workbench is most useful on AV components that have an adjacent transcription `component_text_area` declared in the section's `tool_config.ddo_map`.

## Examples

Start a server-side (Babel) transcription — the RQO the client builds in `automatic_transcription_server()`:

``` js
const source = create_source(self, 'automatic_transcription') // → tool_transcription::automatic_transcription(options)
const rqo = {
    dd_api  : 'dd_tools_api',
    action  : 'tool_request',
    source  : source,
    options : {
        source_lang       : 'lg-spa',
        transcription_ddo : { component_tipo: 'dd32', section_id: '1', section_tipo: 'rsc167' }, // WRITE-gated text target
        media_ddo         : { component_tipo: 'rsc35', section_id: '1', section_tipo: 'rsc167' }, // source AV
        transcriber_engine  : 'babel_transcriber',
        transcriber_quality : 'large',
        config              : self.context.config
    }
}
data_manager.request({ body: rqo, retries: 1, timeout: 3600 * 1000 })
// → response.result.pid on both engines; PHP then polls check_server_transcriber_status
//   with that pid — on TS this poll has no route (⬜ ledgered), so the job's completion
//   is currently unobservable from the client on a TS-served install
```

`build_subtitles_file()` (PHP oracle only — **⬜ no TS route, unroutable on this engine**):

``` js
const rqo = {
    dd_api  : 'dd_tools_api',
    action  : 'tool_request',
    source  : create_source(self, 'build_subtitles_file'),
    options : {
        component_tipo : component_text_area.tipo,        // text component holding the transcript
        section_tipo   : component_text_area.section_tipo,
        section_id     : component_text_area.section_id,
        lang           : component_text_area.data.lang,   // from data, not context
        max_charline   : 90,
        key            : 0
    }
}
// PHP → { result:true, url:'…/media/av/subtitles/rsc35_rsc167_1_lg-spa.vtt', msg:'OK…' }
// TS  → dispatch gate 6, 'tool method not allowed'
```

The browser-Whisper path instead calls the `create_transcribable_audio_file` action (to get the 16 kHz WAV URL) and runs the model in a Web Worker client-side, writing the result straight into the text component with `set_value` — this path is **fully working on TS**, unaffected by the two gaps above.

## Related

- [tool_subtitles](tool_subtitles.md) — rich-editor subtitle editing tied to AV transcription text
- [tool_tr_print](index.md) — printable/formatted transcript + VTT rendering
- [tool_tc](index.md) — offset all `[TC_…_TC]` timecodes at once
- [tool_pdf_extractor](index.md) — gated PDF text extraction (the supported route for PDF text)
- [tool_posterframe](tool_posterframe.md) and [tool_media_versions](tool_media_versions.md) — other AV media tooling
- [tool_lang](tool_lang.md) / [tool_lang_multi](index.md) — translate the transcribed text
- [Creating new tools](../creating_tools.md), [Server contract](../server_contract.md), [register.json reference](../register_json.md), [Security](../security.md)
- [Exporting data](../../../core/exporting_data.md) (the [tool_export](tool_export.md) side)
- Source: `tools/tool_transcription/server/index.ts`; local audio core: `src/core/media/tools/transcription.ts`; ASR provider seam: `src/core/tools/transcription_asr.ts`.
