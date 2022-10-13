/*global page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// import
	import {clone, dd_console} from '../../../core/common/js/utils/index.js'
	import {data_manager} from '../../../core/common/js/data_manager.js'
	// import {get_instance, delete_instance} from '../../../core/common/js/instances.js'
	import {common, create_source} from '../../../core/common/js/common.js'
	import {ui} from '../../../core/common/js/ui.js'
	import {tool_common} from '../../tool_common/js/tool_common.js'
	import {render_tool_lang} from './render_tool_lang.js'



/**
* TOOL_LANG
* Tool to translate contents from one language to other in any text component
*/
export const tool_lang = function () {

	this.id				= null
	this.model			= null
	this.mode			= null
	this.node			= null
	this.ar_instances	= null
	this.status			= null
	this.events_tokens	= null
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
	// tool_lang.prototype.render	= common.prototype.render
	tool_lang.prototype.render		= tool_common.prototype.render
	tool_lang.prototype.destroy		= common.prototype.destroy
	tool_lang.prototype.refresh		= common.prototype.refresh
	tool_lang.prototype.edit		= render_tool_lang.prototype.edit



/**
* INIT
*/
tool_lang.prototype.init = async function(options) {

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

		// target translator. When user changes it, a local DB var is stored as 'translator_engine_select' in table 'status'
			const translator_engine_select_object = await data_manager.get_local_db_data(
				'translator_engine_select',
				'status'
			)
			if (translator_engine_select_object) {
				self.target_translator = translator_engine_select_object.value
			}

	} catch (error) {
		self.error = error
		console.error(error)
	}


	return common_init
}//end init



/**
* BUILD
* Custom build
*/
tool_lang.prototype.build = async function(autoload=false) {

	const self = this

	// call generic common tool build
		const common_build = await tool_common.prototype.build.call(this, autoload);

	try {

		// main_element. fix main_element for convenience
			const main_element_ddo = self.tool_config.ddo_map.find(el => el.role==='main_element')
			if (main_element_ddo) {
				self.main_element = self.ar_instances.find(el => el.tipo===main_element_ddo.tipo)
			}

		// status_user_component. control the tool status process for users
			const status_user_ddo = self.tool_config.ddo_map.find(el => el.role==='status_user_component')
			if (status_user_ddo) {
				self.status_user_component = self.ar_instances.find(el => el.tipo===status_user_ddo.tipo)
			}

		// status_admin_component. control the tool status process for administrators
			const status_admin_ddo = self.tool_config.ddo_map.find(el => el.role==='status_admin_component')
			if (status_admin_ddo) {
				self.status_admin_component	= self.ar_instances.find(el => el.tipo===status_admin_ddo.tipo)
			}

		// target lang. When user changes it, a local DB var is stored as 'tool_lang_target_lang' in table 'status'
			const tool_lang_target_lang_object = await data_manager.get_local_db_data(
				'tool_lang_target_lang',
				'status'
			)
			if (tool_lang_target_lang_object) {
				self.target_lang = tool_lang_target_lang_object.value
			}


	} catch (error) {
		self.error = error
		console.error(error)
	}


	return common_build
}//end build_custom



/**
* LOAD_COMPONENT
*/
tool_lang.prototype.load_component = async function(lang) {

	const self = this

	// to_delete_instances. Select instances with different lang to main_element
		const to_delete_instances = self.ar_instances.filter(el => el.lang!==self.main_element.lang)

	// context (clone and edit)
		const source_context	= clone(self.main_element.context)
		const context			= Object.assign(source_context, {
			lang		: lang,
			mode		: 'edit',
			section_id	: self.main_element.section_id
		})

	// options
		const options = {
			context				: context,
			to_delete_instances	: to_delete_instances // array of instances to delete after create the new one
		}

	// call generic common tool build
		const component_instance = tool_common.prototype.load_component.call(self, options);


	return component_instance
}//end load_component



/**
* AUTOMATIC_TRANSLATION
* Call the API to translate the source lang component data to the target lang component data
* using a online service like babel or Google translator and save the resulting value
* (!) Tool lang config translator must to be exists in register_tools section
*
* @para string translator (name like 'babel' must to be defined in tool config)
* @param string source_lang (like 'lg-eng')
* @param string target_lang (like 'lg-spa')
* @param DOM element buttons_container (where will be place the message response)
*
* @return promise response
*/
tool_lang.prototype.automatic_translation = async function(translator, source_lang, target_lang, buttons_container) {

	const self = this

	// source. Note that second argument is the name of the function to manage the tool request like 'apply_value'
	// this generates a call as my_tool_name::my_function_name(arguments)
		const source = create_source(self, 'automatic_translation')
		// add the necessary arguments used in the given function
		source.arguments = {
			source_lang		: source_lang,
			target_lang		: target_lang,
			component_tipo	: self.main_element.tipo,
			section_id		: self.main_element.section_id,
			section_tipo	: self.main_element.section_tipo,
			translator		: translator,
			config			: self.context.config
		}

	// rqo
		const rqo = {
			dd_api	: 'dd_tools_api',
			action	: 'tool_request',
			source	: source
		}

	// call to the API, fetch data and get response
		return new Promise(function(resolve){

			data_manager.request({
				body : rqo
			})
			.then(function(response){
				dd_console("-> automatic_translation API response:",'DEBUG',response);

				// user messages
					const msg_type = (response.result===false) ? 'error' : 'ok'
					//if (trigger_response.result===false) {
						ui.show_message(buttons_container, response.msg, msg_type)
					//}

				// reload target lang
					const target_component = self.ar_instances.find(el => el.tipo===self.main_element.tipo && el.lang===target_lang)
					target_component.refresh()
					dd_console('target_component', 'DEBUG', target_component)

				resolve(response)
			})
		})
}//end automatic_translation
