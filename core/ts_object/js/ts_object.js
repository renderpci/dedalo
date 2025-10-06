// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'
	import {common} from '../../common/js/common.js'
	import {
		get_instance,
		add_instance,
		get_instance_by_id,
		get_all_instances,
		get_instances_custom_map,
		delete_instance
	} from '../../common/js/instances.js'
	import {object_to_url_vars, open_window} from '../../common/js/utils/index.js'
	import {event_manager} from '../../common/js/event_manager.js'
	import {dd_request_idle_callback, when_in_dom} from '../../common/js/events.js'
	import {data_manager} from '../../common/js/data_manager.js'
	import {render_edit_ts_object} from './render_edit_ts_object.js'
	import {render_children} from './view_default_edit_ts_object.js'



/**
* TS_OBJECT
* Manages a single thesaurus row element
*/
export const ts_object = function() {

	// string id. Composed by key_parts list
	this.id
	// string model. Fix 'ts_object' value.
	this.model
	// string mode. Default is 'edit'.
	this.mode
	// object|null caller. Caller instance pointer. Is area_thesaurus/area_ontology for roots and ts_object for others.
	this.caller
	// object linker. Used for tool indexation
	// E.g.  {
	// 	id		: caller_id,
	// 	caller	: indexing_component
	// }
	this.linker

	// string section_tipo. Current thesaurus item section_tipo
	this.section_tipo
	// string|int section_id. Current thesaurus item section_tipo
	this.section_id
	// string children_tipo. Tipo of the componetn_children for current section (for easy access)
	this.children_tipo
	// string target_section_tipo. Tipo of the target section for current item.
		// this.target_section_tipo
	// bool is_root_node. Identifies the area_thesaurus/area_ontology direct 'children'
	// This elements do not have 'parent', they are linked by a portal in hierarchy section.
	this.is_root_node
	// int virtual_order. Calculated element order based on 'order' filed value and the position into the children array
	this.virtual_order

	// object data. Data from current instance (term)
	this.data
	// object children_data. E.g. {
	//	  ar_children_data : [{ar_elements:[]...}],
	//	  pagination : {"limit": 300,"offset": 0,"total": 2}
	// }
	this.children_data

	// string ts_id. Node contraction of section_tipo + section_id as tipo like 'dd256'
	this.ts_id
	// string ts_parent. Parent contraction of section_tipo + section_id as tipo like 'dd98'
	this.ts_parent

	// bool is_descriptor. False for non descriptors (ND)
	this.is_descriptor
	// bool is_ontology. If caller model is 'area_ontology' is true, false otherwise.
	this.is_ontology

	// vars from options
	// Set on update element in DOM (refresh)
	this.element_to_hilite
	// thesaurus_mode . Defines appearance of thesaurus
	this.thesaurus_mode
	// thesaurus_view_mode. Values: model|default
	this.thesaurus_view_mode
	// events_tokens
	this.events_tokens = []
	// bool is_open. Default false
	this.is_open = false
	// status
	this.status
	// instances
	this.ar_instances = []

	// int permissions_button_delete. Values from 0,1,2,3
	this.permissions_button_delete
	// int permissions_button_new. Values from 0,1,2,3
	this.permissions_button_new
	// int permissions_indexation. Values from 0,1,2,3
	this.permissions_indexation

	// bool has_descriptor_children. Identifies is current node has or not descriptor children
	this.has_descriptor_children
	// string area_model. Model of current thesaurus/ontology area
	this.area_model

	// HTMLElement wrapper DOM node. Set on render render_wrapper
	this.node
	// HTMLElement children_container
	this.children_container
	// HTMLElement link_children_element
	this.link_children_element
	// HTMLElement term_node
	this.term_node
	// HTMLElement term_text (inside term_node)
	this.term_text
	// HTMLElement data_container
	this.data_container
	// HTMLElement indexations_container
	this.indexations_container
	// HTMLElement nd_container
	this.nd_container
}//end ts_object



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	ts_object.prototype.render	= common.prototype.render
	ts_object.prototype.refresh	= common.prototype.refresh
	ts_object.prototype.destroy	= common.prototype.destroy

	// render
	ts_object.prototype.edit			= render_edit_ts_object.prototype.edit
	ts_object.prototype.search			= render_edit_ts_object.prototype.edit
	ts_object.prototype.render_children	= render_children



/**
* KEY_ORDER
* Defines de vars and the order to create the instances key
*/
const key_order = ['section_tipo','section_id','children_tipo','target_section_tipo','thesaurus_mode']



/**
* GET_INSTANCE
* Returns an instance of a ts_object by either retrieving it from a cache or dynamically importing and initializing it.
* - If the instance is cached, it is returned immediately.
* - If not cached, is instantiated, initialized, cached, and returned.
* @param object options
* @return object instance_element
*/
ts_object.get_instance = async function (options) {

	const key = key_instances_builder(options)

	// search. Check if the instance is already in the cache
	const found_instance = get_instance_by_id(key)
	if (found_instance) {
		return found_instance;
	}

	// Get the ts_object instance
	const instance_element = new ts_object()

	// id
	instance_element.id = key

	// Init the new instance
	await instance_element.init(options)

	// Cache instance
	add_instance(key, instance_element)


	return instance_element
}//end get_instance



/**
* KEY_INSTANCES_BUILDER
* Builds a normalized string key from selected properties of the given `options` object.
* The key is used to uniquely identify an instance based on a defined order of parameters.
* @param object options
* @return string key - A concatenated, underscore-delimited string key composed of non-empty values.
*/
export const key_instances_builder = function(options) {

	const key_parts = []

	for (const prop of key_order) {
		const value = options[prop];
		if (value !== undefined && value !== null && value !== '') {
			const string_value = String(value);
			key_parts.push(string_value);
		}
	}

	// join all non empty elements in an string used as ID for the instance
	return 'ts_object_' + key_parts.join('_')
}//end key_instances_builder



/**
* INIT
* Setup the ts instance
* @param object options
* @return
*/
ts_object.prototype.init = async function(options) {

	const self = this

	// status update
	self.status = 'initializing'

	// string model. Fix 'ts_object' value.
	self.model = 'ts_object'
	// string mode. Default is 'edit'.
	self.mode = options.mode || 'edit'
	// object|null caller. Caller instance pointer. Is area_thesaurus/area_ontology for roots and ts_object for others.
	self.caller	= options.caller
	// object linker. Used for tool indexation
	// E.g.  {
	// 	id		: caller_id,
	// 	caller	: indexing_component
	// }
	self.linker	= options.linker
	// string section_tipo. Current thesaurus item section_tipo
	self.section_tipo = options.section_tipo
	// string|int section_id. Current thesaurus item section_tipo
	self.section_id = options.section_id
	// string children_tipo. Tipo of the componetn_children for current section (for easy access)
	self.children_tipo = options.children_tipo
	// string target_section_tipo. Tipo of the target section for current item.
		// self.target_section_tipo = options.target_section_tipo
	// bool is_root_node. Identifies the area_thesaurus/area_ontology direct 'children'
	// This elements do not have 'parent', they are linked by a portal in hierarchy section.
	self.is_root_node = options.is_root_node
	// int virtual_order. Calculated element order based on 'order' filed value and the position into the children array
	self.virtual_order = options.virtual_order
	// object data. Data from current instance (term)
	self.data = options.data
	// object children_data. E.g. {
	//	  ar_children_data : [{ar_elements:[]...}],
	//	  pagination : {"limit": 300,"offset": 0,"total": 2}
	// }
	self.children_data = options.children_data
	// string ts_id. Node contraction of section_tipo + section_id as tipo like 'dd256'
	self.ts_id = options.ts_id
	// string ts_parent. Parent contraction of section_tipo + section_id as tipo like 'dd98'
	self.ts_parent = options.ts_parent

	// bool is_ontology. If caller model is 'area_ontology' is true, false otherwise.
	self.is_ontology = options.is_ontology
	// string thesaurus_mode. Special thesaurus mode from properties. Default is 'default'
	self.thesaurus_mode = options.thesaurus_mode
	// string thesaurus_view_mode. Values: model|default
	self.thesaurus_view_mode = options.thesaurus_view_mode
	// int permissions_button_delete. Values from 0,1,2,3
	self.permissions_button_delete = options.permissions_button_delete
	// int permissions_button_new. Values from 0,1,2,3
	self.permissions_button_new	= options.permissions_button_new
	// int permissions_indexation. Values from 0,1,2,3
	self.permissions_indexation	= options.permissions_indexation
	// string area_model. Model of current thesaurus/ontology area
	self.area_model = options.area_model

	// status update
	self.status = 'initialized'


	return true
}//end init



