// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'
	import {get_instance, add_instance, get_instance_by_id} from '../../common/js/instances.js'
	import {object_to_url_vars, open_window} from '../../common/js/utils/index.js'
	import {event_manager} from '../../common/js/event_manager.js'
	import {dd_request_idle_callback, when_in_dom} from '../../common/js/events.js'
	import {data_manager} from '../../common/js/data_manager.js'
	import {
		render_children,
		render
	} from './render_ts_object.js'



/**
* TS_OBJECT
* Manages a single thesaurus row element
*/
export const ts_object = function() {

	this.id

	// vars from options
	// Set on update element in DOM (refresh)
	this.element_to_hilite = null
	// thesaurus_mode . Defines appearance of thesaurus
	this.thesaurus_mode = null
	// events_tokens
	this.events_tokens = []
	// opened_elements
	this.opened_elements = {}
	// children_data. Object as {ar_children_data:[],pagination:{limit:0,offset:0,total:20}}
	this.children_data = null
	// status
	this.status = null

	this.mode					= null
	this.caller					= null
	this.linker					= null

	this.section_tipo			= null
	this.section_id				= null
	this.children_tipo			= null
	this.target_section_tipo	= null
	this.is_root_node			= false
	this.virtual_order			= null
	this.children_data			= null

	this.permissions_button_delete	= null
	this.permissions_button_new		= null
	this.permissions_indexation		= null
	this.ar_elements				= null
	this.ts_id						= null
	this.is_descriptor				= null

	this.has_descriptor_children = null;

	// wrapper DOM node. Set on render render_wrapper
	this.node

	this.children_container = null
	this.link_children_element = null
	this.term_node = null
}//end ts_object



// prototypes assign
	ts_object.prototype.render = render
	ts_object.prototype.render_children = render_children



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

	self.mode					= options.mode
	self.caller					= options.caller
	self.linker					= options.linker

	self.section_tipo			= options.section_tipo
	self.section_id				= options.section_id
	self.children_tipo			= options.children_tipo
	self.target_section_tipo	= options.target_section_tipo
	self.is_root_node			= options.is_root_node
	self.virtual_order			= options.virtual_order
	self.children_data			= options.children_data
	self.ts_id					= options.ts_id
	self.is_descriptor			= options.is_descriptor
	self.thesaurus_mode			= options.thesaurus_mode

	self.permissions_button_delete	= options.permissions_button_delete
	self.permissions_button_new		= options.permissions_button_new
	self.permissions_indexation		= options.permissions_indexation
	self.ar_elements				= options.ar_elements

	self.has_descriptor_children = options.has_descriptor_children

	self.id = `ts_object_${self.section_tipo}_${self.section_id}_${self.children_tipo}_${self.target_section_tipo}_${self.thesaurus_mode}`

	// save current instance into the instance cache
	add_instance(
		self.id,
		self
	)

	// status update
	self.status = 'initialized'


	return true
}//end init



/**
* GET_CHILDREN_DATA
* Get the JSON data from the server across the API request.
* Data is built from parent node info (current object section_tipo and section_id)
* @param object options
* @return promise
*/
ts_object.prototype.get_children_data = async function(options) {

	const self = this

	// options
		const {
			// section_id,
			// section_tipo,
			// children_tipo,
			pagination = null,
			children = null
		} = options;

	// short vars
		const section_id			= self.section_id
		const section_tipo			= self.section_tipo
		const children_tipo			= self.children_tipo
		const caller				= self.caller
		const model					= caller.model
		const thesaurus_view_mode	= caller.thesaurus_view_mode
		const terms_are_model		= thesaurus_view_mode==='model'

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
			console.log('get_children_data api_response:', api_response);
		}

		if (api_response && api_response.result) {

			// success case

			// fix
			self.children_data = api_response.result

			return self.children_data

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
* GET_NODE_DATA
* Get the instance JSON data from the server across the API request.
* Data is built from parent node info (current object section_tipo and section_id)
* @param object options
* @return promise
*/
ts_object.prototype.get_node_data = async function(section_tipo, section_id, children_tipo) {

	const self = this

	// short vars
		const caller				= self.caller
		const model					= caller.model
		const thesaurus_view_mode	= caller.thesaurus_view_mode
		const terms_are_model		= thesaurus_view_mode==='model'

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

		if (api_response && api_response.result) {

			// success case

			// fix
			self.node_data = api_response.result

			return self.node_data

		}else{

			// error case

			console.warn("[get_node_data] Error, api_response.result is null or undefined");
			throw new Error("API response did not contain a valid result.");
		}
	} catch (error) {
		// Catch network errors or explicit throws
		console.error("[get_node_data] API request failed:", error);
		// Propagate the error by re-throwing or rejecting the promise
		throw error;
	}
}//end get_node_data



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



