# component_av

## Overview

```json
{
    "could_be_translatable" : false,
    "is_literal"            : true,
    "is_related"            : false,
    "is_media"              : true,
    "modes"                 : ["edit","list","tm","search"],
    "default_tools" : [
        "tool_media_versions",
        "tool_posterframe",
        "tool_time_machine",
        "tool_transcription",
        "tool_upload"
    ],
    "render_views" :[
        {
            "view" : "default | line | print",
            "mode" : "edit"
        },
        {
            "view" : "player | viewer",
            "mode" : "edit"
        },
        {
            "view" : "default | text | mini",
            "mode" : "list | tm"
        }
    ],
    "data"        : "array",
    "sample_data" : [
        {
            "id": 3,
            "files_info": [
                {
                    "quality": "original",
                    "extension": "mp4",
                    "file_name": "test94_test3_1.mp4",
                    "file_path": "/av/original/0/test94_test3_1.mp4",
                    "file_size": 14906377,
                    "file_time": { "timestamp": "2025-12-28 20:12:36" },
                    "file_exist": true
                },
                {
                    "quality": "404",
                    "extension": "mp4",
                    "file_name": "test94_test3_1.mp4",
                    "file_path": "/av/404/0/test94_test3_1.mp4",
                    "file_exist": true
                },
                {
                    "quality": "thumb",
                    "extension": "jpg",
                    "file_name": "test94_test3_1.jpg",
                    "file_path": "/av/thumb/0/test94_test3_1.jpg",
                    "file_exist": true
                }
            ],
            "original_file_name": "memoria_oral.mov",
            "original_upload_date": { "timestamp": "2025-12-28 20:12:37" },
            "original_normalized_name": "test94_test3_1.mp4"
        }
    ],
    "value"        : "string (url)",
    "sample_value" : "/av/404/0/test94_test3_1.mp4"
}
```

!!! note "Typology"
    `component_av` is a **media** component. It extends the abstract `component_media_common` (which extends `component_common`) and implements `component_media_interface`. Like the other media components ([component_image](component_image.md), [component_3d](component_3d.md), [component_pdf](component_pdf.md), [component_svg](component_svg.md)) it does **not** store binary data in the matrix: the `data` column holds a thin JSON pointer (`original_normalized_name` / `modified_normalized_name`), and the live audio/video files live on disk under `DEDALO_MEDIA_PATH`. The concrete class only supplies type-specific constants (qualities, extensions, folder) and FFmpeg-driven conversion/posterframe/subtitle logic; everything structural lives in the base.

!!! info "About `default_tools`"
    The set above is verified from an instance `context.tools` sample. AV instances ship a richer toolbar than the still-media components: `tool_upload` (binds files), `tool_media_versions` (rebuild qualities, `conform_headers`), `tool_posterframe` (set the preview frame), `tool_transcription` (open the timecoded transcription editor) and `tool_time_machine`. The toolbar is assembled from the model + ontology, not hardcoded in the class.

!!! warning "Translatability"
    The media file itself is **not** translatable (`translatable: false`, language `lg-nolan`). The *subtitle* track, however, is per-language: subtitles are stored as one VTT file per language (`{id}_{lang}.vtt`) and the edit datum carries a `subtitles` block for the current `DEDALO_DATA_LANG`.

## Definition

`component_av` manages audio and video media in Dédalo: upload, on-disk storage, quality/version generation, poster-frame previews, subtitle tracks and timecode (TC) processing. It is the media component for any catalogue field that holds a recording rather than a still image.

**Why it exists.** Cultural-heritage archives routinely catalogue moving image and sound: an oral-history interview, a recorded performance, an ethnographic field recording, a conservation video, a digitised reel. These assets need a normalised playable format, lighter derivative qualities for streaming, a poster frame for list previews, and — crucially for oral archives — the ability to anchor a transcription to exact timecodes. `component_av` provides all of that on top of the shared media base, using `media_engine` (`Ffmpeg`) to transcode uploads into Dédalo's standard MP4 format while preserving the original file untouched.

**When to use it.**

- Oral-history / interview recordings, with a synchronised [component_text_area](component_text_area.md) transcription that jumps the player to a clicked timecode.
- Video documentation of objects, sites, performances or conservation processes.
- Audio recordings (music, speech, field recordings) — audio uploads always also generate a dedicated `audio` quality.
- Any asset that needs a downloadable clip/fragment (`download_fragment`) cut between two timecodes, optionally watermarked.

**When not to use it.**

- Still images, scans or photographs -> use [component_image](component_image.md).
- Vector drawings / line art -> use [component_svg](component_svg.md).
- Documents (catalogues, reports) -> use [component_pdf](component_pdf.md).
- 3D models -> use [component_3d](component_3d.md).
- A plain URL pointing at an external video that Dédalo should not ingest -> use [component_iri](component_iri.md) (or wire it as the `external_source` of a media component).

