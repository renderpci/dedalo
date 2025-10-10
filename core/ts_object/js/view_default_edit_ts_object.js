// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, get_current_url_vars */
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'
	import {when_in_viewport, dd_request_idle_callback} from '../../common/js/events.js'
	import {data_manager} from '../../common/js/data_manager.js'
	import {get_instance, get_all_instances} from '../../common/js/instances.js'
	import {get_caller_by_model} from '../../common/js/utils/util.js'
	import {render_relation_list} from '../../section/js/render_common_section.js'
	import {
		on_dragstart,
		on_dragend,
		on_drop,
		on_dragover,
		on_dragleave
	} from './drag_and_drop.js'
	import {ts_object} from '../../ts_object/js/ts_object.js'



/**
* VIEW_DEFAULT_EDIT_TS_OBJECT
* Manages the component's logic and appearance in client side
*/
export const view_default_edit_ts_object = function() {

	return true
}//end view_default_edit_ts_object



/**
* RENDER
* Global render for the ts_object.
* It created the DOM nodes needed from the instance (wrapper, children_container, etc.)
* Render a wrapper containing all ts_object item nodes.
* Before render the instance, you need to load the data using `ts_node.get_children_data()`
* @param object ts_record
* @param return HTMLElement wrapper
*/
view_default_edit_ts_object.render = async function(self, options) {

	// options
		const render_level = options.render_level || 'full'

	// Reset is_open value en every render. Important because force to recalculate
	// the status from every render
		self.is_open = false

	// content_data
		const content_data = get_content_data(self)
		if (render_level==='content') {
			return content_data
		}

	// wrapper. ts_object wrapper
		const wrapper = render_wrapper(self)
		wrapper.content_data = content_data

		// add content_data
		wrapper.appendChild(content_data)

	// children container
		if ( self.is_descriptor===true ) {
			self.children_container = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'children_container hide',
				parent			: wrapper
			})
		}//end if (is_descriptor===true)


	return wrapper
}//end render



/**
* GET_CONTENT_DATA
* @param object self - ts_object instance
* @return HTMLElement content_data
*/
const get_content_data = function(self) {

	const fragment = new DocumentFragment()

	// id column . id column content (icons for edit, delete, drag, order)
		const id_column_node = render_id_column(self)
		fragment.appendChild(id_column_node)

	// elements container . ts_line (term, buttons, indexations, arrow children, etc.)
		const elements_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: ['elements_container',self.caller?.model].join(' '),
			parent			: fragment
		})
		// Add elements_container > ts_line_node
		const ts_line_node = render_ts_line(self)
		elements_container.appendChild(ts_line_node)

	// data container. Elements data container (component editions place)
		const data_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'data_container',
			parent			: fragment
		})
		// set pointer
		self.data_container = data_container

	// indexations container
		const indexations_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'indexations_container hide',
			parent			: fragment
		})
		// Set pointer
		self.indexations_container = indexations_container

	// nd_container. No descriptors container
		if ( self.is_descriptor===true ) {
			const nd_container = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'nd_container hide',
				parent			: fragment
			})
			// Set pointer
			self.nd_container = nd_container
		}

	// content_data div
		const content_data = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'content_data'
		})
		content_data.appendChild(fragment)


	return content_data
}//end get_content_data



/**
* RENDER_CHILDREN
* Get the JSON data from the server. When data is loaded, render DOM element
* Data is built from parent node info (current object section_tipo and section_id)
* @param object
* {
* 	clean_children_container: bool (default false)
* 	children_data: object {ar_children_data: [], pagination: {}}
* }
* @return promise
* 	Resolve bool true
*/
export const render_children = async function(options) {
	if(SHOW_DEBUG===true) {
		console.warn('-> render_children:', this.section_tipo, this.section_id, options);
	}

	const self = this
	if (!self) {
		console.error('Invalid call to self from render_children:', this);
		return false
	}

	// options
		const {
			clean_children_container = false,
			children_data
		} = options;

	// Validate essential data
		if (!children_data?.ar_children_data) {
			console.error("[render_children] Error: Children data is missing or malformed.");
			return false;
		}

	// Get children container element. Is the div container inside current ts_object
		const children_container = self.children_container
		if (!children_container) {
			throw new Error("[render_children] The children container could not be found.");
		}

	// Clean children container before build contents
		if (clean_children_container===true) {
			while (children_container.hasChildNodes()) {
				children_container.removeChild(children_container.lastChild);
			}
		}

	// Pagination
		// const pagination = self.children_data.pagination || {}
		const pagination = children_data?.pagination || {}
		// Is paginated resolution
		const is_paginated = Boolean(
			(pagination.total && pagination.limit) &&
			(pagination.total > pagination.limit) &&
			((pagination.offset + pagination.limit) < pagination.total)
		);

	// children_number
	// It is used as base to set the correct order when pagination is present
	// The 'virtual_order' sums children_number + array key + 1 to create a continuous sequence
	// It is necessary to get from real DOM nodes because the pagination loads blocks or records.
	const children_number = is_paginated
		? ([...self.children_container.childNodes].filter(el => el.classList.contains('wrap_ts_object')).length || 0)
		: 0

	// --------------------------------------------------------------------------------
	// CHILDREN DATA ITERATION
	// --------------------------------------------------------------------------------

	// Build DOM elements iterating ar_children_data

	let counter = 0
	const ar_children_data_len = children_data.ar_children_data.length
	for (let i = 0; i < ar_children_data_len; i++) {

		const child_data = children_data.ar_children_data[i]

		// Ignore recursions. A child with the same properties of the parent can destroy the parent instance.
		if (child_data.section_tipo===self.section_tipo && parseInt(child_data.section_id)===parseInt(self.section_id)) {
			console.error('Ignored recursion in children data. ar_children_data:', children_data.ar_children_data);
			continue;
		}

		// Generate a virtual order based on the position in the array.
		const virtual_order = child_data.is_descriptor
			? children_number + counter + 1
			: counter + 1

		// Init, build and render the child instance.
		const node_wrapper = await render_child(self, child_data, virtual_order);

		// Append node to the proper container
		if (node_wrapper) {
			requestAnimationFrame(() => {
				if (child_data.is_descriptor || self.is_root_node) {
					self.children_container.appendChild( node_wrapper )
				}else{
					self.nd_container.appendChild( node_wrapper )
				}
			});
		}else{
			console.warn('Error. Ignored invalid node wrapper. ts_object_instance:', ts_object_instance);
		}

		// update virtual_order counter
		if (child_data.is_descriptor) {
			counter++;
		}
	}

	// --------------------------------------------------------------------------------
	// END CHILDREN DATA ITERATION
	// --------------------------------------------------------------------------------

	// pagination
		if (is_paginated) {
			dd_request_idle_callback(
				() => {
					requestAnimationFrame(
						() => {
							render_ts_pagination({
								self		: self,
								pagination	: pagination
							})
						}
					)
				}
			);
		}

	// Removes arrow spinner if already exists
		const arrow_icon = self.node.querySelector('.loading_spinner');
		if (arrow_icon) {
			arrow_icon.classList.remove('loading_spinner');
		}


	return true
}//end render_children



