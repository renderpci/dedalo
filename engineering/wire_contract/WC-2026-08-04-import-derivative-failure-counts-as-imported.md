# WC-2026-08-04-import-derivative-failure-counts-as-imported — a file whose ORIGINAL landed counts as imported

- **Date:** 2026-08-04 (the layered-TIFF import: scene selection, the media
  write contract, and non-fatal derivatives).
- **Decision:** none specific; taken under the AGENTS.md hard rule "never
  silently narrow scope" and the ordering law it implies — irreversible work
  (the staged file has already been moved) must not be undone by a failure in
  rebuildable work (a tier that can be regenerated at any time).
- **Shape before (PHP / the pre-2026-08-04 TS engine):** `processUploadedFile`
  let any derivative error propagate. `addFile` had already moved the staged
  upload into the media tree, so the throw escaped BEFORE the `files_info`
  scan, the ingest event and the persist — and each consumer then counted the
  file as a failure:
  - `tool_import_files::import_files` returned
    `{result:true, msg:'OK. Imported 0 of 2 …with errors.', errors:['<file>: <magick message>'], imported:0}`;
  - `tool_upload` returned `{result:false, msg:<message>, errors:[<message>]}`;
  - the MCP `upload_media` tool threw.

  The count was accurate about the derivative and wrong about everything else.
  Measured on this install (records 440866/440867 in `rsc170`): both records
  were created, portal-linked and role-stamped, the originals were moved
  irreversibly into `media/image/original/440000/`, the 1.5MB tier existed —
  and `matrix.media` was NULL, so the records did not know their own files and
  the import could not be retried, the source having been consumed. The PHP
  oracle never behaved this way either: `component_image::create_thumb`
  returned false and logged; it never aborted an ingest.
- **Shape after (TS):** `IngestResult` carries `derivativeErrors: string[]`, and
  ONLY the derivative block is wrapped — `assertIngestableQuality`,
  `assertNormalizedExtensionForTier` and `addFile` stay fatal, because they run
  before, or are, the irreversible move. The record is indexed either way, and
  each consumer reports the failure in the channel it already has:
  - `tool_import_files::import_files` — `imported` now counts the file, and each
    message is pushed into the EXISTING `errors[]` as
    `` `${originalFileName}: imported, but a derivative could not be built — ${message}` ``.
    So the same two-file import now answers
    `{result:true, msg:'OK. Imported 2 of 2 (…) with errors.', errors:[…×2], imported:2}`.
  - `tool_upload` — `result` stays `true`, `errors[]` carries the same messages,
    and `msg` carries them joined instead of `'ok'`.
  - `src/ai/mcp/tools/media.ts::upload_media` — returns
    `derivative_errors: string[]` alongside its existing keys.
- **Reason:** the two numbers a client shows must both be true. `imported: 0`
  told the operator nothing had happened while the archive had in fact consumed
  their source file and created a half-indexed record — the one outcome from
  which there is no retry. A missing tier is rebuildable from the original
  (`regenerateMissingDerivatives`, the media-versions panel, `repair.ts`); a
  lost index is not. `errors[]` was chosen at `tool_import_files` because
  `client/dedalo/tools/tool_import_files/js/render_tool_import_files.js:605-609`
  renders `sse_response.data.errors` and nothing else — a `warnings` field would
  have been dropped on the floor, which is precisely the silent narrowing this
  rule exists to prevent. At `tool_upload` the same reading of
  `render_tool_upload.js` decided the second channel: its `errors[]` alert
  (:264-265) fires only inside the `if (!response.result)` branch (:256), while
  `msg` (:273) is what reaches the screen on the success path, so the message
  carries the text and `errors[]` carries the detail for non-browser callers.
- **Shape note (what changed and what did not):** for both human tools the
  response SHAPE is unchanged — same keys, same types, no new field, no client
  edit. The divergence is purely SEMANTIC: `imported` now counts a file whose
  original landed, and an `errors[]` entry no longer implies the file was not
  imported. The one additive change is the MCP tool's `derivative_errors`, which
  is agent-facing JSON with no `errors[]` channel to reuse and no client wire.
- **Gate reconciliation:** `test/unit/media_ingest_derivative_failure.test.ts`
  pins the whole chain — a thrown `regenerateImage` yields `derivativeErrors`, a
  persisted original in `filesInfo`, the moved file intact, an `errors[]` entry
  matching `/imported, but a derivative could not be built/`, `imported`
  incremented, and no `warnings` key. **No re-harvest needed**, and none is
  possible (`engineering/ORACLE_HARVEST.md`): these are tool API surfaces, not
  read-path shapes, and no frozen fixture covers them — the gate above is the
  whole contract. The shape of every media WRITE that can raise one of these
  messages is separately gated by
  `test/unit/media_writer_discipline_tripwire.test.ts`.
