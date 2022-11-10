/*global get_label, page_globals, SHOW_DEBUG, DEDALO_TOOLS_URL */
/*eslint no-undef: "error"*/



// import
	// import {clone, dd_console} from '../../../core/common/js/utils/index.js'
	// import {data_manager} from '../../../core/common/js/data_manager.js'
	// import {event_manager} from '../../../core/common/js/event_manager.js'
	import {get_instance} from '../../../core/common/js/instances.js'
	import {common} from '../../../core/common/js/common.js'
	// import {ui} from '../../../core/common/js/ui.js'
	import {tool_common} from '../../tool_common/js/tool_common.js'
	import {render_tool_import_files} from './render_tool_import_files.js'
	import {upload_manager_init} from './upload_manager.js'



/**
* TOOL_IMPORT_FILES
* Tool to translate contents from one language to other in any text component
*/
export const tool_import_files = function () {

	this.id					= null
	this.model				= null
	this.mode				= null
	this.node				= null
	this.ar_instances		= null
	this.status				= null
	this.events_tokens		= null
	this.type				= null
	this.source_lang		= null
	this.target_lang		= null
	this.langs				= null
	this.caller				= null
	this.key_dir			= null
	this.active_dropzone	= null
	this.tool_contanier		= null
	this.files_data			= []

	return true
}//end page



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	tool_import_files.prototype.render	= tool_common.prototype.render
	tool_import_files.prototype.destroy	= common.prototype.destroy
	tool_import_files.prototype.refresh	= common.prototype.refresh
	tool_import_files.prototype.edit	= render_tool_import_files.prototype.edit



/**
* INIT
* Custom tool init
*/
tool_import_files.prototype.init = async function(options) {

	const self = this

	// call the generic common tool init
		const common_init = await tool_common.prototype.init.call(this, options);

	// upload_manager_init
		self.key_dir = self.caller.tipo + '_' + self.caller.section_tipo
		await upload_manager_init()


	return common_init
}//end init



/**
* BUILD
* Custom tool build
* (!) Note that common build resolve all components inside 'self.tool_config.ddo_map' and
* here we do not want this, but only with role 'input_component' and with tmp section_id
* @param bool autoload
* @return promise bool
*/
tool_import_files.prototype.build = async function(autoload=false) {

	const self = this


	try {

		// load_input_ddo_map
		const load_input_ddo_map = async function() {

			// ddo_map load all role 'input_component' elements inside ddo_map
			const ar_promises			= []
			const ddo_map_input			= self.tool_config.ddo_map.filter(el => el.role==='input_component')
			const ddo_map_input_length	= ddo_map_input.length
			for (let i = 0; i < ddo_map_input_length; i++) {

				const el = ddo_map_input[i]

				ar_promises.push( new Promise(async (resolve) => {

					// context. In is not given get from caller or request to the API
						// const context = el.context
						// 	? el.context
						// 	: await (async function(){
						// 		// resolve whole context from API (init event observer problem..)
						// 		const api_response	= await data_manager.get_element_context(el)
						// 		return api_response.result[0]
						// 	  })()
						const context = {}

					const element_options = {
						model			: el.model,
						mode			: el.mode,
						tipo			: el.tipo,
						section_tipo	: el.section_tipo,
						section_id		: 'tmp',
						lang			: self.lang,
						type			: el.type,
						context			: context,
						id_variant		: self.model,  // id_variant prevents id conflicts
						caller			: self // set tool as caller of the component :-)
					}
					// init and build instance
						get_instance(element_options) // load and init
						.then(function(element_instance){
							element_instance.build(true) // build, loading data
							.then(function(){
								resolve(element_instance)
							})
						})
				}))
			}//end for (let i = 0; i < ddo_map.length; i++)

			// set on finish
				await Promise.all(ar_promises).then((ar_instances) => {
					// dd_console(`ar_instances`, 'DEBUG', ar_instances)
					self.ar_instances = ar_instances
				})

			return true
		}//end load_input_ddo_map

		// call generic common tool build
		const common_build = await tool_common.prototype.build.call(this, autoload, {
			load_ddo_map : load_input_ddo_map // will be executed as callback in tool_common
		});
		return common_build

	} catch (error) {
		self.error = error
		console.error(error)
	}


}//end build
