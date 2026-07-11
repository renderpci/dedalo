# PROMPT: Rebuild the Dédalo media subsystem in native TypeScript

Standing spec for the media family, companion to `engineering/REWRITE_SPEC.md` (whose constraints — §2 absolute constraints, §2b code style, §4 concurrency/persistent-runtime, §7 security — apply here unchanged), `engineering/SECTION_SPEC.md` (media components live inside sections; the delete/duplicate/save record lifecycle is shared), and `engineering/RELATIONS_SPEC.md`. PHP reference tree: `/Users/render/Desktop/trabajos/dedalo/v7/master_dedalo` (read-only). All `file:line` anchors below point into that tree and have been verified against it (2026-07-03). Live-ontology corpus from `dedalo_mib_v7`.

Scope: the five media component models (**component_image, component_av, component_pdf, component_svg, component_3d** + `component_media_common`, the PHP base they all extend, as the shared TS core), the media processing engine (ImageMagick / ffmpeg / pdf tools), the upload ingest pipeline, and the media tools (**tool_upload, tool_media_versions, tool_posterframe, tool_image_rotation, tool_pdf_extractor, tool_tc, tool_transcription (local half), tool_import_files**).

**Absolute engine constraint (user direction):** all media processing shells out to external binaries — **ImageMagick, ffmpeg/ffprobe, qt-faststart, pdftotext/pdftohtml, pdfinfo, ocrmypdf** — via `Bun.spawn`. **No third-party TS/npm media libraries** (no sharp, jimp, fluent-ffmpeg, pdf-lib). The tree is already clean of them; keep it that way.

**Absolute config constraint (user direction, 2026-07-03):** formats, qualities, extensions, thumbnail dimensions, folder names, and binary paths are **configuration, not code** — defined through the config system (`<private>/.env` + the typed config catalog), exactly as PHP defines them in `core/base/config/catalog/domains/media_image.php` / `media_av.php` / `media_docs.php`. Keep the PHP `DEDALO_*` key names and PHP defaults; an installation must be able to tune the media catalog without touching a module (§3).

Out of scope, explicitly ledgered — never silently narrowed:

- **Media protection (marker store / fixed-name auth cookie / `media_index` / `.htaccess`/nginx rewrite rules)** — its own subsystem with three lockstep enforcement surfaces (see `dedalo-media-protection`), PHP/web-server-owned today; TS only *reports* it (the `media_control.get_value` widget). It gets its own spec. `REWRITE_SPEC §7.9` already flags the auth-cutover as an ask-the-user decision. STATUS.md's media-access-control ⬜ row stays honest. This spec only names the boundary.
- **Babel / Whisper remote transcription API** (`tools/tool_transcription/transcribers/babel/`) — external network service + credentials; only the local/ffmpeg seams (`audio`/`audio_tr` builds, VTT subtitle write, `tool_tc`) ship here.
- **3D format converters** (`DEDALO_3D_GLTFPACK_PATH` / `_FBX2GLTF_PATH` / `_COLLADA2GLTF_PATH`, `media_docs.php:190-206`) — defined as constants but **never invoked** in the reference tree; `component_3d` has no `build_version` override, so `web` is a naive copy. Port the copy; ledger the converters as PHP-dead.
- **PHP `processes` table interop** — TS jobs are TS-visible only (sessions are not shared between the two servers); documented, not a gap.
- **tool_subtitles server side** — `API_ACTIONS = []` (`class.tool_subtitles.php:69`); a purely client-side editor. VTT files are written server-side by `tool_transcription::build_subtitles_file` (§8), not here.

Keep a coverage ledger of what the rebuild does not yet cover.

---

## 1. Mission & honest status

**Media components store no pixels in the database — they store a materialized *index* (`files_info`) of files living in a shared on-disk layout, regenerated from the filesystem on every `save()`.** The DB row is a cache of the disk; the disk is addressed by a deterministic grammar (identifier + quality directories + numeric buckets). Everything else — upload, derivative generation, rotation, posterframes, OCR, soft-delete — is choreography around that invariant. Because the PHP and TS servers share the SAME database AND the SAME media directory (`REWRITE_SPEC §2.2`), byte/structure compatibility of *both* surfaces — the stored `files_info` JSON and the on-disk file layout — is non-negotiable.

The current TS implementation is judged **not done correctly** and is hereby superseded as a foundation. What exists is real and differential-gated, but it is **read-only projection glue only** — the entire ingestion/derivative half of the subsystem is absent:

- **No ingestion at all.** There is no upload endpoint, no derivative/quality generation, no `Bun.spawn` of any media binary, no posterframe/thumbnail/transcode/metadata extraction. `dispatch.ts` has save/read/delete/duplicate actions but no upload/process action. The engine assumes `files_info` was already populated by the legacy PHP media engine and merely reads/serves/moves those records. "Not done correctly" is really "barely started."
- **Quality knowledge is hardcoded and incomplete.** `src/core/resolve/media_list_value.ts` hardcodes `LIST_QUALITIES` for `component_image` (`['1.5MB','thumb']`), `component_svg` (`['web']`), `component_pdf` (`['web','thumb']`) — **`component_av` and `component_3d` are absent**, so `isMediaModel('component_av')` is `false` and AV/3D are unsupported on the read path. Default qualities are scattered as literals across `media_list_value.ts`, `relation_list.ts:264-300`, and `environment.ts:103-171` instead of centralized in config. **This is the named defect the §3 config mandate fixes.**
- **Files are trusted-as-stored, never computed.** No path builder derives `{model}/{quality}/{bucket}/{id}.{ext}` from a record; the engine cannot regenerate or verify a missing derivative. `file_path` is passed through verbatim from the stored `files_info`.
- **Duplicate does not copy physical files.** `duplicate_record.ts:20` explicitly ledgers "media-file duplication (physical file copies + regenerate)" as a TODO; the jsonb `files_info` is copied but the files are not.
- **Media protection is a reporting shell** (out of scope here; §Out-of-scope).

**Salvage (proven — keep, do not rewrite blind):** the delete-time soft-move `removeSectionMediaFiles` (`src/core/section/record/delete_record.ts:119-162`, both datestamp formats, unit-gated `test/unit/delete_media_files.test.ts`); the dev-only session-gated serving route (`src/server.ts:126-155`, traversal-guarded, fail-closed 404); the media export cells (`tool_export` media URL resolution, `STATUS.md:594`); the `media_control.get_value` dashboard widget (`widget_request.ts:~1640`); the explicit tool dispatch registry (`src/core/resolve/tool_request.ts`, `TOOL_API_ACTIONS`); the media list/read differentials (image/svg/pdf list-mode byte-parity, `model_coverage_sweep.test.ts`). The differential suite is the validation harness: it must stay green throughout with **zero fixture/normalization changes** (the relations/section/area rebuild rule).

---

## 2. The unifying model — five types, four laws

PHP class tree (verified): `component_common` → `component_media_common` (`core/component_media_common/class.component_media_common.php:137`, `use search_component_media_common`) → { `component_image`, `component_av`, `component_pdf`, `component_svg`, `component_3d` }. Canonical registry: `component_media_common::get_media_components()` = `['component_3d','component_av','component_image','component_pdf','component_svg']` (`:309`). Each subclass mostly just reads the config constants of its type (§3) and overrides the per-type processing hook.

Four laws every module below serves:

