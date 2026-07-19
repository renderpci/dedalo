# Update cache (`tool_update_cache`)

> See also: [Tools user guide](index.md) · [Developer reference](../development/tools/reference/tool_update_cache.md)

Regenerate the stored, derived data of a section's components across many records at once — a maintenance pass that re-saves each record so its derived data is rebuilt.

!!! note "This is an administrator tool"
    Update cache re-saves records in bulk to repair derived data. It is a maintenance operation for administrators, not part of everyday cataloguing. If you only want to *change* a value across records, use [Propagate component data](using_propagate_component_data.md) instead.

## What it's for

Some of what a component stores is **derived** when the record is saved — for example the ancestor index an autocomplete component keeps so lookups stay fast, or counter values kept in step. When that derivation logic changes, or records were written by a path that skipped it, the stored data drifts from what a fresh save would produce. Update cache fixes the drift in bulk: it walks every record a filter matches and **re-saves** the components you select, so the normal save path re-runs its derivation for each one. The value the user sees does not change — only its stored/derived form is refreshed.

Concrete heritage scenario: a numismatics collection reworks its mint thesaurus, changing the ancestor chain an autocomplete component depends on. The stored index on thousands of *Coins* records is now stale, so lookups return the old structure. An administrator opens update cache on the *Coins* section, ticks the affected component, and runs it — every matched record is re-saved and its derived data rebuilt, with no record opened by hand.

## When to use it

- After an **ontology or thesaurus change** that affects how a component's derived data is computed.
- To **repair drift** in stored/derived data across a body of records.
- **Not** to change data — it writes each component's current value back to itself. To set, add or remove a value across records, use [Propagate component data](using_propagate_component_data.md).

## Where to find it

Update cache is a **section-level** tool: you open it on a section, and it lists that section's components for you to choose from. The panel shows the section name and its component tree.

## Using it, step by step

1. **Open update cache** on the section you want to maintain. The tool fetches the section's component list and shows it as a checkbox tree; media components and any components an administrator has flagged for easy location are highlighted.
2. **Tick the components** whose stored data you want to regenerate. (Automatic system fields cannot be selected.)
3. Optionally narrow the scope with a **section filter** before opening the tool — the run then covers only the matched records. With no filter, it covers the whole section.
4. Press **Update records** (the button shows the record count in scope). Confirm when prompted.
5. The run executes in the **background** and shows **live progress** — a running counter of records processed — then a final summary of components and records updated. If you close and reopen the panel while a run is still going, the progress view re-attaches to it.

## Options

| Control | What it does |
| --- | --- |
| Component checkboxes | Select which of the section's components to regenerate. |
| **Update records** | Starts the background regeneration over the records in scope; the label shows the count. |
| Regenerate options (media) | Media components may expose extra flags (for example *Delete normalised files*). |

!!! note "Media components"
    Selecting a media component **repairs its media**: the tool rebuilds the standard derivatives (default quality and thumbnail — for images also the display envelope) from the original file where it is present on the server, then re-scans the disk and updates the record's stored file index (`files_info`). This is the fix when an image exists on disk but does not show in the application. Records whose original is not on the server are left with an index that honestly reflects what exists. Audio/video derivatives are not re-transcoded here; for higher image tiers, deletes and av versions use [Media versions](using_media_versions.md).

## Tips and gotchas

!!! warning "This re-saves real records in bulk"
    Update cache writes to every matched record. It does not change the visible value, but it is still a large write operation: it needs write permission on the section, runs as a background job, and can take a long time on big sections. Narrow the scope with a filter when you can.

!!! tip "Value change vs. cache refresh"
    If you want the value to *change* across records, this is the wrong tool — use [Propagate component data](using_propagate_component_data.md). Update cache only refreshes the stored/derived form of the value that is already there.

## Related

- **[Propagate component data](using_propagate_component_data.md)** — change a component's value across matched records (this tool only re-derives it).
- **[Media versions](using_media_versions.md)** — rebuild media file qualities and versions.
- **[Developer reference](../development/tools/reference/tool_update_cache.md)** — internals, API actions and options.
