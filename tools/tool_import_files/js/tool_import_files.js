/*global get_label, page_globals, SHOW_DEBUG, DEDALO_TOOLS_URL */
/*eslint no-undef: "error"*/



// import
	// import {clone, dd_console} from '../../../core/common/js/utils/index.js'
	import {data_manager} from '../../../core/common/js/data_manager.js'
	import {get_instance, delete_instance} from '../../../core/common/js/instances.js'
	import {common, create_source} from '../../../core/common/js/common.js'
	// import {ui} from '../../../core/common/js/ui.js'
	import {tool_common} from '../../tool_common/js/tool_common.js'
	import {render_tool_import_files} from './render_tool_import_files.js'
	import {upload_manager_init} from './upload_manager.js'
	// import {event_manager} from '../../../core/common/js/event_manager.js'



/**
* tool_import_files
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
};//end page



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	tool_import_files.prototype.render 		= common.prototype.render
	tool_import_files.prototype.destroy 	= common.prototype.destroy
	tool_import_files.prototype.edit 		= render_tool_import_files.prototype.edit



/**
* INIT
*/
tool_import_files.prototype.init = async function(options) {

	const self = this

	// set the self specific vars not defined by the generic init (in tool_common)
		self.lang = options.lang // page_globals.dedalo_data_lang


	// call the generic common tool init
		const common_init = await tool_common.prototype.init.call(this, options);


	// upload_manager_init
		self.key_dir = self.caller.tipo + '_' + self.caller.section_tipo
		await upload_manager_init()

	return common_init
};//end init




/**
* BUILD
* Generic tool build function. Load basic tool config info (stored in component_json dd1353) and css files
*
* @param bool autoload
* @return promise bool
*/
tool_import_files.prototype.build = async function(autoload=false) {
	const t0 = performance.now()

	const self = this

	// status update
		self.status = 'building'

	// load self style
		const tool_css_url = DEDALO_TOOLS_URL + '/' + self.model + "/css/" + self.model + ".css"
		common.prototype.load_style(tool_css_url)

	// data manager
		// const current_data_manager = new data_manager()

	// ddo_map load all elements inside ddo_map
		const ar_promises = []
		const ddo_map_input = self.tool_config.ddo_map.filter(el => el.role === 'input_component')
		for (let i = 0; i < ddo_map_input.length; i++) {

			const el = ddo_map_input[i]

			ar_promises.push( new Promise(async (resolve) => {

				// context. In is not given get from caller or request to the API
					// const context = el.context
					// 	? el.context
					// 	: await (async function(){
					// 		// resolve whole context from API (init event observer problem..)
					// 		const api_response	= await current_data_manager.get_element_context(el)
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

	// debug
		if(SHOW_DEBUG===true) {
			// console.log("__Time to build", self.model, " ms:", Math.round(performance.now()-t0));
			// dd_console(`__Time to build ${self.model} ${Math.round(performance.now()-t0)} ms`, 'DEBUG')
			// dd_console(`tool common build. self.ar_instances`, 'DEBUG', self.ar_instances)
		}


	// status update
		self.status = 'builded'


	return true
};//end build



/**
* PROCESS_FILES
* Process the files uploaded to the server
*
* @return promise bool
*/
tool_import_files.prototype.process_files = function(){

}