1. **Identity law.** Identifier = `{component_tipo}_{section_tipo}_{section_id}` plus `_{DEDALO_DATA_LANG}` when the ontology node is translatable (`get_id` `:649-681`, lang suffix `:672-674`; `get_name` is an alias `:692`). The file for a quality = `get_media_path_dir(quality) . '/' . id . '.' . ext` (`get_media_filepath :3356`). The directory = `DEDALO_MEDIA_PATH + /<type_folder> + <initial_media_path> + /<quality> + <additional_path>` (`get_media_path_dir :2859`). `initial_media_path` is an optional per-section top-level segment (`get_initial_media_path :715`). `additional_path` is the numeric bucket subfolder: either a value pulled from another component, or `'/' + max * floor(section_id / max)` from `properties.max_items_folder` (`get_additional_path :753-819`) — this yields the `/0`, `/1000` buckets seen in `…/image/1.5MB/0/`. Example file: `rsc29_rsc170_770.jpg` in `…/image/1.5MB/0/`.

2. **Index law.** `files_info` is NOT hand-authored — it is regenerated on every `save()` by scanning the filesystem (`update_component_data_files_info :3710` → `get_files_info :1343` → `get_quality_file_info :2496`, the single authoritative writer). Each entry `{quality, file_exist, file_name, file_path, file_size, file_time(dd_date), extension, external?}` (`:106-126`, `:2496`); `file_path` is stored **relative** to `DEDALO_MEDIA_PATH` (`str_replace(DEDALO_MEDIA_PATH,'',…) :2595`), leading slash; `file_time` from `filemtime()` → `dd_date` (`:2583`); external sources set `external:true` and `file_path` = the external URL (`:2504`). Entry shape, key order, and value formats are DB/wire contract. Sibling keys stored in `data[0]` alongside `files_info`: `original_file_name`, `original_normalized_name` (e.g. `"rsc29_rsc170_770.tif"`), `original_upload_date` (dd_date), `modified_file_name/modified_normalized_name/modified_upload_date` (image retouched tier), `lib_data` (component_image only).

3. **Original law.** The `original` tier holds BOTH the raw upload (e.g. `.tif`) and a normalized default-ext copy (`.jpg`) side by side. `get_original_extension :2689` finds the raw one (excludes files matching `get_target_filename`); `get_original_file_path :2764` prefers the normalized copy as conversion source. The original is **never** rotated, cropped, or transcoded in place — it is the regeneration source of truth; every derivative rebuilds from it (idempotent `regenerate_component :3153`).

4. **No-hard-delete law.** Live media never hard-deletes. `delete_file(quality[,ext]) :1711` → `remove_component_media_files :1802` → per quality × extension `move_deleted_file :1929`: target dir `<quality>/deleted[/<bulk_process_id>]`, new name `<id>_deleted_<Y-m-d_Hi>.<ext>` (or plain `<id>.<ext>` in bulk mode) via `rename()`. `rename_old_files :1193` backs up any existing target before every overwrite (same `deleted/` datestamp scheme). Time-machine reads scan `deleted/` for the most-recent match (`get_url` TM mode `:2924-2931`; `get_deleted_image` globs + natsort, `component_image:662`). **Posterframe deletion is the one true `unlink`** (`component_av:509`). `duplicate_component_media_files :1999` copies all quality/ext files to a new section_id.

---

## 3. Quality / type catalog — env-defined config (user mandate)

"Quality" = a named sub-directory under the media-type folder, ordered high→low. **Every value in this section is CONFIGURATION, not code** — defined through the TS config catalog + `<private>/.env` under the PHP `DEDALO_*` key names, with the PHP defaults when a key is unset (the same mechanism the tree already uses for `DEDALO_MEDIA_DIR` / `MEDIA_PATH`). `concepts/media.ts` (§5.1) is the typed accessor/validator over that config, NOT a hardcoded source of truth. The current `LIST_QUALITIES` in `media_list_value.ts` and the literals in `environment.ts:103-171` are the defect this replaces.

PHP source: the config catalog domains define each constant as a `config_key{path, const, type, default, doc}` object, `.env`-overridable by dotted `path` — e.g. `media.image.ar_quality` / `DEDALO_IMAGE_AR_QUALITY` (`media_image.php:151`). The TS catalog mirrors these keys.

| Type | Quality ladder (`*_AR_QUALITY`) | Default | Original | Folder | Def. ext | Allowed extensions (`*_EXTENSIONS_SUPPORTED`) | Alt ext |
|---|---|---|---|---|---|---|---|
| image | `original,modified,100MB,25MB,6MB,1.5MB,thumb` | `1.5MB` | `original` | `image` | `jpg` | jpg,jpeg,png,tif,tiff,bmp,psd,raw,webp,heic,avif | `[]` |
| av | `original,1080,720,576,404,240,audio` | `404` | `original` | `av` | `mp4` | mp4,wave,wav,aiff,aif,mp3,mov,avi,mpg,mpeg,vob,zip,flv | — |
| pdf | `original,web` | `web` | `original` | `pdf` | `pdf` | pdf,doc,pages,odt,ods,rtf,ppt | `['jpg']` |
| svg | `original,web` | `web` | `original` | `svg` | `svg` | svg | — |
| 3d | `original,web` | `web` | `original` | `3d` | `glb` | glb,gltf,obj,fbx,dae,zip | — |

**Config-key catalog to mirror** (verbatim PHP const names; group under TS config `media.image.*` / `media.av.*` / `media.pdf.*` / `media.svg.*` / `media.3d.*` paths):

- **image** (`media_image.php`): `DEDALO_IMAGE_AR_QUALITY` (:153), `DEDALO_IMAGE_QUALITY_DEFAULT` (:137), `DEDALO_IMAGE_QUALITY_ORIGINAL` (:121), `DEDALO_IMAGE_QUALITY_RETOUCHED`='modified' (:129), `DEDALO_IMAGE_FOLDER` (:63), `DEDALO_IMAGE_EXTENSION` (:71), `DEDALO_IMAGE_EXTENSIONS_SUPPORTED` (:99), `DEDALO_IMAGE_ALTERNATIVE_EXTENSIONS` (:108), `DEDALO_IMAGE_MIME_TYPE` (:79), `DEDALO_IMAGE_PRINT_DPI`=150 (:166), plus the shared thumb keys `DEDALO_QUALITY_THUMB`='thumb' (:31), `DEDALO_THUMB_EXTENSION`='jpg' (:23), `DEDALO_IMAGE_THUMB_WIDTH`=222 (:43), `DEDALO_IMAGE_THUMB_HEIGHT`=148 (:51).
- **av** (`media_av.php`): `DEDALO_AV_AR_QUALITY` (:98), `DEDALO_AV_QUALITY_DEFAULT`='404' (:83), `DEDALO_AV_QUALITY_ORIGINAL` (:75), `DEDALO_AV_FOLDER` (:24), `DEDALO_AV_EXTENSION` (:32), `DEDALO_AV_EXTENSIONS_SUPPORTED` (:46), `DEDALO_AV_POSTERFRAME_EXTENSION`='jpg' (:111), `DEDALO_SUBTITLES_FOLDER`='/subtitles' (:166), `DEDALO_AV_SUBTITLES_EXTENSION`='vtt' (:174), `DEDALO_AV_RECOMPRESS_ALL` (:187), and the binary paths `DEDALO_AV_FFMPEG_PATH` (:123), `DEDALO_AV_FFPROBE_PATH` (:141), `DEDALO_AV_FASTSTART_PATH` (:132), `DEDALO_AV_STREAMER` (:154).
- **pdf/svg/3d** (`media_docs.php`): `DEDALO_PDF_AR_QUALITY` (:89) / `DEDALO_PDF_QUALITY_DEFAULT` (:81) / `DEDALO_PDF_EXTENSIONS_SUPPORTED` (:39) / `DEDALO_PDF_ALTERNATIVE_EXTENSIONS`=['jpg'] (:48) / `PDF_AUTOMATIC_TRANSCRIPTION_ENGINE` (:100) / `PDF_OCR_ENGINE` (:109); `DEDALO_SVG_*` (:218-267); `DEDALO_3D_*` (:122-206, converters ledgered PHP-dead).
- **binary base**: `MAGICK_PATH` and the ffmpeg/ffprobe/faststart/pdf-engine paths derive from `paths.binary_base` (`/opt/homebrew/bin` on Darwin, `/usr/bin` otherwise — `paths.php:230-236`); expose as config keys so an install can point at its own binaries.

