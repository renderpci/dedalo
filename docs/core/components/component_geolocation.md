# component_geolocation

## Overview

```json
{
    "could_be_translatable" : false,
    "is_literal": true,
    "is_related": false,
    "is_media": false,
    "modes": ["edit","list","tm","search"],
    "default_tools" : [
        "tool_leaflet_special_tools",
        "tool_propagate_component_data",
        "tool_time_machine",
        "tool_dev_template"
    ],
    "render_views" :[
        {
            "view"    : "default | line | print | mini",
            "mode"    : "edit"
        },
        {
            "view"    : "default | mini | text",
            "mode"    : "list | tm"
        }
    ],
    "data": "array of items",
    "sample_data": [{
        "id": 3,
        "alt": 16,
        "lat": 28.760289075631214,
        "lon": -17.87981450557709,
        "zoom": 17,
        "lib_data": [{
            "layer_id": 1,
            "layer_data": {
                "type": "FeatureCollection",
                "features": [{
                    "type": "Feature",
                    "properties": {"layer_id": 1},
                    "geometry": {"type": "Point", "coordinates": [-17.879337, 28.760041]}
                }]
            }
        }]
    }],
    "value": "array of coordinate objects",
    "sample_value": [{"lat": 28.760289, "lon": -17.879814, "zoom": 17, "alt": 16}]
}
```

## Definition

