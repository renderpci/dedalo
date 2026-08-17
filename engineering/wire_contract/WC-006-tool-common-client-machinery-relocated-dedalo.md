# WC-006 — `tool_common` client machinery relocated to `/dedalo/core/tools_common/`

- **Date:** 2026-07-07 (ledgered retroactively — the gate normalization
  predates this row; found by the 2026-07 test-quality audit).
- **Shape before (PHP):** the shared tool client machinery (`tool_common.js`
  et al.) is served from the tools tree at `/dedalo/tools/tool_common/…`, and
  `get_dedalo_files` manifests those URLs.
- **Shape after (TS):** the machinery lives in
  `client/dedalo/core/tools_common` and is served at
  `/dedalo/core/tools_common/…` (the tools/ tree is TS-owned and served by its
  own handler; this base is plain client source). The
  `get_dedalo_files` manifest emits the TS URL; same files, same bytes,
  different base path. The service worker only maps `el.url` into a cache
  Set, so any self-resolvable URL satisfies the client contract.
- **Gate reconciliation:** `dedalo_files_differential.test.ts
  comparableLine()` maps the PHP base onto the TS base before comparing
  (cites this row) and separately asserts every TS URL resolves through the
  server's static surfaces — the rewrite cannot hide a 404.

## Amendment, 2026-08-16 — same URL, client home

The URL this entry ledgers has not moved. What moved is the DISK path: from
`src/core/tools/client/` to `client/dedalo/core/tools_common/`.

`src/` was the wrong home for browser code, and it cost a bespoke seam in every
layer that walks the client:

- `serveToolCommonRequest` + `TOOL_COMMON_URL_PREFIX` (`tools/serving.ts`) and
  `resolveToolCommonAssetPath` (`tools/paths.ts`), plus the `server.ts`
  special-case that had to run BEFORE the generic client handler "which has no
  core/tools_common dir" — all deleted; the generic handler now serves these
  files like any other `/dedalo/core/…` asset.
- `'src'` in `scripts/build_css.ts` `SEARCH_DIRS`, there only for
  `tool_common.less` — deleted; no `.less` remains under `src/`.
- A third `SCAN_ROOT` in `scripts/lib/client_compat_census.ts`, added hours
  earlier that same day because the census had never reached this tree — and
  that blind spot is what let two stale `.result` envelope reads survive the
  compat removal, nulling every tool context and blanking the label on every
  tool header (`WC-2026-08-16-error-envelope-compat-removal`, addendum).
  Reverted: `client/dedalo/**` covers the files now, and the gate pins them.
- The nginx production stanza's `location /dedalo/core/tools_common/`
  (`engineering/PRODUCTION.md`) — the `/dedalo/` alias already covers it.
- `"!**/src/core/tools/client"` in `biome.jsonc` (browser JS is not linted as
  engine source) — `!**/client` already covers it. Its one non-browser file,
  `register.schema.json`, stayed behind in `src/core/tools/` and is now
  formatted like the rest of the tree.
- The three `UNMEASURED_SOURCE_UNDER_SCAN_ROOT` entries in
  `crap_complexity_ratchet` that disclosed browser `.js` living under
  `src/core` — the list is EMPTY again: src/core is engine TypeScript and
  nothing else.

Because the URL is byte-identical, nothing on the wire changed: the 44 tool
importers, the 18 core client importers, the `remove_background` Worker URL,
`main.less`'s `@import`, and the `get_dedalo_files` manifest all keep their
strings. **Re-harvest: NO.**

The manifest keeps tool_common as its OWN block (`core/api/dedalo_files.ts`):
it holds the PHP entry ORDER (after core js, before tools) and applies the
TOOLS filter rule PHP applied to it — the core rule would drop its css and list
it elsewhere. `coreFileUrl` skips `/tools_common/` so the core walk cannot
list it twice.

`register.schema.json` was not client code and did not move with it: it is now
`src/core/tools/register.schema.json`.

### Two behaviour changes the move DID make (2026-08-16, same day)

The URL is identical and the bytes are identical, but the SURFACE that answers
changed, and two of its policies differ from the deleted route's. Found by an
adversarial review of the move, both now gated:

1. **Confinement got STRONGER, not weaker.** `resolveToolCommonAssetPath` used
   `confineUnder`, which canonicalises with `realpath` and so refuses a SYMLINK
   escape; `serveClientAsset` had only a lexical `resolve()` + `startsWith`
   check, which follows a link straight out of the tree. A move must not lose a
   guarantee, so the check moved INTO the client handler: it now canonicalises
   (`safeRealpath`, exported from `core/tools/paths.ts`) and re-tests against a
   canonical `CLIENT_ROOT`. The whole client tree gained the stronger guard, not
   just tools_common. Gate: `tools_path_confinement.test.ts` plants a real
   symlink under `client/dedalo/core/tools_common/js/` and requires a 404 —
   verified red with the check removed.

2. **The extension allowlist is gone for this subtree.** `serveToolCommonRequest`
   refused anything outside `SERVABLE_EXTENSIONS`, so
   `/dedalo/core/tools_common/css/tool_common.less` was a 404. It is now a 200 —
   the client tree serves what it holds, and always has: `/dedalo/core/page/css/main.less`
   answers 200 too, as does every other `.less` in `client/`. This is therefore
   ALIGNMENT with the tree tools_common joined, not a new hole: the source is
   public, versioned client source with no secret in it, and the `server/`
   subtree rule that the tools handler exists to enforce has no counterpart here
   (there is no server code under `client/`). Ledgered rather than "fixed" so
   the difference is a decision on the record instead of a surprise.