/**
* BUILD
* Generic agnostic build function created to maintain
* unity of calls.
* (!) For components, remember use always component_common.build()
* @param bool autoload = false
* @return bool
*/
ts_object.prototype.build = async function(autoload=false) {

	const self = this

	// status update
		self.status = 'building'

	// load node data from database
		if (!self.data || autoload===true) {

			// Get and fix
			self.data = await self.get_node_data()
		}

	// fix vars from data
		if (self.data) {
			// fix permissions
			self.permissions_button_new		= self.data.permissions_button_new
			self.permissions_button_delete	= self.data.permissions_button_delete
			self.permissions_indexation		= self.data.permissions_indexation
			self.permissions_structuration	= self.data.permissions_structuration

			self.is_descriptor				= self.data.is_descriptor
			self.is_indexable				= self.data.is_indexable

			self.ts_id						= self.data.ts_id || self.ts_id
			self.ts_parent					= self.data.ts_parent || self.ts_parent
			self.order						= self.data.order
			self.has_descriptor_children	= self.data.has_descriptor_children
		}

	// status update
		self.status = 'built'


	return true
}//end common.prototype.build



/**
* GET_NODE_DATA
* Get the instance JSON data from the server across the API request.
* Data is built from current node info (current instance section_tipo and section_id)
* @return promise
* 	Resolve object api_response.result {ar_children_data: [], pagination: {}}
*/
ts_object.prototype.get_node_data = async function() {

	const self = this

	// short vars
		const caller				= self.caller
		const thesaurus_view_mode	= caller.thesaurus_view_mode
		const terms_are_model		= thesaurus_view_mode==='model'
		const section_tipo			= self.section_tipo
		const section_id			= self.section_id
		const children_tipo			= self.children_tipo

	try {

		// API call
		const rqo = {
			dd_api			: 'dd_ts_api',
			prevent_lock	: true,
			action			: 'get_node_data',
			source			: {
				section_id		: section_id,
				section_tipo	: section_tipo,
				children_tipo	: children_tipo,
				area_model		: self.area_model,
				build_options	: {
					terms_are_model : terms_are_model
				}
			},
			options : {
				thesaurus_view_mode	: thesaurus_view_mode
			}
		}

		const api_response = await data_manager.request({
			use_worker	: false,
			body		: rqo
		})
		// debug
		if(SHOW_DEBUG===true) {
			console.log('get_node_data api_response:', api_response);
		}

		// Validate response structure
		if (!api_response || typeof api_response !== 'object') {
			throw new Error("Invalid API response format");
		}

		if (api_response.result) {

			// success case

			return api_response.result

		}else{

			// error case

			console.warn("[get_node_data] Error, api_response.result is null or undefined");
			throw new Error("API response did not contain a valid result.");
		}
	} catch (error) {
		// Catch network errors or explicit throws
		console.error("[get_node_data] API request failed:", error);
		// Propagate the error by re-throwing or rejecting the promise
		const custom_error = new Error(`get_node_data failed for section_tipo: ${section_tipo}, section_id: ${section_id} - ${error.message}`);
		custom_error.originalError = error;
		custom_error.context = { section_tipo, section_id };
		throw custom_error;
	}
}//end get_node_data



/**
* GET_CHILDREN_DATA
* Get the JSON data from the server across the API request.
* Data is built from parent node info (current object section_tipo and section_id)
* @param object options
* {
* 	pagination: object
* 	children: array
* 	cache: bool
* }
* @return promise
*/
ts_object.prototype.get_children_data = async function(options) {

	const self = this

	// options
		const {
			pagination = null,
			children = null,
			cache = true
		} = options;

	// short vars
		const section_id			= self.section_id
		const section_tipo			= self.section_tipo
		const children_tipo			= self.children_tipo
		const caller				= self.caller
		const model					= caller.model
		const thesaurus_view_mode	= caller.thesaurus_view_mode
		const terms_are_model		= thesaurus_view_mode==='model'

	// cache
		if (cache && self.children_data) {
			return self.children_data
		}

	try {

		// API call
		const rqo = {
			dd_api			: 'dd_ts_api',
			prevent_lock	: true,
			action			: 'get_children_data',
			source			: {
				section_id		: section_id,
				section_tipo	: section_tipo,
				children_tipo	: children_tipo,
				model			: model,
				children		: children,
				build_options	: {
					terms_are_model : terms_are_model
				}
			},
			options : {
				pagination			: pagination,
				thesaurus_view_mode	: thesaurus_view_mode
			}
		}

		const api_response = await data_manager.request({
			use_worker	: false,
			body		: rqo
		})
		// debug
		if(SHOW_DEBUG===true) {
			console.warn('get_children_data api_response:', api_response);
		}

		if (api_response && api_response.result) {

			// success case

			return api_response.result

		}else{

			// error case

			console.warn("[get_children_data] Error, api_response.result is null or undefined");
			throw new Error("API response did not contain a valid result.");
		}
	} catch (error) {
		// Catch network errors or explicit throws
		console.error("[get_children_data] API request failed:", error);
		// Propagate the error by re-throwing or rejecting the promise
		throw error;
	}
}//end get_children_data



/**
* ADD_CHILDREN_ITEM
* Add a new children data to current instance children_data.ar_children_data array
* @param children_data
* E.g. {
	"section_tipo": "flora1",
	"section_id": "4",
	"ts_id": "flora1_4",
	"ar_elements": [
		{
			"type": "term",
			"tipo": "hierarchy25",
			"value": "Flora 4",
			"model": "component_input_text"
		}
	],
	"children_tipo": "hierarchy49",
	"has_descriptor_children": false
  }
* @return bool
*/
ts_object.prototype.add_children_item = function ( children_data ) {

	if (!children_data) {
		console.error('Invalid children_data provided');
		return false;
	}

	if (!this.children_data) {
		this.children_data = {
			ar_children_data : [],
			pagination : null
		}
	}
	this.children_data.ar_children_data.push( children_data )

	// Update the has_descriptor_children property
	if (this.children_data.ar_children_data.length===1) {
		this.data.has_descriptor_children = this.has_descriptor_children = true
		this.is_open = true // Forces is_open to allow to see the added children in new renders
	}


	return true
}//end add_children_item