/**
* RENDER_CHILD
* Render a instance of child nodes.
* @param object self - ts_object instance
* @param object child_data - Basic child instance information for instance
* @param int virtual_order - Number with the relative child order
* @return HTMLElement node_wrapper
*/
export const render_child = async function(self, child_data, virtual_order) {

	// Creates an ts_object instance for each child
	const ts_object_instance = await ts_object.get_instance({
		// key_parts
		section_tipo			: child_data.section_tipo,
		section_id				: child_data.section_id,
		children_tipo			: child_data.children_tipo,
		target_section_tipo		: null,
		thesaurus_mode			: self.thesaurus_mode,
		// Others
		caller					: self,
		linker					: self.linker, // usually a portal component instance
		thesaurus_view_mode		: self.hesaurus_view_mode,
		is_root_node			: false,
		is_ontology				: self.is_ontology,
		virtual_order			: virtual_order,
		has_descriptor_children	: child_data.has_descriptor_children,
		area_model				: self.area_model,
		ts_id					: child_data.section_tipo + '_' + child_data.section_id,
		ts_parent				: self.section_tipo + '_' + self.section_id,
		data					: child_data // inject data to prevent calculate it again on build
	})

	await ts_object_instance.build(false)

	console.log('2 - built child ts_object_instance:', ts_object_instance);

	const node_wrapper = await ts_object_instance.render({
		render_level : 'full'
	})


	return node_wrapper
}//end render_child



