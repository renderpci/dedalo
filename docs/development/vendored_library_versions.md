# Vendored library version audit

## Purpose

Dédalo ships several third-party JavaScript libraries under `lib/` as
vendored bundles (not via `npm` / `composer`). Because these copies are
not watched by a package manager, it is up to the maintainers to track
their upstream versions against the CVE feeds and Dependabot would
otherwise miss them.

**SEC-103** defines this as a recurring audit task, to be run at least
once per release cycle.

## Libraries in scope

The following libraries need periodic re-verification. All of them are
shipped as pre-built bundles inside `lib/`:

| Library | Local path | Current version (tracking file) | Upstream |
|---|---|---|---|
| CKEditor | `lib/ckeditor/` | see `lib/ckeditor/build/ckeditor.js` header | <https://ckeditor.com/ckeditor-5/download/> |
| Dropzone | `lib/dropzone/` | see `lib/dropzone/dropzone-min.js` header | <https://github.com/dropzone/dropzone/releases> |
| svgedit | `lib/svgedit/` | see `lib/svgedit/svgcanvas.js` header | <https://github.com/SVG-Edit/svgedit/releases> |
| xlsx (SheetJS) | `lib/xlsx/` | see `lib/xlsx/xlsx.js` header | <https://github.com/SheetJS/sheetjs/releases> |
| pdfjs | `lib/pdfjs/` | see `lib/pdfjs/UPGRADE_SEC-097.md` | <https://github.com/mozilla/pdf.js/releases> |
| Leaflet | `lib/leaflet/` | see `lib/leaflet/dist/leaflet-src.js` header | <https://github.com/Leaflet/Leaflet/releases> |
| d3 | `lib/d3/d3-7.8.5/` | `7.8.5` (pinned in folder name) | <https://github.com/d3/d3/releases> |
| Three.js | `lib/threejs/` | see `lib/threejs/build/three.module.js` header | <https://github.com/mrdoob/three.js/releases> |
| JSONEditor | `lib/jsoneditor/` | see `lib/jsoneditor/dist/standalone.js` header | <https://github.com/josdejong/jsoneditor/releases> |
| Flatpickr | `lib/flatpickr/` | see `lib/flatpickr/dist/flatpickr.js` header | <https://github.com/flatpickr/flatpickr/releases> |
| iro.js | `lib/iro/` | see `lib/iro/dev/iro.js` header | <https://github.com/jaames/iro.js/releases> |
| highlight.js | `lib/highlightjs/` | see `lib/highlightjs/highlight.js` header | <https://github.com/highlightjs/highlight.js/releases> |
| Mocha | `lib/mocha/` | see `lib/mocha/dist/mocha.js` header | <https://github.com/mochajs/mocha/releases> |
| Chai | `lib/chai/` | see `lib/chai/chai.js` header | <https://github.com/chaijs/chai/releases> |
| qrcode (easyqrcode-js) | `lib/qrcode/` | see `tools/tool_qr/lib/qrcode/easy.qrcode.js` header | <https://github.com/ushelp/EasyQRCodeJS> |
| split.js | `lib/split/` | see `lib/split/dist/split.js` header | <https://github.com/nathancahill/split/releases> |
| vexflow | `lib/vexflow/` | see `lib/vexflow/` | <https://github.com/0xfe/vexflow/releases> |

## Checklist (run once per release cycle)

For each library above:

1. Open the current bundle and record the version banner at the top of
   the file in the table above.
2. Visit the upstream release feed and list every release between the
   recorded version and the current latest stable.
3. For each intermediate release, read the **Security** section of the
   release notes (or the CVE feed: <https://cve.mitre.org/> plus
   <https://github.com/advisories>). Record any advisory that affects
   a feature Dédalo actually uses.
4. If a security fix applies, schedule an upgrade:
   - Drop the new bundle into `lib/<name>/` (preserving the folder
     layout so the `lib/<name>/` import paths keep working).
   - Smoke-test the corresponding Dédalo component / tool.
   - Bump the version in the table above in the same commit.
   - Reference the CVE in the commit message.
5. If no security fix applies, annotate the table row with
   `verified YYYY-MM-DD` so the next reviewer can skip it.

## Known open upgrades

- ~~SEC-097 (pdfjs)~~ — **Closed 2026-05-03.** `lib/pdfjs` refreshed to
  `5.7.284` (ES-module build: `pdf.mjs` / `pdf.worker.mjs`). The
  CVE-2024-4367 fix landed in 4.2.67, so the current bundle is well
  past the fix line. The original upgrade procedure remains on disk at
  `lib/pdfjs/UPGRADE_SEC-097.md` as reference for future refreshes.
- ~~SEC-102 (CKEditor 4→5)~~ — **Withdrawn 2026-05-03.** Verification of
  `lib/ckeditor/build/ckeditor.js` (looking for the `CKEDITOR_VERSION`
  symbol and v5-only API surface like `editor.editing` /
  `conversion.for("upcast")`) confirms the vendored bundle is already
  CKEditor 5. No migration pending; track upstream CK5 releases via this
  checklist.

## Automation stub

A future release can wire a periodic CI job that:

- Runs a small `jq` script against a checked-in `lib/versions.json`
  lock and compares the recorded version to the latest GitHub release
  tag for each repo.
- Opens an issue when a newer tag carries a security advisory.

The `lib/versions.json` format is the lightest-weight seed:

```json
{
    "ckeditor": { "version": "x.y.z", "verified": "YYYY-MM-DD" },
    "dropzone": { "version": "x.y.z", "verified": "YYYY-MM-DD" }
}
```

Deferred until there is a real maintainer cycle to consume the job
output.

## References

- Audit finding **SEC-103** (phase-2 master register).
- Companion finding **SEC-097** (pdfjs specific CVE, already tracked
  with an UPGRADE note under `lib/pdfjs/`).
- Audit doc: `@/Users/render/Desktop/trabajos/dedalo/v7/master_dedalo/security-audit/deps-findings.md`.
