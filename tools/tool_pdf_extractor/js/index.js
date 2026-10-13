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
* The tool extracts the content of the PDF file attached to a component_pdf
* record and previews it so the editor can select and copy it into a
* component_text_area. Extraction AND shaping happen server-side: the action
* `get_pdf_data` answers `{value, render_class}` (server/pdf_payload.ts), and
* the preview renders it through render_value by that class.
*
* Two extraction methods are selectable through the tool's UI:
*   - text : the PDF's characters verbatim (render_class 'text', escaped).
*   - html : the server shapes the pdftohtml document — each anchor
*            <a name="N"> becomes a Dédalo page tag
*            [page-n-N-K-data:[N]:data] — and sanitizes it (render_class 'html').
*
* An optional page range (page_in / page_out) and a page-number offset
* (read from caller.data.entries[0].lib_data.offset, sent with the request) can be
* configured before extraction is triggered.
*
* Main exports (from tool_pdf_extractor.js):
*   - tool_pdf_extractor  — constructor + prototype chain for the PDF-extractor tool instance
*
* Related modules in this directory:
*   - tool_pdf_extractor.js         — tool constructor, prototype assignments, init/build,
*                                     get_pdf_data (dd_tools_api request)
*   - render_tool_pdf_extractor.js  — DOM/view rendering (called via the .edit prototype):
*                                     page-range inputs, method radio buttons, submit button,
*                                     response preview, and "select text" helper button
*/


export * from './tool_pdf_extractor.js'


// @license-end