/**
* RENDER_TS_LINE
* Render standardized complete ts line with term ans buttons
* @param object self - ts_object instance
* @return DocumentFragment fragment
*/
const render_ts_line = function(self) {

	// short vars
		const ar_elements			= self.data?.ar_elements || []
		const is_descriptor			= self.is_descriptor
		const indexations_container	= self.indexations_container

	// DocumentFragment
		const fragment = new DocumentFragment()

	// LIST_THESAURUS_ELEMENTS
	// Iterate child data switch between custom  render elements (buttons, etc)
	const ar_elements_len = ar_elements.length
	for (let j = 0; j < ar_elements_len; j++) {

		const current_element = ar_elements[j]

		const children_dataset	= {
			tipo	: current_element.tipo,
			type	: current_element.type
		}

		switch(current_element.type) {

			// TERM
			case ('term'): {
				const area_ontology_caller = get_caller_by_model(self, 'area_ontology')
				const render_handler = area_ontology_caller
					? render_ontology_term
					: render_term

				const term_node = render_handler({
					self			: self,
					ar_elements		: ar_elements,
					is_descriptor	: is_descriptor,
					key				: j
				})
				fragment.appendChild(term_node)
				// set pointer
				self.term_node = term_node

				// id_info
				const term_id = (area_ontology_caller)
					? (()=>{
						// id_info. Like '[hierarchy1_246]' (Term tipo)
						// parse parts
						const regex				= /^(.*) ([a-z]{2,}) ([0-9]+)$/gm;
						const term_regex_result	= regex.exec(current_element.value)
						// term_id . like 'dd_1'
						return term_regex_result
							? term_regex_result[2] + term_regex_result[3]
							: section_tipo + section_id
					  })()
					: self.section_tipo +'_'+ self.section_id

				const id_info = ui.create_dom_element({
					element_type	: 'span',
					class_name		: 'id_info ontology',
					inner_html		: '['+ term_id +']',
					title			: self.section_tipo + ' - ' + self.section_id,
					data_set		: {
						section : self.section_tipo + ' - ' + self.ection_id,
						term_id : '['+ term_id +']'
					},
					parent			: fragment
				})
				const mousedown_handler_id_info = (e) => {
					e.stopPropagation()
				}
				id_info.addEventListener('mousedown', mousedown_handler_id_info)
				const click_handler_id_info = (e) => {
					e.stopPropagation()
					if(SHOW_DEBUG===true) {
						if (e.metaKey && e.altKey) {
							e.preventDefault()
							console.log('/// refreshing instance (build_autoload=true, render_level=content):', self);
							self.refresh({
								build_autoload	: true,
								render_level	: 'content'
							})
							return
						}
						if (e.altKey) {
							e.preventDefault()
							console.log(`/// selected instance ${self.model}:`, self);
							return
						}
					}
				}
				id_info.addEventListener('click', click_handler_id_info)

				// button_duplicate
				if (area_ontology_caller) {
					const button_duplicate = ui.create_dom_element({
						element_type	: 'span',
						class_name		: 'button_duplicate',
						inner_html		: '<span>+</span>',
						parent			: fragment
					})
					// click event
					const click_handler_duplicate = async (e) => {
						e.stopPropagation()

						if (!confirm(get_label.sure || 'Sure?')) {
							return false
						}

						const section_tipo	= self.section_tipo
						const section_id	= self.section_id

						const section = await get_instance({
							model			: 'section',
							section_tipo	: section_tipo,
							section_id		: section_id
						})
						const new_section_id = await section.duplicate_section( section_id )
						if (!new_section_id) {
							return false
						}

						// parent instance
						const parent_instance = self.caller
						if (!parent_instance) {
							console.error('Unable to get parent instance from caller:', self);
							return false
						}

						// pagination
						const pagination = parent_instance.children_data?.pagination || null
						if (pagination) {
							pagination.limit = 0
							pagination.offset = 0
						}

						// children_data - render_children_data from API
						const children_data = await parent_instance.get_children_data({
							pagination	: pagination,
							children	: null,
							cache		: false // Forces call API again
						})
						if (!children_data) {
							// error case
							console.warn("[ts_object.render_children] Error, children_data is null");
							return false
						}

						// refresh children container
						parent_instance.render_children({
							clean_children_container	: true,
							children_data				: children_data
						})
						.then(function(result){
							// Open editor in new window
							if (result) {
								dd_request_idle_callback(()=>{
									// hilite the new term
									const target_instance = get_all_instances().find(el => parseInt(el.section_id)===parseInt(new_section_id) && el.section_tipo===section_tipo && el.model==='ts_object')
									if (target_instance) {
										self.hilite_element( target_instance.term_node )
									}else{
										console.error('Unable to get the target instance');
									}
									// open a edit window with the new record
									self.open_record(new_section_id, section_tipo)
								})

							}
						})
					}
					button_duplicate.addEventListener('click', click_handler_duplicate)
				}
				break;
			}

			// ND BUTTON
			case ('link_children_nd'): {
				// Button for non descriptor [nd]
				const element_children_nd = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'link_children_nd default term nd unselectable',
					data_set		: children_dataset,
					text_node		: current_element.value,
					parent			: fragment
				})
				// mousedown event
				const mousedown_handler = (e) => {
					e.stopPropagation()

					element_children_nd.classList.add('loading_spinner')

					// toggle_nd
					self.toggle_nd(element_children_nd, e)
					.then(function(){
						element_children_nd.classList.remove('loading_spinner')
					})
				}
				element_children_nd.addEventListener('mousedown', mousedown_handler)
				break;
			}

			// ARROW ICON (link_children)
			case ('link_children'): {
				if (self.has_descriptor_children) {
					// button arrow link children.
					// To access it, use the pointer to self.link_children_element
					const link_children_element = render_link_children(self)
					fragment.appendChild(link_children_element)
				}else{
					self.link_children_element = null
				}
				break;
			}

			// INDEXATIONS
			case ('component_relation_index'): {
				if (!current_element.show_data) {
					const total = parseInt(current_element.count_result?.total || 0)
					if(total > 0){
						// button_show_indexations. Build button
						const button_show_indexations = ui.create_dom_element({
							element_type	: 'div',
							class_name		: 'button_show_indexations',
							data_set		: children_dataset,
							text_node		: current_element.value, // generates a span with the value like '<span>U:37</span>'
							parent			: fragment
						})
						// mousedown event
						const mousedown_handler = (e) => {
							e.stopPropagation()

							button_show_indexations.classList.add('loading_spinner')
							const uid = current_element.tipo +'_'+ self.section_tipo +'_'+ self.section_id

							const current_total = parseInt(current_element.count_result?.total || 0)

							self.show_indexations({
								uid 				: uid,
								button_obj			: button_show_indexations,
								event				: e,
								section_tipo		: self.section_tipo,
								section_id			: self.section_id,
								component_tipo		: current_element.tipo,
								target_div			: indexations_container,
								value				: null,
								total				: current_total,
								totals_group		: current_element.count_result?.totals_group,
								filter_by_locators	: [{
									section_tipo	: self.section_tipo,
									section_id		: self.section_id,
									tipo			: current_element.tipo
								}]
							})
							.then(function(){
								button_show_indexations.classList.remove('loading_spinner')
							})
						}
						button_show_indexations.addEventListener('mousedown', mousedown_handler)
					}

				}else if(current_element.show_data === 'children') {
					// recursive indexations
					const button_recursive_indexations = ui.create_dom_element({
						element_type	: 'div',
						class_name		: 'button_show_indexations',
						data_set		: children_dataset,
						text_node		: `⇣${current_element.value}`, // generates a span with the value like '<span>U:37</span>', // generates a span with the value like '<span>U:37</span>'
						parent			: fragment
					})
					// mousedown event
					const mousedown_handler = (e) => {
						e.stopPropagation()

						button_recursive_indexations.classList.add('loading_spinner')

						self.get_children_recursive({
							section_tipo	: self.section_tipo,
							section_id		: self.section_id
						})
						.then(function(children_recursive){

							self.show_indexations({
								uid 				: `${current_element.tipo}_recursive`,
								button_obj			: button_recursive_indexations,
								event				: e,
								section_tipo		: self.section_tipo,
								section_id			: self.section_id,
								component_tipo		: current_element.tipo,
								target_div			: indexations_container,
								value				: null,
								total				: null,
								totals_group		: current_element.count_result.totals_group,
								filter_by_locators	: children_recursive
							})
							.then(function(){
								button_recursive_indexations.classList.remove('loading_spinner')
							})
						})
					}
					button_recursive_indexations.addEventListener('mousedown', mousedown_handler)
				}
			}

			// IMG
			case ('img'): {
				if(current_element.value) {

					const element_img = ui.create_dom_element({
						element_type	: 'div',
						class_name		: 'term_img',
						data_set		: children_dataset,
						parent			: fragment
					})
					// mousedown handler
					const mousedown_handler = (e) => {
						e.stopPropagation()

						element_img.classList.add('loading_spinner')

						self.show_component_in_ts_object({
							tipo	: current_element.tipo,
							type	: current_element.type,
							model	: current_element.model
						})
						.then(function(){
							element_img.classList.remove('loading_spinner')
						})
					}
					element_img.addEventListener('mousedown', mousedown_handler)
					// image
					ui.create_dom_element({
						element_type	: 'img',
						src				: current_element.value,
						parent			: element_img
					})
				}
				break;
			}

			// OTHERS. Buttons for show component to edit, etc.
			default: {
				const current_value = current_element.value

				// Case common buttons and links
				const button_show_component = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'default button_show_component ' + current_element.tipo,
					data_set		: children_dataset,
					text_node		: current_value, // creates a span node with the value inside
					parent 			: fragment
				})
				// mousedown event
				const mousedown_handler = (e) => {
					e.stopPropagation()

					button_show_component.classList.add('loading_spinner')

					self.show_component_in_ts_object({
						tipo	: current_element.tipo,
						type	: current_element.type,
						model	: current_element.model
					})
					.then(()=>{
						button_show_component.classList.remove('loading_spinner')
					})
				}
				button_show_component.addEventListener('mousedown', mousedown_handler)
				break;
			}
		}//end switch(true)

		// ontology model case
		if (current_element.model_value) {
			const show_models_class = window.page_globals.show_models===true ? '' : ' hide';
			ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'model_value' + show_models_class,
				text_content	: current_element.model_value,
				parent			: fragment
			})
		}
	}//end for (var j = 0; j < ch_len; j++)


	return fragment
}//end render_ts_line