/**
* REMOVE_CHILDREN_ITEM
* Deletes a children data from current instance children_data.ar_children_data array
* @param children_data
* E.g. {
	"section_tipo": "flora1",
	"section_id": "4",
	"ts_id": "flora1_4",
	"ar_elements": [
		{
			"type": "term",
			"tipo": "hierarchy25",
			"value": "Flora 4",
			"model": "component_input_text"
		}
	],
	"children_tipo": "hierarchy49",
	"has_descriptor_children": false
  }
* @return bool
*/
ts_object.prototype.remove_children_item = function ( children_data ) {

	if (!children_data || !children_data.ts_id) {
		console.error('Invalid children_data provided - missing ts_id');
		return false;
	}

	if (!this.children_data?.ar_children_data) {
		console.error('Current instance do not has children_data');
		return false;
	}

	const index = this.children_data.ar_children_data.findIndex(el => el.ts_id === children_data.ts_id);

	if (index === -1) {
		console.error('Children data not found with ts_id:', children_data.ts_id);
		return false;
	}

	// Remove the element directly
	this.children_data.ar_children_data.splice(index, 1);

	// Update the has_descriptor_children property
	if (this.children_data.ar_children_data.length===0) {
		this.data.has_descriptor_children = this.has_descriptor_children = false
		this.is_open = false
		this.link_children_element = null
	}


	return true
}//end remove_children_item



/**
* GET_CHILDREN_RECURSIVE
* Get all children section of the caller term
* Data is built from parent node info (section_tipo and section_id)
* @param object options
* @return promise
*/
ts_object.prototype.get_children_recursive = function( options ) {

	// short vars
		const section_tipo	= options.section_tipo
		const section_id	= options.section_id

	// check vars
		if (!section_tipo || typeof section_tipo==="undefined") {
			console.log("[get_children_recursive] Error. section_tipo is not defined");
			return Promise.resolve(false);
		}
		if (!section_id || typeof section_id==="undefined") {
			console.log("[get_children_recursive] Error. section_id is not defined");
			return Promise.resolve(false);
		}

	return new Promise(function(resolve){

		// API call
		const rqo = {
			action			: 'read',
			source			: {
				typo			: 'source',
				type			: 'section',
				action			: 'search',
				model			: 'section',
				tipo			: section_tipo,
				section_tipo	: section_tipo,
				section_id		: null,
				mode			: 'list',
				lang			: page_globals.dedalo_data_nolan,
			},
			show : {
				ddo_map : []
			},
			sqo : {
				section_tipo	: [section_tipo],
				limit			: 0,
				offset			: 0,
				filter_by_locators: [{
					section_tipo	: section_tipo,
					section_id		: section_id
				}],
				children_recursive: true
			}
		}
		data_manager.request({
			body : rqo
		})
		.then(async function(response) {

			if (response && response.result) {
				const section_data = response.result.data.find(el => el.tipo === section_tipo)
				const children_recursive = section_data.value.map(el =>{
					return {
						section_tipo	: el.section_tipo,
						section_id		: el.section_id
					}
				})

				resolve(children_recursive)

			}else{
				// error case
				console.warn("[ts_object.get_children] Error, response is null");
				resolve(false)
			}
		})
	})
}//end get_children_recursive



// /**
// * UPDATE_ARROW_STATE
// * Updates arrow state when updated wrap
// * @param bool toggle
// * 	Specifies if the children should be toggled on an empty container.
// * @return void
// */
// ts_object.prototype.update_arrow_state = function(toggle) {

// 	const self = this

// 	// Children_container
// 	const children_container = self.children_container

// 	const has_children = children_container.hasChildNodes()

// 	if (!has_children) {
// 		// reset arrow status
// 		self.link_children_element.remove()
// 	}

// 	console.warn('has_children:', has_children);

// 	// const is_first_load_or_hidden = children_container.classList.contains(
// 	// 	'js_first_load') || children_container.classList.contains('removed_from_view'
// 	// );

// 	// // Toggle children if container is in a specific state
// 	// const link_children_element = self.link_children_element
// 	// if (is_first_load_or_hidden || (!has_children && toggle)) {
// 	// 	self.toggle_view_children(link_children_element);
// 	// }

// 	// // Update arrow icon state
// 	// const arrow_icon= link_children_element.querySelector('.ts_object_children_arrow_icon')
// 	// if (has_children) {
// 	// 	arrow_icon.classList.remove('arrow_unactive');
// 	// } else {
// 	// 	arrow_icon.classList.add('arrow_unactive');
// 	// }
// }//end update_arrow_state



/**
* UPDATE_PARENT_DATA
* Call API to update the parent data in the database.
* @see ts_object drag_and_drop.js use.
* @param HTMLElement wrap_ts_object
* @return promise
*/
ts_object.prototype.update_parent_data = async function(options) {
console.warn('*** update_parent_data options:', options);
	const {
		section_id,
		section_tipo,
		old_parent_section_id,
		old_parent_section_tipo,
		new_parent_section_id,
		new_parent_section_tipo
	} = options

	// check vars
	if (!old_parent_section_id) {
		console.error('Invalid old_parent_section_id from options:', options);
		return false
	}

	// API call
		const rqo = {
			dd_api			: 'dd_ts_api',
			prevent_lock	: true,
			action			: 'update_parent_data',
			source			: {
				section_id				: section_id,
				section_tipo			: section_tipo,
				old_parent_section_id	: old_parent_section_id,
				old_parent_section_tipo	: old_parent_section_tipo,
				new_parent_section_id	: new_parent_section_id,
				new_parent_section_tipo	: new_parent_section_tipo
			}
		}
		const api_response = data_manager.request({
			body : rqo
		})


	return api_response
}//end update_parent_data



// /**
// * SAVE_OPENED_ELEMENTS
// * Saves and track given element open status
// * @param HTMLElement link_children_element
// * @param string action
// * @return bool
// */
// ts_object.prototype.save_opened_elements = function(action) {

// 	const self = this

// 	// const current_key = link_children_element.child_data.ts_id
// 	const current_key = self.id
// 	if (!current_key) {
// 		console.error('Error.invalid ts_id from current ts_object instance:', self);
// 		return false
// 	}

// 	if (action==='add') {
// 		window.opened_elements[current_key] = true
// 	}else{
// 		delete window.opened_elements[current_key]
// 	}

// 	return true
// }//end save_opened_elements



// /**
// * REMOVE_CHILDREN_FROM_OPENED_ELEMENTS
// * @return bool
// */
// ts_object.prototype.remove_children_from_opened_elements = function(parent_key) {

// 	for (let key in this.opened_elements) {
// 		let current_parent = this.opened_elements[key]
// 		if (current_parent == parent_key){
// 			delete this.opened_elements[key]
// 			if(SHOW_DEBUG===true) {
// 				console.log("[remove_children_from_opened_elements] Removed key ",key)
// 			}
// 			this.remove_children_from_opened_elements(key)
// 		}
// 	}

// 	return true
// }//end remove_children_from_opened_elements



/**
* HILITE_ELEMENT
* Adds 'element_hilite' class to matching nodes
* @param HTMLElment element
* @param bool clean_others
* @return int matches_length
* 	matches.length
*/
ts_object.prototype.hilite_element = function(element, clean_others) {

	// element node is mandatory
		if (!element) {
			console.error('Empty hilite_element param element:', element);
			return 0
		}

		if (element.nodeType !== Node.ELEMENT_NODE) {
			console.error('element hilite is not a HTMLElment node:', element);
			return 0
		}

	// undefined clean_others case
		if (typeof clean_others==='undefined') {
			clean_others = true
		}

	// Remove current hilite elements
		if(clean_others!==false) {
			this.reset_hilites()
		}

	// hilite all appearances of current component (may appear more than once)
		// const matches = document.querySelectorAll(`.term[data-type="${element.dataset.type}"][data-section_tipo="${element.dataset.section_tipo}"][data-section_id="${element.dataset.section_id}"]`);
		const matches = [element]
		const matches_length = matches.length;
		for (let i = matches_length - 1; i >= 0; i--) {

			const node = matches[i]

			node.classList.add('element_hilite');
		}

	return matches_length
}//end hilite_element



