// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// import
	import { dd_console} from '../../../core/common/js/utils/index.js'
	import {data_manager} from '../../../core/common/js/data_manager.js'
	import {common, create_source} from '../../../core/common/js/common.js'
	import {tool_common} from '../../tool_common/js/tool_common.js'
	import {render_tool_transcription} from './render_tool_transcription.js'



/**
* TOOL_TRANSCRIPTION
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
* @param object options
* @return bool common_init
*/
tool_transcription.prototype.init = async function(options) {

	const self = this

	// call the generic common tool init
		const common_init = await tool_common.prototype.init.call(this, options);

	try {

		// set the self specific vars not defined by the generic init (in tool_common)
			self.langs			= page_globals.dedalo_projects_default_langs
			// self.source_lang	= self.caller && self.caller.lang
			// 	? self.caller.lang
			// 	: null
			self.target_lang	= null

		// target transcriber. When user changes it, a local DB var is stored as 'transcriber_engine_select' in table 'status'
			const transcriber_engine_select_object = await data_manager.get_local_db_data(
				'transcriber_engine_select',
				'status'
			)
			if (transcriber_engine_select_object) {
				self.target_transcriber = transcriber_engine_select_object.value
			}


	} catch (error) {
		self.error = error
		console.error(error)
	}


	return common_init
}//end init



/**
* BUILD
* @param bool autoload = false
* @return bool common_build
*/
tool_transcription.prototype.build = async function(autoload=false) {

	const self = this

	// call generic common tool build
		const common_build = await tool_common.prototype.build.call(this, autoload);

	try {

		// fix components instances for convenience
			const roles = [
				'media_component',
				'transcription_component',
				'status_user_component',
				'status_admin_component',
				'references_component'
			];
			const roles_length = roles.length
			for (let i = 0; i < roles_length; i++) {

				const role	= roles[i]
				const ddo	= self.tool_config.ddo_map.find(el => el.role===role)
				if (!ddo) {
					console.warn(`Warning: \n\tThe role '${role}' it's not defined in Ontology and will be ignored`);
					continue;
				}
				self[role] = self.ar_instances.find(el => el.tipo===ddo.tipo)

				if(role === 'transcription_component'){
					// force change lang if related_component_lang is defined (original lang)
					if (self.transcription_component.context.options && self.transcription_component.context.options.related_component_lang) {
						if (self.transcription_component.lang !== self.transcription_component.context.options.related_component_lang) {
							self.transcription_component.lang = self.transcription_component.context.options.related_component_lang
							// set source land
							self.source_lang = self.transcription_component.lang
							// build again to force download data
							await self.transcription_component.build(true)
							if(SHOW_DEBUG===true) {
								console.log('Changed transcription_component lang to related_component_lang:', self.transcription_component.lang);
							}
						}
					}
				}
			}

		// relation_list. Load relation_list from API
			// This is used to build a select element to allow
			// user to select the top_section_tipo and top_section_id of current transcription
			self.relation_list = await self.load_relation_list()

	} catch (error) {
		self.error = error
		console.error(error)
	}


	return common_build
}//end build_custom



/**
* LOAD_RELATION_LIST
* Call API and get the list of related sections with the actual resource
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
* @param array ar_requested_tools
* 	Sample: ['tool_time_machine']
* @return promise
* 	Promise with array of the tool_simple_context of the tools requested if the user has access to it.
*/
tool_transcription.prototype.get_user_tools = async function(ar_requested_tools) {

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

			data_manager.request({
				body : rqo
			})
			.then(function(api_response){
				if(SHOW_DEVELOPER===true) {
					dd_console("[tool_transcription.get_user_tools] api_response:",'DEBUG',api_response);
				}

				const result = api_response.result // array of objects

				resolve(result)
			})
		})
}// end get_user_tools