/**
* RENDER_TS_PAGINATION
* Render pagination button with events
* @param object options
* {
* 	children_container: HTMLElement
* 	pagination: object
* }
* @return HTMLElement button_show_more
*/
const render_ts_pagination = function(options) {

	// options
		const self			= options.self
		const pagination	= options.pagination

	// button_show_more
		const button_show_more = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'button show_more',
			inner_html		: get_label.show_more || 'Show more',
			parent			: self.children_container
		})
		// mousedown event
		const mousedown_handler = (e) => {
			e.stopPropagation()

			// loading
			button_show_more.classList.add('loading_spinner')

			// increase offset pagination on get children call
			pagination.offset = (pagination.offset + pagination.limit)

			// children_data - render_children_data from API
			self.get_children_data({
				pagination	: pagination,
				children	: null,
				cache		: false
			})
			.then(function(children_data){
				if (!children_data) {
					// error case
					console.warn("[ts_object.render_children] Error, children_data is null");
					return false
				}

				// Fix children_data
				self.children_data = self.children_data || {
					ar_children_data : [],
					pagination : null
				}
				self.children_data.pagination = children_data.pagination
				self.children_data.ar_children_data.push(...children_data.ar_children_data)

				// render children
				self.render_children({
					clean_children_container	: false,
					children_data				: children_data // Only new data will be rendered and added
				})
				.then(function(){
					button_show_more.remove()
				})
			})
		}
		button_show_more.addEventListener('mousedown', mousedown_handler)//end click


	return button_show_more
}//end render_ts_pagination