Derived laws (config-driven, not hardcoded):
- **image quality → pixel budget**: `convert_quality_to_megabytes` parses `'1.5MB'`→1.5, `'>100MB'`→101, `'<1MB'`→0.9 (`component_image:576`); pixel area = MB × `350000` (empirical constant, `get_target_pixels_to_quality_conversion :1850-1899`); `short_axis = area/ratio`, `height = sqrt(short_axis)`, `width = height*ratio`; **never upscale** (caps to source `:1358`).
- **quality sanitization (SEC-065)**: `sanitize_quality :2830` allows only `[A-Za-z0-9_\-.]+`, rejects `.`/`..`, else falls back to the original quality; called by both `get_media_path_dir` and `get_media_url_dir`. The TS accessor STRENGTHENS this: charset gate AND catalog membership for the type (§5.1 `assertValidQuality`).

A module reading a hardcoded quality/extension/dimension string instead of the config accessor is a spec violation — the executor must forbid it (the §1 defect).

---

## 4. The processing engine — external-binary command corpus

Two static façade classes in PHP (`core/media_engine/class.ImageMagick.php`, `class.Ffmpeg.php`); all binary dirs derive from `paths.binary_base`. Every command runs `nice -n 19`; every path is `escapeshellarg`-quoted. **The TS rewrite reproduces the argument RECIPES exactly but eliminates the shell entirely (§5.3) — argv arrays, no `escapeshellarg`, no `.sh` files.** The recipes below are the parity contract.

### 4.1 ImageMagick (`class.ImageMagick.php`)
Binary resolution: `MAGICK_PATH.'magick'` if it exists, else `.'convert'` (`:83`); identify = `magick identify` (v7) or `identify` (v6) (`:111`); `pdfinfo` at `MAGICK_PATH.'pdfinfo'` (`:138`).

- **`dd_thumb` (`:184`)** — `nice -n 19 <magick> -define jpeg:size=400x400 <src> -thumbnail '<W>x<H>>' -auto-orient -gravity center -unsharp 0x.5 -quality 90 <dst>` (`:206-209`). `>` = shrink-only. W/H from `DEDALO_IMAGE_THUMB_WIDTH/HEIGHT`.
- **`convert` (`:275`)** — the central engine, command `nice -n 19 <magick> <begin_flags> <src[layers]> <middle_flags> <dst>` (`:466-469`):
  - **Colorspace**: probe `identify -quiet -format '%[colorspace]' <src>[0]` (`:330`); if CMYK → inject `-profile <COLOR_PROFILES_PATH>Generic_CMYK_Profile.icc -profile …sRGB_Profile.icc` then `-strip` (`:408-448`). ICC files vendored from `core/media_engine/lib/color_profiles_icc/`.
  - **Transparency/meta-channel**: `is_opaque` via `identify -format '%[opaque]'` (`:913`); `has_meta_channel` via `identify -format '%[channels]'` on tif/psd only (`:595`). Meta channel → `-channel-fx "meta0=>alpha"`; transparent → `\( -clone 0 -alpha on -channel rgba -evaluate set 0 \)` (`:378-384`).
  - Background `#ffffff` for opaque/jpg else `none`; `-layers merge` (`:388`); optional `-thumbnail`, `-coalesce`, `-composite`, `-flatten`, `-quality`, `-auto-orient`, `-quiet`, `-resize`. PDF source adds `-density <dpi> -antialias -define pdf:use-cropbox=true` (`:342-351`).
  - Non-zero exit is not fatal unless output contains `ERROR:` (`:493`).
- **`rotate` (`:697`)** — `<magick> <src> <color> [+|-]distort SRT <deg> +repage <dst>` (`:717-719`); `+distort` = expanded canvas, `-distort` = fixed. Background: color → `-virtual-pixel background -background <c> -interpolate Mesh`; alpha → `-alpha set -virtual-pixel transparent -background none -interpolate Mesh` (`:707-713`).
- **`crop` (`:781`)** — `<magick> <src> -crop {W}x{H}+{x}+{y} +repage <dst>` (`:795`); fails on `geometry does not contain image` even at exit 0 (`:819-827`).
- **`get_media_attributes` (`:861`)** — `<magick> <file> json:` → decoded array (one object per layer).
- **`get_dimensions` (`:1027`)** — three `identify` calls (`%[orientation]`, `%w`, `%h` on `[0]`); swaps W/H for `LeftBottom`/`RightTop` EXIF orientations (`:1054-1065`).
- **`get_date_time_original` (`:964`)** — `identify -format "%[EXIF:DateTimeOriginal]"`, fallback `%[date:modify]` → dd_date.

### 4.2 Ffmpeg (`class.Ffmpeg.php`)
Binaries `DEDALO_AV_FFMPEG_PATH` / `_FFPROBE_PATH` / `_FASTSTART_PATH` (§3). Settings dir `core/media_engine/lib/ffmpeg_settings` (39 profiles).

- **`build_av_alternate_command` (`:491`)** — the main transcoder. Resolves a settings file `<setting_name>.php` via `get_setting_name` = `<quality>_<pal|ntsc>_<16x9|4x3|…>` (`:274`; PAL/NTSC from `avg_frame_rate`, fps≥29→ntsc, `get_media_standard :321`; aspect from `display_aspect_ratio`, `get_aspect_ratio :909`), `require`s it to import `$vb,$s,$g,$vcodec,$progresivo,$gammma,$force,$ar,$ab,$ac,$acodec,$target_path`. Emits a **two-pass libx264** chain (DVD dirs → `concat:<vob>|<vob>`, `:583-631`):
  - Pass 1: `nice -n 19 <ffmpeg> -i <src> -an -pass 1 -vcodec $vcodec -vb $vb -s $s -g $g $progresivo $gammma -f $force -loglevel error -passlogfile <log> -y /dev/null` (`:766`)
  - Pass 2: `… -pass 2 … -y -acodec $acodec -ar $ar -ab $ab -ac $ac -y <tmp>` (`:773-775`)
  - `nice -n 19 <qt-faststart> <tmp> <target>` then `rm -f <tmp>`, `rm -f <log>*`, `rm -f <sh>` (`:782-793`).
  - Audio-only setting: `nice -n 19 <ffmpeg> -i <src> -vn -acodec $acodec -ar 44100 -ab 128k -ac 2 <target>` (`:710`); `audio_tr` → `-vn -ar 16000 -ac 1` (16 kHz mono for speech-to-text, `:695`).
  - tmp dir = `DEDALO_MEDIA_PATH + '/av' + '/tmp'` (`:635`).
