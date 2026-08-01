# WC-041 — component_image fixture data edit: rsc170/1 `files_info` repaired post-harvest (media index rebuild)

- **What moved:** the SHARED-DB record `rsc170/1` component `rsc29` — not the
  wire shape. Its stored `files_info` (a disk-derived cache the read path
  serves verbatim for images) was stale: emptied/never-rebuilt after a period
  where `MEDIA_PATH` pointed at the wrong tree, while the harvest-era copy
  still listed `png`/`tiff` originals that no longer exist on disk.
- **The repair (2026-07-19, user-requested):** rebuilt the index from the real
  files via the established seams — `tool_update_cache` media repair
  (regenerate derivatives where the original is present + re-scan +
  `updateMatrixKeyData` per-key write, NO Time Machine entry) and the
  cross-section ops sweep `scripts/media_repair_files_info.ts` (dry-run default,
  shrink-guarded). Result for rsc170/1: 5 existing entries
  (original jpg+avif, 1.5MB jpg+avif, thumb jpg).
- **Fixture edit (deliberate, per the store's drift_policy):**
  `test/parity/fixtures/oracle_harvest/component_image_context_differential.json`
  interaction `09190497c0662d1bcc37cfdb`, `result.data[16].entries[0].files_info`
  replaced with the repaired 5-entry truth. Adjudicated DATA-SIDE ONLY: lang,
  external_source, base_svg_url, entry identity and the projection shape are
  untouched; a re-harvest is impossible (PHP decommissioned) so the fixture is
  hand-edited in the same change that repairs the data.
- **Behavior note (not a divergence):** TS still mirrors PHP's stored-cache
  read for images (only `component_av` re-scans per read); repairs flow
  through `tool_update_cache`/the script, never silently on read.

### Gate

`test/parity/component_image_context_differential.test.ts` (fixtures replay) +
`test/unit/tool_update_cache.test.ts` media-repair scratch test (wipe
`files_info` → update_cache → rebuilt from disk, sibling keys preserved).