/**
* RENDER_ID_COLUMN
* Creates the id nodes like:
* <div class="id_column_content">
*  <a class="id_column_link ts_object_add" title="add"><div class="ts_object_add_icon"></div></a>
*  <div class="id_column_link ts_object_drag" title="drag"><div class="ts_object_drag_icon"></div></div>
*  <a class="id_column_link ts_object_delete" title="delete"><div class="ts_object_delete_icon"></div></a>
*  <a class="id_column_link ts_object_order_number"><span> 1</span></a>
*  <a class="id_column_link ts_object_edit" title="edit"><div class="ts_object_section_id_number"><span> 15</span></div><div class="ts_object_edit_icon"></div></a>
* </div>
* @param object self ts_object instance
* @return HTMLElement id_column_content
*/
const render_id_column = function(self) {

	// short vars
		const section_tipo		= self.section_tipo
		const section_id		= self.section_id
		const is_descriptor		= self.is_descriptor
		const is_indexable		= self.is_indexable
		const children_data		= self.children_data
		const mode				= self.mode
		const virtual_order		= self.virtual_order
		const is_root_node		= self.is_root_node
		const thesaurus_mode	= self.thesaurus_mode

	// id column container
		const id_column_content = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'id_column_content'
		})

	switch(thesaurus_mode) {

		case 'relation': {
			// hierarchy_node cannot be used as related  and not index-able too
			if ( is_indexable===false ) break;

			// link_related
				const link_related = ui.create_dom_element({
					element_type	: 'a',
					class_name		: 'id_column_link ts_object_related',
					title_label		: 'add',
					parent			: id_column_content
				})
				const current_label_term = children_data.ar_elements.find(el => el.type==='term')
				link_related.data = {
					section_tipo	: children_data.section_tipo,
					section_id		: children_data.section_id,
					label			: current_label_term ? current_label_term.value : ''
				}
				// click event
				const click_handler = (e) => {
					e.stopPropagation()

					// source window. Could be different than current (like iframe)
						// const source_window = window.opener || window.parent
						// if (source_window===null) {
						// 	console.warn("[link_term] Error on find window.opener / parent")
						// 	return false
						// }

					// publish event link_term
						if (!self.linker) {
							console.warn(`Error. self.linker is not defined.
								Please set ts_object linker property with desired target component portal:`, self);
							return false
						}
						// linker id. A component_portal instance is expected as linker
						const linker_id = self.linker.id
						// source_window.event_manager.publish('link_term_' + linker_id,
						const window_base = !self.linker.caller
							? window.opener // case DS opening new window
							: window // default case (indexation)
						window_base.event_manager.publish('link_term_' + linker_id, {
							section_tipo	: children_data.section_tipo,
							section_id		: children_data.section_id,
							label			: current_label_term ? current_label_term.value : ''
						})
				}
				link_related.addEventListener('click', click_handler)
			// related icon
				ui.create_dom_element({
					element_type	: 'span',
					class_name		: 'button arrow_link',
					parent			: link_related
				})
			break;
		}

		default: {

			// ADD . button + add element
				if (self.permissions_button_new>=2 && is_descriptor) {
					const link_add = ui.create_dom_element({
						element_type	: 'a',
						class_name		: 'id_column_link ts_object_add',
						title_label		: 'add',
						parent			: id_column_content
					})
					// click event
					const add_click_handler = async function(e) {
						e.stopPropagation()

						if (!confirm(get_label.sure || 'Sure?')) {
							return
						}

						// mode set in dataset
							link_add.dataset.mode = 'add_child'

						// add_child
							const response = await self.add_child()

						// new_section_id . Generated as response by the trigger add_child
							const new_section_id = response.result
							if (!new_section_id) {
								return
							}

						// pagination
							const pagination = self.children_data?.pagination || null
							if (pagination) {
								pagination.limit = 0
								pagination.offset = 0
							}

						// children_data - render_children_data from API
							const children_data = await self.get_children_data({
								pagination	: pagination,
								children	: null,
								cache		: false // Forces call API again
							})
							if (!children_data) {
								// error case
								console.warn("[ts_object.render_children] Error, children_data is null");
								return false
							}

						// refresh children container
							self.render_children({
								clean_children_container : true,
								children_data : children_data
							})
							.then(function(result){
								// result could be an array of children_container nodes or bool false
								// Open editor in new window
								if (result) {
									// edit call
									self.open_record(
										new_section_id, // section_id
										section_tipo // section_tipo
									);
								}
							})
					}
					link_add.addEventListener('click', add_click_handler)

					// add_icon_link_add
					ui.create_dom_element({
						element_type	: 'div',
						class_name		: 'ts_object_add_icon',
						parent			: link_add
					})
				}//end if (self.permissions_button_new>=2)

			// MOVE DRAG . button drag element
				if (self.permissions_button_new>=2 && is_descriptor && !is_root_node) {
					const dragger = ui.create_dom_element({
						element_type	: 'div',
						class_name		: 'id_column_link ts_object_drag',
						title_label		: 'drag',
						parent			: id_column_content
					})
					// mousedown event
					const mousedown_handler = (e) => {
						e.stopPropagation()

						const wrapper = self.node
						// event_handle. set with event value
						wrapper.event_handle = e
						// activate draggable
						wrapper.draggable = true
					}
					dragger.addEventListener('mousedown', mousedown_handler)
					// mouseup event . Reverts mousedown wrapper draggable set
					const mouseup_handler = (e) => {
						e.stopPropagation()
						const wrapper = self.node
						// event_handle. set with event value
						wrapper.event_handle = null
						// deactivate draggable
						wrapper.draggable = false
					}
					dragger.addEventListener('mouseup', mouseup_handler)

					// drag icon
					ui.create_dom_element({
						element_type	: 'div',
						class_name		: 'ts_object_drag_icon',
						parent			: dragger
					})
				}

			// DELETE . button delete element
				if (self.permissions_button_delete>=2) {
					const link_delete = ui.create_dom_element({
						element_type	: 'a',
						class_name		: 'id_column_link ts_object_delete',
						title_label		: 'delete',
						parent			: id_column_content
					})
					// click event
					const click_handler = (e) => {
						e.stopPropagation()
						// delete record using wrapper data
						render_delete_record_dialog({
							self					: self,
							section_id				: section_id,
							section_tipo			: section_tipo,
							has_descriptor_children	: self.has_descriptor_children
						})
					}
					link_delete.addEventListener('click', click_handler)

					// delete icon
					ui.create_dom_element({
						element_type    : 'div',
						class_name		: 'ts_object_delete_icon',
						parent			: link_delete
					 })
				}//end if (self.permissions_button_delete>=2)

			// ORDER number element
				if (self.permissions_button_new>=2 && is_descriptor && mode!=='search' && !is_root_node) {
					const order_number_link = ui.create_dom_element({
						element_type	: 'a',
						class_name		: 'id_column_link ts_object_order_number',
						text_node		: virtual_order,
						parent			: id_column_content
					})
					// click event
					const click_handler = (e) => {
						e.stopPropagation()
						render_order_form({
							self				: self,
							order_number_link	: order_number_link
						})
					}
					order_number_link.addEventListener('click', click_handler)
				}

			// EDIT . button edit element
				const link_edit = ui.create_dom_element({
					element_type	: 'a',
					class_name		: 'id_column_link ts_object_edit',
					title_label		: 'edit',
					parent			: id_column_content
				})
				// mousedown event
				const mousedown_handler = (e) => {
					e.stopPropagation()
					// edit call
					self.open_record(
						self.section_id,
						self.section_tipo
					)
				}
				link_edit.addEventListener('mousedown', mousedown_handler)

				// section_id number
				ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'ts_object_section_id_number',
					text_node		: self.section_id,
					parent			: link_edit
				})
				// edit icon
				ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'ts_object_edit_icon',
					parent			: link_edit
				})

			break;
		}
	}//end switch(self.thesaurus_mode)


	return id_column_content
}//end render_id_column



