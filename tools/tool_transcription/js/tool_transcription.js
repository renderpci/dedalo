/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// import
	import {clone, dd_console} from '../../../core/common/js/utils/index.js'
	import {data_manager} from '../../../core/common/js/data_manager.js'
	import {get_instance} from '../../../core/common/js/instances.js'
	import {common, create_source} from '../../../core/common/js/common.js'
	// import {ui} from '../../../core/common/js/ui.js'
	import {tool_common} from '../../tool_common/js/tool_common.js'
	import {render_tool_transcription} from './render_tool_transcription.js'



/**
* TOOL_transcription
* Tool to translate contents from one language to other in any text component
*/
export const tool_transcription = function () {

	this.id							= null
	this.model						= null
	this.mode						= null
	this.node						= null
	this.ar_instances				= null
	this.status						= null
	this.events_tokens				= []
	this.type						= null
	this.source_lang				= null
	this.target_lang				= null
	this.langs						= null
	this.caller						= null
	this.media_component			= null // component av that will be transcribed (it could be the caller)
	this.transcription_component	= null // component text area where we are working into the tool
	this.relation_list				= null // datum of relation_list (to obtaim list of top_section_tipo/id)

	return true
}//end page



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	tool_transcription.prototype.render		= tool_common.prototype.render
	tool_transcription.prototype.destroy	= common.prototype.destroy
	tool_transcription.prototype.refresh	= common.prototype.refresh
	tool_transcription.prototype.edit		= render_tool_transcription.prototype.edit



/**
* INIT
*/
tool_transcription.prototype.init = async function(options) {

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
*/
tool_transcription.prototype.build = async function(autoload=false) {

	const self = this

	// call generic common tool build
		const common_build = await tool_common.prototype.build.call(this, autoload);

	try {

		// media_component. fix media_component for convenience
			const media_component_ddo	= self.tool_config.ddo_map.find(el => el.role==="media_component")
			self.media_component		= self.ar_instances.find(el => el.tipo===media_component_ddo.tipo)

		// transcription_component. fix transcription_component for convenience
			const transcription_component_ddo	= self.tool_config.ddo_map.find(el => el.role==="transcription_component")
			self.transcription_component		= self.ar_instances.find(el => el.tipo===transcription_component_ddo.tipo)

		// relation_list. load_relation_list. Get the relation list.
		// This is used to build a select element to allow
		// user select the top_section_tipo and top_section_id of current transcription
			self.relation_list = await self.load_relation_list()

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
tool_transcription.prototype.get_component = async function(lang) {

	const self = this


	// to_delete_instances. Select current self.transcription_component
		const to_delete_instances = self.ar_instances.filter(el => el===self.transcription_component)


	// context (clone and edit)
		const context = Object.assign(clone(self.transcription_component.context),{
			lang		: lang,
			mode		: 'edit',
			section_id	: self.transcription_component.section_id
		})

	// options
		const options = {
			context				: context, // reference context ...
			to_delete_instances	: to_delete_instances // array of instances to delete after create the new one
		}

	// call generic common tool build
		const component_instance = await tool_common.prototype.load_component.call(self, options);

	// fix instance (overwrite)
		self.transcription_component = component_instance


	return component_instance
}//end get_component



/**
* LOAD_RELATion_LIST
* Get the list of related sections with the actual resource
* @return object datum
*/
tool_transcription.prototype.load_relation_list = async function() {

	const self = this

	const transcription_component = self.transcription_component

	const source = {
		action			: 'related_search',
		model			: transcription_component.model,
		tipo			: transcription_component.tipo,
		section_tipo	: transcription_component.section_tipo,
		section_id		: transcription_component.section_id,
		lang			: transcription_component.lang,
		mode			: 'related_list'
	}

	const sqo = {
		section_tipo		: ['all'],
		mode				: 'related',
		// limit				: 1,
		offset				: 0,
		full_count			: false,
		filter_by_locators	: [{
			section_tipo	: transcription_component.section_tipo,
			section_id		: transcription_component.section_id
		}]
	}

	const rqo = {
		action	: 'read',
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
tool_transcription.prototype.get_user_tools = async function(ar_requested_tools) {

	// source. Note that second argument is the name of the function is the action that not has utility here
		const source = create_source(self, 'user_tools')

	// rqo
		const rqo = {
			dd_api				: 'dd_tools_api',
			action				: 'user_tools',
			source				: source,
			ar_requested_tools	: ar_requested_tools
		}

	// call to the API, fetch data and get response
		return new Promise(function(resolve){

			data_manager.request({
				body : rqo
			})
			.then(function(api_response){
				dd_console("[tool_transcription.get_user_tools] api_response:",'DEBUG',api_response);

				const result = api_response.result // array of objects

				resolve(result)
			})
		})
}// end get_user_tools



/**
* BUILD_SUBTITLES
*/
tool_transcription.prototype.build_subtitles = async function() {

	const component_text_area = self.transcription_component || await self.get_component(self.lang)

	// get instance and init
		self.service_subtitles = await get_instance({
			model				: 'service_subtitles',
			mode				: 'edit',
			caller				: self,
			component_text_area : component_text_area
		})

	self.ar_instances.push(self.service_subtitles)

	await self.service_subtitles.build()

	// ....
}// end build_subtitles
