// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0


/**
* TOOL_PDF_EXTRACTOR — index.js
* Entry-point barrel for the tool_pdf_extractor ES module.
*
* Re-exports every named export from tool_pdf_extractor.js so that the
* instances.js loader can resolve the tool by its canonical model string
* ('tool_pdf_extractor') using a single, stable import path:
*
*   import {tool_pdf_extractor} from '.../tool_pdf_extractor/js/index.js'
*
* The tool converts the text content of a PDF file attached to a
* component_pdf record into a plain string suitable for ingestion by a
* component_text_area.  Extraction is performed server-side and the result
* is delivered back to the browser, where it is post-processed (page tagging,
* HTML entity decoding) before being published to the target component via
* event_manager ('set_pdf_data_<id_base>').
*
* Two extraction methods are selectable through the tool's UI:
*   - text : the server returns the plain-text representation directly;
*             no further DOM processing is applied client-side.
*   - html : the server returns an HTML string; the client parses anchor
*            elements (<a name="N">) as page boundaries and replaces them
*            with Dédalo page-tag tokens ([page-n-N-K-data:[N]:data]).
*
* An optional page range (page_in / page_out) and a page-number offset
* (read from caller.data.value[0].offset) can be configured before
* extraction is triggered.
*
* Main exports (from tool_pdf_extractor.js):
*   - tool_pdf_extractor  — constructor + prototype chain for the PDF-extractor tool instance
*
* Related modules in this directory:
*   - tool_pdf_extractor.js         — tool constructor, prototype assignments, init/build,
*                                     get_pdf_data (dd_tools_api request), process_pdf_data
*   - render_tool_pdf_extractor.js  — DOM/view rendering (called via the .edit prototype):
*                                     page-range inputs, method radio buttons, submit button,
*                                     response preview, and "select text" helper button
*/


export * from './tool_pdf_extractor.js'


// @license-end
