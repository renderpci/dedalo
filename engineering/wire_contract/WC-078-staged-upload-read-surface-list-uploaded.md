# WC-078 — the staged-upload read surface: `list_uploaded_files` + `delete_uploaded_file` + `file_data.thumbnail_url` + `/dedalo/upload_tmp/` (2026-07-30)

`tool_import_files` was unusable end-to-end: uploads failed and the queue did
not survive a reload. The staging area had a WRITE path (`media/ingest/upload.ts`)
but effectively no READ path, and the Dropzone client spoke a different wire than
the receiver. Fixed on both sides; the shape changes are recorded here.

### `dd_utils_api::list_uploaded_files` — was a hardcoded `[]`

The handler returned an empty array unconditionally ("full temp-dir scan is
uncovered scope"). This is a **silent narrowing** of exactly the kind the project
law forbids: it read as "nothing is staged" and was the direct cause of the
reported *"temporal data is not preserved across reload"*. service_dropzone calls
this action on every render and injects the result via `displayExistingFile`, so
it IS the cross-reload restore mechanism.

It now scans `stagingDir(userId, key_dir)` and emits PHP's
`[{name, url, size}]` **plus `thumbnail_url`** (nullable — the added key; a
client that ignores it is unaffected). In-flight artifacts (`<i>-<name>.blob`,
`<name>.assembling`) and dotfiles are excluded, so a partially-uploaded file
never shows as a restorable row. Order is `localeCompare` on the name, so a
reload reproduces the previous row order. A missing staging dir is `[]` (the
ordinary first-visit state); a malformed `key_dir` is logged and also answers
`[]` — a 200-with-array is required because an error here accumulates into
`page_globals.api_errors` and makes the NEXT element's render bail before
setting `status='rendered'` (`common.js:404`).

### `dd_utils_api::delete_uploaded_file` — was not implemented at all

The client has always called it (`render_edit_service_dropzone.js:874`); nothing
answered. Every removal 400'd, the row vanished from the UI, and the bytes stayed
in the staging dir forever. Now registered, taking `{key_dir, file_name}` and
answering `{result:boolean, msg}`. It also sweeps the generated thumbnail and any
orphaned chunk parts of the same name. **Deleting an absent file is a successful
no-op**, not an error: the client has already dropped the row, and a retry must
not surface something the user cannot act on.

### `file_data.thumbnail_url` on the upload response

PHP set it (`dd_utils_api.php:1269`) and the client reads it
(`on('success')` → `emit('thumbnail', …)`); the TS response omitted it entirely,
so a successful upload fed `undefined` into the preview `<img>`. Restored: the
receiver renders a preview with `buildThumb` once the whole file is staged.
**Best effort by contract** — a still-image allowlist only, and `null` on any
failure, at which point the client keeps its local preview. A thumbnail is never
a reason to fail an upload that already passed magic-byte validation.

### Error bodies gain an `error` string key

Rejections now emit `{result:false, msg, error:<string>, errors:[<string>]}`.
Dropzone's default error renderer unwraps ONLY a `.error` key and otherwise
assigns the object straight into `[data-dz-errormessage].textContent` — which is
why a failed upload showed the literal **`[object Object]`** in a red badge.
`errors[]` is retained for service_upload. (The client also grew its own
`on('error')` normaliser, so neither side alone can reintroduce the symptom.)

### CSRF: the form-field twin is now actually read

`upload_endpoint.ts` verified the `X-Dedalo-Csrf-Token` header only, while both
clients' comments documented a `csrf_token` form-field fallback for a header
stripped by an intermediary. The endpoint now parses first and accepts either.
Ordering is still fail-closed: anonymous → 404 before anything is parsed, and a
parse failure returns 400 without ever reaching the CSRF verdict.

### NEW ROUTE — `GET /dedalo/upload_tmp/<key_dir>[/thumbnail]/<name>`

Serving a user's own staged bytes needs a route, and the general media route
must not be it: **MEDIA-04** makes that route refuse everything under `upload/`
precisely because it authenticates a *session* but not an *owner*. The new route
takes the user id from the SESSION and only ever accepts
`<key_dir>[/thumbnail]/<name>` from the URL, so one user cannot address another's
staging dir. No session → 404 (no existence leak); partial artifacts are never
served; responses carry `Cache-Control: private, no-store`, `nosniff` and
`Content-Security-Policy: default-src 'none'; sandbox` (the bytes are unverified
user uploads). Confinement chokepoint: `resolveStagedPath`
(`src/core/media/ingest/staged_files.ts`).

### Client wire alignment (`service_dropzone`)

Its sibling `service_upload` was hardened for the TS receiver; service_dropzone
never was, and it is the widget `tool_import_files` mounts. It now sends
`paramName: 'file_to_upload'` (Dropzone's default `file` produced
*"upload: missing file_to_upload"*), the CSRF token, and the file name via
`X-File-Name` + `file_name` (without it the extension resolved to `''` and the
magic-byte cross-check rejected valid JPEGs). The receiver was ALSO made
tolerant — it accepts `file` as a fallback part name and falls back to the
multipart part's own filename (PHP's `$_FILES['name']`) — so neither side alone
is load-bearing.

Verified against the running engine: header-only, field-only and
part-filename-only uploads all succeed; anonymous and cross-user reads of
`/dedalo/upload_tmp/` 404; traversal via `key_dir`, `file_name` and the URL path
all 404 / are refused.

---