/**
* RESET_HILITES
* Removes css class element_hilite from all elements
*/
ts_object.prototype.reset_hilites = function() {

	const matches	= document.querySelectorAll('.element_hilite');
	const len		= matches.length;
	for (let i = len - 1; i >= 0; i--) {
		matches[i].classList.remove("element_hilite");
	}

	return true
}//end reset_hilites



/**
* REFRESH_ELEMENT
* Reload selected element/s wrapper in DOM
* @param bool hilite = true - Whether to highlight the refreshed element
* @param function callback - An optional callback function to run after refresh.
* @return int matches_length - The number of elements matched and processed.
*/
ts_object.prototype.refresh_element = async function(hilite=true, callback) {

	const self = this

	// fire common refresh action
	await self.refresh({
		render_level	: 'content',
		destroy			: false
	})

	// element to hilite
	if (hilite) {
		requestAnimationFrame( () => { self.hilite_element(self.term_node) })
	}

	// callback
	if (callback) {
		callback(self.term_node)
	}

	return true
}//end refresh_element



/**
* OPEN_RECORD
* Opens a new window where you can edit the current record.
* On open window blur, self instance will be refresh and hilited.
* @param int|string section_id
* @param string section_tipo
* @return bool
*/
ts_object.prototype.edit_window = null; // Class var
ts_object.prototype.open_record = function(section_id, section_tipo) {

	const self = this

	// url
	const url = DEDALO_CORE_URL + '/page/?' + object_to_url_vars({
		tipo			: section_tipo,
		id				: section_id,
		session_save	: false,
		menu			: false
	})

	// window managing
	if(self.edit_window===null || self.edit_window.closed) {

		const height	= window.screen.availHeight
		const width		= window.screen.availWidth > 1280
			? window.screen.availWidth
			: 1280

		self.edit_window = open_window({
			url		: url,
			target	: 'edit_window',
			width	: 1280,
			height	: height,
			top		: 0,
			left	: (width - 1280),
			on_blur : () => {
				// refresh the instance
				const instance = (self.section_id==section_id && self.section_tipo===section_tipo)
					? self
					: get_all_instances().find(el => parseInt(el.section_id)===parseInt(section_id) && el.section_tipo===section_tipo && el.model==='ts_object')
				if (instance) {
					instance.refresh_element()
				}else{
					console.error('Unable to get the instance');
				}
			}
		})

	}else{

		const current_query	= self.edit_window.location.href.split("?")[1]
		const new_query		= url.split("?")[1]
		if (current_query!==new_query) {
			self.edit_window.location.href = url
		}
		self.edit_window.focus();
	}


	return true
}//end open_record



/**
* ADD_CHILD
* Call to API to create a new record and add the current element his parent
* @return api_response
*/
ts_object.prototype.add_child = async function() {

	// source
		const source = {
			section_id		: this.section_id,
			section_tipo	: this.section_tipo
		}

	// API call
		const rqo = {
			dd_api	: 'dd_ts_api',
			action	: 'add_child',
			source	: source
		}

	// API request
		const api_response = await data_manager.request({
			use_worker	: false,
			body		: rqo
		})

		// debug
		if(SHOW_DEBUG===true) {
			console.log('[ts_object.add_child] response', api_response)
		}

		if (!api_response) {

			// Server script error
			alert('Error on add_child. See server log for details');

		}else{

			if (api_response.result===false) {
				// Problems found on add
				alert(api_response.msg);
			}
		}


	return api_response
}//end add_child



/**
* DELETE_TERM
* Removes selected record from database if not has children
* @see section.delete_section
* @param object options
* {
*	section_tipo : section_tipo,
*	section_id : section_id,
*	caller_dataframe : caller_dataframe
* }
* @return bool delete_section_result
*/
ts_object.prototype.delete_term = async function(options) {

	const self = this

	// options
		const section_id		= options.section_id
		const section_tipo		= options.section_tipo
		const caller_dataframe	= options.caller_dataframe || null

	// delete_diffusion_records
		const delete_diffusion_records = self.delete_diffusion_records ?? true

	// create the instance of the section called by the row of the portal,
	// section will be in list because it's not necessary get all data, only the instance context to be deleted it.
		const instance_options = {
			model			: 'section',
			tipo			: section_tipo,
			section_tipo	: section_tipo,
			section_id		: section_id,
			mode			: 'list',
			lang			: self.lang,
			caller			: self,
			inspector		: false,
			filter			: false,
			id_variant		: 'delete_section'
		}
	// get the instance
		const section =	await get_instance(instance_options)

	// create the sqo to be used to find the section will be deleted
		const sqo = {
			section_tipo		: [section_tipo],
			filter_by_locators	: [{
				section_tipo	: section_tipo,
				section_id		: section_id
			}],
			limit				: 1
		}

	// call to the section and delete it
		const delete_section_result = await section.delete_section({
			sqo							: sqo,
			delete_mode					: 'delete_record',
			caller_dataframe			: caller_dataframe,
			delete_diffusion_records	: delete_diffusion_records
		})

	// destroy section after use it
		section.destroy()


	return delete_section_result
}//end delete_term