- **`create_posterframe` (`:1075`)** — `<ffmpeg> -ss <tc> -i <src> -y -vframes 1 -f rawvideo -an -vcodec mjpeg -s <WxH> <dst>` (`:1153`). Size by quality: original 936×720 (4×3)/1280×720 (16×9), thumbnail from `DEDALO_IMAGE_THUMB_HEIGHT`, else 540×404/720×404 (`:1118-1130`). `timecode = number_format(x,3)`. Returns false if no video stream (audio-only).
- **`build_fragment` (`:1200`)** — no watermark → `<ffmpeg> -ss <in> -i <src> -t <dur> -vcodec copy -acodec copy -y <dst>` (`:1281`); watermark → stream-copy temp then `-vf "movie=<wm> [watermark]; [in][watermark] overlay=main_w-overlay_w-10:10 [out]"` (`:1273-1274`). TC via `OptimizeTC::seg2tc`.
- **`conform_header` (`:1346`)** — `<ffmpeg> -i <src> -c:v copy -c:a copy <tmp> && mv <src> <src>_untouched && <qt-faststart> <tmp> <src> && rm -f <tmp>` (`:1374-1385`).
- **`convert_to_dedalo_av` (`:1497`)** — one-pass: `nice <ffmpeg> -y -i <src> -vf "yadif=0:-1:0, scale=-2:<DEDALO_AV_QUALITY_DEFAULT>" -vb 960k -g 75 -f mp4 -vcodec libx264 -acodec $acodec -ar 44100 -ab 128k -ac 2 -movflags faststart <tmp> && mv <tmp> <target>` (`:1522-1523`); `$async` (default true) appends `> /dev/null &` (`:1531`).
- **Probes**: `get_media_attributes` = `ffprobe -v quiet -print_format json -show_format` (`:1585`); `get_media_streams` = `ffprobe -v quiet -show_streams -print_format json`, cached per path (`:1651`); `get_audio_codec` picks `libfdk_aac > libvo_aacenc > aac` from `ffmpeg -loglevel error -buildconf` (`:1722`).
- **Settings profiles**: `lib/ffmpeg_settings/*.php` — port ALL 39 to ONE typed TS data table (§5.2) keyed `setting_name`. Sample `404_pal_16x9.php`: `$vb='1024k'; $s='720x404'; $g=25; $vcodec='libx264'; $progresivo='-vf yadif'; $force='mp4'; $ar=44100; $ab='64k'; $ac='1'; $acodec` (overridden by the buildconf pick); `audio.php`: `$force='mp4'`, `$target_path='audio'` (audio branch hard-codes `-ar 44100 -ab 128k -ac 2`).

### 4.3 PDF (`core/component_pdf/class.component_pdf.php`)
- **Text/HTML extraction** (`get_text_from_pdf :743`): `source = get_media_filepath(get_default_quality())` (`:757`); resolve engine binary `shell_exec('type -P '.$engine)` (`:773`) → TS boot-probe equivalent; flags `-f <page_in> -l <page_out>`, html mode adds `-i -p -noframes -layout` and `.html` ext (text → `.txt`) (`:806-821`); command `<engine> -enc UTF-8<config> <src> <text_filename>` (`:831`), `exec` synchronous (`:838`); output containing `error` → fail. Read → `valid_utf8` → `utf8_clean` (iconv IGNORE + control-char strip) → JSON round-trip validation (`:863-892`).
- **OCR** (`PDF_OCR_ENGINE = ocrmypdf`): `ocrmypdf --pdfa-image-compression lossless -l <lang> --force-ocr <src> <src>` (in-place, `:1003-1006`).
- **pdfinfo** (Poppler) for page count; PDF→jpg cover via `ImageMagick::convert` with density (`create_alternative_version :1422`). **PDF thumb** (`create_thumb :279`) also goes through `convert`, not `dd_thumb`: it selects the **first page only** (`ar_layers=[0]` → `<pdf>[0]`) at density 72 / quality 75 with `pdf:use-cropbox=true`, resized to the thumb box. TS `buildThumbVersion()` branches on `component_pdf` for exactly this (`processing.ts`); the `[0]` selector is mandatory — the scene-less `dd_thumb` recipe splits a multi-page PDF into `<stem>-0.jpg`/`-1.jpg`/… and never the bare temp the rename targets (→ `ENOENT`). Regression-gated in `test/unit/media_processing.test.ts` (multi-page fixture).

### 4.4 SVG / 3D
- SVG thumb: rasterized via `ImageMagick::convert` (`component_svg:395`).
- 3D: `web` = naive copy via base `build_version :3543` (no override); 3D thumb via `ImageMagick::dd_thumb` from an auto-posterframe (`component_3d:440`). Converters ledgered PHP-dead (§Out-of-scope).

### 4.5 Rewrite gotchas (carry over)
- `nice -n 19` on every media command (shared-host courtesy — keep as an argv prefix).
- Two-pass x264 needs a `passlogfile` and cleanup — becomes structural in TS (per-job scratch dir, `finally` cleanup).
- `is_opaque`/`has_meta_channel` are TIFF/PSD-specific and OS-sensitive (`MAGICK_CONFIG = {remove_layer_0, is_opaque}`, `media_image.php:201`) — carry the platform flags into config.
- Load-bearing PHP typos (`$gammma` triple-m in every settings file; `get_ffprove_installed_path`) — use clean internal TS names; they have zero wire/disk surface.

---

## 5. TS module design

Follows the AREA/SECTION/RELATIONS pattern: ONE contract module in `concepts/`, one subsystem home, tool handlers plugged into the existing explicit `TOOL_API_ACTIONS` registry (`tool_request.ts`). Spawn pattern proven in `src/core/resolve/backup.ts`.

```
src/core/concepts/media.ts          — THE contract: type/quality catalog accessor (env-config), allowlists, id-grammar types
src/core/media/
  path.ts                           — path builder (id grammar + media-dir grammar + buckets + assertInsideMediaRoot)
  files_info.ts                     — filesystem → files_info scanner/regenerator (byte-compat)
  file_ops.ts                       — soft-delete move, rename_old_files, duplicate copies, deleted/ scan (TM)
  jobs.ts                           — supervised async job manager + process-file store + SSE status frames
  engine/
    spawn.ts                        — shared Bun.spawn discipline (argv arrays, nice, timeout, atomic rename)
    imagemagick.ts                  — identify / convert / dd_thumb / rotate / crop / attributes / dims
    ffmpeg.ts                       — ffprobe / two-pass transcode / posterframe / fragment / conform / audio(_tr)
    ffmpeg_profiles.ts              — the 39 settings profiles as ONE typed data table
    pdf.ts                          — pdfinfo / pdftotext / pdftohtml / ocrmypdf / PDF→jpg cover
    mime.ts                         — magic-byte sniffer + mime↔extension allowlist (data)
    icc/                            — vendored ICC profiles (from PHP media_engine/lib/color_profiles_icc/)
  ingest/
    upload.ts                       — multipart/chunked receiver + staging + join (client wire contract)
    add_file.ts                     — staging → quality dir (SEC-063 confinement, rename_old_files)
    regenerate.ts                   — regenerate_component orchestration
    process_image.ts / process_av.ts / process_pdf.ts / process_svg.ts / process_3d.ts
  tools/                            — tool_upload, tool_media_versions, tool_posterframe, tool_image_rotation,
                                      tool_pdf_extractor, tool_tc, tool_transcription_local (registered in tool_request)
```

