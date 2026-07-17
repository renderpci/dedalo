# Ontology parser tool (`tool_ontology_parser`)

> See also: [Tools user guide](index.md) · [Developer reference](../development/tools/reference/tool_ontology_parser.md)

Keeps the runtime ontology consistent with its editable source: it shows you what has drifted per hierarchy, reconciles only the difference, rebuilds a hierarchy from scratch when needed, and exports the ontology as files for sharing between installations.

!!! warning "This is a developer/administrator tool"
    Every action here is gated to developers/superusers. It reads and rewrites the rows that drive your installation's data model. If you are not maintaining the ontology, you do not need this tool.

## What it's for

The runtime ontology (`dd_ontology`) is a derived projection of the editable ontology source (`matrix_ontology`) — one runtime node per source record. Normal edits keep the two in sync as you save, but bulk imports, restores, failed partial writes, or direct database edits can leave them out of step. When they diverge, the running application no longer matches what the editor shows.

`tool_ontology_parser` is the instrument for seeing and fixing that divergence. It inspects each hierarchy, tells you exactly which nodes are missing, stale, or orphaned, and lets you converge them — either by applying only the delta (**Reconcile**) or by wiping and rebuilding a hierarchy's runtime nodes from the source (**Regenerate**). It can also export the whole ontology to files, so you can move a definition from one Dédalo installation to another.

A concrete example: an engineer imports an ontology from another Dédalo installation. The editorial records land, but the runtime tree does not match them yet. The engineer opens this tool, ticks the affected hierarchies, presses **Refresh status** to see the drift, then **Reconcile** to apply only what changed.

## When to use it

- After a bulk ontology edit, an import from another installation, or a restore — when you suspect the runtime tree no longer matches its source.
- To publish the ontology as files for dissemination between installations.
- When a single-record re-sync ([tool_ontology](using_ontology.md)) is not enough because whole hierarchies are out of step.

## Where to find it

The tool is restricted to the **Ontology section**, where it appears as the *Ontology parser* action, for developers only.

## Using it, step by step

1. Open the tool. It shows a checkbox tree of ontologies grouped by typology.
2. Tick the hierarchies you want to work on.
3. Press **Refresh status**. The status panel marks each selected hierarchy as in-sync or out of sync, with counts of what drifted.
4. Choose an action:
   - **Reconcile** (the safe default) applies only the differences and never wipes. Running it on an in-sync ontology does nothing.
   - **Regenerate** (rebuild) deletes the hierarchy's runtime nodes and re-derives them from the source. Reach for it only when Reconcile cannot converge (structural corruption).
   - **Export** writes the ontology definition files.
5. Each action asks for its own confirmation, runs, then repaints the status panel so you can verify the result.

## Options

| Action | What it does |
| --- | --- |
| **Refresh status** | Inspects the selected hierarchies and reports drift (missing / stale / orphaned nodes). Read-only. |
| **Reconcile** | Applies only the delta; non-destructive. The everyday fix. |
| **Regenerate** | Wipes and rebuilds a hierarchy's runtime nodes from the source, in one transaction per hierarchy. The fallback. |
| **Export** | Writes the ontology definition files (JSON and per-hierarchy dumps) for sharing between installations. |

!!! tip "Reconcile is safe; Regenerate is the fallback"
    Reconcile only applies what drifted and never wipes, so it is safe to run any time. Reach for Regenerate only when the incremental reconcile cannot converge. Read the status panel first — it tells you which nodes are off and by how much.

!!! warning "Regenerate wipes the runtime nodes, not the source"
    A rebuild deletes the hierarchy's runtime nodes and re-derives them from the editable source. The **source records are never touched** — the projection is regenerated from them. It runs in one transaction per hierarchy, so a mid-run failure rolls that hierarchy back cleanly.

## Related

- **[tool_ontology](using_ontology.md)** — the per-record parse/sync used from single-edit and batch modes; the incremental path a normal edit takes.
- **[tool_hierarchy](using_hierarchy.md)** — builds new hierarchies and virtual sections rather than reconciling existing ones.
- **[Developer reference](../development/tools/reference/tool_ontology_parser.md)** — the drift model, the five actions, and internals.
- The [ontology](../core/ontology/index.md) documentation — the model this tool maintains.
