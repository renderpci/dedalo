// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// import
	import {dd_console} from '../../../core/common/js/utils/index.js'
	import {data_manager} from '../../../core/common/js/data_manager.js'
	import {common, create_source} from '../../../core/common/js/common.js'
	import {tool_common, load_component} from '../../tool_common/js/tool_common.js'
	import {render_tool_numisdata_epigraphy} from './render_tool_numisdata_epigraphy.js'



/**
* TOOL_NUMISDATA_EPIGRAPHY
* Tool to translate contents from one language to other in any text component
*/
export const tool_numisdata_epigraphy = function () {

	this.id					= null
	this.model				= null
	this.mode				= null
	this.node				= null
	this.ar_instances		= null
	this.status				= null
	this.events_tokens		= []
	this.type				= null
	this.source_lang		= null
	this.target_lang		= null
	this.langs				= null
	this.caller				= null
	this.media_component	= null // component av that will be transcribed (it could be the caller)
	this.epigraphy			= null // component text area where we are working into the tool
	this.relation_list		= null // datum of relation_list (to obtain list of top_section_tipo/id)
}//end page



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	tool_numisdata_epigraphy.prototype.render	= tool_common.prototype.render
	tool_numisdata_epigraphy.prototype.destroy	= common.prototype.destroy
	tool_numisdata_epigraphy.prototype.refresh	= common.prototype.refresh
	tool_numisdata_epigraphy.prototype.edit		= render_tool_numisdata_epigraphy.prototype.edit



/**
* INIT
* @param object options
* @return bool
*/
tool_numisdata_epigraphy.prototype.init = async function(options) {

	const self = this

	// call the generic common tool init
		const common_init = await tool_common.prototype.init.call(this, options);

	try {

		// set the self specific vars not defined by the generic init (in tool_common)
			self.langs			= page_globals.dedalo_projects_default_langs
			self.source_lang	= self.caller && self.caller.lang
				? self.caller.lang
				: null
			self.target_lang	= null

	} catch (error) {
		self.error = error
		console.error(error)
	}


	return common_init
}//end init



/**
* BUILD
* @param bool autoload = true
* @return bool
*/
tool_numisdata_epigraphy.prototype.build = async function(autoload=false) {

	const self = this
	console.log("self.tool_config:",self.tool_config);
	// call generic common tool build
		const common_build = await tool_common.prototype.build.call(this, autoload);

	try {
		const roles = [
			'coins',
			'epigraphy',
			'obverse_legend',
			'reverse_legend',
			'obverse_desing',
			'reverse_desing',
			'obverse_symbol',
			'reverse_symbol',
			'obverse_mark',
			'reverse_mark',
			'edge_desing',
			'edge_legend'
		];
		const roles_length = roles.length
		for (let i = 0; i < roles_length; i++) {
			const role = roles[i]

			// fix media_component for convenience
			const ddo = self.tool_config.ddo_map.find(el => el.role===role)
			if (!ddo) {
				console.warn(`Warning: \n\tThe role '${role}' it's not defined in Ontology and will be ignored`);
				continue;
			}
			self[role] = self.ar_instances.find(el => el.tipo===ddo.tipo)
		}

		// relation_list. load_relation_list. Get the relation list.
			// This is used to build a select element to allow
			// user select the top_section_tipo and top_section_id of current transcription
			// self.relation_list = await self.load_relation_list()

	} catch (error) {
		self.error = error
		console.error(error)
	}


	return common_build
}//end build_custom



/**
* GET_COMPONENT
* Load transcriptions component (text area) configured with the given lang
* @param string lang
* Create / recover and build a instance of current component in the desired lang
* @return object instance
*/
tool_numisdata_epigraphy.prototype.get_component = async function(options) {

	const self = this

	const data	= options.data
	const role	= options.role
	const name	= options.name

	const ddo	= self.tool_config.ddo_map.find(el => el.role===role)

	const component_options	= {
		self 			: self,
		model			: ddo.model,
		mode 			: ddo.mode,
		tipo			: ddo.tipo,
		section_tipo	: data.section_tipo,
		section_id		: data.section_id,
		type			: ddo.type || 'component',
		lang 			: (typeof ddo.translatable!=='undefined' && ddo.translatable===false)
			? page_globals.dedalo_data_nolan // lg-nolan
			: page_globals.dedalo_data_lang,
		to_delete_instances	: self.ar_instances.filter(el => el===self[name])
	}

	// call generic common tool build
		const component_instance = await load_component(component_options);

	// set auto_init_editor if the ddo has his definition
		if(ddo.auto_init_editor){
			component_instance.auto_init_editor = ddo.auto_init_editor
		}

	// fix instance (overwrite)
		self[name] = component_instance


	return component_instance
}//end get_component



/**
* LOAD_RELATion_LIST
* Get the list of related sections with the actual resource
* @return object datum
*/
tool_numisdata_epigraphy.prototype.get_relations = async function(options) {

	const self = this

	const data	= options.data
	const role	= options.role
	const name	= options.name
	const count = options.count || true

	// const ddo	= self.tool_config.ddo_map.find(el => el.role===role)

	const source = {
		action			: 'related_search',
		model			: 'section',
		tipo			: data.section_tipo,
		section_tipo	: data.section_tipo,
		section_id		: data.section_id,
		lang			: page_globals.dedalo_data_lang,
		mode			: 'related_list'
	}

	const sqo = {
		section_tipo		: ['all'],
		mode				: 'related',
		filter_by_locators	: [{
			section_tipo	: data.section_tipo,
			section_id		: data.section_id
		}]
	}

	const rqo = {
		action	: (count)
			? 'count'
			: 'read',
		source	: source,
		sqo		: sqo
	}

	// get context and data
		const api_response = await data_manager.request({
			body : rqo
		})

	const datum = api_response.result


	return datum
}//end load_relation_list



/**
* GET_USER_TOOLS
* Get the tools that user has access
* @param array ar_requested_tools | ['tool_time_machine']
* @return Promise with array of the tool_simple_context of the tools requested if the user has access to it.
*/
tool_numisdata_epigraphy.prototype.get_user_tools = async function(ar_requested_tools) {

	// source. Note that second argument is the name of the function is the action that not has utility here
		const source = create_source(self, 'user_tools')

	// rqo
		const rqo = {
			dd_api	: 'dd_tools_api',
			action	: 'user_tools',
			source	: source,
			options	: {
				ar_requested_tools	: ar_requested_tools
			}
		}

	// call to the API, fetch data and get response
		return new Promise(function(resolve){

			data_manager.request({
				body : rqo
			})
			.then(function(api_response){
				if(SHOW_DEVELOPER===true) {
					dd_console("[tool_numisdata_epigraphy.get_user_tools] api_response:",'DEBUG',api_response);
				}

				const result = api_response.result // array of objects

				resolve(result)
			})
		})
}// end get_user_tools



// @license-end
