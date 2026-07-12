# tool_import_rdf

Imports an RDF/OWL graph from an external Linked-Open-Data vocabulary and maps its classes/properties onto Dédalo components, matching or creating linked records as it walks the graph.

## What it does / why & when to use it

`tool_import_rdf` lets a cataloguer turn an **external RDF resource** (identified by an IRI already stored in a record) into a fetched, parsed view of that resource's RDF/XML graph. The mapping is driven by the **ontology**: an *External Ontology* (under the dd1270 term) names, for a given vocabulary, a predicate→component map — which RDF properties correspond to which Dédalo components. The tool reads that map, fetches the RDF/XML graph for the given IRI(s), and returns the matched subjects/properties for the caller to apply.

Concrete heritage scenario: a numismatist is cataloguing a Roman coin type and has pasted the [Nomisma](http://nomisma.org)/OCRE IRI `http://numismatics.org/ocre/id/ric.1(2).aug.1A` into the record's IRI component. They open **Import RDF** on that component, pick the IRI value, run the import, and the tool fetches `…ric.1(2).aug.1A.rdf`, parses its RDF/XML graph, and — when the External Ontology node supplies a predicate→component map — resolves each mapped predicate's literal or resource value against the matching component (e.g. label, description, an IRI reference). The mapping is a flat one-predicate-to-one-component correspondence: there is no built-in date parsing (`xsd:date`/`xsd:gYear`), geolocation handling, or automatic search-or-create of a related record (mint, authority, denomination) — a caller that needs those has to build them on top of the returned subjects.

Use it when: a section uses an external LOD vocabulary (Nomisma, Dublin Core, GeoNames, etc.) and you want to fetch a resource's RDF graph via its IRI. Do **not** use it for bulk file imports (use the CSV / MARC21 / Zotero import tools) — this tool resolves **one IRI at a time** from a live remote graph, and it does not write the result into the record itself (see *How it works*).

## How it works (server + client)

The pipeline is **ontology-driven graph fetch and mapping**: the external RDF schema lives in the Dédalo ontology, so the same code maps any vocabulary that has been described there. A from-scratch RDF/XML parser (no 3rd-party library) plus a predicate→component mapper, gated by `test/unit/rdf_map.test.ts` and `test/unit/rdf_xml.test.ts`.

**Server** (`tools/tool_import_rdf/server/index.ts`, `src/core/tools/rdf_xml.ts`):

- `get_rdf_data` is the single API entry point, declaratively gated `permission: 'section', minLevel: 1` when `options.locator.section_tipo` is present.
- For each IRI it appends `.rdf` (if absent) and **SSRF-confines** the URL — refusing non-http(s) schemes, loopback, RFC1918/link-local, and the cloud metadata address (`169.254.169.254`) — then fetches the graph with the platform `fetch`.
- `parseRdfXml` (`rdf_xml.ts`) is a from-scratch reader that extracts RDF subjects/properties from the raw XML.
- When the request's `tool_config.config.main` carries a predicate→component map, `applyRdfMap` (`rdf_xml.ts`) resolves it against the parsed subjects; without a map, the raw parsed subjects are returned as-is for the caller to interpret. The map is a flat list of `{predicate, component_tipo}` entries — there is no ontology-driven class-hierarchy walk that auto-derives which section/properties apply from an RDF `rdf:type`; the caller must supply the map explicitly.
- **`get_rdf_data` does not write anything.** The handler only fetches, parses and maps — it returns `{result: [{uri, subjects}], msg, errors}` and performs no database write. This matches its read-only (`minLevel: 1`) gate: importing the resolved values into a record is a separate, caller responsibility, not something this action does.

**Client** (`tools/tool_import_rdf/js/`): `tool_import_rdf.js` is the instance; `render_tool_import_rdf.js` builds the edit UI — a radio button per IRI value found on the source `component_iri`, a default-language selector (for literals that arrive without a language tag), and an **OK** button. The tool reads its `external_ontology` tipo from the source element's `properties.ar_tools_name.tool_import_rdf.external_ontology`, calls `get_rdf_data(ontology_tipo, ar_values)`, and on success renders the graph dump (`ar_rdf_html`) in a result pane and refreshes the parent section so the freshly imported data shows. Unchanged for the TS rewrite.

## Actions & options

`apiActions = { get_rdf_data: { permission: 'section', minLevel: 1, handler: getRdfData } }` — gated read/1 on the locator's section when present; the actual record writes happen through the shared save path, which carries its own write gate.

| Action | Permission gate | Background | Reads from `options` |
| --- | --- | --- | --- |
| `get_rdf_data` | declarative `permission: 'section', minLevel: 1` on `locator.section_tipo` when present | no | see below |

Key options read by `get_rdf_data`:

| Option | Type | Meaning |
| --- | --- | --- |
| `ontology_tipo` | string (req.) | Tipo of the **External Ontology** node that describes the RDF schema (namespaces + class/property → Dédalo mapping). The client resolves it from the source element's `properties->ar_tools_name->tool_import_rdf->external_ontology`. |
| `ar_values` | array of strings | The IRIs to fetch, e.g. `["http://numismatics.org/ocre/id/ric.1(2).aug.1A"]` (the values the user ticked on the source IRI component). Each is suffixed with `.rdf` if needed, SSRF-checked, then loaded. |
| `locator` | object | `{section_tipo, section_id}` of the record the import targets. Drives the **read permission gate**. `get_rdf_data` does **not** write to it — see the note above. |

Response: `{ result: [ {uri, subjects}, … ] | false, msg, errors }` — the parsed (and, when a map was supplied, mapped) subjects per IRI. There is no `ar_rdf_html` dump field and no side-effect write.

The module is a single fetch→parse→map function (`getRdfData`) plus the pure `parseRdfXml`/`applyRdfMap` core.

## How it is registered & surfaced

`tools/tool_import_rdf/register.json` is a **column-keyed dump** (`string`/`relation`/`misc`/… keyed by component tipo — a seeded matrix-row snapshot, not a hand-authored file); `importTools()` passes it through as-is (see [register.json reference](../register_json.md)). The essentials it carries:

- `dd1326` name = `tool_import_rdf`; `dd1327` version (`1.0.2`); `dd1328` minimum Dédalo version (`6.0.0`); `dd1644` developer (*Dédalo team*).
- `dd1350` affected_tipos = `["numisdata310"]` — the tool attaches to a specific **`component_iri`** tipo (the IRI field that holds the external resource link). It is not surfaced on whole sections by model.
- `dd1335` properties = `{ "component_config": [ { "tipo": "numisdata310", "external_ontology": "numisdata1129" } ] }` — pairs each IRI component tipo with the External Ontology node that describes its vocabulary. This is the mapping the client reads to populate `ontology_tipo`.
- `dd1331` show_in_inspector = `false`, `dd1332` show_in_component = `true` → the **Import RDF** button renders **inline on the IRI component**, in edit mode, on records whose tipo matches `affected_tipos`.
- `dd1372`/`dd1353` carry the localized label (*Import RDF* / *Importar RDF* / …) across project languages.

Surfacing (in `getElementTools`, `src/core/tools/registry.ts`): because surfacing is `affected_tipos`-restricted and `show_in_component` is set, the button appears next to the configured `component_iri` field — it is a component-level tool, not a section-toolbar or inspector tool. The actual RDF schema (which RDF classes/properties map to which sections/components) is authored in the ontology under the *External Ontologies* term (dd1270), keyed by the vocabulary's TLD (e.g. `numisdata` for Nomisma).

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
// response.result = [ { uri, subjects: [...] } ]
```

A predicate→component field-map entry, the shape `applyRdfMap` actually reads from `tool_config.config.main`:

```json
{ "predicate": "rdfs:label", "component_tipo": "rsc140" }
```

## Related

- [tool_import_dedalo_csv](tool_import_dedalo_csv.md) · [tool_import_marc21](tool_import_marc21.md) · [tool_import_zotero](tool_import_zotero.md) — the other import tools (file-based, where this one is IRI/graph-based). `tool_import_zotero`'s `import_files` action writes through the shared executor; `get_rdf_data` here does not — see the note above.
- [Importing data](../../../core/importing_data.md) — the import model, per-component conform contract and language handling these writes go through.
- [tool_export](tool_export.md) and [Exporting data](../../../core/exporting_data.md) — the export counterpart (the `dedalo_raw` round-trip is a different, file-based path).
- [Creating new tools](../creating_tools.md) · [Server contract](../server_contract.md) — the tool model, `apiActions`, gates and lifecycle this page builds on.
- Source: `tools/tool_import_rdf/server/index.ts`; RDF parser + mapper: `src/core/tools/rdf_xml.ts` (from-scratch, no 3rd-party library, per the no-3rd-party-lib mandate).
