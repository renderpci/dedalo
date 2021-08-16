/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../../core/common/js/event_manager.js'
	import {data_manager} from '../../../core/common/js/data_manager.js'
	import {get_instance, delete_instance} from '../../../core/common/js/instances.js'
	import {common} from '../../../core/common/js/common.js'
	import {clone, dd_console} from '../../../core/common/js/utils/index.js'



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
	// dd_console(`init tool options`, 'DEBUG', options)
	
	const self = this

	// options
		self.model			= options.model
		self.section_tipo	= options.section_tipo
		self.section_id		= options.section_id
		self.lang			= options.lang
		self.mode			= options.mode || 'edit'
		self.label			= options.label
		self.tool_labels	= options.tool_labels
		self.description	= options.description
		self.tool_config	= options.tool_config
		self.config			= options.config
		self.caller			= options.caller // optional, only for refresh on tool exit

	// set vars
		self.node				= []
		self.type				= 'tool'
		self.ar_instances		= []
		self.events_tokens		= []
		// self.simple_tool_object	= null // the 'simple_tool_object' will be loaded by the build method in tool_common
		self.get_tool_label			= get_tool_label // function get_label called by the different tools to obtain the own label in the current lang. The scope is for every tool.

	// set vars
		// self.model				= options.model
		// self.tool_section_tipo	= options.tool_object.section_tipo
		// self.tool_section_id		= options.tool_object.section_id
		// self.mode				= options.mode
		// self.lang				= options.lang
		// self.caller				= options.caller
		// self.node				= []
		// self.type				= 'tool'
		// self.ar_instances		= []
		// self.events_tokens		= []
		// self.simple_tool_object	= null // the 'simple_tool_object' will be loaded by the build method in tool_common
		// self.get_label			= get_tool_label

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

	// load self style
		const tool_css_url = DEDALO_TOOLS_URL + '/' + self.model + "/css/" + self.model + ".css"
		common.prototype.load_style(tool_css_url)

	// data manager
		const current_data_manager = new data_manager()

	// ddo_map load all elements inside ddo_map
		const ar_promises = []
		const ddo_map = self.tool_config.ddo_map
		for (let i = 0; i < ddo_map.length; i++) {

			const el = ddo_map[i]

			ar_promises.push( new Promise(async (resolve) => {

				// context. In is not given get from caller or request to the API
					const context = el.context
						? el.context
						: await (async function(){
							// caller context
							const caller_context = (self.caller && self.caller.context) ? clone(self.caller.context) : null
							if (caller_context && caller_context.tipo===el.tipo && caller_context.section_tipo===el.section_tipo) {
								// get context from available caller
								return caller_context
							}
							// resolve whole context from API (init event observer problem..)
							// const api_response	= await current_data_manager.get_element_context(el)
							// return api_response.result[0]
							return {}
						  })()

				// generic try
					// const element_instance = load_component_generic({
					// 	self				: self,
					// 	context				: context,
					// 	to_delete_instances	: null
					// })
					// resolve(element_instance)

				const element_options = {
					model			: el.model,
					mode			: el.mode,
					tipo			: el.tipo,
					section_tipo	: el.section_tipo,
					section_id		: el.section_id,
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

	// component_json simple_tool_object
		// const simple_tool_object_tipo = 'dd1353'

	// load data if is not already received as option
		// if (autoload===true) {

		// 	// mandatory vars check
		// 		if (!self.tool_section_tipo || self.tool_section_tipo.lenght<2) {
		// 			console.warn("[tool_common.build] Error. Undefined mandatory self.tool_section_tipo:", self.tool_section_tipo);
		// 			return false
		// 		}
		// 		if (!self.tool_section_id || self.tool_section_id.lenght<2) {
		// 			console.warn("[tool_common.build] Error. Undefined mandatory self.tool_section_id:", self.tool_section_id);
		// 			return false
		// 		}

		// 	// rqo. Create the basic rqo to load tool config data stored in component_json tipo 'dd1353'
		// 		const rqo = {
		// 			action	: 'read',
		// 			// tool source for component JSON that stores full tool config
		// 			source : {
		// 				action			: 'get_data',
		// 				model			: 'component_json',
		// 				tipo			: 'dd1353',
		// 				section_tipo	: self.tool_section_tipo,
		// 				section_id		: self.tool_section_id,
		// 				mode			: 'edit',
		// 				lang			: 'lg-nolan'
		// 			},
		// 			prevent_lock : true
		// 		}

		// 	// load data. Load section data from db of the current tool.
		// 	// Tool data configuration is inside the tool_registered section 'dd1324' and parsed into component_json 'dd1353',
		// 	// The tool info was generated when it was imported / registered by admin
		// 		const current_data_manager	= new data_manager()
		// 		const api_response			= await current_data_manager.request({body:rqo})
		// 		const data					= api_response.result.data

		// 	// config set
		// 		// simple_tool_object
		// 			const simple_tool_object	= data.find(item => item.section_id===self.tool_section_id && item.tipo===simple_tool_object_tipo).value
		// 			self.simple_tool_object		= simple_tool_object[0];
		// 		// label
		// 			const label					= self.simple_tool_object.label.find(item => item.lang===self.lang);
		// 			self.label					= typeof label!=='undefined' ? label.value : self.model
		// 		// description
		// 			const description			= self.simple_tool_object.description.find(item => item.lang===self.lang)
		// 			self.description			= typeof description!=='undefined' ? description.value : null

		// 	// debug
		// 		if(SHOW_DEBUG===true) {
		// 			console.log("[tool_common.build] api_response:", api_response);
		// 		}
		// }

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
* LOAD_COMPONENT
* Loads component to place in respective containers: current preview and preview version
* @param object options
* 	context: object
* 	to_delete_instances: array of instance object
* @return promise: object component_instance
*/
tool_common.prototype.load_component = async function(options) {
	// console.log("load_component:",lang, mode, matrix_id);

	const self = this

	// options
		const context				= clone(options.context)
		const to_delete_instances	= options.to_delete_instances

	// short vars
		const model			= context.model
		const mode			= context.mode
		const tipo			= context.tipo
		const section_tipo	= context.section_tipo
		const section_lang	= context.section_lang
		const lang			= context.lang
		const type			= context.type
		const section_id	= context.section_id || null
		const matrix_id		= context.matrix_id || null
		const id_variant	= self.model

	// component instance_options
		const instance_options = {
			model			: model,
			mode			: mode,
			tipo			: tipo,
			section_tipo	: section_tipo,
			section_id		: section_id,
			lang			: lang,
			section_lang	: section_lang,
			type			: type,
			context			: context,
			id_variant		: id_variant, // id_variant prevents id conflicts
			caller			: self // set current tool as component caller (to check if component is inside tool or not)
		}

		if (matrix_id) {
			instance_options.matrix_id = matrix_id
		}

	// get instance and init
		const component_instance = await get_instance(instance_options)

	// clean instances
		if (to_delete_instances && to_delete_instances.length>0) {
			for (let i = self.ar_instances.length - 1; i >= 0; i--) {
				const current_instance = self.ar_instances[i]
				if (to_delete_instances.indexOf(current_instance)!==-1) {
					// destroy previous preview component instances
					const instance_index = self.ar_instances.findIndex( el => el.id===current_instance.id)
					// dd_console(`To delete instance index:`, 'DEBUG', instance_index)
					// remove from array of instances
					if (instance_index!==-1) {
						self.ar_instances.splice(instance_index, 1)
						// destroy instance
						await current_instance.destroy()
					}else{
						console.error("Error on delete previous component instance")
					}
				}
			}
		}

	// add component instance to current ar_instances if not already done
		const instance_found = self.ar_instances.find( el => el===component_instance )
		if (!instance_found) {
			self.ar_instances.push(component_instance)
		}

	// build
		await component_instance.build(true)


	return component_instance
};//end load_component



/**
* LOAD_TOOL
* Init, build and render the tool requested.
* Called by page observe event (init)
* To load tool, don't call directly, publish a event as
*	event_manager.publish('load_tool', {
*		self 		: self,
*		tool_object : tool_object
*	})
* The event is fired by the tool button created with method ui.build_tool_button.
* When the user triggers the click event, a publish 'load_tool' is made
* @param tool_object options
* @param self instance_caller
*
* @return tool instance | bool false
*/
export const load_tool = async (options) => {
	// dd_console(`load tool options`, 'DEBUG', options)

	// options
		const caller		= options.caller
		const tool_context	= clone(options.tool_context) // (!) full clone here to avoid circular references


		// tool_config. If is received, parse section_id. Else create a new one on the fly
		// to preserve the format of tool_context.tool_config ddo_map
			if (!tool_context.tool_config) {

				// create a new one on the fly
				tool_context.tool_config = {
					ddo_map : [{
						tipo			: caller.tipo,
						section_tipo	: caller.section_tipo,
						section_id		: caller.section_id,
						model			: caller.model,
						mode			: 'edit',
						role			: 'main_component'
					}]
				}

			}else{

				// parse ddo_map section_id
				tool_context.tool_config.ddo_map.map(el => {
					if (el.section_id==='self' && el.section_tipo === caller.section_tipo) {
						el.section_id = caller.section_id
					}
				})
			}

		// lang set
			tool_context.lang = caller.lang

	// instance options
		const intance_options = Object.assign({
			caller : caller // add caller to tool_context (only to refresh it on close the tool)
		}, tool_context)
		// dd_console(`instance_options`, 'DEBUG', intance_options)

	// instance load / recover
		const tool_instance = await get_instance(intance_options)


	// stop if already loaded (toggle tool)
		if (tool_instance.status && tool_instance.status!=='initied') {
			return false
		}

	// build
		await tool_instance.build(true)

	// render tool (don't wait here)
		tool_instance.render()


	return tool_instance


	// // options
	// 	const caller		= options.caller
	// 	const tool_object	= options.tool_object

	// // instance load / recover
	// 	const tool_instance = await get_instance({
	// 		model 			: tool_object.name,
	// 		tipo 			: caller.tipo,
	// 		section_tipo 	: caller.section_tipo,
	// 		section_id 		: caller.section_id,
	// 		mode 			: caller.mode,
	// 		lang 			: page_globals.dedalo_data_lang,
	// 		caller 			: caller,
	// 		tool_object		: tool_object
	// 	})

	// // stop if already loaded (toggle tool)
	// 	if (tool_instance.status && tool_instance.status!=='initied') {
	// 		return false
	// 	}

	// // build
	// 	await tool_instance.build(true)

	// // render tool (don't wait here)
	// 	tool_instance.render()


	// return tool_instance
};//end load_tool




/**
* OPEN_TOOL
* Open the tool requested. Create the necessary elements
* to load a tool from basic options (called from 'grid_indexation')
* @param tool_object options
*
* @return tool instance | bool false
*/
export const open_tool = async (options) => {
	console.log("open_tool options:",options);

	alert("Called Open Tool");
};//end open_tool


/**
* TRIGGER_REQUEST
* This is a common tool API request way
*/
	// export const trigger_request = async function(trigger_url, body) {
	// 	const t0 = performance.now()

	// 	const handle_errors = function(response) {
	// 		if (!response.ok) {
	// 			throw Error(response.statusText);
	// 		}
	// 		return response;
	// 	}

	// 	const trigger_response = await fetch(
	//  		trigger_url,
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
	// 				result	: false,
	// 				msg		: error.message,
	// 				error	: error
	// 			}
	// 		});


	// 	// debug
	// 		if(SHOW_DEBUG===true) {
	// 			console.log("__Time to trigger_request", self.model, " ms:", performance.now()-t0);
	// 		}


	// 	return trigger_response
	// };//end trigger_request



/**
* GET_TOOL_LABEL
* Return the label in the current language.
* If the label is not defined, try with lang_default, not lang and received label_name if nothing is found
* 
* @param string label_name like 'indexation_tool'
* @return string label_item like 'Indexation Tool'
*/
const get_tool_label = function(label_name) {

	const self = this

	const tool_labels 	= self.tool_labels
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
};//end get_tool_label


