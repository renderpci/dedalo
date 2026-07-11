# Data model: `misc`, `meta` and `relation_search`

> See also: [Sections — typed-column storage](../sections/index.md#storage-detail-the-data-column-is-split-into-typed-jsonb-columns) · [Components](../components/index.md) · [Locator](../locator.md) · [Glossary](../glossary.md)

This page documents three of the typed JSONB columns that make up a `matrix`
record. They are siblings of the value-bearing columns documented elsewhere
(`media`, `geo`, `iri`, `number`, `string`, `date`, `relation`):

- **`misc`** — a catch-all column for components whose value is a *direct
  object/array* rather than a keyed locator list. Five very different components
  share it: [`component_json`](#component_json-arbitrary-json), [`component_info`](#component_info-computed-summary), [`component_security_access`](#component_security_access-permissions-matrix), [`component_inverse`](#component_inverse-resolved-backlinks) and [`component_filter_records`](#component_filter_records-per-record-access).
- **`meta`** — per-component **id counters**: the bookkeeping that mints the
  monotonic per-item `id`s used by `iri`, `json`, `date` and the other
  multi-value components.
- **`relation_search`** — an auxiliary, denormalised ancestor index written only
  for hierarchical (thesaurus) values so a search can match a record by any of
  its parents.

None of these columns hold a "type" in the sense that `media` or `geo` do; they
are storage *roles*. Where a column carries an actual value shape (`misc`), the
shape is **decided by the producing component**, not by the column. This is the
distinguishing fact about `misc` and the reason it needs its own page.

!!! info "Where these columns sit"
    A `matrix` record is one row whose conceptual `data` payload is physically
    split across typed JSONB columns. In PHP `section_record_data::$column_map`
    maps each component model to its column, and `section_record_data::$ar_columns`
    lists the canonical column set. The TS server resolves the same routing
    through `getColumnNameByModel()` (`src/core/ontology/resolver.ts`), reading
    each model's own `descriptor.column`, and declares the canonical column set
    as `MATRIX_JSONB_COLUMNS` (`src/core/db/matrix.ts`). See
    [Sections — the data column is split into typed JSONB columns](../sections/index.md#storage-detail-the-data-column-is-split-into-typed-jsonb-columns).

---

## The `misc` column

### What it is

`misc` is the column for **direct-object** components. A normal value column
(`string`, `number`, `date`, `media`, `geo`, `iri`) stores a value of a single
known shape, and a `relation` column stores arrays of [locators](../locator.md)
keyed by component tipo. `misc` is the place for components whose value does not
fit either of those: an arbitrary blob of JSON, a computed summary, a
permissions matrix, a set of resolved backlinks, a per-user record allowlist.

Because the shapes differ wildly, in PHP `section_record_data::$column_map`
flags every `misc` entry as a *direct object* — the column store does not
interpret the value; **the component itself knows how to read and write its
own shape**:

```php
// core/section_record/class.section_record_data.php — $column_map (excerpt)
'component_filter_records'  => 'misc', // direct object
'component_info'            => 'misc', // direct object
'component_inverse'         => 'misc', // direct object
'component_json'            => 'misc',
'component_security_access' => 'misc', // direct object
```

Each of the five models declares the same `column: 'misc'` on its own TS
descriptor (`src/core/components/component_json/descriptor.ts`,
`component_info/`, `component_inverse/`, `component_filter_records/`,
`component_security_access/`) instead of one shared map.

### How it is keyed

Like the other value columns, `misc` is a JSONB object **keyed by the producing
component tipo**; each key holds that component's stored array:

```json
{
  "dd478":  [ { "id": 1, "tipo": "oh1", "value": [1, 3, 4] } ],
  "rsc245": [ { "id": 1, "value": { "any": "json" } } ]
}
```

A given section row only carries keys for the `misc` components that actually
live in that section. The GIN sample query for the column reaches into every
item's `value`:

```text
jsonb_path_query_array(misc, '$.*[*].value')
```

### Components that produce it

| component | stored? | shape summary | doc |
| --- | --- | --- | --- |
| `component_json` | yes | `[{"id", "value": <any JSON>}]` | [component_json](../components/component_json.md) |
| `component_info` | rarely | per-widget output items (computed each load) | [component_info](../components/component_info.md) |
| `component_security_access` | yes | `[{"id", "tipo", "section_tipo", "value"}]` | [component_security_access](../components/component_security_access.md) |
| `component_inverse` | no (`save()` is a no-op) | computed `[{from_section_tipo, from_section_id, from_component_tipo}]` | [component_inverse](../components/component_inverse.md) |
| `component_filter_records` | yes | `[{"id", "tipo", "value": [section_id…]}]` | [component_filter_records](../components/component_filter_records.md) |

All five extend `component_common` (no shared `misc` base class — the column is a
storage role, not a class family).

### Client-side model

On the client the stored array surfaces in the datum `data` layer under the
**`entries`** property. The server's `component_common::get_data_item()` assigns
the stored array to `$item->entries`; the TS equivalent is `buildDataItem()`
(`src/core/resolve/component_data.ts`), which builds the same envelope with an
`entries` field. The component JS reads it back exactly as before (it is
copied as-is):

```javascript
// core/component_json/js/component_json.js
const entries  = data.entries || []
const db_value = typeof entries[0]!=="undefined" ? entries[0] : null
```

So a `misc` component appears client-side as `self.data.entries` (an array of the
same item objects stored in the column), regardless of which of the five shapes
it carries.

---

### `component_json` — arbitrary JSON

An arbitrary, free-form JSON value stored as a single **monovalue**. The item's
`value` may be any JSON: object, array, string, number, boolean or `null`,
nested to any depth. It is language-neutral (`lg-nolan`, non-translatable).

```json
[
  {
    "id": 2,
    "value": { "any": ["arbitrary", "json"], "nested": true }
  }
]
```

- `value` carries the literal payload; `id` is the counter-assigned item id (see
  [`meta`](#the-meta-column)). There is no `lang` key.
- Although stored as an array, the component is effectively monovalue: edit, list
  and search views only build/read `entries[0]`.
- **Import disambiguation:** a stored item `[{"value":1}]` is indistinguishable
  from a literal JSON value that happens to have a `value` property. The raw
  export wraps the data as `{"dedalo_data":[{"value":<any JSON>,"id":1}]}`; on
  import, `conform_import_data()` uses `import_data_is_wrapped` to detect the
  wrapper — when present each item must be an object with a `value` property; when
  absent the **entire** decoded value becomes the single monovalue
  `[{"value": <data>}]`. `regenerate_component()` decodes string `value`s back
  into real JSON.

See [component_json](../components/component_json.md) and the
[import data model](../importing_data.md).

---

### `component_info` — computed summary

An **info / aggregation** component: a literal component whose value is computed
dynamically from one or more *widgets* declared in its ontology `properties`,
rather than typed by a cataloguer. It extends `component_common` directly.

Normally it stores **no own `misc` data**: it computes on every load
(`use_db_data = false`) and rarely persists. `get_data()` aggregates the widget
outputs, each widget contributing its own value list (an Input-Process-Output
definition that reads from other components of the record). When a value *is*
stored, it lands in `misc` like any direct-object component.

```json
[
  {
    "id": 1,
    "value": "…widget-computed output…",
    "tool_context": [ /* read-only per-widget tools */ ]
  }
]
```

!!! note "Per-widget tools, not component tools"
    `component_info` overrides `get_tools()` to return `[]`. Any tools you see in
    its output are emitted **per widget output item** inside `data` as
    `tool_context` (attached by the widget, e.g. `media_icons`); they are
    read-only context, not the component's own toolbar.

See [component_info](../components/component_info.md).

---

### `component_security_access` — permissions matrix

Per-profile permission levels over every reachable ontology element (areas,
sections, components, buttons, groupers). Stored as a flat array of permission
rows; non-translatable (`lg-nolan`, a single map across all languages).

```json
[
  {"id": 1, "tipo": "rsc197", "section_tipo": "rsc197", "value": 2},
  {"id": 2, "tipo": "rsc85",  "section_tipo": "rsc197", "value": 2},
  {"id": 3, "tipo": "rsc261", "section_tipo": "rsc197", "value": 1},
  {"id": 4, "tipo": "rsc170", "section_tipo": "rsc170", "value": 2}
]
```

- Each row reads as *"this profile has permission `value` over element `tipo`,
  located in section `section_tipo`."* When `tipo === section_tipo` the row is the
  section (or area) itself; otherwise it is a leaf element of that section.
- `value` is the permission level: `0` none, `1` read, `2` read+edit, `3` admin.
- `id` is the counter-assigned row id; `tipo`/`section_tipo` target the element.

!!! note "Zero values are not persisted"
    Rows whose `value` is `0` are **not** saved. The client builds a full
    `filled_value` array (every datalist node, absent ones defaulting to `0`) for
    the UI, but on save it strips every `value <= 0` entry. Absence of a row
    means *no access*.

!!! info "The tree (datalist) is derived, not stored"
    In `edit` mode the controller also ships a `datalist`: the full ontology
    hierarchy (areas → sections → elements) used to render the tree. It is
    computed by `get_datalist()`, identical for all profiles, and — because it is
    expensive (~3–6 s) — pre-calculated on login and cached **per application
    language** as `cache_tree_<lang>.php`. It never lives in the `misc` column.

See [component_security_access](../components/component_security_access.md).

---

### `component_inverse` — resolved backlinks

Displays the backlinks of a record (which records point at me). It **stores
nothing** — its `save()` is a deliberate no-op — and `get_data()` computes the
inverse-reference locators at request time:

```json
[
  { "from_section_tipo": "oh1", "from_section_id": "5", "from_component_tipo": "oh23" },
  { "from_section_tipo": "rsc197", "from_section_id": "12", "from_component_tipo": "rsc200" }
]
```

- `from_section_tipo` — ontology tipo of the referencing section.
- `from_section_id` — record id of the referencing section.
- `from_component_tipo` — the component (portal/relation) inside that section that
  holds the locator back to this record.

Because it is computed, an `inverse` value never appears as a `misc` key in
storage — the column-map entry exists only so the framework routes the (empty)
save correctly.

See [component_inverse](../components/component_inverse.md).

---

### `component_filter_records` — per-record access

Per-user record-level access restrictions (used in the Users section `dd128`,
canonical tipo `dd478`): the explicit set of `section_id`s a given user may
access in each target section, finer-grained than project-based filtering.
Non-translatable (`lg-nolan`). Gated by `DEDALO_FILTER_USER_RECORDS_BY_ID`; an
empty array means *no restriction*.

```json
[
  { "id": 1, "tipo": "mdcat3112", "value": [1, 8, 9] },
  { "id": 2, "tipo": "rsc202",    "value": [8, 150, 201] },
  { "id": 3, "tipo": "oh1",       "value": [1, 3, 4] }
]
```

- `id` — counter-assigned entry id (targets `update`/`remove`).
- `tipo` — the target **section** tipo the restriction applies to.
- `value` — array of integer `section_id`s the user may access in that section
  (validated client-side to positive, de-duplicated integers).

!!! warning "Consumption shape ≠ storage shape"
    The search consumer in `core/search/trait.where.php` reads the filter as a
    **map keyed by section_tipo** (`$filter_user_records_by_id[$section_tipo]` →
    array of ids), while `get_user_filter_records()` returns the raw stored
    `entries` array (`[{id, tipo, value}, …]`). If you add a consumer, verify the
    exact transformation expected at the point of use.

!!! info "TS status"
    This per-user, per-record ACL gate is not yet ported into the TS search
    WHERE builder (`src/core/search/builders/`) — only the **project**-based
    filter (`component_filter` / `component_filter_master`, a different
    mechanism) is, in `src/core/relations/filter_projects.ts`. Do not assume
    `DEDALO_FILTER_USER_RECORDS_BY_ID` narrowing applies to TS-served reads
    until this lands; see `rewrite/STATUS.md`.

See [component_filter_records](../components/component_filter_records.md).

---

## The `meta` column

### What it is

`meta` holds the **per-component id counters**. Multi-value components
(`component_iri`, `component_json`, `component_date`, …) assign each stored item a
unique, monotonically increasing `id` so the item can later be targeted by
`update`/`remove` and paired across dataframes. The counter for each component
lives in `meta`, written by `component_common::save()` alongside the component's
data column (one entry in the `save_path`):

```php
// core/component_common/class.component_common.php — save()
$counter = new stdClass();
    $counter->column = 'meta';
    $counter->key    = $tipo;
$save_path[] = $counter;
```

### Canonical shape

`meta` is a map of **component tipo → single-item array** carrying the running
counter. The `count` is the **last id assigned** to a value in that component:

```json
{
  "dd750": [ { "count": 3 } ],
  "dd201": [ { "count": 1 } ]
}
```

The single-item-array form is deliberate (it mirrors how the other typed columns
key a component's value as an array), and it is exactly what the atomic allocator
reads at the SQL level:

```sql
SELECT (meta->$1->0->>'count')::int AS count
FROM matrix WHERE section_tipo=$2 AND section_id=$3
```

### How ids are minted

`section_record` owns the counter:

- `get_component_counter($tipo)` reads `meta[$tipo][0]->count` (defaulting `0`).
- `set_component_counter($tipo, $value)` writes it back.
- `allocate_component_ids($tipo, $count)` allocates the next `count` ids
  **atomically**: it takes a PostgreSQL session advisory lock keyed by
  `table_section-tipo_section-id_tipo`, re-reads the *persisted* counter (another
  request may have allocated ids since this record loaded), takes
  `max(persisted, in_memory)` as the base, persists `base + count` immediately so
  concurrent processes see the allocation before this record saves, and returns
  the new id range (e.g. `[8, 9, 10]`). If the DB connection is unavailable it
  falls back to the non-atomic in-memory counter.

This is why every `iri`/`json`/`date` item gets a stable, non-reused `id` even
under concurrent edits in the persistent-worker model.

!!! info "TS re-implementation, same guarantee"
    The TS server keeps the same never-lower, never-recycled counter law but
    without an explicit advisory lock: `allocateComponentItemId()`
    (`src/core/db/matrix_write.ts`) does the increment as one atomic
    `UPDATE … SET meta = jsonb_set(…, count+1) RETURNING`, relying on
    Postgres's row-level lock to serialize concurrent callers against the same
    record. Absorbing explicit ids from imports/migrations is
    `absorbComponentItemIds()`, raising the counter to
    `GREATEST(persisted, incoming max)` — PHP's `raise_component_counter()`
    equivalent. There is no long-lived per-request worker to leak a stale
    in-memory counter across requests in the first place (spec §4 — no
    ambient request state), so the PHP in-memory fallback branch has no TS
    counterpart.

### Components that use it

Any component that mints per-item `id`s: `component_iri`, `component_json`,
`component_date`, the string components, and the `misc` components above
(`component_security_access`, `component_filter_records` rows all carry the
counter-assigned `id`). `meta` itself is never read by the client — it is pure
server-side bookkeeping.

---

## The `relation_search` column

### What it is

A denormalised, GIN-indexed **ancestor index**. It is written **only for
`component_autocomplete_hi`** (hierarchical/thesaurus values) on save. It stores
the flattened parent-chain locators of the stored value so a search can match a
record by any of its ancestors **without walking the hierarchy at query time**:
linking a value to the thesaurus node *Madrid* lets a search for *Spain* or
*Europe* still match the record.

### Shape

An array of [locator](../locator.md) objects (the parent chain), keyed in the
column by the producing component tipo, each locator tagged with the component
tipo and relation type:

```json
[
  { "section_tipo": "es1", "section_id": "4", "type": "dd543", "from_component_tipo": "oh23" },
  { "section_tipo": "es1", "section_id": "2", "type": "dd543", "from_component_tipo": "oh23" }
]
```

It is built by `component_relation_common::get_relations_search_value()`, which
walks `component_relation_parent::get_parents_recursive()` for every stored
locator, sets `from_component_tipo` to the component's own tipo and `type` to its
`relation_type`, and de-duplicates. The method returns `null` (writes nothing)
for any other model.

The TS server ports this same maintenance step at the save chokepoint:
`maintainRelationSearchIndex()` (`src/core/section/record/save_component.ts`)
runs only when the saved component's model is `component_autocomplete_hi`,
matching the PHP legacy-model gate exactly.

### How search uses it

The search builder wraps the primary `relation` clause with a cloned clause
targeting `relation_search`, OR-ing the two so a hit on the value **or** any of
its ancestors matches:

```text
{ $or: [ clause_relations, clause_relation_search ] }
```

See the [search subsystem](../sqo.md) for the SQO → WHERE machinery.

---

## v7 consolidation / evolution

- **`misc` is a role, not a type.** The five components that share it have no
  common base beyond `component_common`; each owns its shape entirely. When
  adding a direct-object component, register it as `'…' => 'misc'` in PHP
  `section_record_data::$column_map` (in TS, declare `column: 'misc'` on the
  new model's own `descriptor.ts`) and implement the read/write of its own
  shape — do **not** add bespoke columns or tables (see *The Dédalo way:
  standard schema*).
- **Computed vs stored.** `component_inverse` (always) and `component_info`
  (normally) compute their value at request time and persist nothing; their
  `misc` map entries are routing placeholders only. Treat the presence of a
  column-map entry as "may use this column", not "stores here".
- **`meta` minting hardened.** The id counter moved from a non-atomic in-memory
  increment to the advisory-locked `allocate_component_ids()` so per-item ids stay
  unique under concurrent edits in persistent workers; the column shape
  (`{tipo:[{count}]}`) is fixed by the SQL the allocator runs.
- **`relation_search` stays narrow.** It exists purely as a search optimisation
  for `component_autocomplete_hi`; it is not a general-purpose denormalisation
  hook. Keep new search-time ancestor logic in the SQO/WHERE layer unless it must
  be precomputed at save time for the same hierarchical reason.

---

## See also

- [Sections — typed-column storage model](../sections/index.md#storage-detail-the-data-column-is-split-into-typed-jsonb-columns) — how `misc`/`meta`/`relation_search` fit the `matrix` row.
- Sibling data-model pages: `media`, `geo`, `iri` (other typed columns).
- Producing components: [component_json](../components/component_json.md) · [component_info](../components/component_info.md) · [component_security_access](../components/component_security_access.md) · [component_inverse](../components/component_inverse.md) · [component_filter_records](../components/component_filter_records.md).
- [Search (SQO)](../sqo.md) — how `relation_search` is queried.
- [Importing data](../importing_data.md) — the `dedalo_data` wrapper used by `component_json`.
- [Locator](../locator.md) · [Glossary](../glossary.md).
