# section_record

> The per-record physical I/O for one row of the `matrix` table — how the TS
> rewrite reads, writes, duplicates and deletes a `(section_tipo, section_id)`
> pair, and how PHP's stateful `section_record` middleware class became a set
> of stateless functions over a passive record struct.

## Role

A logical record is the pair **`(section_tipo, section_id)`**. Its payload
lives in one row of the `matrix` table, physically split across typed JSONB
columns (`data`, `string`, `number`, `relation`, `date`, `iri`, `geo`, `media`,
`misc`, `relation_search`, `meta`). The storage model — which column holds
what, and the model→column map — is described in
[the sections concept page](index.md#storage-detail-the-data-column-is-split-into-typed-jsonb-columns).
This page documents the read/write/delete/duplicate **API**, not the storage
layout.

## Concept mapping: PHP middleware class → TS

PHP handed every consumer **one stateful object per row** — lazy JSONB
decode, model→column routing, uniform get/set, a save pipeline, and on-the-fly
column substitution (the `matrix_time_machine`/dd15 case). The TS rewrite
preserves every one of those **guarantees**, not the class shape:

| PHP concept | TS home | what changed |
| --- | --- | --- |
| uniform record interface (`section_record` + `section_record_data`) | the passive `MatrixRecord` struct — `src/core/db/matrix.ts` | Threaded **explicitly** through the call tree instead of held on an instance. Bun's Postgres driver parses `jsonb` natively, so there is no per-column lazy decode to implement — a record is read once and passed down already-decoded (see [Sections concept](index.md#storage-detail-the-data-column-is-split-into-typed-jsonb-columns)). |
| write chokepoint (`save` / `save_column` / `save_key_data` / `save_component_data`) | `persistRecordKeys` / `persistRecordColumns` — `src/core/section_record/record_write.ts` | Value + `dd197`/`dd201` modified-audit stamps in **one** database update; PHP's key-removal semantics (last key leaves `'{}'`, a `NULL` column stays `NULL`) reproduced exactly (oracle-verified); save-event fan-out fires automatically. |
| on-the-fly column substitution (`tm_record::get_section_record`) | `makeVirtualRecord` / `cloneRecord` / `injectComponentData` / `injectColumnData` — `src/core/section_record/virtual_record.ts` | Pure builders over a `MatrixRecord`, gated by the same model→column map (`getColumnNameByModel`). |
| dd15 materializer (`tm_record::get_section_record`) | `src/core/tm_record/` (`buildTmSectionRecord`) | The single faithful port of the PHP method — who/when/where/what + snapshot. |
| `save_event()` cache invalidation | `fireSaveEvent()` — `src/core/section_record/save_event.ts` | Same dependent-cache targets (tools/profiles registers, ontology), plus a RAG re-index seam PHP has no equivalent of. |

**Intentionally NOT ported:**

- **Per-column lazy JSON decode.** Not needed — see above; a request-scoped
  read-memo remains an optional future perf seam (`concepts/section_record.ts`).
- **The per-request instance singleton.** Explicit record passing replaces it;
  the spec forbids ambient request state (a request-scoped cache would be a
  regression toward the PHP worker-bleed hazard the rewrite eliminates).
- **`section_record_temp` / the `temp` table.** The PHP subclass that redirected
  every operation at a scratch table (`service_tmp_section`) is an unported
  service/seam — there is no TS equivalent yet.
- **`delete_column()`.** PHP's own no-op stub; nothing to port.
- **PHP's own bugs**, on purpose: the silent `'invalid_table'` fallback, the
  `__destruct` `_temp` cache-key eviction quirk, the undeclared `$instances`
  property.

The counter law and the delete pipeline order below are unchanged guarantees,
carried over exactly:

> **COUNTER LAW** (PHP `allocate_component_ids`, the identity-critical rule):
> component item-ids are allocated under a PostgreSQL advisory lock keyed
> `"{table}_{section_tipo}_{section_id}_{tipo}"`; the base is
> `max(persisted meta counter, in-memory)` — **raise, never lower** — so a
> seeded or imported id can never be re-allocated. The TS allocators
> (`allocateComponentItemId` / `absorbComponentItemIds` /
> `insertMatrixRecordWithCounter`, all in `src/core/db/matrix_write.ts`)
> implement this; the section engine reuses them.

> **DELETE PIPELINE ORDER** (load-bearing sequence, unchanged): (1) Time
> Machine snapshot **always** first, then re-read + verify — abort on mismatch
> (TS uses a canonical-JSON compare, *stronger* than PHP's loose `==`); (2) row
> delete; (3) remove inverse references + remove media files; (4) diffusion
> unpublish (per-target failures non-blocking); (5) RAG delete enqueue (seam).

!!! note "Components never touch the database"
    A component resolves its value by reading straight off a `MatrixRecord`'s
    `.columns` and persists through `persistRecordKeys()` /
    `persistRecordColumns()`. The component knows its data shape; the write
    chokepoint knows where (which typed column) and how it is stored — the
    same separation PHP's `section_record` enforced. See
    [`section`](section.md) for the record-lifecycle callers
    (`createSectionRecord`, `deleteSectionRecord`, `duplicateSectionRecord`).

---

## Where the engine lives

| concern | module |
| --- | --- |
| pure contract (delete modes, audit tipos re-export, counter/delete-order laws) | `src/core/concepts/section_record.ts` |
| the record struct | `src/core/db/matrix.ts` (`MatrixRecord`, `MATRIX_JSONB_COLUMNS`, `MATRIX_TABLE_ALLOWLIST`, `readMatrixRecord`) |
| the write chokepoint | `src/core/section_record/record_write.ts` (`persistRecordKeys`, `persistRecordColumns`, `persistModifiedStamp`, `buildModifiedAuditWrites`) — re-exported from `src/core/section_record/index.ts` |
| virtual-record substitution | `src/core/section_record/virtual_record.ts` (`makeVirtualRecord`, `cloneRecord`, `injectComponentData`, `injectColumnData`, `isVirtualRecord`) |
| post-write fan-out | `src/core/section_record/save_event.ts` (`fireSaveEvent`, `registerRagRecordHook`, `fireRagRecordEvent`) |
| create / duplicate / delete | `src/core/section/record/create_record.ts`, `duplicate_record.ts`, `delete_record.ts` |
| per-component save | `src/core/section/record/save_component.ts` (`saveComponentData`) |
| counters | `src/core/db/matrix_write.ts` (`allocateComponentItemId`, `absorbComponentItemIds`, `insertMatrixRecordWithCounter`, `insertMatrixRecordWithExplicitId`) |
| Time Machine audit | `src/core/db/time_machine.ts` (`recordTimeMachine`, `nowDbTimestamp`, `readTimeMachineHistory`) |
| dd15 materializer | `src/core/tm_record/` (`buildTmSectionRecord`) |

---

## Reading a record

There is no `section_record::get_instance()` / `read()` call. A caller reads a
row directly:

```ts
import { readMatrixRecord } from '../db/matrix.ts';
import { getMatrixTableFromTipo, getColumnNameByModel } from '../ontology/resolver.ts';

const table = await getMatrixTableFromTipo('oh1'); // resolves the matrix* table
const record = await readMatrixRecord(table!, 'oh1', 5); // MatrixRecord | null

if (record !== null) {
  // a component_input_text (model maps to the 'string' column)
  const column = getColumnNameByModel('component_input_text'); // 'string'
  const value = (record.columns[column as 'string'] as Record<string, unknown> | null)?.['oh25'];
}
```

`MatrixRecord` (`src/core/db/matrix.ts`) is the uniform record interface PHP's
`section_record_data` gave every caller — but as a **passive struct**, not a
stateful instance:

```ts
export interface MatrixRecord {
  id: number;
  section_id: number;
  section_tipo: string;
  columns: Partial<Record<MatrixJsonbColumn, unknown>>;   // parsed JSONB
  rawText: Partial<Record<MatrixJsonbColumn, string | null>>; // ::text twins, byte-parity
}
```

There is no caching layer equivalent to PHP's
`section_record_instances_cache` keyed `"{section_tipo}_{section_id}"` — a
caller that needs the same record twice in one request simply passes the
`MatrixRecord` it already has down the call tree, rather than re-fetching
through a shared instance cache. `isVirtualRecord(record)` distinguishes a
record built in memory (`id === VIRTUAL_RECORD_ID`, i.e. `0` — the dd15/Time
Machine case, or a synthetic search-data row) from one backed by a real DB row.

---

## Writing data

Every writer that persists component keys **must** route through
`persistRecordKeys()` — it is the single write chokepoint (grep-gated by
`test/unit/section_record.test.ts`):

| operation | function | DB op |
| --- | --- | --- |
| whole-column write (closest to PHP `save()` / `save_column()`) | `persistRecordColumns(target, columns, audit?)` | `updateMatrixRecord` — replaces the given columns wholesale; fires the save event **and** the RAG `'index'` seam. |
| one or more `{column, key}` writes, value + modified-audit stamp in ONE update (PHP `save_key_data()` / `save_component_data()`) | `persistRecordKeys(target, savePath, audit)` | `updateMatrixKeysData` — `value: null` removes the key with PHP's exact end state (last key leaves `'{}'`, a `NULL` column stays `NULL`); fires the save event. |
| modified-audit stamp only, no data write (PHP `update_modified_section_data()`) | `persistModifiedStamp(target, audit)` | Same underlying write, savePath built purely from the audit stamp. |
| the per-component entry point a save request calls | `saveComponentData(request)` — `src/core/section/record/save_component.ts` | Reads the component's current items, applies the changed-data ops, writes the full updated array back via `persistRecordKeys`, and appends a Time Machine audit row. |

```ts
import { persistRecordKeys } from '../section_record/index.ts';

// stage + persist one component's value: value + modified-audit stamp in
// ONE update (the chokepoint builds the audit writes from `audit` itself —
// there is no separate "stage in memory" step to call first)
await persistRecordKeys(
  { table: 'matrix', sectionTipo: 'oh1', sectionId: 5 },
  [{ column: 'string', key: 'oh25', value: ['Hello world'] }],
  { userId: 42 },
);
```

`buildModifiedAuditWrites(sectionTipo, audit)` is the direct TS twin of PHP's
`get_modified_section_save_path('update_record')`: it returns `[]` for the
`Activity` section or a missing user (PHP `:1584`), otherwise the `dd197`
user-locator write into `relation` and the `dd201` virtual-date write into
`date` — merged into the same update as the component's own value.

### Delete family

| operation | function | effect |
| --- | --- | --- |
| full record delete | `deleteSectionRecord(sectionTipo, sectionId, userId, now?)` — `src/core/section/record/delete_record.ts` | (1) Time Machine snapshot + verify; (2) remove inverse references held by other records; (3) move media files to the deleted folder (`removeSectionMediaFiles`); (4) diffusion unpublish (per-target, non-blocking); (5) remove the row. Refuses `section_id < 1`. |
| empty data, keep the row (PHP's default `delete_data` mode) | `deleteSectionData(sectionTipo, sectionId, userId, now?)` | Empties every component child's data in place (skipping `component_section_id` / `component_external` / `component_inverse`; `component_filter` resets to the default project instead of `null`), backfills a Time Machine pair per emptied component, refreshes the modified stamp. The row itself survives; meta counters are **kept**. |
| reserved stub | *(none — PHP's `delete_column()` was already a no-op; not ported)* | — |

### Duplicate

```ts
export async function duplicateSectionRecord(
  sectionTipo: string,
  sourceSectionId: number,
  userId: number,
  now?: Date,
): Promise<number>
```

`src/core/section/record/duplicate_record.ts` clones every JSONB column except
`data`/`meta`/`relation_search` into a brand-new counter-allocated
`section_id`, drops the audit tipos from the copy and re-stamps fresh
created/modified metadata, rebuilds the per-component `meta` counter
(`[{count: maxItemId}]`), copies media files for every copied media component
(`duplicateMediaFiles` / `refreshStoredFilesInfo`), and writes two Time Machine
rows per copied component (a backfill-repair row, then the save row) — the
same audit shape PHP's per-component re-save loop produced. Returns the new
`section_id`.

---

## Component value ids & counters

String-type component values carry a per-value unique id (the dataframe
pairing `id_key`). The next id is tracked by a per-component counter stored in
the `meta` column under the component tipo, as `[{ "count": N }]` — unchanged
from PHP.

| function | purpose |
| --- | --- |
| `allocateComponentItemId(table, sectionTipo, sectionId, componentTipo, count?)` — `src/core/db/matrix_write.ts` | Atomically allocate fresh ids under a PostgreSQL advisory lock keyed `(table, section_tipo, section_id, component_tipo)`; re-reads the *persisted* counter (concurrent writers may have advanced it), persists the raised counter immediately, syncs back. |
| `absorbComponentItemIds(...)` | Raise the counter to at least a given value (no-op if already there) under the same lock — absorbs explicit ids carried by imported/migrated data without racing live allocations. |
| `insertMatrixRecordWithCounter(table, sectionTipo, columns)` | Allocate a new `section_id` from the section's own counter and insert the row in one call — the path `createSectionRecord()` and `duplicateSectionRecord()` both use. |
| `insertMatrixRecordWithExplicitId(table, sectionTipo, sectionId, columns)` | Insert at a caller-forced `section_id` (the ontology-provisioning path, which needs deterministic node ids), raising the counter afterward so a later auto-allocation never collides. |

!!! warning "Item ids are never reused"
    Item ids must be unique per component per record and never recycled, so a
    plain read-increment-write is unsafe across concurrent writers. Always go
    through `allocateComponentItemId()` / `absorbComponentItemIds()`, which
    lock and persist atomically — exactly the guarantee PHP's
    `allocate_component_ids()` / `raise_component_counter()` gave.

---

## Metadata

Records carry created/modified by-user and date, stored as the same fixed
private tipos PHP used (`AUDIT_TIPOS`, `src/core/concepts/section.ts`, also
re-exported as `RECORD_AUDIT_TIPOS` from `src/core/concepts/section_record.ts`):

| concept | tipo | column |
| --- | --- | --- |
| created by user | `dd200` | `relation` |
| created date | `dd199` | `date` |
| modified by user | `dd197` | `relation` |
| modified date | `dd201` | `date` |

| function | purpose |
| --- | --- |
| `buildRecordMetadata(sectionTipo, userId, now)` — `src/core/section/record/create_record.ts` | Builds the initial `data`-column section metadata (label, created timestamp, `section_tipo`, `diffusion_info: null`, `created_by_user_id`) for a brand-new record. |
| `buildModifiedAuditWrites(sectionTipo, audit)` — `src/core/section_record/record_write.ts` | The created/modified user-locator + date writes, keyed by column and tipo. `[]` for the Activity section or a missing user — no DB side effect by itself; the chokepoint functions call it internally. |
| `auditUserLocator(userId, componentTipo)` / `auditDateItem(now)` | The locator / virtual-date item shapes an audit write carries. |

`fireSaveEvent(sectionTipo)` (`src/core/section_record/save_event.ts`) is fired
after every persist and invalidates the dependent caches: the tools
register/config/profile sections (`dd1324`/`dd996`/`dd234`, via
`invalidateAllToolCaches()`) and the Ontology section
(`clearOntologyDerivedCaches()`). PHP's request-config presets cache
(`dd1244`) has no TS twin — presets are read uncached, so there is nothing to
invalidate there.

---

## Public API

| function | module | purpose |
| --- | --- | --- |
| `readMatrixRecord(table, sectionTipo, sectionId)` | `db/matrix.ts` | Read one record (parsed + raw-text twin). |
| `isVirtualRecord(record)` | `section_record/virtual_record.ts` | Whether the record is DB-backed or in-memory only. |
| `makeVirtualRecord(sectionTipo, sectionId)` | same | Build an empty in-memory record. |
| `cloneRecord(record)` | same | Deep-copy before substituting (never mutate a shared row). |
| `injectComponentData(record, tipo, model, items)` | same | Route items into the model's mapped column, keyed by tipo (`null` removes the key). |
| `injectColumnData(record, column, value)` | same | Replace one whole column. |
| `persistRecordKeys(target, savePath, audit)` | `section_record/record_write.ts` | Persist `{column,key}` writes + modified-audit stamp in one update. |
| `persistRecordColumns(target, columns, audit?)` | same | Persist whole columns + audit merge; fires the RAG index seam. |
| `persistModifiedStamp(target, audit)` | same | Persist only the modified-audit stamp. |
| `buildModifiedAuditWrites(sectionTipo, audit)` | same | The audit savePath items (pure, no I/O). |
| `fireSaveEvent(sectionTipo)` | `section_record/save_event.ts` | Post-write cache invalidation. |
| `registerRagRecordHook(hook)` / `fireRagRecordEvent(event)` | same | The RAG index/delete seam. |
| `createSectionRecord(sectionTipo, userId, now?, sectionId?)` | `section/record/create_record.ts` | Insert a new row with fresh audit metadata. |
| `duplicateSectionRecord(sectionTipo, sourceSectionId, userId, now?)` | `section/record/duplicate_record.ts` | Clone into a new `section_id`. |
| `deleteSectionRecord(sectionTipo, sectionId, userId, now?)` | `section/record/delete_record.ts` | Full delete (TM snapshot, inverse refs, media, diffusion). |
| `deleteSectionData(sectionTipo, sectionId, userId, now?)` | same | Empty all component data, keep the row. |
| `saveComponentData(request)` | `section/record/save_component.ts` | The per-component save entry point. |
| `allocateComponentItemId(...)` / `absorbComponentItemIds(...)` | `db/matrix_write.ts` | Atomic item-id counter operations. |
| `recordTimeMachine(entry, timestamp)` | `db/time_machine.ts` | Append a Time Machine audit row. |

---

## Examples

### Read and save a component's value

```ts
import { readMatrixRecord } from '../db/matrix.ts';
import { getColumnNameByModel, getMatrixTableFromTipo } from '../ontology/resolver.ts';
import { persistRecordKeys } from '../section_record/index.ts';

const table = (await getMatrixTableFromTipo('oh1'))!;
const record = await readMatrixRecord(table, 'oh1', 5);

if (record !== null) {
  const column = getColumnNameByModel('component_input_text'); // 'string'
  const value = (record.columns.string as Record<string, unknown> | null)?.['oh25'];
}

// persist a new value + modified-audit stamp in ONE update
await persistRecordKeys(
  { table, sectionTipo: 'oh1', sectionId: 5 },
  [{ column: 'string', key: 'oh25', value: ['Hello world'] }],
  { userId: 42 },
);
```

### Duplicate a record

```ts
import { duplicateSectionRecord } from '../section/record/duplicate_record.ts';

const newSectionId = await duplicateSectionRecord('oh1', 5, principal.userId);
// media files regenerated for the new id, Time Machine entries created
```

### Delete a record

```ts
import { deleteSectionRecord } from '../section/record/delete_record.ts';

// (1) Time Machine snapshot + verify, (2) delete row,
// (3) strip inverse refs + move media, (4) diffusion unpublish
const { deleted, removed } = await deleteSectionRecord('oh1', 5, principal.userId);
// deleted → ['5'], removed → true. Refuses section_id < 1 (throws).
```

---

## Related

- [Sections concept](index.md) — the matrix-table model and the typed-column split.
- [section](section.md) — the section *type*: context, permissions, children, relations.
- [sections](sections.md) — the multi-record collection concept.
- [Components](../components/index.md) — the fields that read and save through this API.
- [Locator](../locator.md) — the pointer stored in the `relation` column and inverse references.
- `engineering/SECTION_SPEC.md` / `rewrite/prompts/SECTION_RECORD_REBUILD.md` — the standing design spec and rebuild ledger this page reflects.