/**
* UPDATE_ARROW_STATE
* Updates arrow state when updated wrap
* @param bool toggle
* 	Specifies if the children should be toggled on an empty container.
* @return void
*/
ts_object.prototype.update_arrow_state = function(toggle) {

	const self = this

	// Children_container
	const children_container = self.children_container

	const has_children = children_container.hasChildNodes()

	const is_first_load_or_hidden = children_container.classList.contains(
		'js_first_load') || children_container.classList.contains('removed_from_view'
	);

	// Toggle children if container is in a specific state
	const link_children_element = self.link_children_element
	if (is_first_load_or_hidden || (!has_children && toggle)) {
		self.toggle_view_children(link_children_element);
	}

	// Update arrow icon state
	const arrow_icon= link_children_element.querySelector('.ts_object_children_arrow_icon')
	if (has_children) {
		arrow_icon.classList.remove('arrow_unactive');
	} else {
		arrow_icon.classList.add('arrow_unactive');
	}
}//end update_arrow_state



/**
* FIND_UP_TAG
* Search parent with given CSS selector looking up recursively
* @param HTMLElement el
* @param string class_name 'wrap_ts_object'
* @return HTMLElement|null
*/
ts_object.prototype.find_up_tag = function(el, class_name) {
	// Use a while loop to traverse up the DOM tree from the starting element
	while (el) {
		// Check if the current element has the specified class
		if (el.classList && el.classList.contains(class_name)) {
			return el;
		}
		// Move up to the next parent element in the hierarchy
		el = el.parentNode;
	}
	// If no parent with the class is found, return null
	return null;
}//end find_up_tag



