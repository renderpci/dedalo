// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, get_current_url_vars */
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'
	import * as instances from '../../common/js/instances.js'
	import {url_vars_to_object, object_to_url_vars, open_window} from '../../common/js/utils/index.js'
	import {event_manager} from '../../common/js/event_manager.js'
	import {data_manager} from '../../common/js/data_manager.js'
	import {
		// render_ts_line,
		render_ts_pagination,
		render_children_list
	} from './render_ts_object.js'



/**
* TS_OBJECT
* Manages a single thesaurus row element
*/
export const ts_object = new function() {



	// class vars
		// this.trigger_url		= DEDALO_CORE_URL + '/ts_object/trigger.ts_object.php'
		// Set on update element in DOM (refresh)
		this.element_to_hilite	= null;
		// thesaurus_mode . Defines appearance of thesaurus
		this.thesaurus_mode		= null;
		// events_tokens
		this.events_tokens		= [];



	/**
	* INIT
	* Fix important vars for current object
	* (!) Disabled (01-03-2024) because it is not used as instance and nobody calls here !
	*/
		// this.init = function() {

		// 	const self = this

		// 	// const url_vars = get_current_url_vars()
		// 	const url_vars = url_vars_to_object(window.location.search)

		// 	// THESAURUS_MODE: relation|default
		// 	this.thesaurus_mode = url_vars.thesaurus_mode || 'default'
		// 	// component_name Caller component name for relations
		// 	this.component_name = url_vars.component_name || null

		// 	return true
		// }//end init



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

		// children_container. children_container is the div container inside current ts_object
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
								children_element.firstChild.classList.remove('arrow_spinner');
								// Update arrow state
								//ts_object.update_arrow_state(children_element, true) // disabled temporally
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
	* UPDATE_ARROW_STATE
	* Updates arrow state when updated wrap
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

		// Element wrap div is parentNode of 'children_container' (children_container)
			//var wrap_div = children_container.parentNode

		// options set values
			const clean_children_container		= typeof options.clean_children_container!=='undefined' ? options.clean_children_container : true
			const target_section_tipo			= typeof options.target_section_tipo!=='undefined' ? options.target_section_tipo : null
			const node_type						= typeof options.node_type!=='undefined' ? options.node_type : 'thesaurus_node'
			let next_node_type					= node_type
			const children_container_is_loaded	= typeof options.children_container_is_loaded!=='undefined' ? options.children_container_is_loaded : false
			const show_arrow_opened				= typeof options.show_arrow_opened!=='undefined' ? options.show_arrow_opened : false
			const pagination					= options.pagination || {}
			const mode							= options.mode || 'list'
			// const wrap						= children_container.parentNode
			// const element_children_target	= ts_object.get_link_children_from_wrap(wrap)

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
	*/
	var source = false;
	var handle = '';
	this.on_drag_mousedown = function(obj, event) {
		if(SHOW_DEBUG===true) {
			console.log("ts_object.on_drag_mousedown");
		}

		// handle . set with event value
			handle = event

		//obj.ondrop = null;
		//obj.addEventListener ("dragend", ts_object.on_drag_end, true);
		//window.addEventListener ("mouseup", ts_object.on_drop_mouseup, false);
		//window.onmouseup = ts_object.on_drop_mouseup;
		//console.log(window.onmouseup);
	}//end on_drag_mousedown



	/**
	* ON_DRAGSTART
	*/
	this.old_parent_wrap = null
	this.on_dragstart = function(obj, event) {
		if(SHOW_DEBUG===true) {
			//console.log("ts_object.on_dragstart:",typeof handle);
		}

		// obj ondrop set as null
			obj.ondrop = null

		// if (handle.contains(target))
			if (handle) {
				event.stopPropagation();
				//event.dataTransfer.setData('text/plain', 'handle');
				source = obj;
				event.dataTransfer.effectAllowed = 'move';
				event.dataTransfer.setData('text/html', obj.innerHTML);
			}else{
				event.preventDefault();
			}

		// Fix class var 'old_parent_wrap'
			ts_object.old_parent_wrap = obj.parentNode.parentNode;
			if(!ts_object.old_parent_wrap) {
				console.log("[on_dragstart] Error on find old_parent_wrap");
			}
		//console.log(event);
		//obj.parentNode.parentNode.removeEventListener("drop", 'ts_object.on_drop');
	}//end on_dragstart



	/**
	* ON_DRAG_END
	* @return
	*/
	var target
	this.on_drag_end = function() {
		if(SHOW_DEBUG===true) {
			console.log("on_drag_end");
		}

		// target set as false
			target = false;

		// source. set as blank
			source = '';

		//handle = '';
		//window.onmouseup = null;
	}//end on_drag_end



	/**
	* ON_ORDER_DRAG_MOUSEDOWN
	*/
	var order_source = false;
	var order_handle = '';
	this.on_order_drag_mousedown = function(obj, event) {
		if(SHOW_DEBUG===true) {
			//console.log("on_order_drag_mousedown");
		}

		order_handle = event;
	}//end on_order_drag_mousedown



	/**
	* ON_ORDER_DRAGSTART
	*/
	this.on_order_dragstart = function(obj, event) {
		if(SHOW_DEBUG===true) {
			//console.log("on_order_dragstart");
		}

		obj.ondrop = null;

		//if (handle.contains(target)) {
		if (order_handle) {
			event.stopPropagation();
			//event.dataTransfer.setData('text/plain', 'order_handle');
			order_source = obj;
			event.dataTransfer.effectAllowed = 'move';
			event.dataTransfer.setData('text/html', obj.innerHTML);
		} else {
			event.preventDefault();
		}
	}//end on_order_dragstart



	/**
	* ON_ORDER_DRAG_END
	* @return
	*/
	this.on_order_drag_end = function() {
		if(SHOW_DEBUG===true) {
			//console.log("on_order_drag_end ");;
		}

		target = false;
		//handle = '';
		order_source = '';
	}//end on_order_drag_end



	/**
	* ON_ORDER_DRAGOVER
	* @param DOM object obj
	* 	Is the whole ts_object target wrapper
	*/
	this.on_order_dragover = function(obj, event) {
		event.preventDefault(); // Necessary. Allows us to drop.
		event.stopPropagation();
		event.dataTransfer.dropEffect = 'move';  // See the section on the DataTransfer object.

		// Add drag_over class
		//obj.classList.add('drag_over')
	}//end on_order_dragover



	/**
	* ON_DRAGENTER
	* @return
	*/
	this.on_dragenter = function(obj, event) {
		if(SHOW_DEBUG===true) {
			//console.log("dragenter");
			//console.log(obj.dataset.tipo);;
		}

		//event.dataTransfer.dropEffect = "copy";
	}//end on_dragenter


	/**
	* ON_DRAGOVER
	* @param DOM object obj
	* 	Is the whole ts_object target wrapper
	*/
	this.on_dragover = function(obj, event) {
		event.preventDefault(); // Necessary. Allows us to drop.
		event.stopPropagation();
		event.dataTransfer.dropEffect = 'move';  // See the section on the DataTransfer object.

		// Add drag_over class
		obj.classList.add('drag_over')
	}//end on_dragover



	/**
	* ON_DRAGLEAVE
	* @return
	*/
	this.on_dragleave = function(obj, event) {
		if(SHOW_DEBUG===true) {
			//console.log("dragleave");;
		}

		// Remove drag_over class
			obj.classList.remove('drag_over')
	}//end on_dragleave



	/**
	* ON_DROP
	*/
	this.on_drop = function(obj, event) {
		event.preventDefault();
		event.stopPropagation();

		// Remove drag_over class
			obj.classList.remove('drag_over')

		// wraps
			const wrap_source	= source 	// element that's move
			const wrap_target	= obj 	// element on user leaves source wrap
			if (wrap_source === wrap_target) {
				console.log("[ts_object.on_drop] Unable self drop (2) wrap_source is equal wrap_target");
				return false;
			}

		// div_children
			let div_children	= null
			const nodes			= obj.children // childNodes
			const nodes_len		= nodes.length
			for (let i = nodes_len - 1; i >= 0; i--) {
				if (nodes[i].dataset.role === 'children_container'){
					div_children = nodes[i]; break;
				}
			}
			if (div_children===null) {
				console.log("[ts_object.on_drop] Unable self drop (3) div_children not found in nodes:",nodes);
				return false;
			}

		// data_transfer_json case
		// used by tool_cataloging to add data to the ts
			const data_transfer_json = event.dataTransfer.getData("text/plain")

			if (data_transfer_json && data_transfer_json.length>0) {
				// parse from event.dataTransfer
					const data_obj = JSON.parse(data_transfer_json)

				// debug
					if(SHOW_DEBUG===true) {
						// console.log("wrap_target:",wrap_target);
						// console.log("obj:",obj);
						// console.log("-- event:",event);
						// console.log("ts_object.on_drop event called !!!!! with data_obj:", data_obj);
					}

				// add children, create new section and his node in the tree
				// go deep in the tree to point base to getback into the wrap by the add_child method
				// (it will use parentNode.parentNode to find the wrap)
					const button_obj = obj.firstChild.firstChild
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
								const new_section_id 	= response.result
							// section_tipo. When dataset target_section_tipo exists, is hierarchy_node. Else is normal node
								const section_tipo 	  	= wrap_target.dataset.target_section_tipo || wrap_target.dataset.section_tipo

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

										ts_object.update_arrow_state(link_children_element, true)

									// refresh children container
										ts_object.get_children(
											link_children_element,
											null, // object|null pagination
											true // bool clean_children_container
										)
										.then(function(){
											// update parent arrow button
											ts_object.update_arrow_state(link_children_element, true)
										})

									}
								})

							}
					 })

				return true // stop execution here
			}

		const element_children_target	= ts_object.get_link_children_from_wrap(wrap_target)
		const element_children_source	= ts_object.get_link_children_from_wrap(ts_object.old_parent_wrap)


		new Promise(function(resolve, reject) {
			// Append child
			if ( div_children.appendChild(wrap_source) ) {
				resolve("DOM updated!");
			}else{
				reject(Error("Error on append child"));
			}
		})
		.then(function() {

			// Update parent data (returns a promise after HTTP request finish)
			ts_object.update_parent_data(wrap_source)
			.then(function(response){

				// Updates element_children_target
					ts_object.update_arrow_state(element_children_target, true)

				// Updates element_children_source
					ts_object.update_arrow_state(element_children_source, false)

				// hilite moved term. wait 300 ms to allow arrow state update
					const element = wrap_source.querySelector('.list_thesaurus_element[data-type="term"]')
					if (element) {
						setTimeout(function(){
							ts_object.hilite_element(element)
						}, 300)
					}

				// debug
					if(SHOW_DEBUG===true) {
						console.log("[on_drop ts_object.update_parent_data] response",response)
						console.log("[ts_object.on_drop] Finish on_drop 3");
					}
			})
		});//end js_promise

		return true;
	}//end on_drop



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
			//var element_children = parent_wrap.querySelector('.list_thesaurus_element[data-type="link_children"]')
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

		// var wrap		= link_children_element.parentNode.parentNode
		// var nodes	= wrap.children  //childNodes

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

			//var children_container = self.get_my_parent_container(link_children_element, 'children_container')
			//if (children_container.style.display==='none') {
			//	children_container.style.display = 'inline-table'
			//}

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

		const wrap			= link_children_element.parentNode.parentNode
		const key			= wrap.dataset.section_tipo +'_'+ wrap.dataset.section_id
		//var parent_node	= wrap.parentNode.parentNode
		//var parent		= parent_node.dataset.section_tipo +'_'+ parent_node.dataset.section_id

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

		// Locate all term elements
		// var type 	= 'term'; // [data-type="'+type+'"]
		// var matches = document.querySelectorAll('.list_thesaurus_element[data-section_tipo="'+section_tipo+'"][data-section_id="'+section_id+'"]');

		if (typeof clean_others==='undefined') {
			clean_others = true
		}

		// Remove current hilite elements
			if(clean_others!==false) {
				this.reset_hilites()
			}

		// hilite only current element
			// element.classList.add("element_hilite");

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
	this.refresh_element = function(section_tipo, section_id) {

		// Locate all term elements
		const type				= 'term';
		const matches			= document.querySelectorAll('.list_thesaurus_element[data-type="'+type+'"][data-section_tipo="'+section_tipo+'"][data-section_id="'+section_id+'"]');
		const matches_length	= matches.length

		// no matches case
			if (matches_length===0) {
				console.log("[refresh_element] Error on match elements. Not terms found for section_tipo:"+section_tipo+", section_id:"+section_id+", type:"+type);
				return matches_length;
			}

		// iterate all matches
		for (let i = matches_length - 1; i >= 0; i--) {

			// element to hilite
				ts_object.element_to_hilite = {
					'section_tipo'	: section_tipo,
					'section_id'	: section_id
				}

			const parent_wrap		= matches[i].parentNode.parentNode.parentNode.parentNode
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
					// .then(function() {
						// const arrow_div = element_children.querySelector('.ts_object_children_arrow_icon')
						// if (arrow_div && arrow_div.classList.contains('ts_object_children_arrow_icon_open')===false) {
						// 	// Reopen arrow children
						// 	//ts_object.toggle_view_children(element_children)
						// }
					// })
			}else{
				if (SHOW_DEBUG===true) {
					console.log(new Error().stack);
				}
				console.log("[refresh_element] Error on find element_children for section_tipo:"+section_tipo+", section_id:"+section_id+", type:"+type);
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
			//console.log("typeof button_obj:", typeof button_obj, "button_obj:", button_obj, "button_obj.parentNode", button_obj.parentNode);
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
			if(self.edit_window===null || self.edit_window.closed) { //  || edit_window.location.href!=url || self.edit_window.closed

				self.edit_window = open_window({
					url		: url,
					target	: 'edit_window',
					width	: 1280,
					height	: 905,
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
	* @param DOM node button_obj
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
				target_section_tipo	: target_section_tipo,
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
	* DELETE
	* Removed selected record from database
	* @param DOM node button_obj
	* @return promise
	*/
	this.delete = function(button_obj) {

		// confirm dialog
			if (!confirm("You are sure to delete current element?")) {
				return Promise.resolve(false);
			}

		// wrap
			const wrap = button_obj.parentNode.parentNode;
			if(!wrap) {
				console.log("[delete] Error on find wrap");
				return Promise.resolve(false);
			}

		// Get all wrap_ts_object wraps whit this section_tipo, section_id
		// Find wrap of wrap and inside, button list_thesaurus_element
		// const ar_wrap_ts_object = document.querySelectorAll('.wrap_ts_object[data-section_id="'+wrap.dataset.section_id+'"][data-section_tipo="'+wrap.dataset.section_tipo+'"]')	//

		// short vars
			const section_id	= wrap.dataset.section_id
			const section_tipo	= wrap.dataset.section_tipo
			const node_type		= wrap.dataset.node_type || null


		return new Promise(function(resolve){

			// API call
				const rqo = {
					dd_api			: 'dd_ts_api',
					prevent_lock	: true,
					action			: 'delete',
					source			: {
						section_id		: section_id,
						section_tipo	: section_tipo,
						node_type		: node_type
					}
				}
				data_manager.request({
					body : rqo
				})
				.then(function(response) {

					// debug
						if(SHOW_DEBUG===true) {
							console.log("[ts_object.delete] response",response);
						}

					if (response.result===false) {

						// error response
						alert("Sorry. You can't delete a element with children. Please, remove all children before delete.")

					}else{

						// all is OK

						// refresh wrap
							ts_object.refresh_element(wrap.dataset.section_tipo, wrap.dataset.section_id)
					}

					// Refresh children container
						// var update_children_promise = ts_object.get_children(button_obj).then(function() {
						// 	// On children refresh is done, trigger edit button
						// 	console.log("update_children_promise done");
						// })

					resolve(response)
				});
		})
	}//end delete



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
			// const mode		= 'edit'
			// const html_data	= '...';	//" show_component_in_ts_object here! "
			// const role		= section_tipo + '_' + section_id + '_' + tipo

		// delete the previous registered events
			self.events_tokens.map(current_token => event_manager.unsubscribe(current_token))

		// render_component_node function
			const components = [] // array of created component instances
			const render_component_node = async function(tipo, key) {

				// component instance
					const current_component = await instances.get_instance({
						section_tipo	: section_tipo,
						section_id		: section_id,
						tipo			: tipo,
						lang			: lang,
						mode			: 'edit', // mode,
						view			: 'default',
						id_variant		: new Date().getTime()
					})

				// components
					components.push(current_component)

				// term edit case
					if(type==='term') {

						// update value, subscription to the changes: if the DOM input value was changed, observers DOM elements will be changed own value with the observable value
							const fn_update_value = function() {

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
								event_manager.subscribe('save_' + current_component.id_base, fn_update_value)
							)
					}

					// build and render component
						await current_component.build(true)
						const component_node = await current_component.render()

					// activate
						if (key===0) {
							setTimeout(function(){
								ui.component.activate(current_component)
							}, 50)
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
	* SHOW_INDEXATIONS : load the fragment list and render the grid
	* @param object options
	* @return promise
	* 	resolve object dd_grid
	*/
	this.show_indexations = async function(options) {

		// options
			const section_tipo		= options.section_tipo
			const section_id		= options.section_id
			const component_tipo	= options.component_tipo
			const container_id		= options.container_id
			const value				= options.value || null
			const pagination		= options.pagination || {}
			const totals_group		= options.totals_group || [{key: ['all']}]

		// pagination vars
			const total 			= options.total || null

		// get the filter section
			const filter_section = totals_group.map(el => el.key)

		// target_div
			const target_div = document.getElementById(container_id);
			if (!target_div) {
				alert('show_indexations. Target div do not exist for section_id: '+section_id+' !')
				return false
			}
			// already loaded. toggle visible
			if (target_div.firstChild) {

				if (!target_div.classList.contains('hide')) {
					// hide only
					target_div.classList.add('hide')
					return
				}else{
					// force reload again
					target_div.classList.remove('hide')
				}
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
					mode 			: 'related',
					section_tipo	: filter_section,
					total			: total,
					limit			: 200,
					offset			: 0,
					filter_by_locators: [{
						section_tipo	: section_tipo,
						section_id		: section_id,
						tipo			: component_tipo,
					}]
				}

			}

		// dd_grid
			const dd_grid = await instances.get_instance({
				model				: 'dd_grid',
				section_tipo		: section_tipo,
				section_id			: section_id,
				tipo				: component_tipo,
				mode				: 'list',
				view				: 'indexation',
				lang				: page_globals.dedalo_data_lang,
				rqo					: rqo,
				id_variant			: container_id,
				totals_group 		: totals_group,
				paginator_options	: {
					view 				: 'micro',
					show_interface 		: {
						show_all : false
					}
				}
			})
			await dd_grid.build(true)
			dd_grid.render()
			.then(function(node){
				target_div.appendChild(node)
			})


		return dd_grid
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
	var ar_resolved = [];
	this.parse_search_result = function( data, main_div, is_recursion ) {

		const self = this

		// data sample:
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
				if (ar_resolved.indexOf(key) !== -1) {
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

				ar_resolved = [] // reset array
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

				// Last elements are the final found elements and must be hilite
				const last_element = self.current_main_div.parentNode.querySelector('.elements_container > [data-type="term"]')
				setTimeout(function(){
					self.hilite_element(last_element, false);
				}, 120)
			}

			// Open arrows and fix children container state
				// main_div.classList.remove('js_first_load')
				// var children_element = main_div.parentNode.querySelector('.elements_container > [data-type="link_children"]')
				// if (children_element.firstChild) {
				// 	children_element.firstChild.classList.add('ts_object_children_arrow_icon_open')
				// 	//console.log(children_element);
				// }

			// ar_resolved.push(key);

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
				var i, tmp;
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
			let link_children = null; //wrap.querySelector('[data-type="link_children"]')

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
