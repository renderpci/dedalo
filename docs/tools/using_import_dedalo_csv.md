# CSV import (`tool_import_dedalo_csv`)

> See also: [Tools user guide](index.md) · [Developer reference](../development/tools/reference/tool_import_dedalo_csv.md)

Import a CSV file into a section, creating or updating one record per row and conforming each cell to the target component. This is the tool that round-trips a `dedalo_raw` export back into Dédalo.

## What it's for

Most cataloguing corrections are faster in a spreadsheet than one record at a time. You export a section, fix the transcriptions, dates or codes in bulk, and bring the file back in. Because every row carries its own `section_id`, the records you edited are updated in place — nothing is duplicated.

Concrete scenario: a numismatics team exports the *Types* section (`numisdata3`) with the export tool in the `dedalo_raw` format, cleans up the legend transcriptions and date ranges in a spreadsheet, and re-imports the file here. Each Type record is matched by its `section_id` and updated; empty cells clear the component they sit under; and with the time-machine option left on, the whole batch stays reversible.

The same tool also accepts hand-authored CSVs — a plain number, a date like `2023/10/26`, or a comma-separated list of related ids — so you can prepare data outside Dédalo without learning the internal JSON shapes. The full per-component format catalogue lives in [Importing data](../core/importing_data.md).

## When to use it

- You exported a section, edited it in a spreadsheet, and want the changes back in Dédalo.
- You are seeding a section with data prepared outside Dédalo, keyed by `section_id`.
- You need to clear the same component across many records (leave its column empty).

When NOT to use it:

- To ingest media files (images, audio, video, PDFs), use [Media file import](using_import_files.md) instead.
- To import a library MARC21 catalogue, a Zotero bibliography, or an RDF graph, use the format-specific importers: [MARC21 import](using_import_marc21.md), [Zotero import](using_import_zotero.md), [RDF import](using_import_rdf.md).

## Where to find it

The tool surfaces on **sections** — its target is always a whole section, because it writes records keyed by `section_id`. Open it from the section's tools, and it opens in **its own window**.

The filename can name the target section: a file called `types_clean-numisdata3.csv` is auto-detected as targeting `numisdata3`. If the name does not carry a section tipo, the tool falls back to the section you opened it from, and you can override the target by hand in the file card.

## Using it, step by step

1. **Prepare the CSV.** The first row is a header of component `tipo`s, and one column must be `section_id` (by convention the first). Every following row is a record. Save the file as UTF-8 without a BOM. See [Importing data](../core/importing_data.md) for the exact cell formats.
2. **Open the tool** on the target section and **drop or select** the CSV file. Dédalo stages it and shows a file card.
3. **Confirm the target section.** The card shows the auto-detected `section tipo` and the resolved section name. Correct it if the detection is wrong.
4. **Check the column mapping.** The columns mapper lists every CSV column with its detected model and label, a *Selected* checkbox, a *Mapped to* component selector, and a sample value. A column whose header matches a component `tipo` is ticked and mapped automatically; adjust any that did not match.
5. **Set number decimals if needed.** When a column maps to a `component_number`, a decimal selector appears — choose `.` or `,` to match your spreadsheet.
6. **Preview.** Use the preview toggle on each card to see sample rows, or the parse errors if the file has malformed JSON cells.
7. **Edit the process title** if you want the bulk-process record to carry a recognisable name.
8. **Tick the file's checkbox** to select it for import, leave *Save time machine history on import* on, and click **Import**.
9. **Watch progress.** A live progress bar shows the current file, row and component, with running created / updated / failed / warning counts. When it finishes, each file shows its report.

## Options

| Option | What it does |
| --- | --- |
| Section tipo | The target section for the file. Auto-detected from the filename, overridable per file. |
| Selected (per column) | Whether that column is imported. Unmapped columns and the `section_id` column are skipped. |
| Mapped to (per column) | The target component the column writes into. Re-resolved from the ontology on the server. |
| Decimal (number columns) | The decimal separator (`.` or `,`) used to parse a `component_number` column. |
| Process title | The label of the bulk-process record that tracks (and reverts) the run. |
| Save time machine history on import | On by default. When off, the batch is **not** reversible. |

## Tips and gotchas

!!! tip "Round-trip is the safe path"
    Exporting a section in `dedalo_raw` format and re-importing it unchanged reproduces the data exactly. Start from a raw export, edit only the cells you mean to change, and you cannot accidentally reshape a value.

!!! warning "An empty cell clears data"
    An empty cell is imported as `null` and **clears** the existing value of that component for the record (and for the current data language, when the component is translatable). To leave a component untouched, omit its column entirely rather than leaving it blank.

!!! warning "Headers must match exactly"
    Each CSV header must match its mapped column name exactly, including suffixes like `tch56_dmy` (date format) or `tch191_rsc723` (relation target). A column whose header does not match is **silently skipped** — no data is imported and no error is raised. Review the mapping before launching.

!!! tip "Read the report before moving on"
    The report separates **failed** cells (rejected, the record kept its previous value) from **warnings** (written, but worth a look — for example a language code that is valid but not in the project's configured languages). The *created* and *updated* lists are the actual `section_id`s, and you can copy them straight into a search to inspect what changed.

!!! warning "Time machine is your undo"
    Leaving *Save time machine history on import* on records a reversible snapshot per row, tracked by the bulk-process record. A large run with the option off cannot be rolled back from that record — see [Time machine](using_time_machine.md).

## Related

- **[Data export](using_export.md)** — the export counterpart; its `dedalo_raw` format produces the CSV this tool round-trips.
- **[Media file import](using_import_files.md)** — ingest media files and their records, not CSV record data.
- **[MARC21 import](using_import_marc21.md)**, **[RDF import](using_import_rdf.md)**, **[Zotero import](using_import_zotero.md)** — format-specific importers.
- **[Bulk component edit](using_propagate_component_data.md)** — search-driven bulk edits with the same bulk-process and time-machine reversion model.
- **[Time machine](using_time_machine.md)** — how the reversible snapshots this tool writes are reviewed and rolled back.
- **[Importing data](../core/importing_data.md)** — the per-component CSV format catalogue, the `dedalo_data` wrapper, and empty-cell semantics.
- **[Exporting data](../core/exporting_data.md)** — the export side of the round-trip.
- **[Developer reference](../development/tools/reference/tool_import_dedalo_csv.md)** — actions, options and the import engine.
