# The value item

> See also: [Sections — typed-column storage](../sections/index.md) ·
> [`section_record`](../sections/section_record.md) ·
> [Locator](../locator.md) · [Components](../components/index.md)

The **value item** is the atomic unit of stored data in Dédalo v7. Every
component's value — text, a date, an IRI, a media reference, a relation — is an
**array of value items**, and each item is a small object built around three
recurring keys: a server-minted `id`, an optional `lang`, and the payload. This
page documents the envelope itself: its shape, the meaning of each key, how the
payload changes per data type, raw vs. resolved access, and the `changed_data`
edits the client sends back on save.

This is a **data-type** page: it is about the *format* of the value, not about
any one component. For where these items physically live (the typed JSONB
columns of the `matrix` table) see [Sections](../sections/index.md); for how a
component reads and writes its slice see [`section_record`](../sections/section_record.md).

---

## 1. What it is

In classical SQL a field holds **one scalar**: a `name` column holds `"Alicia"`.
Dédalo never stores a bare scalar. A component's value for one record is
**always an array**, and every position in that array is a self-describing
**value item**:

```json
[
  { "id": 1, "lang": "lg-spa", "value": "L'Horta Sud" }
]
```

Why an array of self-describing items, even for a "single value" field?

- **Multivalue by default.** A component may hold several values
  (several names, several links). Even a *mono-value* component stores `[item]`
  — an array of one — never the scalar itself. (The registry
  `component_common::$components_monovalue` lists the models that keep an array
  but only ever read `[0]`.)
- **Multilingual.** A translatable component interleaves one item *per language*
  in the same flat array; the `lang` key tells them apart.
- **Stable addressing.** The `id` gives every item a permanent identity, so
  edits, dataframe attachments and Time Machine references survive reordering,
  pagination and re-saves.
- **Empty positions are real.** `{"value":""}` or `{"value":null}` are kept on
  purpose (never pruned), so a multivalue slot — and any dataframe attached to
  its `id` — survives.

!!! info "The item is the row of a component"
    Where the [section](../sections/index.md) is the row of the `matrix`
    table, the value item is the row *inside* a component's value. A
    component value is a little table of items keyed by `id`.

---

## 2. Canonical JSON shape

The consolidated v7 envelope is `{ id, lang?, <payload> }`. The shape of the
*payload* is what differs between data types.

### Literal "value-property" items

The models in `component_common::$components_using_value_property` carry their
payload under an explicit **`value`** key:

```json
{ "id": 1, "lang": "lg-eng", "value": "Hello world" }
```

```text
component_email · component_filter_records · component_info ·
component_input_text · component_json · component_number ·
component_password · component_text_area
```

Source: `component_common::$components_using_value_property`
(`core/component_common/class.component_common.php`).

For these models `value` is a **scalar** (string or number), except
`component_json`, whose `value` is whatever JSON was stored.

### Structural items (date, iri, geo, media)

Structural components do **not** use a `value` wrapper. The payload fields are
flattened directly onto the item, *next to* `id` (and `lang` when translatable).

An **IRI** item (`component_iri`, stored in the `iri` column):

```json
{ "id": 1, "iri": "https://dedalo.dev", "title": "Dédalo web site" }
```

A **date** item (`component_date`, stored in the `date` column — always
`lg-nolan`; range mode shown):

```json
{
  "start": { "year": 2012, "month": 11, "day": 7, "time": 64638475292 },
  "end":   { "year": 2012, "month": 12, "day": 8, "time": 64641254135 }
}
```

A **geolocation** item (`component_geolocation`, stored in the `geo` column —
always `lg-nolan`, GeoJSON-shaped):

```json
{
  "type": "FeatureCollection",
  "features": [
    { "type": "Feature", "properties": {},
      "geometry": { "type": "Point", "coordinates": [-0.36, 39.46] } }
  ]
}
```

A **media** item (`component_image` and the other media models, `media` column)
carries `id`, a `quality` map and file metadata directly on the item.

!!! warning "Structural payloads are not under `value`"
    Only the eight `components_using_value_property` models wrap their payload
    in a `value` key. `component_date`, `component_iri`,
    `component_geolocation` and the media components flatten their payload
    fields directly onto the item object. Do not assume
    `item.value` exists for those types.

### Relation items (locators)

Relation components store a [**locator**](../locator.md) as the item — there is
no `value` key. The locator minimally is:

```json
{ "type": "dd151", "section_tipo": "es1", "section_id": 3896,
  "from_component_tipo": "rsc91" }
```

