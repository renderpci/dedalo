# Exporting data

> See also: [Importing data](importing_data.md) · [Component dataframe](components/component_dataframe.md) · [Glossary](glossary.md)

Take a section's records and turn them into a flat downloadable table (CSV, TSV, ODS, XLSX, HTML or print), or a re-importable raw backup. This page covers the export tool's UI and, for developers, the export pipeline and component contract.

## Introduction

Exporting is the counterpart of [importing](importing_data.md): it takes the data
of a section and turns it into a flat table (rows and columns) that you can
download as CSV, TSV, ODS (LibreOffice), XLSX (Excel), HTML, or print. You can
also download the media files (images, audiovisuals, PDFs, 3D, SVG) referenced by
the exported records.

Because Dédalo stores **highly structured** data — values in several languages,
relations to lists and thesauri, hierarchies, dataframes — exporting is not a
simple dump. The export tool lets you decide **which components become columns**,
**in which order**, and **how relations and hierarchies are flattened** into a
spreadsheet, so the result is meaningful for the use you have in mind (a report, a
migration, a backup, an analysis in a spreadsheet, etc.).

A special **raw** format produces an export that can be re-imported without any
change (round-trip), which makes it a convenient way to back up or move data
between Dédalo installations.

!!! info "What gets exported"

    The export always covers the **whole current selection** of the section — the
    set of records produced by your current search/filter — not just the page you
    are looking at. Configure the search first, then export.

## Opening the export tool

1. Open a section in **list** mode and configure the search/filter so the list
   shows the records you want to export.
2. Click the **Export** button in the section toolbar.

The export tool opens in its own window with three areas:

- **Left** — the list of the section's components (the available columns). Relation
  components can be expanded to reach the components of the related section.
- **Center** — *Active elements*: the columns you have chosen, in order.
- **Right** — the configuration panel: presets, format and options, the **Export**
  button, the download buttons, and the live preview.

## Choosing the columns

**Drag a component** from the left list and **drop it** into the *Active elements*
list in the center. Each dropped component becomes one column of the export.

- **Order matters.** The export columns follow the exact order of the *Active
  elements* list. **Drag the items up and down** to reorder them; the output
  columns (and every download) follow that order.
- **Remove** a column with the **×** on its item.
- **Activate all columns / Deactivate all columns** add or clear the whole set at
  once.
- **Relations and hierarchies**: expand a relation component (▶) on the left to
  reach the components of the related section and export them as columns too (for
  example, export the *name* of a related "Mint" instead of just the link).

!!! tip "The order you drop and drag is the order you get"

    The list of *Active elements* is the single source of truth for the column
    order. If you reorder the items, the next export — and the CSV/Excel/… you
    download — reflects the new order exactly.

### Per-component "parents" (ancestor chain)