/**
* SWAP_PARENT
* Changes from one parent to another a ts_object node.
* It is used when user drag and drop terms in the tree.
* @param object options
* {
* 	moving_instance: object - ts_object instance,
* 	old_parent_instance: object - ts_object instance
* }
* @return bool
*/
ts_object.prototype.swap_parent = async function (options) {

	const self = this

	// options
	const {
		moving_instance,
		old_parent_instance
	} = options

	// check vars
	if (!moving_instance) {
		console.error('[ts_object.on_drop] No moving_instance is received.', options);
		return false;
	}
	if (!old_parent_instance) {
		console.error('[ts_object.on_drop] No old_parent_instance is received.', options);
		return false;
	}

	// target instance is self (currently dropped wrapper). Set for clarify names.
	const target_instance = self

	// Validate moving instance. Don't proceed if moving instance is the same as target.
	if ( moving_instance.ts_id === target_instance.ts_id ) {
		console.warn('Invalid action: moving and target instances are the same.');
		return false;
	}

	// Validate target instance. Check if parent already contains current child.
	const target_instance_ar_children_data = target_instance.children_data?.ar_children_data || []
	const found = target_instance_ar_children_data.find(el => el.ts_id === moving_instance.ts_id)
	if (found) {
		console.log('Ignored action. Parent instance already contains this node.', found);
		return false;
	}

	// children_container. Check the container for children within the target.
	// If no children container, log an error and stop.
	const children_container = target_instance.children_container
	if (!children_container) {
		console.warn('No children_container found in the target instance:', target_instance);
		return false;
	}

	// update_parent_data. Request API to update parent data
	const update_parent_data_options = {
		section_id				: moving_instance.section_id,
		section_tipo			: moving_instance.section_tipo,
		old_parent_section_id	: old_parent_instance.section_id,
		old_parent_section_tipo	: old_parent_instance.section_tipo,
		new_parent_section_id	: target_instance.section_id,
		new_parent_section_tipo	: target_instance.section_tipo
	}
	self.update_parent_data(update_parent_data_options)
	.then(function(api_response){
		if(SHOW_DEBUG===true) {
			console.log('update_parent_data. Response:', api_response);
		}
		if (!api_response?.result) {
			console.error('Error on update_parent_data. Unable to continue.');
			// bubbles notifications
			const msg = SHOW_DEBUG
				? 'Error on update parent data. ' + api_response?.msg || 'Unknown error'
				: 'Error on update parent data.'
			event_manager.publish('notification', {
				msg			: msg,
				type		: 'error',
				remove_time	: 10000
			})
		}else{
			event_manager.publish('notification', {
				msg			: api_response?.msg || 'OK',
				type		: 'success',
				remove_time	: 1200
			})
		}
	})

	// update moving instance caller.
	// It is important to allow the term to be moved again without causing any inconsistencies.
	moving_instance.caller = target_instance

	// Move moving instance node from old parent to the new one (current dropped)
	target_instance.children_container.appendChild( moving_instance.node );

	// Update moving instance virtual_order
	const total = [...target_instance.children_container.childNodes].filter(el =>
		el.classList.contains('wrap_ts_object')
	).length;
	moving_instance.virtual_order = total
	// Refresh the instance (without call API) to update the order value.
	await moving_instance.refresh({
		build_autoload	: false, // Do not load data from API
		render_level	: 'content',
		destroy			: false
	})

	// update_arrow_state. If the instance has no children, then the arrow icon should be hidden.
	// old_parent_instance.update_arrow_state(false)
	dd_request_idle_callback(
		async () => {

			// Updated old_parent_instance
			// Remove children from data (client side only action)
			old_parent_instance.remove_children_item( moving_instance.data )
			// Refresh the instance data to update the children arrow
			old_parent_instance.refresh({
				build_autoload	: false, // Do not load data from API
				render_level	: 'content', // updated arrow status and render
				destroy			: false
			})
			if(SHOW_DEBUG===true) {
				console.log('Updated old_parent_instance :', old_parent_instance);
			}

			// Updates target instance
			// Add children to data (client side only action)
			target_instance.add_children_item( moving_instance.data )

			// Refresh the instance data to update the children arrow
			await target_instance.refresh({
				build_autoload	: false, // Do not load data from API
				render_level	: 'content', // updated arrow status and render
				destroy			: false
			})

			// Update styles. Ensure the target instance display the children.
			requestAnimationFrame(() => {
				// show children container
				target_instance.children_container.classList.remove('hide')
				// set arrow down
				target_instance.link_children_element.classList.add('open')

				// hilite moved term. Allows arrow state update
				const term_node = moving_instance.term_node
				if (term_node) {
					self.hilite_element(term_node)
				}
			})

			if(SHOW_DEBUG===true) {
				console.log('Updated target_instance :', target_instance);
			}
		}
	);


	return true
}//end swap_parent



/**
* SELECT_FIRST_INPUT_IN_EDITOR
* @param HTMLElement element_data_div
* @return bool
*/
ts_object.prototype.select_first_input_in_editor = function(element_data_div) {

	// Focus first input element
		const first_input = element_data_div.querySelector('input')
		if (first_input) {
			// Select all content
			first_input.select()
			// Hide editor on change value
			const change_handler = (e) => {
				element_data_div.style.display = 'none'
			}
			first_input.addEventListener('change', change_handler)
		}

	return true
}//end select_first_input_in_editor



/**
* SHOW_COMPONENT_IN_TS_OBJECT
* Show and hide component data in ts_object content_data div
* @param object options
* E.g. {
*    "tipo": "ontology17",
*    "type": "icon",
*    "model": "component_json"
* }
* @return promise
*/
ts_object.prototype.show_component_in_ts_object = async function(options) {

	const self = this

	// options
		const {
			tipo, // array expected. String is accepted too. e.g. 'ontology17'
			type, // string e.g. 'icon'
			model // string e.g. 'component_json'
		} = options

	// short vars
		const section_tipo	= self.section_tipo
		const section_id	= self.section_id
		const lang			= page_globals.dedalo_data_lang
		const tipos			= Array.isArray(tipo) ? tipo : tipo.split(',') // handle always as array

	// delete the previous registered events
		self.events_tokens.forEach(token => event_manager.unsubscribe(token))
		self.events_tokens = []

	// render_component_node function
		const components = [] // array of created component instances
		const render_component_node = async function(tipo, key) {

			const loader = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'loader loading',
				inner_html		: 'Loading component..',
				parent			: element_data_contanier
			})

			// component instance
				const current_component = await get_instance({
					model			: model,
					section_tipo	: section_tipo,
					section_id		: section_id,
					tipo			: tipo,
					lang			: lang,
					mode			: 'edit',
					// view			: 'default', // do not force view here (let component to decide his view)
					id_variant		: new Date().getTime()
				})

			// components
				components.push(current_component)

			// term edit case
				if(type==='term') {

					// update value, subscription to the changes: if the DOM input value was changed, observers DOM elements will be changed own value with the observable value
					const save_handler = function() {

						const caller = current_component

						const ar_values = []
						switch (caller.model) {
							case 'component_portal': {
								const data = caller.datum.data.filter(el => el.tipo !== caller.tipo)
								ar_values.push(...data.map(el => el.value))
								break;
							}
							default: {
								const components_length = components.length
								for (let i = 0; i < components_length; i++) {
									ar_values.push(...components[i].data.value)
								}
								break;
							}
						}

						const value = ar_values.join(' ')
						// change the value of the current DOM element
						self.term_text.innerHTML = value

						dd_request_idle_callback(
							() => {
								// destroy
								// current_component.destroy(true, true, true)
								components.forEach((component) => {
									component.destroy(true, true, true)
								});
								// clean up array of components
								while(components.length > 0) {
									components.pop();
								}
							}
						)
					}
					const token = event_manager.subscribe('save_' + current_component.id_base, save_handler)
					self.events_tokens.push(token)
				}

				// build and render component
					await current_component.build(true)
					const component_node = await current_component.render()
					// set pointer instance to DOM node
					component_node.instance = current_component

				// loader
					loader.remove()

				// activate
					if (key===0) {
						dd_request_idle_callback(
							() => {
								ui.component.activate(current_component)
							}
						)
					}

			return component_node
		}//end render_component_node

	// data_contanier
		const element_data_contanier	= self.data_container
		const all_element_data_div		= element_data_contanier.children // childNodes;

	// get the children nodes of data_contanier
		const all_element_data_div_len = all_element_data_div.length
		if (all_element_data_div_len > 0) { // if the data element is not empty

			for (let i = all_element_data_div_len - 1; i >= 0; i--) {
				const component_wrapper = all_element_data_div[i]
				if (component_wrapper.instance.tipo===tipo) {
					// this component already exists. Remove it and stop
					component_wrapper.instance.destroy(true, true, true)
					return true
				}
				// destroy component instance
				component_wrapper.instance.destroy(true, true, true)
			}
		}

	// render components and add nodes
		const tipos_length = tipos.length
		for (let i = 0; i < tipos_length; i++) {
			const current_tipo = tipos[i]
			const component_node = await render_component_node(current_tipo, i)
			element_data_contanier.appendChild(component_node)
		}


	return true
}//end show_component_in_ts_object



