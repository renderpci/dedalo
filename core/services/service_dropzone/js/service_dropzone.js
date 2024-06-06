// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_API_URL */
/*eslint no-undef: "error"*/



// import
	// import {event_manager} from '../../../common/js/event_manager.js'
	import {data_manager} from '../../../common/js/data_manager.js'
	import {dd_console} from '../../../common/js/utils/index.js'
	import {common} from '../../../common/js/common.js'
	import {render_edit_service_dropzone} from './render_edit_service_dropzone.js'



/**
* SERVICE_DROPZONE
* Common service to manage basic upload files
* It is used by tools like 'service_dropzone', 'tool_import' and more
* @return void
*/
export const service_dropzone = function () {

	this.id					= null
	this.model				= null
	this.mode				= null
	this.node				= null
	this.ar_instances		= null
	this.status				= null
	this.events_tokens		= null
	this.type				= null
	this.caller				= null

	this.active_dropzone	= null
	this.max_size_bytes		= null
	this.allowed_extensions	= null
	this.key_dir			= null
	this.file_processor		= null
}//end service_dropzone



/**
* COMMON FUNCTIONS
* extend functions from common
*/
// prototypes assign
	service_dropzone.prototype.render	= common.prototype.render
	service_dropzone.prototype.destroy	= common.prototype.destroy
	service_dropzone.prototype.refresh	= common.prototype.refresh
	service_dropzone.prototype.edit		= render_edit_service_dropzone.prototype.edit



/**
* INIT
* @param object options
* @return bool common_init
*/
service_dropzone.prototype.init = async function(options) {

	const self = this

	// call the generic common init
		const common_init = await common.prototype.init.call(this, options);

	// fix
		self.allowed_extensions	= options.allowed_extensions || []
		self.key_dir			= options.key_dir
		self.component_option	= options.component_option
		self.file_processor		= options.file_processor

	// load dependence JS/CSS
		const load_promises = []

		const lib_js_file = DEDALO_ROOT_WEB + '/lib/dropzone/dropzone-min.js'
		load_promises.push( common.prototype.load_script(lib_js_file) )

		const lib_css_file = DEDALO_ROOT_WEB + '/lib/dropzone/dropzone.css'
		load_promises.push( common.prototype.load_style(lib_css_file) )

		await Promise.all(load_promises).then(async function(response){
			console.log("dropzone load promise:",response);
		})


	return common_init
}//end init



/**
* BUILD
* @param bool autoload = false
* @return bool
*/
service_dropzone.prototype.build = async function(autoload=false) {

	const self = this

	// status update
		self.status = 'building'

	// fetch system info
		const system_info = await get_system_info(self)
		// set as tool properties
			self.max_size_bytes				= system_info.max_size_bytes
			self.sys_get_temp_dir			= system_info.sys_get_temp_dir
			self.upload_tmp_dir				= system_info.upload_tmp_dir
			self.upload_tmp_perms			= system_info.upload_tmp_perms
			self.session_cache_expire		= system_info.session_cache_expire
			self.upload_service_chunk_files	= system_info.upload_service_chunk_files

	// reset dropzone
		self.reset_dropzone()

	// status update
		self.status = 'built'


	return true
}//end build_custom



/**
* GET_SYSTEM_INFO
* Call API to obtain useful system info
* @return promise
*  object response - API response
*/
const get_system_info = async function() {

	// rqo
		const rqo = {
			dd_api	: 'dd_utils_api',
			action	: 'get_system_info'
		}

	// call to the API, fetch data and get response
		return new Promise(function(resolve){

			data_manager.request({
				body : rqo
			})
			.then(function(response){
				if(SHOW_DEVELOPER===true) {
					dd_console("-> get_system_info API response:",'DEBUG',response);
				}

				const result = response.result

				resolve(result)
			})
		})
}//end get_system_info



/**
* RESET_DROPZONE
* @return bool
*/
service_dropzone.prototype.reset_dropzone = function () {

	const self = this

	if (self.active_dropzone) {
		self.active_dropzone.removeAllFiles();
		return true
	}

	return false
}//end reset_drop_zone



// @license-end
