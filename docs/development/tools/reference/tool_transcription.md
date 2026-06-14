# tool_transcription

Turns time-based and document media into editable text: in-browser Whisper speech-to-text on audio/video, server-side automatic transcription via Babel, PDF text extraction, audio format conversion for the recognizer, remote-process monitoring, and VTT subtitle generation.

## What it does / why & when to use it

Oral-history and audiovisual archives accumulate hours of recorded interviews and stacks of scanned documents that are useless for search and publication until someone produces a text transcript. `tool_transcription` is the workbench that produces that text directly inside a record, next to the media, so the result lands in the record's transcription component without copy-paste.

Concrete scenario: an oral-history project (rsc167-style AV section) holds a 90-minute recorded interview in a `component_av` element, with an empty `component_text_area` transcription field beside it. The archivist opens the transcription tool on the interview. The tool window shows the editable transcription text area on the left and the media player on the right. They pick a Whisper quality (small / large / large_turbo) and press **Automatic transcription**: the browser loads the Whisper model (WebGPU when available, WASM as the compatible fallback), the tool builds a recognizer-friendly audio rendition (WAV, 16 kHz, mono) on the server, streams the audio through the model, and writes the result back into the text area as Dédalo-format paragraphs with `[TC_hh:mm:ss.mmm_TC]` timecode tags. The archivist then corrects the text, sets a characters-per-line value and presses **Build subtitles** to emit a `.vtt` file synced to the AV duration. For very large jobs, an engine configured with `type: "server"` hands the work to a Babel transcription service instead, which runs as a background process the tool polls by PID.

The same tool also surfaces on `component_pdf` (extract text from a scanned/born-digital PDF via `pdftotext`) and on `component_image`. Use it whenever you need machine-generated text from a media element rather than re-keying it. For the *printable* / formatted rendering of a finished transcript and its VTT, use [tool_tr_print](index.md); for hand-editing subtitles in a rich editor, [tool_subtitles](tool_subtitles.md); for shifting all timecodes at once, [tool_tc](index.md).

## How it works

### Server

`tools/tool_transcription/class.tool_transcription.php` extends `tool_common`. The class is deliberately thin: each remotely callable method resolves the target component via `ontology_node::get_model_by_tipo(...)` + `component_common::get_instance(...)`, does its media/file work, and returns the standard `{result, msg, errors}` envelope. The heavy lifting is delegated:

- **Babel server transcription** — `transcribers/babel/class.babel_transcriber.php`. `automatic_transcription()` instantiates `babel_transcriber`, calls `->transcribe()` (CURL to the configured Babel `uri`, guarded by `is_safe_remote_url()` SSRF defence, SEC-076), gets back a `pid`, then launches `exec_background_check_transcription($pid)`. `check_server_transcriber_status()` polls `babel_transcriber::check_transcriber_status(...)` by that PID. The babel class whitelists its CLI-callable method in its own `BACKGROUND_RUNNABLE`.
- **Audio conversion** — `create_transcribable_audio_file()` builds a temporary `audio_tr` quality (WAV/16 kHz/mono) on the AV component via `build_version('audio_tr', false)` and returns its public URL; `delete_transcribable_audio_file()` hard-`unlink()`s that temporary file afterwards (it is not sent to trash / time machine).
- **PDF extraction** — the internal `get_text_from_pdf()` runs `PDF_AUTOMATIC_TRANSCRIPTION_ENGINE` (the `pdftotext` binary) with `-enc UTF-8`, validates/cleans the output (`valid_utf8` / `utf8_clean` helpers defined at the bottom of the file), and inserts `[page-n-N]` page markers. **This method was removed from `API_ACTIONS`** (SEC-024 §9.2): it took an arbitrary `path_pdf` filesystem path with no authorization. It is now internal only — callers needing PDF text go through [tool_pdf_extractor](index.md)`::get_pdf_data`, which enforces a per-component gate.
- **Subtitles** — `build_subtitles_file()` reads the text component value, gets the related AV component's duration (`get_related_component_av_tipo()` → `get_duration()`), calls `subtitles::build_subtitles_text(...)` (from `DEDALO_SHARED_PATH/class.subtitles.php`) with a `max_charline` constraint, and writes the `.vtt` to the AV component's subtitles path, returning its public URL.

