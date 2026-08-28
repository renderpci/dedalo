# VENDORING POLICY — third-party bytes committed under `vendor/`

**What this file is.** The permanent rules for code this repo COMMITS rather than
installs: what may be vendored, what every vendored tree must declare, and the two
gates that make those declarations mean something. State lives in
`vendor/vendor_manifest.json` (the rows) and `rewrite/LEDGER.md` (coverage); this
file is the definition.

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

Anything else goes in `package.json`, where Dependabot, `bun audit` and lockfile
integrity already work. **Vendoring is a loss of three safety nets, taken
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
| **Offline** | `checkVendorAdvisories()` in `scripts/vendor_verify.ts`, run by `test/unit/vendor_advisory_tripwire.test.ts` and by `scripts/ci/audit.ts` | Compares each declared version against the ledgered ranges, enforces the review window, re-proves every acceptance clause. Deterministic, credless, no network. |
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
- Committed third-party bundles **outside** `vendor/` (CLI-12: five under
  `tools/**/lib/`, PUB-12: a swagger-ui under `publication/`) are outside this
  policy's census today. Bringing them in is the obvious next move and is NOT done.
