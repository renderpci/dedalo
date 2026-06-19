// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_TOOLS_URL */
/*eslint no-undef: "error"*/



// import
	import {clone, dd_console} from '../../../core/common/js/utils/index.js'
	import {data_manager} from '../../../core/common/js/data_manager.js'
	import {common, create_source} from '../../../core/common/js/common.js'
	import {tool_common} from '../../tool_common/js/tool_common.js'
	import {render_tool_pdf_extractor} from './render_tool_pdf_extractor.js'



/**
* TOOL_PDF_EXTRACTOR (module)
* Client-side controller for the PDF content extractor tool.
*
* This tool is invoked from a component_pdf instance (the "caller") and lets the
* editor extract the text content of a linked PDF file into a target text-area
* component.  It communicates with the PHP back-end action `get_pdf_data` via
* dd_tools_api and broadcasts the extracted text to component_text_area through
* the event_manager channel `set_pdf_data_<id_base>`.
*
* Extraction modes supported:
*   - 'text' : plain-text extraction via pdftotext (XPDF). The server applies all
*              page-marker logic (build_pdf_transcription); the browser receives the
*              final string without further processing.
*   - 'html' : HTML extraction via pdftohtml (XPDF). The browser parses the returned
*              HTML, locates anchor tags with a `name` attribute (which XPDF inserts at
*              each page boundary), replaces them with Dédalo page tags of the form
*              `[page-n-{N}-{key}-data:[{N}]:data]`, and serialises the result back to
*              a plain HTML string.
*
* The tool reads an optional `offset` from the caller component's stored value
* (`caller.data.value[0].offset`). This offset is added to the physical page number
* to produce the logical key used inside page tags (e.g. a document whose first page
* is page 5 in the book would have offset = 4 so key = page_number + offset - 1).
*
* Tool config shape (held in `self.config`):
*   {
*     method   : {string}          'text' | 'html' (default 'text')
*     page_in  : {number|false}    first page to extract (1-indexed), false = page 1
*     page_out : {number|false}    last page to extract (inclusive), false = all pages
*     offset   : {number}          logical page-number offset; default 0
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
* The `offset` is read from the caller component's persisted value so that page tags
* use the correct logical page number (physical page + offset).  If no offset is
* stored the value defaults to 0.
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
		const offset = self.caller?.data?.value?.[0].offset || 0

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
}//end build_custom



/**
* GET_PDF_DATA
* Obtain useful system PDF file info from API
*
* Issues a `tool_request` RQO to `dd_tools_api` which invokes the server-side
* `tool_pdf_extractor::get_pdf_data()` action.  The source object is built with
* `create_source(self, 'get_pdf_data')` so the PHP layer can route the call back
* through this tool's API_ACTIONS allowlist.
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
*     }
*   }
*
* The request is made with a generous 180-second timeout and a single retry
* because PDF extraction (especially pdftohtml) can be slow on large files.
*
* (!) `SHOW_DEVELOPER` is referenced inside this function but is not declared in
*     the file-level /*global* / directive — this will trigger an eslint no-undef
*     warning at runtime. The reference is pre-existing and must not be changed.
*
* @returns {Promise<Object>} Resolves to the raw API response object:
*   {
*     result : {string|false} HTML-encoded extracted text, or false on failure
*     msg    : {string}       human-readable status/error message
*     errors : {Array}        accumulated error strings
*   }
*/
tool_pdf_extractor.prototype.get_pdf_data = async function() {

	const self = this

	// short vars
		const config    = self.config || {}
		const method	= config.method
		const page_in	= config.page_in
		const page_out	= config.page_out

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
				page_out		: page_out
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



/**
* PROCESS_PDF_DATA
* Parse the PDF extracted text or html to put the page tags
* and clean the parts that it will don't used
*
* Applies client-side post-processing to the raw string returned by the server:
*
* - For method 'text': the server already produces the final string
*   (build_pdf_transcription in component_pdf handles page markers).  The browser
*   only HTML-decodes the string via DOMParser and returns it unchanged.
*
* - For method 'html': the server returns pdftohtml output that has been
*   HTML-encoded by the PHP layer (htmlentities).  The browser:
*     1. Decodes it back to HTML via DOMParser.
*     2. Queries all `<a name="N">` anchor elements that XPDF inserts at page
*        boundaries (one anchor per page, where N is the 1-indexed page number).
*     3. Replaces each anchor with a `<p>` containing a Dédalo page tag:
*          `[page-n-{N}-{key}-data:[{N}]:data]`
*        where key = page_number - 1 + offset (offset comes from self.config.offset).
*     4. Returns `body.innerHTML` of the resulting document as the final string.
*
* Page tag format detail:
*   [page-n-{physical_page_number}-{logical_key}-data:[{physical_page_number}]:data]
*   The logical key is used by component_text_area to map tagged pages back to
*   the original document's page numbering (e.g. a book starting at physical page
*   5 with offset=4 produces key=physical_page-1+4).
*
* (!) The `page_in` variable is declared but the loop does not use it to skip
*     anchors before the requested first page — this is pre-existing behaviour; do
*     not change. The page_in filtering is handled server-side by pdftohtml itself.
*
* @param {string} original_text - The raw (HTML-encoded) string from the API response.
* @returns {Promise<string>} Resolves to the processed final text/HTML string ready
*   to be broadcast to component_text_area via the `set_pdf_data_*` event.
*/
tool_pdf_extractor.prototype.process_pdf_data = async function(original_text) {

	const self = this

	// htmlEntities
		function htmlEntities(str) {
			// const txt = document.createElement("textarea");
			// txt.innerHTML = str;
			// return txt.value;
			const txt = new DOMParser().parseFromString(str, "text/html");
			return txt.documentElement.textContent;
		}
		original_text = htmlEntities(original_text)
		// console.log('original_text:', original_text);

	// offset. Get the offset set by the user in component_pdf
		const offset = self.config.offset || 1

	// page_in. Get the page_in set by the user in the modal alert
		const page_in = (self.config.page_in===false || self.config.page_in==='' || typeof self.config.page_in==='undefined')
			? 1
			: parseInt(self.config.page_in)

	// method. Get the method set by the user in the modal alert
		const method = self.config.method

	let final_text = ''
	switch (method) {
		// if the engine is text the server will provide the final version.
		// it ensure coherent process with the process of uploaded file or regenerate
		// Don't add any process here, change the buil_pdf_transcription method into the componnet_pdf class.
		case 'text':
			final_text = original_text
			break
		case 'html':
			// the original_text is html but become txt and it need to be parsed
			const html = new DOMParser().parseFromString(original_text, "text/html")
			const body = html.body
			// select the anchor a with name attribute, the parse set the anchor to identify every page
			const ar_pages	= body.querySelectorAll('a[name]')
			const pages_len	= ar_pages.length
			for (let i = 0; i < pages_len; i++) {
				// get the page number set by the parse
				const page_number = parseInt(ar_pages[i].name)
				// create the page tag without <hr> separator the parse set it automatically
				const key = page_number - 1 + parseInt(offset)
				const page_tag = `[page-n-${page_number}-${key}-data:[${page_number}]:data]` // + '<br>'
				// create the text node with the tag
				const new_tag = document.createTextNode(page_tag)
				// create the paragraph of the tag
				const tag_paragraph = document.createElement('p')
				tag_paragraph.appendChild(new_tag)
				// replace the anchor node with the tag node
			 	ar_pages[i].parentNode.replaceChild(tag_paragraph, ar_pages[i]);
				// get the body content to send to component_text_area
				final_text = body.innerHTML
			}
			break;
		default:
	}


	return final_text
}//end process_pdf_data



// @license-end
