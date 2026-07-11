# Number values

The **number** data type is the way Dédalo v7 stores a genuine numeric value —
an integer or a floating-point number — inside a record. It is one of the
[typed JSONB columns](../sections/index.md#storage-detail-the-data-column-is-split-into-typed-jsonb-columns)
of the `matrix` table, and it is produced by a single component,
[`component_number`](../components/component_number.md).

This page documents the data **type** (the value as it is stored and travels to
the client), not the component. For the component's render views, properties,
search operators and import/export options, see
[`component_number`](../components/component_number.md).

---

## 1. What it is and why it exists

A number value is a stored numeric literal with no language dimension. It exists
because a great deal of cultural-heritage data is genuinely numeric and must
*behave* as a number, not as text:

- it must round to a fixed precision,
- it must sort numerically (`100` after `99`, not lexicographically after `1`),
- it must be filterable with comparison and range operators in search.

A string literal ([string values](string.md)) cannot do any of that, so numeric
fields use a dedicated type. Crucially, a number is the same in every language,
so this type is **non-translatable**: every item carries the fixed language
`lg-nolan` (`DEDALO_DATA_NOLAN`) and the component never exposes `tool_lang`.

!!! note "Storage is canonical, display is render-only"
    The stored literal **always** uses `.` as the decimal separator and has
    **no** thousand separator and no locale suffix. Internationalized display —
    for example the Spanish/French `1.234,56` for the stored `1234.56` — is
    applied only in the view layer and is never persisted.

---

## 2. Canonical JSON shape

Inside the `number` column a component's data for one tipo is **always an array
of item objects** (the multivalue model: even a mono-value number stores
`[item]`, never a bare scalar). Each item is the consolidated v7 value envelope,
but for the non-translatable number it is the minimal `{id, value}` form — **no
`lang` key is written** because the language is implicitly `lg-nolan`:

```json
[
    { "id": 5, "value": 31416.2 },
    { "id": 2, "value": 55 }
]
```

- **`id`** — the stable, server-minted per-item identity (integer). It is the
  pairing key for [dataframes](../components/component_dataframe.md) and Time
  Machine, and the addressing key for client edits (`update` / `remove` by `id`,
  not by array index). See [item-id minting](#5-server-class-and-item-id-minting).
- **`value`** — the unformatted numeric literal, an `int` or a `float` (or
  `null` for a preserved-but-empty position). The decimal point is `.`; there is
  no thousand separator.

`component_number` is a member of the
`component_common::$components_using_value_property` registry, which is why its
item carries an explicit `value` property (relation components, by contrast,
store a locator and have no `value`).

!!! info "Legacy lang-keyed shape"
    Raw exports and ontology predating the v7 dataframe normalization may
    present the value as a flat lang-keyed object:

    ```json
    { "lg-nolan": [104, -75.35] }
    ```

    `component_number::conform_import_data()` still accepts this form: for the
    non-translatable number it extracts the first `lg-*` partition and
    normalizes each entry into a v7 `{value}` item.

---

## 3. Database column and keying

Number values live in the dedicated **`number`** JSONB column of the `matrix`
row, **keyed by component tipo**. The full column is a `stdClass` object whose
keys are the component tipos that wrote numeric data into this record, and whose
values are the per-tipo item arrays shown above:

```json
{
    "number": {
        "test211": [
            { "id": 5, "value": 31416.2 },
            { "id": 2, "value": 55 }
        ]
    }
}
```

The model→column routing is **not** hardcoded in the component; in PHP it is
resolved through the static registry `section_record_data::$column_map`, which
maps `component_number → 'number'`. The column itself is declared in
`section_record_data::$columns_name`. Access is column-level
(`get_column_data` / `set_column_data`) and key-level
(`get_key_data` / `set_key_data`, where the *key* is the component tipo), with
lazy JSON decoding (`ensure_decoded`) so that list mode stays cheap.

The TS server resolves the same routing through `getColumnNameByModel(model)`
(`src/core/ontology/resolver.ts`), reading the `column` field off the
`component_number` descriptor (`src/core/components/component_number/descriptor.ts`
declares `column: 'number'`) instead of a shared lookup table; the matrix's
`number` column itself is declared in `MATRIX_JSONB_COLUMNS`
(`src/core/db/matrix.ts`).

For the full picture of the typed-column matrix model, see
[Sections → the matrix table model](../sections/index.md#the-matrix-table-model).

---

## 4. Components that produce / use this type

| Component | Role |
| --- | --- |
| [`component_number`](../components/component_number.md) | The **only** producer of number values. A literal-direct component that owns and formats its own numeric value. |

A number value can additionally be the *frame target* of a
[`component_dataframe`](../components/component_dataframe.md): when the number
node has `has_dataframe`, each `{id, value}` item is paired by its `id` with an
uncertainty / qualifier / context record.

---

## 5. Server class and item-id minting

There is no dedicated "number value" PHP class; the type is handled by
`component_number` over the shared `component_common` / `section_record`
machinery.

Two formatting hooks enforce the type/precision contract on **both read and
write**, so the value a caller receives is consistent even if the `precision`
property changed after the data was entered:

- **On read** — `component_number::get_data()` runs each item's `value` through
  `set_format_form_type()`.
- **On write** — `component_number::set_data()` validates and runs each value
  through `set_format_form_type()` before persisting; invalid (non-numeric)
  items are logged and dropped rather than overwritten with garbage.

`set_format_form_type($value)` applies the ontology contract:

```php
// type "int"   → (int) cast, decimals discarded:           85.35  → 85
// type "float" → round($value, $precision), default prec 2: 85.3568 → 85.36
// (string with no separator is cast to int first, to avoid
//  PHP float-precision artefacts when casting "42" → 42.0)
```

**Item id stability.** When `set_data()` runs, each item lacking a valid `id` is
assigned one via `section_record::allocate_component_ids($tipo, 1)`. Allocation
is atomic (a PostgreSQL advisory lock guards the per-component counter persisted
in the `meta` column) and ids are **never recycled**, which is exactly what keeps
the dataframe `id_key` pairing and Time Machine references valid across edits and
reorderings. The TS server keeps the same never-recycled guarantee but mints
via `allocateComponentItemId()` (`src/core/db/matrix_write.ts`), a single
atomic `UPDATE … RETURNING` rather than an explicit advisory lock — see the
[data model overview](index.md) for the full comparison.

---

## 6. Client-side model

On the wire the value travels inside the datum `data` layer, paired with its
structure `context`. The client receives the same array of `{id, value}` items,
exposed as the `entries` array the JS views iterate:

```json
{
    "tipo": "test211",
    "section_tipo": "test3",
    "section_id": "1",
    "mode": "edit",
    "lang": "lg-nolan",
    "from_component_tipo": "test211",
    "entries": [
        { "id": 5, "value": 31416.2 },
        { "id": 2, "value": 55 }
    ]
}
```

In the JS model (`component_number.js`) the values live in `this.data.entries`,
each entry a plain object `{ id: number|null, value: number|null }`. The client
mirror of the server formatting hook is `get_format_number()`, applying the
configured `type` / `precision`. Edits are sent back as a `changed_data` object
processed by `update_data_value()`, targeting items by their stable **`id`**
(never by array index), so edits survive reordering and pagination:

```javascript
// update one value by id
{ "action":"update", "id":"5", "value": { "value": 31416.2 } }
// insert a new value (id minted server-side)
{ "action":"insert", "id":null, "value": { "value": 42 } }
```

---

## 7. Examples

A single mono-value number (one item, `lg-nolan` implicit):

```json
{ "number": { "numisdata133": [ { "id": 1, "value": 23.5 } ] } }
```

A multivalue number column (e.g. several measurements), mixing `float` and
integer literals — note no thousand separator on the large value:

```json
{
    "number": {
        "test211": [
            { "id": 5, "value": 31416.2 },
            { "id": 2, "value": 55 },
            { "id": 7, "value": 1234567.89 }
        ]
    }
}
```

A negative value and a deliberately preserved empty position (multivalue slot
kept so a dataframe attachment by `id` survives):

```json
[
    { "id": 3, "value": -75.35 },
    { "id": 4, "value": null }
]
```

The canonical import form (numbers carry no language), as it appears in a CSV
cell:

```text
section_id;numisdata133
1;"[{""value"":104},{""value"":-75.35}]"
```

---

## 8. v7 consolidation / evolution

- **Unified value envelope.** v7 collapses numbers onto the same
  `{id, value}` item model used by all `$components_using_value_property`
  components; the older v6-style bare-number arrays (`[104, -75.35]`) and
  lang-keyed objects (`{"lg-nolan":[104]}`) are still *accepted* on import but
  are normalized to the `{id, value}` form.
- **Server-minted, never-recycled `id`.** The per-item `id` is what makes
  [dataframe](../components/component_dataframe.md) pairing and Time Machine
  playback robust; client edits address items by `id`, not by array position.
- **Format on read and on write.** Because the type/precision contract is
  applied symmetrically, the stored literal and the served value stay consistent
  even after a precision change — the storage form remains canonical (`.`
  decimal, no thousand separator) and all locale formatting is render-only.

---

## See also

- [`component_number`](../components/component_number.md) — the producing
  component (render views, properties, search operators, import/export).
- [String values](string.md) — text literals; the right choice for numeric-looking
  *codes* (leading zeros, identifiers you never sum or compare).
- [Date values](dd_date.md) — years, calendars and time spans (a year is not just a
  number).
- [Sections → typed-column storage](../sections/index.md#storage-detail-the-data-column-is-split-into-typed-jsonb-columns)
  — how the `number` column fits the matrix model.
