/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// import
	import {clone, dd_console} from '../../../core/common/js/utils/index.js'
	import {data_manager} from '../../../core/common/js/data_manager.js'
	import {get_instance, delete_instance} from '../../../core/common/js/instances.js'
	import {common} from '../../../core/common/js/common.js'
	import {tool_common} from '../../tool_common/js/tool_common.js'
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


	return true
};//end page



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	tool_lang_multi.prototype.render 	= common.prototype.render
	tool_lang_multi.prototype.destroy 	= common.prototype.destroy
	tool_lang_multi.prototype.edit 		= render_tool_lang_multi.prototype.edit



/**
* INIT
*/
tool_lang_multi.prototype.init = async function(options) {

	const self = this

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


	// call the generic common tool init
		const common_init = tool_common.prototype.init.call(this, options);


	return common_init
};//end init



/**
* BUILD_CUSTOM
*/
tool_lang_multi.prototype.build = async function(autoload=false) {

	const self = this

	// call generic common tool build
		const common_build = await tool_common.prototype.build.call(this, autoload);

	// main_component. fix main_component for convenience
		const main_component_ddo	= self.tool_config.ddo_map.find(el => el.role==="main_component")
		self.main_component			= self.ar_instances.find(el => el.tipo===main_component_ddo.tipo)

	// specific actions..


	return common_build
};//end build_custom



/**
* LOAD_COMPONENT
*/
tool_lang_multi.prototype.load_component = async function(lang) {

	const self = this

	// to_delete_instances. Select instances with different lang to main_component
		const to_delete_instances = null // self.ar_instances.filter(el => el.lang!==self.main_component.lang)

	// context (clone and edit)
		const context = Object.assign(clone(self.main_component.context),{
			lang		: lang,
			mode		: 'edit',
			section_id	: self.main_component.section_id
		})

	// options
		const options = {
			context				: context,
			to_delete_instances	: to_delete_instances // array of instances to delete after create the new one
		}

	// call generic common tool build
		const component_instance = tool_common.prototype.load_component.call(self, options);


	return component_instance
};//end load_component



/**
* AUTOMATIC_TRANSLATION
*/
	// tool_lang_multi.prototype.automatic_translation = async function(translator, source_lang, target_lang, buttons_container) {

	// 	const self = this

	// 	const body = {
	// 		url 			: self.trigger_url,
	// 		mode 			: 'automatic_translation',
	// 		source_lang 	: source_lang,
	// 		target_lang 	: target_lang,
	// 		component_tipo	: self.caller.tipo,
	// 		section_id  	: self.caller.section_id,
	// 		section_tipo  	: self.caller.section_tipo,
	// 		translator 		: JSON.parse(translator)
	// 	}

	// 	const handle_errors = function(response) {
	// 		if (!response.ok) {
	// 			throw Error(response.statusText);
	// 		}
	// 		return response;
	// 	}

	// 	const trigger_response = await fetch(
	//  		self.trigger_url,
	//  		{
	// 			method		: 'POST',
	// 			mode		: 'cors',
	// 			cache		: 'no-cache',
	// 			credentials	: 'same-origin',
	// 			headers		: {'Content-Type': 'application/json'},
	// 			redirect	: 'follow',
	// 			referrer	: 'no-referrer',
	// 			body		: JSON.stringify(body)
	// 		})
	// 		.then(handle_errors)
	// 		.then(response => response.json()) // parses JSON response into native Javascript objects
	// 		.catch(error => {
	// 			console.error("!!!!! REQUEST ERROR: ",error)
	// 			return {
	// 				result 	: false,
	// 				msg 	: error.message,
	// 				error 	: error
	// 			}
	// 		});

	// 		//trigger_fetch.then((trigger_response)=>{

	// 			// user messages
	// 				const msg_type = (trigger_response.result===false) ? 'error' : 'ok'
	// 				//if (trigger_response.result===false) {
	// 					ui.show_message(buttons_container, trigger_response.msg, msg_type)
	// 				//}

	// 			// reload target lang
	// 				const target_component_container = self.node[0].querySelector('.target_component_container')
	// 				add_component(self, target_component_container, target_lang)

	// 			// debug
	// 				if(SHOW_DEBUG===true) {
	// 					console.log("trigger_response:",trigger_response);
	// 				}
	// 		//})


	// 	return trigger_response
	// };//end automatic_translation


