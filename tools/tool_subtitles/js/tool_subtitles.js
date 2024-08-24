// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// import
	import {clone, dd_console} from '../../../core/common/js/utils/index.js'
	import {data_manager} from '../../../core/common/js/data_manager.js'
	import {get_instance, delete_instance} from '../../../core/common/js/instances.js'
	import {common, create_source} from '../../../core/common/js/common.js'
	import {tr} from '../../../core/common/js/tr.js'
	import {tool_common, load_component} from '../../tool_common/js/tool_common.js'
	import {render_tool_subtitles} from './render_tool_subtitles.js'
	import {service_ckeditor} from '../../../core/services/service_ckeditor/js/service_ckeditor.js'



/**
* TOOL_TRANSCRIPTION
* Tool to translate contents from one language to other in any text component
*/
export const tool_subtitles = function () {

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
	this.caller						= null 	// component text_area with the original transcription
	this.transcription_component	= null 	// alias of the caller text_area
	this.media_component			= null 	// component av that will be transcribed (it could be the caller)
	this.subtitles_component		= null 	// component JSON where we are working into the tool
	this.ar_value 					= [] 	// model of the subtitles data to be sync by the render when the users will do changes
	this.relation_list				= null 	// datum of relation_list (to obtain list of top_section_tipo/id)


	this.text_editor	= [] // array. current active text_editor (service_ckeditor) for current node
	// service_text_editor. Name of desired service  to call (service_ckeditor)
	this.service_text_editor		= null
	// service_text_editor_instance. array of created service instances
	this.service_text_editor_instance	= []

	return true
}//end page



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	tool_subtitles.prototype.render		= tool_common.prototype.render
	tool_subtitles.prototype.destroy	= common.prototype.destroy
	tool_subtitles.prototype.refresh	= common.prototype.refresh
	tool_subtitles.prototype.edit		= render_tool_subtitles.prototype.edit



/**
* INIT
*/
tool_subtitles.prototype.init = async function(options) {

	const self = this

	// call the generic common tool init
		const common_init = await tool_common.prototype.init.call(this, options);

	// set the self specific vars not defined by the generic init (in tool_common)
		self.langs			= page_globals.dedalo_projects_default_langs
		self.source_lang	= self.caller && self.caller.lang
			? self.caller.lang
			: null
		self.target_lang	= null

	// service_text_editor
	self.service_text_editor = service_ckeditor

	return common_init
}//end init



/**
* BUILD_CUSTOM
*/
tool_subtitles.prototype.build = async function(autoload=false) {

	const self = this
	// call generic common tool build
		const common_build = await tool_common.prototype.build.call(this, autoload);

	try {

		// transcription_component. fix transcription_component for convenience
			self.transcription_component	= self.caller

		// media_component. fix media_component for convenience
			const media_component_ddo		= self.tool_config.ddo_map.find(el => el.role==="media_component")
			self.media_component			= self.ar_instances.find(el => el.tipo===media_component_ddo.tipo)

		// subtitles_component. fix subtitles_component for convenience
			const subtitles_component_ddo	= self.tool_config.ddo_map.find(el => el.role==="subtitles_component")
			self.subtitles_component		= self.ar_instances.find(el => el.tipo===subtitles_component_ddo.tipo)

		// get the subtitles_component data
		self.get_subtitles_data(self.lang)

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
tool_subtitles.prototype.get_component = async function(lang) {

	const self = this

	// to_delete_instances. Select current self.transcription_component
		const to_delete_instances = self.ar_instances.filter(el => el===self.transcription_component)


	// options (clone context and edit)
		const options = Object.assign(clone(self.transcription_component.context),{
			self 		: self,
			lang		: lang,
			mode		: 'edit',
			section_id	: self.transcription_component.section_id,
			to_delete_instances	: to_delete_instances // array of instances to delete after create the new one
		})

	// call generic common tool build
		const component_instance = await load_component(options);

	// fix instance (overwrite)
		self.transcription_component = component_instance


	return component_instance
}//end get_component



/**
* GET_SUBTITLES_DATA
* @return
*/
tool_subtitles.prototype.get_subtitles_data = async function(lang) {

	const self = this

	// fix the data of the component as ar_value
	const original_ar_value = self.subtitles_component.data.value[0]
	// const values_map = new Map(original_ar_value)

	const ar_value_lang	= original_ar_value[lang] || null

	self.ar_value = (!ar_value_lang || ar_value_lang.length <= 0)
		? proces_ar_data(self)
		: ar_value_lang

		console.log("self.ar_value:-------------",self.ar_value);

	return true
}//end get_subtitles_data



/**
* PROCES_AR_DATA
* Create the subtitles ar_data value from the original text_area data
* @return HTMLElement fragment
*/
const proces_ar_data = function(self) {

	const ar_raw_data = self.caller.data.value


	// TC
		function get_tc(match, p1,p2, offset) {

			// the tc is inside the p2 of the match
			const tc = p2

			const tag_node	= '<span class="tc">'+p2+'</span>'

			return tag_node
		}
		const pattern_tc = tr.get_mark_pattern('tc');
		// current_fragment = current_fragment.replace(pattern_tc, get_tc);


		console.log("ar_raw_data:",ar_raw_data);

	return []
}//end proces_ar_data



/**
* GET_USER_TOOLS
* Get the tools that user has access
* @param array ar_requested_tools | ['tool_time_machine']
* @return Promise with array of the tool_simple_context of the tools requested if the user has access to it.
*/
tool_subtitles.prototype.get_user_tools = async function(ar_requested_tools){

	// source. Note that second argument is the name of the function is the action that not has utility here
		const source = create_source(self, 'user_tools')

	// rqo
		const rqo = {
			dd_api	: 'dd_tools_api',
			action	: 'user_tools',
			source	: source,
			options	: {
				ar_requested_tools : ar_requested_tools
			}
		}

	// call to the API, fetch data and get response
		return new Promise(function(resolve){

			const api_response = data_manager.request({
				body : rqo
			})
			.then(function(response){
				if(SHOW_DEVELOPER===true) {
					dd_console("-> get_diffusion_info API response:",'DEBUG',response);
				}

				const result = response.result // array of objects

				resolve(result)
			})
		})
}//end get_user_tools



/**
* SAVE_VALUE
* @return
*/
tool_subtitles.prototype.save_value = function() {
	const original_ar_value = self.subtitles_component.data.value



}//end save_value



/**
* BUILD_SUBTITLES
*/
tool_subtitles.prototype.build_subtitles = async function() {

	const component_text_area = self.subtitles_component || await self.get_component(self.lang)

	// get instance and init
		self.service_subtitles = await get_instance({
			model				: 'service_subtitles',
			mode				: 'edit',
			caller				: self,
			component_text_area : component_text_area
		})

	self.ar_instances.push(self.service_subtitles)

	self.service_subtitles.build()
		.then(function(){

		})

}// end build_subtitles



// @license-end
