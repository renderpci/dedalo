// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, get_current_url_vars */
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'
	import {get_instance} from '../../common/js/instances.js'
	import {object_to_url_vars, open_window} from '../../common/js/utils/index.js'
	import {event_manager} from '../../common/js/event_manager.js'
	import {dd_request_idle_callback} from '../../common/js/events.js'
	import {data_manager} from '../../common/js/data_manager.js'
	import {
		render_ts_pagination,
		render_children_list
	} from './render_ts_object.js'



/**
* TS_OBJECT
* Manages a single thesaurus row element
* Note that ts_object is v5 legacy code and do not use instances !
*/
export const ts_object = new function() {



	// class vars
		// Set on update element in DOM (refresh)
		this.element_to_hilite = null;
		// thesaurus_mode . Defines appearance of thesaurus
		this.thesaurus_mode = null;
		// events_tokens
		this.events_tokens = [];



	/**
	* GET_CHILDREN
	* Get the JSON data from the server. When data is loaded, render DOM element
	* Data is built from parent node info (current object section_tipo and section_id)
	* @param HTMLElement children_element
	* @return promise
	*/
	this.get_children = function(children_element, pagination, clean_children_container) {


		// short vars
			const tipo					= children_element.dataset.tipo
			const wrap					= children_element.parentNode.parentNode
			const parent_section_id		= wrap.dataset.section_id
			const parent_section_tipo	= wrap.dataset.section_tipo
			const node_type				= wrap.dataset.node_type || null
			const target_section_tipo	= wrap.dataset.target_section_tipo
			const caller				= this.caller
			const thesaurus_view_mode	= caller.thesaurus_view_mode

		// check vars
			if (!parent_section_tipo || typeof parent_section_tipo==="undefined") {
				console.log("[get_children] Error. parent_section_tipo is not defined");
				return Promise.resolve(false);
			}
			if (!parent_section_id || typeof parent_section_id==="undefined") {
				console.log("[get_children] Error. parent_section_id is not defined");
				return Promise.resolve(false);
			}
			if (!tipo || typeof tipo==="undefined") {
				if (SHOW_DEBUG===true) {
					console.log(new Error().stack);
				}
				console.error("[get_children] Error. tipo is not defined");
				return Promise.resolve(false);
			}

		// children_container. Is the div container inside current ts_object
			const children_container = (()=>{

				const wrap_children		= wrap.childNodes
				const wrap_children_len	= wrap_children.length
				for (let i = wrap_children_len - 1; i >= 0; i--) {
					if(wrap_children[i].dataset.role && wrap_children[i].dataset.role==="children_container") {
						return wrap_children[i]
					}
				}

				return null
			})()
			if (children_container===null) {
				alert("[ts_object.get_children] Error on select children_container");
				return Promise.resolve(false);
			}

		return new Promise(function(resolve){

			// API call
			const rqo = {
				dd_api			: 'dd_ts_api',
				prevent_lock	: true,
				action			: 'get_children_data',
				source			: {
					section_id			: parent_section_id,
					section_tipo		: parent_section_tipo,
					node_type			: node_type,
					target_section_tipo	: target_section_tipo,
					tipo				: tipo,
					build_options : {
						terms_are_model : self.thesaurus_view_mode==='model'
					}
				},
				options : {
					pagination			: pagination,
					thesaurus_view_mode	: thesaurus_view_mode
				}
			}
			data_manager.request({
				body : rqo
			})
			.then(async function(response) {

				if (response && response.result) {

					// success case

					// dom_parse_children
						const ar_children_data = response.result
						const options = {
							target_section_tipo			: target_section_tipo,
							node_type					: node_type,
							clean_children_container	: clean_children_container ?? false,
							pagination					: response.pagination
						}
						const result = await ts_object.dom_parse_children(
							ar_children_data,
							children_container,
							options
						)

					// fix children_element pagination (used on refresh_element to get current pagination status)
						children_element.pagination = response.pagination

					// updates arrow
						if (children_element && children_element.firstChild && children_element.dataset.type) {
							// remove spinner
							children_element.firstChild.classList.remove('arrow_spinner');
							// set arrow icon as opened
							const add_class = (children_element.dataset.type==='link_children_nd')
								? 'ts_object_children_arrow_icon_open_nd'
								: 'ts_object_children_arrow_icon_open'

							children_element.firstChild.classList.add(add_class)
							// Update arrow state
							// ts_object.update_arrow_state(children_element, true) // disabled temporally
						}

					resolve(result)

				}else{

					// error case

					console.warn("[ts_object.get_children] Error, response is null");

					resolve(false)
				}
			})
		})
	}//end get_children



	/**
	* GET_CHILDREN_RECURSIVE
	* Get all children section of the caller term
	* Data is built from parent node info (section_tipo and section_id)
	* @param object options
	* @return promise
	*/
	this.get_children_recursive = function( options ) {

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
				show 			: {
					ddo_map			: []
				},
				sqo: {
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
	* @param HTMLElement link_children_element
	* @param bool toggle
	* @return true
	*/
	this.update_arrow_state = function(link_children_element, toggle) {

		// Children_container
			const children_container = ts_object.get_my_parent_container(link_children_element, 'children_container')

		// Toggle_view_children
			if (children_container.classList.contains('js_first_load')===true || children_container.classList.contains('removed_from_view')===true) {
				ts_object.toggle_view_children(link_children_element)
			}

		// Children_container nodes > 0
			if (children_container.children.length===0) {
				if (toggle===true) {
					ts_object.toggle_view_children(link_children_element)
				}
				link_children_element.firstChild.classList.add('arrow_unactive')
			}else{
				link_children_element.firstChild.classList.remove('arrow_unactive')
			}


		return true
	}//end update_arrow_state



	/**
	* DOM_PARSE_CHILDREN
	* @param array ar_children_data
	*	Array of children of current term from JSON source trigger
	* @param DOM object children_container
	*	children_container is 'children_container'
	* @param object options
	*
	* @return promise
	*/
	this.dom_parse_children = function(ar_children_data, children_container, options) {

		const self = this

		// check vars
			if (!ar_children_data) {
				console.warn("[dom_parse_children] Error. No ar_children_data received. Nothing is parsed")
				return Promise.resolve(false);
			}
			if (!children_container) {
				console.warn("[dom_parse_children] Error. No children_container received. Nothing is parsed");
				return Promise.resolve(false);
			}

		// options set values
			const clean_children_container		= typeof options.clean_children_container!=='undefined' ? options.clean_children_container : true
			const target_section_tipo			= typeof options.target_section_tipo!=='undefined' ? options.target_section_tipo : null
			const node_type						= typeof options.node_type!=='undefined' ? options.node_type : 'thesaurus_node'
			let next_node_type					= node_type
			const children_container_is_loaded	= typeof options.children_container_is_loaded!=='undefined' ? options.children_container_is_loaded : false
			const show_arrow_opened				= typeof options.show_arrow_opened!=='undefined' ? options.show_arrow_opened : false
			const pagination					= options.pagination || {}
			const mode							= options.mode || 'list'

		// Clean children container before build contents
			if (clean_children_container===true) {
				while (children_container.hasChildNodes()) {
					children_container.removeChild(children_container.lastChild);
				}
			}

		// nd_container
			let parent_nd_container		= null
			const wrapper_children		= children_container.parentNode.children
			const wrapper_children_len	= wrapper_children.length
			for (let i = wrapper_children_len - 1; i >= 0; i--) {
				if (wrapper_children[i].dataset.role==='nd_container') {
					parent_nd_container = wrapper_children[i];
					break
				}
			}
			// Clean always
			while (parent_nd_container && parent_nd_container.hasChildNodes()) {
				parent_nd_container.removeChild(parent_nd_container.lastChild);
			}


		// Build DOM elements iterating ar_children_data
		return new Promise(function(resolve) {

			// build_ts_list
				const ar_children_c = render_children_list({
					self							: self,
					ar_children_data				: ar_children_data,
					target_section_tipo				: target_section_tipo,
					children_container				: children_container,
					parent_nd_container				: parent_nd_container,
					children_container_is_loaded	: children_container_is_loaded,
					node_type						: node_type,
					next_node_type					: next_node_type,
					show_arrow_opened				: show_arrow_opened,
					mode							: mode
				})

			// pagination
				if (pagination.total &&
					pagination.limit &&
					pagination.total > pagination.limit &&
					(pagination.offset + pagination.limit) < pagination.total
					) {

					render_ts_pagination({
						children_container	: children_container,
						pagination			: pagination
					})
				}

			resolve(ar_children_c);
		})
	}//end dom_parse_children



	/**
	* ON_DRAG_MOUSEDOWN
	* Fix ts_object.handle with received event
	* @param event event
	* @return void
	*/
	this.source = null;
	this.handle = null;
	this.on_drag_mousedown = function(event) {
		if(SHOW_DEBUG===true) {
			// console.log("))))) ts_object.on_drag_mousedown set handler:", event);
		}

		// handle. set with event value
			ts_object.handle = event
	}//end on_drag_mousedown



	/**
	* ON_DRAGSTART
	* @param event event
	* @return void
	*/
	this.old_parent_wrap = null
	this.on_dragstart = function(event) {
		event.stopPropagation()

		if(SHOW_DEBUG===true) {
			// console.log("))))) ts_object.on_dragstart event", event);
		}

		// wrap_ts_object. Find parent wrapper. Note that 'ts_object' is not an instance
			const wrap_ts_object = ts_object.find_up_tag(event.srcElement, 'wrap_ts_object')

		// wrap_ts_object ondrop set as null
			wrap_ts_object.ondrop = null

		// if handle
			if (ts_object.handle) {
				event.stopPropagation();
				ts_object.source = wrap_ts_object;
				event.dataTransfer.effectAllowed = 'move';
				event.dataTransfer.setData('text/html', wrap_ts_object.innerHTML);
			}else{
				event.preventDefault();
			}

		// Fix class var 'old_parent_wrap'
			ts_object.old_parent_wrap = wrap_ts_object.parentNode.parentNode;
			if(!ts_object.old_parent_wrap) {
				console.log("[on_dragstart] Error on find old_parent_wrap");
			}
	}//end on_dragstart



	/**
	* ON_DRAG_END
	* @param event event
	* @return void
	*/
	this.target = null
	this.on_drag_end = function(event) {
		event.preventDefault()
		event.stopPropagation()

		if(SHOW_DEBUG===true) {
			// console.log("))))) ts_object.on_drag_end event", event);
		}

		// target set as false
			this.target = false;

		// source. set as blank
			ts_object.source = null;
	}//end on_drag_end



	/**
	* ON_DROP
	* @param event event
	* @return bool
	*/
	this.on_drop = async function(event) {
		event.preventDefault();
		event.stopPropagation();

		if(SHOW_DEBUG===true) {
			// console.log("----------------------->>> ts_object.on_drop event:", event);
		}

		// wrap_ts_object. Find parent wrapper. Note that 'ts_object' is not an instance
			const wrap_ts_object = ts_object.find_up_tag(event.srcElement, 'wrap_ts_object')

		// Remove drag_over class
			wrap_ts_object.classList.remove('drag_over')

		// wraps
			const wrap_source	= ts_object.source // element that's move (global var defined at 'on_drag_mousedown')
			const wrap_target	= wrap_ts_object // element on user leaves source wrap
			if (wrap_source === wrap_target) {
				console.warn("[ts_object.on_drop] Unable self drop (2) wrap_source is equal wrap_target");
				return false;
			}

		// div_children
			let div_children	= null
			const nodes			= wrap_target.children // childNodes
			const nodes_len		= nodes.length
			for (let i = nodes_len - 1; i >= 0; i--) {
				if (nodes[i].dataset.role === 'children_container'){
					div_children = nodes[i]; break;
				}
			}
			if (div_children===null) {
				console.warn("[ts_object.on_drop] Unable self drop (3) div_children not found in nodes:",nodes);
				return false;
			}

		// data_transfer_json case
		// used by tool_cataloging to add data to the ts
			const data_transfer_json = event.dataTransfer.getData("text/plain")
			if (data_transfer_json && data_transfer_json.length>0) {
				// parse from event.dataTransfer
					const data_obj = JSON.parse(data_transfer_json)

				// add children, create new section and his node in the tree
				// go deep in the tree to point base to getback into the wrap by the add_child method
				// (it will use parentNode.parentNode to find the wrap)
					const button_obj = wrap_target.firstChild.firstChild
					// set mode to button for add_child
					button_obj.dataset.mode = (wrap_target.dataset.section_tipo==='hierarchy1')
						? 'add_child_from_hierarchy'
						: 'add_child';
					// request to create the section and node
					ts_object.add_child(button_obj)
					.then(function(response){

						// callback
						if (data_obj.caller) {

							// new_section_id . Generated as response by the trigger add_child
								const new_section_id = response.result
							// section_tipo. When dataset target_section_tipo exists, is hierarchy_node. Else is normal node
								const section_tipo = wrap_target.dataset.target_section_tipo || wrap_target.dataset.section_tipo

							// fire the event to update the component used as term in the new section
								event_manager.publish('ts_add_child_' + data_obj.caller, {
									locator			: data_obj.locator,
									new_ts_section	: {
										section_id		: new_section_id,
										section_tipo	: section_tipo
									},
									callback : function() {

										// link_children_element. list_thesaurus_element of current wrapper
										const link_children_element = ts_object.get_link_children_from_wrap(wrap_target)
										if(!link_children_element) {
											console.warn("[tool_cataloging.set_new_thesaurus_value] Error on find link_children_element 'link_childrens'");
											return false
										}

										// ts_object.update_arrow_state(link_children_element, true)

									// refresh children container
										ts_object.get_children(
											link_children_element,
											null, // object|null pagination
											true // bool clean_children_container
										)
										.then(function(){
											// update parent arrow button
											 // ts_object.update_arrow_state(link_children_element, true)
											ts_object.update_arrow_state(link_children_element, false)
										})

									}
								})
						}//end if (data_obj.caller)
					})

				return true // stop execution here
			}

		// element_children target/source
			const element_children_target	= ts_object.get_link_children_from_wrap(wrap_target)
			const element_children_source	= ts_object.get_link_children_from_wrap(ts_object.old_parent_wrap)

		// check nodes
			if ( !div_children || !wrap_source ) {
				console.error('"Error on append child":', wrap_source, div_children);
				return false
			}

		// add node
			div_children.appendChild(wrap_source)

		// Update parent data (returns a promise after HTTP request finish)
			const response = await ts_object.update_parent_data(wrap_source)

		// Updates element_children_target
			// ts_object.update_arrow_state(element_children_target, true) // Not necessary ?

		// Updates element_children_source
			ts_object.update_arrow_state(element_children_source, false)

		// hilite moved term. wait 200 ms to allow arrow state update
			dd_request_idle_callback(
				() => {
					const element = wrap_source.querySelector('.list_thesaurus_element[data-type="term"]')
					if (element) {
						ts_object.hilite_element(element)
					}
				}
			)

		// debug
			if(SHOW_DEBUG===true) {
				console.log("))))) [on_drop ts_object.update_parent_data] response", response)
				console.log("))))) [ts_object.on_drop] Finish on_drop 3");
			}


		return true;
	}//end on_drop



	/**
	* ON_DRAGOVER
	* @param event event
	* @return void
	*/
	this.on_dragover = function(event) {
		event.preventDefault();
		event.stopPropagation();

		// wrap_ts_object. Find parent wrapper. Note that 'ts_object' is not an instance
		const wrap_ts_object = ts_object.find_up_tag(event.target, 'wrap_ts_object')
		if (wrap_ts_object.classList.contains('drag_over')) {
			return false
		}

		if(SHOW_DEBUG===true) {
			// console.log("))))) ts_object.on_dragover event:", event.target);
		}

		// dataTransfer
		event.dataTransfer.dropEffect = 'move';  // See the section on the DataTransfer object.

		// Add drag_over class
		wrap_ts_object.classList.add('drag_over')
	}//end on_dragover



	/**
	* ON_DRAGLEAVE
	* @param event event
	* @return void
	*/
	this.on_dragleave = function(event) {
		// event.preventDefault();
		event.stopPropagation();

		// wrap_ts_object. Find parent wrapper. Note that 'ts_object' is not an instance
		const wrap_ts_object = ts_object.find_up_tag(event.target, 'wrap_ts_object')

		if(SHOW_DEBUG===true) {
			// console.log("))))) ts_object.on_dragleave event:", event);
		}

		// Remove drag_over class
		if (wrap_ts_object.classList.contains('drag_over')) {
			wrap_ts_object.classList.remove('drag_over')
		}else{
			event.preventDefault();
		}
	}//end on_dragleave



	/**
	* ON_ORDER_DRAG_MOUSEDOWN
	* @return void
	*/
		// this.order_source = null;
		// this.order_handle = null;
		// this.on_order_drag_mousedown = function(obj, event) {

		// 	ts_object.order_handle = event;
		// }//end on_order_drag_mousedown



	/**
	* ON_ORDER_DRAGSTART
	* @return void
	*/
		// this.on_order_dragstart = function(obj, event) {

		// 	obj.ondrop = null;

		// 	// if (order_handle)
		// 	if (ts_object.order_handle) {
		// 		event.stopPropagation();
		// 		ts_object.order_source = obj;
		// 		event.dataTransfer.effectAllowed = 'move';
		// 		event.dataTransfer.setData('text/html', obj.innerHTML);
		// 	} else {
		// 		event.preventDefault();
		// 	}
		// }//end on_order_dragstart



	/**
	* ON_ORDER_DRAG_END
	* @return void
	*/
		// this.on_order_drag_end = function() {

		// 	ts_object.target		= null;
		// 	ts_object.order_source	= null;
		// }//end on_order_drag_end



	/**
	* ON_ORDER_DRAGOVER
	* @param DOM object obj
	* 	Is the whole ts_object target wrapper
	* @return void
	*/
		// this.on_order_dragover = function(obj, event) {
		// 	event.preventDefault(); // Necessary. Allows us to drop.
		// 	event.stopPropagation();
		// 	event.dataTransfer.dropEffect = 'move';  // See the section on the DataTransfer object.
		// }//end on_order_dragover



	/**
	* FIND_UP_TAG
	* Search parent with given CSS selector recursively
	* @param HTMLElement el
	* @param string class_name 'wrap_ts_object'
	* @return HTMLElement|null
	*/
	this.find_up_tag = function(el, class_name) {
		if (el.classList.contains(class_name)) {
			return el
		}
		while (el.parentNode) {
			el = el.parentNode;
			if (el.classList.contains(class_name))
				return el;
		}
		return null;
	}//end find_up_tag



	/**
	* UPDATE_PARENT_DATA
	* @param HTMLElement wrap_ts_object
	* @return promise
	*/
	this.update_parent_data = function(wrap_ts_object) {

		/* NOTA:
			QUEDA PENDIENTE RESETEAR EL ESTADO DE LAS FLECHAS SHOW CHILDREN DE LOS HIJOS CUANDO SE ACTUALZA EL PADRE
			PORQUE SI NO NO SE PUEDE VOLVER A ABRIR UN LISTADO DE HIJOS (FLECHA)
		*/

		// Old parent wrap (previous parent)
			const old_parent_wrap = ts_object.old_parent_wrap
			if (!old_parent_wrap) {
				console.log("[ts_object.update_parent_data] Error on find old_parent_wrap");
				return Promise.resolve(function(){return false});
			}

		// parent wrap (current drooped new parent)
			const parent_wrap = wrap_ts_object.parentNode.parentNode;
			if(!parent_wrap) {
				console.log("[ts_object.update_parent_data] Error on find parent_wrap");
				return Promise.resolve(function(){return false});
			}

		// element_children
			const element_children = ts_object.get_link_children_from_wrap(parent_wrap)

		// If old and new wrappers are the same, no is necessary update data
			if (old_parent_wrap===parent_wrap) {
				console.log("[ts_object.update_parent_data] New target and old target elements are the same. No is necessary update data");
				return Promise.resolve(function(){return false});
			}

		// short vars
			const section_id				= wrap_ts_object.dataset.section_id
			const section_tipo				= wrap_ts_object.dataset.section_tipo
			const old_parent_section_id		= old_parent_wrap.dataset.section_id
			const old_parent_section_tipo	= old_parent_wrap.dataset.section_tipo
			const parent_section_id			= parent_wrap.dataset.section_id
			const parent_section_tipo		= parent_wrap.dataset.section_tipo
			const parent_node_type			= parent_wrap.dataset.node_type
			const tipo						= element_children.dataset.tipo

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
					parent_section_id		: parent_section_id,
					parent_section_tipo		: parent_section_tipo,
					parent_node_type		: parent_node_type,
					tipo					: tipo
				}
			}
			const js_promise = data_manager.request({
				body : rqo
			})


		return js_promise
	}//end update_parent_data



	/**
	* TOGGLE_VIEW_CHILDREN
	* @param DOM object link_children_element
	* @param event
	* @return promise|null
	*/
	this.toggle_view_children = function(link_children_element, event) {

		const self = this

		let result = null

		const children_container = self.get_my_parent_container(link_children_element, 'children_container')

		// If is the first time that the children are loaded, remove the first class selector and send the query for get the children
		if (children_container.classList.contains('js_first_load') && !children_container.hasChildNodes()) {

			children_container.classList.remove('js_first_load');
			link_children_element.firstChild.classList.add('ts_object_children_arrow_icon_open', 'arrow_spinner');

			// Load element by AJAX
				result = self.get_children(
					link_children_element,
					null, // object|null pagination
					false // bool clean_children_container
				);

			// save_opened_elements
			self.save_opened_elements(link_children_element,'add')

		}else{

			// the toggle view state with the class
			if(children_container.classList.contains('removed_from_view')){
				children_container.classList.remove('removed_from_view');
				link_children_element.firstChild.classList.add('ts_object_children_arrow_icon_open');

				// Load element by AJAX
					if (typeof event!=="undefined" && event.altKey===true) {
						result = self.get_children(
							link_children_element,
							null, // object pagination
							true // bool clean_children_container
						);
					}

				// save_opened_elements
				self.save_opened_elements(link_children_element,'add')

			}else{

				children_container.classList.add('removed_from_view');
				link_children_element.firstChild.classList.remove('ts_object_children_arrow_icon_open');

				// save_opened_elements
				self.save_opened_elements(link_children_element,'remove')
			}
		}


		return result
	}//end toggle_view_children



	/**
	* SAVE_OPENED_ELEMENTS
	* @return
	*/
	this.opened_elements = {}
	this.save_opened_elements = function(link_children_element, action) {

		if(SHOW_DEBUG!==true) {
			return false;
		}

		const wrap	= link_children_element.parentNode.parentNode
		const key	= wrap.dataset.section_tipo +'_'+ wrap.dataset.section_id

		if (action==='add') {

			const open_children_elements = wrap.getElementsByClassName('ts_object_children_arrow_icon_open')
			const len = open_children_elements.length

			for (let i = len - 1; i >= 0; i--) {
				const current_wrap			= open_children_elements[i].parentNode.parentNode.parentNode
				const current_parent_node	= current_wrap.parentNode.parentNode
				const current_parent		= current_parent_node.dataset.section_tipo +'_'+ current_parent_node.dataset.section_id
				const current_key			= current_wrap.dataset.section_tipo +'_'+ current_wrap.dataset.section_id

				this.opened_elements[current_key] = current_parent
			}

		}else{
			delete this.opened_elements[key]
			this.remove_children_from_opened_elements(key)
		}

		return true
	}//end save_opened_elements



	/**
	* REMOVE_CHILDREN_FROM_OPENED_ELEMENTS
	* @return bool
	*/
	this.remove_children_from_opened_elements = function(parent_key) {

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
	* @return int len
	* 	matches.length
	*/
	this.hilite_element = function(element, clean_others) {

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
			const matches	= document.querySelectorAll('.list_thesaurus_element[data-type="'+element.dataset.type+'"][data-section_tipo="'+element.dataset.section_tipo+'"][data-section_id="'+element.dataset.section_id+'"]');
			const len		= matches.length;
			for (let i = len - 1; i >= 0; i--) {

				const node = matches[i]
				node.classList.add("element_hilite");

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

		return len
	}//end hilite_element



	/**
	* RESET_HILITES
	* Removes css class element_hilite from all elements
	*/
	this.reset_hilites = function() {

		const matches	= document.querySelectorAll('.element_hilite');
		const len		= matches.length;
		for (let i = len - 1; i >= 0; i--) {
			matches[i].classList.remove("element_hilite");
		}

		return true
	}//end reset_hilites



	/**
	* REFRESH_ELEMENT
	* Reload selected element/s wrap in DOM
	* @param string section_tipo
	* @param string section_id
	* @return int matches_length
	*  (matches.length)
	*/
	this.refresh_element = function(section_tipo, section_id, hilite=true, callback) {

		const self = this

		// Locate all term elements
		const type				= 'term';
		const matches			= document.querySelectorAll('.list_thesaurus_element[data-type="'+type+'"][data-section_tipo="'+section_tipo+'"][data-section_id="'+section_id+'"]');
		const matches_length	= matches.length

		// no matches case
			if (matches_length===0) {
				console.error("[refresh_element] Error on match elements. Not terms found for section_tipo:"+section_tipo+", section_id:"+section_id+", type:"+type);
				return matches_length;
			}

		// iterate all matches
		for (let i = matches_length - 1; i >= 0; i--) {

			const term_node = matches[i]

			const parent_wrap		= term_node.parentNode.parentNode.parentNode.parentNode
			const element_children	= ts_object.get_link_children_from_wrap(parent_wrap)
			const is_open			= element_children?.firstChild.classList.contains('ts_object_children_arrow_icon_open')

			if(element_children && is_open) {

				// pagination is set in DOM element_children from API response in get_children call
					const pagination = element_children.pagination
						? element_children.pagination
						: null

					const edit_pagination = (pagination && pagination.offset>0)
						? (()=>{

							const new_limit = pagination.offset > 0
								? (pagination.limit + pagination.offset)
								: pagination.limit

							return {
								limit	: new_limit,
								offset	: 0,
								total	: pagination.total
							}
						  })()
						: pagination

				// load children data and build nodes
					ts_object.get_children(
						element_children,
						edit_pagination, // object pagination
						true // bool clean_children_container
					)
					.then(function() {
						// const arrow_div = element_children.querySelector('.ts_object_children_arrow_icon')
						// if (arrow_div && arrow_div.classList.contains('ts_object_children_arrow_icon_open')===false) {
						// 	// Reopen arrow children
						// 	//ts_object.toggle_view_children(element_children)
						// }

						// element to hilite
						if (hilite) {
							dd_request_idle_callback(
								() => {
									self.hilite_element(term_node)
								}
							)
						}

						// callback
						if (callback) {
							callback(term_node)
						}
					})
			}else if(!element_children){
				if (SHOW_DEBUG===true) {
					console.log(new Error().stack);
				}
				console.log("[refresh_element] Error on find element_children for section_tipo:"+section_tipo+", section_id:"+section_id+", type:"+type);
			}else{

				// children_container. Reset to force load again
				const wrapper_children		= parent_wrap.children
				const wrapper_children_len	= wrapper_children.length
				for (let i = wrapper_children_len - 1; i >= 0; i--) {
					if (wrapper_children[i].classList.contains('children_container')) {

						const children_container = wrapper_children[i]

						if (parent_wrap.classList.contains('hierarchy_root_node')) {

							// root nodes case: hilite term

							const term_node = children_container.firstChild.querySelector('.term')
							if (term_node) {

								// element to hilite
								if (hilite) {
									dd_request_idle_callback(
										() => {
											self.hilite_element(term_node)
										}
									)
								}

								// callback
								if (callback) {
									callback(term_node)
								}
							}

						}else{

							// default case: remove children

							// clean nodes
							while (children_container.firstChild) {
								children_container.removeChild(children_container.firstChild);
							}
						}

						// reset classes
						children_container.classList.add('js_first_load')
						children_container.classList.remove('removed_from_view')
						break
					}
				}
			}
		}//end for (let i = matches_length - 1; i >= 0; i--)


		return matches_length
	}//end refresh_element



	/**
	* EDIT
	* Opens a new window where edit current record
	* section_id is optional. If not get, the function uses button_obj dataset section_id
	* @return bool
	*/
	this.edit_window = null; // Class var
	this.edit = function(button_obj, event, section_id, section_tipo) {

		const self = this

		// check button_obj.parentNode
			if (!button_obj.parentNode) {
				console.warn("[ts_object.edit] Ignored empty button action ", button_obj);
				return false
			}

		// wrap
			const wrap = button_obj.parentNode.parentNode;
			if(!wrap) {
				console.error("[ts_object.edit] Error on find wrap", wrap);
				return false
			}

		// check mandatory vars callback
			if (typeof section_id==="undefined") {
				section_id = wrap.dataset.section_id
			}
			if (typeof section_tipo==="undefined") {
				section_tipo = wrap.dataset.section_tipo
			}

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

				const new_window = self.edit_window = open_window({
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
	* Call to API to create a new record and add it to the current element as child
	* @param HTMLElement button_obj
	* @return promise
	*/
	this.add_child = function(button_obj) {

		// wrap
			const wrap = button_obj.parentNode.parentNode;

			//const wrap = find_ancestor(button_obj, "wrap_ts_object")
			if(!wrap || !wrap.classList.contains('wrap_ts_object')) {
				console.log("[add_child] Error on find wrap");
				return Promise.resolve(false);
			}

		// children_element
			const children_element = ts_object.get_link_children_from_wrap(wrap)
			if(!children_element) {
				console.log("[ts_object.add_child] Error on find children_element 'link_children'");
				return Promise.resolve(false);
			}

		// short vars
			// const mode				= button_obj.dataset.mode || 'add_child'
			const section_id			= wrap.dataset.section_id
			const section_tipo			= wrap.dataset.section_tipo
			const target_section_tipo	= wrap.dataset.target_section_tipo
			const node_type				= wrap.dataset.node_type || null
			const is_hierarchy_node		= JSON.parse( wrap.dataset.is_hierarchy_node ) || false
			const tipo					= children_element.dataset.tipo

		// target_section_tipo check on add_child_from_hierarchy mode
			if (!target_section_tipo) {
				alert("Please, define a target_section_tipo in current hierarchy before add terms")
				console.log("[ts_object.add_child] Error on find target_section_tipo dataset on wrap");
				return Promise.resolve(false);
			}


		return new Promise(function(resolve) {

			const source = {
				section_id			: section_id,
				section_tipo		: section_tipo,
				target_section_tipo	: (is_hierarchy_node===true) ? target_section_tipo : section_tipo,
				node_type			: node_type,
				tipo				: tipo
			}

			// API call
				const rqo = {
					dd_api			: 'dd_ts_api',
					prevent_lock	: true,
					action			: 'add_child',
					source			: source
				}
				data_manager.request({
					body : rqo
				})
				.then(function(response) {
					if(SHOW_DEBUG===true) {
						console.log("[ts_object.add_child] response",response)
					}

					if (response===null) {

						// Server script error
							alert("Error on add_child. See server log for details");

					}else{

						if (response.result===false) {

							// Problems found on add
								alert(response.msg);

						}else{

							// All is OK

							// Refresh children container
									// ts_object.get_children(children_element).then(function(){
									// 	// On children refresh is done, trigger edit button
									// 	console.log("[ts_object.add_child] update_children_promise done");
									// 	//console.log(response);
									// 	// Open edit window
									// 	let new_section_id = response.result
									// 	ts_object.edit(button_obj, null, new_section_id, wrap.dataset.section_tipo)
									// })

							// Add some vars tipo to the response
								response.wrap 		= wrap
								response.button_obj = button_obj
						}
					}

					resolve(response)
				})
		})
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
	this.delete_term = async function(options) {

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
	this.select_first_input_in_editor = function(element_data_div) {

		// Focus first input element
			const first_input = element_data_div.querySelector('input')
			if (first_input) {
				// Select all content
				first_input.select()
				// Hide editor on change value
				first_input.addEventListener("change", function(){
					//ts_object.refresh_element(section_tipo, section_id)
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
	this.show_component_in_ts_object = async function(button_obj, event) {

		const self = this

		// short vars
			const wrap			= button_obj.parentNode.parentNode;
			const section_tipo	= wrap.dataset.section_tipo
			const section_id	= wrap.dataset.section_id
			const type			= button_obj.dataset.type
			const tipo			= button_obj.dataset.tipo
			const tipos			= tipo.split(',')
			const lang			= page_globals.dedalo_data_lang

		// delete the previous registered events
			self.events_tokens.map(current_token => event_manager.unsubscribe(current_token))

		// render_component_node function
			const components = [] // array of created component instances
			const render_component_node = async function(tipo, key) {

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
							self.events_tokens.push(
								event_manager.subscribe('save_' + current_component.id_base, save_handler)
							)
					}

					// build and render component
						await current_component.build(true)
						const component_node = await current_component.render()

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
			const wrapper					= button_obj.parentNode.parentNode;
			const element_data_contanier	= [...wrapper.childNodes].find(el => el.classList.contains('data_container'))
			const all_element_data_div		= element_data_contanier.children // childNodes;

		// get the children nodes of data_contanier
			const all_element_data_div_len = all_element_data_div.length
			if (all_element_data_div_len > 0) { // if the data element is not empty

				// get the tipo in the class name of the node element
				// const element_is_different = element_data_contanier.firstChild.classList.contains(tipo) ? false : true
				// if the element is different that user want to show
				// if(element_is_different) {

				// 	// remove all nodes
				// 	for (let i = all_element_data_div_len - 1; i >= 0; i--) {
				// 		all_element_data_div[i].remove()
				// 	}

				// 	// add the new one
				// 	tipos.map(async (current_tipo)=>{
				// 		const component_node = await render_component_node(current_tipo)
				// 		element_data_contanier.appendChild(component_node)
				// 	})

				// }else{
					// only remove all nodes
					for (let i = all_element_data_div_len - 1; i >= 0; i--) {
						all_element_data_div[i].remove()
					}
				// }

			}else{ // if the data element is empty (first click to show)

				// add nodes
					const tipos_length = tipos.length
					for (let i = 0; i < tipos_length; i++) {
						const current_tipo = tipos[i]
						const component_node = await render_component_node(current_tipo, i)
						element_data_contanier.appendChild(component_node)
					}
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
	this.show_indexations = async function(options) {

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
	* LINK_TERM (REMOVED 04-05-2022 NOT USED ANYMORE)
	* Add link to opener window for autocomplete_hi relations
	*/
		// this.link_term = function(button_obj) {

		// 	// source window. Could be different than current (like iframe)
		// 		const source_window = window.opener || window.parent
		// 		if (source_window===null) {
		// 			console.log("[link_term] Error on find window.opener / parent")
		// 			return false
		// 		}

		// 	// publish event link_term
		// 		source_window.event_manager.publish('link_term_'+ self.initiator, button_obj.data)


		// 	return true
		// }//end link_term


	/**
	* PARSER_SEARCH_RESULT
	* Recursive parser for results of the search
	* Only used for search result, not for regular tree render
	* @param object data
	* @param HTMLElement main_div
	* @param bool is_recursion
	* @return bool
	*/
	this.current_main_div = null;
	this.ar_resolved = [];
	this.parse_search_result = function( data, main_div, is_recursion ) {

		const self = this

		// sample data:
			// {
			// 	"hierarchy1_66": {
			// 		"section_tipo": "hierarchy1",
			// 		"section_id": "66",
			// 		"mode": "edit",
			// 		"lang": "lg-eng",
			// 		"is_descriptor": true,
			// 		"is_indexable": false,
			// 		"permissions_button_new": 3,
			// 		"permissions_button_delete": 0,
			// 		"permissions_indexation": 0,
			// 		"permissions_structuration": 0,
			// 		"ar_elements": [
			// 			{
			// 				"type": "term",
			// 				"tipo": "hierarchy5",
			// 				"value": "Spain",
			// 				"model": "component_input_text"
			// 			},
			// 			{
			// 				"type": "link_children",
			// 				"tipo": "hierarchy45",
			// 				"value": "button show children",
			// 				"model": "component_relation_children"
			// 			}
			// 		],
			// 		"heritage": {
			// 			"es1_1": {
			// 				"section_tipo": "es1",
			// 				"section_id": "1",
			// 				"mode": "edit",
			// 				"lang": "lg-eng",
			// 				"is_descriptor": true,
			// 				"is_indexable": true,
			// 				"permissions_button_new": 3,
			// 				"permissions_button_delete": 3,
			// 				"permissions_indexation": 3,
			// 				"permissions_structuration": 0,
			// 				"ar_elements": [
			// 					{
			// 						"type": "term",
			// 						"tipo": "hierarchy25",
			// 						"value": "Spain",
			// 						"model": "component_input_text"
			// 					},
			// 					{
			// 						"type": "icon",
			// 						"tipo": "hierarchy28",
			// 						"value": "NA",
			// 						"model": "component_text_area"
			// 					}, ...
			// 				],
			// 				"heritage": { ... }
			// 			}
			// 		}
			// 	}
			// }

		// iterate data object
		for (const key in data) {

			const element = data[key]

			// checks already exists
				if (ts_object.ar_resolved.indexOf(key) !== -1) {
					if(SHOW_DEBUG===true) {
						console.log("[ts_object.parse_search_result] Skipped resolved key "+key);
					}

					// Recursive parent element
					//let h_data = element.heritage
					//ts_object.parse_search_result(h_data, self.current_main_div, true)
					continue;
				}

			// target section_tipo
				const target_section_tipo = (element.section_tipo==='hierarchy1')
					? Object.values(element.heritage)[0].section_tipo
					: element.section_tipo

			// clean div container
				if(is_recursion===false) {
					// Calculate main div of each root element
					// Search children place
					main_div = document.querySelector('.hierarchy_root_node[data-section_id="'+element.section_id+'"]>.children_container')
					if (main_div) {

						// Clean main div (Clean previous nodes from root)
						while (main_div.firstChild) {
							main_div.removeChild(main_div.firstChild);
						}

					}else{
						// console.log("[ts_object.parse_search_result] Error on locate main_div:  "+'.hierarchy_root_node[data-section_id="'+element.section_id+'"] > .children_container')

						// not parent elements case, attach to root node
						// It search result node don't have parent, use root node as parent to allow display the term
						if (!element.heritage) {
							main_div = document.querySelector('.hierarchy_root_node[data-target_section_tipo="'+target_section_tipo+'"]>.children_container')
						}
					}
				}

			if(!main_div) {

				ts_object.ar_resolved = [] // reset array
				console.warn("[ts_object.parse_search_result] Warn: No main_div found! ", '.hierarchy_root_node[data-section_id="'+element.section_id+'"]>.children_container ', element);

			}else{

				const ar_children_data = []
					  ar_children_data.push(element)

				const render_options = {
					clean_children_container		: false, // Elements are added to existing main_div instead replace
					children_container_is_loaded	: false, // Set children container as loaded
					show_arrow_opened				: false, // Set icon arrow as opened
					target_section_tipo				: target_section_tipo, // add always !
					mode							: 'search'
				}

				// render children. dom_parse_children (returns a promise)
					self.dom_parse_children(
						ar_children_data,
						main_div,
						render_options
					)
			}

			// des
				// .then(function(result) {
				// 	//console.log(element.heritage);
				// 	if (typeof element.heritage!=='undefined') {
				// 		var h_data = element.heritage
				// 		self.parse_search_result(h_data, result)

				// 		//var children_element = result.parentNode.querySelector('.elements_container > [data-type="link_children"]')
				// 		//self.update_arrow_state(children_element, true)

				// 		console.log("parse_search_result case "+key);
				// 	}else{
				// 		console.log("else case "+key);
				// 		//self.dom_parse_children(ar_children_data, main_div, false)
				// 	}
				// })


			// Recursion when heritage is present
			// Note var self.current_main_div is set on each dom_parse_children call
			if (typeof element.heritage!=='undefined') {

				// Recursive parent element
				const h_data = element.heritage
				self.parse_search_result(h_data, self.current_main_div, true);

			}else{

				dd_request_idle_callback(
					() => {
						// Last elements are the final found elements and must be hilite
						// const last_element = self.current_main_div.parentNode.querySelector('.elements_container > [data-type="term"]')
						const last_element = main_div.querySelector('.elements_container > .term')
						if (last_element) {
							self.hilite_element(last_element, false);
						}
					}
				)
			}

			// Open arrows and fix children container state
				// main_div.classList.remove('js_first_load')
				// var children_element = main_div.parentNode.querySelector('.elements_container > [data-type="link_children"]')
				// if (children_element.firstChild) {
				// 	children_element.firstChild.classList.add('ts_object_children_arrow_icon_open')
				// 	//console.log(children_element);
				// }

			// ts_object.ar_resolved.push(key);

		}//end for (const key in data)


		return true
	}//end parser_search_result



	/**
	* BUILD_ORDER_FORM
	* @param HTMLElement button_obj
	* @return bool
	*/
	this.build_order_form = function(button_obj) {

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
			input.addEventListener("keyup", function(e){
				e.preventDefault()
				if (e.keyCode === 13) {
					ts_object.save_order(button_obj, parseInt(this.value) )
					// this.remove()
				}
			});
			input.addEventListener("blur", function(e){
				e.preventDefault()
				this.remove()
				button_obj.style.display = ''
			});

		// Add input element after
			button_obj.parentNode.insertBefore(input, button_obj.nextSibling);

		// Hide button_obj
			button_obj.style.display = 'none'

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
	this.save_order = function(button_obj, new_value) {

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
			const children				= element_wrap.parentNode.childNodes
			const children_len			= children.length
			const wrap					= element_wrap.parentNode.parentNode

		// link_children . Search component_relation_children tipo from wrap
			const link_children = this.get_link_children_from_wrap(wrap)
			if (link_children===null) {
				alert("[ts_object.save_order] Error on get list_thesaurus_element. save_order is skipped");
				return Promise.resolve(false);
			}

		// new_value. Prevent set invalid values
			if (new_value>children_len){
				new_value = children_len // max value is array length
			}else if (new_value<1) {
				new_value = 1;    // min value is 1
			}

		// ar_locators. Iterate children elements
			const ar_locators = []
			for (let i = 0; i < children_len; i++) {
				ar_locators.push({
					section_tipo	: children[i].dataset.section_tipo,
					section_id		: children[i].dataset.section_id
				})
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
			}

		// order_ar_locators
			const from	= parseInt(old_value)-1
			const to	= parseInt(new_value)-1
			move_locator(ar_locators, from, to)

		// short vars
			const section_id		= wrap.dataset.section_id
			const section_tipo		= wrap.dataset.section_tipo
			const component_tipo	= link_children.dataset.tipo


		return new Promise(function(resolve){

			// API call
				const rqo = {
					dd_api			: 'dd_ts_api',
					prevent_lock	: true,
					action			: 'save_order',
					source			: {
						section_id		: section_id,
						section_tipo	: section_tipo,
						component_tipo	: component_tipo,
						ar_locators		: ar_locators
					}
				}
				data_manager.request({
					body : rqo
				})
				.then(function(response){

					// debug
						if(SHOW_DEBUG===true) {
							console.log("[ts_object.save_order] response", response)
						}

					if (response.result && response.result!==false) {
						// Refresh element
						self.refresh_element( element_section_tipo, element_section_id )
					}else{
						alert("[ts_object.save_order] Error on save order. "+ self.msg )
					}

					resolve(response)
				})
		})
	}//end save_order



	/**
	* TOGGLE_ND
	* @param HTMLElement button_obj
	* @return bool
	*/
	this.toggle_nd = async function(button_obj) {

		// nd_container
			const nd_container = ts_object.get_my_parent_container(button_obj, 'nd_container')
			if (!nd_container) {
				if(SHOW_DEBUG===true) {
					console.log("[ts_object.toggle_nd] Error on locate nd_container from button_obj",button_obj);
				}
				return false
			}

		// nodes
			const children_container	= ts_object.get_my_parent_container(button_obj, 'children_container')
			const wrap					= button_obj.parentNode.parentNode
			const link_children_element	= ts_object.get_link_children_from_wrap(wrap)

		//console.log(nd_container.style.display);
		if (!nd_container.style.display || nd_container.style.display==='none') {

			// Load all children and hide descriptors
				// Load element by AJAX. Result is an array on HTMLElements
				ts_object.get_children(
					button_obj,
					null, // object|null pagination
					false // bool clean_children_container
				)
				.then(function() {

					// Show hidden nd_container
					nd_container.style.display = 'inline-table'

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
				})

		}else{

			// Hide showed nd_container
				nd_container.style.display = 'none'
		}

		return true
	}//end toggle_nd



	/**
	* GET_MY_PARENT_CONTAINER
	* Returns current element (list_thesaurus_element) container of type inside his ts_element
	* @param HTMLElement button_obj
	* @param string role
	* @return HTMLElement|null parent_container
	*/
	this.get_my_parent_container = function(button_obj, role) {

		let parent_container = null

		// wrapper
			const wrapper = button_obj.parentNode.parentNode
			if (wrapper.dataset.node_type!=='thesaurus_node') {
				console.log("Error on get thesaurus_node wrapper !!!");
				return parent_container;
			}

		// wrapper_children
			const wrapper_children		= wrapper.children
			const wrapper_children_len	= wrapper_children.length
			for (let i = wrapper_children_len - 1; i >= 0; i--) {
				if (wrapper_children[i].dataset.role===role) {
					parent_container = wrapper_children[i]
					break
				}
			}

		return parent_container
	}//end get_my_parent_container



	/**
	* GET_LINK_CHILDREN_FROM_WRAP
	* Find link_children node from current given wrapper
	* @param HTMLElement wrap
	* @return HTMLElement|null link_children
	*/
	this.get_link_children_from_wrap = function(wrap) {

		// LINK_CHILDREN . Search component_relation_children tipo from wrap
			let link_children = null;

		// check valid wrap by class
			if (wrap.classList.contains("wrap_ts_object")===false) {
				console.error("Error. Invalid received wrap. Expected wrap class is wrap_ts_object. wrap:",wrap);
				return link_children
			}

		// base_wrapper. If wrapper is a root hierarchy_node, search inside next thesaurus_node
			const base_wrapper = (wrap.dataset.node_type && wrap.dataset.node_type==='hierarchy_node')
				? wrap.firstChild.firstChild
				: wrap

		const child_one		= base_wrapper.childNodes
		const child_one_len	= child_one.length
		for (let i = child_one_len - 1; i >= 0; i--) {

			if (child_one[i].dataset.role && child_one[i].dataset.role==="elements_container") {

				const child_two		= child_one[i].childNodes
				const child_two_len	= child_two.length
				for (let j = 0; j < child_two_len; j++) {
					if(child_two[j].dataset.type && child_two[j].dataset.type==="link_children") {
						// matched : fix value
						link_children = child_two[j]
						break;
					}
				}
				break;
			}
		}

		if (link_children===null) {
			if(SHOW_DEBUG===true) {
				console.warn("[ts_object.get_link_children_from_wrap] Error on locate link_children from wrap: ", wrap);
			}
		}


		return link_children;
	}//end get_link_children_from_wrap



}//end ts_object



// @license-end
