# Geolocation values — the `geo` column

> **Data model series.** This page documents a Dédalo v7 **data type** — the
> JSON value shape as it is *stored*, independent of the component that produces
> it. For the field/UI object that creates this value, see
> [`component_geolocation`](../components/component_geolocation.md). For where
> these typed columns live, see [Sections — typed-column storage](../sections/index.md#storage-detail-the-data-column-is-split-into-typed-jsonb-columns).

## What it is

A **geolocation value** is a geographic position — a map center expressed as
latitude / longitude / zoom / altitude — optionally accompanied by the **vector
shapes** (points, circles, polygons, polylines) drawn over that position as
GeoJSON. It exists because a single coordinate pair is rarely enough for
cultural-heritage description: an excavation site has an extent (a polygon), a
findspot has a precise point, a survey transect is a polyline, a monument has a
viewshed radius. The value captures both the **map state** (center + zoom + alt)
and the **GeoJSON geometry** drawn on it, in a shape ready for mapping, spatial
queries and diffusion to GIS targets.

The value is **language-neutral**: it never carries `lg-*` keys. The producing
component forces `lang = DEDALO_DATA_NOLAN`, so a position is the same in every
interface language.

## Canonical JSON shape

The stored data is an **array of point items** (in practice one item — one map
per component). Each item is the map center plus optional drawn shapes in
`lib_data`:

```json
[{
  "id": 3,
  "lat": 41.562363,
  "lon": 2.012151,
  "zoom": 16,
  "alt": 0,
  "lib_data": [{
    "layer_id": 1,
    "layer_data": {
      "type": "FeatureCollection",
      "features": [{
        "type": "Feature",
        "properties": {"layer_id": 1},
        "geometry": {"type": "Point", "coordinates": [2.012151, 41.562363]}
      }]
    }
  }]
}]
```

The item fields:

| key | type | meaning |
| --- | --- | --- |
| `lat` | float | map center **latitude**, range `[-90, 90]` (human-facing, latitude first) |
| `lon` | float | map center **longitude**, range `[-180, 180]` |
| `zoom` | int | Leaflet zoom level (default `16`) |
| `alt` | int | altitude / elevation (default `0`) |
| `lib_data` | array | optional drawn shapes as GeoJSON layers (the rendering-library data) |
| `id` | int | per-item counter id (from the component `meta` counter) |

!!! warning "Coordinate order — read this twice"
    The item fields `lat`/`lon` are stored in **human order (latitude first)**.
    Inside `lib_data` the GeoJSON `geometry.coordinates` follow the **GeoJSON
    convention `[lon, lat]` (longitude first)**. The two orders coexist in the
    same value; do not swap them.

### The `lib_data` layers

`lib_data` is an array of **layers**. Each layer is `{layer_id, layer_data}`
where `layer_data` is a GeoJSON [`FeatureCollection`](https://datatracker.ietf.org/doc/html/rfc7946).
Every feature stamps its own `layer_id` into `properties`. Non-point shapes
carry extra `properties`:

```json
{
  "layer_id": 1,
  "layer_data": {
    "type": "FeatureCollection",
    "features": [
      {
        "type": "Feature",
        "properties": {"layer_id": 1},
        "geometry": {"type": "Point", "coordinates": [-17.879337, 28.760041]}
      },
      {
        "type": "Feature",
        "properties": {"layer_id": 1, "color": "#3388ff", "shape": "circle", "radius": 284.49},
        "geometry": {"type": "Point", "coordinates": [-17.879723, 28.760324]}
      }
    ]
  }
}
```

- `shape:"circle"` + `radius` (metres) describe a Leaflet circle (GeoJSON has no
  native circle, so it is encoded as a Point + `radius`).
- `color` is the stroke/fill colour of any drawn shape.

Layers exist so a transcription [`component_text_area`](../components/component_text_area.md)
can pair each drawn shape with a `geo` tag in the text — the layer is
loaded/removed as the tag is inserted/removed.

### Absence is structural — there is no magic coordinate

**A record with no position stores no geolocation item.** Emptiness is the
absence of a value, never a particular value:

| stored | meaning |
| --- | --- |
| no item for the component tipo | no position — nothing is resolved, nothing is published |
| `lat` / `lon` `null`, `undefined`, `""`, or unparseable text | no coordinate — the point is not built, and the missing axis is **never** completed with a zero |
| any finite `lat`/`lon`, **`0` included** | a real coordinate — `[0, 0]`, the equator and the prime meridian are legal positions and publish like any other |
| `lat`/`lon` as a JSON **string** (`"41.5"`) or **number** (`41.5`) | identical; both forms occur in the same column |

Both axes are required together: a point needs `lat` **and** `lon`.

!!! info "The opening camera is a view, never a value"
    Where the map *opens* when a record has no coordinate is server
    configuration — `DEDALO_GEO_DEFAULT_LAT` / `DEDALO_GEO_DEFAULT_LON` /
    `DEDALO_GEO_DEFAULT_ZOOM`, delivered to the editor as
    `context.features.default_view` (see [Configuration](../../config/config.md)).
    It is a camera position: it is never stored in the record and never
    published. Opening a record and saving it stores **no** coordinate.

!!! danger "Legacy data: the retired studio default"
    Earlier engines seeded the editor with `39.462571 / -0.376295` — the
    coordinates of the Dédalo facilities, shipped as the factory default map
    position — and treated that exact pair as "no location set". It is an
    ordinary coordinate now: a stored pair publishes as the place it is.
    Installs upgraded from those versions carry items centred on it that no
    cataloguer ever entered, and they must be repaired **before** the engine
    stops special-casing the pair; otherwise every one of them publishes the
    studio's position as a real location. The repair is
    `scripts/repair_geolocation_studio_default.ts` (dry-run by default;
    `--table` and `--user` are both mandatory, and `--apply` is refused on any
    table that has not been authorised in writing). It handles the two stores
    that carry the pair — the record store and the thesaurus store.

    Because the pair is a **factory default rather than a place**, an item
    holding it exactly is always fabricated: nobody positions a map on the
    studio to six decimals, and a genuinely geocoded record carries its own
    coordinates. Exact equality is therefore a safe test, and nothing correct
    is caught by it.

    The repair is **not reversible** — assume there is no Time Machine row to
    restore from.

!!! warning "The one coordinate the engine authors"
    The engine never invents a coordinate: only an operator's own entry is
    stored. The repair above takes **one** narrow, owner-approved exception
    (2026-08-09). For a sentinel-centred item that **also carries drawn
    geometry**, it neither keeps the fabricated pair nor clears it: it
    **derives** a new center as the bounding-box center of every feature across
    that item's `lib_data` layers, and rewrites the item with it — `zoom`,
    `alt`, `lib_data`, `id` and every other key preserved byte for byte. For a
    single drawn Point the derived center *is* that point, returned verbatim.
    This coordinate is **machine-derived from user-drawn geometry** and it is
    the only one the engine authors anywhere; it is recorded as such in the
    repair script's header and in the wire-contract ledger. It is not a
    location claim either: under *Geometry wins over the center* the derived
    value is framing, and the standalone publication path does not emit it. If
    the geometry yields no usable position the item is held untouched, never
    guessed.

### Geometry wins over the center

When an item carries **drawn geometry** — at least one `lib_data` layer whose
`layer_data.features` array is non-empty — the geometry **is** the record's
location, and the stored `lat`/`lon` are only the **framing**: where that
drawing is displayed from. Every publication path reads it that way, and the
standalone path drops `lat`/`lon` from what it emits (see
[Server-side handling](#server-side-handling)).

Two consequences follow, and both are intended:

- panning or zooming a record that holds drawn geometry updates its framing,
  and that is real curatorial work — not a fabricated coordinate, because
  nothing downstream reads it as a coordinate claim;
- a center stored beside geometry is never an asserted position, so no consumer
  can mistake framing for a coordinate somebody entered.

On a record with **no** geometry, `lat`/`lon` are exactly what they look like:
the recorded position.

## Database column

Geolocation values live in the typed **`geo`** JSONB column of the `matrix`
table (one row per record; see [Sections — the matrix table model](../sections/index.md#the-matrix-table-model)).
The mapping is resolved through `getColumnNameByModel('component_geolocation')`
(`src/core/ontology/resolver.ts`), which reads `column: 'geo'` off
`component_geolocation/descriptor.ts`.

### Keyed by component tipo (extra nesting)

Unlike most typed columns, the `geo` column value is **keyed by the originating
component tipo** — there is an extra object level around the item array:

```json
{
  "numisdata264": [
    { "lat": 41.562363, "lon": 2.012151, "zoom": 16, "alt": 0, "lib_data": [ /* … */ ] }
  ]
}
```

Because of this nesting, the GIN index and any search query reach the item
properties with a wildcard path that crosses both the tipo key and the array:

```sql
-- GIN index sample (src/core/db/db_pg_definitions.json)
SELECT * FROM matrix
WHERE jsonb_path_query_array(geo, '$.*[*]') @> '[{"lat":"42.31412288249575"}]'
LIMIT 10;
```

`$.*` walks the component-tipo keys and `[*]` walks the item array, yielding the
flat list of point objects to match `lat` / `lon` / `alt` against. The
`geo` column is one of the typed columns that PostgreSQL can index and query
independently of the rest of the record payload.

## Components that produce / use it

| component | role | translatable |
| --- | --- | --- |
| [`component_geolocation`](../components/component_geolocation.md) | the only producer — edits the position and shapes on a Leaflet map | no (`lg-nolan`) |

It is a **literal-direct** component: it owns its data, with no relation
locator, no media file and no language. The component never touches the
database directly — the write path
(`src/core/section/record/save_component.ts`) reads and writes the `geo`
column on its behalf.

## Server-side handling

There is no dedicated "geo value" class; the shape is produced and consumed
entirely through the generic item pipeline. The read side is
`readComponentItems()` / `resolveComponentValue()`
(`src/core/resolve/component_data.ts`); the `geo` column itself is declared in
`MATRIX_JSONB_COLUMNS` (`src/core/db/matrix.ts`) and the model→column entry
resolves from `component_geolocation/descriptor.ts` (`column: 'geo'`).

**Emptiness is enforced structurally, in every emitting path.**
`geojsonPointFallbackLayers()` (`src/diffusion/resolve/ddo_fns.ts`) builds a
point only when `lat` **and** `lon` both parse to a finite number (comma
decimals normalized first); `null`, `undefined`, `''` and unparseable text
yield no layer, and neither axis is ever defaulted to `0`. A stored `0` is a
coordinate and does build a point. `parser_geo::geojson`
(`src/diffusion/parsers/parser_misc.ts`) answers identically — see
[Diffusion parsers](../../diffusion/parsers.md). No coordinate pair is treated
as magic anywhere in the engine.

That fallback-point builder is wired into one specific diffusion path today:
a paired `component_text_area`'s `get_geojson_data` step
(`src/diffusion/resolve/resolver.ts`) publishes the linked
`component_geolocation`'s `lib_data` layers verbatim, falling back to a
single-point `FeatureCollection` built from `lat`/`lon` when `lib_data` is
empty (`buildGeojsonLayers()`, `src/diffusion/resolve/ddo_fns.ts`).

!!! warning "Standalone diffusion reshaping and search: not yet implemented"
    A **standalone** `component_geolocation` field (not paired with a
    text-area geo tag) diffuses as a raw `'geo'` atom
    (`src/diffusion/resolve/default_value.ts`) — it strips the item `id` but
    does **not** reshape the value into a GeoJSON `Point` or a layer-wrapped
    `FeatureCollection`; it carries essentially the storage shape. There is
    also no `geo`-family search builder yet — geolocation values cannot
    currently be matched by a search query.

That atom obeys both laws, per stored item and in this order:

1. **drawn geometry** → the geometry is published, and `lat`/`lon` are
   **removed** from the atom (`zoom`, `alt`, `lib_data` and any other key are
   kept verbatim). The stored center is framing, and a consumer reading `.lat`
   could not tell framing from an entered coordinate, so framing never reaches
   the wire as one;
2. else a **usable coordinate** (both axes parse, `0` included) → the point is
   published, `id` stripped, otherwise verbatim;
3. else **no atom at all**.

The two other emission paths — `parser_geo::geojson`
(`src/diffusion/parsers/parser_misc.ts`) and `buildGeojsonLayers`
(`src/diffusion/resolve/ddo_fns.ts`) — already published `lib_data` in
preference to the point; step 1 is what aligns the third one with them.

## Client-side model

In the [datum `data` layer](../request_config.md) the value reaches the browser
as the same item array, exposed on the component instance as
`self.data.entries`. Each entry is an `{lat, lon, zoom, alt, lib_data?}` object;
the drawn shapes live in `entries[0].lib_data`.

The component renders an interactive [Leaflet](https://leafletjs.com/) map with
the [Leaflet-Geoman](https://geoman.io/) draw editor
(`client/dedalo/core/component_geolocation/js/component_geolocation.js`). The
stored value maps onto Leaflet as follows:

```javascript
// the CAMERA (view only) — the stored coordinate when there is one,
// otherwise the server-configured default view. Never a stored value.
const map_data = self.get_view(0)
self.map = new L.Map(map_container, {
    center : new L.LatLng(map_data.lat, map_data.lon),   // (lat, lon)
    zoom   : map_data.zoom
})

// the default view, delivered by the server (DEDALO_GEO_DEFAULT_*)
self.default_view = self.context.features.default_view   // {lat:20, lon:0, zoom:2}
```

The component's **value** is a separate thing from the camera:
`self.get_stored_entry(0)` returns the stored item or `null` and never
fabricates one, so a record the user did not touch has no value to save. The
four coordinate inputs render empty on absence — and render `0` when the
stored coordinate *is* zero.

Notes on the client model:

- The map **never auto-saves** on pan/zoom; saving is always explicit via the
  save button, and the button only writes when something actually changed.
  Navigation is not data entry: on a record with **no** value at all, panning
  and zooming write nothing — there is nothing to frame. On a record that
  already holds a coordinate or drawn geometry, a pan or a zoom updates the
  framing and marks the component dirty, which is what makes re-framing your
  own drawing storable work.
- A record whose value is drawn geometry with **no** stored center opens fitted
  to the extent of that geometry, not on the world view — the camera is
  computed from the drawing (the same bounding-box rule the repair script uses)
  and is never stored.
- Editing the `lat`/`lon`/`zoom`/`alt` inputs recenters the map through a single
  non-animated camera move, so a typed coordinate is never overwritten by the
  animation settling afterwards.
- Each drawn `lib_data` layer becomes a Leaflet `L.FeatureGroup` keyed by
  `layer_id`; `layer_id` is also the overlay name in the layer control. The
  active layer defaults to `1` (`self.active_layer_id = 1`).
- Map libraries (Leaflet, Leaflet-Geoman, Turf for measurements, iro for the
  colour picker) are lazy-loaded on the first map build.
- The text-area `geo` tag form is `[geo-n-{id}-data:{…FeatureCollection…}:data]`;
  inserting/removing a tag loads/unloads the matching `lib_data` layer.

## Examples

### A point with a drawn circle

```json
{
  "numisdata264": [{
    "id": 3,
    "alt": 16,
    "lat": 28.760289075631214,
    "lon": -17.87981450557709,
    "zoom": 17,
    "lib_data": [{
      "layer_id": 1,
      "layer_data": {
        "type": "FeatureCollection",
        "features": [
          {
            "type": "Feature",
            "properties": {"layer_id": 1},
            "geometry": {"type": "Point", "coordinates": [-17.879337, 28.760041]}
          },
          {
            "type": "Feature",
            "properties": {"layer_id": 1, "color": "#3388ff", "shape": "circle", "radius": 284.49},
            "geometry": {"type": "Point", "coordinates": [-17.879723, 28.760324]}
          }
        ]
      }
    }]
  }]
}
```

### Import shapes

The import value is the bare data array (no lang keys). The model has its own
conform step (`src/core/tools/import_conform.ts`, reached through
`conformImportData()`), and all four documented shapes are converted into the
canonical item shape:

```json
// a full array of items — parses and passes through as-is
[{"lat": 39.4625, "lon": -0.3762, "zoom": 16, "alt": 0}]
```

```json
// a single bare item — wrapped into a one-item array
{"lat": 39.4625, "lon": -0.3762}
```

```json
// a bare GeoJSON FeatureCollection — the center is its first Point feature,
// the whole collection is stored as lib_data layer 1
{"type":"FeatureCollection","features":[{"type":"Feature","properties":{},"geometry":{"type":"Point","coordinates":[-0.3762,39.4625]}}]}
```

```text
a flat text cell, latitude first, dot decimals: lat, lon[, zoom[, alt]]
39.4625, -0.3762, 16
```

**Absence is structural at the import door too, and a refusal is not a clear.**
The import never fabricates a coordinate — no default center, no default
framing — and the three outcomes are kept distinct:

| the source cell | outcome |
| --- | --- |
| a usable item | stored |
| an item that **states** there is no location — both coordinate keys present and blank, or an item carrying a `lib_data` key — or an empty cell | the component is **cleared**: the source said so |
| anything else with no usable coordinate: one axis without the other, a typo'd header, `{}`, `{"zoom":12}` | **refused**, reported in the run's failed rows, and the stored value is left untouched |

An item with no coordinate but with drawn `lib_data` features is a value in its
own right and imports as geometry-only. `zoom` defaults to `16` and `alt` to
`0` on a coordinate item; comma decimals are normalized in the JSON shapes
(the flat cell uses the comma as its own separator, so it needs dot decimals);
and this is the one door that enforces the coordinate **ranges**
(`lat` −90..90, `lon` −180..180) — by refusing loudly, never by silently
dropping a value. A field with **any** refused value is not written at all,
including its values that did conform; the run report says so.

See the full import definition in
[Importing data](../importing_data.md#geolocation) and the round-trip raw format
in [Exporting data](../exporting_data.md#raw-export-and-round-trip).

## v7 consolidation / evolution

- **Typed column, not the legacy blob.** In v7 the position lives in its own
  GIN-indexed `geo` JSONB column rather than buried in a monolithic data blob,
  so it can be spatially queried (`jsonb_path_query_array(geo,'$.*[*]')`)
  without decoding the whole record. See
  [the typed-column storage model](../sections/index.md#storage-detail-the-data-column-is-split-into-typed-jsonb-columns).
- **Standard GeoJSON inside.** Drawn shapes are stored as plain GeoJSON
  `FeatureCollection`s under `lib_data` — no Dédalo-specific geometry format —
  which is what makes them reusable by the paired text-area geo-tag diffusion
  path (see [Server-side handling](#server-side-handling)).
- **Single-point-per-component model.** Although the value is an array, the
  editor manages one map (key `0`); multiple positions are expressed as multiple
  GeoJSON features inside `lib_data`, not as multiple array items.
- **No magic coordinate.** Emptiness is the absence of a value, not a reserved
  position: an untouched map stores nothing, so no place on earth is
  unrecordable and `0` is a legal coordinate. The opening camera moved out of
  the data and into configuration (`DEDALO_GEO_DEFAULT_LAT` /
  `DEDALO_GEO_DEFAULT_LON` / `DEDALO_GEO_DEFAULT_ZOOM`), delivered as
  `context.features.default_view` — a view, operator-configurable per install
  and per component, never a value.
- **Geometry wins over the center.** Where an item carries drawn shapes, those
  shapes are the location and the stored center is only framing; the three
  publication paths now agree on that, and the standalone one drops the center
  rather than letting a consumer read framing as a coordinate.

## See also

- [`component_geolocation`](../components/component_geolocation.md) — the
  producing component (Leaflet/Geoman editor, properties, render views).
- Sibling data-model pages — [media values](media.md) · [IRI values](iri.md) ·
  [misc values](misc.md) · [meta counters](misc.md#the-meta-column).
- [Sections — typed-column storage](../sections/index.md#storage-detail-the-data-column-is-split-into-typed-jsonb-columns)
  — how `geo` and the other typed columns are split out of the record payload.
- [Importing data](../importing_data.md#geolocation) ·
  [Exporting data](../exporting_data.md#raw-export-and-round-trip) — the import
  shapes and round-trip raw format.