Rebase points: `media_list_value.ts` re-based on the contract (its `LIST_QUALITIES` dies); `environment.ts:167-169` quality constants read from the config so the wire echoes the effective install values; `delete_record.ts` / `duplicate_record.ts` delegate to `file_ops.ts`.

### 5.1 Contract (`concepts/media.ts`)
```ts
export type MediaModel = 'component_image'|'component_av'|'component_pdf'|'component_svg'|'component_3d';
export interface MediaTypeSpec {
  readonly model: MediaModel;
  readonly typeFolder: 'image'|'av'|'pdf'|'svg'|'3d';
  readonly qualities: readonly string[];        // *_AR_QUALITY (from config)
  readonly defaultQuality: string;              // *_QUALITY_DEFAULT
  readonly originalQuality: string;             // *_QUALITY_ORIGINAL
  readonly defaultExtension: string;            // *_EXTENSION
  readonly allowedExtensions: readonly string[];// *_EXTENSIONS_SUPPORTED
  readonly alternateExtensions: readonly string[]; // *_ALTERNATIVE_EXTENSIONS
  readonly listQualities: readonly string[];    // replaces media_list_value LIST_QUALITIES (incl. av/3d)
}
export function mediaTypeOf(model: string): MediaTypeSpec | null; // built from config at boot
export function isMediaModel(model: string): boolean;
/** SEC-065 STRENGTHENED: charset [A-Za-z0-9_\-.]+ AND catalog membership. Throws on violation. */
export function assertValidQuality(spec: MediaTypeSpec, quality: string): string;
/** image quality → pixel-area budget: MB × 350000; null = unbounded (original/modified). */
export function pixelAreaBudget(quality: string): number | null;
```
Everything is loaded from the config catalog (§3) — no literals in the module body.

### 5.2 Path builder (`media/path.ts`)
```ts
export interface MediaIdentity { componentTipo: string; sectionTipo: string; sectionId: number; lang: string | null; }
export function buildMediaIdentifier(id: MediaIdentity): string;             // {ct}_{st}_{sid}[_{lang}]
export function additionalPath(sectionId: number, maxItemsFolder: number | null): string;
export interface MediaLocation { relativeDir: string; relativePath: string; absolutePath: string; }
export function buildMediaLocation(spec: MediaTypeSpec, id: MediaIdentity, quality: string, extension: string,
  opts: { initialMediaPath: string; maxItemsFolder: number | null }): MediaLocation;
/** THE traversal chokepoint: realpath-confine an absolute path inside the media root. Throws. */
export function assertInsideMediaRoot(absolutePath: string): string;
```
All identifier segments run through the existing `identifier_gate.ts` tipo validator; `sectionId` a positive integer; extension through the type allowlist. Every filesystem touch in the subsystem passes through `assertInsideMediaRoot` — one chokepoint, not per-call-site checks (stronger than PHP's scattered `realpath` calls).

### 5.3 Spawn discipline (`media/engine/spawn.ts`)
- **Argv arrays only, never a shell.** No `sh -c`, no string interpolation, no `.sh` files. Categorically stronger than PHP's `escapeshellarg` — arguments never traverse a shell parser, so there is nothing to escape. PHP's self-deleting `.sh` launcher (`exec_::exec_sh_file`) is NOT ported.
- **Binaries resolved at boot** from the config allowlist (§3), probed once (`-version`), capabilities cached (aac-encoder pick, ImageMagick v6/v7). Missing binary → the feature refuses loudly at call time; the server still boots.
- `nice -n 19` kept as an argv prefix (coexistence).
- Timeouts + kill on abort; stderr captured into the job record; **outputs written to a temp name inside the destination dir, then atomically renamed** so a coexisting PHP reader never sees a partial derivative. Per-job scratch (x264 passlog, audio_tr WAV) cleaned in `finally`.

### 5.4 files_info scanner (`media/files_info.ts`)
```ts
export interface FileInfoEntry {  // key ORDER = DB-byte contract; emit exactly as get_quality_file_info (:2496)
  quality: string; file_exist: boolean;
  file_name?: string; file_path?: string;  // file_path RELATIVE to media root, leading slash
  file_size?: string; file_time?: DdDateValue; extension?: string; external?: boolean;
}
/** Scan every quality × (default ext + alternates + raw-original twin) for the identity. Pure read. */
export function scanFilesInfo(spec: MediaTypeSpec, id: MediaIdentity, opts): Promise<FileInfoEntry[]>;
/** Save-time hook: re-scan and splice files_info into the stored media item, preserving
 *  original_* / modified_* / lib_data siblings. */
export function refreshStoredFilesInfo(storedItem: Record<string, unknown>, …): Promise<Record<string, unknown>>;
```
Value fidelity (size format, `file_time` dd_date shape) is pinned by a read-only differential gate over the SHARED media dir (§7 Phase B).

### 5.5 Job model (`media/jobs.ts`)
PHP: detached `nohup`/`sh` + PID + on-disk process files + a `processes` DB table, client consuming an SSE status stream. **TS design (user decision): in-process supervised jobs with an on-disk process-file mirror, same client wire.**
- **Job record** = JSON process file under `<private>/processes/<job_id>.json` (`{id, kind, pid, status, progress, data, errors, started_at, updated_at}`) + an in-memory registry. The pfile is the restart-survival + client-resume token (the client stores `{pid, pfile}` locally — `render_common.js:648`). TS pfiles live in the TS private tree, never PHP's.
- **Supervised, not detached**: `Bun.spawn` children stay attached to the manager, which streams ffmpeg progress (`-progress pipe:1` — a modernization; PHP had none), writes the pfile on every tick, enforces a **concurrency cap** (semaphore; default 2 transcode + 1 CPU-heavy image/OCR lane, config-tunable), and implements `stop_process` as a real child kill + status flip.
- **Restart = idempotence, not orphan adoption**: on boot, scan pfiles with `status:'running'`, probe PID liveness, mark dead ones `interrupted`, and re-queue derivative builds — safe because every derivative rebuilds from the untouched original and temp-name+rename means no partial file ever went live.
- **Client contract honored**: the status action serves the SSE stream the vendored `data_manager.request_stream`/`read_stream` expect (`data:\n<json>\n\n` frames of `{pid, pfile, is_running, data, errors, total_time}` — `render_common.js:640-780`, `data_manager.js:993`); `stop_process` and `get_server_ready_status` (= cap headroom) join the action table. Frame shape parity-gated by driving the real client in Chrome.
- **Coexistence**: TS never reads/writes PHP's `processes` table or pfiles; the only shared surface is the media dir, protected by atomic renames and by never touching `original`. Trade-off recorded: we lose survive-the-restart *execution* (PHP's detached process would keep running) but gain progress, caps, cancellation, and guaranteed cleanup.

### 5.6 File ops (`media/file_ops.ts`)
```ts
export function moveToDeleted(absolutePath: string, opts?: { bulkProcessId?: string; now?: Date }): Promise<string>;
export function renameOldFiles(absolutePath: string, now?: Date): Promise<string | null>;
export function duplicateMediaFiles(spec, source: MediaIdentity, target: MediaIdentity, opts): Promise<string[]>; // (:1999)
export function listDeletedVersions(spec, id: MediaIdentity, quality: string): Promise<string[]>;  // TM natsort scan
export function restoreDeletedSectionMediaFiles(…): Promise<…>; // tool_time_machine section branch
```
**Two datestamp formats exist in PHP and BOTH are preserved per call-site**: `move_deleted_file :1929` uses `Y-m-d_Hi`; the already-ported section-delete path (`delete_record.ts:130-134`) uses `Y-m-d_Gis` (hour without leading zero). Do NOT unify — TM scanners and humans read both. `duplicateMediaFiles` closes the `duplicate_record.ts:20` ledger (copy the files, then `refreshStoredFilesInfo` + save on the duplicate so files_info carries the target's paths, not the source's). Posterframe delete stays a true `unlink`.

