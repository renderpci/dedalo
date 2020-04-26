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

	this.max_size_bytes

	return true
}//end page



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

	// specific init variables
		self.config = {
			method		: 'txt',
			page_in 	: false,
			page_out 	: false,
		}

	return common_init
}//end init



/**
* BUILD
*/
tool_pdf_extractor.prototype.build = async function(autoload=false) {

	const self = this

	// call generic commom tool build
		const common_build = tool_common.prototype.build.call(this, autoload);

	return common_build
}//end build_custom





///// Delete

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

	// set
		self.max_size_bytes 		= trigger_response.result.max_size_bytes
		self.sys_get_temp_dir 		= trigger_response.result.sys_get_temp_dir
		self.upload_tmp_dir 		= trigger_response.result.upload_tmp_dir
		self.upload_tmp_perms 		= trigger_response.result.upload_tmp_perms
		self.session_cache_expire 	= trigger_response.result.session_cache_expire


	return trigger_response.result
}//end get_pdf_data
