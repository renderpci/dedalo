// import
	import {data_manager} from '../../../core/common/js/data_manager.js'
	import {get_instance, delete_instance} from '../../../core/common/js/instances.js'
	import {common} from '../../../core/common/js/common.js'
	import {tool_common} from '../../tool_common/js/tool_common.js'
	import {render_tool_pdf_extractor} from './render_tool_pdf_extractor.js'



/**
* TOOL_UPLOAD
* Tool to translate contents from one language to other in any text component
*/
export const tool_pdf_extractor = function () {
	
	this.id
	this.model
	this.mode
	this.node
	this.ar_instances
	this.status
	this.events_tokens
	this.type
	this.caller

	return true
};//end page



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	tool_pdf_extractor.prototype.render 		= common.prototype.render
	tool_pdf_extractor.prototype.destroy 		= common.prototype.destroy
	tool_pdf_extractor.prototype.edit 			= render_tool_pdf_extractor.prototype.edit

/**
* INIT
*/
tool_pdf_extractor.prototype.init = async function(options) {

	const self = this

	// set the self specific vars not defined by the generic init (in tool_common)
		self.trigger_url = DEDALO_TOOLS_URL + "/tool_pdf_extractor/trigger.tool_pdf_extractor.php"

	// call the generic commom tool init
		const common_init = tool_common.prototype.init.call(this, options);

	// get the pages offset to set the page tags between pages
		const offset = self.caller.data.value[0].offset

	// specific init variables
		self.config = {
			method		: 'text_engine',
			page_in 	: false,
			page_out 	: false,
			offset 		: offset
		}

	return common_init
};//end init



/**
* BUILD
*/
tool_pdf_extractor.prototype.build = async function(autoload=false) {

	const self = this

	// call generic commom tool build
		const common_build = tool_common.prototype.build.call(this, autoload);

	return common_build
};//end build_custom


/**
* GET_SYSTEM_INFO
* Call trigger to obtain useful system info
*/
tool_pdf_extractor.prototype.get_pdf_data = async function(self) {

	// errors
		const handle_errors = function(response) {
			if (!response.ok) {
				throw Error(response.statusText);
			}
			return response;
		}

	const caller_component = {
		component_tipo 	: self.caller.tipo,
		section_id 		: self.caller.section_id,
		section_tipo 	: self.caller.section_tipo,
	}
	// trigger call
		const trigger_response = await fetch(
	 		self.trigger_url,
	 		{
				method		: 'POST',
				mode		: 'cors',
				cache		: 'no-cache',
				credentials	: 'same-origin',
				headers		: {'Content-Type': 'application/json'},
				redirect	: 'follow',
				referrer	: 'no-referrer',
				body		: JSON.stringify({
					mode 				: 'get_pdf_data',
					extractor_config 	: self.config,
					component 			: caller_component
				})
			})
			.then(handle_errors)
			.then(response => response.json()) // parses JSON response into native Javascript objects
			.catch(error => {
				console.error("!!!!! REQUEST ERROR: ",error)
				return {
					result 	: false,
					msg 	: error.message,
					error 	: error
				}
			});

	return trigger_response.result
};//end get_pdf_data


/**
* PROCESS_PDF_DATA
* Parse the pdf extracted text or html to put the page tags and clean the parts that it will don't used
*/
tool_pdf_extractor.prototype.process_pdf_data = async function(original_text) {

	const self = this
	// get the offset set by the user in component_pdf
	const offset 		= self.config.offset
	// get the page_in set by the user in the modal alert
	const page_in 		= (self.config.page_in === false || self.config.page_in ==='' || typeof self.config.page_in ==='undefined')
							? 1
							: parseInt(self.config.page_in)
	// get the method set by the user in the modal alert
	const method 		= self.config.method

	let final_text = ''
	switch (method) {
		case 'text_engine':
			// split by the page mark invisible text of return character
			const pages 		= original_text.split("");
			// total pages ar the length of the split -1 because the counter use 0 to the page like cover page or blank pages before the text
			const total_pages 	= pages.length-1
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
			// the original_text is html but become as txt and need to be parse to html
			const html = new DOMParser().parseFromString(original_text, "text/html")
			const body = html.body
			// select the anchor a with name attribute, the parse set the anchor to identify every page
			const ar_pages 		= body.querySelectorAll('a[name]')
			const pages_len 	= ar_pages.length
			for (let i = 0; i < pages_len; i++) {
				// get the page number set by the parse
				const page_number = ar_pages[i].name
				// create the page tag without <hr> separator the parse set it automacticly
				const page_tag = `[page-n-${page_number}-${(page_number -1) + offset}-data:[${page_number}]:data]<br>`
				// create the textnode witht the tag
				const new_tag = document.createTextNode(page_tag)
				// replace the anchor node with the tag node
			 	ar_pages[i].parentNode.replaceChild(new_tag,ar_pages[i]);
				// get the body content to send to component_text_area
				final_text = body.innerHTML
			}
			break;
		default:
	}

	 return final_text
};//end process_pdf_data