---

## 6. Upload flow end-to-end

Two API calls (PHP). Verified vendored-client wire contract: `client/dedalo/core/services/service_upload/js/service_upload.js` POSTs `multipart/form-data` with headers `Content-Range: bytes s-e/total`, `X-File-Name` (URI-encoded), `X-Dedalo-Csrf-Token`, and fields `key_dir, file_name, chunked, start, end, chunk_index, total_chunks, file_to_upload, csrf_token`.

### 6.1 Raw receiver — `dd_utils_api::upload` (`core/api/v1/common/class.dd_utils_api.php:925`)
Action allowlist includes `upload`, `join_chunked_files_uploaded`, `list_uploaded_files`, `delete_uploaded_file`, `get_process_status[_poll]`, `stop_process`, `get_server_ready_status`, `get_system_info` (`:40-64`). Steps:
1. `$_FILES` corruption / `UPLOAD_ERR_*` validation (`:968-1056`).
2. Extension from filename; **MIME sniff via `finfo(FILEINFO_MIME_TYPE)`** on the temp file (`:1079`) — client MIME NOT trusted.
3. `sanitize_key_dir` the filename (`:1096`); MIME must be in `get_known_mime_types` (`:1099`, authority `:3035`); extension whitelisted AND cross-validated to belong to the matched MIME entry (`:1124-1154`).
4. Staging dir `DEDALO_UPLOAD_TMP_DIR/<user_id>/<key_dir>` (`:1189`; `DEDALO_UPLOAD_TMP_DIR = media_path/upload/service_upload/tmp`, `paths.php:360`), created 0750.
5. Path-traversal guard `safe_upload_target($tmp_dir, $name, false)` (basename + realpath confinement, `shared/core_functions.php:2886`) before `move_uploaded_file`/`moveTo` (`:1203-1222`).
6. Non-chunked images/av get an immediate staging thumbnail (`create_thumbnail :3299`).
7. **Chunked**: each chunk stored as `<chunk_index>-<tmp_name>.blob`, MIME forced `application/octet-stream` (`:1084-1091`); `join_chunked_files_uploaded :1379` confines each chunk path, appends `file_put_contents(FILE_APPEND|LOCK_EX)`, unlinks the chunk, and **re-sniffs the assembled file (SEC-066)**, deleting on invalid MIME/extension (`:1481-1498`).
Returns `file_data` incl. `tmp_dir:'DEDALO_UPLOAD_TMP_DIR'` (a constant NAME, resolved server-side), `key_dir`, `tmp_name`, `extension`, `chunked`, and (chunked) `total_chunks`/`chunk_index`.

### 6.2 Dispatcher — `tool_upload::process_uploaded_file` (`tools/tool_upload/class.tool_upload.php:109`)
Sole API action (`:50`). `session_write_close()` first (`:117`). Validate required params; `security::assert_record_in_user_scope($section_tipo,(int)$section_id)` when saved (`:166`); instantiate component (`edit`, `DEDALO_DATA_NOLAN`); `assert_component_permission($component, 2)` WRITE gate (`:233`); `set_quality($quality)` (`:240`); then:
- `add_file($file_data)` (`component_media_common:901`, **SEC-063**): ignores caller `source_file`, restricts `tmp_dir` to the allowlist `['DEDALO_UPLOAD_TMP_DIR']`, sanitizes `key_dir`/`tmp_name`, rebuilds source `= <tmp_dir>/<user_id>/<key_dir>/<tmp_name>`, realpath-confines staging (`:927-1016`), validates extension (`valid_file_extension :1034`), `rename_old_files` backup (`:1066`), `rename` into `<quality dir>/<id>.<ext>` (Original law: raw + normalized pair). Returns `ready = {original_file_name, full_file_name, full_file_path}`.
- `process_uploaded_file($ready)` (`:258`) — the per-type hook: image `component_image:742` (writes `original_*`/`modified_*`, optional `target_filename`, `regenerate_component`); av `component_av:1113` (build audio quality, `target_filename`+`target_duration`, `regenerate`); pdf `component_pdf:322` (non-PDF doc/odt stored but not text-processed `:404`; PDFs `regenerate_component({transcription, ocr, ocr_lang, first_page})`); svg `component_svg:507`; 3d `component_3d:620`.
- **`regenerate_component` (`:3153`)** — the derivative orchestrator: `delete_normalized_files` (keep raw) → build `default_quality` if missing (`build_version :3168`) → build alternate-ext versions → `create_thumb` → `update_component_data_files_info` → save. Image override also (re)creates the SVG overlay (`component_image:1971`).

### 6.3 TS design
- Route: the existing API path (`server.ts:163`) adds a **content-type branch** — `multipart/form-data` → `ingest/upload.ts`. Session required; CSRF enforced from header-or-field, constant-time (upload is NOT CSRF-exempt — client SEC-008). `Bun`'s native `request.formData()` parses it (no library); chunks are client-capped (~MB), so buffering a chunk in memory is fine (streaming multipart ledgered as an optimization).
- **MIME sniffing without libraries**: primary = a native TS **magic-byte table** in `engine/mime.ts` over the closed allowlist universe (jpg/png/tif/bmp/psd/webp/heic/avif · mp4/mov/avi/mpg/vob/wav/aiff/mp3/flv/zip · pdf · svg-as-XML-text · glb), each with a well-known signature; fallback = spawn `file --brief --mime-type` for genuinely ambiguous containers (MPEG-PS/VOB), behind the same spawn discipline. Fail-closed: unknown signature → reject even if the extension is allowlisted. Meets finfo parity and beats it (our DB is exactly the allowlist). The mime↔extension map is DATA (port of `get_known_mime_types`), config-adjacent.
- Flow mirrors §6.1–6.2 with the SAME shared staging layout (coexistence), chunk-level AND assembled re-sniff (SEC-066), `add_file` SEC-063 confinement, per-type processor → `regenerate.ts`. Image/pdf/svg run synchronously inline; av transcode goes through `jobs.ts` (§5.5).
- Missing derivative → the Dédalo placeholder image (PHP `get_url(default_add=true) :2942`) — preserve the fallback so the client never 404s a thumbnail.

---

## 7. Phased strangler-fig plan

Write-phases run against a **scratch media root** (the `MEDIA_PATH` override the delete-move already supports) until Phase F cutover; read-gates run against the real shared dir safely. Standing rule (relations/section/area precedent): the existing differential suite stays green throughout with **zero fixture/normalization changes**.

