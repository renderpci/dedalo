// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_TOOLS_URL */
/*eslint no-undef: "error"*/



// import
	import {get_instance} from '../../../core/common/js/instances.js'
	import {common} from '../../../core/common/js/common.js'
	import {tool_common} from '../../tool_common/js/tool_common.js'
	import {render_tool_import_marc21} from './render_tool_import_marc21.js'



/**
* TOOL_IMPORT_MARC21
* Tool to translate contents from one language to other in any text component
*/
export const tool_import_marc21 = function () {

	this.id						= null
	this.model					= null
	this.mode					= null
	this.node					= null
	this.ar_instances			= null
	this.status					= null
	this.events_tokens			= null
	this.type					= null
	this.source_lang			= null
	this.target_lang			= null
	this.langs					= null
	this.caller					= null
	this.key_dir				= null
	this.tool_contanier			= null
	this.files_data				= []

	// services
	this.service_dropzone		= null
	this.service_tmp_section	= null
}//end page



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	tool_import_marc21.prototype.render		= tool_common.prototype.render
	tool_import_marc21.prototype.destroy	= common.prototype.destroy
	tool_import_marc21.prototype.refresh	= common.prototype.refresh
	tool_import_marc21.prototype.edit		= render_tool_import_marc21.prototype.edit



/**
* INIT
* Custom tool init
* @param object options
* @return bool common_init
*/
tool_import_marc21.prototype.init = async function(options) {

	const self = this

	// call the generic common tool init
		const common_init = await tool_common.prototype.init.call(this, options);

	// upload_manager_init
		self.key_dir = self.caller.tipo + '_' + self.caller.section_tipo


	return common_init
}//end init



/**
* BUILD
* Custom tool build
* (!) Note that common build resolve all components inside 'self.tool_config.ddo_map' and
* here we do not want this, but only with role 'input_component' and with tmp section_id
* @param bool autoload
* @return bool common_build
*/
tool_import_marc21.prototype.build = async function(autoload=false) {

	const self = this

	// common_build. call generic common tool build
		const common_build = await tool_common.prototype.build.call(this, autoload, {
			load_ddo_map : () => { return []} // prevents to auto load ddo_map
		});

	try {

		// service_dropzone
			self.service_dropzone = await get_instance({
				model 				: 'service_dropzone',
				mode 				: 'edit',
				caller 				: self,
				allowed_extensions	: self.allowed_extensions || [],
				key_dir				: self.key_dir,
				component_option	: null,
				file_processor		: null
			})
			await self.service_dropzone.build()

		// Service tmp_section
			self.service_tmp_section = await get_instance({
				model	: 'service_tmp_section',
				mode	: 'edit',
				caller	: self,
				ddo_map	: self.tool_config.ddo_map.filter(el => el.role==='input_component')
			})
			await self.service_tmp_section.build()

	} catch (error) {
		self.error = error
		console.error(error)
	}


	return common_build
}//end build



// @license-end