/**
* SHOW_INDEXATIONS
* 	Load the fragment list and render the grid
* @param object options
* @return promise
* 	resolve void
*/
ts_object.prototype.show_indexations = async function(options) {

	// options
		const uid					= options.uid
		const button_obj			= options.button_obj
		const section_tipo			= options.section_tipo
		const section_id			= options.section_id
		const component_tipo		= options.component_tipo
		const target_div			= options.target_div
		const value					= options.value || null
		const pagination			= options.pagination || {}
		const totals_group			= options.totals_group || [{key: 'all'}]
		const filter_by_locators	= options.filter_by_locators || []

	// pagination vars
		const total = options.total || null

	// get the filter section
		const target_section = totals_group.map(el => el.key)

	// empty the target_div container
		while (target_div.firstChild) {
			target_div.removeChild(target_div.firstChild);
		}

	// close the target_div when is open and the caller component is the same
		if (!target_div.classList.contains('hide') && target_div.uid === uid) {
			// hide only
			target_div.classList.add('hide')
			return
		}

	// already loaded. render the dd_grid again and toggle to visible
		if( button_obj.dd_grid){
			const dd_grid = button_obj.dd_grid
			dd_grid.render()
			.then(function(node){
				target_div.appendChild(node)
				// force reload again
				target_div.classList.remove('hide')
				target_div.uid = uid
			})
			return
		}

	// rqo. create
		const rqo = {
			action	: 'get_indexation_grid',
			source	: {
				section_tipo	: section_tipo,
				section_id		: section_id,
				tipo			: component_tipo,
				value			: value // ["oh1",] array of section_tipo \ used to filter the locator with specific section_tipo (like 'oh1')
			},
			sqo: {
				mode				: 'related',
				section_tipo		: target_section,
				total				: total,
				limit				: 200,
				offset				: 0,
				filter_by_locators	: filter_by_locators
			}
		}

	// dd_grid
		const dd_grid = await get_instance({
			model				: 'dd_grid',
			section_tipo		: section_tipo,
			section_id			: section_id,
			tipo				: component_tipo,
			mode				: 'list',
			view				: 'indexation',
			lang				: page_globals.dedalo_data_lang,
			rqo					: rqo,
			id_variant			: uid,
			totals_group 		: totals_group,
			paginator_options	: {
				view 				: 'micro',
				show_interface 		: {
					show_all : false
				}
			}
		})
		await dd_grid.build(true)
		// assign the dd_grid to be reused by same caller.
		button_obj.dd_grid = dd_grid
		dd_grid.render()
		.then(function(node){
			target_div.appendChild(node)
			target_div.classList.remove('hide')
			target_div.uid = uid
		})
}//end show_indexations



/**
* PARSER_SEARCH_RESULT
* Recursive parser for results of the search
* Only used for search result, not for regular tree render
* Called from render_area_thesaurus.list
* @param object data
*  sample:
	* [{
	* 		"section_tipo": "hierarchy1",
	* 		"section_id": "66",
	* 		"order": 2,
	* 		"mode": "edit",
	* 		"lang": "lg-eng",
	* 		"is_descriptor": true,
	* 		"is_indexable": false,
	* 		"permissions_button_new": 3,
	* 		"permissions_button_delete": 0,
	* 		"permissions_indexation": 0,
	* 		"permissions_structuration": 0,
	* 		"ts_id": "hierarchy1_66",
	* 		"ts_parent": "hierarchy1_1"
	* 		"ar_elements": [
	* 			{
	* 				"type": "term",
	* 				"tipo": "hierarchy5",
	* 				"value": "Spain",
	* 				"model": "component_input_text"
	* 			},
	* 			{
	* 				"type": "link_children",
	* 				"tipo": "hierarchy45",
	* 				"value": "button show children",
	* 				"model": "component_relation_children"
	* 			}
	* 		]
	* }]
* @param array to_hilite
* 	array of locators found in search as
* [{
*    "section_tipo": "flora1",
*    "section_id": "1"
* }]
* @return {Promise<boolean>} - True on successful execution.
*/
ts_object.prototype.parse_search_result = async function( data, to_hilite ) {
	const start_time = performance.now();
	if(SHOW_DEBUG===true) {
		console.warn('parse_search_result data:', data, to_hilite);
	}

	const self = this

	if (!data || !Array.isArray(data)) {
		console.error('Invalid data provided to parse_search_result');
		// Display result info
		event_manager.publish('notification', {
			msg			: `Invalid empty data provided to parse_search_result`,
			type		: 'error',
			remove_time	: 7000
		})
		return false;
	}

	// Pre-process 'to_hilite' for faster lookup and type consistency
	const hilite_set = new Set(
		to_hilite.map(el => `${el.section_tipo}_${parseInt(el.section_id)}`)
	);

	// Map of rendered search instances based on received data list
	const search_instances_map = new Map()

	// Set node to scroll. Used to scroll page when is needed.
	let node_to_scroll = null

	// --------------------------------------------------------------------------------
	// 1. CREATE OR RETRIEVE INSTANCES AND RENDER
	// --------------------------------------------------------------------------------

	// Iterate 'data' and create the non already existing instances.
	// 'data' is an array of all terms needed to create the results paths, that means, from the root
	// terms to the last node matching the search like a branch path [term_root, term_middle1, term_middle2, term_matched]
	// Every data item is an object with ts_node properties like section_tipo, section_id, permissions, ar_elements..
	// See param sample at docblock.
	const data_length = data.length
	for (let i = 0; i < data_length; i++) {

		const data_item = data[i]

		// set non included 'thesaurus_mode' that is needed to create the instance id.
		data_item.thesaurus_mode = self.thesaurus_mode

		const key = key_instances_builder(data_item); // normalized id of the instance
		const found_instance = get_instance_by_id(key); // Look in all Dédalo instances Map
		if (found_instance) {

			// Instance already exists
			if(SHOW_DEBUG===true) {
				console.log('==== Matched already existing instance. found_instance:', key, found_instance);
			}

			// Add to map
			search_instances_map.set(found_instance.ts_id, found_instance);

		}else{

			// New instance creation
			const new_instance = await ts_object.get_instance({
				// key_parts only
				section_tipo		: data_item.section_tipo,
				section_id			: data_item.section_id,
				children_tipo		: data_item.children_tipo,
				target_section_tipo	: null,
				thesaurus_mode		: self.thesaurus_mode
			});
			if(SHOW_DEBUG===true) {
				console.log('++++ Created new instance. new_instance:', key, new_instance);
			}

			// callers
			const root_caller	= self.caller // area_thesaurus
			const caller		= (data_item.ts_parent === 'root') ? self.caller : self // area_thesaurus|ts_object

			// set new properties (overwrites possible cached properties)
			new_instance.caller			= caller
			new_instance.linker			= self.linker // usually a portal component instance
			new_instance.is_root_node	= data_item.ts_parent === 'root'
			new_instance.ts_id			= data_item.ts_id
			new_instance.ts_parent		= data_item.ts_parent
			new_instance.order			= data_item.order
			new_instance.area_model		= root_caller.model
			new_instance.is_ontology	= (root_caller.model === 'area_ontology')
			new_instance.mode			= 'search' // hide some elements like 'order'
			new_instance.data			= data_item // inject row as data itself

			// Build the instance without load from API (data is already injected)
			await new_instance.build(false)
			// Render the instance
			await new_instance.render()

			// Add to search instances map
			search_instances_map.set(new_instance.ts_id, new_instance);
		}
	}

	// Reset possible previous hilites.
	self.reset_hilites()

	// --------------------------------------------------------------------------------
	// 2. HIERARCHIZE INSTANCES AND COLLECT PARENTS TO OPEN
	// --------------------------------------------------------------------------------

	// Hierarchize instances. Add child instances data and DOM nodes to their parents.
	const instances_to_open = new Map()
	const instances_to_hilite = new Map()
	// const search_instances_length = search_instances.length
	// for (let i = 0; i < search_instances_length; i++) {
	for(const [key, instance] of search_instances_map) {

		// Hilite. Remark search result from the 'hilite_set'.
		if (hilite_set.has(instance.ts_id)) {
			instances_to_hilite.set(instance.ts_id, instance);
		}

		// Look for parent_instance. If not found, this instance is a root term. Continue without changes.
		const parent_instance = search_instances_map.get(instance.ts_parent);
		if (!parent_instance) {
			continue; // root nodes case
		}

		// Ensure parent's children data structure is initialized.
		parent_instance.children_data = parent_instance.children_data || {};
		parent_instance.children_data.ar_children_data = parent_instance.children_data.ar_children_data || [];

		// Inspect parent children data to check if current instance is already added.
		// If not, update the parent instance adding the current instance data as child.
		const child_found = parent_instance.children_data.ar_children_data.some(
			el => el.ts_id === instance.ts_id
		);
		if (!child_found) {
			// Update parent children data adding current instance data as child
			parent_instance.add_children_item(instance.data);
		}

		// Update current instance caller.
		instance.caller = parent_instance

		// Set to open the parent children
		instances_to_open.set(parent_instance.ts_id, parent_instance)
	}

	// --------------------------------------------------------------------------------
	// 3. OPEN PARENTS (ASYNC)
	// --------------------------------------------------------------------------------

	// Open all parents to render and display they children.
	// Ensure that all rendering children are complete before highlighting the nodes.
	await Promise.all(
		Array.from(instances_to_open.values()).map(async (parent_instance) => {
			if(SHOW_DEBUG===true) {
				console.log('Opening Hierarchized instance parent:',parent_instance.ts_id, parent_instance);
			}

			// Add rendered children nodes into self.children_container or parent_nd_container
			await parent_instance.render_children({
				clean_children_container	: true,
				children_data				: parent_instance.children_data
			})

			// Update styles. Note that unsync (requestAnimationFrame) is used.
			// This allows the children render to be completed before.
			requestAnimationFrame(() => {
				// show children container
				parent_instance.children_container.classList.remove('hide')
				// set arrow down
				parent_instance.link_children_element.classList.add('open')
			})
		})
	);
	// Clear Maps when done
	instances_to_open.clear();

	// --------------------------------------------------------------------------------
	// 4. HILITE AND SCROLL (IDLE/ANIMATION FRAME)
	// --------------------------------------------------------------------------------

	// Hilite instances
	dd_request_idle_callback(()=>{
		instances_to_hilite.forEach(instance => {
			if (instance.term_node) {
				if(SHOW_DEBUG===true) {
					console.log('Hiliting instance:',instance.ts_id, instance);
				}
				requestAnimationFrame(() => {
					instance.hilite_element(instance.term_node, false)
				});
				if (!node_to_scroll) {
					// scroll page to first found element
					node_to_scroll = instance.term_node
					scroll_to_node(node_to_scroll)
				}
			}
		});
		// Display result info
		const total_found = to_hilite.length
		event_manager.publish('notification', {
			msg			: `Displaying ${total_found} records`,
			type		: total_found > 0 ? 'success' : 'warning',
			remove_time	: 5000
		})
		// Clear Maps when done
		instances_to_hilite.clear();
		search_instances_map.clear();
	})

	// debug
	if(SHOW_DEBUG===true) {
		console.log(`_*_Time to parse search result: ${(performance.now() - start_time).toFixed(2)}ms`);
	}


	return true
}//end parser_search_result