## Data model

**Data:** `array` (normally a single element, key `0`). The element describes the source files plus the reconstructed `files_info`.

**Value:** the displayable URL `string` (default quality in `edit`, poster-frame URL in `list`/`tm`), or `null` when no file exists.

**Storage shape.** A component never touches the database; it reads and writes through its section, which stores the component data in its matrix `data` column. For `component_av` the **persisted** element is intentionally thin — it records only what cannot be reconstructed from disk:

```json
[
    {
        "original_file_name"       : "memoria_oral.mov",
        "original_normalized_name" : "test94_test3_1.mp4",
        "original_upload_date"     : { "timestamp": "2025-12-28 20:12:37" }
    }
]
```

`original_normalized_name` (and, when an edited master exists, `modified_normalized_name`) is the deterministic filename of the source file kept under its own quality folder; derived qualities are generated from it. `original_file_name` keeps the human filename the user uploaded.

At read time `get_files_info()` rebuilds the live picture by scanning disk: for every configured quality and every allowed/alternative extension it calls `get_quality_file_info()` and keeps the entries whose file exists. Each `files_info` object looks like:

```json
{
    "quality"   : "404",
    "extension" : "mp4",
    "file_name" : "test94_test3_1.mp4",
    "file_path" : "/av/404/0/test94_test3_1.mp4",
    "file_size" : 722370,
    "file_time" : { "timestamp": "2025-12-28 19:58:33" },
    "file_exist": true
}
```

When the media lives **outside** Dédalo (the `external_source` property points at a [component_iri](component_iri.md) holding the URL), `get_quality_file_info()` returns an entry flagged `"external": true` whose `file_path` is the external URL, and disk scanning is bypassed.

!!! note "Datum vs. API `entries`"
    The transmitted unit is a `{context, data}` datum. In the API payload the data element is surfaced under `data.entries[0]`, and the controller appends `posterframe_url` and (in `edit`) a `subtitles` block (`subtitles_url`, `lang`, `lang_name`). `context` additionally carries a `features` block describing the instance media capabilities: `allowed_extensions`, `default_target_quality` (`original`), `ar_quality`, `default_quality` (`404`), the current `quality`, `key_dir` (`av`), `alternative_extensions` and `extension` (`mp4`). See the *dedalo-context-data-layers* skill for the full layering rules.

### Qualities and the original model

`component_av` declares its quality model from config constants:

- `get_ar_quality()` -> `DEDALO_AV_AR_QUALITY` = `["original","1080","720","576","404","240","audio"]`.
- `get_default_quality()` -> `DEDALO_AV_QUALITY_DEFAULT` = `"404"` (the served streaming quality).
- `get_original_quality()` -> `DEDALO_AV_QUALITY_ORIGINAL` = `"original"`.
- `get_audio_quality()` -> `"audio"` (always generated on original upload).
- `get_thumb_quality()` -> `"thumb"` (a JPG, `get_thumb_extension()`), generated from the poster frame.
- `get_extension()` -> `DEDALO_AV_EXTENSION` = `"mp4"`; `get_allowed_extensions()` -> `DEDALO_AV_EXTENSIONS_SUPPORTED` (mp4, mov, avi, mpeg, wav, mp3, vob, zip, …).

The uploaded file is preserved under the `original` quality folder keeping its source extension (e.g. `.mov`); the playable `404` quality and any other qualities are transcoded from it by `build_version()`. AV adds two media artefacts beyond the still-media components:

- **Poster frame** — a JPG (`DEDALO_AV_POSTERFRAME_EXTENSION`) stored under `{folder}/posterframe{additional_path}/`. Created by `create_posterframe($current_time, $target_quality?)` via `Ffmpeg::create_posterframe` (default capture at 10s); `create_thumb()` then rasterises it into the `thumb` quality with `ImageMagick::dd_thumb`.
- **Subtitles** — one VTT (`DEDALO_AV_SUBTITLES_EXTENSION`) per language under `{folder}{DEDALO_SUBTITLES_FOLDER}/`, named `{id}_{lang}.vtt`.

### Naming and storage paths

Filenames are deterministic: `id . '.' . extension`, where `id = get_id() = {component_tipo}_{section_tipo}_{section_id}` (AV is non-translatable, so no `_lang` suffix on the media file). The quality path is

```text
DEDALO_MEDIA_PATH + folder + initial_media_path + '/' + quality + additional_path
```