`component_geolocation` stores a geographic position and, optionally, the vector shapes drawn over it. It is a **literal-direct** component (it owns its data: there is no relation locator, no media file and no language). It renders an interactive [Leaflet](https://leafletjs.com/) map in `edit` mode where the curator can pan/zoom to set the map center and draw points, circles, polygons and polylines with the [Leaflet-Geoman](https://geoman.io/) editor.

It exists because a single pair of coordinates is rarely enough for cultural-heritage description: an excavation site has an extent (a polygon), a findspot has a precise point, a survey transect is a polyline, a monument has a viewshed radius. The component captures both the **map state** (center + zoom + altitude) and the **GeoJSON geometry** drawn on it, in a format ready for mapping, spatial queries and diffusion to GIS targets.

**Use it when** a record needs to be placed on a map: the location of an archaeological site, the findspot of an artifact, the birthplace of a person, the mint of a coin, the boundary of a protected area.

**Do not use it when** you only need a textual place name or a link to a gazetteer/thesaurus term — use [component_input_text](component_input_text.md) for a literal toponym, or a relation component such as [component_portal](component_portal.md) pointing at a *Places* thesaurus section (which can itself carry a `component_geolocation`). A common pattern combines both: a portal to the toponymy thesaurus that, on selection, pushes its coordinates into a local `component_geolocation` (see [Notes](#notes), `map_update_coordinates`).

!!! note "Single point per component"
    Although the data is modelled as an array, the editor manages **one item** (one map) per component instance; the fixed array key is always `0`. Multiple positions are expressed as multiple GeoJSON features inside `lib_data`, not as multiple array items.

## Data model

**Data:** `array` of coordinate items (one item in practice), or `null`.

**Value:** `array` of objects `{lat, lon, zoom, alt, lib_data?}`, or `null`.

**Storage:** the data is stored in the **`geo` column** of the matrix table. The component is **non‑translatable**: its language slot is always `DEDALO_DATA_NOLAN`, so there are no per-language rows.

Each item carries:

| key | type | meaning |
| --- | --- | --- |
| `lat` | float | map center latitude, range `[-90, 90]` |
| `lon` | float | map center longitude, range `[-180, 180]` |
| `zoom` | int | Leaflet zoom level (default `16`) |
| `alt` | int | altitude / elevation (default `0`) |
| `lib_data` | array | optional drawn shapes as GeoJSON layers (the rendering-library data) |
| `id` | int | item id assigned by the component counter |

A stored item with drawn shapes:

```json
[{
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
```

!!! warning "Coordinate order"
    The item fields `lat`/`lon` are stored in human order (**latitude first**). Inside `lib_data` GeoJSON, the `geometry.coordinates` use the GeoJSON convention `[lon, lat]` (**longitude first**). Do not swap them.

`lib_data` is an array of **layers**; each layer is `{layer_id, layer_data}` where `layer_data` is a GeoJSON `FeatureCollection`. Each feature stamps its `layer_id` in `properties`. Non-point shapes carry extra `properties`: `shape:"circle"` + `radius` for circles, `color` for any drawn shape. Layers exist so that a transcription [component_text_area](component_text_area.md) can pair each drawn shape with a `geo` tag in the text (the layer is loaded/removed as the tag is inserted/removed).

### Default value sentinel

When the component has no real data, the client shows the default value `{lat:39.462571, lon:-0.376295, zoom:16, alt:0}` (Valencia, the project home). The server treats this exact pair as "empty": the resolved latitude/longitude and the GeoJSON diffusion value are all `null` for `39.462571 / -0.376295`, so an untouched map is never published as a real location.

## Ontology instantiation

Define the component as an ontology node whose `model` is `component_geolocation`, parented to the section (and, normally, to a `section_group` grouper). The node carries the structure (`tipo`, `model`, `parent`, `lg-*` label) and the `properties` JSON that configures behaviour.

Node JSON (structure):

```json
{
    "tipo"          : "rsc120",
    "model"         : "component_geolocation",
    "parent"        : "rsc197",
    "parent_grouper": "rsc76",
    "lg-eng"        : "Location",
    "lg-spa"        : "Localización",
    "translatable"  : false
}
```

Example `properties` block for this component (provider override + observers; see [Properties & options](#properties--options)):

```json
{
    "geo_provider": "OSM",
    "observe": [
        {
            "client": {
                "event"  : "update_value",
                "perform": {"function": "map_update_coordinates"}
            },
            "component_tipo": "rsc91"
        }
    ]
}
```

`css` may set the map height (the editor needs a tall container):

```json
{
    ".wrapper_component >.content_data": { "min-height": "500px" }
}
```

`section_tipo`/`parent` wire the node into a section: instantiating the section resolves its element tree and builds the component for the current `section_id` in the requested mode. The component never reaches the database itself — its section is the single writer, and reads/writes the `geo` column on its behalf.

## Properties & options

`geo_provider`

options: `OSM` | `GOOGLE` | `ARCGIS` | `NUMISDATA` | `VARIOUS`

default: the `DEDALO_GEO_PROVIDER` env var, read into the TS config catalog as `config.geoProvider` (`src/config/config.ts`, `readEnv('DEDALO_GEO_PROVIDER', 'VARIOUS')`).

Selects the base tile layer(s) of the Leaflet map. The server stamps the resolved value into `context.features.geo_provider` (`properties.geo_provider ?? config.geoProvider`) and the client switches on it: `src/core/resolve/structure_context.ts` appends `entry.features = {geo_provider}` for `component_geolocation` in the FULL (non-`simple`) context — without it the client's Leaflet widget cannot pick a tile backend and the map renders as an empty box (fixed 2026-07-04; gated by `component_geolocation_features_differential.test.ts`).

- `OSM` — OpenStreetMap tiles, with automatic dark/light tile swap on theme change.
- `GOOGLE` — Google `ROADMAP` layer (requires the Google plugin to be available).
- `ARCGIS` — Esri *World Imagery* satellite tiles.
- `NUMISDATA` — layer selector offering the *Imperium* (DARE/ancient world) tiles + ArcGIS + OSM.
- `VARIOUS` — layer selector offering ArcGIS + OSM.

`observe`

options: array of observer rules `{client:{event, perform:{function}}, component_tipo}`

Client-side event subscriptions handled by the component. Recognised perform functions on this component:

- `map_update_coordinates` — on a related component's `update_value`, copy the coordinates of a referenced record's geolocation into this map (see [Notes](#notes)).
- `load_tag_into_geo_editor` — on `click_tag_geo`, load the layer pointed by a transcription `geo` tag.
- `layer_data_change` — on `editor_tag_geo_change`, insert/remove a layer when its tag is added/removed in the text.
- `get_data_tag` — on the text editor request (e.g. `key_up_f2`), hand a new `geo` tag descriptor to the calling [component_text_area](component_text_area.md).

`map_update_coordinates` reads, on the **observable** related component, a `request_config` `hide` entry with `role: "target_geolocation_tipo"` to know which geolocation component of the pointed record to copy; absent that, it falls back to the thesaurus default geolocation tipo.

!!! note "Common component properties"
    The shared `mandatory`, `css`, `tools`, `permissions` and `request_config` apply as for any component (see [Introduction to components](index.md)). `unique`, `with_lang_versions` and `multi_line` are not meaningful here (the component is non‑translatable and is not a plain text field). Verify any project-specific property in the ontology.

## Render views & modes

The component is built by the shared `ui.component` builders; the view is read from `context.view` (default `default`).

| view | edit | list / tm | notes |
| --- | --- | --- | --- |
| `default` | yes | yes | full interactive map; in `edit` the Geoman draw toolbar and coordinate inputs (`lat`,`lon`,`zoom`,`alt`) are shown |
| `line` | yes | — | compact fixed-height map (falls through to the default editor view) |
| `print` | yes | — | read-only map (forces `permissions = 1`, hides Leaflet controls) |
| `mini` | yes | yes | minimal map view |
| `text` | — | yes | textual list rendering |

The map disables scroll-wheel zoom by default and recenters via `panTo`/`setZoom` when the inputs change.

!!! warning "Search mode under construction"
    `search` mode is wired (`render_search_component_geolocation`) but the search view is not currently exposed in the search list (`UNDER CONSTRUCTION` in the source). Consistent with that, the TS search dispatcher (`src/core/search/conform.ts`) has no `component_geolocation` branch either — a filter against this model would throw `builder for model 'component_geolocation' not implemented yet`. The component is also **not sortable**: its descriptor declares the `sortable: false` opt-out (sortability otherwise defaults to true — `resolveSortable()`, `src/core/resolve/structure_context.ts`), so a list cannot be ordered by it.

## Import / export model

The component is non‑translatable, so the import value is the bare data array (no lang keys). Four import shapes are defined:

1. Full v7 dato — JSON array of items:

    ```json
    [{"lat":39.4625,"lon":-0.3762,"zoom":16,"alt":0}]
    ```

2. A single bare item — JSON object (wrapped into a one-item array):

    ```json
    {"lat":39.4625,"lon":-0.3762}
    ```

3. A bare GeoJSON `FeatureCollection` — the map center is taken from the first `Point` feature and the whole collection is stored as `lib_data` layer 1 (a missing `layer_id` is stamped as `1`):

    ```json
    {"type":"FeatureCollection","features":[{"type":"Feature","properties":{},"geometry":{"type":"Point","coordinates":[-0.3762,39.4625]}}]}
    ```

4. A flat string `lat, lon[, zoom[, alt]]` with dot decimals (latitude first):

    ```text
    39.4625, -0.3762, 16
    ```

Validation: `lat`/`lon` are mandatory and numeric; `lat ∈ [-90,90]`, `lon ∈ [-180,180]`; `zoom` defaults to `16`, `alt` to `0`; `lib_data` (when present) must be an array of layers each defining `layer_id` and a `FeatureCollection`. An empty cell clears the component data (`result = null`). A legacy lang-keyed export object (`{"lg-nolan":[...]}`) is accepted by extracting the first lang value.

!!! danger "Gap: only shapes (1) and (2) import correctly through the TS server"
    `component_geolocation` is **not** a `VALUE_PROPERTY_MODELS` member in the generic TS import engine (`src/core/tools/import_data.ts`), which has no geolocation-specific handling. In practice: shape **(1)** (JSON array of items) and shape **(2)** (bare `{lat,lon}` object, which happens to already be a valid one-item array once wrapped) import correctly. Shape **(3)** (bare GeoJSON `FeatureCollection`) is **not** unpacked into `{lat, lon, lib_data}` — the generic engine stores the FeatureCollection object itself as the item, producing a malformed value. Shape **(4)** (flat `lat, lon[, zoom[, alt]]` string) is **not parsed at all** — a non-JSON cell falls through to the engine's raw-string branch and the plain text is stored verbatim, not as an object. Import geolocation columns as JSON (shape 1) until this is ported.

See the full geolocation import definition in [Importing data](../importing_data.md#geolocation) and the round-trip raw format in [Exporting data](../exporting_data.md#raw-export-and-round-trip).

## Notes

- **Storage column & language.** Data lives in the matrix `geo` column, pinned to `DEDALO_DATA_NOLAN` (language‑neutral). The component reads/saves only through its section.
- **Coordinate accessors.** The center is resolved as floats (or `null` for the default sentinel) from `lat`/`lon`; a cache-rebuild reload-then-resave path (used by cache-update tooling) has not been verified for this pass.
- **Diffusion.** The stored item can convert to a GeoJSON `Point` object `{type, coordinates:[lon, lat]}` (Socrata-style) or to an encoded `FeatureCollection` (layer wrapper, 16‑decimal `[lon, lat]` coordinates), yielding `null` for the default sentinel. Not evaluated against the native diffusion subsystem (`src/diffusion/`) for this pass — verify before relying on geolocation diffusion parity.
- **Observers / observables (client).** Configured via the `observe` property. The flagship pattern is `map_update_coordinates`: a related component (e.g. a toponymy portal) is the *observable*; on its `update_value` it fires the observer geolocation, which copies the coordinates of the referenced record (the geolocation identified by `role: "target_geolocation_tipo"` in the observable's `request_config` `hide`) and re-centers the map, recording the change like any save.
- **Text-area integration.** `lib_data` layers pair with `geo` tags in a [component_text_area](component_text_area.md) transcription; inserting/removing a tag loads/unloads the matching layer (`layer_data_change`, `load_tag_into_geo_editor`, `get_data_tag`). See the `geo` tag in [Importing data](../importing_data.md#geo).
- **Default tools.** `tool_leaflet_special_tools`, `tool_propagate_component_data`, `tool_time_machine`, `tool_dev_template` (per the ontology node; exact set is ontology-driven).
- **Client libraries.** Leaflet, Leaflet-Geoman, Turf (measurements) and iro (color picker) are lazy-loaded on first map build (`load_libs`). The map never auto-saves on pan/zoom — saving is always explicit via the save button.
- **Related docs:** [component_input_text](component_input_text.md), [component_portal](component_portal.md), [component_text_area](component_text_area.md), [component_json](component_json.md), [Introduction to components](index.md).
