---
name: dedalo-tool-print
description: The Dédalo v7 tool_print — a visual print-layout / report designer that lays a section's components into a paginated document-flow grid and prints it. Use when modifying anything under tools/tool_print/ (class.tool_print.php, register.json, js/flow_engine.js, js/canvas_tool_print.js, js/render_tool_print.js, js/render_box_tool_print.js, js/print_layout_presets.js, js/tool_print.js, css/tool_print.less) or debugging its layout/pagination/persistence/print behavior. Covers the v2 document-flow grid model (rows of cells), the shared flow engine (editor + print), text/table page-splitting, the dd25/dd625 persistence, and the hard-won CSS/theme and module-cache gotchas.
---

# Dédalo v7 tool_print (document-flow report designer)

`tool_print` is a **section toolbar button** (surfaces like [[dedalo-export]]'s `tool_export`)
that opens a visual editor to arrange a record's components into a **paginated document** and
print it. Read the umbrella [[dedalo-tools]] skill first for the tool framework rules
(`tool_common`, `API_ACTIONS` allowlist, registration, where buttons surface). User-facing
reference: `docs/development/tools/reference/tool_print.md`.

It is **UI-only** (empty `API_ACTIONS`): printing is a browser action and all persistence rides
the generic core data API, exactly like `tool_export` presets. A phase-2 server `generate_pdf`
is sketched but inactive.

## The model: document-flow grid (schema_version 2)

NOT free-floating boxes. The layout is `layout.flow.rows[]`:

- a **row** is a horizontal grid of **cells** (1…N, fractional `width`); a **cell** holds one
  **block** (`type: component | static_text | empty`); a **spacer** row is fixed-height whitespace.
- Rows stack top-to-bottom and **paginate automatically** — pages are *content-driven, not stored*.
- A full-width **table** (relation/portal) or long **text_area** **splits across pages** and
  everything after it **reflows** (the core requirement: a 2-row vs 25-row table keeps the same
  offset to the following components).

Persisted in section **`dd25`** as a **`dd625` component_json** blob; the blob carries its own
metadata (`name`/`target_section_tipo`/`owner_user_id`/`visibility`) so **only `dd625` need exist
on `dd25`** (the earlier multi-component approach — dd624/dd642/dd654/dd640 — was dropped because
those don't persist on dd25). The picker reads every dd25 blob and filters client-side.

## File map (what does what)

- `js/flow_engine.js` — THE ENGINE, shared by editor + print. `layout_flow(self, ctx)` lays rows
  of cells into a `.flow_column`, measures, paginates into `.print_page`s. `make_editor_ctx`
  (px·zoom) / `make_print_ctx` (mm) inject the unit conversion + `measure(node)`.
  `splittable_container()` → `split_long_row()` splits a 1-cell **table** (`<tbody>` rows, header
  repeated) OR **text** (paragraphs, `find_text_container` → the CKEditor `.ck-content`/
  `.value_container`) at unit boundaries; `build_continuation_table_node` / `build_continuation_text_node`
  build the continuation segments. Cell content reuses `render_box_content` by treating `cell.block`
  as a "box".
- `js/render_box_tool_print.js` — renders a component's flat print value. `render_box_content`
  (literal vs relation-table paths), `render_relation_table` (cached per-record table + columns),
  `assemble_table_dom`, `render_cell_value`, `flatten_print_node` (strips chrome, converts
  input/select/textarea → text), `full_value_mode(model)` (= 'edit' for component_text_area to get
  the FULL untruncated value — list mode truncates ~220 chars server-side),
  `PRINT_CHROME_SELECTORS`.
- `js/canvas_tool_print.js` — model + editor interaction. `new_layout`/`new_row`/`new_cell`/
  `new_spacer_row`/`component_block`, `serialize_layout`/`serialize_row`/`serialize_cell`/
  `serialize_block` (v2). `render_canvas` → `layout_flow().then(decorate_editor)`. Mutations:
  `add_row`/`add_spacer`/`insert_row_after`/`insert_spacer_after`/`remove_row`/`move_row`/
  `move_row_dir`, `add_cell`/`remove_cell`/`set_cell_width`/`resize_cells` (live divider drag)/
  `set_cell_block`/`set_row_space_after`, `select_cell`, `delete_selection` (Delete key),
  `add_table_column` (drop a related field onto a table cell → column; non-matching → replace).
  mm helpers `PX_PER_MM`/`mm_to_px`/`px_to_mm`/`page_dims`/`snap_mm`, `PAGE_FORMATS`, `font_stack`,
  `apply_box_style`.
- `js/render_tool_print.js` — toolbar, palette (replace-nav + breadcrumb), inspector
  (`sync_inspector`/`on_inspector_change` target `{row, cell}`: cell width %, row gap, font/color/
  border, show-label/header, `render_table_columns_ui`), template CRUD (`do_save`/`do_save_as`/
  `do_new`/`do_delete`/`load_template`/`refresh_template_picker`/`normalize_blob`), and the PRINT
  path (`do_print` → `render_print_document` = `layout_flow(make_print_ctx)` per record → `set_page_style`
  → `window.print()`).
- `js/print_layout_presets.js` — dd25/dd625 CRUD (create/save/load/query/delete); unchanged from
  the export-preset shape, stores whatever blob it's given.
- `css/tool_print.less` — editor grid, sticky toolbar + sidebars, flow row/cell chrome, the white
  print page, `@media print`.

## Hard-won gotchas (don't relearn these)

- **Page = white paper.** Anything rendered ON the page (`.print_root`/`.print_page`/`.cell_content`)
  must use FIXED or inherited colors, NEVER theme tokens (`--fg_*`/`--bg_*`) — those flip light in
  dark mode and vanish on white. Values follow the box color via
  `.print_root .cell_content * { color: inherit !important }` (descendants only — don't target
  `.cell_content` itself or you erase its inline source color). The toolbar uses `--bg_surface_alt`,
  not `--bg_header` (which is dark in BOTH themes). See [[dedalo-css-styling]].
- **Component values impose fixed heights** (text_area = CKEditor with a ~180px scrollable
  `.value_container`, `.wrapper_component` is `display:grid`). For the row to be as tall as the
  text, force page values to natural height: `.cell_content .wrapper_component{display:block} … {height:auto
  !important; max-height:none; overflow:visible}`.
- **text_area is truncated** ~220 chars in LIST mode server-side — render text in EDIT mode
  (`full_value_mode`) for the full value; `flatten_print_node` pulls `textarea.value` /
  contenteditable; also strip the edit-mode `.label`/`.note` (duplicate of the box label).
- **Stale JS module cache** is REAL and brutal here: the tool's cross-module static imports resolve
  to the *cached* modules, so you CANNOT reliably fresh-import `render_tool_print` to test (it pulls
  the new canvas exports against the cached old canvas). A real **Cmd+Shift+R** is required to test
  integrated UI. For CSS, a stale `<link>` keeps old `!important` rules that injection can't remove —
  disable it (`l.disabled=true`) and inject, or hard-reload. Verify isolated logic by
  `import('…?v='+Date.now())` of the leaf module (canvas/flow_engine/render_box).
- **save bug pattern:** `do_save_as` must NOT use a native `prompt()` (blocked in the tool window →
  silent abort) — use the inline name field. `load_template` must accept v2 blobs (`if(!blob)`, not
  `!blob.pages`).
- The cell that holds a table: `block.related_section_tipo`/`available_columns` are set on the block
  by `render_relation_table` during render — `add_table_column` reads them. `apply_columns` detects
  v2 and re-renders the whole canvas (pagination can change), reselecting the cell.

## Known limitations / future

- Pinned/free (out-of-flow) blocks and running headers/footers on continuation pages are deferred.
- Phase-2 server-side PDF (`generate_pdf`) reuses the same flow model.
- Dead code: the original absolute-box functions in canvas + the old print paginator still exist
  (kept so imports resolved mid-rewrite) — clean up.

Builds on [[dedalo-tools]], [[dedalo-css-styling]], and the component render path
([[dedalo-context-data-layers]]); reuses `tool_export`'s drag/preset patterns ([[dedalo-export]]).
