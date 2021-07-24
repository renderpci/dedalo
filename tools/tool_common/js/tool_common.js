/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../../core/common/js/event_manager.js'
	import {data_manager} from '../../../core/common/js/data_manager.js'
	import {get_instance, delete_instance} from '../../../core/common/js/instances.js'
	import {common} from '../../../core/common/js/common.js'



export const tool_common = function(){

	return true
};//end tool_common



/**
* INIT
* Generic tool init function.
* 
* @param object options
* Sample:
* {
* 	caller: component_text_area {id: "component_text_area_rsc36_rsc167_1_edit_lg-eng_rsc167", …}
*	lang: "lg-eng"
*	mode: "edit"
*	model: "tool_indexation"
*	section_id: "1"
*	section_tipo: "rsc167"
*	tipo: "rsc36"
*	tool_object: {section_id: "2", section_tipo: "dd1324", name: "tool_indexation", label: "Tool Indexation", icon: "/v6/tools/tool_indexation/img/icon.svg", …}
* }
*/
tool_common.prototype.init = async function(options) {
	
	const self = this

	// set vars
		self.model				= options.model
		self.tool_section_tipo	= options.tool_object.section_tipo
		self.tool_section_id	= options.tool_object.section_id
		self.mode				= options.mode
		self.lang				= options.lang
		self.caller				= options.caller
		self.node				= []
		self.type				= 'tool'
		self.ar_instances		= []
		self.events_tokens		= []		
		self.simple_tool_object	= null // the 'simple_tool_object' will be loaded by the build method in tool_common	
		self.get_label			= get_label // function get_label called by the different tools to obtain the own label in the current lang. The scope is for every tool.

	// set status
		self.status = 'initied'


	return true
};//end init



/**
* BUILD
* Generic tool build function. Load basic tool config info (stored in component_json dd1353) and css files
* 
* @param bool autoload
* @return promise bool
*/
tool_common.prototype.build = async function(autoload=false) {
	const t0 = performance.now()

	const self = this

	// status update
		self.status = 'building'

	// component_json simple_tool_object
		const simple_tool_object_tipo = 'dd1353'

	// load self style
		const tool_css_url = DEDALO_TOOLS_URL + '/' + self.model + "/css/" + self.model + ".css"
		common.prototype.load_style(tool_css_url)

	// load data if is not already received as option
		if (autoload===true) {

			// mandatory vars check
				if (!self.tool_section_tipo || self.tool_section_tipo.lenght<2) {
					console.warn("[tool_common.build] Error. Undefined mandatory self.tool_section_tipo:", self.tool_section_tipo);
					return false
				}
				if (!self.tool_section_id || self.tool_section_id.lenght<2) {
					console.warn("[tool_common.build] Error. Undefined mandatory self.tool_section_id:", self.tool_section_id);
					return false
				}

			// rqo. Create the basic rqo
				const rqo = {
					action	: 'read',
					// tool source for component JSON that stores full tool config
					source : {
						action			: 'get_data',
						model			: 'component_json',
						tipo			: 'dd1353',
						section_tipo	: self.tool_section_tipo,
						section_id		: self.tool_section_id,
						mode			: 'edit',
						lang			: 'lg-nolan'
					},
					prevent_lock : true
				}

			// load data. Load section data from db of the current tool.
			// Tool data configuration is inside the tool_registered section 'dd1324' and parsed into component_json 'dd1353',
			// The tool info was generated when it was imported / registered by admin
				const current_data_manager	= new data_manager()
				const api_response			= await current_data_manager.request({body:rqo})
				const data					= api_response.result.data

			// config set
				// simple_tool_object
					const simple_tool_object	= data.find(item => item.section_id===self.tool_section_id && item.tipo===simple_tool_object_tipo).value
					self.simple_tool_object		= simple_tool_object[0];
				// label
					const label					= self.simple_tool_object.label.find(item => item.lang===self.lang);
					self.label					= typeof label!=='undefined' ? label.value : self.model
				// description
					const description			= self.simple_tool_object.description.find(item => item.lang===self.lang)
					self.description			= typeof description!=='undefined' ? description.value : null

			// debug
				if(SHOW_DEBUG===true) {
					console.log("[tool_common.build] api_response:", api_response);
				}
		}

	// debug
		if(SHOW_DEBUG===true) {
			console.log("__Time to build", self.model, " ms:", performance.now()-t0);
		}


	// status update
		self.status = 'builded'


	return true
};//end build



/**
* LOAD_TOOL
*
* Called by page observe event (init)
* To load tool, don't call directly, publish a event as
*	event_manager.publish('load_tool', {
*		self 		: self,
*		tool_object : tool_object
*	})
* 
* @param tool_object options
* @param self instance_caller
*
* @return instance tool
*/
export const load_tool = async (options) => {

	const self 			= options.self
	const tool_object 	= options.tool_object
	const lang 			= page_globals.dedalo_data_lang

	// instance load / recover
		const tool_instance = await get_instance({
			model 			: tool_object.name,
			tipo 			: self.tipo,
			section_tipo 	: self.section_tipo,
			section_id 		: self.section_id,
			mode 			: self.mode,
			lang 			: lang,
			caller 			: self,
			tool_object		: tool_object
		})

	// destroy if already loaded (toggle tool)
		if (tool_instance.status && tool_instance.status!=='initied') {
			// tool_instance.destroy(true, true, true)
			return false
		}

	// build
		await tool_instance.build(true)

	// render tool (don't wait here)
		tool_instance.render()


	return tool_instance
};//end load_tool



/**
* TRIGGER_REQUEST
* This is a common tool API request way
*/
export const trigger_request = async function(trigger_url, body) {
	const t0 = performance.now()

	const handle_errors = function(response) {
		if (!response.ok) {
			throw Error(response.statusText);
		}
		return response;
	}

	const trigger_response = await fetch(
 		trigger_url,
 		{
			method		: 'POST',
			mode		: 'cors',
			cache		: 'no-cache',
			credentials	: 'same-origin',
			headers		: {'Content-Type': 'application/json'},
			redirect	: 'follow',
			referrer	: 'no-referrer',
			body		: JSON.stringify(body)
		})
		.then(handle_errors)
		.then(response => response.json()) // parses JSON response into native Javascript objects
		.catch(error => {
			console.error("!!!!! REQUEST ERROR: ",error)
			return {
				result	: false,
				msg		: error.message,
				error	: error
			}
		});


	// debug
		if(SHOW_DEBUG===true) {
			console.log("__Time to trigger_request", self.model, " ms:", performance.now()-t0);
		}


	return trigger_response
};//end trigger_request



/**
* GET_LABEL
* Return the label in the current language.
* If the label is not defined, try with lang_default, not lang and received label_name if nothing is found
* 
* @param string label_name like 'indexation_tool'
* @return string label_item like 'Indexation Tool'
*/
const get_label = function(label_name) {

	const self = this

	const tool_labels 	= self.simple_tool_object.labels
	const lang_default 	= page_globals.dedalo_application_langs_default

	let label_item = tool_labels.find(item => item.name===label_name && item.lang===self.lang).value
	if(typeof label_item==='undefined'){
		
		label_item = tool_labels.find(item => item.name===label_name && item.lang===lang_default).value

		if(typeof label_item==='undefined'){

			label_item = tool_labels.find(item => item.name===label_name).value

			if(typeof label_item==='undefined'){
				label_item = label_name
			}
		}
	}	
	

	return label_item
};//end get_label


