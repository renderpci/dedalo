# sections

The plural **collection concept**: given a search query (an SQO) or a set of
locators, resolve the matching records of a `section_tipo`, enumerate their
`section_id`s, and perform bulk deletes. It answers *"which records of this
section exist?"* — not the one that reads or writes a single record.

> See also: [Sections concept](index.md) · [section](section.md) · [section_record](section_record.md) · [Components](../components/index.md)

!!! note "PHP class → TS modules"
    In PHP, `sections` (plural, `extends common`) was a stateful object you
    instanced with `sections::get_instance(...)` and then queried. The TS
    rewrite keeps the *contract* — the envelope shape, the SQO-normalization
    rules — as a pure spec in `src/core/concepts/sections.ts`, and the actual
    search → rows → per-record fan-out as plain async functions in
    `src/core/section/read.ts` (`readSection`, `readSectionRows`,
    `deriveSectionDdoMap`). There is no `sections` object to instance; a caller
    just calls the function with an `Rqo`.

## Role

Where the [section concept doc](index.md) explains the matrix-table model — a
logical record is the pair `(section_tipo, section_id)`, and all records of
every section live in one `matrix` table — the `sections` concept operates over
the **collection** of records that share a `section_tipo`. It does not own a
record's data or its database I/O; it runs a search and hands back the result.

Three sibling concepts share the "section" name and are easy to confuse. Keep
the distinction crisp:

| concept | scope | owns | typical job | TS home |
| --- | --- | --- | --- | --- |
| **`section`** (singular) | one section *type* (one `section_tipo`) | the table abstraction: components, permissions, the shared `relations` array | build a section's context, resolve its children | `src/core/concepts/section.ts`, `src/core/section/context.ts` |
| **`section_record`** | one record *row* `(section_tipo, section_id)` | the physical per-record I/O (read / save / delete / duplicate) | load, persist or delete a single row in `matrix` | `src/core/concepts/section_record.ts`, `src/core/section_record/`, `src/core/section/record/` |
| **`sections`** (plural — *this concept*) | the *collection* of records of a `section_tipo` | nothing persistent; it runs a search over the matrix | list the `section_id`s, fetch list data, bulk-delete records matching a query | `src/core/concepts/sections.ts`, `src/core/section/read.ts` |

In short: `section` is the type, `section_record` is one row, and `sections` is
"the set of rows". `sections` never touches a column directly — it delegates
reads to the [search / SQO](../sqo.md) machinery and per-record deletes to the
`section_record` write path.

## The SQO-normalization contract

`src/core/concepts/sections.ts` is the pure-contract home for the two rules PHP
enforced in `sections::set_up()` and `sections_json.php`:

- **SQO cloning + limit defaulting** (PHP `sections::set_up`, class.sections.php:167):
  the caller's SQO is never mutated in place; `limit` defaults to
  `SECTIONS_EDIT_LIMIT = 1` in edit mode, otherwise `SECTIONS_DEFAULT_LIMIT = 10`
  unless the caller section's own request_config supplies one; `select` is
  forced to `[]` so the search returns only `(section_tipo, section_id)` — every
  value resolves later, per record, through the structure-context/subdatum
  machinery. The engine applies this in `readSectionRows()`
  (`src/core/section/read.ts`): see the `clientLimitMissing` handling there.
- **Envelope shape** (PHP `sections_json.php` :136, `SECTIONS_ENVELOPE_TYPO =
  'sections'`): the `data[]` array leads with one envelope item
  `{typo:'sections', tipo, section_tipo:[], entries:[...]}`. Each entry is a
  locator carrying `paginated_key = row_index + sqo.offset` (PHP :292). An
  empty result still emits this envelope (context only, no crash) — the same
  guarantee PHP's :94-127 empty-path gave.

```ts
// src/core/concepts/sections.ts
export const SECTIONS_DEFAULT_LIMIT = 10;
export const SECTIONS_EDIT_LIMIT = 1;
export const SECTIONS_ENVELOPE_TYPO = 'sections';
```

## The engine — `src/core/section/read.ts`

| function | purpose / returns |
| --- | --- |
| `readSection(rqo, principal?)` | The full read: `context[]` (deduplicated by `contextKey`, first occurrence wins — PHP `merge_unique_context`) plus `data[]` (the `sections` envelope followed by one item per resolved component ddo, record-major/ddo-minor). The single entry point for both `list` and `edit` reads. |
| `readSectionRows(rqo, principal?)` | Runs the SQO through the search engine (`pickReadSource` → the matrix source or the Time Machine `tm` source), builds the envelope, and drives the per-row/per-ddo emission (`emitDdoData`). Equivalent to PHP `sections::get_data()` + `sections_json.php`'s row-to-entries/data build, fused into one call. |
| `deriveSectionDdoMap(sectionTipo, ownerSectionTipo, mode)` | When the client sends no `show.ddo_map`, derive the section's default columns from its ontology `request_config` (the v5/v6 builders) — the TS equivalent of PHP falling back to the section's own `request_config` when no explicit columns are requested. |