A translatable relation also carries `lang`; an `id` is **optional** and is used
for dataframe pairing and ordering.

Source: `component_relation_common` class header
(`core/component_relation_common/class.component_relation_common.php`):
*"Each locator object minimally has `{ section_tipo, section_id, type,
from_component_tipo }`. Translatable relation components also carry a `lang`
key. `id` is an optional stable item id used for dataframe pairing and
ordering."*

### Summary of the envelope

| key | type | present when | meaning |
| --- | --- | --- | --- |
| `id` | int | minted on save for non-relations; optional on relations | stable per-item identity within the component value |
| `lang` | string | translatable components | `lg-xxx` or `lg-nolan` |
| `value` | scalar / JSON | only the 8 value-property models | the literal payload |
| (flattened payload) | object fields | date / iri / geo / media | `iri`+`title`, `start`/`end`, GeoJSON, media metadata |
| (locator fields) | `type`, `section_tipo`, `section_id`, `from_component_tipo` | relation components | the [locator](../locator.md) pointing at another record |

---

## 3. The `id` — server-minted, stable, unique within the component

`id` is an **integer**, **unique within this component's items in this record**,
**server-minted**, and **never recycled**.

- It is the pairing key for **dataframes** — uncertainty, qualifiers and context
  attach to a main item by its `id` (the unified `id_key` contract; see
  [`component_dataframe`](../components/component_dataframe.md)).
- It is the reference key for **Time Machine** playback.
- It is the **addressing key for client edits**: `update` / `remove` target an
  item by `id`, not by array index — which is what makes editing robust to
  reordering and pagination.

### Minting

When `component_common::set_data($data)` runs, each item lacking a valid id is
given one. "Valid id" is exactly:

```php
$has_id = property_exists($element, 'id') && $element->id !== null && $element->id !== '';
```

Items without one go through `set_data_item_counter()`, which calls
`section_record::allocate_component_ids($tipo, 1)`. Allocation is **atomic**: a
PostgreSQL session advisory lock keyed by
`table_section-tipo_section-id_tipo` guards a re-read of the persisted counter
in `meta->$tipo->0->count`, takes `max(persisted, in_memory)`, persists the new
counter immediately, and returns the freshly allocated range. The counter lives
in the [`meta` column](../sections/index.md).

### Absorbing explicit ids (imports, migrations, restores)

Items that already carry an `id` (from an import, a migration, or restored data)
keep it. `set_data()` collects every incoming id and raises the counter to their
maximum:

```php
if (!empty($ar_id)) {
    $max_id = max($ar_id);
    if ($this->get_counter() < $max_id) {
        $section_record->raise_component_counter($this->tipo, $max_id);
    }
}
```

Because ids are never recycled, dataframe `id_key` pairings and Time Machine
references stay valid across edits and reorderings.

---

## 4. The `lang` dimension

Translation is governed by the component flag
`component_common::$supports_translation` (independent of the ontology
`$translatable` flag).

- **Non-translatable** (`supports_translation === false`): language methods
  collapse to the full-data path, and the single item uses `lg-nolan`
  (`DEDALO_DATA_NOLAN`). `component_date` and `component_geolocation`, for
  example, always store `lg-nolan`.
- **Translatable**: the array holds one logical position **per language**, all
  interleaved in the same flat array. `get_data_lang($lang)` filters by
  `el->lang === $lang`:

  ```php
  return (isset($el->lang) && $el->lang === $safe_lang);
  ```

`get_id_from_key()` / `get_key_from_id()` bridge the flat
`[{id,lang,value}]` array and the per-language array positions (grouping by
`lang`, then indexing by key position) — this is how the same logical value
shares one `id` across all its language variants.

```json
[
  { "id": 1, "lang": "lg-eng", "value": "South Horta" },
  { "id": 1, "lang": "lg-spa", "value": "Huerta Sur" },
  { "id": 1, "lang": "lg-cat", "value": "L'Horta Sud" }
]
```

!!! note "Same `id`, different `lang`"
    The three rows above are the *same* logical value in three languages, so
    they share `id: 1`. Inserting a translation reuses the id resolved from the
    other languages at the same key position
    (`update_data_value` → `get_id_from_key`).

---

## 5. Database column and keying

A value item never floats free: it lives inside a **typed JSONB column** of the
record's `matrix` row, and inside that column it is one of an **array keyed by
component tipo**. Which column depends on the component model, resolved through
`section_record_data::$column_map` (`get_column_name($model)`), not hardcoded per
component. See [Sections — typed-column storage](../sections/index.md) for the
full table.

| component model | column | item carries |
| --- | --- | --- |
| `component_input_text`, `component_text_area`, `component_email`, `component_password` | `string` | `{id, lang?, value}` |
| `component_number` | `number` | `{id, value}` |
| `component_date` | `date` | `{id?, start, end?, …}` (`lg-nolan`) |
| `component_iri` | `iri` | `{id, iri, title}` |
| `component_geolocation` | `geo` | GeoJSON item (`lg-nolan`) |
| `component_image`/`av`/`pdf`/`3d`/`svg` | `media` | media item (`id`, `quality`, …) |
| `component_json`, `component_info`, `component_security_access`, `component_filter_records`, `component_inverse` | `misc` | direct object |
| `component_select`, `component_check_box`, `component_radio_button`, `component_portal`, `component_relation_*`, `component_filter`, `component_dataframe` | `relation` | [locator](../locator.md) |

The per-component id counter lives in the `meta` column, e.g.
`{"dd750":[{"count":3}], "dd201":[{"count":1}]}`.

Inside a column the data is keyed by **component tipo**:

```json
// the `string` column of one record
{
  "rsc85": [ { "id": 1, "lang": "lg-spa", "value": "Alicia" } ],
  "rsc86": [ { "id": 1, "lang": "lg-spa", "value": "Gutierrez" } ]
}
```

```json
// the `iri` column of one record
{
  "dd85": [ { "id": 1, "iri": "https://dedalo.dev", "title": "Dédalo web site" } ]
}
```

So the full address of a single value item is
**`(section_tipo, section_id)` → column → component tipo → array index by `id`**.

---

## 6. Components that produce / use the item

Every data-bearing component produces value items; the envelope's variant
depends on the component family:

- **Value-property literals** —
  [`component_input_text`](../components/component_input_text.md),
  [`component_text_area`](../components/component_text_area.md),
  [`component_email`](../components/component_email.md),
  [`component_password`](../components/component_password.md),
  [`component_number`](../components/component_number.md),
  [`component_json`](../components/component_json.md),
  [`component_info`](../components/component_info.md),
  [`component_filter_records`](../components/component_filter_records.md) —
  produce `{id, lang?, value}`.
- **Structural literals** —
  [`component_date`](../components/component_date.md),
  [`component_iri`](../components/component_iri.md),
  [`component_geolocation`](../components/component_geolocation.md) —
  flatten their payload onto the item.
- **Media** —
  [`component_image`](../components/component_image.md),
  [`component_av`](../components/component_av.md),
  [`component_pdf`](../components/component_pdf.md),
  [`component_3d`](../components/component_3d.md),
  [`component_svg`](../components/component_svg.md) — media items.
- **Relations** — every component extending
  [`component_relation_common`](../components/component_relation_model.md)
  (select, check_box, radio_button, portal, relation_parent/children/related,
  filter, dataframe) — store [locators](../locator.md).

---

## 7. Raw `data` vs. resolved `value` (server class)

There is no single "value item" PHP class; the envelope is a plain `stdClass`.
The relevant API lives on `component_common`
(`core/component_common/class.component_common.php`). Two distinct notions:

- **Raw stored data** — the array of value items exactly as persisted, returned
  by `get_data()` (the component-level accessor over the section record's typed
  column). `get_data_lang($lang)` filters that array by language. The unguarded
  internal copy used for save-time diffing is `get_data_unchanged()`. Raw data
  for a relation is the **locator** — it is *not* dereferenced.

  ```php
  $data = $component->get_data();        // [ {id, lang?, value|…|locator}, … ]
  $data = $component->get_data_lang('lg-eng');
  ```

- **Resolved value** — `get_value()` returns the **flattened display string**,
  delegating to the atoms export contract:

  ```php
  public function get_value() : ?string {
      return $this->get_export_value()->to_flat_string();
  }
  ```

  For relations this **dereferences** each locator into its label; raw
  `get_data()` never does. `get_grid_value()` is the client visual-cell adapter
  over the same atoms.

!!! note "On the v6 term *dato*"
    Older (v6) code called the raw value *`dato`* and accessed it via
    `get_dato()`. **v7 uses `data`** — the accessor is `get_data()`; there is no
    `get_dato()` on `component_common`. A few class-header comments still read
    "GET DATO" as legacy prose, but the live method is `get_data()`.

---

## 8. Client-side model — how `datum.data` carries the items

The server sends a component to the client as a **datum**: a JSON object with
two properties, `context` (the structure/ontology) and `data` (the value). See
[Components — Datum](../components/index.md#datum) and the
[context/data layers](../request_config.md).

```json
{
  "context": { /* model, tipo, view, properties, permissions, … */ },
  "data": {
    "section_id": "1",
    "section_tipo": "rsc197",
    "tipo": "rsc85",
    "lang": "lg-spa",
    "value": [
      { "id": 1, "lang": "lg-spa", "value": "Alicia" }
    ],
    "changed_data": []
  }
}
```

`datum.data.value` is the **array of value items** — the same `{id, lang?,
value|locator}` envelopes the server stores. In the JS component instance this
array becomes `self.data.entries`
(`core/component_common/js/component_common.js`): `get_value()` returns
`this.data.entries`, and `update_data_value()` resolves the item to edit by
matching `entry.id === changed_id` — id-keyed, never index-keyed:

```javascript
const idx = self.data.entries?.findIndex(entry => entry?.id === changed_id)
```

`datum.data.changed_data` starts empty and accumulates the edits the user makes.

---

## 9. The `changed_data` shape sent on save

Edits travel back to the server as a **`changed_data`** array of change objects.
Each object is processed by `component_common::update_data_value()`
(`core/component_common/class.component_common.php`), dispatched on `action`:

```text
insert | update | remove | set_data | sort_data |
sort_by_column | add_new_element | force_save
```

A change object carries:

- **`action`** — one of the above.
- **`id`** — the **stable item id** targeted. `null` on `insert` (a new id is
  minted on save); `null` on `remove` removes all.
- **`value`** — the payload: a single value item, an array for `set_data`, or
  `null`.

```json
// insert a new value (id minted server-side on save)
{ "action": "insert", "id": null, "value": { "value": "New", "lang": "lg-eng" } }
```

```json
// update an existing item, addressed by its stable id
{ "action": "update", "id": "1", "value": { "id": 1, "lang": "lg-eng", "value": "Edited" } }
```

```json
// reorder (move item from key 0 to key 2)
{ "action": "sort_data", "source_key": 0, "target_key": 2 }
```

On save, `set_data()` snapshots the prior state into `$db_data` (a JSON clone) so
the diff against the new data drives **Time Machine** versioning;
`get_time_machine_data_to_save()` merges the component's language slice with all
its dataframe items under the main tipo (reverse-split on TM playback).
Targeting items by `id` (not array index) is what keeps these edits correct
across reordering and pagination.

!!! info "Why id-targeting matters"
    A user may reorder or paginate before saving. Because `changed_data`
    references items by their stable `id`, an `update` still lands on the right
    item even though its array position changed since it was loaded.

---

## 10. v7 consolidation / evolution

- **One envelope for everything.** v7 consolidated the per-component data shapes
  onto a single `{id, lang?, payload}` item. The `value`-key form is now a
  registry (`components_using_value_property`) rather than ad-hoc per-component
  logic; structural and relation items flatten their payload instead.
- **Server-minted, never-recycled ids.** The atomic, advisory-locked counter in
  the `meta` column replaced fragile index/position addressing. This is the
  backbone of the unified dataframe `id_key` contract and Time Machine.
- **`data` not `dato`.** The raw value is `data` (`get_data()`); the v6 `dato` /
  `get_dato()` naming is retired (a few header comments still say "dato").
- **Raw vs. resolved split via the atoms contract.** `get_value()` and
  `get_grid_value()` both route through `get_export_value()`, so display
  resolution (locator dereferencing, media URLs) is one parity-tested path,
  separate from raw `get_data()`.
- **Empty values preserved.** v7 deliberately keeps `{"value":""}` /
  `{"value":null}` so multivalue positions and dataframe attachments survive.

---

## See also

- [Sections — typed-column storage](../sections/index.md) — which JSONB column a
  component model writes to, keyed by component tipo.
- [`section_record`](../sections/section_record.md) — the per-record typed-column
  container, id allocation, and save path.
- [Locator](../locator.md) — the pointer that *is* a relation component's value
  item.
- [`component_dataframe`](../components/component_dataframe.md) — how frame
  records pair to a main item by its `id` (the `id_key` contract).
- [Components — Datum / data / context](../components/index.md#datum) — the
  server→client transport this page's items ride inside.
- [Request config](../request_config.md) — how `context` + `data` are built and
  delivered.
