// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL */
/*eslint no-undef: "error"*/



/**
 * TOOL_qr
 *
 * This sample tool is only to be used as a basis or reference for creating new tools.
 * To see more complete information about how to create tools see the http://dedalo.dev documentation about tools
 */



// import needed modules
	import {data_manager} from '../../../core/common/js/data_manager.js'
	import {get_instance} from '../../../core/common/js/instances.js'
	import {common} from '../../../core/common/js/common.js'
	import {tool_common} from '../../tool_common/js/tool_common.js'
	import {render_tool_qr} from './render_tool_qr.js' // self tool rendered (called from render common)



/**
* TOOL_QR
* Tool to make interesting things, but nothing in particular
*/
export const tool_qr = function () {

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

	this.section		= null

	this.qr_canvas		= null
}//end page



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	tool_qr.prototype.render		= tool_common.prototype.render
	tool_qr.prototype.destroy		= common.prototype.destroy
	tool_qr.prototype.refresh		= common.prototype.refresh
	// render mode edit (default). Set the tool custom manager to build the DOM nodes view
	tool_qr.prototype.edit			= render_tool_qr.prototype.edit



/**
* INIT
* Custom tool init
* @param object options
* @return bool common_init
*/
tool_qr.prototype.init = async function(options) {

	const self = this

	// call the generic common tool init
		const common_init = await tool_common.prototype.init.call(this, options);

	try {

		await import('../lib/qrcode/easy.qrcode.min.js');

	} catch (error) {
		self.error = error
		console.error(error)
	}


	return common_init
}//end init



/**
* BUILD
* Custom tool build
* @param bool autoload = false
* @return bool common_build
*/
tool_qr.prototype.build = async function(autoload=false) {

	const self = this

	// call generic common tool build
		const common_build = await tool_common.prototype.build.call(self, autoload, {
			load_ddo_map : () => {
				// catches load_ddo_map
			}
		});

	try {

		// debug
			if(SHOW_DEBUG===true) {
				console.log('tool_qr self:', self);
			}
		// section
			// load_section from API
			self.section = await self.load_section()
			// add to tool instances for destroy at end of tool life
			self.ar_instances.push(self.section)

	} catch (error) {
		self.error = error
		console.error(error)
	}


	return common_build
}//end build_custom



/**
* LOAD_SECTION
* Creates a section instance from caller properties and init, build
* @return object section
*/
tool_qr.prototype.load_section = async function() {

	const self = this

	const tipo			= self.caller.tipo
	const section_tipo	= self.caller.section_tipo

	// resolve section context
		const element_context_response = await data_manager.get_element_context({
			tipo			: tipo,
			section_tipo	: section_tipo
		})
		if (!element_context_response.result || !element_context_response.result[0]) {
			console.error('element_context_response:', element_context_response);
			return false
		}
		const element_context = element_context_response.result[0]

	// request_config
		const request_config = element_context.request_config
		// request_config_dedalo item
		const request_config_dedalo = request_config.find(el => el.api_engine==='dedalo')
		// overwrite ddo_map
		const ddo_map = element_context.properties?.tool_config?.tool_qr?.ddo_map || []
		request_config_dedalo.show.ddo_map = ddo_map
		// overwrite pagination
		request_config_dedalo.sqo.limit = 0
		request_config_dedalo.sqo.offset = 0

	// section
		const section = await get_instance({
			tipo			: tipo,
			section_tipo	: section_tipo,
			model			: self.caller.model,
			lang			: self.caller.lang,
			mode			: 'list',
			request_config	: request_config,
			add_show		: true,
			id_variant		: self.section_tipo +'_' + self.model
		})

		await section.build(true)

	// set total (use value.length safely here because limit = 0)
		section.total = section.data.value?.length || 0


	return section
}//end load_section



// @license-end
