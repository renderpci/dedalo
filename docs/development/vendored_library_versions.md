# Client library versions

## Purpose

The Dédalo client loads 20 third-party browser libraries. **Since 2026-07-12 most
of them are package-manager tracked**, which is what this document used to exist to
compensate for.

The old model was a 118 MB gitignored `client/dedalo/lib/` directory of hand-dropped
bundles that no package manager watched — so **SEC-103** made a human re-check every
one against the CVE feeds each release. That gap is now closed on both sides: 16 of
the 20 libs are pinned dependencies in `package.json`, so Dependabot and `bun audit`
see them like any other dep; the other four are committed under `vendor/`, pinned by a
digest, bound to their declared version, and watched by a
[gated advisory ledger](#advisories-and-staleness-the-axis-a-digest-cannot-cover)
rather than by a human's memory. See also
[Integrity](#integrity-the-manifest-and-why-vendored-code-needs-one).

**The index of record is `src/core/client_libs/registry.ts`.** It maps each lib to
its root, and it is the allowlist the serving route enforces. This document is the
human-facing companion; the registry is what the code reads.

## How a lib reaches the browser

Every lib is served at `/dedalo/lib/<id>/<subpath>`. There is no `lib/` directory in
the repo any more. **Two** sources back that URL, and that is the whole story:

| Source | Count | Root | In git? |
|---|---|---|---|
| **npm** | 16 | `node_modules/` | no — `bun install` |
| **vendor** | 4 | `vendor/` | **yes** — committed (ckeditor, json-view, pdfjs, xlsx) |

!!! note "No install-time fetch step, deliberately"
    An earlier design downloaded pdf.js from its GitHub release via a `postinstall`
    hook. That meant a hand-rolled zip extractor, a download cache, and — worse — a
    hard dependency on GitHub being reachable **on the deploy path** (`deploy.sh`
    runs `bun install`). All of that machinery existed for exactly one library. It
    was cheaper to commit the 3.5 MB. A clone is now self-contained: `bun install`
    is the entire setup, and nothing can be half-materialised.

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

All 20, re-measured against `package.json` and `vendor/vendor_manifest.json` on
2026-08-28.

| id | Package | Version | Notes |
|---|---|---|---|
| three | `three` | 0.185.1 | `examples/jsm/` reached via the client import map. |
| pdfjs | *(vendor)* | 6.2.108 | Committed, minus 4 sourcemaps + the demo PDF. **Bumped 2026-08-28** for CVE-2026-16633. See below. |
| ckeditor | *(vendor)* | CKEditor 5 42.0.1 | Custom build. See below. |
| jsoneditor | `vanilla-jsoneditor` | 3.13.0 | |
| leaflet | `leaflet` | 1.9.4 | |
| geoman | `@geoman-io/leaflet-geoman-free` | 2.20.0 | Was bundled *inside* leaflet's `dist/`; now its own dep. |
| turf | `@turf/turf` | 7.3.5 | Ditto. |
| highlightjs | `@highlightjs/cdn-assets` | 11.11.1 | Not `highlight.js` — see below. |
| svgedit | `@svgedit/svgcanvas` | 7.4.2 | **Upgraded 2026-07-12** from a vendored ~7.2.x build. See below. |
| d3 | `d3` | 7.9.0 | The version no longer appears in the URL. |
| xlsx | *(vendor)* | 0.20.3 | **Vendored 2026-08-24** — was a CDN tarball URL with no lockfile integrity. See below. |
| flatpickr | `flatpickr` | 4.6.13 | |
| split | `split.js` | 1.6.5 | Used by `tool_indexation`. |
| iro | `@jaames/iro` | 5.5.2 | |
| codex-tooltip | `codex-tooltip` | 1.0.6 | |
| transformers | `@huggingface/transformers` | 4.2.0 | Runs the RAG/identify models in the browser. |
| onnxruntime | `onnxruntime-web` | 1.27.0 | Transformers.js's WASM runtime, pinned explicitly — see the registry's `reason`. |
| json-view | *(vendor)* | — | The bundle carries no version string at all. See below. |
| mocha | `mocha` | 11.8.0 | **devDependency** — client test harness. |
| chai | `chai` | 6.2.2 | **devDependency** — client test harness. |

!!! warning "This table is prose, and prose rots"
    Eight of these rows were stale when they were re-measured on 2026-08-28 — the
    npm pins had moved under them with nothing to notice. The **four vendored rows
    are gated** (`test/unit/vendor_advisory_tripwire.test.ts` asserts this table
    against `vendor/vendor_manifest.json`, which is in turn bound to the bytes); the
    16 npm rows are not, and `package.json` remains the only authority for them.

Two files are not byte-identical to the old copies, both benignly: `highlightjs`
differs by the build hash in its banner (same 11.9.0 release), and the old `chai`
was a CDN UMD build where the package has been ESM-only since chai 5 — the test
harness loads it through an import map, and it is test-only either way.

## `devOnly` libs, and the install that ships them

Two entries are marked **`devOnly`** in the registry: `mocha` and `chai`, the
browser test harness. The route refuses them outright unless `DEDALO_DEV_MODE` is
`true`, so a production deployment cannot serve a test harness even by accident.

That flag has to agree with **where the package comes from**, and the two halves
fail in opposite directions:

* `devOnly` ⇒ a `devDependency`, so the production image never carries it;
* served in production ⇒ a runtime `dependency`, because a deploy host installs
  with `bun install --frozen-lockfile --production` and a `devDependency` would
  simply not be there. The lib then `404`s **in production only**.

`test/unit/client_libs_tripwire.test.ts` asserts both directions, so getting this
wrong is a red gate rather than a blank widget.

To run the harness *inside a container*, the image needs the devDependencies
back: build the Dockerfile's **`dev` target** (the production image plus a full
`bun install`) and set `DEDALO_DEV_MODE=true`. Both, or the harness stays
unreachable — see
[the troubleshooting entry](../install/troubleshooting.md) for the misleading
`MIME type` error this produces.

## svgedit — upgraded off the vendor tree (2026-07-12)

It used to be a 2.0 MB hand-dropped `svgcanvas.js` matching **no published version**
(2,089,802 bytes — between 7.2.3 and 7.2.4, so a build off an unreleased commit).
It is now `@svgedit/svgcanvas@7.4.2`: on npm, maintained, 1.4 MB, and CVE-tracked.

Verified as a drop-in in a **real browser**, not by inspection:

- Same default export (`SvgCanvas` constructor), constructed with the exact config
  `vector_editor.js` passes.
- **All 29 methods and 3 properties** the editor uses exist on the live instance.
  (An earlier count of "40 methods" was wrong — 11 of them appear only in
  commented-out code, e.g. `stage.add()` and `stage.getSegType()`.)
- Identical add → serialise → read-back round trip: same 467-byte SVG, same layer
  structure, same child count.
- **`xlink:href` survives.** This was the real risk: the 7.2.7 changelog says
  *"prefer href to xlink href"*, and `vector_editor.js:1269` reads
  `getAttribute('xlink:href')` while `getJsonFromSvgElements` produces the layer
  JSON that gets **stored in the record**. 7.4.2 still reads back `xlink:href` and
  still *saves* `xlink:href`, so existing records load unchanged.

The import path moved from `lib/svgedit/svgcanvas.js` to `lib/svgedit/dist/svgcanvas.js`.

## The four that cannot come from npm

Each carries its `reason` in the registry, next to the code, not only here.

- **ckeditor** — a **custom Dédalo webpack build**: a bespoke `ddEditor` class plus
  the `dedalo_image_tags` and `reference` plugins. The build project no longer
  exists in any checkout. `vendor/ckeditor/build/ckeditor.js.map` is the **only
  surviving copy of that plugin source**, which is why the map is committed too.
  ⚠️ This is a standing risk: the bundle cannot be patched or rebuilt, only replaced
  wholesale. Reconstructing the plugins as a maintained project is worth scheduling.
- **pdfjs** — two things stack up. First, npm's `pdfjs-dist` ships the pdf.js
  *component library* (`web/pdf_viewer.mjs`), **not** the standalone viewer app;
  `component_pdf` iframes `web/viewer.html`, the whole Mozilla app. That exists only
  in the `pdfjs-<version>-dist.zip` GitHub release. Second, **bun installs a tarball
  URL but not a zip** (Mozilla publishes a `.zip`) — and the tarball-URL half of that
  sentence is precisely what `xlsx` used to rely on, and why it is vendored now.

    So it is committed, taken from the sha256-verified **6.2.108** release
    (archive digest `7bf642d5…e95ba` — the full digest GitHub publishes for the
    asset, not a prefix copied by hand). Two prunes make that affordable —
    21 MB → **3.5 MB gzipped** (3,694,821 bytes, measured 2026-08-28):

    - **4 sourcemaps, 9,034,413 bytes.** A browser never fetches a `.map` unless
      devtools is open. Verified: loading the viewer issues zero requests for them.
    - **the 1,016,315-byte demo PDF** (`compressed.tracemonkey-pldi-09.pdf`). The
      client sets `defaultUrl` to `''` precisely to stop pdf.js auto-loading it, so
      it can never be reached.

    Re-measured 2026-08-28 against a fresh download of that archive: it holds 409
    files, the tree holds **404**, the 5 missing ones are exactly those, and every
    one of the 404 is **byte-identical** to the archive's copy. The trim is
    reproducible rather than hand-done —
    `scripts/vendor_fetch.ts --drop '**/*.map' --drop 'web/compressed.tracemonkey-pldi-09.pdf'`.

    Verified in a real browser by reproducing `component_pdf`'s exact flow: iframe
    `viewer.html` with no `?file=`, wait for `webviewerloaded`, clear `defaultUrl`,
    then `PDFViewerApplication.open({url})`. The page renders and the text layer
    extracts.

    **Bumped 2026-08-28 from 5.7.284**, which had sat for 22 days inside
    GHSA-hq66-cqwq-w95j / CVE-2026-16633 (HIGH, arbitrary JavaScript execution on
    opening a malicious PDF, `>= 5.6.83, < 6.2.108`) with every gate green — the
    finding that produced the advisory axis described below. 6.2.108 is also the npm
    dist-tag `latest`, so the fix and this project's latest-stable law were one move.
    The mount additionally forces `enableScripting:false` — the advisory's own stated
    workaround — behind `disablePreferences:true`, which is what stops a stored
    `pdfjs.preferences` entry from putting scripting back on.
- **highlightjs** — the `highlight.js` package's `es/` entry is a bundler stub that
  chains into a CommonJS `lib/`; it cannot load in a browser without a bundler.
  `@highlightjs/cdn-assets` ships the same release as browser-ready ESM.
- **json-view** — `pgrabovets/json-view` is distributed via GitHub/jsDelivr only and
  was never published to npm. It is 16 KB, so it is simply committed.

- **xlsx** — SheetJS **left the npm registry** (npm's `xlsx` is abandoned at
  0.18.5), so the dep used to be pinned to *their* tarball URL,
  `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`. That looked lockfile-pinned
  and was not: **a tarball-URL dependency is the one shape bun records with no
  integrity** — 581 entries in `bun.lock` carried `sha512-`, that one carried
  nothing. And these bytes are *served to browsers* (`tool_export` imports
  `/dedalo/lib/xlsx/xlsx.mjs`), while every code update re-runs `bun install` in the
  quarantine, so each update re-fetched unverified third-party client code.
  Committed 2026-08-24 from the installed 0.20.3 tree, byte-verified against a fresh
  download of the upstream `.tgz` (archive sha256 `8dc73fc3…`), trimmed to
  `xlsx.mjs` — the only file the client loads — plus the LICENSE.

## Integrity: the manifest, and why vendored code needs one

An npm lib is pinned by the lockfile's `sha512-`. A **vendored** lib has no lockfile
line at all, so `vendor/vendor_manifest.json` is the pin: one row per tree with its
version, upstream URL, the upstream **archive sha256** when one was verified, a
**tree digest**, the file count, the date a human last reviewed it, a
**`version_evidence`** block binding the declared version to the bytes, and an
**`advisory`** block (coordinate, review window, ledger) — the last two are the axis
described under [Advisories and staleness](#advisories-and-staleness-the-axis-a-digest-cannot-cover).

The tree digest is `sha256` over the sorted `<relpath>\0<sha256(bytes)>` lines of
every file under the lib root, so it moves when a byte changes *and* when a file is
added or removed.

| Command | What |
|---|---|
| `bun run scripts/vendor_verify.ts` | Recompute every tree digest and compare. |
| `bun run scripts/vendor_verify.ts --write` | Rewrite the derived fields (digest, file count) after a deliberate bump. **Refuses** when a row's declared version is not evidenced in its own bytes. |
| `bun run scripts/ci/audit.ts [--require-network]` | Integrity, then the offline advisory/review arm, then the networked one. |
| `bun run scripts/vendor_fetch.ts --lib <id> --version <v> --url <archive> --sha256 <expected>` | Download a bump and **refuse** unless the archive's sha256 is the stated one. |

Where it runs: `test/unit/dependency_integrity_tripwire.test.ts` and
`test/unit/vendor_advisory_tripwire.test.ts` (every `bun test`) and
`scripts/ci/audit.ts`, which the hermetic CI tier already invokes — the vendor pass
runs *before* the networked advisory audit so the offline skip cannot skip integrity.
It does **not** run at boot: hashing 11 MB of pdf.js on every start would only re-read
code the process is already running.

That same gate refuses the shape that caused all this: **no `dependencies` /
`devDependencies` / `peerDependencies` / `overrides` / `resolutions` entry may be a
`http(s):`, `git`, `github:`, `file:` or `link:` specifier, and no lockfile tuple may
resolve outside the registry or lack an integrity hash** — across all three packages
that have a lockfile.

!!! warning "What this does not cover"
    The manifest proves the **checkout** is intact and correctly labelled. Whether the
    contents are benign is the advisory axis above — and even that is a version
    comparison against a published feed, not an exploitability judgement. Nothing here
    covers distribution:
    `test/unit/release_archive_tripwire.test.ts` hashes nothing (it only rejects
    symlinks), so an installation receiving an update is protected by the update's
    own archive-sha refusal, not by an independent signature over `vendor/`.

## Advisories and staleness: the axis a digest cannot cover

A digest proves the bytes are the ones we pinned. It never proves the ones we pinned
are benign — and until 2026-08-28 nothing in the repo asked that second question about
a vendored tree. `vendor/pdfjs` sat at 5.7.284 for **22 days** inside a HIGH advisory
with three green gates over it: `bun audit` reads lockfiles and `vendor/` has none;
this document's staleness print "nudged, it did not fail"; and the integrity gate says
in its own header that it proves a digest matches, never that the bytes are safe.

So the manifest row now carries an `advisory` block, and it is a **gate**:

* the **coordinate** an advisory feed is keyed to (`npm` + `pdfjs-dist` + a plain
  semver), or an `unkeyable_reason` when no coordinate can exist — `json-view` has no
  version string and was never published to npm, so its row says exactly that;
* a per-row **`review_window_days`**, because a dead-upstream bundle (ckeditor, 180)
  and an actively released viewer (pdf.js, 90) do not share one honest cutoff. Past
  it, the gate is **red**. That date is the watch Dependabot cannot keep;
* a **ledger** of the published advisories known to touch that version. Being inside a
  ledgered range is a hard failure unless the row carries an **acceptance** — and an
  acceptance needs a reason code from a closed set, an expiry date, and at least one
  `verify` clause the checker **re-proves against the tree on every run**. Both
  CKEditor advisories are accepted that way: they require the General HTML Support or
  HTML Embed plugin, and the clause asserts those strings are absent from the served
  bundle. Rebuild the bundle with the feature in it and the acceptance evaporates.

**And the version itself is bound to the bytes.** Every check above reasons about the
version the row *declares*, so a row reading 6.2.108 over a 5.7.284 tree would have
satisfied the digest, the range check and the feed query at once. `version_evidence`
closes that: clauses naming a file **inside the lib's own tree** and a literal that
must appear in it, where the literal must itself contain the declared version
(`vendor/pdfjs/build/pdf.mjs` must contain `const version = "6.2.108";`, and two more
in the worker and the viewer). `scripts/vendor_verify.ts --write` **refuses** to write
a digest for a tree whose bytes do not state its declared version.

Two arms run these questions, and neither is sufficient alone:

| Arm | Where | What it can do |
|---|---|---|
| **offline** | `test/unit/vendor_advisory_tripwire.test.ts`, every `bun test` | Re-prove the committed ledger, the acceptances, the review windows and the version bindings. It cannot learn about an advisory published after it was written. |
| **networked** | `scripts/ci/audit.ts`, hermetic CI | Ask the GitHub advisory feed the same question per coordinate and fail on anything the ledger does not carry. It cannot run where there is no egress. |

!!! note "A lookup that did not happen is not a finding, and not a pass"
    The advisory endpoint is anonymous at 60 requests/hour **per IP**, and a shared CI
    runner can arrive with that budget already spent. So the networked arm has three
    outcomes, never two: a **finding** (the feed answered and named something
    unledgered) is red; a **rejected request** (400/401/404/410/422 — a coordinate we
    built badly, a token the API refused) is red, because that half is ours; a
    **degraded lookup** (429, 403/rate limit, 5xx, or no transport at all) is printed
    loudly per coordinate with the rate-limit headers and is *not* a failure. Failing a
    build for a rate limit and calling it a vulnerability is how a security gate gets
    commented out. What a degraded run loses is only *discovery*; the ledger and the
    review windows still ran, offline and unskippable. `GITHUB_TOKEN` raises the limit,
    and `--require-network` makes a degraded lookup fatal on a tier that can guarantee
    egress.

## Upgrade checklist (SEC-103, reduced)

For the 15 npm-tracked libs this is now ordinary dependency hygiene: read the
Dependabot/advisory alert, bump the pin, run the gates.

For the four vendored trees the old manual ritual still applies once per release
cycle (and `bun run scripts/ci/audit.ts` prints when each was last reviewed):

1. Check the upstream release feed for security advisories since the pinned version.
2. If a fix applies, drop the new files into `vendor/<name>/`. For **pdfjs**, take
   the `pdfjs-<version>-dist.zip` GitHub release, check its sha256 against the digest
   GitHub publishes in the release API, and unzip it **excluding `*.map` and
   `compressed.tracemonkey-pldi-09.pdf`** (see above — they are 10 MB of dead weight).
3. Update the version in the table above **and the row in
   `vendor/vendor_manifest.json`** — `version`, `upstream`, `archive_sha256`,
   `reviewed`, `note`, **`version_evidence.clauses`** (the literals carry the version,
   so they change with it) and `advisory.version`. Then
   `bun run scripts/vendor_verify.ts --write`, which refuses if the new bytes do not
   state the new version. Reference the CVE in the commit.
4. Ledger the advisory that prompted the bump in `advisory.advisories` even though the
   new version is outside its range: the row is inert there and goes red the moment
   anyone takes the tree back below the patched version.
5. Run `bun test test/unit/client_libs_tripwire.test.ts
   test/unit/dependency_integrity_tripwire.test.ts
   test/unit/vendor_advisory_tripwire.test.ts` and `bun run test:client`,
   then smoke-test the component that uses the lib.

## What was removed

The 2026-07-12 prune dropped ~39 MB of libs with **zero call sites**: `wkhtmltopdf`
(a 17 MB *32-bit macOS* wkhtmltox binary — an architecture macOS has not executed
since Catalina), `vexflow`, `nvd3`, `pdfkit`, an empty LESS-compiler husk, a second
CKEditor build (`build_html_text/`), and a stale `d3-7.8.5` sitting beside 7.9.0.
The `sublime-text/` and `visual-studio/` directories were never libraries at all —
they are Dédalo's own editor snippets. Everything removed remains recoverable from
the repository history if it is ever wanted back.

**`dropzone` went on 2026-08-03**, for a different reason: it had a call site, but
it was the terminal release (5.9.3) of an unmaintained package — v6 was abandoned at
beta — and it made the engine carry two upload transports for one job. Its
multi-file drag-and-drop UI was rebuilt in-house as the `multiple: true` mode of
`service_upload`, so `/dedalo/lib/dropzone/` no longer serves and the dep is gone
from `package.json`. See [Services](../core/system/services.md).

## References

- Registry / allowlist: `src/core/client_libs/registry.ts`
- Gates: `test/unit/client_libs_tripwire.test.ts`,
  `test/unit/dependency_integrity_tripwire.test.ts` and
  `test/unit/vendor_advisory_tripwire.test.ts` (all in `engineering/TRIPWIRES.md`)
- Manifest: `vendor/vendor_manifest.json`; scripts `scripts/vendor_verify.ts`,
  `scripts/vendor_fetch.ts`
- Audit finding **SEC-103** (phase-2 master register); companion **SEC-097** (pdfjs
  CVE-2024-4367 — the pinned 6.2.108 is well past the 4.2.67 fix line), and
  **CLI-26** (2026-08-28), the 22 days at 5.7.284 that produced the advisory axis.
