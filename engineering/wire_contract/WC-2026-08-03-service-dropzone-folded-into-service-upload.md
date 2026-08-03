# WC-2026-08-03-service-dropzone-folded-into-service-upload — the dropzone service is replaced by a native multi-file mode of `service_upload`

- **Date:** 2026-08-03 (removal of the abandoned `dropzone` dependency; entry
  opened with the ADDITIVE half — the four new client modules — and extended
  the same day with the DELETION half, below, once all three import tools ran
  on the replacement).
- **Decision:** none specific. Taken under the AGENTS.md project premise:
  `dropzone@5.9.3` is the terminal release of an unmaintained package (v6
  abandoned at beta.2, 2021-11-29) and the engine carried **two** upload stacks
  for one job — `service_dropzone` (third-party, never chunked) and
  `service_upload` (in-house, chunked). Two transports for one wire is the
  defect; the dead dependency is what exposed it. Removal is done NOW, in beta,
  because the same change against a live release is strictly more dangerous.
- **Shape before (PHP):** `get_dedalo_files` censused the `service_upload`
  package as exactly two files —
  `/dedalo/core/services/service_upload/js/service_upload.js` and
  `…/render_edit_service_upload.js` — plus the two `service_dropzone` files.
  The multi-file upload UI existed only inside `service_dropzone`, built on the
  vendored Dropzone library served from `/dedalo/lib/dropzone/`.
- **Shape after (TS):** the census GAINS four modules under the same package,
  and nothing else about it moves:
  - `js/upload_transport.js` — the DOM-free wire core; the ONE place an
    `XMLHttpRequest` is constructed. The multipart shape and headers are
    byte-identical to what `service_upload` already sent (field order, header
    order, and `tipo` single-shot-only are pinned by
    `test/unit/client_upload_transport.test.ts`), so **this is not a wire change**
    — it is the same wire behind one door instead of two.
  - `js/upload_queue.js` — the DOM-free multi-file state model.
  - `js/dropped_files.js` — recursive directory-drop traversal
    (`webkitGetAsEntry`), the one capability a hand-rolled queue had to
    reimplement because curators rely on dropping folders of scans.
  - `js/render_edit_service_upload_queue.js` — the queue renderer, selected by
    the new `multiple:true` init option on the SAME `service_upload` model.
  The `service_dropzone` files and the `/dedalo/lib/dropzone/` route are
  unchanged by this half and are removed in the deletion half below.
- **Reason:** the fold is additive first on purpose. `service_dropzone` stays
  live and fully working while its replacement is built and gated, so every
  consumer flip is one revertable commit and nothing is deleted before its
  replacement has been exercised. Splitting the replacement into four modules
  rather than one is what makes it gateable at all: the transport and the queue
  model are DOM-free and therefore unit-testable in `bun test`, which matters
  because `biome.jsonc:86` excludes `**/client` — nothing lints or type-checks
  this tree, so an invariant that is not in a test is not enforced anywhere.
- **Gate reconciliation:** `test/parity/dedalo_files_differential.test.ts` gains
  `isServiceUploadFoldAdditionEntry`, filtered from BOTH sides of the set
  compare (the WC-063 `isTsNativeCoreFileEntry` pattern for TS-side additions).
  The predicate lists the four URLs **exactly**, never a `startsWith` prefix over
  `service_upload/`, because a prefix would stop comparing the two files that DO
  have a PHP twin — every future addition must cost its own reviewable line.
  Two positive assertions run alongside it, so two-sided filtering does not
  become a blind spot: the TS census must contain exactly these four, and the
  PHP census must contain none of them.
  **No re-harvest is needed, and none is possible**
  (`engineering/ORACLE_HARVEST.md`): the frozen store is NOT edited — it remains
  the honest record of what the PHP oracle served on 2026-07-11 — and the gate
  transforms both sides before diffing (the WC-001 pattern).
  Behaviour gates: `test/unit/client_upload_transport.test.ts` (19 tests, pins
  the wire byte-for-byte plus the settlement law) and
  `test/unit/client_upload_queue.test.ts` (32 tests, pins collision-free naming,
  the `readEntries` re-call loop, JSON-safety of `files_data` entries, and array
  identity). Browser tier: `bun run test:client`, unchanged at 118/0/0.

## The deletion half (same day, once all three consumers had flipped)

- **Precondition, not a formality:** `tool_import_files`, `tool_import_marc21`
  and `tool_import_zotero` all instance `service_upload` with `multiple:true`,
  and `bun run test:client` is 118/0/0 with them flipped. At that point
  `service_dropzone` has **no consumer** — the deletion removes dead code, it
  does not retire a live one.