/**
* SCROLL_TO_NODE
* Handles the page scroll to the search found item (first item only)
* @param HTMLElement node_to_scroll
* @return void
*/
const scroll_to_node = (node_to_scroll) => {

	when_in_dom(node_to_scroll, ()=> {

		// user wheel event
		// To prevent to change the early user scroll, check for user wheel event
		// before to try it programmatically (less intrusive behavior)
		let user_scroll = false
		const wheel_handler = () => {
			user_scroll = true
			window.removeEventListener('wheel', wheel_handler, { passive: true });
		}
		window.addEventListener('wheel', wheel_handler, { passive: true });

		const scroll_node = () => {
			if (user_scroll) {
				return
			}
			node_to_scroll.scrollIntoView({ behavior: "smooth", block: "end", inline: "nearest" })
		}

		let scroll_interval = null;
		let scroll_attempts = 0;
		const MAX_SCROLL_ATTEMPTS = 10; // Prevent infinite scrolling

		// Create observer
		const observer = new IntersectionObserver((entries) => {
			entries.forEach(entry => {

				if (entry.isIntersecting) {
					// console.error('Element is visible:', entry.target);

					const visibilityPercentage = Math.round(entry.intersectionRatio * 100);
					if (visibilityPercentage > 5) {
						// Success - clean up everything
						observer.disconnect();
						if (scroll_interval) {
							clearInterval(scroll_interval);
							scroll_interval = null;
						}				            					            	// try again to prevent slow tree parses
						setTimeout(scroll_node, 2000)
					}
				} else {
					// console.log('Element is not visible:', entry.target);

					// Clear any existing interval
					if (scroll_interval) {
						clearInterval(scroll_interval);
					}

					// Initial scroll attempt
					scroll_node();
					scroll_attempts = 1;

					// Set up interval with retry limit
					const do_scroll = () => {
						if (scroll_attempts >= MAX_SCROLL_ATTEMPTS) {
							console.warn('Max scroll attempts reached, giving up');
							clearInterval(scroll_interval);
							observer.disconnect();
							return;
						}

						console.log(`Scrolling attempt ${scroll_attempts + 1}`);
						scroll_attempts++;
						dd_request_idle_callback(scroll_node);
					};

					scroll_interval = setInterval(do_scroll, 350);
				}
			});
		}, {
			threshold: [0, 0.05, 0.1] // Check at 0%, 5%, and 10% visibility
		})

		observer.observe(node_to_scroll);

		// Cleanup timeout as fallback
		setTimeout(() => {
			if (observer) {
				observer.disconnect();
			}
			if (scroll_interval) {
				clearInterval(scroll_interval);
			}
			console.log('Scroll operation timed out after 10 seconds');
		}, 10000);
	})
}//end scroll_to_node