Hierarchical components (thesaurus terms) have a chain of ancestors. When you add
such a component you get a small **parents** checkbox on its item: enable it to add
a sibling column with the term's ancestor chain (joined with ` > `). See
[Export parents](#export-parents) for the global option.

## Export options

All options are in the right-hand configuration panel.

### Format

| Format | Value | What it produces |
| --- | --- | --- |
| **Standard** | `value` | One flat value per cell. Multiple values of a relation are joined in the same cell. The most readable format. |
| **Breakdown** | `grid_value` | Relation items are *exploded* into extra rows and/or extra `\|n` columns, so each related item gets its own cell. See [Breakdown mode](#breakdown-mode). |
| **Dédalo (Raw)** | `dedalo_raw` | Each cell is the exact Dédalo internal value wrapped as `{"dedalo_data": …}`. Not meant to be read by humans; it is the **round-trip** format (see [Raw export and round-trip](#raw-export-and-round-trip)). |

### Breakdown mode

Only applies to the **Breakdown** format. It controls how a component with several
related items (for example a record linked to three "types") is laid out:

| Mode | Value | Layout |
| --- | --- | --- |
| **Default** | `default` | The first relation level becomes extra **rows**; deeper levels become extra **`\|n` columns**. Keeps the legacy behavior. |
| **Rows** | `rows` | Every related item becomes an extra **row**. Sibling columns are aligned; spanning (parent) values can be repeated down the rows (see [Fill the gaps](#fill-the-gaps)). |
| **Columns** | `columns` | Every related item becomes extra **columns** with a `\|n` suffix. One row per record. |

!!! example "Rows vs Columns"

    A record *R1* linked to mints *A* and *B*:

    **Columns** (one row per record):

    | id | Mint\|1 | Mint\|2 |
    | -- | ------- | ------- |
    | R1 | A       | B       |

    **Rows** (one row per related item):

    | id | Mint |
    | -- | ---- |
    | R1 | A    |
    | R1 | B    |

### Fill the gaps

(Default **on**.) In the **Rows** breakdown, when a record explodes into several
rows, the values that belong to the record itself (not to the exploded relation)
are **repeated** on every row instead of being left blank. Turn it off to leave the
spanning cells empty except on the first row.

### Show ontology tipo

Adds the component **ontology tipo** to the column headers in the preview (useful
to identify exactly which component a column maps to). This only changes the
header text shown in the tool.

### Export parents

(Default **off**, not available for the *Dédalo raw* format.) The global version of
the [per-component parents](#per-component-parents-ancestor-chain) option: for every
relation/hierarchical column, add a sibling column with the ancestor chain of each
linked term (joined with ` > `). You can instead enable it column by column with the
per-item **parents** checkbox.

## The preview

Press **Export** to run it. A table preview is rendered and **fills in live** as the
records stream from the server, with a progress bar. The preview is *what you see is
what you get*: every download is built from the same data shown in the preview.

The preview has a sticky header, a frozen first (id) column, zebra rows, image and
audiovisual thumbnails, and clickable links — so even wide exports stay readable.

## Downloading the data

Once the export has run, the download bar offers:

| Button | File | Notes |
| --- | --- | --- |
| **CSV** | `.csv` | `;`-separated, RFC-4180 quoted. Re-importable (see below). |
| **TSV** | `.tsv` | Tab-separated, unquoted. |
| **ODS** | `.ods` | LibreOffice Calc. |
| **XLSX** | `.xlsx` | Microsoft Excel. |
| **HTML** | `.html` | The table as a standalone HTML page. |
| **Media** | `.zip` | Downloads the media files (image, audiovisual, PDF, 3D, SVG) referenced by the exported records. A dialog lets you pick the **quality** per media type. |
| **Print** | — | Opens the browser print dialog for the preview. |

!!! note "Encoding"

    Text downloads are UTF-8. CSV uses `;` as the field separator and escapes inner
    quotes by doubling them, matching the [import](importing_data.md#format) format.

## Saving export configurations (presets)

Building a useful export (the right columns, in the right order, with the right
options) takes effort, so you can **save it as a preset** and reuse it later. Presets
are stored **per user** in the database.

In the **presets** block at the top of the configuration panel:

- **＋ (New)** — saves the current configuration (selected columns + format +
  breakdown + all options) as a new preset and opens a small editor to give it a
  **name**, and optionally mark it **Public** (shared with all users) or **Default**.
- **Apply** (on a preset row) — loads that preset: it rebuilds the selected columns
  in order and restores the format and options.
- **Save changes** — updates the currently selected preset with the current
  configuration.
- **Edit / Delete** — rename/flag or remove a preset.

Presets are **scoped to the section** you are exporting (a preset created on one
section does not appear on another). Public presets are visible to every user; your
own presets are private unless you mark them public.

!!! note "Presets vs the auto-remembered state"

    Independently of presets, the tool remembers your **last** column selection (per
    section) and your last format/breakdown choice in the browser, so reopening the
    tool restores where you left off. Presets are the named, shareable, cross-device
    version stored in the database.

## Raw export and round-trip

The **Dédalo (Raw)** format (`dedalo_raw`) exports each cell as the exact internal
value, wrapped with the `dedalo_data` property:

```json
{"dedalo_data":[{"value":"Hello","lang":"lg-eng","id":1}]}
```

A CSV produced with this format can be **re-imported as-is** with the
[CSV import tool](importing_data.md): the import detects and unwraps the
`dedalo_data` wrapper transparently, reproducing the exact stored data (a
round-trip). This makes raw export a practical way to **back up** a section or
**move data** between installations.

See [The dedalo_data wrapper](importing_data.md#the-dedalo_data-wrapper) and
[The dataframe envelope](importing_data.md#the-dataframe-envelope) for the details of
the wire shape (including how [dataframe](components/component_dataframe.md) rows
travel alongside the data).

!!! warning "Raw is not for reading"

    The raw format is meant for machines (round-trip), not for analysis. Use
    **Standard** or **Breakdown** when a person or a spreadsheet will read the result.

---

## For developers

> The TS/Bun server re-implements this tool end to end in
> `tools/tool_export/server/tool_export.ts`
> (`toolExportGetExportGrid()`) — same request shape, same NDJSON wire
> protocol, same client (`flat_table.js` and friends are copied as-is). The
> vanilla-JS client and the wire contract are unchanged from the PHP server;
> only the server-side implementation moved.
>
> Since the export unification (diffusion P6), record RESOLUTION rides the
> shared diffusion engine: the handler routes to `src/diffusion/export/`
> (`compileExportPlan` turns `ar_ddo_to_export` into a `PublicationPlan`;
> the diffusion resolver's atom entry point walks relation hops and stored
> locators). The protocol, the three data formats and every option are
> UNCHANGED — output is byte-identical to the previous build (A/B-gated by
> `test/unit/diffusion_export_unified.test.ts` and the live-PHP
> differential). `DEDALO_EXPORT_UNIFIED=false` falls back to the legacy
> in-tool pipeline until its ledgered deletion.

### The export pipeline

```text
ar_ddo_to_export (chosen columns, user order)
        │  POST dd_api:'dd_tools_api', action:'tool_request', source.action:'get_export_grid'
        ▼
src/core/tools/dispatch.ts   dispatchToolRequest() — permission-gated per-tool registry
        ▼
tools/tool_export/server/tool_export.ts   toolExportGetExportGrid()
        │   resolves the SQO (search/sql_assembler.ts) then, per data_format,
        │   walks each export ddo's path to atoms and mints columns/rows —
        │   there is no separate per-component override class: the SAME
        │   leaf-value resolver the relation_list panel uses
        │   (resolve/relation_list.ts resolveCellValue/resolvePathValue) is
        │   reused so both surfaces stay byte-identical.
        ▼  NDJSON (ndjson_stream:true) or a whole {meta,columns,rows} object
flat_table.js       accumulate lines → preview + CSV/TSV/ODS/XLSX/HTML/media
```

The server forces the SQO to the full filtered selection (`sqo.limit = null`
→ ALL, `offset = 0`) after the read-permission gate, so the export always
covers the whole search result rather than the client's clamped page limit.

### API

`tool_export.get_export_grid(options)` — dispatched through
`dd_tools_api::tool_request` (the RQO wire shape is unchanged). The TS module
(`tools/tool_export/server/index.ts`) declares the action's own permission
spec inline (`{ permission: 'section', minLevel: 1, handler: ... }`), enforced
by the generic per-tool dispatcher `dispatchToolRequest()`
(`src/core/tools/dispatch.ts`) — this replaced PHP's per-class `API_ACTIONS`
allowlist + reflection with one explicit, typed dispatch table shared by
every tool (see `engineering/TOOLS_SPEC.md`). Request fields:

| Field | Meaning |
| --- | --- |
| `section_tipo` | Target section (read-permission gated). |
| `model` | `'section'`. |
| `data_format` | `'value'` \| `'grid_value'` \| `'dedalo_raw'`. |
| `breakdown` | `'default'` \| `'rows'` \| `'columns'` (used with `grid_value`). |
| `fill_the_gaps` | bool — repeat spanning values on exploded rows. |
| `value_with_parents` | bool — add ancestor-chain sibling columns (n/a for `dedalo_raw`). |
| `ar_ddo_to_export` | the columns, **in output order**. |
| `sqo` | the search query object (the selection to export). |
| `ndjson_stream` | bool — stream the flat-table protocol vs return it whole. |

### The flat-table NDJSON protocol

The server emits newline-delimited JSON; each line is discriminated by `t`:

| Line | Shape | Purpose |
| --- | --- | --- |
| `meta` | `{t:'meta', v, data_format, breakdown, fill_the_gaps, section_tipo, total}` | Stream header. |
| `col` | `{t:'col', i, key, group, path, label, ar_labels, cell_type, model, after}` | A column, emitted on first use. `i` is the stable ordinal cells reference; `label` is server-resolved; `after` hints live insertion. |
| `row` | `{t:'row', rec, sub, c:{ordinal:value, …}}` | A (sub)row; `c` is sparse (ordinal→value); `sub` is the explosion index. |
| `end` | `{t:'end', columns:[ordinal,…], rows, records}` | Authoritative display column order + counts. |

The **column order in the output equals the order of `ar_ddo_to_export`**, which in
the tool equals the order of the *Active elements* DOM list — i.e. the order the
user defined by dragging. `cell_type` (`text` \| `img` \| `av` \| `iri` \|
`section_id` \| `json`) drives how `flat_table.js` renders each cell.

### The component contract

The PHP server gives every component a `get_export_value(export_context) :
export_value` override point (a flat list of `export_atom`
`{path, value, cell_type}`), with relation components recursing
component-driven via `export_context->descend()`. The TS server does not
(yet) expose a per-component override hook: `tool_export.ts` resolves every
cell through the SAME generic leaf-value walkers the relation_list panel uses
(`resolvePathValue` / `resolveCellValue` in `src/core/resolve/relation_list.ts`),
keyed on the export ddo's `path` — one shared engine instead of one override
per component model. This is a deliberate architectural simplification for
the models it covers (see `rewrite/STATUS.md` "tool_export" for the exact
coverage: `value`, `grid_value` with all three breakdown modes, `dedalo_raw`,
multi-hop paths, NDJSON streaming and media/image cells are all ported and
differential-gated against the live PHP server); a genuinely new component
shape that the shared resolver cannot express would need its own case added
there rather than an override method.

- The flat-join (`value` format) reference is `resolvePathValue()`.
- `dedalo_raw` cells are the exact stored value JSON-encoded with the
  `dedalo_data` wrapper (dataframe-carrying mains ship
  `{dedalo_data:{dato, dataframe}}`) — see
  [The dedalo_data wrapper](importing_data.md#the-dedalo_data-wrapper) for the
  shared shape with the import side.

### Files

- `tools/tool_export/server/tool_export.ts` — request handling + the P6 routing seam (`toolExportGetExportGrid`); the legacy in-file build stays behind `DEDALO_EXPORT_UNIFIED=false` until its ledgered deletion.
- `src/diffusion/export/{compile_columns,atoms,grid,index}.ts` — the unified build: column-set plan compile, shared-walk atoms, NDJSON grid emission (`exportGridUnified`).
- `tools/tool_export/server/index.ts` — the tool's `ToolServerModule` registration.
- `src/core/resolve/relation_list.ts` — the shared leaf-value resolvers (`resolvePathValue`, `resolveCellValue`) reused from the relation_list panel.
- `tools/tool_export/js/flat_table.js` — client accumulator, preview, downloads (copied as-is).
- `tools/tool_export/js/{render_tool_export,drag_tool_export}.js` — UI and drag-and-drop column model (copied as-is).
- `tools/tool_export/js/export_user_presets.js`, `client/dedalo/core/section/js/view_export_user_presets.js` — per-user presets (section `dd1781`; ordinary ontology data, no dedicated TS engine needed).
