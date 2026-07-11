# Vendored library version audit

## Purpose

The Dédalo client — copied as-is into the TS server tree — ships several
third-party JavaScript libraries under `client/dedalo/lib/` as vendored
bundles (not via `npm`). Because these copies are not watched by a package
manager, it is up to the maintainers to track their upstream versions
against the CVE feeds; Dependabot would otherwise miss them.

!!! note "Vendored client libs, not TS server dependencies"
    These are the **client's** libraries, part of the copied vanilla-JS client
    (Biome ignores `client/**`, so they are never linted/formatted by the TS
    toolchain). They are distinct from the TS server's own `npm` dependencies in
    `package.json` (`zod`, the Anthropic + MCP SDKs, Biome, Puppeteer), which
    *are* package-manager-tracked. This audit is about the client bundles.

**SEC-103** defines this as a recurring audit task, to be run at least
once per release cycle.

## Libraries in scope

The following libraries need periodic re-verification. All of them are
shipped as pre-built bundles inside `client/dedalo/lib/`:

| Library | Local path | Current version (tracking file) | Upstream |
|---|---|---|---|
| CKEditor | `client/dedalo/lib/ckeditor/` | see `…/build/ckeditor.js` header | <https://ckeditor.com/ckeditor-5/download/> |
| Dropzone | `client/dedalo/lib/dropzone/` | see `…/dropzone-min.js` header | <https://github.com/dropzone/dropzone/releases> |
| svgedit | `client/dedalo/lib/svgedit/` | see `…/svgcanvas.js` header | <https://github.com/SVG-Edit/svgedit/releases> |
| xlsx (SheetJS) | `client/dedalo/lib/xlsx/` | see `…/xlsx.js` header | <https://github.com/SheetJS/sheetjs/releases> |
| pdfjs | `client/dedalo/lib/pdfjs/` | see `…/build/pdf.mjs` header | <https://github.com/mozilla/pdf.js/releases> |
| Leaflet | `client/dedalo/lib/leaflet/` | see `…/dist/leaflet-src.js` header | <https://github.com/Leaflet/Leaflet/releases> |
| d3 | `client/dedalo/lib/d3/d3-7.9.0/` | `7.9.0` (pinned in folder name; `d3-7.8.5` also present) | <https://github.com/d3/d3/releases> |
| Three.js | `client/dedalo/lib/threejs/` | see `…/build/three.module.js` header | <https://github.com/mrdoob/three.js/releases> |
| JSONEditor | `client/dedalo/lib/jsoneditor/` | see `…/dist/standalone.js` header | <https://github.com/josdejong/jsoneditor/releases> |
| Flatpickr | `client/dedalo/lib/flatpickr/` | see `…/dist/flatpickr.js` header | <https://github.com/flatpickr/flatpickr/releases> |
| iro.js | `client/dedalo/lib/iro/` | see `…/dev/iro.js` header | <https://github.com/jaames/iro.js/releases> |
| highlight.js | `client/dedalo/lib/highlightjs/` | see `…/highlight.js` header | <https://github.com/highlightjs/highlight.js/releases> |
| Mocha | `client/dedalo/lib/mocha/` | see `…/dist/mocha.js` header | <https://github.com/mochajs/mocha/releases> |
| Chai | `client/dedalo/lib/chai/` | see `…/chai.js` header | <https://github.com/chaijs/chai/releases> |
| qrcode (easyqrcode-js) | `tools/tool_qr/lib/qrcode/` | see `…/easy.qrcode.js` header | <https://github.com/ushelp/EasyQRCodeJS> |
| split.js | `client/dedalo/lib/split/` | see `…/dist/split.js` header | <https://github.com/nathancahill/split/releases> |
| vexflow | `client/dedalo/lib/vexflow/` | see `client/dedalo/lib/vexflow/` | <https://github.com/0xfe/vexflow/releases> |

!!! note "Mocha / Chai drive the client test harness"
    `mocha` and `chai` are used by the in-browser client test suites that
    `bun run test:client` drives headlessly (see [Testing](testing.md)) — they
    ship in the client bundle rather than as server test deps.

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
   - Drop the new bundle into `client/dedalo/lib/<name>/` (preserving the
     folder layout so the client's `lib/<name>/` import paths keep working).
   - Smoke-test the corresponding Dédalo component / tool.
   - Bump the version in the table above in the same commit.
   - Reference the CVE in the commit message.
5. If no security fix applies, annotate the table row with
   `verified YYYY-MM-DD` so the next reviewer can skip it.

## Known open upgrades

- ~~SEC-097 (pdfjs)~~ — **Closed 2026-05-03.** `client/dedalo/lib/pdfjs`
  refreshed to `5.7.284` (ES-module build: `pdf.mjs` / `pdf.worker.mjs`).
  The CVE-2024-4367 fix landed in 4.2.67, so the current bundle is well
  past the fix line.
- ~~SEC-102 (CKEditor 4→5)~~ — **Withdrawn 2026-05-03.** Verification of
  `client/dedalo/lib/ckeditor/build/ckeditor.js` (looking for the `CKEDITOR_VERSION`
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
