// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_TOOLS_URL */
/*eslint no-undef: "error"*/



// import
	import {get_instance} from '../../../core/common/js/instances.js'
	import {dd_console} from '../../../core/common/js/utils/index.js'
	import {data_manager} from '../../../core/common/js/data_manager.js'
	import {event_manager} from '../../../core/common/js/event_manager.js'
	import {common, create_source} from '../../../core/common/js/common.js'
	import {tool_common} from '../../tool_common/js/tool_common.js'
	import {render_tool_upload} from './render_tool_upload.js'



/**
* TOOL_UPLOAD
* Tool to translate contents from one language to other in any text component
*/
export const tool_upload = function () {

	this.id				= null
	this.model			= null
	this.mode			= null
	this.node			= null
	this.ar_instances	= null
	this.status			= null
	this.events_tokens	= null
	this.type			= null
	this.caller			= null

	this.max_size_bytes	= null
}//end tool_upload



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	tool_upload.prototype.render		= tool_common.prototype.render
	tool_upload.prototype.destroy		= common.prototype.destroy
	tool_upload.prototype.refresh		= common.prototype.refresh
	tool_upload.prototype.edit			= render_tool_upload.prototype.edit
	tool_upload.prototype.list			= render_tool_upload.prototype.edit
	tool_upload.prototype.mini			= render_tool_upload.prototype.edit
	tool_upload.prototype.upload_done	= render_tool_upload.prototype.upload_done



/**
* INIT
* @param object options
* @return bool
*/
tool_upload.prototype.init = async function(options) {

	const self = this

	// call the generic common tool init
		const common_init = await tool_common.prototype.init.call(this, options);

	// events
		const upload_file_done_handler = (options) => {
			self.upload_done(options)
		}
		self.events_tokens.push(
			event_manager.subscribe('upload_file_done_' + self.id, upload_file_done_handler)
		)


	return common_init
}//end init



/**
* BUILD
* @param bool autoload = false
* @return bool
*/
tool_upload.prototype.build = async function(autoload=false) {

	const self = this

	// call generic common tool build
		const common_build = await tool_common.prototype.build.call(this, autoload);

	try {

		// service_upload
			// get instance and init
			self.service_upload = await get_instance({
				model				: 'service_upload',
				mode				: 'edit',
				allowed_extensions	: self.caller.context.features.allowed_extensions, // like ['csv','jpg']
				caller				: self
			})
			// console.log("self.service_upload:",self.service_upload);
			self.ar_instances.push(self.service_upload)

	} catch (error) {
		self.error = error
		console.error(error)
	}


	return common_build
}//end build_custom



/**
* PROCESS_UPLOADED_FILE
* @param object file_data
* Sample:
* {
*	error: 0
*	extension: "tiff"
*	name: "proclamacio.tiff"
*	size: 184922784
*	tmp_name: "/hd/media/upload/service_upload/tmp/image/phpPJQvCp"
*	type: "image/tiff"
* }
* @param object process_options
* {
* 	ocr	 : true
* 	ocr_lang : 'lg-spa',
* }
* @return promise
* 	Resolve: object API response
*/
tool_upload.prototype.process_uploaded_file = async function(file_data, process_options) {

	const self = this

	// source. Note that second argument is the name of the function to manage the tool request like 'apply_value'
	// this generates a call as my_tool_name::my_function_name(options)
		const source = create_source(self, 'process_uploaded_file')

	// rqo
		const rqo = {
			dd_api	: 'dd_tools_api',
			action	: 'tool_request',
			source	: source,
			options	: {
				file_data		: file_data,
				process_options : process_options,
				tipo			: self.caller.tipo,
				section_tipo	: self.caller.section_tipo,
				section_id		: self.caller.section_id,
				caller_type		: self.caller.context.type, // like 'tool' or 'component'. Switch different process actions on tool_upload class
				quality			: self.caller.context.target_quality || self.caller.context.features.default_target_quality || null, // only for components
				target_dir		: self.caller.context.target_dir || null // optional object like {type: 'dedalo_config', value: 'DEDALO_TOOL_IMPORT_DEDALO_CSV_FOLDER_PATH' // defined in config}
			}
		}

	// call to the API, fetch data and get response
		const api_response = await data_manager.request({
			body : rqo
		})

	// debug
		if(SHOW_DEVELOPER===true) {
			dd_console("-> process_uploaded_file API api_response:",'DEBUG', api_response);
		}

	// events
		event_manager.publish('process_uploaded_file_done_' + self.id, api_response)


	return api_response
}//end process_uploaded_file



// @license-end