/**
* RENDER_DELETE_RECORD_DIALOG
* Creates the modal with relations and buttons for delete record
* @param object options
* {
* 	self: object,
* 	section_id: int,
* 	section_tipo: string,
* 	has_descriptor_children: bool
* }
* @return bool
*/
const render_delete_record_dialog = function (options) {

	// options
		const self						= options.self
		const section_id				= options.section_id
		const section_tipo				= options.section_tipo
		const has_descriptor_children	= options.has_descriptor_children

	// invalid permissions
		if (self.permissions<2) {
			return false
		}

	// header
		const header = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'header'
		})
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'label',
			inner_html		: (get_label.delete || 'Delete') + ` ID: ${section_id} <span class="note">[${section_tipo}]</span>`,
			parent			: header
		})

	// body
		const body = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'body content',
			inner_html		: ' '
		})

	// relation_list
		const relation_list_placeholder = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'relation_list_placeholder',
			parent			: body
		})
		const relation_list = render_relation_list({
			self			: self,
			section_id		: section_id,
			section_tipo	: section_tipo
		})
		relation_list_placeholder.replaceWith(relation_list);

	// footer
		const footer = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'footer content'
		})

	if (has_descriptor_children) {

		ui.create_dom_element({
			element_type	: 'div',
			inner_html		: 'Sorry. It is not possible to delete an element with children. Please remove all children before deleting.',
			class_name		: 'content warning',
			parent			: footer
		})
		footer.classList.add('left')

	}else{

		// button_delete (Deletes real target record)
			// button_delete
				const button_delete = ui.create_dom_element({
					element_type	: 'button',
					class_name		: 'danger remove',
					text_content	: get_label.delete_resource_and_links || 'Delete resource and all links',
					parent			: footer
				})
				const fn_click_unlink_and_delete = async function(e) {
					e.stopPropagation()

					// stop if the user don't confirm 1
					if (!confirm(get_label.are_you_sure_to_delete_this_record || 'Sure?')) {
						return
					}

					footer.classList.add('loading')

					// delete the record and pointers to it
					const deleted = await self.delete_term({
						section_tipo	: section_tipo,
						section_id		: section_id
					})

					footer.classList.remove('loading')

					if (!deleted) {
						return
					}

					// refresh wrap
					self.refresh_element(
						false // hilite
					)

					// close modal
					modal.close()
				}
				button_delete.addEventListener('click', fn_click_unlink_and_delete)

			// delete diffusion records checkbox
			const delete_diffusion_records_label = ui.create_dom_element({
				element_type	: 'label',
				class_name		: 'block_label unselectable',
				inner_html		: get_label.delete_diffusion_records || 'Delete diffusion records',
				parent			: footer
			})
			const delete_diffusion_records_checkbox = ui.create_dom_element({
				element_type	: 'input',
				type			: 'checkbox'
			})
			// default value is true
			delete_diffusion_records_checkbox.checked	= true
			self.delete_diffusion_records				= true
			// change event
			delete_diffusion_records_checkbox.addEventListener('change', (e) => {
				self.delete_diffusion_records = delete_diffusion_records_checkbox.checked
			})
			// append node
			delete_diffusion_records_label.prepend(delete_diffusion_records_checkbox)
			delete_diffusion_records_label.style = 'float:left'

		// focus button
			// Set the default button to be fired when the modal is active
			// when the user press the Enter key in the keyboard
			// the unlink option will be fired
			const focus_the_button = function() {
				// set the focus to the button_unlink
				dd_request_idle_callback(
					() => {
						button_delete.focus()
						button_delete.classList.add('focus')
					}
				)
				button_delete.addEventListener('keyup', (e)=>{
					e.preventDefault()
				})
			}
			// when the modal will be ready in DOM fire the function to attack the event
			when_in_viewport(button_delete, focus_the_button)
	}//end if (has_descriptor_children)

	// modal
		const modal = ui.attach_to_modal({
			header		: header,
			body		: body,
			footer		: footer,
			size		: 'normal', // string size small|big|normal
			callback	: (dd_modal) => {
				dd_modal.modal_content.style.width = '50rem'
			}
		})

	// self.delete(link_delete)

	return true
}//end render_delete_record_dialog



/**
* RENDER_TERM
* Creates the term nodes like:
* <div class="list_thesaurus_element term" data-tipo="hierarchy25" data-type="term" data-section_tipo="aa1" data-section_id="1">
*  <span class="term_text">Social Anthropology</span>
*  <span class="id_info"> [aa1_1]</span>
* </div>
* @param object options
* {
*	child_data: object {ar_elements:[{}], has_descriptor_children:true, is_descriptor:true, ..}
* 	is_descriptor: bool
*	key: int
* 	self: object
* }
* @return HTMLElement term_node
*/
const render_term = function(options) {

	// options
		const self			= options.self
		const ar_elements	= options.ar_elements
		const is_descriptor	= options.is_descriptor
		const key			= options.key // int j

	// short vars
		const item	= ar_elements[key]
		const tipo	= Array.isArray(item?.tipo) ? item.tipo[0] : item.tipo

	// term_node
		const term_node = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'term'
		})
		// fix term pointer
		self.term_node = term_node

		// term_text
		const term_text_value = Array.isArray( ar_elements[key].value )
			? item.value.join(' ')
			: item.value
		const term_text = ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'term_text unselectable' + (is_descriptor ? '' : ' no_descriptor'),
			inner_html		: term_text_value,
			parent			: term_node
		})
		self.term_text = term_text
		// click event
		const click_handler = (e) => {
			e.stopPropagation()

			if(self.thesaurus_mode==='relation'){
				return // ignore relation click
			}

			term_node.classList.add('loading_spinner')

			// show_component_in_ts_object
			self.show_component_in_ts_object({
				tipo	: item.tipo,
				type	: item.type,
				model	: item.model
			})
			.then(function(){
				term_node.classList.remove('loading_spinner')
			})
		}
		term_text.addEventListener('click', click_handler)

	// element_to_hilite
		if (self.element_to_hilite) {
			if(		term_node.dataset.section_id == self.element_to_hilite.section_id
				&& 	term_node.dataset.section_tipo===self.element_to_hilite.section_tipo) {
				// hilite element
				dd_request_idle_callback(
					() => {
						self.hilite_element(term_node)
					}
				)
			}
		}


	return term_node
}//end render_term



