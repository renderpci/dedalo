# RDF import (`tool_import_rdf`)

> See also: [Tools user guide](index.md) · [Developer reference](../development/tools/reference/tool_import_rdf.md)

Fetch the RDF/XML graph of an external linked-open-data resource named by an IRI in a record, parse it, and map its properties onto components — one IRI at a time.

!!! info "This is an advanced, ontology-driven tool"
    Which vocabulary properties map to which components is described in the ontology by an administrator, under the *External Ontologies* term. A cataloguer runs the fetch; the mapping is a setup step.

## What it's for

Heritage records often link out to a shared authority — a coin type in Nomisma/OCRE, a place in GeoNames, a term in a Dublin Core vocabulary — by storing that resource's IRI in an IRI component. This tool turns that IRI into a live fetch of the resource's RDF/XML graph, so you can pull the authority's own labels and descriptions into your record instead of copying them by hand.

Concrete scenario: a numismatist cataloguing a Roman coin type has pasted the OCRE IRI `http://numismatics.org/ocre/id/ric.1(2).aug.1A` into the record's IRI component. They open the RDF import on that component, pick the IRI, run it, and the tool fetches `…ric.1(2).aug.1A.rdf`, parses the graph, and — when the External Ontology node supplies a predicate-to-component map — resolves each mapped predicate's value against the matching component.

## When to use it

- A record holds an external LOD IRI and you want that resource's RDF graph fetched and mapped.
- The section's IRI component is paired with an External Ontology that describes the vocabulary.

When NOT to use it:

- For bulk file loads, use the file-based importers: [CSV import](using_import_dedalo_csv.md), [MARC21 import](using_import_marc21.md), or [Zotero import](using_import_zotero.md). This tool resolves **one IRI at a time** from a live remote graph.
- To import a Zotero RDF/XML export — even though it shares the same parser — use [Zotero import](using_import_zotero.md), which is built to write records.

## Where to find it

The tool is **component-level**: it renders as an **Import RDF** button inline on a configured `component_iri` field, in edit mode, on records whose `tipo` matches the tool's configuration. It does not appear on section toolbars or the inspector — only next to the IRI field it is wired to.

## Using it, step by step

1. **Make sure the record's IRI component holds a valid external IRI** for a vocabulary that has been described in the ontology.
2. **Open the record in edit mode** and find the **Import RDF** button next to the IRI field.
3. **Pick the IRI value** with the radio button (a component can hold several IRIs).
4. **Choose a default language** for literals that arrive without a language tag.
5. **Click OK.** The tool fetches the resource's RDF/XML, parses the graph, and — when a map is configured — resolves the mapped predicates. The parent section refreshes so any resulting data shows.

## Tips and gotchas

!!! note "The fetch returns a mapped graph; it does not write by itself"
    This tool reads a remote graph and returns the parsed (and, when a map is supplied, mapped) subjects. It performs no database write of its own — matching that has a read-only permission. Applying the fetched values into the record is a separate step handled by the surrounding save path, which carries its own write gate.

!!! note "Only outbound web IRIs are fetched"
    For safety the tool only fetches ordinary `http`/`https` IRIs. It refuses loopback, private-network and cloud-metadata addresses, so an IRI that does not point at a public web resource will not resolve.

!!! warning "The mapping is flat — no automatic enrichment"
    A predicate maps straight to one component. There is no built-in date parsing, geolocation handling, or automatic search-or-create of a related record (mint, authority, denomination) from the graph, and no class-hierarchy walk that derives the mapping from the resource's `rdf:type`. The External Ontology must name each predicate-to-component pair explicitly; anything beyond that is work you do on top of the returned data.

## Related

- **[Zotero import](using_import_zotero.md)** — shares this tool's RDF/XML parser, but its import action actually writes records.
- **[CSV import](using_import_dedalo_csv.md)** — CSV import and Dédalo export round-trips.
- **[MARC21 import](using_import_marc21.md)** — MARC21 library-catalogue import.
- **[Media file import](using_import_files.md)** — media ingest.
- **[Importing data](../core/importing_data.md)** — the import model, per-component conform contract and language handling.
- **[Developer reference](../development/tools/reference/tool_import_rdf.md)** — the `get_rdf_data` action, options and the RDF parser.
