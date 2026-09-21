# WC-2026-09-04-committed-third-party-bundles-leave-the-client-tree — three frozen `get_dedalo_files` URLs no longer serve

- **Date:** 2026-09-04, adopted with the change that closes audit row
  P2-5-residue (CLI-12, PUB-12, OPS-08, GATE-54).
- **Decision:** DEC-12 (the invariant lands with its gates:
  `test/unit/dependency_integrity_tripwire.test.ts` — the derived committed-bytes
  census; `test/unit/no_remote_code_tripwire.test.ts` — the config-shaped load leg;
  `test/unit/vendor_advisory_tripwire.test.ts` — rows with an explicit root). The
  census consequence follows the pattern of
  WC-2026-08-23-dedalo-files-post-harvest-census.

## Shape before (PHP)

The frozen `get_dedalo_files` capture (2026-07-11,
`test/parity/fixtures/oracle_harvest/dedalo_files_differential.json`) lists,
among the service-worker manifest's `{type, url}` entries:

- `/dedalo/core/common/js/utils/lzstring.js` — lz-string 1.4.5 (WTFPL) with an
  in-tree `export` patch, a committed third-party bundle with no digest, no
  version binding and no advisory watch;
- `/dedalo/core/common/js/ui-search.js` — findAndReplaceDOMText 0.4.6
  (Unlicense), a UMD that binds `root.findAndReplaceDOMText`; as an ES module
  `this` is undefined, so it could never have worked when imported, and nothing
  imported it. Dead third-party code, found by the derived census on its first run;
- `/dedalo/tools/tool_lang/js/tool_lang-min.js` — an unreferenced, stale minified
  copy of `tool_lang.js` (first-party, but a minified duplicate that no loader
  named).

## Shape after (TS)

None of the three URLs is served. `get_dedalo_files` (the census walk in
`src/core/api/dedalo_files.ts`) emits whatever is on disk, so the entries simply
disappear from the manifest. lz-string is now the digest-pinned `vendor/lz-string`
row (1.5.0, MIT, one declared patch stated in `vendor/vendor_manifest.json`) served
through the client-lib registry as `/dedalo/lib/lz-string/lz-string.js`, which is
what `tool_common.js` and `view_default_edit_text_area.js` import. The other two
files are deleted. Not in the frozen census and therefore no wire change: the
committed copies of `@huggingface/transformers`, EasyQRCodeJS and client-zip under
`tools/**/lib/` (now package pins served through the registry ids `transformers`,
`qrcode`, `client-zip`) and the swagger-ui drop under `publication/` (now a manifest
row with an explicit `root`, bumped 4.5.2 → 5.32.14).

## Reason

Every committed third-party byte must be in the integrity manifest or a package
pin (audit P2-5-residue). The service-worker manifest is a census of the tree, so
removing bundles from the tree removes their URLs from it; keeping the files only to
keep the wire shape would keep the exact hole the audit named.

## Gate reconciliation

`test/parity/dedalo_files_differential.test.ts`: the three URLs are filtered
two-sided by `isThirdPartyBundleRemovalEntry` (EXACT URLs, the service_upload-fold
rule), with the mirror assertions — the TS census holds NONE of them, the frozen
oracle still holds all three. No re-harvest (impossible by definition, and not
needed: the gate transforms both sides before diffing — the WC-001 pattern).
