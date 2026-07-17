# Time machine (`tool_time_machine`)

> See also: [Tools user guide](index.md) · [Developer reference](../development/tools/reference/tool_time_machine.md)

Browse the full change history of a record or a single field and restore any earlier version — including undoing a whole batch edit in one action.

## What it's for

Dédalo keeps **every** user change to a record's data as a history entry. The time machine is the window into that history: for one field or one whole record you can see when it changed, who changed it, and what the value was — then restore the version you want. It is your safety net for the everyday mistake (a wrong date typed last week) and for the big one (a batch run that mis-set a field across hundreds of records).

Concrete heritage scenario: a cataloguer notices the *dating* of a coin issue was changed to the wrong century. They open the time machine on the *Date* field, see the change list, select the entry from before the bad edit — the previous value shows in the preview pane — and press **Apply and save**. The date is restored, and the restore itself is logged as a new history entry. Separately, an administrator finds that a propagation run mis-set a field across 400 records; they open the tool on any affected record, pick the entry carrying that run's batch id, and **Revert the bulk process** — every record the run touched rolls back at once.

## When to use it

- Someone needs to **see the edit history** of a record or a field — when, who, what value.
- You need to **roll back** a mistaken edit to an earlier value.
- An administrator needs to **undo a whole batch run** (for example a [Propagate component data](using_propagate_component_data.md) run) across every record it changed.
- It is **not** a diff/merge tool and not a general undo stack — it restores a chosen past snapshot wholesale into the live record.

## Where to find it

The time machine attaches to record elements — both individual **components** and whole **section records**. It opens in **its own window**. Open it from a component to work on that one field's history, or from a section record to work on the whole record at once.

## Using it, step by step

1. **Open the time machine** on the field or record whose history you want to see. A scrollable **history list** shows the change entries, most recent first, with when / who / which field.
2. For a single component or record, the window shows two panes side by side: a **Now** pane with the current value, and a **preview** pane.
3. **Pick an entry.** Click a history row's preview (eye) icon. The historical value loads into the preview pane, read-only, so you can compare it against **Now** before committing.
4. **Apply and save.** When you are sure, press **Apply and save** — the live value is overwritten from the snapshot you selected. Restoring a whole section record restores all its components at once, and recovers any files that were deleted with it. The restore is itself recorded as a new history entry.
5. **Revert a batch (administrators).** If the entry you picked belongs to a batch run, an administrator additionally sees **Revert the bulk process**. Pressing it rolls back every record that run changed to its pre-run value, in one operation. Non-administrators see a notice to contact an administrator instead.

## Options

| Control | What it does |
| --- | --- |
| History list | The change entries for the element, newest first — when, who, and which field changed. |
| Preview (eye) icon | Loads the chosen historical value into the read-only preview pane for comparison with **Now**. |
| Language selector | Chooses which language of the value to view and restore. |
| **Apply and save** | Overwrites the live value with the selected snapshot (a component, or a whole record and its files). |
| **Revert the bulk process** | Administrator-only: undoes an entire batch run across every record it touched. |

## Tips and gotchas

!!! tip "Compare before you restore"
    Always check the preview against the **Now** pane before pressing **Apply and save** — a restore replaces the whole current value with the snapshot, it does not merge the two.

!!! warning "Restoring overwrites the current value"
    **Apply and save** and **Revert the bulk process** overwrite live data. They are reversible (each restore is itself logged as new history), but they are not partial — the whole selected snapshot lands on the record. Reverting a batch and applying a component restore both need write permission on the record; reverting a batch needs an administrator role.

!!! info "How batch undo links up"
    A batch tool stamps every write in one run with the same id. That id is what the time machine's **Revert the bulk process** follows to find and roll back every affected record — so a single mistaken [propagation](using_propagate_component_data.md) is undone as one unit, not record by record.

## Related

- **[Propagate component data](using_propagate_component_data.md)** — the batch tool whose runs the time machine can revert as a whole.
- **[Export](using_export.md)** — export the change history itself for offline review.
- **[Developer reference](../development/tools/reference/tool_time_machine.md)** — internals, API actions and options.