There is no dedicated `get_ar_all_section_id()` twin yet: PHP's "ignore
pagination, enumerate every matching `section_id`" idiom (limit `0`, offset
`0`, `full_count = false`, `select = []`) is reproduced ad hoc by callers that
need it — e.g. `tools/tool_update_cache` builds its own no-limit search over
`buildSearchSql` (`src/core/search/sql_assembler.ts`) rather than going through
a shared "all ids" helper. `get_ar_section_tipo()`'s `related`-mode
`section_tipo === 'all'` case likewise has no standalone TS equivalent
documented here — see `engineering/RELATIONS_SPEC.md` for the relation-family readers
that resolve it.

## Bulk delete — the `delete` API action

PHP's chokepoint method, `sections::delete($options)`, is not a separate
callable in TS — its guarantees are folded directly into the `delete` action
handler in `src/core/api/dispatch.ts` (registered in the action dispatch
table), which is the API's single delete entry point for both a single record
and an SQO-matched set:

```ts
// dispatch.ts action 'delete' (essence)
const sectionTipo = source.section_tipo ?? source.tipo;
const deleteMode = source.delete_mode ?? 'delete_data'; // PHP default
// ... permission gate, area-write refusal ...
const targets = source.section_id !== undefined
  ? [Number(source.section_id)]
  : /* SQO-matched ids, global-admin only */ matchedIds;
for (const targetId of targets) {
  const outcome = deleteMode === 'delete_record'
    ? await deleteSectionRecord(sectionTipo, targetId, principal.userId)
    : await deleteSectionData(sectionTipo, targetId, principal.userId);
}
```

Guarantees carried over from PHP's `sections::delete()`:

- **Permissions:** requires `getPermissions(sectionTipo, sectionTipo) >= 2`
  (PHP's `get_section_permissions() >= 2`); refused otherwise.
- **Multiple-delete guard:** an SQO that matches more than one record requires
  `principal.isGlobalAdmin` — the same escalation PHP required via
  `security::is_global_admin`.
- **`delete_mode`** chooses the per-record operation: `delete_record` calls
  `deleteSectionRecord()` (full removal, Time-Machine-backed — see
  [`section_record`](section_record.md)); `delete_data` (PHP's default) calls
  `deleteSectionData()` (clears data, keeps the row).
- **Ontology coherence:** deleting an ontology-registry record
  (`ONTOLOGY_MAIN_SECTIONS`, `src/core/resolve/ontology_delete.ts`) cascades to
  purge the matching `dd_ontology` TLD, mirroring PHP's
  `ontology::delete_main()` path — global-admin only.
- **Cross-section leak guard:** when deleting from an SQO, matched rows are
  filtered back down to the gated `sectionTipo` before any delete runs.

!!! warning "Children guard is intentionally NOT enforced"
    PHP's `delete_with_children` guard (skip records that still have
    `component_relation_children`) is **inoperative on the live PHP oracle** —
    child-bearing parents are deleted anyway. The TS engine converges with that
    observed behavior rather than implementing the guard PHP's own code claims
    to have; see `rewrite/STATUS.md` for the pinned defect.

## When it is used

Reach for the `sections` concept (`readSection`/`readSectionRows`, or the
`delete` action) when you are working with **the set of records of a
section_tipo**, not a single one:

- **List mode / search results.** The `dd_core_api.read` action, for a `list`
  or `tm` mode read, calls `readSection()` with the client's navigation SQO;
  the returned `{context, data}` envelope is what the client list view
  ([`section_list`](section_list.md)) renders.
- **Enumerating / iterating every record.** When a tool needs every matching
  `section_id` (e.g. to loop and re-save each), build a no-limit search over
  `buildSearchSql` directly (see `tool_update_cache`) rather than paginating.
- **Bulk delete.** The `delete` API action is the single chokepoint for
  permission checks, the multiple-delete guard, and ontology coherence,
  whether the caller passes one `section_id` or an SQO matching many.

Use the singular **[`section`](section.md)** instead when you need one section
*type*'s context, permissions, or buttons, and
**[`section_record`](section_record.md)** when you need to read, save or delete
one specific row. The `sections` collection concept is the wrong tool for
editing a single record: it only locates and bulk-removes.

## Examples

### Read a list page

```ts
import { readSection } from '../section/read.ts';

const result = await readSection(
  {
    action: 'search',
    source: { tipo: 'oh1', section_tipo: 'oh1', mode: 'list', lang: 'lg-spa' },
    sqo: { section_tipo: ['oh1'], limit: 10, offset: 0 },
  },
  principal,
);

// result.data[0] → { typo: 'sections', tipo: 'oh1', section_tipo: [], entries: [...] }
// result.data[1…] → one item per resolved component ddo, per record
```

### Bulk delete a set of records

```ts
// via the API dispatch 'delete' action — sqo-matched deletes require a
// global-admin principal; a single explicit section_id does not.
const rqo = {
  action: 'delete',
  source: { section_tipo: 'oh1', delete_mode: 'delete_record' },
  sqo: { section_tipo: ['oh1'], filter_by_locators: [{ section_tipo: 'oh1', section_id: '127' }] },
};
// dispatch.delete(rqo, context) → { result: ['127'], msg: 'OK. Request done' }
```

## Related

- [Sections concept](index.md) — the matrix-table model and the section module family.
- [section](section.md) — the singular section type (table abstraction & orchestrator).
- [section_record](section_record.md) — physical per-record database I/O.
- [Components](../components/index.md) — the fields that live inside a section.
- [SQO](../sqo.md) — the Search Query Object machinery `sections` delegates every query to.
- [Locator](../locator.md) — the pointer type accepted in filters and returned in `entries`.
