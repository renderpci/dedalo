# Relation data (the `relation` column)

> The data **type** produced by every related component: an array of
> [locators](../locator.md), each one a value item whose *value* is a pointer to
> another record. This page documents the **storage and value model** of that
> data — not any single component. For the locator object itself (its fields,
> flat form, helpers) see [Locator](../locator.md).

> See also: [Data model index](index.md) · [Sections — typed-column storage](../sections/index.md) · [Components](../components/index.md) · [relation_list (inverse view)](../ontology/relation_list.md) · [Locator](../locator.md)

---

## 1. What relation data is, and why it exists

Dédalo stores records as JSONB in a handful of `matrix_*` tables, each row keyed
by the pair `(section_tipo, section_id)` (see
[Sections — the matrix table model](../sections/index.md#the-matrix-table-model)).
That is a NoSQL store. **Relation data is how Dédalo grafts SQL-style
referential relations onto it.**

A *related component* (portal, select, check_box, radio_button, the
`relation_*` family, dataframe, filter) does not store literal values. Its data
is an **array of locators** — each locator is a value item that *points at*
another record (and optionally a component, tag or dataframe item inside it).
The canonical data lives once, in the target record; many records can point at
it; changing the target updates every caller. Resolving relation data means
reading the target row and rendering the requested component.

Because the pointer (`{section_tipo, section_id}`) is the same minimal address
the matrix tables use, the locator is the universal join key of the data model.
The relation *value model* is therefore: **a value item whose value is a
locator**, grouped into per-component arrays.

!!! note "Type vs. component"
    "Relation data" is the **format**. Many components produce it. The producing
    components are documented separately — start at
    [Components → related components](../components/index.md#related-components).
    This page is about the bytes in the database and how they are keyed, read,
    inverted and searched.

---

## 2. Canonical JSON shape

A single relation value item is a locator. The minimal, mandatory pair is the
target address; the other fields are sparse (only meaningful ones serialize):

```json
{
    "section_tipo"        : "rsc197",
    "section_id"          : "88",
    "from_component_tipo" : "oh24",
    "type"                : "dd151"
}
```

- `section_tipo` / `section_id` — **mandatory**; the target record being pointed at.
- `from_component_tipo` — the component that *owns* this locator. This is what
  partitions the section-wide relations bag (see §4): each component forces this
  to its own tipo when it validates incoming locators.
- `type` — the relation **type** tipo (link / parent / child / related / model /
  filter / dataframe …), see §6.

Richer items add destination and pairing fields (all optional, sparse):

```json
{
    "section_tipo"        : "rsc170",
    "section_id"          : "3",
    "component_tipo"      : "rsc29",
    "from_component_tipo" : "oh24",
    "from_section_tipo"   : "oh1",
    "from_section_id"     : "1",
    "type"                : "dd151",
    "type_rel"            : "bidirectional",
    "tag_id"              : "1",
    "tag_component_tipo"  : "rsc36",
    "id_key"              : 1
}
```

- `component_tipo` — narrows the pointer from a whole record to one field.
- `tag_id` / `tag_component_tipo` / `tag_type` — narrow to one inline tag inside
  a text-area component.
- `from_*` — the source side (the record/component that stored the locator),
  needed to navigate a relation back to its origin.
- `type_rel` — directionality descriptor (`'unidirectional'`,
  `'bidirectional'`, `'multidirectional'`); used by
  [`component_relation_related`](../components/component_relation_related.md).
- `id_key` — dataframe pairing key (positive int); ties a dataframe locator to
  the exact main-component item it qualifies
  (`section_id_key` / `section_tipo_key` are **@deprecated** and no longer read by
  live code — only by the old-CSV import and v6→v7 update).

For the complete, field-by-field reference — every property, its setter,
validation rules and the flat string form — see **[Locator](../locator.md)**.

---

## 3. Database column: `relation`, keyed by component tipo

Relation data lives in its own typed JSONB column, **`relation`**, one of the
columns the conceptual `data` payload is split into
(see [Sections — typed-column storage](../sections/index.md#storage-detail-the-data-column-is-split-into-typed-jsonb-columns)).

Inside the column the locators are stored as a **map keyed by the originating
component tipo**, each value being that component's array of locators:

```json
{
    "oh24": [
        { "section_tipo": "rsc197", "section_id": "88", "from_component_tipo": "oh24", "type": "dd151" },
        { "section_tipo": "rsc167", "section_id": "12", "from_component_tipo": "oh24", "type": "dd151" }
    ],
    "oh25": [
        { "section_tipo": "rsc197", "section_id": "5", "from_component_tipo": "oh25", "type": "dd151" }
    ]
}
```

This is why one record can carry many distinct relation components without
collision: each component owns the array under its own tipo key. A component
reads its slice through the section record:

```php
// core/section_record/class.section_record.php
// get_component_data('oh25', 'relation') returns the array of locators
// stored under key 'oh25' inside the 'relation' JSONB column.
$locators = $section_record->get_component_data('oh24', 'relation'); // array under key "oh24"
```

A record-create / column-save payload addresses it the same way (column →
component-tipo → value array):

```json
{
    "relation": { "oh25": [ /* locators */ ] },
    "string":   { "oh26": ["Hello"] },
    "data":     { "...": "section metadata object" }
}
```

!!! note "Components never write the database"
    A component reads and writes *through* its section. On `save()` the section
    is the single writer; the locators land in the `relation` column keyed by
    component tipo, and the record-wide `relations` bag (§4) is kept in step.

---

## 4. The section-owned `relations` array

Separately from the per-component `relation` column, each section carries **one
flat `relations` container** inside its `datos`. It aggregates every locator of
the record into a single shared bag, so the *section* (not each component) owns
the relation list. The API lives on `section`
(`core/section/class.section.php`):

| method | what it does |
| --- | --- |
| `get_relations( $container = 'relations' )` | Returns the record's locator array. Empty when the record does not exist yet. |
| `add_relation( $locator, $container )` | Appends a locator. Requires `$locator->type`; strips the transient `paginated_key`; de-dupes via `locator::in_array_locator()`. **Mutates in memory only** — the caller must `Save()`. |
| `remove_relation( $locator, $container )` | Removes by comparing the identifying locator properties. |
| `remove_relations_from_component_tipo( $options )` | Bulk-removes every locator originating from a given component tipo (dataframe matches via the unified `id_key` contract). |

```php
// core/section/class.section.php  (validation guards in add_relation)
//  - $locator must be a non-empty object
//  - $locator->type must be set (e.g. DEDALO_RELATION_TYPE_FILTER)
//  - paginated_key is unset before storing (transient UI property)
//  - duplicates rejected via locator::in_array_locator()
//  - side effect: mutates $this->dato; does NOT call save()
$section->add_relation( $loc );
$section->Save(); // caller must persist
```

Related components delegate to these methods; that delegation is what keeps the
single shared `relations` array authoritative. A component then *slices its own
subset* out of the bag by matching `from_component_tipo` (and `section_tipo`).

!!! info "Two views of the same data"
    The per-component **`relation` column** (keyed by component tipo) and the
    record-wide **`relations` array** are two representations of the same
    relation data: the column is partitioned for storage/indexing, the array is
    the single aggregated bag the section owns.

---

## 5. Inverse references (`dd_relations`)

Locators are stored only on the **pointing (forward)** side: the record that
*points at* another holds the locator. The inverse question — *"who points at
me?"* — is **computed**, not stored, on the work side:

```php
// core/section_record/class.section_record.php
$inverse = $section_record->get_inverse_references();
//  → search_related::get_referenced_locators([ {section_tipo, section_id} ])
```

`search_related::get_referenced_locators()`
(`core/search/class.search_related.php`) scans the matrix tables and returns
descriptors carrying `from_component_tipo`, `from_section_tipo`,
`from_section_id` and the pairing key (`id_key`). This drives:

- **Referential integrity on delete** — `remove_all_inverse_references()` removes
  every forward locator that points at a record being deleted, so no stale
  references remain (only `component_relation_common` subclasses and
  `component_dataframe` are handled; dataframe pairing uses `id_key` only).
- **The inverse view** — [`relation_list`](../ontology/relation_list.md) renders
  the backlinks as a grouped, paginated grid ("who points at this record").

On the **diffusion** side this materialises as a published column,
**`dd_relations`** (refactored from the v6 `jer_dd_relations` by
`v6_to_v7::refactor_jer_dd_relations`). The publication API's
`resolve_inverse_relations` option resolves it; an unresolved entry looks like:

```json
{
    "type"                : "dd48",
    "section_id"          : "33",
    "section_tipo"        : "aa1",
    "from_component_tipo" : "hierarchy49",
    "from_section_tipo"   : "aa1",
    "from_section_id"     : "4"
}
```

Each inverse locator carries a `section_tipo`, which the publication layer maps
to a target table to fetch the resolved row; locators whose `section_tipo` is
not in the mapping are skipped silently. See the publication API querying docs
for `resolve_inverse_relations`.

---

## 6. Relation `type` values

The `type` field is a real ontology tipo (not a label). The constants live in
`core/base/dd_tipos.php`:

| constant | tipo | meaning |
| --- | --- | --- |
| `DEDALO_RELATION_TYPE_LINK` | `dd151` | generic portal / select link |
| `DEDALO_RELATION_TYPE_PARENT_TIPO` | `dd47` | hierarchy parent |
| `DEDALO_RELATION_TYPE_CHILDREN_TIPO` | `dd48` | hierarchy child |
| `DEDALO_RELATION_TYPE_RELATED_TIPO` | `dd89` | related record |
| `DEDALO_RELATION_TYPE_RELATED_UNIDIRECTIONAL_TIPO` | `dd620` | related, unidirectional |
| `DEDALO_RELATION_TYPE_RELATED_BIDIRECTIONAL_TIPO` | `dd467` | related, bidirectional |
| `DEDALO_RELATION_TYPE_RELATED_MULTIDIRECTIONAL_TIPO` | `dd621` | related, multidirectional |
| `DEDALO_RELATION_TYPE_MODEL_TIPO` | `dd98` | model |
| `DEDALO_RELATION_TYPE_INDEX_TIPO` | `dd96` | index / indexation |
| `DEDALO_RELATION_TYPE_FILTER` | `dd675` | project / access filter |
| `DEDALO_RELATION_TYPE_ONTOLOGY` | `dd77` | ontology |
| `DEDALO_RELATION_TYPE_DATAFRAME` | `dd490` | positive marker of dataframe-pairing locators |

Conceptually the locator type space is *link / external link / parent / child /
related / model* (the "external link" is the external-source variant of a link).
A component's effective `type` is initialised in
`component_relation_common::__construct` from
`properties->config_relation->relation_type`, falling back to each subclass's
`default_relation_type`.

---

## 7. `relation_search` (denormalized hierarchical search data)

Plain relation data only records the exact target a record points at. For
**hierarchical / cross-parent search** that is not enough: searching for *Spain*
should also match a record linked to *Madrid*. To make that work, the
hierarchical-search component (legacy model `component_autocomplete_hi`)
denormalizes its ancestor chain into the auxiliary **`relation_search`** JSONB
column on save:

```php
// core/component_relation_common/class.component_relation_common.php
// get_relations_search_value(): for each stored locator, walk
// component_relation_parent::get_parents_recursive() and emit one locator per
// ancestor, tagged with this component's tipo and relation_type.
```

The emitted ancestor locators carry `section_tipo`, `section_id`,
`from_component_tipo` (the searching component) and `type`, so a search that hits
an ancestor node also matches every descendant that links below it. This is a
**denormalized copy** maintained from the forward locators — never a separate
source of truth.

---

## 8. Components that produce / use relation data

Every related component reads and writes relation data; their differences are in
*type*, *cardinality* and *UI*, not in the stored format:

| component | produces | notes |
| --- | --- | --- |
| [`component_portal`](../components/component_portal.md) | link locators (`dd151`) | many-to-many record links; resolves target sub-columns via `ddo_map` |
| [`component_select`](../components/component_select.md) | link locator | single linked record |
| [`component_check_box`](../components/component_check_box.md) | link locators | multi-value selection |
| [`component_radio_button`](../components/component_radio_button.md) | link locator | single selection |
| [`component_relation_parent`](../components/component_relation_parent.md) | parent locators (`dd47`) | hierarchy up |
| [`component_relation_children`](../components/component_relation_children.md) | child locators (`dd48`) | hierarchy down |
| [`component_relation_related`](../components/component_relation_related.md) | related locators (`dd89`/`dd620`/`dd467`/`dd621`) | uses `type_rel` directionality |
| [`component_relation_model`](../components/component_relation_model.md) | model locators (`dd98`) | model wiring |
| [`component_relation_index`](../components/component_relation_index.md) | index locators (`dd96`) | indexation with `tag_id` |
| [`component_dataframe`](../components/component_dataframe.md) | dataframe-paired locators (`dd490`) | paired to a main item via `id_key` |
| [`component_filter`](../components/component_filter.md) | filter locators (`dd675`) | project / access filtering |

The selectable option list (datalist / autocomplete) for these components is a
separate concern resolved through
[`relation_list`](../ontology/relation_list.md) /
`component_common::get_list_of_values()` — see
[Components → related components](../components/index.md#related-components).

---

## 9. Server classes

| class | file | role |
| --- | --- | --- |
| `locator` | `core/common/class.locator.php` | the value object (extends `stdClass`); validators, comparison/dedup helpers, flat form |
| `section` | `core/section/class.section.php` | owns the `relations` array: `get_relations` / `add_relation` / `remove_relation` / `remove_relations_from_component_tipo` |
| `section_record` | `core/section_record/class.section_record.php` | reads the `relation` column (`get_component_data($tipo,'relation')`); computes inverse refs; `remove_all_inverse_references()` |
| `component_relation_common` | `core/component_relation_common/class.component_relation_common.php` | base of related components; initialises `type`; `get_relations_search_value()` for `relation_search` |
| `search_related` | `core/search/class.search_related.php` | `get_referenced_locators()` — the inverse-reference engine |
| `relation_list` | `core/relation_list/class.relation_list.php` | renders the inverse (backlink) grid; diffusion `dd_relations` adapter |

---

## 10. Client-side model

In the JSON-API the transmitted unit is a `{context, data}` **datum**. For a
relation component the locator array surfaces in the **data** layer (the
`context` layer carries only the description — `tipo`, `model`, `mode`, `lang`,
`label`, `properties`, `permissions`, `tools`, `request_config`, `view` — never
the values).

- In the API payload the locator array is exposed under **`data.entries`**, each
  entry carrying a transient `paginated_key`, accompanied by `parent_tipo`,
  `parent_section_id` and `pagination`.
- In JavaScript the component instance holds it as **`self.data.entries`** — the
  array of locator objects. `update_data_value()` / `change_value()`
  (in `component_common.js`) mutate this array before save; on save the locator's
  `from_component_tipo` is forced to the owning component's own tipo.
- The **displayed strings** of the linked records are *not* in the locator. They
  arrive as **subdata**: the controller resolves each target via
  `get_subdatum()` and appends the target components' datums, merging context
  with `common::merge_unique_context()`.

```javascript
// component_common.js (shape)
self.data.entries = [
    { section_tipo: "rsc197", section_id: "88", from_component_tipo: "oh24", type: "dd151" }
    // ...
]
```

For the full layering rules (context vs. data, subdatum resolution, datalist) see
the **dedalo-context-data-layers** and **dedalo-datalist-resolution** skills.

---

## 11. Resolution to a value

To turn a locator into a displayed value:

1. Read the target `matrix_*` row by `{section_tipo, section_id}`.
2. If `component_tipo` is set, render that component; `tag_id` /
   `tag_component_tipo` narrow further to a single inline annotation.
3. For dataframe locators, `id_key` pairs the supplementary frame record to the
   exact main-component item (`section_id_key` / `section_tipo_key` are retired —
   read only by the old-CSV import and v6→v7 update).

Helpers on `locator` support resolution and dedup: `get_term_id_from_locator`
(`{section_tipo}_{section_id}`, e.g. `es1_185`), `lang_to_locator`
(lang code → languages-section locator), `compare_locators` /
`in_array_locator` / `build_locator_lookup_key` (hash-key dedup), and
`get_std_class` (strip class identity for JSON/cache). See
[Locator → helpers](../locator.md) for the full list.

---

## 12. v7 consolidation / evolution

- **One bag, owned by the section.** v7 makes the record-wide `relations` array
  authoritative and routes every related component through `section`'s
  `get_relations` / `add_relation` / `remove_relation`, instead of each component
  keeping its own list. The per-component `relation` column is the partitioned
  storage view of that single bag.
- **Unified dataframe pairing.** `id_key` is the single pairing contract for
  dataframe locators (and the `dd490` `DEDALO_RELATION_TYPE_DATAFRAME` positive
  marker) — including the relation sibling-order, which is itself an `id_key`
  dataframe. The legacy `section_id_key` / `section_tipo_key` are **@deprecated**,
  read only by the old-CSV import and v6→v7 update.
- **Source-side `from_*` over the v6 anchors.** `from_section_tipo` /
  `from_section_id` replace the deprecated `section_top_tipo` /
  `section_top_id` hierarchical anchors.
- **`dd_relations` on the diffusion side** replaces the v6 `jer_dd_relations`
  (migrated by `v6_to_v7::refactor_jer_dd_relations`) and is resolved on demand
  by the publication API's `resolve_inverse_relations`.
- **Inverse is computed, not stored** on the work side
  (`search_related::get_referenced_locators`), so there is no inverse table to
  keep in sync; `relation_search` is the only denormalized copy, and it is
  rebuilt from the forward locators on save.

---

## See also

- [Locator](../locator.md) — the value object: every field, the flat string form, helpers.
- [Sections — typed-column storage](../sections/index.md#storage-detail-the-data-column-is-split-into-typed-jsonb-columns) — how `relation` / `relation_search` sit among the typed columns.
- [Sections — relations are section-owned](../sections/index.md#relations-are-section-owned) — the `section` relation API.
- [Components → related components](../components/index.md#related-components) — the producers.
- [relation_list](../ontology/relation_list.md) — the inverse (backlink) view and the `dd_relations` diffusion adapter.
- [Data model index](index.md) — sibling data-type pages.