- **A. Contracts + config + adapters + probes (read-only).** `concepts/media.ts`, `path.ts`, `engine/*`, mime sniffer; the media config-key catalog in `.env`/config (PHP `DEDALO_*` names + defaults, §3); re-base `media_list_value.ts` + `environment.ts` on the contract. *Gates:* the TS effective media catalog **equals the PHP install's constants** (config-parity gate); golden path/identifier tests vs PHP-computed paths for the live corpus (all 5 types, bucketed + translatable); probe parity (identify/ffprobe/pdfinfo TS output vs the PHP getters on real shared-dir files); ffmpeg-profile argv **token-parity** vs a PHP CLI oracle dump; existing media differentials green, zero fixture changes.
- **B. files_info scanner + file ops.** *Gates:* `scanFilesInfo` **byte-equal to the live stored `files_info`** for a pinned record corpus (read-only over the shared dir); twin soft-delete/rename/duplicate gates on scratch roots (PHP CLI vs TS over identical trees → identical resulting trees); `duplicate_record` media-copy ledger closed.
- **C. Processing engines (scratch).** Image convert/thumb/rotate/crop, pdf web/cover/text, svg/3d web copy, av transcode+posterframe+conform. *Gates — realistic, NOT byte-equality* (encoder builds differ across versions): dimensions/format/colorspace/orientation/ICC-presence via identify-parity; ffprobe stream-shape parity (codec_name, w×h, fps, audio params, duration ±0.1 s, moov-before-mdat faststart); pdftotext text equality; the §A argv token gates as the recipe pin. Record the byte-inequality rationale in the spec.
- **D. Upload endpoint + ingest + jobs (scratch).** Full upload→staging→add_file→process→regenerate. *Gates:* the SAME source file through PHP and TS → **files_info byte-equal after explicitly-ledgered masks** (`file_time`; `file_size` only where encoder output legitimately differs — mask named in the gate); chunked join + SEC-066 re-sniff security tests (polyglot chunk assembly must fail closed); SSE job frames driven by the real client in Chrome (upload progress, stop, completion).
- **E. Tools.** Registry entries + handlers for tool_upload, tool_media_versions, tool_image_rotation, tool_posterframe, tool_pdf_extractor (ocrmypdf behind a binary-availability probe), tool_tc, tool_transcription local half. Per-tool differentials (scratch roots for mutations); non-admin refusal gates for every action.
- **F. Cutover + integration + tool_import_files.** Switch writes to the SHARED media dir; end-to-end Chrome upload/rotate/version flows; av/3d list qualities live in section reads; tool_import_files (with the named-processor registry replacing SEC-053); STATUS.md rows + ledger closure.

---

## 8. The media tools

All register in `TOOL_API_ACTIONS` (`tool_request.ts`) with declarative permission specs (`minLevel: 2` on the target for every mutation; PHP `assert_record_in_user_scope` → the standard `getPermissions` gate + record-scope check). PHP's 8-gate `tool_request` chain (sanitize model → registry whitelist → per-user grant → realpath confinement → API_ACTIONS allowlist → public+static reflection → 0-or-1-object-param signature → declarative permission spec) is already re-expressed as the explicit TS registry (no reflection) — strictly stronger. Each tool's `register.json` is an ontology record in section `dd1340`.

- **tool_upload.process_uploaded_file** — the ingest entry (§6.2). `API_ACTIONS = ['process_uploaded_file']`.
- **tool_media_versions** (`API_ACTIONS = ['get_files_info','delete_quality','build_version','conform_headers','rotate','sync_files','delete_version']`) — thin verbs over §4–§6: `build_version` (`options.async` default **true** → job manager), `conform_headers` (AV remux), `sync_files` (`edit` mode, `regenerate_component`, re-scan disk), `delete_version` (thumb → `delete_thumb`, else `delete_file(quality,ext)`).
- **tool_image_rotation.apply_rotation** (`API_ACTIONS = ['apply_rotation']`) — rotate all non-`original` tiers (`±distort SRT`) + proportional crop computed from the default-quality reference dimensions; **original never mutated** — asserted in code, not convention (rotate/crop targeting `quality === 'original'` refuses).
- **tool_posterframe** (`API_ACTIONS = ['create_identifying_image','get_ar_identifying_image']`) — `create_identifying_image`: instantiate the portal, `add_new_element` → `Save` → new image record in the target section, `Ffmpeg::create_posterframe` at `current_time` into the image original path, then image `process_uploaded_file` for derivatives; `get_ar_identifying_image`: walk inverse references for portals whose ontology node has an `identifying_image` property.
- **tool_pdf_extractor.get_pdf_data** (`API_ACTIONS = ['get_pdf_data']`) — method `text|html`, engine from the `dd1633` tool config (`pdftotext`/`pdftohtml`), `type -P` resolution → TS boot-probe, page range, `htmlentities`-equivalent output encoding.
- **tool_transcription (local half only)** — `create_transcribable_audio_file` / `delete_transcribable_audio_file` (ephemeral `audio_tr` 16 kHz WAV), `build_subtitles_file` (VTT via the `subtitles` class into `get_subtitles_path(lang)` under the av `/subtitles` folder), ensure-audio-quality. The Babel/Whisper remote path (`automatic_transcription`, `check_server_transcriber_status`) is ledgered (§Out-of-scope). **`get_text_from_pdf` stays OFF the API surface** — PHP deliberately excludes it from `API_ACTIONS` (unauthenticated path arg); callers use tool_pdf_extractor.
- **tool_tc.change_all_timecodes** (`API_ACTIONS = ['change_all_timecodes']`) — pure text transform, no media I/O: offset every `[TC_..._TC]` mark (`TR::get_mark_pattern('tc')`), `OptimizeTC::TC2seg`/`seg2tc`, clamp ≥0, reverse the replacement map for positive offsets (collision avoidance); `edit` mode, per-lang, save. Cheap early port.
- **tool_import_files** — its own late phase (Phase F): the 1744-line bulk importer. Filename grammar regex `/^(\d*)?-?(?(?=.\.)|(.*?))(?(?=-)-([a-zA-Z]{1,2})|)\.([a-zA-Z]{3,4})$/` (id / base_name / field-letter / ext; e.g. `73-my image-A.tiff` → id 73 / "my image" / A / tiff); `import_mode` `default|section|section_resource` × `import_file_name_mode` `null|enumerate|named|match|match_freename`; `match` via stored-record relation walk, `match_freename` via an SQO with `skip_projects_filter` + trailing-`.` boundary; `set_components_data` roles `target_filename`/`target_date` (EXIF/ffprobe/pdfinfo dates)/`input_component` (translatable temp-data path); `BACKGROUND_RUNNABLE = ['import_files']`; per-file CLI/job progress. **SEC-053 custom `file_processor` functions are NOT ported as arbitrary sandboxed PHP** — replaced by a registry of named TS processor functions (the explicit-registry rule; strictly stronger).
- **tool_time_machine** touchpoint — the section-restore branch of `apply_value` calls `restore_deleted_section_media_files` (re-link media soft-deleted between snapshot and now). Lives in `tool_time_machine` (already partially ported); the media re-link is `file_ops.restoreDeletedSectionMediaFiles`.
- **tool_subtitles** — ledgered client-only (`API_ACTIONS = []`).

---

## 9. Preserve vs modernize (explicit rulings)

| Preserve byte/behavior-exact | Why |
|---|---|
| `files_info` entry shape, key order, value formats; sibling keys (`original_*`, `modified_*`, `lib_data`) | shared-DB contract |
| identifier & path grammar, buckets, `initial_media_path`, `deleted/` naming (BOTH stamp formats `Y-m-d_Hi` and `Y-m-d_Gis`), `rename_old_files` | shared-disk contract |
| raw+normalized original pair; original never mutated; posterframe hard-unlink | Original law |
| MB×350000 pixel law, never-upscale, `dd_thumb` recipe, ICC CMYK→sRGB + `-strip`, EXIF orientation swap, PDF density/cropbox | derivative parity |
| two-pass x264 + qt-faststart, PAL/NTSC-by-fps, audio 44100/128k/2, audio_tr 16k mono, aac-encoder pick order | output-shape parity; 39 profiles → typed data with argv token gate |
| placeholder fallback for missing derivatives; TM `deleted/` scan semantics | client contract |
| `nice -n 19` | shared-host coexistence |
| PHP `DEDALO_*` config-key names & defaults (§3) | env-config mandate; wire/URL parity |