/**
* BUILD_SUBTITLES_FILE
* Call to API to calculate current subtitles from the transcription
* and save it to a normalized file path like '/httpdocs/dedalo/media/av/subtitles/rsc35_rsc167_1_lg-spa.vtt'
* @see Note that component_av (in view 'player') is subscribed to event 'updated_subtitles_file_' + self.id
* and must be publish the change to force the load of new file in the player captions track
* @return promise
* 	{
* 		result : bool,
* 		url: string,
* 		msg: string
* 	}
*/
tool_transcription.prototype.build_subtitles_file = async function() {

	const self = this

	// short vars
		const component_text_area	= self.transcription_component // component_text_area instance
		const lang					= component_text_area.data.lang // !important : get from data, not from context
		const max_charline			= self.characters_per_line // fixed from input 'input_characters_per_line'

	// source. Note that second argument is the name of the function is the action that not has utility here
		const source = create_source(self, 'build_subtitles_file')

	// rqo
		const rqo = {
			dd_api	: 'dd_tools_api',
			action	: 'tool_request',
			source	: source,
			options	: {
				component_tipo	: component_text_area.tipo,
				section_tipo	: component_text_area.section_tipo,
				section_id		: component_text_area.section_id,
				lang			: lang,
				max_charline	: max_charline,
				key				: 0	// fixed component dato key as zero
			}
		}

	// call to the API, fetch data and get response
	return new Promise(function(resolve){

		data_manager.request({
			body : rqo
		})
		.then(function(response){
			if(SHOW_DEVELOPER===true) {
				dd_console("-> build_subtitles_file API response:",'DEBUG', response);
			}

			resolve(response)
		})
	});
}//end build_subtitles_file



/**
* AUTOMATIC_TRANSCRIPTION
* Call the API to transcribe the audiovisual component with the source lang
* using a online service like babel or Google transcribe and save the resulting value
* (!) Tool transcription config transcriber must to be exists in register_tools section
* @param object options
* {
* 	transcriber_engine : string,
* 	transcriber_quality : string
* }
* @return promise response
*/
tool_transcription.prototype.automatic_transcription = async function(options) {

	const self = this

	// options
		const transcriber_engine	= options.transcriber_engine
		const transcriber_quality 	= options.transcriber_quality

	// source lang
		const source_lang = self.transcription_component.lang

	// source. Note that second argument is the name of the function to manage the tool request like 'apply_value'
	// this generates a call as my_tool_name::my_function_name(options)
		const source = create_source(self, 'automatic_transcription')

	// rqo
		const rqo = {
			dd_api	: 'dd_tools_api',
			action	: 'tool_request',
			source	: source,
			options	: {
				source_lang : source_lang,
				transcription_ddo : {
					component_tipo	: self.transcription_component.tipo,
					section_id		: self.transcription_component.section_id,
					section_tipo	: self.transcription_component.section_tipo
				},
				media_ddo : {
					component_tipo		: self.media_component.tipo,
					section_id			: self.media_component.section_id,
					section_tipo		: self.media_component.section_tipo
				},
				transcriber_engine	: transcriber_engine,
				transcriber_quality	: transcriber_quality,
				config				: self.context.config
			}
		}

	// call to the API, fetch data and get response
		return new Promise(function(resolve){

			data_manager.request({
				body : rqo
			})
			.then(function(response){
				if(SHOW_DEVELOPER===true) {
					dd_console("-> automatic_transcription API response:",'DEBUG',response);
				}

				resolve(response)
			})
		})
}//end automatic_transcription



/**
* CHECK_SERVER_TRANSCRIBER_STATUS
* Call the API to check the transcribe server status
* using a online service like babel or Google and check if server has done
* (!) Tool transcription config transcriber must to be exists in register_tools section
*
* @param object options
* {
* 	transcriber_engine : string,
* 	pid : string|int
* }
* @return promise response
*/
tool_transcription.prototype.check_server_transcriber_status = async function(options) {

	const self = this

	// options
		const transcriber_engine	= options.transcriber_engine
		const pid					= options.pid

	// source. Note that second argument is the name of the function to manage the tool request like 'apply_value'
	// this generates a call as my_tool_name::my_function_name(options)
		const source = create_source(self, 'check_server_transcriber_status')

	// rqo
		const rqo = {
			dd_api	: 'dd_tools_api',
			action	: 'tool_request',
			source	: source,
			options	: {
				media_ddo : {
					component_tipo		: self.media_component.tipo,
					section_id			: self.media_component.section_id,
					section_tipo		: self.media_component.section_tipo
				},
				transcriber_engine	: transcriber_engine,
				config				: self.context.config,
				pid 				: pid
			}
		}

	// call to the API, fetch data and get response
		return new Promise(function(resolve){

			data_manager.request({
				body : rqo
			})
			.then(function(response){
				if(SHOW_DEVELOPER===true) {
					dd_console("-> check_server_transcriber_status API response:",'DEBUG',response);
				}

				resolve(response)
			})
		})
}//end check_server_transcriber_status



// @license-end
