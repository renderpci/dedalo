// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_TOOLS_URL */
/*eslint no-undef: "error"*/



// import
	import {clone, dd_console} from '../../../core/common/js/utils/index.js'
	import {data_manager} from '../../../core/common/js/data_manager.js'
	// import {get_instance, delete_instance} from '../../../core/common/js/instances.js'
	import {common, create_source} from '../../../core/common/js/common.js'
	import {tool_common} from '../../tool_common/js/tool_common.js'
	import {render_tool_pdf_extractor} from './render_tool_pdf_extractor.js'



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
*/
tool_pdf_extractor.prototype.init = async function(options) {

	const self = this

	// call the generic common tool init
		const common_init = await tool_common.prototype.init.call(this, options);

	// get the pages offset to set the page tags between pages
		const offset = self.caller.data.value[0].offset

	// specific init variables
		self.config = {
			method		: 'text_engine',
			page_in		: false,
			page_out	: false,
			offset		: offset
		}

	return common_init
}//end init



/**
* BUILD
*/
tool_pdf_extractor.prototype.build = async function(autoload=false) {

	const self = this

	// call generic common tool build
		const common_build = await tool_common.prototype.build.call(this, autoload);

	// config
		if (!self.config) {
			console.error('Tool is not configured. Set configuration to use this tool', self);
			self.config = {}
		}


	return common_build
}//end build_custom



/**
* GET_PDF_DATA
* Obtain useful system PDF file info from API
* @return object api_response
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
			body : rqo
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
* @param string original_text
* @return string final_text
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
		const page_in = (self.config.page_in === false || self.config.page_in ==='' || typeof self.config.page_in ==='undefined')
			? 1
			: parseInt(self.config.page_in)

	// method. Get the method set by the user in the modal alert
		const method = self.config.method

	let final_text = ''
	switch (method) {

		case 'text_engine':
			// split by the page mark invisible text of return character
			const pages = original_text.split("")
			// total pages are the length of the split -1 because the counter use 0 to the page like cover page or blank pages before the text
			const total_pages = pages.length-1
			for (let i = 0; i < total_pages; i++) {
				// create the page tag with <hr> separator to set visual cut between pages
				const page_tag = `<hr>[page-n-${i + page_in}-${((i + page_in)-1)+ offset}-data:[${i + page_in}]:data]<br>`
				// change the return characters of txt format by html <br>
				const clean_page = (pages[i] + '').replace(/(\r\n|\n\r|\r|\n)/g, '<br>' + '$1')
				// create the final page to send to component_text_area
				final_text += page_tag + clean_page
			}
			break;

		case 'html_engine':
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
				// const new_tag = document.createElement(page_tag)
				// replace the anchor node with the tag node
			 	ar_pages[i].parentNode.replaceChild(new_tag, ar_pages[i]);
				// get the body content to send to component_text_area
				final_text = body.innerHTML
			}
			break;
		default:
	}


	return final_text
}//end process_pdf_data


// @license-end
