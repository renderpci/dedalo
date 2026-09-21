# VENDORING POLICY — third-party bytes committed to this repo

**What this file is.** The permanent rules for code this repo COMMITS rather than
installs: what may be vendored, what every vendored tree must declare, where it
may live, and the gates that make those declarations mean something. State lives
in `vendor/vendor_manifest.json` (the rows) and `rewrite/LEDGER.md` (coverage);
this file is the definition.

## 1. Why anything is vendored at all

A `vendor/` lib is third-party code the engine SERVES TO BROWSERS
(`src/core/client_libs/registry.ts`). It exists only where a package manager
genuinely cannot carry the bytes, and the manifest row must say which case it is:

| Case | Example |
|---|---|
| The artefact is not on any registry | `json-view` (GitHub/jsDelivr only) |
| The registry package is not the artefact we need | `pdfjs` — npm's `pdfjs-dist` ships the component library, not the standalone viewer app the client iframes; that lives only in a release `.zip`, which bun cannot install |
| The publisher left the registry | `xlsx` (SheetJS) — was a bare CDN tarball URL, the one dependency shape bun records with NO integrity |
| No upstream artefact exists | `ckeditor` — a bespoke Dédalo webpack build |
| The registry artefact cannot be loaded by a module client | `lz-string` — UMD only (a top-level `var` and a define/module/angular tail; no ESM entry in any release). A classic `<script>` would make it a global; an ES module import cannot reach a module-scoped `var`, and this client is all modules. Committed with ONE declared patch (`export`), stated in the row and covered by its digest |
| The registry package drags a runtime the engine never executes | `transformers` — `@huggingface/transformers` is a Node-side bundle first: its `dependencies` pull `onnxruntime-node` + `sharp` (567 MB of native code, and the only path to two accepted HIGH advisories) into every `--production` install, while no engine module imports it — the browser loads ONE self-contained file, `dist/transformers.js`. Vendoring that file removes the closure; `production_import_tripwire` keeps a never-imported `dependencies` entry from returning (P1-23 / DEAD-12) |
| The tree must live inside another self-contained subsystem | `swagger-ui` — the v1 PHP publication API is deployed as its own Apache+PHP folder with no `node_modules` and no engine to serve `/dedalo/lib/`; the row carries an explicit `root` (§2a) |

Anything else goes in `package.json`, where Dependabot, `bun audit` and lockfile
integrity already work. That includes a bundle that is byte-identical to a registry
dist: EasyQRCodeJS, client-zip and a second copy of `@huggingface/transformers` were
committed under `tools/**` for years and became pins on 2026-09-04 (CLI-12). **Vendoring is a loss of three safety nets, taken
deliberately and paid for by the declarations below.**

## 2. What every row declares

One row per directory, exact complements in both directions. Beyond the provenance
fields (`version`, `upstream`, `archive_sha256`, `tree_sha256`, `files`, `note`):

- **`reviewed`** — the ISO date a human last checked this lib's upstream release
  feed AND the advisory feed. Not the date the tree was touched.
- **`advisory.ecosystem` / `.package` / `.version`** — the coordinate an advisory
  feed is keyed to (`npm` + `pdfjs-dist` + a plain semver). When no such coordinate
  exists, all three are `null` and **`advisory.unkeyable_reason` must say why**
  (`json-view` carries no version string at all, so nothing can be keyed to it).
- **`advisory.review_window_days`** — per row, because there is no single honest
  cutoff: a dead-upstream bundle and an actively-released PDF viewer do not share
  one. Past it, the build is RED.
- **`advisory.advisories[]`** — the LEDGER: every published advisory known to touch
  that version, with the feed's own `id`, `vulnerable_range` and
  `first_patched_version`.
