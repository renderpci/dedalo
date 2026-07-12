# Client library versions

## Purpose

The Dédalo client loads ~19 third-party browser libraries. **Since 2026-07-12 most
of them are package-manager tracked**, which is what this document used to exist to
compensate for.

The old model was a 118 MB gitignored `client/dedalo/lib/` directory of hand-dropped
bundles that no package manager watched — so **SEC-103** made a human re-check every
one against the CVE feeds each release. That gap is now mostly closed: 15 of the 19
libs are pinned dependencies in `package.json`, so Dependabot and `bun audit` see
them like any other dep.

**The index of record is [`src/core/client_libs/registry.ts`](../../src/core/client_libs/registry.ts).**
It maps each lib to its root, and it is the allowlist the serving route enforces.
This document is the human-facing companion; the registry is what the code reads.

## How a lib reaches the browser

Every lib is served at `/dedalo/lib/<id>/<subpath>`. There is no `lib/` directory in
the repo any more. Three sources back that URL:

| Source | What | Where it comes from |
|---|---|---|
| **npm** (15) | Normal pinned deps | `bun install` → `node_modules/` |
| **vendor** (3) | Cannot be packaged | committed under `vendor/` (2.7 MB gzipped) |
| **fetched** (1) | pdf.js viewer app | `scripts/fetch_client_libs.ts` (postinstall), sha256-pinned |

The lib **id** in the URL is deliberately decoupled from the package name, so
swapping the underlying package never touches a client file (`jsoneditor` →
`vanilla-jsoneditor`).

!!! warning "The registry is a security chokepoint"
    `node_modules/` also holds the **server's** dependencies (the Anthropic SDK, the
    MCP SDK, zod, Puppeteer). The route keys on a registered id and never maps a
    request path into `node_modules` — a prefix passthrough would publish the whole
    dependency tree. `test/unit/client_libs_tripwire.test.ts` asserts this.

## Versions

Pinned **exactly** (no `^`). The pins were chosen by byte-comparing each file
against the previously-vendored copy: **18 of the 20 files the client loads are
byte-identical** to what shipped before this migration.

| id | Package | Version | Notes |
|---|---|---|---|
| three | `three` | 0.149.0 | r149. `examples/jsm/` reached via the client import map. |
| pdfjs | *(fetched)* | 5.7.284 | See below. |
| ckeditor | *(vendor)* | CKEditor 5 42.0.1 | Custom build. See below. |
| jsoneditor | `vanilla-jsoneditor` | 3.12.0 | |
| leaflet | `leaflet` | 1.9.4 | |
| geoman | `@geoman-io/leaflet-geoman-free` | 2.19.3 | Was bundled *inside* leaflet's `dist/`; now its own dep. |
| turf | `@turf/turf` | 7.0.0 | Ditto. |
| highlightjs | `@highlightjs/cdn-assets` | 11.9.0 | Not `highlight.js` — see below. |
| svgedit | *(vendor)* | pre-package vintage | See below. |
| d3 | `d3` | 7.9.0 | The version no longer appears in the URL. |
| xlsx | `xlsx` (SheetJS tarball URL) | 0.20.3 | See below. |
| flatpickr | `flatpickr` | 4.6.3 | |
| dropzone | `dropzone` | 5.9.3 | |
| split | `split.js` | 1.6.5 | Used by `tool_indexation`. |
| iro | `@jaames/iro` | 5.5.2 | |
| codex-tooltip | `codex-tooltip` | 1.0.5 | |
| json-view | *(vendor)* | — | See below. |
| mocha | `mocha` | 11.1.0 | **devDependency** — client test harness. |
| chai | `chai` | 4.3.8 | **devDependency** — client test harness. |

Two files are not byte-identical to the old copies, both benignly: `highlightjs`
differs by the build hash in its banner (same 11.9.0 release), and the old `chai`
was a CDN build where npm ships an equivalent UMD bundle — and it is test-only.

## The four that cannot come from npm

Each carries its `reason` in the registry, next to the code, not only here.

- **ckeditor** — a **custom Dédalo webpack build**: a bespoke `ddEditor` class plus
  the `dedalo_image_tags` and `reference` plugins. The build project no longer
  exists in any checkout. `vendor/ckeditor/build/ckeditor.js.map` is the **only
  surviving copy of that plugin source**, which is why the map is committed too.
  ⚠️ This is a standing risk: the bundle cannot be patched or rebuilt, only replaced
  wholesale. Reconstructing the plugins as a maintained project is worth scheduling.
- **pdfjs** — npm's `pdfjs-dist` ships the pdf.js *component library*
  (`web/pdf_viewer.mjs`), **not** the standalone viewer app. `component_pdf` iframes
  `web/viewer.html`, which exists only in the `pdfjs-<version>-dist.zip` GitHub
  release — so it is fetched from Mozilla's own release and sha256-verified.
- **highlightjs** — the `highlight.js` package's `es/` entry is a bundler stub that
  chains into a CommonJS `lib/`; it cannot load in a browser without a bundler.
  `@highlightjs/cdn-assets` ships the same release as browser-ready ESM.
- **svgedit** / **json-view** — svgedit pre-dates the `@svgedit/svgcanvas` package;
  `pgrabovets/json-view` was never published to npm. Both are small and committed.

**xlsx** deserves a note: SheetJS **left the npm registry** (npm's `xlsx` is
abandoned at 0.18.5), so the dep is pinned to *their* tarball URL —
`https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`. Bun installs it like any
other dependency, so it is still lockfile-pinned; it just will not get Dependabot
alerts.

## Upgrade checklist (SEC-103, reduced)

For the 15 npm-tracked libs this is now ordinary dependency hygiene: read the
Dependabot/advisory alert, bump the pin, run the gates.

For the four above, the old manual ritual still applies once per release cycle:

1. Check the upstream release feed for security advisories since the pinned version.
2. If a fix applies: for `pdfjs`, bump the version + `sha256` + `bytes` in
   `scripts/fetch_client_libs.ts`. For the vendored three, drop the new files into
   `vendor/<name>/`.
3. Update the version in the table above and reference the CVE in the commit.
4. Run `bun test test/unit/client_libs_tripwire.test.ts` and `bun run test:client`,
   then smoke-test the component that uses the lib.

## What was removed

The 2026-07-12 prune dropped ~39 MB of libs with **zero call sites**: `wkhtmltopdf`
(a 17 MB *32-bit macOS* wkhtmltox binary — an architecture macOS has not executed
since Catalina), `vexflow`, `nvd3`, `pdfkit`, an empty `lessphp` husk, a second
CKEditor build (`build_html_text/`), and a stale `d3-7.8.5` sitting beside 7.9.0.
The `sublime-text/` and `visual-studio/` directories were never libraries at all —
they are Dédalo's own editor snippets. All of it remains git-tracked in the frozen
PHP repo if it is ever wanted back.

## References

- Registry / allowlist: `src/core/client_libs/registry.ts`
- Gate: `test/unit/client_libs_tripwire.test.ts` (in `engineering/TRIPWIRES.md`)
- Fetcher: `scripts/fetch_client_libs.ts`
- Audit finding **SEC-103** (phase-2 master register); companion **SEC-097** (pdfjs
  CVE-2024-4367 — the pinned 5.7.284 is well past the 4.2.67 fix line).