/**
* UPDATE_PARENT_DATA
* @param HTMLElement wrap_ts_object
* @return promise
*/
ts_object.prototype.update_parent_data = async function(options) {

	const section_id				= options.section_id
	const section_tipo				= options.section_tipo
	const old_parent_section_id		= options.old_parent_section_id
	const old_parent_section_tipo	= options.old_parent_section_tipo
	const new_parent_section_id		= options.new_parent_section_id
	const new_parent_section_tipo	= options.new_parent_section_tipo

	/* NOTA:
		QUEDA PENDIENTE RESETEAR EL ESTADO DE LAS FLECHAS SHOW CHILDREN DE LOS HIJOS CUANDO SE ACTUALZA EL PADRE
		PORQUE SI NO NO SE PUEDE VOLVER A ABRIR UN LISTADO DE HIJOS (FLECHA)
	*/

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



/**
* TOGGLE_VIEW_CHILDREN
* Show/hide the children container of current term
* @param HTMLElement link_children_element - The link element that toggles the view.
* @param event - The event object from the click.
* @return promise - A promise that resolves to true on success, false on error.
*/
ts_object.prototype.toggle_view_children = async function(event) {

	const self = this

	// Get and check the parent wrapper
	const wrapper = self.node;
	if (!wrapper) {
		console.error("[toggle_view_children] Error: Wrapper element not found.");
		return false;
	}

	// Get and check the children_container node
	const children_container = self.children_container
	if (!children_container) {
		console.error("[toggle_view_children] Error: Children container not found.");
		return false;
	}

	// link_children_element
	const link_children_element = self.link_children_element
	if (!link_children_element) {
		console.error("[toggle_view_children] Error: link_children_element not found.");
		return false;
	}

	// arrow_icon
	const arrow_icon = link_children_element.firstChild;
	if (!arrow_icon) {
		console.error("[toggle_view_children] Error: Arrow icon not found.");
		return false;
	}

	// short vars
		const section_tipo	= self.section_tipo
		const section_id	= self.section_id
		const children_tipo	= self.children_tipo

		const children_list	= link_children_element.children_list

	// If is the first time that the children are loaded, remove the first class selector and send the query for get the children
	if (children_container.classList.contains('js_first_load') && !children_container.hasChildNodes()) {

		children_container.classList.remove('js_first_load');
		arrow_icon.classList.add('ts_object_children_arrow_icon_open', 'arrow_spinner');
		children_container.classList.add('loading')

		try {
			// children_data - render_children_data from API
			const children_data = await self.get_children_data({
				// section_tipo	: section_tipo,
				// section_id		: section_id,
				// children_tipo	: children_tipo,
				pagination		: null,
				children		: children_list
			})

			if (!children_data) {
				// error case
				console.warn("[ts_object.render_children] Error, children_data is null");
				return false
			}

			// render_children nodes
			await self.render_children({
				clean_children_container : false // bool clean_children_container
			});

		} catch (error) {
			console.error("[toggle_view_children] Error loading children data:", error);
			return false;
		} finally {
			arrow_icon.classList.remove('arrow_spinner');
			children_container.classList.remove('loading')
		}

		// save_opened_elements
		self.save_opened_elements('add')

	}else{ // Toggle view state

		// the toggle view state with the class
		if(children_container.classList.contains('removed_from_view')){

			children_container.classList.remove('removed_from_view');
			arrow_icon.classList.add('ts_object_children_arrow_icon_open');

			// Reload children data on alt-click
			if (event && event.altKey) {

				children_container.classList.add('loading')

				try {
					// children_data - render_children_data from API
					const children_data = await self.get_children_data({
						// section_tipo	: section_tipo,
						// section_id		: section_id,
						// children_tipo	: children_tipo,
						pagination		: null,
						children		: children_list
					})

					if (!children_data) {
						// error case
						console.warn("[ts_object.render_children] Error, children_data is null");
						return false
					}

					await self.render_children({
						clean_children_container : true // bool clean_children_container
					});
				} catch (error) {
					console.error("[toggle_view_children] Error reloading children data:", error);
				} finally {
					children_container.classList.remove('loading')
				}
			}

			// save_opened_elements
			self.save_opened_elements('add')

		}else{

			children_container.classList.add('removed_from_view');
			arrow_icon.classList.remove('ts_object_children_arrow_icon_open');

			// save_opened_elements
			self.save_opened_elements('remove')

		}
	}


	return true
}//end toggle_view_children



/**
* SAVE_OPENED_ELEMENTS
* Saves and track given element open status
* @param HTMLElement link_children_element
* @param string action
* @return bool
*/
ts_object.prototype.save_opened_elements = function(action) {

	const self = this

	// const current_key = link_children_element.child_data.ts_id
	const current_key = self.id
	if (!current_key) {
		console.error('Error.invalid ts_id from current ts_object instance:', self);
		return false
	}

	if (action==='add') {
		this.opened_elements[current_key] = true
	}else{
		delete this.opened_elements[current_key]
	}

	return true
}//end save_opened_elements



/**
* REMOVE_CHILDREN_FROM_OPENED_ELEMENTS
* @return bool
*/
ts_object.prototype.remove_children_from_opened_elements = function(parent_key) {

	for (let key in this.opened_elements) {
		let current_parent = this.opened_elements[key]
		if (current_parent == parent_key){
			delete this.opened_elements[key]
			if(SHOW_DEBUG===true) {
				console.log("[remove_children_from_opened_elements] Removed key ",key)
			}
			this.remove_children_from_opened_elements(key)
		}
	}

	return true
}//end remove_children_from_opened_elements



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

	// undefined clean_others case
		if (typeof clean_others==='undefined') {
			clean_others = true
		}

	// Remove current hilite elements
		if(clean_others!==false) {
			this.reset_hilites()
		}

	// hilite all appearances of current component (may appear more than once)
		const matches = document.querySelectorAll(`.term[data-type="${element.dataset.type}"][data-section_tipo="${element.dataset.section_tipo}"][data-section_id="${element.dataset.section_id}"]`);
		const matches_length = matches.length;
		for (let i = matches_length - 1; i >= 0; i--) {

			const node = matches[i]
			node.classList.add('element_hilite');

			// check parent is arrow_icon_open
				const parent_wrapper = node.parentNode.parentNode.parentNode.parentNode;
				if (!parent_wrapper) {
					console.warn('Unable to get parent wrapper from node:', node);
					return
				}
				const elements_container = [...parent_wrapper.childNodes].find(el => el.classList.contains('elements_container'));
				if (elements_container) {
					const arrow_icon = [...elements_container.childNodes].find(el => el.classList.contains('arrow_icon'));
					if (arrow_icon) {
						arrow_icon.firstChild.classList.remove('arrow_unactive')
						arrow_icon.firstChild.classList.add('ts_object_children_arrow_icon_open')
					}
				}
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
* @param string section_tipo - The section_tipo of the section to refresh.
* @param string section_id - The section_id of the section to refresh.
* @param bool hilite = true - Whether to highlight the refreshed element
* @param function callback - An optional callback function to run after refresh.
* @return int matches_length - The number of elements matched and processed.
*/
ts_object.prototype.refresh_element = async function(section_tipo, section_id, hilite=true, callback) {

	const self = this

	// Locate all term elements
	const type		= 'term';
	const matches	= document.querySelectorAll(
		`.list_thesaurus_element[data-type="${type}"][data-section_tipo="${section_tipo}"][data-section_id="${section_id}"]`
	);
	const matches_length = matches.length

	// no matches case
	if (matches_length===0) {
		console.error("[refresh_element] Error on match elements. Not terms found for section_tipo: "+section_tipo+", section_id: "+section_id+", type: "+type);
		return matches_length;
	}

	// Iterate all matches
	for (let i = matches_length - 1; i >= 0; i--) {

		const term_node = matches[i]

		const direct_wrap = term_node.closest('.wrap_ts_object');
		const parent_wrap = direct_wrap.parentNode.closest('.wrap_ts_object');
		if (!parent_wrap) {
			console.warn("[refresh_element] Could not find the parent wrapper for term node.");
			continue; // Skip to the next match
		}

		// current ts_object instance
		const instance_id = direct_wrap.dataset.id
		const ts_object_instance = instance_id===self.id
			? self
			: get_instance_by_id(instance_id)
		if (!ts_object_instance) {
			console.error('Unable to find the current instance by id:', instance_id);
			continue;
		}

		// short vars
		const section_tipo	= ts_object_instance.section_tipo
		const section_id	= ts_object_instance.section_id
		const children_tipo	= ts_object_instance.children_tipo

		// get_node_data
		await self.get_node_data(section_tipo, section_id, children_tipo);
		// update data
		self.ar_elements = self.node_data.ar_elements

		// Render current instance node again and replace the existing one
		const current_node	= self.node
		const new_node		= await self.render()
		current_node.replaceWith(new_node)

		// // is_open detection
		// const link_children_element	= ts_object_instance.link_children_element
		// const is_open				= link_children_element?.firstChild?.classList.contains('ts_object_children_arrow_icon_open') || self.is_root_node
		// if(is_open) {

		// 	// Children are open case, so refresh by fetching new data

		// 	const children_container = ts_object_instance.children_container
		// 	if (!children_container) {
		// 		console.error("[refresh_element] Could not find children_container.");
		// 		continue; // Skip to the next match
		// 	}

		// 	// pagination is set in DOM link_children_element from API response in get_children call
		// 		const pagination = link_children_element.pagination
		// 			? link_children_element.pagination
		// 			: null

		// 		// Set offset correction when refresh to allow to to see current paginated list
		// 		const edit_pagination = pagination?.offset > 0
		// 			? {
		// 				limit	: pagination.limit + pagination.offset,
		// 				offset	: 0,
		// 				total	: pagination.total
		// 			  }
		// 			: pagination;

		// 	// loading style
		// 		children_container.classList.add('loading')

		// 	try {
		// 		// children_data - render_children_data from API
		// 		const children_data = await ts_object_instance.get_children_data({
		// 			section_tipo	: section_tipo,
		// 			section_id		: section_id,
		// 			children_tipo	: children_tipo,
		// 			pagination		: edit_pagination,
		// 			children		: null
		// 		})

		// 		if (children_data) {

		// 			// Delete previous open opened_elements. (!) Important
		// 			// They are checked in `render_link_children` to prevent duplicity in infinite loop cases
		// 			const ar_children_data = children_data.ar_children_data || []
		// 			const ar_children_data_length = ar_children_data.length
		// 			for (let i = 0; i < ar_children_data_length; i++) {
		// 				const item = ar_children_data[i]
		// 				if (ts_object_instance.opened_elements[item.ts_id]) {
		// 					delete ts_object_instance.opened_elements[item.ts_id]
		// 				}
		// 			}

		// 			// Render nodes
		// 			await ts_object_instance.render_children({
		// 				clean_children_container : true, // bool clean_children_container
		// 			})
		// 		}
		// 	} catch (error) {
		// 		console.error("[refresh_element] An error occurred during data fetch or render:", error);
		// 	} finally {
		// 		// Remove loading style
		// 		children_container.classList.remove('loading');
		// 	}
		// }

		// element to hilite
		if (hilite) {
			requestAnimationFrame( () => { self.hilite_element(term_node) })
		}

		// callback
		if (callback) {
			callback(term_node)
		}
	}//end for (let i = matches_length - 1; i >= 0; i--)


	return matches_length
}//end refresh_element



/**
* EDIT
* Opens a new window where edit current record
* section_id is optional. If not get, the function uses button_obj dataset section_id
* @param HTMLElement button_obj
* @param int|string section_id
* @param string section_tipo
* @return bool
*/
ts_object.prototype.edit_window = null; // Class var
ts_object.prototype.edit = function(section_id, section_tipo) {

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
				self.refresh_element(section_tipo, section_id)
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
}//end edit



/**
* ADD_CHILD
* Call to API to create a new record and add the current element his parent
* @param object options
* {
* 	section_id : string|int
* 	section_tipo: string
* }
* @return api_response
*/
ts_object.prototype.add_child = async function(options) {

	// options
		const section_id	= options.section_id
		const section_tipo	= options.section_tipo

	// mandatory options check
		const mandatory = ['section_id','section_tipo']
		mandatory.map(el => {
			if (!options[el]) {
				alert(`Error: var ${el} is mandatory!`);
				console.warn('options:', options);
				throw '[add_child] Mandatory vars check fail for options: ' + el
			}
		})

	// source
		const source = {
			section_id		: section_id,
			section_tipo	: section_tipo
		}

	// API call
		const rqo = {
			dd_api	: 'dd_ts_api',
			action	: 'add_child',
			source	: source
		}

	// API request
		const api_response = await data_manager.request({
			body : rqo
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
* SELECT_FIRST_INPUT_IN_EDITOR
* @param HTMLElement element_data_div
*/
ts_object.prototype.select_first_input_in_editor = function(element_data_div) {

	// Focus first input element
		const first_input = element_data_div.querySelector('input')
		if (first_input) {
			// Select all content
			first_input.select()
			// Hide editor on change value
			first_input.addEventListener("change", function(){
				//self.refresh_element(section_tipo, section_id)
				element_data_div.style.display = 'none'
			});
		}

	return true
}//end select_first_input_in_editor



/**
* SHOW_COMPONENT_IN_TS_OBJECT
* Show and hide component data in ts_object content_data div
* @param object button_obj
* @return promise
*/
ts_object.prototype.show_component_in_ts_object = async function(button_obj, event) {

	const self = this

	// short vars
		const wrapper		= button_obj.parentNode.parentNode;
		const section_tipo	= wrapper.dataset.section_tipo
		const section_id	= wrapper.dataset.section_id
		const type			= button_obj.dataset.type
		const tipo			= button_obj.dataset.tipo
		const tipos			= tipo.split(',')
		const lang			= page_globals.dedalo_data_lang

	// delete the previous registered events
		self.events_tokens.map(current_token => event_manager.unsubscribe(current_token))

	// render_component_node function
		const components = [] // array of created component instances
		const render_component_node = async function(tipo, key) {

			const loader = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'loader loading',
				inner_html		: 'Loading component..',
				parent			: element_data_contanier
			})

			const model = await data_manager.resolve_model(tipo, section_tipo)

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
							button_obj.firstChild.innerHTML = value

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
						self.events_tokens.push(
							event_manager.subscribe('save_' + current_component.id_base, save_handler)
						)
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
		const element_data_contanier	= [...wrapper.childNodes].find(el => el.classList.contains('data_container'))
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
	* 	"hierarchy1_66": {
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
	* 	}
	* }]
* @param array to_hilite
* 	array of locators found in search as
* [{
*    "section_tipo": "flora1",
*    "section_id": "1"
* }]
* @return bool
*/
ts_object.prototype.current_main_div = null;
ts_object.prototype.parse_search_result = async function( data, to_hilite ) {

	const self = this

	// reset previous hilites
	self.reset_hilites()

	// render all nodes and store it
	const data_length = data.length
	const ts_nodes = []

	let node_to_scroll = null

	for (let i = 0; i < data_length; i++) {

		const item = data[i]

		// Render using instances
		const current_instance = new ts_object()
		await current_instance.init({
			thesaurus_mode				: self.thesaurus_mode,
			caller						: self,
			linker						: self.linker, // usually a portal component instance
			section_tipo				: item.section_tipo,
			section_id					: item.section_id,
			children_tipo				: item.children_tipo,
			target_section_tipo			: self.target_section_tipo,
			is_indexable				: item.is_indexable,
			is_descriptor				: item.is_descriptor,
			ar_elements					: item.ar_elements,
			ts_id						: item.ts_id,
			ts_parent					: item.ts_parent,
			order						: item.order,
			permissions_button_delete	: item.permissions_button_delete,
			permissions_button_new		: item.permissions_button_new,
			permissions_indexation		: item.permissions_indexation
		})
		const node = await current_instance.render()

		// set pointers
		node.ts_id					= current_instance.ts_id
		node.ts_parent				= current_instance.ts_parent
		node.section_tipo			= current_instance.section_tipo
		node.children_container		= current_instance.children_container
		node.link_children_element	= current_instance.link_children_element

		// find if the current record was the term searched
		const searched_node = to_hilite.find(el => el.section_tipo===item.section_tipo && el.section_id===item.section_id)
		// if the record was a searched term add a hilite class to remark it
		if(searched_node){
			const term_node = current_instance.term_node
			if (term_node) {
				requestAnimationFrame(
					() => {
						term_node.classList.add('element_hilite');
						if (!node_to_scroll) {
							node_to_scroll = term_node
						}
					}
				);
			}
		}
		// store the result
		ts_nodes.push(node)
	}

	// link the nodes with his own parent node
	const ts_nodes_length = ts_nodes.length
	for (let i = 0; i < ts_nodes_length; i++) {

		const current_node = ts_nodes[i]

		// only the root parent node needs to be linked to the main node.
		if(current_node.ts_parent==='root'){
			// get the main div into the doom
			main_div = document.querySelector(`.hierarchy_root_node.${current_node.section_tipo}>.children_container`)
			if (main_div) {

				// Clean main div (Clean previous nodes from root)
				while (main_div.firstChild) {
					main_div.removeChild(main_div.firstChild);
				}
				main_div.appendChild(current_node)
			}
		}else{

			// link the node with its own parent
			const parent_node = ts_nodes.find(el => el.ts_id===current_node.ts_parent)

			if(parent_node && parent_node.children_container){
				// set the link children state (arrow icon open)
				parent_node.link_children_element.firstChild.classList.add('ts_object_children_arrow_icon_open');

				// add node
				parent_node.children_container.appendChild(current_node)
			}
		}
	}

	// scroll to first found element
	if (node_to_scroll) {
		scroll_to_node(node_to_scroll)
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
* BUILD_ORDER_FORM
* @param HTMLElement button_obj
* @return bool
*/
ts_object.prototype.build_order_form = function(button_obj) {

	const self = this

	// Remove previous inputs
		const order_inputs	= document.querySelectorAll('input.input_order')
		const len			= order_inputs.length
		for (let i = len - 1; i >= 0; i--) {
			order_inputs[i].remove()
		}

	const old_value = parseInt(button_obj.textContent)

	// input
		const input = document.createElement('input')
		input.classList.add('id_column_link','input_order')
		input.value = old_value

		// keydown event
		const keydown_handler = (e) => {
			// prevent to fire open search panel
			e.stopPropagation()
		}
		input.addEventListener('keydown', keydown_handler);
		input.addEventListener('keyup', keydown_handler);

		// change event
		const change_handler = (e) => {
			e.stopPropagation()
			self.save_order( button_obj, parseInt(input.value) )
			setTimeout(function(){
				input.blur()
			}, 300)
		}
		input.addEventListener('change', change_handler);

		// blur event
		const blur_handler = (e) => {
			e.stopPropagation()
			e.preventDefault()
			input.remove()
			button_obj.classList.remove('hide')
		}
		input.addEventListener('blur', blur_handler);

	// Add input element after
		button_obj.parentNode.insertBefore(input, button_obj.nextSibling);

	// Hide button_obj
		button_obj.classList.add('hide')

	// Focus and select new input element
		input.focus();
		input.select();


	return true
}//end build_order_form



/**
* SAVE_ORDER
* @param HTMLElement button_obj
* @param mixed new_value
* @return promise
*/
ts_object.prototype.save_order = async function(button_obj, new_value) {

	const self = this

	const old_value = parseInt(button_obj.textContent)

	// check is new_value
		if (new_value===old_value) {
			if(SHOW_DEBUG===true) {
				console.log("[ts_object.save_order] Value is not changed. ignored save_order action")
			}
			return Promise.resolve(false);
		}

	// short vars
		const element_wrap			= button_obj.parentNode.parentNode
		const element_section_tipo	= element_wrap.dataset.section_tipo
		const element_section_id	= element_wrap.dataset.section_id
		const wrap					= element_wrap.parentNode.parentNode
		// children nodes of type 'wrap_ts_object'
		const children				= [...element_wrap.parentNode.childNodes].filter(el => el.classList.contains('wrap_ts_object'))
		const children_len			= children.length

	// new_value. Prevent set invalid values
		if (new_value>children_len){
			new_value = children_len // max value is array length
		}else if (new_value<1) {
			new_value = 1;    // min value is 1
		}

	// ar_locators. Iterate children elements
		const ar_locators = []
		for (let i = 0; i < children_len; i++) {
			if (children[i].dataset.section_tipo && children[i].dataset.section_id) {
				ar_locators.push({
					section_tipo	: children[i].dataset.section_tipo,
					section_id		: children[i].dataset.section_id
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

	// short vars
		const section_tipo	= wrap.dataset.section_tipo

	// loading
		wrap.classList.add('loading')

	// API request
		const rqo = {
			dd_api			: 'dd_ts_api',
			prevent_lock	: true,
			action			: 'save_order',
			source			: {
				section_tipo	: section_tipo,
				ar_locators		: ar_locators
			}
		}
		// API request
		const api_response = await data_manager.request({
			body : rqo
		})

		// debug
			if(SHOW_DEBUG===true) {
				console.log("[ts_object.save_order] api_response", api_response)
			}

		if (api_response.result && api_response.result!==false) {
			// Refresh element
			self.refresh_element(
				element_section_tipo,
				element_section_id,
				true, // hilite
				() => {
					// callback executed after refresh is done
					wrap.classList.remove('loading')
				}
			)
		}else{
			alert("[ts_object.save_order] Error on save order. \n\n"+ api_response.msg )
		}


	return api_response
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
	const nd_container = self.get_my_parent_container(button_obj, 'nd_container')
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
	const children_container = self.get_my_parent_container(button_obj, 'children_container')
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



/**
* GET_MY_PARENT_CONTAINER
* Returns current element (list_thesaurus_element) container of type inside his ts_element
* @param HTMLElement button_obj
* @param string role
* @return HTMLElement|null parent_container
*/
ts_object.prototype.get_my_parent_container = function(button_obj, role) {

	if (!button_obj || !role) {
		console.error("GET_MY_PARENT_CONTAINER: Invalid arguments provided. 'button_obj' and 'role' are required.", button_obj, role);
		return null;
	}

	// Get the closest 'wrap_ts_object' ancestor of button_obj
	const wrapper = button_obj.closest('.wrap_ts_object');
	if (!wrapper) {
		console.error("GET_MY_PARENT_CONTAINER: Could not find a parent element with class 'wrap_ts_object'.");
		return null;
	}

	for (const child of wrapper.children) {
		if (child.dataset.role === role) {
			return child;
		}
	}

	console.warn(`GET_MY_PARENT_CONTAINER: No child element with data-role='${role}' found inside the wrapper.`);
	return null;
}//end get_my_parent_container



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