/**
* SAVE_ORDER
* @param int value
* @param mixed new_value
* @return promise
*/
ts_object.prototype.save_order = async function( value ) {

	const self = this

	let new_value = parseInt( value )

	const old_value = parseInt( self.virtual_order )

	// check is new_value is valid
	if (new_value===old_value) {
		if(SHOW_DEBUG===true) {
			console.log("[ts_object.save_order] Value is not changed. ignored save_order action")
		}
		return Promise.resolve(false);
	}

	// short vars
	// children nodes of type 'wrap_ts_object'
	const child_nodes		= [...self.caller.children_container.childNodes].filter(el => el.classList.contains('wrap_ts_object'))
	const child_nodes_len	= child_nodes.length

	// new_value. Prevent set invalid values
	if ( new_value > child_nodes_len ){
		new_value = child_nodes_len // max value is array length
	}else if ( new_value<1 ) {
		new_value = 1; // min value is 1
	}

	// ar_locators. Iterate child_nodes elements
	const ar_locators = []
	for (let i = 0; i < child_nodes_len; i++) {
		if (child_nodes[i].dataset.section_tipo && child_nodes[i].dataset.section_id) {
			ar_locators.push({
				section_tipo	: child_nodes[i].dataset.section_tipo,
				section_id		: child_nodes[i].dataset.section_id
			})
		}
	}

	// sort array with new keys
		// function move_locator(ar_locators, from, to) {
		// 	return ar_locators.splice(to, 0, ar_locators.splice(from, 1)[0]);
		// };

	// move_locator
		function move_locator(array, pos1, pos2) {
			// local variables
			let i, tmp;
			// cast input parameters to integers
			pos1 = parseInt(pos1, 10);
			pos2 = parseInt(pos2, 10);
			// if positions are different and inside array
			if (pos1 !== pos2 && 0 <= pos1 && pos1 <= array.length && 0 <= pos2 && pos2 <= array.length) {
			  // save element from position 1
			  tmp = array[pos1];
			  // move element down and shift other elements up
			  if (pos1 < pos2) {
				for (i = pos1; i < pos2; i++) {
				  array[i] = array[i + 1];
				}
			  }
			  // move element up and shift other elements down
			  else {
				for (i = pos1; i > pos2; i--) {
				  array[i] = array[i - 1];
				}
			  }
			  // put element from position 1 to destination
			  array[pos2] = tmp;
			}
			return array
		}//end move_locator

	// order_ar_locators
		const from	= parseInt(old_value)-1
		const to	= parseInt(new_value)-1
		move_locator(ar_locators, from, to)

	// Update load instances and values before call API

		// Update parent instance children data order

		// current_ar_children_data from caller (parent instance)
		const current_ar_children_data = self.caller.children_data.ar_children_data

		// order_reference as [ts1_7,ts1_25]
		const order_reference = ar_locators.map(el => el.section_tipo + '_' + el.section_id)

		// order_children. New array with sorted children
		const order_children = current_ar_children_data.sort((a, b) => {

			const index_a = order_reference.indexOf(a.section_tipo + '_' + a.section_id);
			const index_b = order_reference.indexOf(b.section_tipo + '_' + b.section_id);

			// Place items not found in order_reference (index of -1) at the end.
			if (index_a === -1 && index_b !== -1) return 1;
			if (index_b === -1 && index_a !== -1) return -1;

			// Otherwise, sort by the indices
			return index_a - index_b;
		});

		// overwrite value
		self.caller.children_data.ar_children_data = order_children

		// Create a custom instances list with only ts_object instances
		const ts_object_instances_list = get_all_instances().filter(el => {
			if (el.model==='ts_object' && el.section_tipo && el.section_id) {
				return el
			}
			return false
		})

		const order_children_length = order_children.length
		for (let i = 0; i < order_children_length; i++) {

			const item = order_children[i]

			const found = ts_object_instances_list.find(el =>
				el.section_tipo===item.section_tipo && el.section_id==item.section_id
			)
			if (found) {
				// Set the new position value
				found.virtual_order = i + 1
			}else{
				console.error('Unable to find the instance for child:', item);
			}
		}

	// API request to save_order in database
		const rqo = {
			dd_api			: 'dd_ts_api',
			prevent_lock	: true,
			action			: 'save_order',
			source			: {
				section_tipo	: self.section_tipo,
				ar_locators		: ar_locators
			}
		}
		// API request. Don't wait here
		data_manager.request({
			body : rqo
		})
		.then(function(api_response){
			// debug
			if(SHOW_DEBUG===true) {
				console.log("[ts_object.save_order] api_response", api_response)
			}

			// error handling
			if (!api_response?.result) {
				console.error('Error on save order. api_response:', api_response);
				// bubbles notifications
				const msg = SHOW_DEBUG
					? 'Error on save order. ' + api_response?.msg || 'Unknown error'
					: 'Error on save order.'
				event_manager.publish('notification', {
					msg			: msg,
					type		: 'error',
					remove_time	: 10000
				})
			}else{
				event_manager.publish('notification', {
					msg			: api_response?.msg || 'OK',
					type		: 'success',
					remove_time	: 1200
				})
			}
		})


	return true
}//end save_order



/**
* TOGGLE_ND
* Toggles the visibility of a container and loads its children via an AJAX call if it's being shown.
* @param HTMLElement button_obj - The button element that triggers the toggle action.
* @return bool - A promise that resolves to `true` if the operation was successful, otherwise `false`.
*/
ts_object.prototype.toggle_nd = async function(button_obj) {

	const self = this

	// nd_container
	// const nd_container = self.get_my_parent_container(button_obj, 'nd_container')
	const nd_container = self.nd_container
	if (!nd_container) {
		if(SHOW_DEBUG===true) {
			console.log("[ts_object.toggle_nd] Error on locate nd_container from button_obj",button_obj);
		}
		return false
	}

	// If it is not already hidden, hide it.
	if (!nd_container.classList.contains('hide')) {

		// Hide showed nd_container
		nd_container.classList.add('hide')

		return true;
	}

	// If already is loaded (contains nodes), just show it.
	// const children_container = self.get_my_parent_container(button_obj, 'children_container')
	const children_container = self.children_container
	const has_nodes = children_container.childNodes.length > 0
	if (has_nodes) {
		nd_container.classList.remove('hide')
		return true;
	}

	// Load children and show the container
	try {

		// nodes
		const wrapper				= button_obj.parentNode.parentNode
		const link_children_element	= self.link_children_element
		const section_tipo			= wrapper.dataset.section_tipo
		const section_id			= wrapper.dataset.section_id
		const children_tipo			= wrapper.dataset.children_tipo

		const children_data = await self.get_children_data({
			section_tipo	: section_tipo,
			section_id		: section_id,
			children_tipo	: children_tipo,
			pagination		: null,
			children		: null
		})

		if (!children_data) {
			// error case
			console.warn("[toggle_nd] Error, children_data is null");
			return false
		}

		await self.render_children({
			clean_children_container : true, // bool clean_children_container
		})

		// Show hidden nd_container
		nd_container.classList.remove('hide')

		// Check if children were already loaded
		// When not already opened children, hide it (all children descriptors and not are loaded together)
		const icon_arrow = link_children_element.firstChild
		if (icon_arrow.classList.contains('ts_object_children_arrow_icon_open')) {
			console.log("[ts_object.toggle_nd] Children are already loaded before");
		}else{
			// Children are NOT loaded before. Set as not loaded and hide
			children_container.classList.remove('js_first_load') // Set as already loaded
			children_container.classList.add('removed_from_view')	// Set as hidden
			icon_arrow.classList.remove('ts_object_children_arrow_icon_open') // Always remove state 'open' from arrow
		}

		return true;

	} catch (error) {
		console.error("[toggle_nd] An error occurred while loading or rendering children:", error);
		return false;
	}
}//end toggle_nd



// /**
// * GET_MY_PARENT_CONTAINER
// * Returns current element (list_thesaurus_element) container of type inside his ts_element
// * @param HTMLElement button_obj
// * @param string role
// * @return HTMLElement|null parent_container
// */
// ts_object.prototype.get_my_parent_container = function(button_obj, role) {

// 	if (!button_obj || !role) {
// 		console.error("GET_MY_PARENT_CONTAINER: Invalid arguments provided. 'button_obj' and 'role' are required.", button_obj, role);
// 		return null;
// 	}

// 	// Get the closest 'wrap_ts_object' ancestor of button_obj
// 	const wrapper = button_obj.closest('.wrap_ts_object');
// 	if (!wrapper) {
// 		console.error("GET_MY_PARENT_CONTAINER: Could not find a parent element with class 'wrap_ts_object'.");
// 		return null;
// 	}

// 	for (const child of wrapper.children) {
// 		if (child.dataset.role === role) {
// 			return child;
// 		}
// 	}

// 	console.warn(`GET_MY_PARENT_CONTAINER: No child element with data-role='${role}' found inside the wrapper.`);
// 	return null;
// }//end get_my_parent_container



/**
* IS_ROOT
* @param string tipo
* 	Usually 'hierarchy1' for Thesaurus and 'ontology35' from Ontology
* @return bool
*/
ts_object.prototype.is_root = function (tipo) {

	const ar_root_tipo = [
		'hierarchy1',
		'ontology35'
	]

	return ar_root_tipo.includes(tipo)
}//end is_root



// @license-end
