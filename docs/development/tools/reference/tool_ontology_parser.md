# tool_ontology_parser

Keeps the runtime ontology (`dd_ontology`) consistent with its editable source (`matrix_ontology`): it inspects the drift per TLD, reconciles only the delta, rebuilds a TLD from scratch when needed, and exports the ontology definition files for dissemination between installations.

## What it does / why & when to use it

`dd_ontology` is a **derived runtime projection** of the editable `matrix_ontology` records — one node per record, produced by the parser. Normal edits keep the two in sync per-save, but bulk imports, restores, failed partial writes and direct DB edits can leave them out of step. `tool_ontology_parser` is the developer's instrument for seeing and fixing that drift.

Use it when you have edited ontology records in bulk, imported an ontology from another Dédalo installation, or suspect the runtime tree does not match the source — and when you want to publish the ontology as files.

!!! tip "Reconcile is safe; Rebuild is the fallback"
    **Reconcile** applies only what drifted and never wipes — running it on an in-sync ontology does nothing. Reach for **Rebuild** only when the incremental reconcile cannot converge (structural corruption). Read the status panel first; it tells you which nodes are off, and by how much.

## The invariant it maintains

The runtime ontology of a TLD must equal the parse of its source:

> `dd_ontology(tld)`  **==**  `parse(matrix_ontology(tld))`   (plus the bootstrap `<tld>0` main node)

The server owns one answer to *"is a TLD in sync?"* — `inspectOntology` in `src/core/ontology/ontology_state.ts` — expressed as a **drift** of three kinds:

| Drift | Meaning |
| --- | --- |
| **missing** | a matrix record exists, but its `dd_ontology` node does not |
| **stale** | both exist, but the node's content differs from the parsed source (which columns is reported) |
| **orphaned** | a `dd_ontology` node has no backing matrix record (its source was deleted) |

The comparison is by **meaning, not bytes**: jsonb key order is normalized, `{}`/`[]`/null all read as "absent", and `propiedades` (TEXT-holding-JSON) is compared parsed, not as whitespace — so a minified-vs-pretty difference is not false drift. Across a real install this leaves only genuine differences (e.g. the environment-specific ontology-info node).

## How it works (server + client)

**Server** (`tools/tool_ontology_parser/server/{index,tool_ontology_parser}.ts`). Developer-only. The dd_ontology writes are OWNED by `ontology_state.ts` (the single reconcile authority, guarded by `test/unit/ontology_single_writer_tripwire.test.ts`); this tool only gates and surfaces them. Five actions:

| Action | Kind | Core |
| --- | --- | --- |
| `get_ontologies` | read (census) | every ontology's UI metadata (tld, name, typology) — feeds the checkbox tree |
| `inspect_ontologies` | **read (drift)** | `inspectOntology` per selected TLD — the status panel |
| `reconcile_ontologies` | **write, default** | `ensureOntology` — incremental, non-destructive |
| `regenerate_ontologies` | write, nuclear | `rebuildOntology` — **transactional** wipe-and-rebuild |
| `export_ontologies` | write (files) | the strictly-ordered export pipeline (info → `ontology.json` → per-TLD COPY dumps → private lists → LLM map) |

Both writes run the LLM-map post-step (its errors are merged in; the write's result/msg stay). The rebuild wraps the delete + reinsert in **one transaction per TLD**, so a failure rolls back with no empty window and no leftover backup table — replacing the retired `regenerateRecordsInDdOntology`, whose `dd_ontology_bk` table was its only, untested, rollback.

**Client** (`tools/tool_ontology_parser/js/`). A checkbox tree of ontologies grouped by typology; a **status panel** (`paint_status`, fed by `inspect_ontologies`) showing each selected TLD as ✓ in-sync or ✗ with its drift counts; and four buttons — **Reconcile** (the safe default), **Regenerate** (rebuild), **Export**, **Refresh status**. One `run_action` path drives every button (confirm → run → render messages → repaint the panel → always clear the spinner), so the destructive and non-destructive actions carry **distinct** confirmations, and no response can leave the tool hanging.

## Actions & options

| Action | Permission | Reads from `options` | Returns |
| --- | --- | --- | --- |
| `get_ontologies` | `developer` | — | `{ result: ontologies[], errors }` |
| `inspect_ontologies` | `developer` | `selected_ontologies` | `{ result, states: [{tld, drift, inSync, mainNodeOk, matrixNodes, storedNodes}] }` |
| `reconcile_ontologies` | `developer` | `selected_ontologies` | `{ result, msg, errors, ar_msg }` |
| `regenerate_ontologies` | `developer` | `selected_ontologies` | `{ result, msg, errors, ar_msg }` |
| `export_ontologies` | `developer` | `selected_ontologies` | `{ result, msg, errors, ar_msg }` |

!!! warning "Rebuild wipes the runtime nodes, not the source"
    A rebuild deletes the TLD's `dd_ontology` nodes and re-derives them from `matrix_ontology`. The editable **source records are never touched** — the projection is regenerated from them. It runs in one transaction, so a mid-run failure rolls the whole TLD back.

## How it is registered & surfaced

`tools/tool_ontology_parser/register.json` restricts the tool (via `affected_tipos`) to the **Ontology section** (`dd5`), where it appears as the *Ontology parser* action. The action labels for the buttons resolve from the descriptor's label map and fall back to English, so the tool works before the labels are translated: `reconcile`, `regenerate`, `export`, `refresh_status`, and the `confirm_*` / `status_*` strings.

## Related

- [ontology (build layer)](../../../core/ontology/ontology_write.md) — the write drivers this tool gates, and `ontology_state.ts` seen from the ontology side.
- [tool_ontology](tool_ontology.md) — the per-record parse/sync used from single-edit and batch modes (the incremental path the normal edit flow takes).
- [Creating new tools](../creating_tools.md) · [Server contract](../server_contract.md).
- Source: `tools/tool_ontology_parser/server/{index,tool_ontology_parser}.ts`, `tools/tool_ontology_parser/js/{tool_ontology_parser,render_tool_ontology_parser}.js`; core: `src/core/ontology/ontology_state.ts` (`inspectOntology`, `ensureOntology`, `rebuildOntology`), `src/core/ontology/data_io.ts` (the export pipeline).
