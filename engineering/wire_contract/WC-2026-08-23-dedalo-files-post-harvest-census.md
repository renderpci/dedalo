# WC-2026-08-23-dedalo-files-post-harvest-census — the get_dedalo_files census consequence of every post-harvest client change

- **Date:** 2026-08-23 (parity red-cluster adjudication).
- **Decision:** the frozen `get_dedalo_files` capture (2026-07-11) is the oracle for the
  service-worker manifest. Client files added or removed AFTER the harvest are adopted
  census divergences: filtered two-sided in
  `test/parity/dedalo_files_differential.test.ts` with a positive presence assertion for
  every addition and a TS-side-empty mirror for every removal. This entry is the CENSUS
  half of changes whose behaviour was ledgered separately — those entries changed the
  wire but never recorded that the manifest grows/shrinks with them.

## Additions (17 files, each must actually serve)

- `diffusion_server_control` live panel (3 files) — behaviour: **WC-069**, commit `c7111777fa`.
- `area_thesaurus/js/thesaurus_picker.js` — **WC-2026-08-14-thesaurus-picker-caller-declared**.
- errors v2 client contract: `api_error.js`, `api_transport.js`, `error_dispatch.js`,
  `error_policy.js`, `render_api_error.js` — **WC-2026-08-16-error-envelope-compat-removal**,
  **WC-2026-08-15-error-status-is-a-channel**, `engineering/ERRORS_SPEC.md` §client.
- media-job visibility: `floating_dock.js`, `job_follow.js`, `job_tray.js` —
  **WC-2026-08-12-media-job-visibility**.
- `component_external/js/external_render.js` — **WC-2026-08-06-external-client-render**.
- `component_inverse/js/render_search_component_inverse.js` — census-adopted (inverse
  search render, post-harvest feature; no prior wire entry — this entry is its record).
- `section/js/view_tm_list_section.js` — **WC-2026-08-14-tm-scope-server-owned** /
  **WC-2026-08-14-tm-ddo-mode-retired** (the TM list's new home).
- `tool_diffusion/js/report_model.js` — **WC-2026-08-15-diffusion-job-result-record**.
- `tool_ontology_parser/js/ontologies_filter.js` — census-adopted (post-harvest filter
  UI; no prior wire entry — this entry is its record).

## Removals (7 frozen URLs with no TS file)

- `core/services/service_time_machine/` (6 files) — the TM list moved into the section
  family (`view_tm_list_section.js` above); package deleted.
- `core/common/js/worker_data.js` — superseded by the media-job surface
  (**WC-2026-08-12-media-job-visibility**).

## Rules going forward

Additions are EXACT URLs (one reviewable line each — a prefix would stop comparing a
twinned package); removals may be a package prefix only when the TS-side-empty mirror
assertion proves the package is gone. Same pattern as the service_upload fold entry.
