# IRI value (`iri` column)

> Part of the [data model](index.md) family — the typed JSONB storage shapes
> Dédalo writes into the `matrix` table. See
> [Sections → typed-column storage](../sections/index.md#storage-detail-the-data-column-is-split-into-typed-jsonb-columns)
> for where this column lives, and [`component_iri`](../components/component_iri.md)
> for the component that produces it.

## What it is

The **IRI value** is the stored form of an *Internationalized Resource
Identifier* — a web address (`http://` / `https://`), a persistent identifier,
or any external authority/resource link, optionally paired with a
human-readable label.

It exists so that cultural-heritage records can reference **external**
authorities and resources (Wikidata, VIAF, GeoNames, nomisma, Getty AAT/ULAN,
a museum's public catalogue page, an external IIIF/image URL) as a *typed* link
rather than as plain text. Typing the link lets Dédalo validate the protocol,
render it as a clickable anchor, pair it with a structured label, and publish it
through diffusion as a real resource identifier.

This is distinct from a relation value such as a portal/select
[locator](../locator.md): an IRI points **out of** the system at an external
URL, whereas a relation points **at another Dédalo record**.

!!! warning "Not `{title, uri}`"
    Some older in-tree comments (e.g. in `section_record_data`) and an earlier
    line in the [sections overview](../sections/index.md) describe this column as
    holding `{title, uri}` objects. **That shape is not what is stored.** There is
    no `uri` property anywhere in the producing code; the canonical property is
    `iri`, and values are an **array of objects** (not a single object). The
    schema below — the `dd_iri` DTO — is authoritative.

## Canonical JSON shape

Each value is one `dd_iri` object. The stored value is an **array** of them.

```json
[
    {
        "id"    : 1,
        "iri"   : "https://dedalo.dev",
        "title" : "Dédalo website",
        "lang"  : "lg-nolan"
    }
]
```

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `iri` | `string` | **yes** | The URL, **with** protocol. Validated server-side with `parse_url()` (scheme + host required) and client-side with a strict `https?://` + hostname check. |
| `id` | `int` | yes (persisted rows) | Per-item counter, minted server-side. It is the **pairing key** for the title label dataframe and for the per-language variants of the same value. |
| `title` | `string` | optional | A literal label. **Deprecated as stored data** (since 6.8.0): new labels live in the paired label dataframe; the literal `title` is kept readable as a fallback for legacy rows. |
| `lang` | `string` | optional | The language marker of the item. Present because `component_iri` keeps per-language versions; the default/main value is `lg-nolan`. |

A fifth field, `label_id`, exists only on the [`dd_iri`](#server-class-dd_iri)
DTO as an **import-only** carrier and is never persisted (see
[Import / interop](#import--interop)).

### Language versions (`with_lang_versions`)

`component_iri` is **non-translatable by default** (`translatable = false`,
forced in the constructor) and stamps its data `lg-nolan`. But it also sets
`with_lang_versions = true`, so it behaves like a transliterated component: the
main value lives under `lg-nolan` and the user may add per-language variants.
The variants of one value **share the same `id`**:

```json
[
    { "id": 1, "iri": "https://es.wikipedia.org/wiki/Arse",     "lang": "lg-spa" },
    { "id": 1, "iri": "https://ca.wikipedia.org/wiki/Saguntum", "lang": "lg-cat" },
    { "id": 1, "iri": "https://dedalo.dev",                     "lang": "lg-nolan" }
]
```

When instantiated for a given language the component returns the items for that
language and surfaces the others as `transliterate_value` so the UI can show the
alternates.

## Database column

The value is stored in the `matrix` typed JSONB column named **`iri`**. In PHP
this routing is `section_record_data::$column_map['component_iri'] => 'iri'`;
the TS server resolves it through `getColumnNameByModel('component_iri')`
(`src/core/ontology/resolver.ts`), which reads `column: 'iri'` off
`component_iri/descriptor.ts`.

Inside the column the array is **keyed by the producing component tipo** (an
extra level of nesting), so a row's `iri` column looks like:

```json
{
    "rsc217": [
        { "id": 1, "iri": "https://dedalo.dev", "title": "Dédalo website", "lang": "lg-nolan" }
    ]
}
```

The search engine therefore queries with JSONB path expressions rooted at the
component tipo:

```text
$.{component_tipo}[*] ? (@.lang == "lg-eng" && @.iri != "" && @.iri != null)
```

and a containment test like `iri @> '[{"iri":"https://dedalo.dev"}]'` matches a
record holding that URL. See [`trait.search_component_iri.php`](../components/component_iri.md#search-operators)
for the full operator set.

## Components that produce / use it

| Component | Role |
| --- | --- |
| [`component_iri`](../components/component_iri.md) | The **only** producer. A literal-direct component: it stores its own final value (the URL + optional label) and does not resolve through a relation. |

The component **auto-injects** a fixed `component_dataframe` for the structured
title (slot tipo `dd560` = `DEDALO_COMPONENT_IRI_LABEL_DATAFRAME`, target
section `dd1706` / component `dd1715`) into its `source.request_config`. That
dataframe stores the real titles; it is *paired* to each IRI value by the shared
item `id`, not stored in the `iri` column itself. See
[`component_dataframe`](../components/component_dataframe.md). The TS read
pipeline ports this same dd560 auto-injection — `src/core/section/read.ts`
explicitly emits the `dd560` structure-context slot whenever the resolved
model is `component_iri`, mirroring the PHP `get_properties()` injection.

## Server class (`dd_iri`)

The per-item DTO is `dd_iri` (`core/component_iri/class.dd_iri.php`), a thin
`stdClass` subclass that defines and validates the value schema:

```php
class dd_iri extends stdClass {
    public ?string $iri      = null; // mandatory; set_iri() validates scheme + host
    public ?string $title    = null; // optional literal label (deprecated)
    public ?int    $id       = null; // per-item counter / pairing key
    public ?int    $label_id = null; // import-only; NOT persisted
}
```

- `__construct(?object $data)` walks the incoming object and calls a `set_*`
  method per key; **unknown properties are rejected** (logged and dropped), so a
  stray `uri` key would never make it into the value.
- `set_iri()` runs `parse_url()` and logs an error if `scheme` or `host` is
  missing.
- `set_id()` / `set_label_id()` cast to `int`.
- `set_label_id()` is documented as *"not part of data schema … this property is
  not saved"* — it only tells the import process which section id the title-label
  dataframe should target.

Title resolution lives on the component, not the DTO.
`component_iri::resolve_title($value)` pairs the value with its label dataframe
**by the item `id`** and returns the dataframe value, falling back to the literal
`title` (and to `null`) for old rows that have no `id`:

```php
// rows without id cannot pair a frame (very old data): literal fallback
if (!isset($value->id)) {
    return $value->title ?? null;
}
$component_dataframe_label = $this->get_dataframe_instance(
    (int)$value->id,                       // item id (pairing key)
    DEDALO_COMPONENT_IRI_LABEL_DATAFRAME    // dataframe slot tipo (dd560)
);
$title = $component_dataframe_label?->get_value() ?? $value->title ?? null;
```

`get_diffusion_data()` clones each value and sets the resolved `title` on the
clone (never written back into live data) so published output carries both the
URL and its label.

!!! info "TS status"
    There is no ported `dd_iri` DTO class — the item stays a plain object
    validated only by the client's own `check_iri_value()` (unchanged, since
    the JS client is copied as-is). The `id`-keyed pairing to the `dd560` label
    dataframe is wired into the structure context (see above), but the
    `set_iri()` scheme/host validation and unknown-property rejection the DTO
    performs server-side on write are not yet ported to the TS save path; see
    `rewrite/STATUS.md`.

## Client-side model

On the client the value reaches the browser inside the datum **`data`** layer of
the `component_iri` instance (`core/component_iri/js/component_iri.js`):
`this.data` is the same array of `dd_iri`-shaped objects described above
(`{id, iri, title, lang}`), surfaced by the request-config context/subcontext
flow alongside the rest of the record. Save / change-data behaviour is inherited
from `component_common` (`update_data_value`, `update_datum`, `change_value`,
`set_changed_data`).

The IRI input validates on `change` with `check_iri_value()`: it builds a
`new URL(value)`, requires `http:` / `https:`, and sanity-checks the hostname;
invalid input gets an `error` class. (Note: the `uri` *variable* in that check is
a transient `URL` parse object — it is **not** a stored field.) A per-value
"Link" button opens the URL in a new window with `rel="noopener noreferrer"` and
`opener = null` to prevent reverse tabnabbing. In list / read views the value is
rendered as an anchor whose text is the resolved title:

```html
<a href="https://dedalo.dev" rel="noopener noreferrer">Dédalo website</a>
```

## Examples

A single, default (non-translatable) link with a structured title:

```json
{
    "rsc217": [
        { "id": 1, "iri": "https://dedalo.dev", "title": "Dédalo website", "lang": "lg-nolan" }
    ]
}
```

A value with per-language variants (same `id`):

```json
{
    "rsc217": [
        { "id": 1, "iri": "https://es.wikipedia.org/wiki/Arse",     "lang": "lg-spa" },
        { "id": 1, "iri": "https://ca.wikipedia.org/wiki/Saguntum", "lang": "lg-cat" },
        { "id": 1, "iri": "https://dedalo.dev",                     "lang": "lg-nolan" }
    ]
}
```

The matching `meta` counter that minted those item `id`s (written by
`component_common::save()` — see [Meta (id counters)](misc.md#the-meta-column)):

```json
{ "rsc217": [{ "count": 1 }] }
```

## Import / interop

`conform_import_data()` accepts several shapes:

- the **v7 array of objects** (one per value, `iri` mandatory):
  `[{ "iri": "https://dedalo.dev", "title": "Dédalo website" }]`;
- a **lang-keyed** map for the language-version capability:
  `{ "lg-spa": [{ "iri": "https://es.wikipedia.org/wiki/Arse" }] }` (a bare
  string `"lg-spa": "https://…"` is also accepted);
- plain-text CSV strings: a single URL `https://dedalo.dev`, a label + URL split
  on `fields_separator` (`dédalo, https://dedalo.dev`), or several values joined
  with `records_separator`.

!!! note "`id` and `label_id` on import"
    `id` **may** be set explicitly on import — it is the documented exception to
    the "omit `id`" rule, because it pairs the value with its title-label
    dataframe. `label_id` is an import-only carrier: the leading token of a
    flat string (a numeric section id, or a string label matched/created in the
    dataframe value list) becomes the `label_id`, which `import_save()` consumes
    to build the dataframe locator (`set_id_key` by the value `id`). `label_id`
    is then `unset` and **never stored** on the value.
    The deprecated literal `title` is still accepted on import but ignored.

For the full import grammar see [Importing data → URI](../importing_data.md#uri);
for export, `get_export_value()` emits one atom per value with
`cell_type: "iri"`, joining `iri` + resolved title with `fields_separator`
(see [Exporting data](../exporting_data.md)).

## v7 consolidation / evolution

- **Flat array, not a `{lg-xxx:[…]}` map.** v7 stores all variants of all values
  as one flat array, carrying the `lang` on each item, paired across languages by
  the shared `id`. This replaces the older per-language nested map.
- **Title moved to a paired dataframe.** The literal `title` on the value is
  deprecated; the canonical title is now structured data in the injected label
  dataframe (`dd560`), resolved at read time by `resolve_title()` via the item
  `id`. The literal `title` remains a read fallback until the
  title-materialization migration runs across legacy data.
- **Strict DTO.** Routing every value through `dd_iri` (with unknown-property
  rejection and `parse_url()` validation) is what keeps the column clean and is
  why the stale `{title, uri}` comments do not reflect reality — a `uri` key
  would simply be dropped.

## See also

- [Data model overview](index.md) — all typed-column value shapes.
- [`component_iri`](../components/component_iri.md) — the producing component
  (properties, views, search operators, import/export).
- [`component_dataframe`](../components/component_dataframe.md) — where the
  structured title is stored and how the `id_key` pairing works.
- [Sections — typed-column storage](../sections/index.md#storage-detail-the-data-column-is-split-into-typed-jsonb-columns)
  — how the `iri` column sits inside the `matrix` row.
- [Importing data → URI](../importing_data.md#uri) ·
  [Exporting data](../exporting_data.md).