/**
* RENDER_ONTOLOGY_TERM
* Creates the term nodes like:
* <div class="list_thesaurus_element term" data-tipo="hierarchy25" data-type="term" data-section_tipo="aa1" data-section_id="1">
*  <span class="term_text">Social Anthropology</span>
*  <span class="id_info"> [aa1_1]</span>
* </div>
* @param object options
* {
*	child_data: object {ar_elements:[{}], has_descriptor_children:true, is_descriptor:true, ..}
* 	is_descriptor: bool
*	key: int
* 	self: object
* }
* @return HTMLElement term_node
*/
const render_ontology_term = function(options) {

	// options
		const self			= options.self
		const ar_elements	= options.ar_elements
		const is_descriptor	= options.is_descriptor
		const key			= options.key // int j

	// short vars
		const section_tipo	= self.section_tipo
		const section_id	= self.section_id
		const ts_id			= self.ts_id
		const item			= ar_elements[key]

	// children_dataset
		const children_dataset	= {
			section_tipo	: section_tipo,
			section_id		: section_id,
			tipo			: item.tipo[0],
			type			: item.type
		}

	// parse parts
		const regex				= /^(.*) ([a-z]{2,}) ([0-9]+)$/gm;
		const term_regex_result	= regex.exec(item.value)

		// term_text
			const term_text = term_regex_result
				? term_regex_result[1]
				: ts_id

	// term_node
		const term_node = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'term',
			data_set		: children_dataset
		})
		// fix term pointer
		self.term_node = term_node

	// term_text
		const term_text_node = ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'term_text' + (is_descriptor ? '' : ' no_descriptor'),
			inner_html		: term_text,
			parent			: term_node
		})
		// click event
		const click_handler = (e) => {
			e.stopPropagation()

			if(self.thesaurus_mode==='relation'){
				return // ignore relation click
			}

			term_node.classList.add('loading_spinner')

			// Only first item (term) is used
			const tipo = Array.isArray(item.tipo) ? item.tipo[0] : item.tipo

			// show_component_in_ts_object
			self.show_component_in_ts_object({
				tipo	: tipo,
				type	: item.type,
				model	: item.model
			})
			.then(function(){
				term_node.classList.remove('loading_spinner')
			})
		}
		term_text_node.addEventListener('click', click_handler)

	// element_to_hilite
		if (self.element_to_hilite) {
			if(		term_node.dataset.section_id == self.element_to_hilite.section_id
				&& 	term_node.dataset.section_tipo===self.element_to_hilite.section_tipo) {
				// hilite element
				dd_request_idle_callback(
					() => {
						self.hilite_element(term_node)
					}
				)
			}
		}


	return term_node
}//end render_ontology_term



/**
* RENDER_WRAPPER
* Normalized wrapper render
* @param object options
* @return HTMLElement wrap_ts_object
*/
const render_wrapper = function(self) {

	// options
		const is_descriptor = self.is_descriptor ?? true

	// short vars
		const section_tipo		= self.section_tipo
		const section_id		= self.section_id
		// const children_tipo	= self.children_tipo

	// dataset
		const dataset = {
			section_tipo	: section_tipo,
			section_id		: section_id,
			id				: self.id
		}

	// class_name
		const class_name = is_descriptor===true ? 'wrap_ts_object' : 'wrap_ts_object wrap_ts_object_nd'

	// wrap_ts_object
		const wrap_ts_object = ui.create_dom_element({
			element_type	: 'div',
			class_name		: class_name,
			data_set		: dataset
		})
		// set pointer to common render
		// wrap_ts_object.content_data = wrap_ts_object
		// drag events attach
		if (is_descriptor===true) {

			// dragstart event. Activated on dragger click
			const dragstart_handler = (e) => {
				on_dragstart(self, e)
			}
			wrap_ts_object.addEventListener('dragstart', dragstart_handler)

			// dragend event
			const dragend_handler = (e) => {
				// deactivate wrapper event_handle (forces to select from drag icon)
				wrap_ts_object.event_handle = null
				on_dragend(self, e)
			}
			wrap_ts_object.addEventListener('dragend', dragend_handler)

			// drop event
			const drop_event = (e) => {
				// deactivate wrapper event_handle (forces to select from drag icon)
				wrap_ts_object.event_handle = null
				on_drop(self, e, wrap_ts_object)
			}
			wrap_ts_object.addEventListener('drop', drop_event)

			// dragover event
			const dragover_handler = (e) => {
				on_dragover(self, e)
			}
			wrap_ts_object.addEventListener('dragover', dragover_handler)

			// dragleave
			const dragleave_handler = (e) => {
				// deactivate wrapper event_handle (forces to select from drag icon)
				wrap_ts_object.event_handle = null
				on_dragleave(self, e)
			}
			wrap_ts_object.addEventListener('dragleave', dragleave_handler)
		}


	return wrap_ts_object
}//end render_wrapper



