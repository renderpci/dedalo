// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL */
/*eslint no-undef: "error"*/



// import needed modules
	import {clone, dd_console} from '../../../core/common/js/utils/index.js'
	import {data_manager} from '../../../core/common/js/data_manager.js'
	import {common, create_source} from '../../../core/common/js/common.js'
	import {tool_common} from '../../tool_common/js/tool_common.js'
	import {render_tool_image_rotation} from './render_tool_image_rotation.js' // self tool rendered (called from render common)



/**
* TOOL_IMAGE_ROTATION
* Tool to make interesting things
*/
export const tool_image_rotation = function () {

	this.id				= null
	this.model			= null
	this.mode			= null
	this.node			= null
	this.ar_instances	= null
	this.events_tokens	= null
	this.status			= null
	this.main_element	= null
	this.type			= null
	this.source_lang	= null
	this.target_lang	= null
	this.langs			= null
	this.caller			= null


	return true
}//end page



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	// render : using common render entry point
	tool_image_rotation.prototype.render	= tool_common.prototype.render
	tool_image_rotation.prototype.destroy	= common.prototype.destroy
	tool_image_rotation.prototype.refresh	= common.prototype.refresh
	tool_image_rotation.prototype.edit		= render_tool_image_rotation.prototype.edit



/**
* INIT
* Custom tool init
*/
tool_image_rotation.prototype.init = async function(options) {

	const self = this

	// call the generic common tool init
		const common_init = await tool_common.prototype.init.call(this, options);

	// set the self specific vars not defined by the generic init (in tool_common)


	return common_init
}//end init



/**
* BUILD
* Custom tool build
* @param bool autoload = false
* @return bool
*/
tool_image_rotation.prototype.build = async function(autoload=false) {

	const self = this

	// call generic common tool build
		const common_build = await tool_common.prototype.build.call(this, autoload);

	try {

		// specific actions.. like fix main_element for convenience
		// main_element
			const main_element_ddo	= self.tool_config.ddo_map.find(el => el.role==='main_element')
			self.main_element		= self.ar_instances.find(el => el.tipo===main_element_ddo.tipo)

	} catch (error) {
		self.error = error
		console.error(error)
	}


	return common_build
}//end build_custom




/**
* APPLY_ROTATION
* 	rotate all quality images with the value set by user in degrees
* @param object options
* {
* 	rotation_degrees: float like '64.8'
* 	background_color: string like '#ffffff'
* 	alpha: bool
* }
* @return promise > bool
*/
tool_image_rotation.prototype.apply_rotation = function(options) {

	const self = this

	// confirm dialog
		if ( !confirm( (get_label.sure || 'Sure?') ) ) {
			return false
		}

	const rotation_degrees	= options.rotation_degrees
	const background_color	= options.background_color
	const alpha				= options.alpha
	const rotation_mode		= options.rotation_mode

	// source. Note that second argument is the name of the function to manage the tool request like 'apply_value'
	// this generates a call as my_tool_name::my_function_name(options)
		const source = create_source(self, 'apply_rotation')

	// rqo
		const rqo = {
			dd_api	: 'dd_tools_api',
			action	: 'tool_request',
			source	: source,
			options	: {
				tipo				: self.main_element.tipo,
				section_tipo		: self.main_element.section_tipo,
				section_id			: self.main_element.section_id,
				rotation_degrees	: rotation_degrees,
				background_color	: background_color,
				rotation_mode 		: rotation_mode,
				alpha				: alpha
			}
		}

	// call to the API, fetch data and get response
		return new Promise(function(resolve){

			data_manager.request({
				body : rqo
			})
			.then(function(response){
				if(SHOW_DEVELOPER===true) {
					dd_console("-> apply_rotation API response:",'DEBUG',response);
				}

				const result = response.result // array of objects

				resolve(result)
			})
		})
}//end apply_rotation



// @license-end
