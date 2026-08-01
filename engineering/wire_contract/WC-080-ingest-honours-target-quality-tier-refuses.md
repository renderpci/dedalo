# WC-080 — the ingest honours the target quality tier, and refuses the DERIVED ones (2026-07-31)

The media ingest now reads the client's target tier — `custom_target_quality`
(`tool_import_files`, the Quality selector) and `quality` (`tool_upload`, set
from `caller.context.target_quality` by the `tool_media_versions` per-quality
upload rows) — and parks the file in that tier, as PHP's
`$component->set_quality($custom_target_quality)` before `add_file` did
(`tools/tool_import_files/class.tool_import_files.php:321-327`,
`tools/tool_upload/class.tool_upload.php:240`).

Both options were previously DROPPED server-side: every upload landed in
`original` however the operator set the selector. The wire is unchanged — this
is a parity FIX, not a new shape — but the behaviour visible to a client that
was already sending these values changes, so it is ledgered.

Two deliberate divergences ride along.

### 1. A non-original tier runs the build-only-what-is-MISSING regenerate

PHP ran `regenerate_component()` for every tier. TS's INGEST builders re-encode
unconditionally (correct for a fresh original: every derivative should be rebuilt
from it), which for a non-original target would immediately overwrite the file the
operator just placed. The non-original path therefore runs
`regenerateMissingDerivatives` (`src/core/media/repair.ts`, the v6
`regenerate_component` port) instead: the default quality only when ABSENT, the
image thumb ALWAYS from the default-quality file, the SVG envelope
created-or-path-fixed. `component_av` has no branch there, so a non-original av
upload submits the transcode when — and only when — the default tier is missing.

Net effect vs PHP: identical outcomes, minus the alternate-extension builds the
TS processing layer still lacks (a pre-existing, separately-ledgered gap).

### 2. The refusals — three targets PHP accepted and lost

#### 2a. The THUMB and `audio_tr` tiers

`assertValidQuality` admits both as real directories even though neither is in
`spec.qualities`. Neither is scannable: `scanFilesInfo` probes the thumb tier with
the thumb extension ALONE and never walks `audio_tr`. A file uploaded there is
invisible to the record forever, and `sync_files` cannot repair it either (its
scan finds nothing to record). PHP accepted the upload and lost the file
silently; TS throws (`assertIngestableQuality`, `src/core/concepts/media.ts`,
deliberately adjacent to `assertValidQuality` so the two carve-out lists cannot
drift). Error strings:

- `Cannot upload into the '<thumb>' tier: it is a generated thumbnail, rebuilt from the <default> file`
- `Cannot upload into the 'audio_tr' tier: it is a generated transcription derivative`

STRICTER than PHP by design — the loud-uncovered-path rule beats writing a dead
file. The thumb tier IS offered by `features.ar_quality` (it is in
`DEDALO_IMAGE_AR_QUALITY`), so this is reachable from the shipped client and an
operator who picks it now gets an error instead of silent loss.

#### 2b. A non-normalized extension in a DERIVATIVE tier

`assertNormalizedExtensionForTier` (same file, same reason it lives there):
uploading `photo.png` into the `1.5MB` tier is refused, because that tier's
canonical file is `<id>.jpg`. Left to run, the upload is SHADOWED — the jpg
still exists (or `buildImageVersion` recreates it from the OLD original),
`scanFilesInfo` emits it FIRST for that quality (`uniqueLower([defaultExtension,
…])`), the thumb is regenerated from it, and the record keeps serving the
previous image while the new file sits beside it, reported as a success. The
ORIGINAL tier is exempt: keeping the raw upload in whatever the allowlist admits
is exactly what it is for (the Original law).

Error string: `Cannot upload a '.<ext>' file into the '<tier>' tier: it holds
normalized .<ext> / … files, so the upload would be shadowed by them. Upload
into '<original>' instead.`

#### 2c. `component_av` into a non-original tier derives only what it CAN

An av transcode reads the ORIGINAL. A non-original av upload therefore submits
one only when an original is on this box AND the default tier is absent —
otherwise the job could only fail with `AV original not found for transcode`, or
re-encode a derivative that already exists. A file parked in a quality tier IS
that tier; nothing derives from it.

### The av transcode is started by the CALLER, after its persist

`processUploadedFile` returns `startTranscode` UNSTARTED instead of a `job_id`.
The transcode's completion write-back and the ingest caller's own
`persistUploadedMedia` write the SAME `media -> <tipo>` jsonb key, and whichever
lands second wins it whole; the caller therefore starts the job after its persist
commits, which makes the ordering an invariant rather than a bet on an encode
being slower than a DB round-trip. The `job_id` on the wire is unchanged.

### Provenance follows the tier

`nameKeysForQuality` (`src/core/media/tools/files_info_persist.ts`) reproduces
PHP `component_image::process_uploaded_file:778-791` — an if/else-if over
`get_original_quality()` / `get_modified_quality()` with NO else: `original_*`
for the original tier, `modified_*` for the image retouched tier, and NEITHER
for any other. The same "no provenance" shape is what the `sync_files` repair
mints (PHP `update_component_data_files_info:3748`).

**Gates:** `test/unit/media_ingest.test.ts` (tier targeting, both refusals, the
non-original regenerate), `test/unit/files_info_persist.test.ts`
(`nameKeysForQuality`, the name-key trios), `test/unit/tool_upload.test.ts` +
`test/unit/tool_import_files.test.ts` (the WIRE — that each handler reads the
option off the payload; mutation-verified). No re-harvest: no fixture records an
upload.

---
