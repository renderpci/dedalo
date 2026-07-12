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

### Default-value sentinel

When a value has never been set, the client seeds the map with the project home
(Valencia):

```json
{"lat": 39.462571, "lon": -0.376295, "zoom": 16, "alt": 0}
```

The server treats this exact center as **"no value"**: `get_latitude()` /
`get_longitude()` return `null` for `lat === "39.462571"` /
`lon === "-0.376295"`, and `get_diffusion_value_as_geojson()` returns `null` for
it — so an untouched map is never published as a real location. The match is on
**latitude/longitude only**; the sentinel `zoom`/`alt` are not part of the test
(a legacy comment in the diffusion path notes a `zoom 12 / alt 16` default for
the same center).

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
  "rsc120": [
    { "lat": 41.562363, "lon": 2.012151, "zoom": 16, "alt": 0, "lib_data": [ /* … */ ] }
  ]
}
```

Because of this nesting, the GIN index and any search query reach the item
properties with a wildcard path that crosses both the tipo key and the array:

```sql
-- GIN index sample (src/core/db/db_pg_definitions.json)
SELECT * FROM matrix
WHERE jsonb_path_query_array(geo, '$.*[*]') @> '[{"lat":"39.462571"}]'
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

**The sentinel "no value" guard IS implemented**: `geojsonPointFallbackLayers()`
(`src/diffusion/resolve/ddo_fns.ts`) recognises the exact Valencia center
(`lat === '39.462571' && lon === '-0.376295'`, after normalizing comma
decimals) and returns no layer for it, so an untouched map is never turned
into a real-location point.

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
    `FeatureCollection`; it carries the same `{lat, lon, zoom, alt, lib_data?}`
    shape as storage. There is also no `geo`-family search builder yet —
    geolocation values cannot currently be matched by a search query.

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
// the value item → Leaflet map state
const entries  = self.data.entries || [self.default_value]
const map_data = {
    x    : entries[0].lat,   // L.LatLng first arg  = latitude
    y    : entries[0].lon,   // L.LatLng second arg = longitude
    zoom : entries[0].zoom,
    alt  : entries[0].alt
}
self.map = new L.Map(map_container, {
    center : new L.LatLng(map_data.x, map_data.y),   // (lat, lon)
    zoom   : map_data.zoom
})

// the seed when there is no stored value
self.default_value = { lat: 39.462571, lon: -0.376295, zoom: 16, alt: 0 }
```

Notes on the client model:

- The map **never auto-saves** on pan/zoom; saving is always explicit via the
  save button. Editing the `lat`/`lon`/`zoom`/`alt` inputs recenters the map via
  `panTo` / `setZoom`.
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
  "rsc120": [{
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

The import value is the bare data array (no lang keys). Two shapes round-trip
correctly through the generic import path (`conformImportData()`,
`src/core/tools/import_data.ts`), which is model-agnostic and does not carry
a `component_geolocation`-specific override:

```json
// a full array of items — parses and passes through as-is
[{"lat": 39.4625, "lon": -0.3762, "zoom": 16, "alt": 0}]
```

```json
// a single bare item — wrapped into a one-item array
{"lat": 39.4625, "lon": -0.3762}
```

!!! warning "FeatureCollection extraction and flat-string import: TS gap"
    Two further shapes are **not implemented**: importing a bare GeoJSON
    `FeatureCollection` (extracting the center from its first Point feature)
    and importing a flat text cell (`"lat, lon[, zoom[, alt]]"`) — neither is
    converted into the canonical item shape today. There is also no
    `lat`/`lon` range validation or `zoom`/`alt` defaulting on import.

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
- **Sentinel-as-empty.** The Valencia default center doubles as the "unset"
  marker, keeping the column free of accidental real coordinates from untouched
  maps.

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
