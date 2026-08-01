# WC-035 — the site-builder subsystem: `tool_sitebuilder` + `site_builder_status` are TS-ONLY surfaces (no PHP twin)

- **Date:** 2026-07-16 (subsystem built 2026-07-15).
- **Shape:** a wholly TS-native addition with no PHP-oracle counterpart. The
  **site builder** lets users build public websites over the published data by
  talking to a coding agent: a standalone daemon (`publication/site_builder/`,
  its own package outside the engine — same isolation model as the
  publication API v2) plus two engine-side surfaces:
  - **`tool_sitebuilder`** (`tools/tool_sitebuilder/`) — the proxy tool whose
    `apiActions` forward to the daemon over bearer-token HTTP and whose
    vanilla-JS client is the three-pane workspace (opened `open_as:'window'`).
  - **`site_builder_status`** (`src/core/area_maintenance/widgets/` +
    `client/dedalo/core/area_maintenance/widgets/site_builder_status/`) — the
    maintenance widget (category `publication`, a TS-only category) that
    probes the daemon's health and hosts the workspace launcher.
  Neither existed in the frozen PHP engine; the frozen oracle can never serve
  them. Developer doc: `docs/development/site_builder_internals.md`.
- **Gate reconciliation** (the WC-018/WC-019 TS-only pattern, one entry per
  gate, each citing this row):
  - `test/parity/tools_register_differential.test.ts` — `tool_sitebuilder` in
    `TS_ONLY_TOOLS`.
  - `test/parity/widgets_differential.test.ts` — `site_builder_status` in
    `TS_ONLY_WIDGET_IDS` (filtered from the catalog byte-compare; the widget's
    own shape is asserted natively by
    `test/unit/site_builder_status_widget.test.ts`).
  - `test/parity/dedalo_files_differential.test.ts` — both client trees
    (`/dedalo/tools/tool_sitebuilder/`,
    `/dedalo/core/area_maintenance/widgets/site_builder_status/`) in
    `isTsOnlyEntry`; the every-TS-url-resolves test still validates the new
    files serve.
- **Non-parity gates that own the new surfaces:** the daemon's hermetic suite
  runs in CI via `scripts/ci/hermetic.sh` and as a targeted `verify.ts` stage;
  the engine proxy is gated by `test/unit/tool_sitebuilder.test.ts` (mock
  daemon) and `test/unit/dd_tools_api_stream_headers.test.ts` (the one core
  edit: the tool_request stream branch merges a tool's `streamHeaders`).
