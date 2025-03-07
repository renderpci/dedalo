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
		render_children,
		dom_parse_children,
		render_root_wrapper
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
	* GET_CHILDREN_DATA
	* Get the JSON data from the server.
	* Data is built from parent node info (current object section_tipo and section_id)
	* @param HTMLElement children_element
	* @return promise
	*/
	this.get_children_data = async function(options) {

		// options
			const section_id	= options.section_id
			const section_tipo	= options.section_tipo
			const children_tipo	= options.children_tipo
			const pagination	= options.pagination || null
			const children		= options.children || null

		// short vars
			const caller				= this.caller
			const model					= caller.model
			const thesaurus_view_mode	= caller.thesaurus_view_mode
			const terms_are_model		= thesaurus_view_mode==='model'

		// prevent_lock: set false on 'area_ontology' to allow session cache in ontology
			const prevent_lock = caller.model==='area_ontology' ? false : true

		// API call
			const rqo = {
				dd_api			: 'dd_ts_api',
				prevent_lock	: prevent_lock,
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
				body : rqo
			})
			// debug
			if(SHOW_DEBUG===true) {
				console.log('get_children_data api_response:', api_response);
			}

			if (api_response && api_response.result) {

				// success case

				return api_response.result

			}else{

				// error case

				console.warn("[ts_object.get_children_data] Error, api_response is null");
			}


		return false
	}//end get_children_data



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
	* FIND_UP_TAG
	* Search parent with given CSS selector looking up recursively
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
	this.update_parent_data = async function(options) {

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
	* @param HTMLElement link_children_element
	* @param event
	* @return bool
	*/
	this.toggle_view_children = function(link_children_element, event) {

		const self = this

		// short vars
			const wrapper		= link_children_element.parentNode.parentNode
			const section_tipo	= wrapper.dataset.section_tipo
			const section_id	= wrapper.dataset.section_id
			const children_tipo	= wrapper.dataset.children_tipo
			const children_list	= link_children_element.children_list

		const children_container = self.get_my_parent_container(link_children_element, 'children_container')

		// If is the first time that the children are loaded, remove the first class selector and send the query for get the children
		if (children_container.classList.contains('js_first_load') && !children_container.hasChildNodes()) {

			children_container.classList.remove('js_first_load');
			link_children_element.firstChild.classList.add('ts_object_children_arrow_icon_open', 'arrow_spinner');

			// Load element by AJAX
				self.render_children({
					link_children_element		: link_children_element,
					section_tipo				: section_tipo,
					section_id					: section_id,
					pagination					: null,
					clean_children_container	: false, // bool clean_children_container
					children_tipo				: children_tipo,
					children_list				: children_list
				});

			// save_opened_elements
			dd_request_idle_callback(
				() => {
					self.save_opened_elements(link_children_element,'add')
				}
			)

		}else{

			// the toggle view state with the class
			if(children_container.classList.contains('removed_from_view')){
				children_container.classList.remove('removed_from_view');
				link_children_element.firstChild.classList.add('ts_object_children_arrow_icon_open');

				// Load element by AJAX
					if (typeof event!=="undefined" && event.altKey===true) {
						self.render_children({
							link_children_element		: link_children_element,
							section_tipo				: section_tipo,
							section_id					: section_id,
							pagination					: null,
							clean_children_container	: true, // bool clean_children_container
							children_tipo				: children_tipo,
							children_list				: children_list
						});
					}

				// save_opened_elements
				dd_request_idle_callback(
					() => {
						self.save_opened_elements(link_children_element,'add')
					}
				)

			}else{

				children_container.classList.add('removed_from_view');
				link_children_element.firstChild.classList.remove('ts_object_children_arrow_icon_open');

				// save_opened_elements
				dd_request_idle_callback(
					() => {
						self.save_opened_elements(link_children_element,'remove')
					}
				)
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
	this.opened_elements = {}
	this.save_opened_elements = function(link_children_element, action) {

		if(SHOW_DEBUG!==true) {
			return false;
		}

		const wrap	= link_children_element.parentNode.parentNode
		const key	= wrap.dataset.section_tipo +'_'+ wrap.dataset.section_id

		if (action==='add') {

			// add

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

			// remove

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
	* @return int matches_length
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

			const parent_wrap			= term_node.parentNode.parentNode.parentNode.parentNode
			const link_children_element	= ts_object.get_link_children_from_wrap(parent_wrap)
			const is_open				= link_children_element?.firstChild.classList.contains('ts_object_children_arrow_icon_open')

			// short vars
			const wrapper		= link_children_element.parentNode.parentNode
			const section_tipo	= wrapper.dataset.section_tipo
			const section_id	= wrapper.dataset.section_id
			const children_tipo	= wrapper.dataset.children_tipo

			if(link_children_element && is_open) {

				// pagination is set in DOM link_children_element from API response in get_children call
					const pagination = link_children_element.pagination
						? link_children_element.pagination
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
					self.render_children({
						link_children_element		: link_children_element,
						section_tipo				: section_tipo,
						section_id					: section_id,
						pagination					: null,
						clean_children_container	: true, // bool clean_children_container
						children_data				: null,
						children_tipo				: children_tipo
					})
					.then(function() {

						// element to hilite
						if (hilite) {
							requestAnimationFrame(
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
			}else if(!link_children_element){
				if (SHOW_DEBUG===true) {
					console.log(new Error().stack);
				}
				console.log("[refresh_element] Error on find link_children_element for section_tipo:"+section_tipo+", section_id:"+section_id+", type:"+type);
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
	* Call to API to create a new record and add the current element his parent
	* @param object options
	* {
	* 	section_id : string|int
	* 	section_tipo: string
	* }
	* @return api_response
	*/
	this.add_child = async function(options) {

		// options
			const section_id	= options.section_id
			const section_tipo	= options.section_tipo

		// mandatory options check
			const mandatory = ['section_id','section_tipo']
			mandatory.map(el => {
				if (!options[el]) {
					alert(`Error: var ${el} is mandatory!`);
					throw 'Mandatory vars check fail: ' + el
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
		* 		"mode": "edit",
		* 		"lang": "lg-eng",
		* 		"is_descriptor": true,
		* 		"is_indexable": false,
		* 		"permissions_button_new": 3,
		* 		"permissions_button_delete": 0,
		* 		"permissions_indexation": 0,
		* 		"permissions_structuration": 0,
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
		* 		],
		* 		"heritage": {
		* 			"es1_1": {
		* 				"section_tipo": "es1",
		* 				"section_id": "1",
		* 				"mode": "edit",
		* 				"lang": "lg-eng",
		* 				"is_descriptor": true,
		* 				"is_indexable": true,
		* 				"permissions_button_new": 3,
		* 				"permissions_button_delete": 3,
		* 				"permissions_indexation": 3,
		* 				"permissions_structuration": 0,
		* 				"ar_elements": [
		* 					{
		* 						"type": "term",
		* 						"tipo": "hierarchy25",
		* 						"value": "Spain",
		* 						"model": "component_input_text"
		* 					},
		* 					{
		* 						"type": "icon",
		* 						"tipo": "hierarchy28",
		* 						"value": "NA",
		* 						"model": "component_text_area"
		* 					}, ...
		* 				],
		* 				"heritage": { ... }
		* 			}
		* 		}
		* 	}
		* }]
	* @param array to_hilite
	* 	array of locators found in search
	* @param HTMLElement|null main_div
	* @param bool is_recursion
	* @return bool
	*/
	this.current_main_div = null;
	this.parse_search_result = function( data, to_hilite, main_div, is_recursion ) {

		const self = this

		// iterate data object
		for (const key in data) {

			const element = data[key]

			// target section_tipo
				const target_section_tipo = element.section_tipo

			// clean div container
				if(is_recursion===false) {
					// Calculate main div of each root element
					// Search children place
					main_div = document.querySelector(`.hierarchy_root_node.${element.section_tipo}>.children_container`)
					if (main_div) {

						// Clean main div (Clean previous nodes from root)
						while (main_div.firstChild) {
							main_div.removeChild(main_div.firstChild);
						}

					}else{
						console.error("[ts_object.parse_search_result] Error on locate main_div:  "+'.hierarchy_root_node[data-section_id="'+element.section_id+'"] > .children_container')

						// // not parent elements case, attach to root node
						// // It search result node don't have parent, use root node as parent to allow display the term
						// if (!element.heritage) {
						// 	main_div = document.querySelector('.hierarchy_root_node[data-target_section_tipo="'+target_section_tipo+'"]>.children_container')
						// }
					}
				}

			// main_div conditional
				if(!main_div) {

					console.warn("[ts_object.parse_search_result] Warn: No main_div found! ", '.hierarchy_root_node[data-section_id="'+element.section_id+'"]>.children_container ', element);

				}else{

					const ar_children_data = []
						  ar_children_data.push(element)

					// render children. dom_parse_children (returns a promise)
						const ar_children_container = dom_parse_children({
							self							: self,
							ar_children_data				: ar_children_data,
							children_container				: main_div,
							// render options
							clean_children_container		: false, // Elements are added to existing main_div instead replace
							children_container_is_loaded	: false, // Set children container as loaded
							show_arrow_opened				: false, // Set icon arrow as opened
							target_section_tipo				: target_section_tipo, // add always !
							mode							: 'search'
						})
				}

			// hilite current term
				const term_hilite = to_hilite.find(el => el.section_id==element.section_id && el.section_tipo===element.section_tipo)
				if (term_hilite) {
					requestAnimationFrame(
						() => {
							const term_node = document.querySelector(`.term[data-section_tipo="${element.section_tipo}"][data-section_id="${element.section_id}"]`)
							if (term_node) {
								self.hilite_element(term_node, false);
							}
						}
					)
				}

			// Recursion when heritage is present
			// Note var self.current_main_div is set on each dom_parse_children call
			// (see render_ts_object.render_children_list)
				if (typeof element.heritage!=='undefined') {

					// Recursive parent element resolve
					const h_data = element.heritage
					self.parse_search_result(
						h_data,
						to_hilite,
						self.current_main_div,
						true
					)
				}

			// Open arrows and fix children container state
				// main_div.classList.remove('js_first_load')
				// var children_element = main_div.parentNode.querySelector('.elements_container > [data-type="link_children"]')
				// if (children_element.firstChild) {
				// 	children_element.firstChild.classList.add('ts_object_children_arrow_icon_open')
				// 	//console.log(children_element);
				// }

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

			// keydown event
			const keydown_handler = (e) => {
				e.stopPropagation()
				// Enter key
				if (e.keyCode === 13) {
					ts_object.save_order(button_obj, parseInt(input.value) )
				}
				// esc key
				if (e.keyCode===27) {
					input.blur()
				}
			}
			input.addEventListener('keydown', keydown_handler);

			// blur event
			const blur_handler = (e) => {
				e.stopPropagation()
				e.preventDefault()
				input.remove()
				button_obj.style.display = ''
			}
			input.addEventListener('blur', blur_handler);

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
	this.save_order = async function(button_obj, new_value) {

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
			const wrapper				= button_obj.parentNode.parentNode
			const link_children_element	= ts_object.get_link_children_from_wrap(wrapper)
			const section_tipo			= wrapper.dataset.section_tipo
			const section_id			= wrapper.dataset.section_id
			const children_tipo			= wrapper.dataset.children_tipo

		//console.log(nd_container.style.display);
		if (!nd_container.style.display || nd_container.style.display==='none') {

			// Load all children and hide descriptors
				// Load element by AJAX. Result is an array on HTMLElements
				self.render_children({
					link_children_element		: link_children_element,
					section_tipo				: section_tipo,
					section_id					: section_id,
					pagination					: null,
					clean_children_container	: false, // bool clean_children_container
					children_data				: null,
					children_tipo				: children_tipo
				})
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

		if (!button_obj) {
			console.error("Error on get thesaurus_node wrapper !!! empty button_obj ", button_obj);
			return null;
		}

		let parent_container = null

		// wrapper
			const wrapper = button_obj.parentNode.parentNode
			if (!wrapper.classList.contains('wrap_ts_object')) {
				console.error("Error on get thesaurus_node wrapper !!!");
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



	/**
	* IS_ROOT
	* @param string tipo
	* 	Usually 'hierarchy1' for Thesaurus and 'ontology35' from Ontology
	* @return bool
	*/
	this.is_root = function (tipo) {

		const ar_root_tipo = [
			'hierarchy1',
			'ontology35'
		]

		return ar_root_tipo.includes(tipo)
	}//end is_root



	// render alias
	this.render_root_wrapper	= render_root_wrapper
	this.render_children		= render_children



}//end ts_object



// @license-end
