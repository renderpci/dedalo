// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0


/**
* TOOL_IMPORT_RDF — index.js
* Entry-point barrel for the tool_import_rdf ES module.
*
* Re-exports every named export from tool_import_rdf.js so that the
* instances.js loader can resolve the tool by its canonical model string
* ('tool_import_rdf') using a single, stable import path:
*
*   import {tool_import_rdf} from '.../tool_import_rdf/js/index.js'
*
* The tool lets operators import RDF schemas defined by external ontologies
* (Nomisma, Dublin Core, etc.) into Dédalo records.  A user selects one or
* more IRI identifiers from a component_iri field; the tool fetches the
* corresponding RDF graph from the remote endpoint (via dd_tools_api action
* 'tool_request' → server method 'get_rdf_data'), traverses the ontology
* mapping defined under the External Ontologies term (dd1270) in the Dédalo
* ontology, and writes the extracted values into the target section components.
*
* The mapping from RDF predicates to Dédalo components is stored per
* external-ontology tipo (e.g. numisdata1129) inside the tool_config
* ddo_map; the ddo_map entry with role 'main_element' identifies the
* component_iri whose current value provides the RDF entry-point IRI.
*
* Main exports (from tool_import_rdf.js):
*   - tool_import_rdf  — constructor + prototype chain for the RDF-import tool instance
*
* Related modules in this directory:
*   - tool_import_rdf.js         — tool constructor, prototype assignments, get_rdf_data action
*   - render_tool_import_rdf.js  — DOM/view rendering (called via the .edit prototype),
*                                  ontology selector and IRI value list UI
*/


export * from './tool_import_rdf.js'


// @license-end
