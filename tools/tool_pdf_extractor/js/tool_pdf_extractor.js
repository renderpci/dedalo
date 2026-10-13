// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, SHOW_DEVELOPER, DEDALO_TOOLS_URL */
/*eslint no-undef: "error"*/



// import
	import {clone, dd_console} from '../../../core/common/js/utils/index.js'
	import {data_manager} from '../../../core/common/js/data_manager.js'
	import {common, create_source} from '../../../core/common/js/common.js'
	import {tool_common} from '../../../core/tools_common/js/tool_common.js'
	import {render_tool_pdf_extractor} from './render_tool_pdf_extractor.js'



/**
* TOOL_PDF_EXTRACTOR (module)
* Client-side controller for the PDF content extractor tool.
*
* This tool is invoked from a component_pdf instance (the "caller") and lets the
* editor extract the content of the record's PDF, preview it, and copy it (the
* "Select text" button) into a text-area component. It calls the server action
* `get_pdf_data` via dd_tools_api (tools/tool_pdf_extractor/server/index.ts).
*
* THE SERVER SHAPES THE PAYLOAD (CLIENT-2, 2026-10-11). `get_pdf_data` answers
* `{value, render_class}` (server/pdf_payload.ts):
*   - 'text' : the pdftotext characters VERBATIM, render_class 'text' — the
*              preview escapes them, so `CAES<A>R` stays what the PDF holds.
*   - 'html' : the pdftohtml document shaped on the server (head/doctype gone,
*              each `<a name="N">` page anchor replaced by a Dédalo page tag
*              `[page-n-{N}-{key}-data:[{N}]:data]`, key = N - 1 + offset) and
*              passed through the rich-text sanitizer LAST; render_class 'html'.
* The client re-parses nothing: the preview renders through the ONE
* render-boundary escaper (render_value) by the class the server named.
*
* The tool reads an optional `offset` from the caller component_pdf's stored value
* (`caller.data.entries[0].lib_data.offset`, written by view_default_edit_pdf's
* offset input) and sends it with the request; the server uses
* it to key the page tags (a document whose first page is page 5 in the book has
* offset = 5, so key = page_number - 1 + offset).
*
* Tool config shape (held in `self.config`):
*   {
*     method   : {string}          'text' | 'html' (default 'text')
*     page_in  : {number|false}    first page to extract (1-indexed), false = page 1
*     page_out : {number|false}    last page to extract (inclusive), false = all pages
*     offset   : {number}          logical page-number offset; sent as 1 when unset
*   }
*
* Exported symbols:
*   tool_pdf_extractor — constructor; prototype extended below
*/



/**
* TOOL_PDF_EXTRACTOR
* Tool to convert PDF file content to an continuous string like transcription
*/
export const tool_pdf_extractor = function () {

	this.id				= null
	this.model			= null
	this.mode			= null
	this.node			= null
	this.ar_instances	= null
	this.status			= null
	this.events_tokens	= null
	this.type			= null
	this.caller			= null

	return true
}//end tool_pdf_extractor



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	tool_pdf_extractor.prototype.render		= tool_common.prototype.render
	tool_pdf_extractor.prototype.destroy	= common.prototype.destroy
	tool_pdf_extractor.prototype.refresh	= common.prototype.refresh
	tool_pdf_extractor.prototype.edit		= render_tool_pdf_extractor.prototype.edit