`folder` is `DEDALO_AV_FOLDER` (`/av`); `initial_media_path` and `additional_path` come from section/ontology properties. `additional_path` defaults to `/0` and can be bucketed by `max_items_folder` (e.g. `/1000`, `/2000`) to avoid too many files per directory. The path builders run `sanitize_quality()` (SEC-065) so client-supplied quality strings can never escape the media tree.

## Ontology instantiation

A `component_av` is created as an ontology node whose `model` is `component_av`. Its `parent` is the section (or grouper) it belongs to, and its `section_tipo` wires it into that section. Being a media component it is normally declared non-translatable.

Node definition (shape):

```json
{
    "tipo"         : "rsc167",
    "model"        : "component_av",
    "parent"       : "rsc197",
    "section_tipo" : "rsc197",
    "lg-eng"       : "Audiovisual",
    "lg-spa"       : "Audiovisual",
    "translatable" : false,
    "properties"   : { }
}
```

Realistic `properties` block for an oral-history recording wired to a timecoded transcription, that also stores the uploaded filename and duration into sibling text fields and buckets files by 1000:

```json
{
    "max_items_folder" : 1000,
    "target_filename"  : "rsc53",
    "target_duration"  : "rsc54",
    "observe": [
        {
            "client": { "event": "click_tag_tc", "perform": { "function": "go_to_time" } },
            "component_tipo": "rsc171"
        },
        {
            "client": { "event": "key_up_esc", "perform": { "function": "play_pause" } },
            "component_tipo": "rsc171"
        },
        {
            "client": { "event": "key_up_f2", "perform": { "function": "get_data_tag" } },
            "component_tipo": "rsc171"
        }
    ]
}
```

`section_tipo` / `parent` tell the section which column owns this component's data; on `save()` the section is the single writer to the database. The media files themselves are written to disk by the upload flow (below), and `save()` only refreshes the thin pointer element and triggers `valor`/list-value recomputation.

## Properties & options

All properties are optional and live in the ontology node `properties` JSON. Verified names consumed by this component (and its media base):

### target_filename

- **Values:** a component tipo (string) — normally a [component_input_text](component_input_text.md) in the same section.
- **Effect:** on upload of the `original` quality, `process_uploaded_file()` writes the human upload filename (e.g. `memoria_oral.mov`) into that sibling component and saves it. Used to keep the original filename visible/searchable.

### target_duration

- **Values:** a component tipo (string) — normally a [component_input_text](component_input_text.md) (commonly `rsc54`).
- **Effect:** on upload, the file duration is read from the media metadata (`get_duration()`), converted to a timecode string with `OptimizeTC::seg2tc()` (e.g. `00:05:20:125`) and saved into that sibling component.

### external_source

- **Values:** a component tipo (string) pointing at a [component_iri](component_iri.md) in the same section.
- **Effect:** when set, the playable source is read from that IRI instead of Dédalo's media tree. `get_quality_file_info()` returns an `"external": true` entry and `get_diffusion_value()` emits the external URL. Use it for AV hosted outside Dédalo.

### initial_media_path

- **Values:** object keyed by component tipo -> path string (e.g. `{"rsc167": "/my_custom_name"}`).
- **Effect:** inserts a fixed path segment between `folder` and `quality`, letting an instance store its files in a custom sub-tree. Inherited from `component_media_common`.

### max_items_folder

- **Values:** integer (commonly `1000`).
- **Effect:** buckets files into numbered sub-folders (`additional_path` becomes `/0`, `/1000`, `/2000`, … by `floor(section_id / max_items_folder) * max_items_folder`) so a single directory never holds an unbounded number of files. Inherited from `component_media_common`.

### observe / observers

- **Values:** array of observe/observable descriptors (`{client: {event, perform: {function}}, component_tipo}`).
- **Effect:** client-side event wiring. The AV player exposes the functions that transcription components drive: `go_to_time` (jump to a clicked `[TC ...]` tag, event `click_tag_tc`), `play_pause` (event `key_up_esc`) and `get_data_tag` (build a TC tag at the current frame, event `key_up_f2`). The observable side (a [component_text_area](component_text_area.md) transcription) publishes these events; the AV component subscribes. See *Observers and observables* on the [index page](index.md).

!!! note "Standard context properties"
    Like every component, `component_av` honours the generic ontology context blocks carried into the datum `context`: `css` (stamped on `.wrapper_component`), `request_config` (RQO) and `view` (the render view). These are not component-specific options. Any other custom key seen in production should be verified in the ontology.

## Render views & modes

Views are selected from `context.view` (default `default`) and dispatched per mode. Verified from the JS render files and LESS:

