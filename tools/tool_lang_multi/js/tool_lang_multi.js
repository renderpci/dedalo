// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// import
	import {clone, dd_console} from '../../../core/common/js/utils/index.js'
	import {data_manager} from '../../../core/common/js/data_manager.js'
	import {ui} from '../../../core/common/js/ui.js'
	import {common, create_source} from '../../../core/common/js/common.js'
	import {tool_common, load_component} from '../../tool_common/js/tool_common.js'
	import {render_tool_lang_multi} from './render_tool_lang_multi.js'



/**
* TOOL_LANG_MULTI
* Tool to translate contents from one language to the rest of the configured languages in any text component
*/
export const tool_lang_multi = function () {

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
}//end page



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	tool_lang_multi.prototype.render	= tool_common.prototype.render
	tool_lang_multi.prototype.destroy	= common.prototype.destroy
	tool_lang_multi.prototype.refresh	= common.prototype.refresh
	tool_lang_multi.prototype.edit		= render_tool_lang_multi.prototype.edit



/**
* INIT
* @param object options
* @return bool common_init
*/
tool_lang_multi.prototype.init = async function(options) {

	const self = this

	// call the generic common tool init
		const common_init = await tool_common.prototype.init.call(this, options);

	// langs
		const lang	= options.lang || page_globals.dedalo_data_lang
		const langs	= clone(page_globals.dedalo_projects_default_langs)
		// sort current lang as first
		const preferredOrder = [lang];
		langs.sort(function (a, b) {
			return preferredOrder.indexOf(b.value) - preferredOrder.indexOf(a.value);
		});

	// set the self specific vars not defined by the generic init (in tool_common)
		self.lang			= lang // page_globals.dedalo_data_lang
		self.langs			= langs // page_globals.dedalo_projects_default_langs
		self.source_lang	= options.caller ? options.caller.lang : lang
		self.target_lang	= null


	return common_init
}//end init



/**
* BUILD_CUSTOM
* @param bool autoload = false
* @return bool common_build
*/
tool_lang_multi.prototype.build = async function(autoload=false) {

	const self = this

	// call generic common tool build
		const common_build = await tool_common.prototype.build.call(this, autoload);

	try {

		// main_element. fix main_element for convenience
			const main_element_ddo	= self.tool_config.ddo_map.find(el => el.role==="main_element")
			self.main_element		= self.ar_instances.find(el => el.tipo===main_element_ddo.tipo)


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


	return common_build
}//end build_custom



/**
* GET_COMPONENT
* @param string lang
* @return object component_instance
*/
tool_lang_multi.prototype.get_component = async function(lang) {

	const self = this

	// to_delete_instances. Select instances with different lang to main_element
		const to_delete_instances = null

	// instance_options (clone context and edit)
		const options = Object.assign(clone(self.main_element.context),{
			self 				: self,
			lang				: lang,
			mode				: 'edit',
			section_id			: self.main_element.section_id,
			to_delete_instances	: to_delete_instances // array of instances to delete after create the new one
		})

	// call generic common tool build
		const component_instance = await load_component(options);


	return component_instance
}//end get_component



/**
* AUTOMATIC_TRANSLATION
* Call the API to translate the source lang component data to the target lang component data
* using a online service like babel or Google translator and save the resulting value
* (!) Tool lang config translator must to be exists in register_tools section
*
* @param string translator
* 	(name like 'babel' must to be defined in tool config)
* @param string source_lang
* 	(like 'lg-eng')
* @param string target_lang
* 	(like 'lg-spa')
* @param HTMLElement buttons_container
* 	(where will be place the message response)
*
* @return object api_response
*/
tool_lang_multi.prototype.automatic_translation = async function(translator, source_lang, target_lang, buttons_container) {

	const self = this

	// source. Note that second argument is the name of the function to manage the tool request like 'apply_value'
	// this generates a call as my_tool_name::my_function_name(options)
		const source = create_source(self, 'automatic_translation')

	// rqo
		const rqo = {
			dd_api	: 'dd_tools_api',
			action	: 'tool_request',
			source	: source,
			options	: {
				source_lang		: source_lang,
				target_lang		: target_lang,
				component_tipo	: self.main_element.tipo,
				section_id		: self.main_element.section_id,
				section_tipo	: self.main_element.section_tipo,
				translator		: translator,
				config			: self.context.config
			}
		}

	// call to the API, fetch data and get response
		const api_response = await data_manager.request({
			body : rqo
		})
		if(SHOW_DEVELOPER===true) {
			dd_console("-> automatic_translation API api_response:",'DEBUG', api_response);
		}

		// user messages
			const msg_type = (api_response.result===false) ? 'error' : 'ok'
			ui.show_message(buttons_container, api_response.msg, msg_type)

		// reload target lang
			const target_component = self.ar_instances.find(el => el.tipo===self.main_element.tipo && el.lang===target_lang)
			target_component.refresh()
			if(SHOW_DEVELOPER===true) {
				dd_console('target_component', 'DEBUG', target_component)
			}

	return api_response
}//end automatic_translation



// @license-end
