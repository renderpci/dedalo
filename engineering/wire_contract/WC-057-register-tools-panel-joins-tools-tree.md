# WC-057 — register_tools: the panel joins the tools tree, and its ACTIVE checkboxes outrank register.json (2026-07-28)

- **Date adopted:** 2026-07-28.
- **Decision:** admin sovereignty over tool activation (this entry; no earlier DEC).
- **Shape before (TS):** `register_tools::get_value` served the dd1324 registry
  ALONE — `{name, warning:null, version, developer, installed_version}`, with
  `version` mirroring `installed_version` by construction, so PHP's two
  file-state warnings could never arise. `register_tools.register_tools`
  ignored its `options` entirely.
- **Shape after (TS):** each datalist row gains **`active`** (dd1354, the
  registry state) and **`on_disk`**, and the datalist is the JOIN of the
  registry with the directories the importer scans — so a registered tool whose
  directory is gone is listed with `warning:'Not found on disk'`, and a tool on
  disk with no registry row is listed with `warning:'Not registered tool'`
  (PHP's wording), `installed_version:null`, `active:true`. The action reads
  **`options.tools_active`** (`{[tool_name]: boolean}`) and each report item
  gains **`active`** — as does the frozen dry-run branch's `result.report`
  (`ImportReportItem`), whose items now carry the same field.
  **`version` is populated at last.** Both report mappers read
  `(item as {record?:{version?:string}}).record?.version ?? null`, but
  `ImportReportItem` never carried a `record` — so every row of every report
  served `version: null`: the widget response AND the install wizard's per-tool
  rows (`core/install/register_tools.ts`, rendered by `render_installer.js`).
  `ImportReportItem.version` now holds the declared version and both mappers
  read it. A consumer that keyed off the always-null value would see real
  strings for the first time.
- **Reason:** dd1354 gates whether a tool is served to ANY user
  (`tools/registry.ts fetchActiveToolRows`), and 34 of 36 register.json files
  declare `active:1`, so every import re-stamped active and silently re-enabled
  tools an admin had turned off. The panel is the only place an admin
  reconciles tools, so the control belongs there — and a control that writes
  must show the state it writes, hence `active` on the wire. `on_disk` exists
  because the action can only reach tools it can scan: without it the panel
  would offer a checkbox whose write can never happen.
  The override applies BEFORE `validateRegister`/`projectIdentity`
  (`applyActiveOverride`), so the dry-run diff reports `active` too.
  **Admin state wins over the file** for a tool the install already registered;
  a tool author shipping `active:false` no longer deactivates it remotely. A
  tool absent from `tools_active` (any other caller, including the installer's
  `registerInstallTools`) keeps its file declaration — the pre-WC-057 path is
  byte-unchanged.
- **PHP fossil:** PHP scanned the directories for `register.json` and paired
  each with its registry record — the join this entry restores. PHP had no
  per-tool activation control on this panel.
- **Client rendering (no wire effect):** the 36×7-object report is unreadable
  as the generic `print_response` JSON tree, so `build_form` gained an optional
  **`render_response`** hook (absent ⇒ `print_response`, unchanged for every
  other widget) and register_tools supplies a summary: outcome headline,
  active/disabled counts, per-tool errors, the deactivated set, warnings
  GROUPED by message, and the original tree behind a collapsed
  `<details>`.
- **Gate reconciliation:** no oracle re-harvest — no harvested fixture covers
  `register_tools` `get_value` or its action (the widget appears in
  `widgets_differential` only as a CATALOG entry, which is untouched).
  `test/parity/tools_register_differential.test.ts` is unaffected: it calls
  `importTools({dryRun:true})` with no overrides, which is the unchanged path.

### Gate

`test/unit/register_tools_panel.test.ts` (the join: every on-disk tool is
offered a row, rows unique + name-sorted, `active`/`on_disk` present and
boolean, `on_disk` agrees with the scanner and a false one carries the
warning, an unregistered row defaults to active) ·
`test/unit/register_tools_widget.test.ts` (`tools_active` reaches importTools
as `activeOverrides`; malformed keys/values DROPPED not defaulted; a non-object
ignored; the report item's `active`) ·
`test/unit/tools_register_validate.test.ts` (`applyActiveOverride` overrides the
file declaration, keeps the record valid, is idempotent, creates a missing
relation column).