Every callable method carries an imperative permission gate as the first statement (defense-in-depth — there is no map-form `API_ACTIONS` here): write-level `security::assert_section_permission(section_tipo, 2)` for the transcription/media writers, read-level (`1`) for the status poll, `security::assert_tipo_permission(...)` for the subtitle builder, each followed by `security::assert_record_in_user_scope(...)` (SEC-024 §9.4) when a `section_id` is present. Tool configuration (transcriber URIs/keys, quality list) is read through `tool_common::get_config()`.

### Client

`tools/tool_transcription/js/` wires the standard lifecycle on top of `tool_common` (`init`/`build`/`edit`/`render`). The tool opens in its own window (`properties.open_as: "window"`). `build()` resolves five components from the tool's `ddo_map` into instance roles: `media_component` (the AV/PDF/image being transcribed), `transcription_component` (the target `component_text_area`), `status_user_component`, `status_admin_component` and `references_component`; it forces the text area to the media's original language when `related_component_lang` is set, and loads a `relation_list` (related-search RQO) so the user can pick the top section. `render_tool_transcription.js` lays out the text area + player, a header with buttons to jump to related tools (`tool_tr_print`, `tool_time_machine`) via `open_tool(...)`, an **Insert tag** control, a **Build subtitles** button with a characters-per-line input (persisted in `localStorage`), and the **Automatic transcription** block with engine/quality/device selectors.

Two transcription paths, chosen by the configured engine's `type`:

- `type: "browser"` (default, e.g. the `local` engine) → `automatic_transcription()` (client) spins up `transcribers/browser_whisper/browser_whisper.js` as a Web Worker (Transformers.js Whisper), first calls the server `create_transcribable_audio_file` action to get the 16 kHz WAV URL, decodes it via `AudioContext`, posts the channel data + model + device (`webgpu`/`wasm`) to the worker, streams status/progress labels into the UI, and on `end` parses the worker output into Dédalo paragraph+timecode format and `set_value`s it into the text area (then fires `delete_transcribable_audio_file`). It checks `ua.check_transformers_webgpu()` and warns before running on a non-WebGPU browser.
- `type: "server"` (e.g. Babel) → `automatic_transcription_server()` (client) sends the `automatic_transcription` action, stores the returned `pid` in the local status DB, and polls `check_server_transcriber_status` every ~4 s until the server reports done, then refreshes the text component.

Styling: `css/tool_transcription.less`.

## Actions & options

`API_ACTIONS` (list form — gates are imperative inside each method):

| Action | Gate (imperative) | Key options it reads |
| --- | --- | --- |
| `automatic_transcription` | WRITE on `transcription_ddo.section_tipo` (level 2) + record scope | `source_lang` (`lg-…`), `transcription_ddo` `{component_tipo, section_id, section_tipo}` (where the text is written), `media_ddo` `{…}` (source AV), `transcriber_engine` (`babel_transcriber` / `local` → babel / `google_translation` not implemented), `transcriber_quality`, `config` (optional) |
| `create_transcribable_audio_file` | WRITE on `media_ddo.section_tipo` (level 2) + record scope | `media_ddo` `{component_tipo, section_id, section_tipo}` — builds the temporary `audio_tr` WAV/16 kHz/mono and returns its URL |
| `delete_transcribable_audio_file` | WRITE on `media_ddo.section_tipo` (level 2) + record scope | `media_ddo` `{…}` — hard-deletes the `audio_tr` file |
| `check_server_transcriber_status` | READ on `media_ddo.section_tipo` (level 1) + record scope | `media_ddo` `{…}`, `transcriber_engine`, `pid` (from the start call), `config` (optional) |
| `build_subtitles_file` | WRITE on (`section_tipo`,`component_tipo`) (level 2) + record scope | `component_tipo` (text component), `section_tipo`, `section_id`, `lang`, `max_charline` (chars per subtitle line), `key` (dato index, default `0`) |

