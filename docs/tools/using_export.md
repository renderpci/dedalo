# Export (`tool_export`)

> See also: [Tools user guide](index.md) · [Developer reference](../development/tools/reference/tool_export.md)

Export turns the records you are currently looking at in a section into a spreadsheet-style flat table. You choose which components become columns, in what order, and how relations and hierarchies are flattened, then download the result as CSV, TSV, ODS, XLSX or HTML — or as a re-importable backup.

## What it's for

Dédalo stores richly structured data: multi-language values, relations to lists and thesauri, hierarchies and dataframes. That structure is what makes cataloguing precise, but a colleague, a printer or a spreadsheet expects a flat grid. Export is the bridge: it flattens the current selection into rows and columns that you shape for the job at hand, so nothing is a blind dump.

Concrete scenario: a numismatics cataloguer has filtered the *Coins* section down to the issues of a single mint and needs a report for a colleague. They open Export on that filtered list, drag *Inventory number*, *Weight*, *Diameter* and the related *Mint → name* into the active columns, pick a breakdown so each linked value lands cleanly, run the export and download an XLSX. The same column arrangement is saved as a named preset for the next batch.

## When to use it

- You need section data as a spreadsheet or report (CSV / TSV / ODS / XLSX / HTML).
- You want a re-importable backup of a section, or to move data between installations. Use the **Dédalo (Raw)** format, which wraps each cell so the [CSV import tool](using_import_dedalo_csv.md) can read it back byte-for-byte.
- You want the media files referenced by a set of records.

When *not* to use it:

- To edit records — Export is read-only. Edit in the section itself.
- To produce a positioned, paginated document (a catalogue card, a study sheet) — use [Print](using_print.md) instead.
- To publish records to a live public site — use [Diffusion](using_diffusion.md).

## Where to find it

Export is a **section toolbar** button. It appears on a section when you view it in **list** mode. It is not an inspector or inline-component button, and it opens in **its own window** so you can keep the section list visible behind it.

The export always covers the **whole current selection** — every record matching your active filter, not just the page you can see. To export a subset, narrow the section filter first.

## Using it, step by step

The window has three panes: available components on the left, your active columns in the centre, and configuration plus a live preview on the right.

1. Filter the section list down to exactly the records you want to export.
2. Open **Export** from the section toolbar.
3. From the left pane, drag the components you want into the centre **active columns** pane. The top-to-bottom order there is the left-to-right column order in the output.
4. For a relation or hierarchy column, drill into it to reach the related field you want (for example *Mint → name*), and optionally turn on **parents** for that column to also emit the ancestor chain of each term.
5. On the right, choose the **data format** and, for a breakdown format, the **breakdown** mode (see [Options](#options)).
6. Watch the **preview** fill as the export streams. It resolves as soon as the first metadata arrives, then keeps adding rows with a progress bar.
7. Download in the format you need (CSV / TSV / ODS / XLSX / HTML), or the referenced media.
8. Optionally save the current column arrangement as a **named preset** so you can reuse it on the next batch. Presets are per user.

## Options

| Option | What it does |
| --- | --- |
| Active columns (drag order) | The components to export, in output order. Drag them from the available pane; reorder by dragging within the active pane. |
| Data format | `value` — one flat cell per column (the everyday choice). `grid_value` — a breakdown that explodes multi-valued relations. `dedalo_raw` — the round-trip wrapper for re-import and backups. |
| Breakdown | For the `grid_value` format only: `default`, `rows` (one row per related item) or `columns`. |
| Fill the gaps | Repeats record-level values on each exploded row so no cell is left blank. On by default. |
| Values with parents | Adds a sibling column with the ancestor chain of relation or hierarchical targets. Off by default; can also be set per column. |

## Tips and gotchas

!!! tip
    Save a preset once you have a column arrangement you like. Next time you export the same section you can load it instead of dragging every column again.

!!! tip
    The **Dédalo (Raw)** format is the safe way to back up a section or hand data to another installation — its cells import back exactly, unlike a plain CSV where structure is lost.

!!! warning
    Export always serializes the **entire filtered selection**, not the visible page. If you only want some records, tighten the section filter before you export; there is no page limit inside the tool.

## Related

- **[Import from Dédalo CSV](using_import_dedalo_csv.md)** — consumes the `dedalo_raw` export to re-import records byte-for-byte.
- **[Print](using_print.md)** — for a positioned, paginated, record-driven document rather than a flat table.
- **[Diffusion](using_diffusion.md)** — the other way data leaves Dédalo: publishing to a live target instead of downloading a file.
- **[Exporting data](../core/exporting_data.md)** — the deeper guide to formats, breakdown modes, presets and the export contract.
- **[Developer reference](../development/tools/reference/tool_export.md)** — the API action, options and internals.