- **`licence.spdx` / `licence.file`** (OPS-08, 2026-09-04) — the terms the bytes are
  redistributed under: an id from the CLOSED set in `scripts/vendor_verify.ts`
  (`LICENCE_SPDX_IDS` — MIT, ISC, BSD-2/3, Apache-2.0, GPL-2.0-or-later,
  GPL-3.0-only/or-later, LGPL-2.1/3.0-or-later, MPL-2.0; all compatible with this
  project's AGPL-3.0-only) and a licence text INSIDE the row's tree that must exist
  and read as that licence. Widening the set is a licensing decision made in that
  constant with a reason, never by typing a new string into a row. A tree that ships
  no licence text cannot have a row: fetch the upstream LICENSE into it (ckeditor and
  json-view got theirs this way).

### 2a. Where a tree lives — the `root` field

A row means `vendor/<id>/`. The complement law over `vendor/` (its directories equal
the rows, both ways) is what makes an undeclared tree there red. A row may instead
carry an explicit **`root`** — a repo-relative directory that git tracks, outside
`vendor/` and `node_modules`, overlapping no other row — ONLY for a tree that must
sit inside another self-contained subsystem, and the row's `note` must say why it
cannot live under `vendor/`. `vendor_verify.ts --write` digests it there;
`vendor_fetch.ts` lands a bump there when the row already exists. `swagger-ui` is the
one such row.

### 2b. The census is DERIVED — every committed third-party byte

"Under `vendor/`" was the census until 2026-09-04, and seven third-party files
committed elsewhere sat outside every axis above with every gate green.
`scripts/lib/third_party_census.ts` now reads every git-tracked
`.js`/`.mjs`/`.cjs`/`.css`/`.less` under `client/`, `deploy/`, `install/`,
`publication/`, `tools/` and `vendor/`, plus every tracked MODEL ARTIFACT there
(a `.onnx`/`.safetensors`/`.gguf`/`.wasm`/… file, a `tokenizer.json`-style
model-card file, a `config.json` declaring a `model_type`); a file wearing a
third-party SIGNATURE (a `.min`/`-min` name, a line over 1000 characters, a `/*!`
banner, a `sourceMappingURL` pointer, a copyright notice naming someone other than
Dédalo, or being a model artifact at all — a model belongs in the install's model
store, `src/core/ai/model_store.ts`, never in the code tree; the row's review
found 20 MB of a tokenizer committed under `tools/`) and no first-party MARKER (the AGPL LibreJS tag; a `.css` built from a sibling
`.less`) must lie under a row's root or be one of the ENUMERATED, shrink-only
exemptions in that module (each with its reason and licence). Every row's root must
contain at least one hit, so the signatures cannot go blind unnoticed. Gate:
`test/unit/dependency_integrity_tripwire.test.ts`. Honest limit: the census is
lexical — a pretty-printed, unbannered snippet with no copyright line looks like
source to it.

## 3. The rule

> **A vendored version inside a published advisory is a RED build.**

Not a nudge, not a printed line. The fix is a version bump
(`scripts/vendor_fetch.ts`), or an acceptance — and an acceptance is not a
signature:

- `reason_code` from a **closed set** (`feature_absent`, `not_served`,
  `mitigated_in_tree`). There is deliberately no "reviewed, looks low risk": that is
  an opinion, not a fact a gate can re-check.
- an `expires` date, so nothing is parked forever;
- `evidence` a reader can chase;
- **at least one `verify` clause the gate RE-PROVES on every run** — e.g.
  `vendor/ckeditor/build/ckeditor.js` must not contain `GeneralHtmlSupport`, which
  is the precondition both CKEditor advisories require. Rebuild that bundle with the
  feature in it and the acceptance evaporates by itself.

A ledger entry that no longer bites must be dropped rather than left with a stale
acceptance attached — otherwise a later downgrade inherits a decision nobody made
about it.

## 4. The two halves of the gate

Neither is sufficient alone: the first cannot learn, the second cannot run
everywhere.

| Half | Where | What it can do |
|---|---|---|
| **Offline** | `checkVendorAdvisories()` in `scripts/vendor_verify.ts`, run by `test/unit/vendor_advisory_tripwire.test.ts` and by `scripts/ci/audit.ts` | Compares each declared version against the ledgered ranges, enforces the review window, re-proves every acceptance clause. Deterministic, credless, no network. Runs over EVERY row, rooted under `vendor/` or not. |
| **Networked** | `discoverVendorAdvisories()` in `scripts/ci/audit.ts` | Asks the GitHub advisory feed the same question per coordinate and REDS on anything the ledger does not carry. Skipped LOUDLY when the feed is unreachable — a partial answer is not a network state. |

Both run the same comparison for the same reason the lockfile census is imported
rather than re-listed: two implementations would drift, and the one that drifted
would be the gate's.

## 5. Why this exists (CLI-26, 2026-08-28)

`vendor/pdfjs` was 5.7.284 — inside GHSA-hq66-cqwq-w95j / CVE-2026-16633 (HIGH,
"arbitrary JavaScript execution upon opening a malicious PDF", `>= 5.6.83,
< 6.2.108`, published 2026-08-06) — for 22 days, in a viewer iframe that is
same-origin with the application under the operator's own session, while **three
gates were green**:

- `bun audit` reads lockfiles, and `vendor/` has none;
- the vendor staleness axis was a documented NUDGE that "NUDGES, never fails" — it
  printed `pdfjs 5.7.284 — reviewed 2026-07-12 (46 days ago)` and exited 0, with
  the advisory 25 days inside that window;
- `dependency_integrity_tripwire` says in its own header that it proves a digest
  EXISTS and matches, never that the bytes are benign.

The tree was taken to 6.2.108 (also the npm dist-tag `latest`, so the advisory fix
and the latest-stable law are one move), and the mount now forces
`enableScripting:false` — the advisory's own stated workaround — which holds even if
the bump were ever reverted.

## 6. Honest limits

- A vulnerability with **no advisory entry**, or one keyed to a package name a
  vendored bundle does not share, is invisible to both halves.
- `vendor/json-view` has no version string, so **nothing** can be keyed to it. Its
  review window is the only signal that row can carry.
- "Inside a range" is a version comparison, never an exploitability judgement.
  Exploitability is argued in an acceptance, in a form a machine re-checks.
- The **distribution** side is still uncovered: this manifest proves the CHECKOUT is
  intact. What protects an installation receiving an update is the update's own
  archive-sha refusal — the manifest travels inside that archive, covered by its
  digest, not by an independent signature.
- The derived census (§2b) is lexical. It sees the shapes a redistributed bundle
  wears; a hand-pasted, pretty-printed function with no banner and no copyright line
  is indistinguishable from source to it, and a model artifact under an extension
  the list does not name (a bare `.bin`) is unseen until the list grows. What
  closed CLI-12/PUB-12 is that the question is now asked of the whole tree every
  run, not that every answer is certain.