Notes:

- `get_text_from_pdf` is **not** in `API_ACTIONS` (intentionally removed, SEC-024) — internal use only.
- No method is in `BACKGROUND_RUNNABLE` on this class. The long Babel job runs in a separate process started *inside* `automatic_transcription` (and re-checked by the babel class's own `BACKGROUND_RUNNABLE`), while the browser-Whisper path runs in the user's browser; the client uses long request timeouts (3600 s, 1 retry) for the synchronous audio-build/delete calls.
- Engine names and qualities come from the tool config: the shipped `default_config` (dd1633) ships `transcriber_engine` `[{name:"local", type:"browser", label:"Local transcriber"}]` (`client:true`) and `transcriber_quality` with `Xenova/whisper-small` (small), `onnx-community/whisper-large-v3-ONNX` (large), `onnx-community/whisper-large-v3-turbo` (large_turbo), default `large` (`client:true`). Override these in the dd996 Tools-configuration section to add a Babel `server` engine with its `uri`/`key`.

## How it is registered & surfaced

The shipped `register.json` is a **legacy v6** file (raw `components`/`relations` dump) and is auto-converted at import; new tools should use the v7 flat format. Essentials it declares:

- `name` (dd1326): `tool_transcription`; `version` (dd1327): `3.0.3`; `dedalo_version_min` (dd1328): `6.6.0`; developer (dd1644): "Dédalo team"; label (dd799): "Transcription".
- **affected_models** (dd1330 → dd1342 model records, section_ids 8 / 20 / 30): `component_av`, `component_image`, `component_pdf`. The tool therefore attaches inline to those media components.
- **active** (dd1354 → dd64 §1 = Yes): registered active.
- **show_in_inspector** (dd1331 → dd64 §1 = Yes) **and** **show_in_component** (dd1332 → dd64 §1 = Yes): both true — the button renders both in the inspector panel and inline in the component.
- `properties` (dd1335): `{ "open_as": "window", "windowFeatures": null }`.
- `default_config` (dd1633): the `transcriber_engine` / `transcriber_quality` blocks described above.
- UI labels (dd1372): a large multilingual set (`automatic_transcription`, `build_subtitles`, `quality`, `engine`, `chars_per_line`, `processing_audio`, `initializing`, `setting_up`, `transcription_completed`, `cpu_device`, `large`/`small`/`medium`/`large_turbo`, …), fetched client-side via `get_tool_label(...)`.

Surfacing is element-driven (`common::get_tools()`): once the user's profile is authorized for the tool, its button appears on any `component_av`, `component_image` or `component_pdf` element (matched against `affected_models`). The transcription workbench is most useful on AV components that have an adjacent transcription `component_text_area` declared in the section's `tool_config.ddo_map`.

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
// → response.result.pid ; then poll check_server_transcriber_status with that pid
```

Generate a subtitle file from the finished transcript (`build_subtitles_file()`):

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
// → { result:true, url:'…/media/av/subtitles/rsc35_rsc167_1_lg-spa.vtt', msg:'OK…' }
```

The browser-Whisper path instead calls the `create_transcribable_audio_file` action (to get the 16 kHz WAV URL) and runs the model in a Web Worker client-side, writing the result straight into the text component with `set_value`.

## Related

- [tool_subtitles](tool_subtitles.md) — rich-editor subtitle editing tied to AV transcription text
- [tool_tr_print](index.md) — printable/formatted transcript + VTT rendering
- [tool_tc](index.md) — offset all `[TC_…_TC]` timecodes at once
- [tool_pdf_extractor](index.md) — gated PDF text extraction (the supported route for PDF text)
- [tool_posterframe](tool_posterframe.md) and [tool_media_versions](tool_media_versions.md) — other AV media tooling
- [tool_lang](tool_lang.md) / [tool_lang_multi](index.md) — translate the transcribed text
- [Creating new tools](../creating_tools.md), [Server contract](../server_contract.md), [register.json reference](../register_json.md), [Security](../security.md)
- [Exporting data](../../../core/exporting_data.md) (the [tool_export](tool_export.md) side)