- **Census, removed URLs:** `get_dedalo_files` loses exactly two entries —
  `/dedalo/core/services/service_dropzone/js/service_dropzone.js` and
  `/dedalo/core/services/service_dropzone/js/render_edit_service_dropzone.js`
  (the package's `css/service_dropzone.less` and `img/icon.svg` go with the
  directory; the LESS was never a census entry — it compiled into `main.css`).
- **Removed route:** `/dedalo/lib/dropzone/**` no longer serves. The client-lib
  route is an ALLOWLIST (`src/core/client_libs/registry.ts`), so dropping the
  `dropzone` entry turns every path under it from **200 into 404**. Nothing on
  the client requests it any more; the lazy-loader that did lived in the deleted
  `service_dropzone.js`.
- **Removed dependency:** `dropzone@5.9.3` is out of `package.json` and
  `bun.lock`. The registry entry and the dep must go in ONE change:
  `client_libs_tripwire` asserts every registry `probe` resolves 200, so keeping
  the entry without the package is red (there is no cross-check the other way —
  a stale dep would have sat unnoticed).
- **CSS:** the `@import` of the deleted partial is removed from
  `client/dedalo/core/page/css/main.less` in the SAME change as the `rm`.
  Both orderings are red on their own: the partial without the import is
  promoted to an entrypoint by `scripts/build_css.ts` (entrypoints are derived
  by subtraction) and emits a phantom `service_dropzone.css`; the import without
  the partial makes `less.render` throw. The regenerated `main.css` is
  committed — production has no LESS compiler.
- **Wire change — the `error` key is REMOVED from the upload rejection bodies.**
  `handleMediaUpload` (`src/core/media/ingest/upload_endpoint.ts`) answered
  `{result:false, msg, error:<string>, errors:[<string>]}`. The `error` string
  existed for ONE reason, stated in the code: Dropzone 5's default error
  renderer unwraps only `.error` and otherwise prints `[object Object]` into the
  badge. With Dropzone deleted that consumer is gone —
  `upload_transport.js` reads `errors[]` and falls back to `msg`. Two keys
  carrying the same string is a wire that can disagree with itself, so the
  rejection body is now exactly `{result, msg, errors[]}`.
  **The CSRF branch is FIXED, not merely trimmed:** it carried `error` and *no*
  `errors`, so removing the key blindly would have left a 403 with nothing
  machine-readable at all. It now emits `errors: ['CSRF validation failed']`.
  This REVERSES the "Error bodies gain an `error` string key" section of
  `WC-078` (see its `Addendum 2026-08-03`).
- **Gate:** the rejection body had zero coverage. `test/unit/media_upload_endpoint.test.ts`
  now pins the **key set** — `['errors','msg','result']` — on both the 403 CSRF
  branch and the 400 verification branch, so neither `error` nor any other
  undeclared key can be reintroduced silently.
- **Parity reconciliation:** `dedalo_files_differential` gains
  `isDropzoneServiceRemovalEntry`, a `startsWith('/dedalo/core/services/service_dropzone/')`
  **prefix**, added to the `keep` chain. The prefix/exact asymmetry with
  `isServiceUploadFoldAdditionEntry` is deliberate and the two cases are not
  symmetric: an addition inside a package that still has PHP-twinned files must
  be listed by name or the prefix stops comparing the twins; a whole-package
  removal has nothing left on the TS side for a prefix to hide, and the positive
  assertion proves it (`tsBody` contains **none**, `phpBody` contains some).
  The frozen JSON is **NOT** edited — it records what PHP served on 2026-07-11.
- **Client-suite census:** `test_get_instance.js` and `test_others_lifecycle.js`
  listed `service_dropzone` among the resolvable services; both entries are
  removed. Still 118/0/0.

## Known-red neighbour, NOT caused by this entry

`dedalo_files_differential` is already failing on `main` as of 2026-07-29:
`live_diffusion_server_control.js`, `progress_model.js`, `rollup_panel.js`
(commit `c7111777fa`, WC-067) and `tools/tool_diffusion/js/report_model.js`
(commit `3dd18d91ee`) were added AFTER the 2026-07-11 harvest and never received
a reconciling predicate. Those four are outside this entry's scope and are
deliberately NOT absorbed into `isServiceUploadFoldAdditionEntry` — widening a
predicate to swallow an unrelated breakage is how a parity gate stops meaning
anything. They need their own entry from the authors of that work.