| Modernize | How |
|---|---|
| shell strings / `.sh` launchers / `escapeshellarg` | argv arrays, no shell — stronger |
| load-bearing typos (`$gammma`, `get_ffprove_installed_path`) | clean internal names; zero wire/disk surface |
| settings-as-PHP-code | one typed profile table + boot-probed capabilities |
| detached nohup + PID-only status | supervised jobs, progress, caps, idempotent restart re-queue (§5.5) |
| finfo | closed-world magic-byte sniffer (§6.3) |
| **Ledgered post-parity options** (do NOT change outputs while gates depend on recipe parity) | CRF single-pass x264, streaming multipart, SVG upload sanitization, raising concurrency caps |

---

## 10. Security — chokepoint map (≥ PHP)

| Chokepoint | PHP | TS mandate |
|---|---|---|
| Upload MIME/ext | finfo sniff + `get_known_mime_types` cross-check (`:1079,:3035`) | closed-world magic-byte sniff + allowlist data; client MIME never read; fail-closed on unknown |
| Chunk assembly | SEC-066 re-sniff of joined file (`:1481-1498`) | same, + per-chunk sniff + a polyglot-assembly fail-closed test in the gate |
| Staging confinement | `sanitize_key_dir`, `safe_upload_target` basename+realpath, per-user 0750 dirs | same grammar gates + ONE `assertInsideMediaRoot` chokepoint on every fs touch |
| add_file source | SEC-063 tmp-dir allowlist + rebuilt path + realpath + `valid_file_extension` (`:901`) | ported verbatim; source path never client-supplied |
| Quality strings | SEC-065 `[A-Za-z0-9_\-.]+` (`:2830`) | charset AND catalog membership (`assertValidQuality`, stronger) |
| Identifier segments | implicit | `identifier_gate` tipo validation + integer section_id (stronger) |
| Shell | `escapeshellarg` everywhere | **no shell exists**; argv arrays; binaries from a boot-time absolute-path allowlist |
| Tool dispatch | 8-gate reflection chain (`dd_tools_api.php:178-394`) | existing explicit `TOOL_API_ACTIONS` registry (no reflection) + declarative min-level before handlers |
| Record scope | `assert_record_in_user_scope` on every mutation | `getPermissions ≥ 2` + record project-scope check in every mutating handler |
| CSRF | upload not exempt; header+field fallback (SEC-008) | same, constant-time compare |
| Custom processors | SEC-053 realpath+regex+Reflection sandbox (`tool_import_files.php:595-643`) | replaced by an explicit named-processor registry (strictly stronger) |
| Serving | reverse proxy + media_protection | dev route stays session-gated fail-closed 404 (no existence leak, `server.ts:126`); production protection ledgered (§Out-of-scope) |
| Original integrity | convention | asserted invariant: rotate/crop/transcode refuse `quality === 'original'` targets |

Also carry over: never reveal media existence to the unauthorized (fail-closed 404s), activity logging on upload/delete (the `'UPLOAD COMPLETE'` / `'DELETE FILE'` entries), and the record-scope gate on TM/filename-match paths that deliberately skip the projects filter.

---

## 11. Verified real-world corpus (fixtures)

Pin the live corpus for the gates (this install, `dedalo_mib_v7`):

| Node | Model | Notes |
|---|---|---|
| rsc29 in rsc170 | component_image | primary image fixture (`rsc29_rsc170_770.jpg`, `…/image/1.5MB/0/`); bucketed path |
| rsc37 in rsc176 | component_pdf | pdf web + jpg-cover + text |
| svg fixture | component_svg | web raster thumb |
| translatable image node | component_image | id lang-suffix case (`_lg-spa`) |
| rsc35 in rsc167 | component_av | **this install has ZERO real AV records** — AV write/transcode gates need seeded scratch fixtures (the `STATUS.md` tool_indexation precedent: fabricate a scratch AV chain; never fabricate to pin *client* behavior, only engine behavior) |
| posterframe/identifying_image exemplar | tool_posterframe | portal `identifying_image` property node |
| a `deleted/`-carrying record | file_ops | TM `deleted/` scan fixture |

Existing gates to keep green (zero fixture changes): `model_coverage_sweep.test.ts` (image/svg/pdf list-mode), `delete_media_files.test.ts`, `media_serving.test.ts`, `tool_export_differential.test.ts` (media cells). New gates land per §7.

---

## 12. Gates (definition of done for the media family)

1. **Standing suite green, zero fixture/normalization changes** throughout the strangler migration.
2. **Config parity.** The TS effective media catalog (qualities/defaults/extensions/thumb dims/binary paths) equals the PHP install's `DEDALO_*` constants; every value is `.env`-overridable; no module hardcodes a quality/extension/dimension (§3).
3. **Path & index parity.** Golden path/identifier tests vs PHP-computed paths (all 5 types, bucketed + translatable); `scanFilesInfo` byte-equal to live stored `files_info` over the shared dir (§B).
4. **Processing parity.** Realistic per-type gates (§C): identify-parity (dims/format/colorspace/orientation/ICC), ffprobe stream-shape parity (codec/w×h/fps/audio/duration ±0.1 s/faststart), pdftotext text equality, ffmpeg-profile argv token-parity; byte-inequality rationale recorded.
5. **Ingest parity.** Same source file → files_info byte-equal after ledgered masks; SEC-066 polyglot fail-closed; SSE job frames driven by the real client in Chrome (upload/stop/complete). `duplicate_record` media-copy ledger closed.
6. **Tools.** Every media tool registered + differential-gated (scratch roots for mutations) + non-admin refusal gate; `original` never mutated (asserted); tool_import_files with the named-processor registry.
7. **Security.** Every §10 chokepoint has a passing fail-closed test (invalid quality/tipo, traversal, over-scope record, unknown MIME, polyglot chunk, unauthorized tool/action).
8. **Ledger closure.** STATUS.md gains the Media rebuild table; the out-of-scope items (media protection, Babel API, 3D converters, PHP `processes` interop) and any remaining narrows are written down. Never silently narrow.

---

## 13. Suggested phasing recap (executor may evolve; mirrors the relations/area A–F pattern)

- **A. Contracts + config + adapters + probes** — `concepts/media.ts`, the `.env` config catalog, `path.ts`, `engine/*`, mime sniffer; re-base the read surface; config/path/probe/profile parity gates; suite green untouched.
- **B. files_info scanner + file ops** — byte-equal scan over the shared dir; twin soft-delete/rename/duplicate on scratch; duplicate ledger closed.
- **C. Processing engines (scratch)** — image/pdf/svg/3d/av; realistic parity gates.
- **D. Upload + ingest + jobs (scratch)** — the endpoint, chunked/SEC-066, the job manager + SSE Chrome drive.
- **E. Tools** — the registry handlers + per-tool + non-admin gates.
- **F. Cutover + tool_import_files + ledger closure** — writes to the shared dir; av/3d live in reads; STATUS.md rows updated.
