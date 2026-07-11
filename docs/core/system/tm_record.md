# tm_record

> See also: [section_record](../sections/section_record.md) · [Sections concept](../sections/index.md) · [Components](../components/index.md) · [common contract](common.md)

`src/core/tm_record/tm_record.ts` is the TS module for materializing a single
**Time Machine** row: one historical version of one component or section
change, stored in the flat `matrix_time_machine` table.

This page is the **module-level reference** for `tm_record.ts` and the Time
Machine (`dd15`) data model: how every component save also writes a versioned
row, the shape of the `matrix_time_machine` table, how a TM row is
transformed back into a renderable section record, the read-only `tm` mode,
and how a value is restored. TM-as-save-side-effect is preserved end to end;
Time Machine is served through the generic section read pipeline rather than
a bespoke viewer (see [How it fits](#how-it-fits-with-the-rest-of-dédalo)).

## Role

There is no `tm_record` class in the TS server — no ontology-model instance,
no `extend common` equivalent, nothing `new`-ed. The PHP class-per-concern
split is replaced by a handful of stateless modules, each owning one piece:

| module | role |
| --- | --- |
| **`src/core/tm_record/tm_record.ts`** | The row **materializer**: `buildTmSectionRecord()` turns the flat TM columns into a synthetic `dd15` [`section_record`](../sections/section_record.md)-shaped `MatrixRecord` that the normal component pipeline can render (PHP `tm_record::get_section_record`). Also owns the dd15 column-tipo constants, `ddDateFromTimestamp()` and `termByTipo()`. |
| **`src/core/db/time_machine.ts`** | The **SQL layer** for `matrix_time_machine`: `recordTimeMachine()` (write one audit row), `readTimeMachineRow()` / `readTimeMachineHistory()` (read), `TimeMachineRow`/`TimeMachineEntry` types, `TM_EXCLUDED_SECTIONS`. The direct analogue of PHP `tm_db_manager` + the `tm_record::create()` write gate, merged into one file. |
| **`src/core/resolve/read_tm.ts`** | The **read/list surface**: `tmReadSource` (a `SectionReadSource` plugged into the generic section-read pipeline), `buildTmWhere()`/`queryTmRows()` (the query PHP's `search_tm` used to own), `emitTmRow()` (per-row cell emission). |
| **`tools/tool_time_machine/server/tool_time_machine.ts`** | `apply_value` — the restore action (PHP `tools/tool_time_machine::apply_value`). |
| **`tools/tool_time_machine/server/bulk_revert.ts`** | `bulk_revert_process` — undo a whole `bulk_process_id` batch. |

!!! note "No cached-instance layer, and that is fine"
    PHP's `tm_record`/`tm_record_data` pair existed partly to give every TM row
    a cached, `common`-shaped object with `get_instance()`/`__destruct()`
    lifecycle bookkeeping. None of that is needed here: the TS server has no
    cross-request static-state bleed hazard to guard against (one request-scoped
    call is one function call — see the architecture-overview note on
    `AsyncLocalStorage` request scoping), so `readTimeMachineRow()` and
    `buildTmSectionRecord()` are plain, uncached, per-call functions. There is
    no `tm_record_data`/`tm_db_manager` split to keep in sync — it is one file,
    `time_machine.ts`.

## Responsibilities

- **Versioning on save** — `recordTimeMachine()` is the single entry point
  other modules call after a successful save to persist the changed data as a
  new TM row (with timestamp, user, lang and an optional `bulkProcessId`). It
  is invoked from `src/core/section/record/save_component.ts` (every
  component save) and `delete_record.ts`/`duplicate_record.ts` (record
  delete/duplicate snapshots).
- **Read access** — `readTimeMachineRow()` (one row by PK) and
  `readTimeMachineHistory()` (a component's history on one source record,
  newest first).
- **Transformation to a renderable record** — `buildTmSectionRecord()`: turn
  the flat columns (`section_id`, `timestamp`, `user_id`, `tipo`,
  `section_tipo`, `bulk_process_id`, `data`) into component-shaped data
  injected into a synthetic `dd15` `MatrixRecord`.
- **Write guards** — `TM_EXCLUDED_SECTIONS` refuses to version `dd15` itself
  and non-positive `section_id`s (see the narrower-exclusion-list gap noted
  below).
- **Row deletion** — none. There is no TS function that deletes a TM row; the
  surface is append-only in this server (PHP's `tm_record::delete()`,
  used when a deleted section is finally purged, has no port — see
  [Public API](#public-api)).

!!! warning "TM_EXCLUDED_SECTIONS is narrower than PHP's exclusion list"
    PHP's `tm_record::$excluded_section_tipos` skips THREE section tipos:
    `DEDALO_TEMP_PRESET_SECTION_TIPO` (`dd655`), `DEDALO_TIME_MACHINE_SECTION_TIPO`
    (`dd15`) and `USER_ACTIVITY_SECTION_TIPO` (`dd1521`). TS's
    `TM_EXCLUDED_SECTIONS` (`src/core/db/time_machine.ts`) contains only
    `dd15`. In practice `dd1521` never reaches `recordTimeMachine()` anyway —
    `src/core/resolve/user_stats.ts` writes `matrix_stats` with a direct SQL
    `UPDATE`, bypassing the component-save path entirely — but `dd655` (the
    temp-preset working section) **does** go through the ordinary
    `save_component.ts` path, so editing a temp preset in this TS server will
    version it in `matrix_time_machine` where PHP would not. A narrow, honest
    gap; add `'dd655'` to `TM_EXCLUDED_SECTIONS` to close it.

!!! warning "No `$save_tm`-style kill-switch for bulk operations"
    PHP's `tm_record::$save_tm = false` lets a bulk operation (e.g.
    *portalize*) suppress versioning for its whole run, restoring it in a
    `finally` block. There is no TS equivalent — every `save_component.ts`
    call unconditionally calls `recordTimeMachine()`. A large bulk edit in
    this server will flood `matrix_time_machine` with per-item audit rows
    that PHP would have suppressed. Not yet ported.

## Data model

### The `matrix_time_machine` table

The TM table is **not** the typed-JSONB `matrix` shape used by normal
sections. It is a **flat** table whose columns map 1:1 to ontology tipos under
the `dd15` virtual section. `src/core/db/time_machine.ts`'s `TimeMachineRow`
interface is the TS column allowlist (PHP: `tm_db_manager::$columns`):

| Column | TM tipo constant | tipo | temporal model | meaning |
| --- | --- | --- | --- | --- |
| `id` | `DEDALO_TIME_MACHINE_COLUMN_ID` | `dd1573` | `component_number` | row primary key (auto-increment) |
| `section_id` | `DEDALO_TIME_MACHINE_COLUMN_SECTION_ID` | `dd1212` | `component_number` | the **source** record's `section_id` |
| `section_tipo` | `DEDALO_TIME_MACHINE_COLUMN_SECTION_TIPO` | `dd1772` | `component_input_text` | the **source** record's `section_tipo` (e.g. `oh1`) |
| `tipo` | `DEDALO_TIME_MACHINE_COLUMN_TIPO` | `dd577` | `component_input_text` | the component tipo that changed (or the section tipo, on delete) |
| `lang` | — | — | — | language of the changed data |
| `timestamp` | `DEDALO_TIME_MACHINE_COLUMN_TIMESTAMP` | `dd559` | `component_date` | when the change happened |
| `user_id` | `DEDALO_TIME_MACHINE_COLUMN_USER_ID` | `dd578` | `component_portal` | user who made the change |
| `bulk_process_id` | `DEDALO_TIME_MACHINE_COLUMN_BULK_PROCESS_ID` | `dd1371` | `component_number` | bulk-operation id (or `null`) |
| `data` | `DEDALO_TIME_MACHINE_COLUMN_DATA` | `dd1574` | `component_json` | the actual changed data (JSONB) |

TS reads/writes `data` through the shared `json_codec.ts` (`$n::text::jsonb`
binding on write, `data::text` twin selected alongside `data` on read for
byte-compat parity diffing) rather than PHP's `$json_columns`/`$int_columns`/
`$timestamp_columns` classification arrays — one codec, not three per-column
lists. The tipo constants above still resolve through the shared ontology
(`ontology_node`-equivalent: `src/core/ontology/resolver.ts`'s
`getModelByTipo()`/`getColumnNameByModel()`).

!!! warning "The `section_tipo` column does NOT hold `dd15`"
    The most common Time Machine confusion, unchanged by the rewrite. In a TM
    **row**, the `section_tipo` column stores the **source data section**
    (e.g. `oh1`, `mdcat2949`), *not* the Time Machine section `dd15`. The
    `dd15` tipo only appears in the **DDO / ontology paths** that describe the
    TM columns. `src/core/resolve/read_tm.ts`'s `buildTmWhere()` never filters
    by `section_tipo = 'dd15'` for exactly this reason — mirroring PHP
    `search_tm::build_main_where()`'s deliberately empty body.

### `dd15` is a virtual section

`dd15` (`TIME_MACHINE_SECTION_TIPO`, `src/core/db/time_machine.ts`) is an
internal **virtual section**: it has an ontology definition (its columns are
the tipos above) but no rows of its own in the `matrix` table — its
"records" *are* the rows of `matrix_time_machine`. Because of this, TM
components cannot read their value straight from the DB the way ordinary
components do; the data has to be **pre-populated** into a synthetic record
first (see
[How a TM row becomes a record](#how-a-tm-row-becomes-a-renderable-record)).

## Reading one row

There is no factory/instance to build — `readTimeMachineRow(tmRowId)`
(`src/core/db/time_machine.ts`) is a plain async function that selects one
row by its `matrix_time_machine` primary key and returns a `TimeMachineRow`
or `null`:

```typescript
import { readTimeMachineRow } from '../db/time_machine.ts';

// load one Time Machine row by its matrix_time_machine id
const row = await readTimeMachineRow(4096);
//   row.section_id, row.section_tipo, row.tipo, row.lang,
//   row.timestamp, row.user_id, row.bulk_process_id, row.data
```

### How a version is written on save

A TM row is written by the **callers**, after a successful save, through
`recordTimeMachine()`:

1. **`src/core/section/record/save_component.ts`** — after the component's
   new data is persisted, it builds a `TimeMachineEntry` (`sectionTipo`,
   `sectionId`, `componentTipo`, `lang`, `userId`, `data` — the *current-lang*
   slice for translatable components, matching PHP's `get_data_lang()`
   snapshot, not the full array) and calls `recordTimeMachine(entry,
   nowDbTimestamp())`.
2. **`src/core/section/record/delete_record.ts`** — before deleting a record
   it snapshots the whole record's JSONB columns into one TM row
   (`componentTipo === sectionTipo`, `lang: 'lg-nolan'`). Unlike PHP, it does
   **not** re-read and assert byte-for-byte equality before proceeding with
   the delete — a simplification, not a behavioral gap PHP callers depend on.
3. **`src/core/section/record/duplicate_record.ts`** — the per-component
   backfill-repair pair described below.

```typescript
import { recordTimeMachine, nowDbTimestamp } from '../db/time_machine.ts';

await recordTimeMachine(
  {
    sectionId,
    sectionTipo,  // source section, e.g. 'oh1'
    componentTipo: tipo, // changed component tipo, e.g. 'oh21'
    lang,
    userId,
    data: tmSnapshot,
  },
  nowDbTimestamp(),
);
```

!!! note "The self-healing back-fill is per-caller, not a generic `create()` feature"
    PHP's `tm_record::create($values, $previous_data)` centralizes a
    "self-healing" back-fill: when given the pre-save data and no prior TM row
    is found for the same `section_id`/`section_tipo`/`tipo`/`lang`, it first
    writes a **second** row carrying that *previous* data one minute earlier,
    so a record edited before TM ever ran still gets a baseline to revert to.
    `recordTimeMachine()` itself has **no** such logic — it is a pure insert.
    The back-fill instead lives in the two callers that need it,
    `delete_record.ts` and `duplicate_record.ts`, which compute a
    `backfillTimestamp` (`now - 60s`) and call `recordTimeMachine()` twice
    themselves. `save_component.ts`'s ordinary per-save path does not
    back-fill — only the delete/duplicate flows do.

### How a TM row becomes a renderable record

`buildTmSectionRecord()` (`src/core/tm_record/tm_record.ts`) is the heart of
the module. It reads the flat columns and **injects** component-shaped data
into a synthetic `dd15` `MatrixRecord` keyed by the TM row `id` (not the
source `section_id`), using the shared substitution API
(`src/core/section_record/virtual_record.ts`'s `makeVirtualRecord()` /
`injectComponentData()` / `injectColumnData()`). The private helper
`injectTmField()` resolves the column model via `getModelByTipo()` and the
storage column via `getColumnNameByModel()`, mirroring PHP's
`set_section_record_factory()`.

It populates, in order:

- **`dd1212` section_id** → a `{id, value}` number.
- **`dd559` timestamp** → a `component_date` value via `ddDateFromTimestamp()`.
- **`dd577` tipo** and **`dd1772` section_tipo** → the human term of the
  tipo, resolved with `termByTipo()` (a `SELECT term FROM dd_ontology`
  lookup; PHP's `[tipo]` debug-suffix bracket is not reproduced — TS always
  emits the bare term).
- **`dd578` user_id** → a `dd151` locator into `DEDALO_SECTION_USERS_TIPO`
  (`dd128`); the same locator is also injected under
  `DEDALO_SECTION_INFO_CREATED_BY_USER` (`dd200`) for metadata compatibility.
- **`rsc329` annotation** → PHP's empty placeholder
  (`[{parent_section_id: null}]`) is reproduced verbatim; the `rsc832`/`rsc835`
  TM-notes lookup that fills real annotation text is **not ported** (no notes
  fixture on the reference instance to gate it against — no live consumer
  requests `rsc329` either).
- **`dd1371` bulk_process_id** → a `{id, value}` number.
- **`data`** — split by the *source* tipo's model:
  - if the source is a **whole section** (delete snapshot), each component's
    data is adopted wholesale under its own JSONB column;
  - otherwise (a single component change) the payload is injected both under
    `dd1574` (the generic data column) **and** under the component's own
    tipo, so the normal component read path finds it.

```typescript
import { buildTmSectionRecord } from '../tm_record/tm_record.ts';
import { readTimeMachineRow } from '../db/time_machine.ts';

const row = await readTimeMachineRow(rowId);
const record = row !== null ? await buildTmSectionRecord(row, lang) : null;
// components reading dd15 + rowId in 'tm' mode now read from this record
```

### The read-only `tm` component mode

Components that need to show a historical value are read in **`tm` mode**
(see the [Architecture overview](../architecture_overview.md) datum contract:
modes are `edit` / `list` / `search` / `tm`). Two rules follow from the data
model, both still true of the TS pipeline:

- **Always address `dd15` and the TM row `id`** — *not* the source
  `section_tipo`/`section_id`. `read_tm.ts`'s `emitTmRow()` stamps every
  emitted item's `section_tipo: 'dd15'`, `section_id: row.id`, `mode: 'tm'`.
- **Pre-populate first.** `emitTmRow()` builds (and memoizes, per row) the
  virtual record via `buildTmSectionRecord()` before resolving any of the
  section's own component columns from it — without it there is nothing to
  read.

`tm` mode is read-only in the sense that the TM read source never writes;
there is no TS "save blocked in tm mode" guard analogous to PHP's because the
generic write path is never reached from a TM read at all — the client's
*Apply* button drives a **different**, explicit action
(`tool_time_machine.apply_value`, see [Restore](#restore-is-a-normal-save)),
not a save through the `tm`-mode component.

## Public API

### `src/core/tm_record/tm_record.ts`

| function | purpose |
| --- | --- |
| `buildTmSectionRecord(row, lang)` | Transform one `TimeMachineRow` into a synthetic `dd15` `MatrixRecord` with component-shaped, injected data. |
| `ddDateFromTimestamp(timestamp)` | Parse a Postgres timestamp string into the `dd_date` object shape. |
| `termByTipo(tipo, lang)` | The display term of one ontology node in the request lang, falling back to `lg-spa` then any populated language, then the bare tipo. |

### `src/core/db/time_machine.ts`

| function | purpose |
| --- | --- |
| `readTimeMachineRow(tmRowId)` | Read one row by its `matrix_time_machine` primary key, or `null`. |
| `readTimeMachineHistory(sourceSectionTipo, sourceSectionId, componentTipo, limit?)` | A component's change history on one source record, newest first (`ORDER BY timestamp DESC`). |
| `recordTimeMachine(entry, timestamp)` | Insert one audit row. No-ops for `section_id <= 0` or an excluded section tipo. |
| `nowDbTimestamp()` | The current time as a Postgres-style timestamp string. |
| `TM_EXCLUDED_SECTIONS` | The (narrower-than-PHP) exclusion set — see the warning above. |

There is **no** TS function analogous to PHP `tm_record::search()` (the
direct, parameterised multi-row `SELECT` used internally by `create()` to
detect a missing prior version) or `tm_record::delete()` (row deletion) — TM
rows are never deleted by this server, and the missing-prior-version search
is inlined per-caller (see the self-healing note above) rather than exposed
as a reusable primitive.

### `src/core/resolve/read_tm.ts`

| export | purpose |
| --- | --- |
| `tmReadSource` | The `SectionReadSource` implementation plugged into the generic section-read pipeline for `dd15` (`getRows`/`count`/`emitRow`/`buildContext`). |
| `readTimeMachineData(rqo)` | Direct-caller adapter: runs the TM query and assembles the standard `{sections envelope, per-row data}` shape (what the generic pipeline does internally). |
| `countTimeMachineData(rqo)` | Pagination count over the same query. |

## How it fits with the rest of Dédalo

Time Machine is a **cross-cutting audit/versioning layer**: it is fed by the
normal save pipeline and consumed by a read-only viewer, but it never owns
the live data — exactly as in PHP.

1. **It is written *by* the save pipeline, not by the UI.** A component save
   (`save_component.ts`) and a record delete (`delete_record.ts`) are the
   producers of TM rows, via `recordTimeMachine()`. Versioning is a
   side-effect of a successful write — there is no "save to Time Machine"
   action.

2. **It is read through the generic section read pipeline, not a bespoke
   viewer.** `dd15` is served as a **normal section** over
   `src/core/resolve/read_tm.ts`'s `tmReadSource`, wired into the same
   generic `readSectionRows`/envelope/count machinery every other section
   uses (see the [section family](../sections/index.md)); only row
   acquisition (`matrix_time_machine`, not `matrix`) and per-row cell policy
   differ. `buildTmSectionRecord()` is the single place that knows the dd15
   field mapping — it used to be duplicated between `read_tm.ts` and
   `tool_time_machine.ts` before being consolidated into `tm_record.ts`.

3. **There is no dedicated `search_tm` class; the TM read owns its own SQL.**
   `read_tm.ts`'s `buildTmWhere()`/`queryTmRows()` build the `WHERE`/`ORDER
   BY`/pagination directly (two scoping surfaces: `filter_by_locators` for
   per-component history, a `tipo` column filter for the record-snapshot
   list, or no scope at all for the bare `dd15` list — matching PHP
   `search_tm::build_main_where()`'s intentionally empty body, which returns
   *every* row rather than an error or nothing). SQO-driven search **filters**
   against `matrix_time_machine` from other entry points go through the `_tm`
   twin branches inside the generic search builders instead
   (`src/core/search/builders/builder_relation.ts`'s `matrix_time_machine`
   branch; `builder_string.ts` throws for its `_tm` twin — uncovered scope).

4. **Restore is a normal save, wrapped in an explicit tool action.**
   `tools/tool_time_machine/server/tool_time_machine.ts`'s `apply_value`
   writes the historical snapshot back into the live record through the
   normal write chokepoint (`persistRecordColumns`/`persistRecordKeys`,
   stripping dataframe frame entries first) and then calls
   `recordTimeMachine()` again — so the restore itself creates a fresh TM
   version, exactly as PHP's "the new save immediately creates a fresh TM
   entry." One documented divergence: PHP deletes the consumed TM row on a
   section-branch restore; TS keeps it (harmless — the fresh audit row
   supersedes it in the list). `bulk_revert.ts`'s `bulk_revert_process` is
   the batch analogue: it walks a whole `bulk_process_id`'s history back to
   its pre-batch state and re-applies it under a **new** `bulk_process_id`
   (the revert is itself revertible).

5. **Worker hygiene is a non-issue by construction.** There is no
   `tm_record_data::$instances`-style static cache to unset — see the "No
   cached-instance layer" note above.

```mermaid
flowchart TB
    SAVE["save_component.ts<br/>delete_record.ts / duplicate_record.ts"] -->|recordTimeMachine| DBM["time_machine.ts"]
    DBM -->|INSERT| DB[("matrix_time_machine")]
    DB -->|readTimeMachineRow| DBM2["time_machine.ts (read)"]
    DBM2 --> TMR2["tm_record.ts: buildTmSectionRecord()"]
    TMR2 -->|inject dd15 record| SR["MatrixRecord (synthetic dd15)"]
    SR -->|tm mode read| C["component read (read-only)"]
    C -->|user clicks Apply| APPLY["tool_time_machine.apply_value"]
    APPLY --> SAVE
    SQO["SQO / list read"] --> RT["read_tm.ts: tmReadSource"]
    RT --> DB
```

## Examples

### List the recent history of one component value

```typescript
import { readTimeMachineHistory } from '../db/time_machine.ts';

const history = await readTimeMachineHistory('oh1', 42, 'oh21', 20); // newest first
for (const row of history) {
  // row.id is the TM row id; row.data is the decoded payload
}
```

### Render a historical row

```typescript
import { readTimeMachineRow } from '../db/time_machine.ts';
import { buildTmSectionRecord } from '../tm_record/tm_record.ts';

// 1. load the TM row and synthesize its dd15 record (populates the cache for this call)
const row = await readTimeMachineRow(rowId);
const record = row !== null ? await buildTmSectionRecord(row, lang) : null;

// 2. the section read pipeline resolves component 'oh21' in 'tm' mode against
//    dd15 + rowId from this record — there is no separate component-instance
//    step to drive by hand; read_tm.ts's emitTmRow does it inline per request.
```

### Restore a historical value

```typescript
// via the tool action, not a direct save:
// POST tool action tool_time_machine.apply_value
// { model: 'component', matrix_id: rowId, tipo: 'oh21', section_tipo: 'oh1', section_id: 42 }
// → writes the TM snapshot back into the live record, then records a fresh
//   TM version of the restored value.
```

## Related

- [section_record](../sections/section_record.md) — the per-record DB I/O
  object `buildTmSectionRecord()` synthesizes for `dd15` and that
  `delete_record.ts` snapshots.
- [Sections concept](../sections/index.md) — the `matrix` storage model TM
  diverges from (TM is flat, not typed-JSONB).
- [Components](../components/index.md) — the fields whose every save writes a
  TM version, read back in `tm` mode.
- [common](common.md) — the shared read/permission contract; the `dd15`
  admin-only clamp when addressed directly is enforced the same way as any
  other section-level permission gate.
- [Architecture overview](../architecture_overview.md) — the datum
  `{context,data}` shape and the `edit`/`list`/`search`/`tm` mode set.
- [Services](services.md) — the client viewer that drives the read-only
  `tm`-mode history and the *Apply* (restore-as-save) flow.
- `src/core/db/time_machine.ts` — the SQL layer for `matrix_time_machine`.
- `src/core/resolve/read_tm.ts` — the search/list read surface for the TM table.
