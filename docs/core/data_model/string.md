# String values (the `string` column)

> See also: [Sections — typed-column storage](../sections/index.md) · [`component_input_text`](../components/component_input_text.md) · [`component_text_area`](../components/component_text_area.md) · [`component_email`](../components/component_email.md) · [`component_password`](../components/component_password.md)

## What it is

A **string value** is the simplest Dédalo data type: a literal text payload
(`"L'Horta Sud"`, `"alice@example.org"`, an Argon2id password hash, a rich-text
transcription…) stored verbatim in the record. It is the data shape produced by
the *string family* of components — the literal components whose model maps to
the `string` typed column.

It exists because most fields in any catalogue are, at bottom, text. Rather than
give each text-like field its own bespoke storage, Dédalo funnels them all into
one column with one uniform item envelope, so that translation, multivalue,
dataframe pairing and Time Machine versioning work identically across every
text field. The *only* thing that differs between an `input_text`, a
`text_area`, an `email` and a `password` is **what the `value` string contains
and how it is validated/rendered** — never how it is stored.

!!! note "Data type, not component"
    This page documents the **stored data type** (the `string` column item), not
    a single component. Four components write into it. For the field-level
    behavior of each, follow the component links above.

---

## Canonical JSON shape

Inside the `string` column, each component's data is keyed by its **component
tipo** and is **always an array of item objects** (the multivalue model — even a
mono-value field stores `[item]`, never a bare scalar). Each item is the
consolidated v7 value envelope:

```json
{ "id": 1, "lang": "lg-spa", "value": "L'Horta Sud" }
```

| field | type | meaning |
| --- | --- | --- |
| `id` | int | Stable, **server-minted per-item identity**, unique within this component's items in this record and never recycled. The pairing key for [dataframes](../components/component_dataframe.md), Time Machine playback and client edits (edits target the `id`, not the array index). |
| `lang` | string | `lg-xxx` (e.g. `lg-spa`, `lg-eng`) for translatable strings, or `lg-nolan` (`DEDALO_DATA_NOLAN`) for non-language values. The flat array interleaves all languages. |
| `value` | string | The literal text payload (a scalar string). Empty values (`{"value":""}`) are **deliberately preserved**, not pruned, so multivalue positions and dataframe attachments survive. |

String components belong to `component_common::$components_using_value_property`
— the registry of models whose item carries an explicit `value` property — so
the `{id, lang, value}` form is canonical for all of them (contrast relation
components, whose item *is* a [locator](../locator.md), with no `value`).

A full column slice for one record, keyed by tipo:

```json
{
  "rsc85": [
    { "id": 1, "lang": "lg-spa", "value": "Alicia" },
    { "id": 1, "lang": "lg-eng", "value": "Alicia" }
  ],
  "rsc86": [
    { "id": 1, "lang": "lg-nolan", "value": "Gutierrez" }
  ]
}
```

