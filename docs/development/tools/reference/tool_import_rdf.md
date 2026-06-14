# tool_import_rdf

Imports an RDF/OWL graph from an external Linked-Open-Data vocabulary and maps its classes/properties onto Dédalo components, matching or creating linked records as it walks the graph.

## What it does / why & when to use it

`tool_import_rdf` lets a cataloguer turn an **external RDF resource** (identified by an IRI already stored in a record) into populated Dédalo data, without copying fields by hand. The mapping is driven entirely by the **ontology**: an *External Ontology* (under the dd1270 term) describes, in OWL terms, which RDF classes correspond to which Dédalo sections and which RDF object-properties / datatype-properties correspond to which components. The tool reads that schema, fetches the RDF graph, and writes the resolved values straight into the current record (and into the linked records it resolves along the way).

Concrete heritage scenario: a numismatist is cataloguing a Roman coin type and has pasted the [Nomisma](http://nomisma.org)/OCRE IRI `http://numismatics.org/ocre/id/ric.1(2).aug.1A` into the record's IRI component. They open **Import RDF** on that component, pick the IRI value, run the import, and the tool fetches `…ric.1(2).aug.1A.rdf`, matches its `nmo:` class to the Coin-type section and its properties to the corresponding components, fills in literals (label, description), dates (date of issue, with `xsd:date`/`xsd:gYear` handling), geolocation (mint coordinates as a geo tag/map), and IRIs — and for relations such as *mint*, *authority* or *denomination* it searches the relevant section for a record already matching the resolved value, links it if found, or creates a new record if not. What would have been a dozen manual lookups becomes one click against the authority.

Use it when: a section uses an external LOD vocabulary (Nomisma, Dublin Core, GeoNames, etc.) and you want to pull a resource's data in via its IRI. Do **not** use it for bulk file imports (use the CSV / MARC21 / Zotero import tools) — this tool resolves **one IRI at a time** from a live remote graph.

## How it works (server + client)

The pipeline is **ontology-driven graph traversal**: the external RDF schema lives in the Dédalo ontology, so the same code maps any vocabulary that has been described there.

**Server** (`class.tool_import_rdf.php`):

- `get_rdf_data(options)` is the single API entry point. It runs the write gate (see below), loads EasyRdf, reads the external ontology's `properties->xmlns` and registers each prefix with `\EasyRdf\RdfNamespace::set()`, then iterates the supplied `ar_values` (IRIs).
- For each IRI it appends `.rdf` (if absent), **SSRF-confines** the URL with `is_safe_remote_url($uri, {allow_custom_ports:true})` — blocking loopback / RFC1918 / link-local / reserved hosts and non-http(s) schemes (a broken or unsafe URL is logged and skipped, never fatal) — then loads the graph with `EasyRdf\Graph::load()`.
- `get_class_map_to_dd()` matches the graph's RDF type against the external ontology's child OWL classes, resolves the related Dédalo **section**, and emits a root field for it. `get_resource_to_dd_object()` then recurses over the class's OWL `ObjectProperty` children, descending the graph and the ontology in lockstep.
- Per property it applies the ontology `properties->process` transform when present — `source` + `data_map` (value lookup), `split` (split a URI, keep a part), `date` (`start`/`end` literals → `dd_date`, honouring the datatype), `geo_tag` (lat/long → a GeoJSON `[geo-n-1--data:…:data]` string) and `geo_map` (lat/long → `{lat,lon,zoom}`). `component_iri` targets store the resource URIs verbatim and stop following the link.
- When a property points at another resource that itself maps to a section, `get_resource_match()` runs a search (SQO with `skip_projects_filter`) on that section for the resolved value, **linking** the existing record or **creating** a new one, and returns a `locator`. `create_new_resource()` handles an intermediary link section in the path (e.g. *ref biblio* / *ref person*) declared via the property's `ddo_map`.
- Resolved values are written into components with `set_data_into_component()`, which is **non-destructive**: it only saves when the component is empty (for IRI and relation components it merges/appends rather than overwriting). Literals are written per project language, reading the literal's `xml:lang` where present.

**Client** (`tools/tool_import_rdf/js/`): `tool_import_rdf.js` is the instance; `render_tool_import_rdf.js` builds the edit UI — a radio button per IRI value found on the source `component_iri`, a default-language selector (for literals that arrive without a language tag), and an **OK** button. The tool reads its `external_ontology` tipo from the source element's `properties.ar_tools_name.tool_import_rdf.external_ontology`, calls `get_rdf_data(ontology_tipo, ar_values)`, and on success renders the graph dump (`ar_rdf_html`) in a result pane and refreshes the parent section so the freshly imported data shows.

## Actions & options

`API_ACTIONS = ['get_rdf_data']` — list form (membership only); the permission check is **imperative inside the method** because the section to gate on is derived from the `locator` in the options, not from a top-level `section_tipo`.

| Action | Permission gate | Background | Reads from `options` |
| --- | --- | --- | --- |
| `get_rdf_data` | imperative: when a `locator` is supplied, `security::assert_section_permission(locator->section_tipo, 2, …)` — write on the target section | no | see below |

Key options read by `get_rdf_data`:

| Option | Type | Meaning |
| --- | --- | --- |
| `ontology_tipo` | string (req.) | Tipo of the **External Ontology** node that describes the RDF schema (namespaces + class/property → Dédalo mapping). The client resolves it from the source element's `properties->ar_tools_name->tool_import_rdf->external_ontology`. |
| `ar_values` | array of strings | The IRIs to fetch, e.g. `["http://numismatics.org/ocre/id/ric.1(2).aug.1A"]` (the values the user ticked on the source IRI component). Each is suffixed with `.rdf` if needed, SSRF-checked, then loaded. |
| `locator` | object | `{section_tipo, section_id}` of the record receiving the import. Drives the **write permission gate** and is the destination into which `set_data_into_component()` saves resolved values. |

Response: `{ result: [ {dd_obj, ar_rdf_html}, … ] | false, msg }` — `dd_obj` is the array of mapped field descriptors per IRI, `ar_rdf_html` the EasyRdf HTML dump shown to the user. (The actual record writes happen as side effects during the walk.)

The other public-static methods — `get_class_map_to_dd`, `get_resource_to_dd_object`, `process_data_map`, `get_resource_match`, `set_data_into_component`, `create_new_resource` — are internal helpers with positional (non-RQO) signatures and are deliberately **not** in `API_ACTIONS`, so they cannot be called remotely.

## How it is registered & surfaced

`tools/tool_import_rdf/register.json` is a **legacy v6** file (raw record dump with `components`/`relations` keys); it is auto-converted at registration by `tools_register` (the `components` key triggers the v6 converter). The essentials it carries:

- `dd1326` name = `tool_import_rdf`; `dd1327` version (`1.0.2`); `dd1328` minimum Dédalo version (`6.0.0`); `dd1644` developer (*Dédalo team*).
- `dd1350` affected_tipos = `["numisdata310"]` — the tool attaches to a specific **`component_iri`** tipo (the IRI field that holds the external resource link). It is not surfaced on whole sections by model.
- `dd1335` properties = `{ "component_config": [ { "tipo": "numisdata310", "external_ontology": "numisdata1129" } ] }` — pairs each IRI component tipo with the External Ontology node that describes its vocabulary. This is the mapping the client reads to populate `ontology_tipo`.
- `dd1331` show_in_inspector = `false`, `dd1332` show_in_component = `true` → the **Import RDF** button renders **inline on the IRI component**, in edit mode, on records whose tipo matches `affected_tipos`.
- `dd1372`/`dd1353` carry the localized label (*Import RDF* / *Importar RDF* / …) across project languages.

Surfacing (in `common::get_tools()`): because surfacing is `affected_tipos`-restricted and `show_in_component` is set, the button appears next to the configured `component_iri` field — it is a component-level tool, not a section-toolbar or inspector tool. The actual RDF schema (which RDF classes/properties map to which sections/components) is authored in the ontology under the *External Ontologies* term (dd1270), keyed by the vocabulary's TLD (e.g. `numisdata` for Nomisma).

## Examples

Client-side `tool_request` (built by `tool_import_rdf.js::get_rdf_data`, sent through `dd_tools_api`):

```js
const rqo = {
    dd_api : 'dd_tools_api',
    action : 'tool_request',
    source : create_source(self, 'get_rdf_data'), // → tool_import_rdf::get_rdf_data
    options : {
        ontology_tipo : 'numisdata1129', // the External Ontology node (Nomisma)
        ar_values     : ['http://numismatics.org/ocre/id/ric.1(2).aug.1A'],
        locator       : {
            section_tipo : self.caller.section_tipo, // the record being enriched
            section_id   : self.caller.section_id
        }
    }
}
const response = await data_manager.request({ body: rqo, timeout: 60000 })
// response.result = [ { dd_obj:[…], ar_rdf_html:'…' } ]
```

Sketch of the ontology `process` config a property node carries (read from `properties->process`):

```json
{
    "date":    { "start": "nmo:hasStartDate", "end": "nmo:hasEndDate",
                 "format": { "xsd:date": "date", "xsd:gYear": "year" } },
    "geo_map": { "lat": "geo:lat", "long": "geo:long" },
    "split":   { "source": "$base_uri", "split_by": "/", "get": "end",
                 "property_name": "id" }
}
```

A class node can additionally declare `"match": "<component_tipo>"` to tell `get_resource_match()` which component to search on when linking/creating the related record, and a property node can declare `"ddo_map"` to describe an intermediary link section in the path.

## Related

- [tool_import_dedalo_csv](tool_import_dedalo_csv.md) · [tool_import_marc21](tool_import_marc21.md) · [tool_import_zotero](tool_import_zotero.md) — the other import tools (file-based, where this one is IRI/graph-based).
- [Importing data](../../../core/importing_data.md) — the import model, per-component conform contract and language handling these writes go through.
- [tool_export](tool_export.md) and [Exporting data](../../../core/exporting_data.md) — the export counterpart (the `dedalo_raw` round-trip is a different, file-based path).
- [Creating new tools](../creating_tools.md) · [Server contract](../server_contract.md) — the tool model, `API_ACTIONS`, gates and lifecycle this page builds on.
- Source: `tools/tool_import_rdf/class.tool_import_rdf.php`, `tools/tool_import_rdf/js/{tool_import_rdf,render_tool_import_rdf}.js`, `tools/tool_import_rdf/register.json`. RDF parsing via the `sweetrdf/easyrdf` composer dependency; SSRF confinement via `is_safe_remote_url()` (`shared/core_functions.php`).
```