| View | edit | list / tm | search | Notes |
| --- | :---: | :---: | :---: | --- |
| `default` | yes | yes | (via search render) | Poster frame + HTML5 video/audio player with upload UI and player controls. |
| `line` | yes | — | — | Compact inline variant of the default edit view (label hidden in list). |
| `print` | yes | — | — | Forces read-only (`permissions = 1`) and reuses the default edit render. |
| `player` | yes | — | — | Full interactive player surface (`view_player_edit_av`): control buttons, SMPTE timecode readout, TC capture; used by the transcription workflow and `open_av_player`. Label hidden. |
| `viewer` | yes | — | — | Full-screen black viewer (`view_viewer_edit_av`) with a download button; opened in a separate window (e.g. fragment review). |
| `text` | — | yes | — | Plain textual representation of the value (`view_text_list_av`). |
| `mini` | — | yes | — | Minimal thumbnail (`component_av_mini`, JPG thumb), e.g. service autocomplete / grids. |

Modes:

- **edit** — read/write a real record: upload, generate/rebuild qualities, set the poster frame, manage subtitles, drive the player. The datum carries `posterframe_url` and a per-language `subtitles` block.
- **list / tm** — read-only listing. `get_list_value()` returns only the `default_quality` (`404`) and `thumb` `files_info` entries; the value shown is the poster-frame URL. `tm` (Time Machine) reuses the list render and resolves the last deleted file under the `/deleted` folder.
- **search** — one text input per filter feeding the SQO (via the `search_component_media_common` trait); saves are blocked.

## Import / export model

**Import.** Media import is unusual: there are no inline binaries in a CSV. The thin pointer element can be supplied as the JSON shape used in storage (the array with `original_normalized_name` etc.), but normally AV is populated through the **upload flow**, not the row importer. `conform_import_data()` (inherited from `component_common`) JSON-decodes the cell when it is valid JSON and hands the resulting array to `set_data()`; non-JSON plain strings are not value-property data for media and are logged rather than stored. See [importing data](../importing_data.md).

Upload flow (the real ingestion path), in order:

1. `dd_utils_api::upload()` — permission-gated (`assert_section_permission` write = 2), supports chunked uploads, confines the target path, then `move_uploaded_file`.
2. `tool_upload::process_uploaded_file()` — normalises and binds the file to the component.
3. `component_media_common::add_file()`.
4. `component_av::process_uploaded_file()` — records `original_file_name` / `original_normalized_name` / `original_upload_date`, runs `target_filename` / `target_duration`, builds the `audio` quality for audio uploads, then `regenerate_component()` transcodes the `404` default and creates poster frame + thumb.

**Export.** `get_export_value()` emits a single atom (`cell_type: 'img'`) whose value is the default-quality URL in `edit` mode, or the poster-frame URL otherwise; URL absoluteness comes from the `export_context`. `get_diffusion_value()` reduces to the default-quality URL (or `{id}.{extension}` when `DEDALO_PUBLICATION_CLEAN_URL` is on), or the `external_source` URL when the media is external. Clip download is a separate API action (`download_fragment` on `dd_component_av_api`): it cuts a fragment between two timecodes at a chosen quality, optionally watermarked, and returns a URL for the client to download. See [exporting data](../exporting_data.md).

## Notes

- **Observers / observables.** AV ships **no** `events_subscription.js`; all event wiring is declared in the ontology `properties->observe` (see above). The transcription editor publishes `click_tag_tc` / `key_up_esc` / `key_up_f2`; the AV player subscribes and runs `go_to_time` / `play_pause` / `get_data_tag`.
- **Default tools.** A typical instance exposes `tool_upload`, `tool_media_versions`, `tool_posterframe`, `tool_transcription` and `tool_time_machine` in `context.tools` (read-only context).
- **Access control.** Files are guarded by `media_protection` (`DEDALO_MEDIA_ACCESS_MODE`: `false` / `private` / `publication`): logged-in users carry the fixed `dedalo_media_auth` cookie matched against a daily-rotated marker in `.publication/auth/`; anonymous publication access is allowed only to configured public-quality folders when a `.publication/pub/{section_tipo}_{section_id}` marker exists. Enforcement is fail-closed in the web server. See the *dedalo-media-protection* skill.
- **Deletion / restore.** `delete_file($quality, $extension?)` and `remove_component_media_files()` rename files into a `/deleted` folder (the poster frame too) rather than hard-deleting; `restore_component_media_files()` recovers the newest deleted version (driven by Time Machine).
- **DVD / VOB.** `move_zip_file()` unpacks zipped `VIDEO_TS` / `AUDIO_TS` structures; `get_video_size()` sums the VOB sizes for DVD-folder media.
- **Related components:** [component_image](component_image.md), [component_3d](component_3d.md), [component_pdf](component_pdf.md), [component_svg](component_svg.md), [component_iri](component_iri.md), [component_text_area](component_text_area.md), [component_input_text](component_input_text.md).