!!! info "Multilingual = one item per language"
    A translatable string holds **one logical position per language**, all in the
    same flat array. The items that represent the *same* logical value across
    languages share the same `id` (see [the lang dimension](#multilingual-one-item-per-language)).
    Non-translatable strings collapse to a single `lg-nolan` item.

---

## Database column and keying

String values live in the **`string`** typed JSONB column of the `matrix` row,
identified by `(section_tipo, section_id)`. The column decodes to a `stdClass`
**keyed by component tipo**, each key holding the array of item envelopes:

```text
matrix row (section_tipo = "rsc197", section_id = 1)
  └── string (jsonb)
        ├── "rsc85": [ {id,lang,value}, … ]   ← an input_text
        └── "rsc86": [ {id,lang,value}, … ]   ← another input_text
```

The routing is *not* hardcoded per component. In PHP it is resolved through the
static registry `section_record_data::$column_map` via `get_column_name($model)`.
All four string components map to `string`:

```php
section_record_data::$column_map = [
    // …
    'component_email'      => 'string',
    'component_input_text' => 'string',
    'component_password'   => 'string',
    'component_text_area'  => 'string',
    // …
];
```

Each component instance caches the resolved column as `$data_column_name`. Reads
and writes go through the section record, never directly to the database:

```php
// read one string component's data from the 'string' column
$section_record->get_component_data( 'rsc85', 'string' );

// write it back (in memory), then flush in one transaction
$section_record->set_component_data( 'rsc85', 'string', $data );
$section_record->save_key_data( $save_path );
```

The TS server resolves the same four-way routing through
`getColumnNameByModel(model)` (`src/core/ontology/resolver.ts`), which reads
the `column` field off each model's own descriptor
(`component_input_text/descriptor.ts`, `component_email/descriptor.ts`, …, each
declaring `column: 'string'`) instead of one shared map, and reads the column
itself via the passive `MatrixRecord` struct (`readComponentItems()`,
`src/core/resolve/component_data.ts`).

The per-item `id` counter for each tipo lives in the sibling **`meta`** column
(`{"rsc85":[{"count":3}]}`), minted atomically under a PostgreSQL advisory lock
when `set_data()` encounters an item without a valid `id` — the TS equivalent
(`allocateComponentItemId()`, `src/core/db/matrix_write.ts`) achieves the same
never-recycled guarantee with a single atomic `UPDATE … RETURNING` instead of
an explicit lock. See [Sections — typed-column storage](../sections/index.md)
for the full column set and the matrix model.

---

## Components that produce / use it

| component | content | translatable | multivalue | notes |
| --- | --- | --- | --- | --- |
| [`component_input_text`](../components/component_input_text.md) | **plain text**, single line (no HTML) | yes (by default) | yes | The default literal building block. Stores `{id, lang, value}` items, one per language per logical value. |
| [`component_text_area`](../components/component_text_area.md) | **formatted / rich** multi-paragraph text (may carry inline markup and annotation tags) | yes (by default) | **mono-value** — array stored, only `[0]` used | Listed in `$components_monovalue`; one text block per language. `get_value()` strips tags (`strip_tags`) for plain rendering/search. |
| [`component_email`](../components/component_email.md) | an e-mail address as a plain string | yes | yes | Same envelope as `input_text`, with e-mail format validation client- and server-side. |
| [`component_password`](../components/component_password.md) | a **one-way Argon2id hash** of the user password | n/a — `lg-nolan` | mono-value | The `value` string is the *hash*, never the plaintext. See the security note below. |

All four extend `component_string_common` → `component_common`. `input_text`,
`text_area` and `email` are the "string components" branch; `component_password`
extends `component_common` directly but still writes to the `string` column.

!!! warning "Passwords are stored hashed"
    `component_password` runs the submitted value through `hash_password()`
    (Argon2id, one-way) in `set_data()` before persisting, so the `string`
    column holds the **hash**, not the plaintext. The value is masked
    (`fake_value`) on every user-facing path: `get_export_value()` and
    `get_diffusion_value()` emit the fake placeholder, never the stored hash.
    A value that is already a stored credential (legacy AES blob or a
    `password_hash()` output) is persisted verbatim so re-saving a record does
    not double-hash. Stored shape is identical to any other string item, e.g.
    `{"id":1,"lang":"lg-nolan","value":"$argon2id$v=19$..."}`.

!!! info "TS status"
    The TS server's own auth mechanism hashes/verifies credentials with
    Argon2id via `Bun.password` (`src/core/security/auth.ts`) — the same
    algorithm — but that is a separate, native TS session system (not
    PHP-session-compatible; see `rewrite/REWRITE_SPEC.md`), distinct from this
    `component_password` **data field**. The `component_password` descriptor
    (`src/core/components/component_password/descriptor.ts`) declares only its
    column/translation routing so far; the `set_data()` hashing hook and the
    `get_export_value()` / `get_diffusion_value()` `fake_value` masking
    described above are not yet ported — see `rewrite/STATUS.md` before relying on
    export/diffusion of a `component_password` field from the TS server.

!!! note "plain vs formatted"
    `component_input_text` is the **plain-text** field — no HTML is expected in
    its `value`. `component_text_area` is the **formatted / rich-text** field; its
    `value` may contain inline markup and Dédalo annotation tags, and its
    resolved/search forms run through `strip_tags`. Both store the exact same
    `{id, lang, value}` envelope in the same column.

---

## Server class

There is no dedicated "string value" class; the type *is* the item-envelope
contract enforced by the component layer over the shared `string` column:

- **`component_string_common`** — the base of `component_input_text`,
  `component_text_area` and `component_email`; adds the string-specific data
  handling on top of `component_common`.
- **`component_common`** — owns the universal item lifecycle: `set_data()`
  (normalizes scalar elements to `{value}` objects, mints missing ids via
  `set_data_item_counter()`), `get_data()` / `get_data_unchanged()`,
  `get_value()` (flattened display string via the
  [export atoms contract](../exporting_data.md)), and the `$components_using_value_property`
  / `$components_monovalue` registries.
- **`section_record_data`** — the typed-column container that holds the `string`
  column, resolves `component_*` → `string` through `$column_map`, and exposes
  `get_key_data('string', $tipo)` / `set_key_data('string', $tipo, …)`.
- **`component_password`** — overrides `set_data()` (Argon2id hashing) and the
  value/export/diffusion getters (fake-value masking).

In the TS server the equivalents are: the passive `MatrixRecord` struct plus
`readComponentItems()` / `resolveComponentValue()`
(`src/core/resolve/component_data.ts`) for the universal item lifecycle;
`getColumnNameByModel()` (`src/core/ontology/resolver.ts`) reading each
model's own `descriptor.column` instead of `section_record_data`; and the
per-model descriptors in `src/core/components/component_input_text/`,
`component_text_area/`, `component_email/`, `component_password/` (each a
`descriptor.ts`, no per-model class). `component_password`'s hashing/masking
overrides are not yet ported — see the "TS status" note above.

---

## Client-side model

The client receives string data inside the datum **`data`** layer (paired with
`context`), as the same array of `{id, lang, value}` envelopes the server
stores. In the component JS the items are held in `this.data.entries`:

```javascript
// this.data.entries — multi-value array of plain objects
// (component_input_text.js)
[
    { id: 1, value: "Alicia", lang: "lg-spa" },
    { id: 1, value: "Alicia", lang: "lg-eng" }
]
// each entry is { id: number|null, value: string, lang?: string }
// one entry per value item; translatable components hold one entry
// per language per item.
```

Because the component is instantiated **in one language**, it manages only that
language's slice of the data (a Català instance sees only the `lg-cat` entries).

Edits are sent back to the server as a **`changed_data`** object processed by
`update_data_value()` on save. Each change targets the stable item **`id`**
(not the array index), which is what makes edits robust to reordering and
pagination:

```json
{ "action": "insert", "id": null,  "value": { "value": "New", "lang": "lg-eng" } }
{ "action": "update", "id": "1",   "value": { "value": "Edited", "lang": "lg-eng" } }
{ "action": "remove", "id": "1",   "value": null }
```

`action` is one of `insert | update | remove | set_data | sort_data |
sort_by_column | add_new_element | force_save`. An `insert` with `id: null`
triggers a fresh server-minted id; a `remove` with `id: null` removes all items.

---

## Examples

### A translatable plain-text field (`component_input_text`)

Stored in the `string` column under tipo `rsc85`, two languages of the same
logical value (note the shared `id`):

```json
{
  "rsc85": [
    { "id": 1, "lang": "lg-spa", "value": "Personas" },
    { "id": 1, "lang": "lg-eng", "value": "People" }
  ]
}
```

### A multivalue field (two distinct values, two ids)

```json
{
  "rsc85": [
    { "id": 1, "lang": "lg-eng", "value": "first name"  },
    { "id": 2, "lang": "lg-eng", "value": "second name" }
  ]
}
```

### A non-translatable e-mail (`component_email`)

```json
{
  "dd123": [
    { "id": 1, "lang": "lg-nolan", "value": "alice@example.org" }
  ]
}
```

### A rich-text transcription (`component_text_area`, mono-value)

```json
{
  "oh25": [
    { "id": 1, "lang": "lg-spa",
      "value": "<p>Texto con <strong>formato</strong> y anotaciones.</p>" }
  ]
}
```

### A hashed password (`component_password`)

```json
{
  "dd230": [
    { "id": 1, "lang": "lg-nolan",
      "value": "$argon2id$v=19$m=65536,t=4,p=1$..." }
  ]
}
```

---

## v7 consolidation / evolution

- **One envelope for every string.** v7 unifies all text-like data on the single
  `{id, lang, value}` item shared with the other "value-property" types
  (`component_number`, `component_json`, …). String components are exactly the
  subset of `$components_using_value_property` that route to the `string` column.
- **Item `id` is now first-class.** The server-minted, never-recycled `id`
  replaces positional addressing: edits, [dataframe](../components/component_dataframe.md)
  pairing and Time Machine all key off the `id`, so reordering or paginating a
  multivalue string no longer breaks attachments.
- **Empty values preserved.** v7 keeps `{"value":""}` items instead of pruning
  them, so multivalue slots and dataframe positions survive an empty edit.
- **Passwords hardened.** Plaintext/reversible storage (legacy AES) gave way to
  one-way Argon2id hashing plus systematic `fake_value` masking on export and
  diffusion — the `string` item shape is unchanged, only the `value` contents
  and the getters changed.
- **`data`, not `dato`.** v7 drops the v6 term `dato`: the stored array is *data*,
  read via `get_data()`; the flattened display string is the *value*, via
  `get_value()`.

---

## See also

- [Sections — typed-column storage](../sections/index.md) — the `matrix` table,
  the typed JSONB columns and the model→column map.
- [`component_input_text`](../components/component_input_text.md) ·
  [`component_text_area`](../components/component_text_area.md) ·
  [`component_email`](../components/component_email.md) ·
  [`component_password`](../components/component_password.md) — the producing components.
- [Locator](../locator.md) — the contrasting item shape used by relation
  components (no `value`).
- [Exporting data](../exporting_data.md) — the `get_export_value()` atoms
  contract behind `get_value()`.
- [Glossary](../glossary.md) — tipo, model, lang, datum, ddo.
