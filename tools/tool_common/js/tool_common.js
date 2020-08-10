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
*/
tool_common.prototype.init = async function(options) {

	const self = this

	// set vars
	self.model				= options.model
	self.tool_section_tipo 	= options.tool_object.section_tipo
	self.tool_section_id	= options.tool_object.section_id
	self.mode 				= options.mode
	self.caller 			= options.caller
	self.node				= []
	self.type				= 'tool'
	self.ar_instances		= []
	self.events_tokens 		= []
	self.lang 				= options.lang
	self.simple_tool_object	= null // the 'simple_tool_object' will be loaded by the build method in tool_common
	//get_label called by the different tools for obtain the own label in the current lang. The scope is for every tool.
	self.get_label 			= get_label

	// set status
		self.status = 'initied'



	return true
};//end init



/**
* BUILD
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

			// dd_request. Create the basic dd_request
				const dd_request = {show: []}

				// tool source for component json that stores full tool config
				const source = {
					typo			: "source",
					action			: 'get_data',
					model 			: 'component_json',
					tipo 			: 'dd1353',
					section_tipo	: self.tool_section_tipo,
					section_id		: self.tool_section_id,
					mode 			: 'edit',
					lang 			: 'lg-nolan'
				}
				dd_request.show.push(source)

			// load data. Load section data from db of the current tool.
			// Tool data configuration is inside the tool_registered section 'dd1324' and parsed into component_json 'dd1353',
			// The tool info was generated when it was imported / registered by admin
				const current_data_manager	= new data_manager()
				const api_response			= await current_data_manager.read(dd_request.show)
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
* @param tool_object options
* @param self instance_caller
*
* @return instance tool
*
* Called by page observe event (init)
* To load tool, don't call directly, publish event as
*	event_manager.publish('load_tool', {
*		self 		: self,
*		tool_object : tool_object
*	})
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

	// render
		tool_instance.render()


	return tool_instance
};//end load_tool



/**
* TRIGGER_REQUEST
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
				result 	: false,
				msg 	: error.message,
				error 	: error
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
* return the label in the current language, if the label is not defined in current lang
*/
const get_label = function(label_name) {

	const self = this

	const tool_labels 	= self.simple_tool_object.labels
	const lang_default 	= page_globals.dedalo_application_langs_default

	let label_item = tool_labels.find(item => item.name===label_name && item.lang===self.lang).value
	if(typeof label_item==='undefined'){
		label_item = tool_labels.find(item => item.name===label_name && item.lang===lang_default).value
	}
	if(typeof label_item==='undefined'){
		label_item = tool_labels.find(item => item.name===label_name).value
	}
	if(typeof label_item==='undefined'){
		label_item = label_name
	}

	return label_item
};//end get_label