/**
* RENDER_LINK_CHILDREN
* Builds normalized link children HTMLElement
* @param object self - ts_object instance
* @return HTMLElement link_children_element
*/
const render_link_children = function (self) {

	// local_db_id. If thesaurus_mode is defined use a different status track
	// to prevent overwrite the main status of the ts_object element
		const local_db_id = self.id

	// link_children_element. Open children arrow icon.
		const link_children_element = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'link_children unselectable'
		})
		// fix pointer
		self.link_children_element = link_children_element

	// open children function
		const open_children = async () => {

			// add loading_spinner style
			link_children_element.classList.add('loading_spinner')

			// load children data and render it
			self.get_children_data({
				section_tipo	: self.section_tipo,
				section_id		: self.section_id,
				children_tipo	: self.children_tipo,
				pagination		: self.pagination,
				children		: null
			})
			.then(function(response){

				if (!response?.ar_children_data) {
					console.error('Error getting children data. response:', response);
					return
				}

				const children_data = response

				// Fix children_data
				self.children_data = children_data

				// Add children nodes into self.children_container or parent_nd_container
				self.render_children({
					clean_children_container	: true,
					children_data				: children_data
				})
				// show children container
				self.children_container.classList.remove('hide')
				// set arrow down
				link_children_element.classList.add('open')
				// remove link_children_element 'loading_spinner' style
				link_children_element.classList.remove('loading_spinner')

				// Add local db status
				data_manager.set_local_db_data(
					{
						id		: local_db_id,
						value	: 1
					}, // mixed data
					'status' // string table
				);
			})
		}
		// set pointer
		self.link_children_element.open_children = open_children

	// sync style with is_open status
		if (self.is_open) {
			if (self.children_container) {
				if (self.children_container.hasChildNodes()) {
					// Already loaded. Only display it.
					self.children_container.classList.remove('hide')
					self.link_children_element.classList.add('open')
				}else{
					// Load the children data once.
					open_children()
				}
			}
		}else{
			self.link_children_element.classList.remove('open')
			if (self.children_container) {
				self.children_container.classList.add('hide')
			}
		}

	// mousedown event
		const mousedown_handler = async (e) => {
			e.stopPropagation()

			// if (self.ts_id==='tldtest1_2') {
				console.warn('))))) Triggered mousedown handler:', self);
				// console.warn('))))) Triggered mousedown handler e:', e);
			// }

			// update status. Tracks element open children status
			const is_open = self.is_open // link_children_element.classList.contains('open')
			// const is_open = link_children_element.classList.contains('open')
			if (is_open) {

				// hide children container
				self.children_container.classList.add('hide')

				// restore arrow initial position
				link_children_element.classList.remove('open')

				// Remove local db status
				data_manager.delete_local_db_data(local_db_id, 'status')

				// set as not open
				self.is_open = false

			}else{

				if (self.children_container.hasChildNodes()) {

					// Already loaded. Only display it.

					// show children container
					self.children_container.classList.remove('hide')
					// set arrow down
					link_children_element.classList.add('open')

				}else{

					// Load children data once.
					await open_children()
				}

				// set as open
				self.is_open = true
			}
		}
		link_children_element.addEventListener('mousedown', mousedown_handler)

	// restore open arrow status
		if (self.mode!=='search') {
			dd_request_idle_callback(
				() => {
					data_manager.get_local_db_data(local_db_id, 'status')
					.then((status) => {
						if (!status?.value) {
							return
						}
						when_in_viewport(
							link_children_element,
							() => {
								// fire mousedown event to force load children
								if (!self.is_open) {
									// fire mousedown_handler
									link_children_element.dispatchEvent(new MouseEvent('mousedown'));
									// Force to open the children list
									// mousedown_handler()
								}
							}
						);
					})
				}
			);
		}


	return link_children_element
}//end render_link_children



/**
* RENDER_ORDER_FORM
* Creates an `<input>` that temporarily replaces the “order number” link.
* When the user changes the value and presses **Enter** (or blurs the field)
* the new order is saved, the children are re‑ordered and the original
* link is shown again.
* @param object options
* {
* 	self : object - ts_object instance,
* 	order_number_link: HTMLElement
* }
* @return bool
*/
const render_order_form = function(options) {

	// options
	const {
		self,
		order_number_link
	} = options

	// Check mandatory order_number_link
	if (!order_number_link) {
		return false
	}

	// Remove all previous inputs
	document.querySelectorAll('input.input_order').forEach(node => node.remove())

	// Current value (old)
	const old_value = Number(self.virtual_order) || 0

	// input. Create a input to contain the current order value
	const input = document.createElement('input')
	input.classList.add('id_column_link','input_order')
	input.value = old_value

	// keydown event
	// Prevent the event from bubbling up (e.g. to the tree view click)
	const keydown_handler = (e) => {
		e.stopPropagation()
	}
	input.addEventListener('keydown', keydown_handler);

	// Async change handler – called when the user presses Enter
	const change_handler = async () => {

		const wrapper = self.node

		wrapper.classList.add('loading')

		// save order. Note that this function do not await the
		// API request for performance. If the request fails,
		// a error notification is displayed at top
		await self.save_order( input.value )

		wrapper.classList.remove('loading');
		input.blur();

		// Re-order the children_container nodes
		// The nodes are ordered manually (avoiding use 'render_children') to
		// preserve the already open children ODM nodes.
		const order_children	= self.caller.children_data.ar_children_data
		const chidren_list		= [...self.caller.children_container.childNodes]

		for (const item of order_children) {

			// Find wrapper into the parent children_container
			const found_wrapper = chidren_list.find(el => {
				return  el.dataset.section_tipo===item.section_tipo &&
						el.dataset.section_id==item.section_id;
			});

			if (!found_wrapper) continue;

			// Move wrapper node to the end of the container in each
			// iteration to ends matching the order of the children data (order_children).
			self.caller.children_container.appendChild(found_wrapper)

			// Instance refresh. Force instance to update order value link
			// without render their children nodes
			const instance = get_all_instances().find(el =>
				el.section_id===item.section_id &&
				el.section_tipo===item.section_tipo &&
				el.model==='ts_object'
			);
			if (instance) {
				await instance.refresh({
					render_level	: 'content',
					destroy			: false,
					build_autoload	: false
				})
			}
		}

		// hilite current term
		dd_request_idle_callback(()=>{
			// hilite
			self.hilite_element(self.term_node)
		})
	}
	input.addEventListener('change', change_handler);

	// blur event – hide the input and show the original link
	const blur_handler = (e) => {
		e.stopPropagation()
		// Remove the unnecessary input field node
		input.remove()
		// Display the hidden order link
		order_number_link.classList.remove('hide')
	}
	input.addEventListener('blur', blur_handler);

	// Insert the input into the DOM

	// Add input element after the order_number_link
	order_number_link.parentNode.insertBefore(input, order_number_link.nextSibling);

	// Hide order_number_link
	order_number_link.classList.add('hide')

	// Focus and select new input element
	input.focus();
	input.select();


	return true
}//end render_order_form



// @license-end