/**
* INIT
* Initialises the tool instance by delegating to tool_common.prototype.init and then
* seeding the tool-specific `config` object.
*
* The `offset` is read from the caller component_pdf's persisted value
* (`data.entries[0].lib_data.offset` — the v7 shape; the v6 `data.value[0].offset`
* no longer exists, and reading it sent 1 whatever the editor stored) so that
* page tags use the correct logical page number (physical page + offset). If no
* offset is stored (absent, null or '') the value is 1 (no shift).
*
* @param {Object} options - Standard tool init options forwarded to tool_common.
* @returns {Promise<boolean>} Resolves to the result of tool_common.prototype.init.
*/
tool_pdf_extractor.prototype.init = async function(options) {

	const self = this

	// call the generic common tool init
	const common_init = await tool_common.prototype.init.call(this, options);

	try {

		// get the pages offset to set the page tags between pages
		const stored_offset	= self.caller?.data?.entries?.[0]?.lib_data?.offset
		const offset		= (stored_offset===undefined || stored_offset===null || stored_offset==='')
			? 1
			: stored_offset

		// specific init variables
		self.config = {
			method		: 'text',
			page_in		: false,
			page_out	: false,
			offset		: offset
		}

	} catch (error) {
		self.error = error
		console.error(error)
	}

	return common_init
}//end init



/**
* BUILD
* Finalises tool construction by delegating to tool_common.prototype.build.
* Ensures `self.config` exists (guards against init being skipped in unusual paths).
*
* @param {boolean} [autoload=false] - When true, tool_common automatically fetches
*   tool context from the API during the build phase.
* @returns {Promise<boolean>} Resolves to the result of tool_common.prototype.build.
*/
tool_pdf_extractor.prototype.build = async function(autoload=false) {

	const self = this

	// call generic common tool build
		const common_build = await tool_common.prototype.build.call(this, autoload);

	// config
		if (!self.config) {
			self.config = {}
		}


	return common_build
}//end build



/**
* GET_PDF_DATA
* Asks the server to extract the record's PDF content.
*
* Issues a `tool_request` RQO to `dd_tools_api`, routed to the tool's server
* action `get_pdf_data` (create_source(self, 'get_pdf_data')).
*
* RQO structure sent to the API:
*   {
*     dd_api  : 'dd_tools_api',
*     action  : 'tool_request',
*     source  : { …create_source fields…, action: 'get_pdf_data' },
*     options : {
*       lang           : {string}        caller's language code
*       component_tipo : {string}        ontology tipo of the PDF component (caller)
*       section_tipo   : {string}        ontology tipo of the parent section
*       section_id     : {string|number} record ID
*       method         : {string}        'text' | 'html'
*       page_in        : {number|false}  first page (false → page 1)
*       page_out       : {number|false}  last page (false → all pages)
*       offset         : {number}        logical page offset for the page tags (default 1)
*     }
*   }
*
* The request is made with a generous 180-second timeout and a single try
* because PDF extraction (especially pdftohtml) can be slow on large files.
*
* @returns {Promise<Object>} Resolves to the envelope v2 response: on success
*   `{ok:true, data:{value:string, render_class:'text'|'html'}}`, on failure
*   `{ok:false, error:ApiError}`.
*/
tool_pdf_extractor.prototype.get_pdf_data = async function() {

	const self = this

	// short vars
		const config    = self.config || {}
		const method	= config.method
		const page_in	= config.page_in
		const page_out	= config.page_out
		const offset	= config.offset ?? 1

	// component PDF caller
		const component = self.caller

	// source. Note that second argument is the name of the function to manage the tool request like 'apply_value'
	// this generates a call as my_tool_name::my_function_name(options)
		const source = create_source(self, 'get_pdf_data')

	// rqo
		const rqo = {
			dd_api	: 'dd_tools_api',
			action	: 'tool_request',
			source	: source,
			options	: {
				lang			: component.lang,
				component_tipo	: component.tipo,
				section_tipo	: component.section_tipo,
				section_id		: component.section_id,
				method			: method,
				page_in			: page_in,
				page_out		: page_out,
				offset			: offset
			}
		}

	// call to the API, fetch data and get response
	return new Promise(function(resolve){

		data_manager.request({
			body : rqo,
			retries : 1, // one try only
			timeout : 180 * 1000 // 180 secs waiting response
		})
		.then(function(response){
			if(SHOW_DEVELOPER===true) {
				dd_console("-> get_pdf_data API response:",'DEBUG',response);
			}

			resolve(response)
		})
	})
}//end get_pdf_data



// @license-end
