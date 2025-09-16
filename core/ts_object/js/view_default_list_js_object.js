// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, get_current_url_vars */
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'
	import {when_in_viewport,dd_request_idle_callback} from '../../common/js/events.js'
	import {data_manager} from '../../common/js/data_manager.js'
	import {get_instance} from '../../common/js/instances.js'
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
* LIST
* Global render for the ts_object.
* It created the DOM nodes needed from the instance (wrapper, children_container, etc.)
* Render a wrapper containing all ts_object item nodes.
* Before render the instance, you need to load the data using `ts_node.get_children_data()`
* @param object ts_record
*/
export const list = function() {

	const self = this

	// is_root_node
		const is_root_node = self.is_root_node ?? false

	// is_descriptor
		const is_descriptor = self.is_descriptor

	// wrapper. ts_object wrapper
		// root node case do not needs id column, etc.
		if (is_root_node) {
			const wrapper = render_root_wrapper(self);
			self.node = wrapper
			return self.node
		}
		// common case
		const wrapper = render_wrapper(self)

	// ID COLUMN . id column content
		const id_column_node = render_id_column({
			self	: self,
			wrapper	: wrapper
		})
		wrapper.appendChild(id_column_node)

	// ELEMENTS CONTAINER . elements container and ts_line (term, buttons, indexations, etc.)
		const caller_model_style = self.caller?.model
			? ' ' + self.caller?.model
			: ''
		const elements_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'elements_container' + caller_model_style,
			data_set		: {role : 'elements_container'},
			parent			: wrapper
		})
		// ts_line_node is rendered at end for performance

	// DATA CONTAINER . elements data container
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'data_container',
			data_set		: {role : 'data_container'},
			parent			: wrapper
		})

	// INDEXATIONS CONTAINER
		const indexations_container_id = 'u' + self.section_tipo + '_' + self.section_id +'_'+ (new Date()).getTime()
		ui.create_dom_element({
			element_type	: 'div',
			id				: indexations_container_id,
			class_name		: 'indexations_container hide',
			parent			: wrapper
		})

	// ND CONTAINER
		if ( is_descriptor===true ) {
			ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'nd_container hide',
				data_set		: {role : 'nd_container'},
				parent			: wrapper
			})
		}

	// CHILDREN CONTAINER
		if ( is_descriptor===true ) {
			if (self.children_container) {
				// Use already calculated children_container node
				wrapper.appendChild(self.children_container)
			}else{
				const children_container_class_name = 'children_container js_first_load'
				const children_container = ui.create_dom_element({
					element_type	: 'div',
					class_name		: children_container_class_name,
					parent			: wrapper
				})
				// set pointer
				self.children_container = children_container
			}
		}//end if (is_descriptor===true)

	// LIST_THESAURUS_ELEMENTS > elements_container
		const ts_line_node = render_ts_line({
			self						: self,
			indexations_container_id	: indexations_container_id,
			show_arrow_opened			: false,
			is_descriptor				: is_descriptor,
			wrapper						: wrapper
		})
		requestAnimationFrame(
			() => {
				elements_container.appendChild(ts_line_node)
			}
		);

	// Fix DOM node wrapper
	self.node = wrapper


	return wrapper
}//end list



/**
* RENDER_CHILDREN
* Get the JSON data from the server. When data is loaded, render DOM element
* Data is built from parent node info (current object section_tipo and section_id)
* @param HTMLElement children_element
* @return promise
* 	Resolve bool true
*/
export const render_children = async function(options) {

	const self = this
	if (!self) {
		console.error('Invalid call to self from render_children:', this);
		return false
	}

	// options
		const {
			clean_children_container = false,
		} = options;

	// Validate essential data
		const ar_children_data = self.children_data?.ar_children_data
		if (!ar_children_data) {
			console.warn("[render_children] Error: Children data is missing or malformed.");
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
		const pagination = self.children_data.pagination || {}
		// Is paginated resolution
		const is_paginated = Boolean(
			(pagination.total && pagination.limit) &&
			(pagination.total > pagination.limit) &&
			((pagination.offset + pagination.limit) < pagination.total)
		);

	// Build DOM elements iterating ar_children_data
	// build_ts_list from children data
		render_children_list({
			self			: self,
			is_paginated	: is_paginated
		});

	// pagination
		if (is_paginated) {
			dd_request_idle_callback(
				() => {
					requestAnimationFrame(
						() => {
							render_ts_pagination({
								self				: self,
								children_container	: children_container,
								pagination			: pagination
							})
						}
					)
				}
			);
		}

	// Removes arrow spinner if already exists
		const arrow_icon = self.node.querySelector('.arrow_spinner');
		if (arrow_icon) {
			arrow_icon.classList.remove('arrow_spinner');
		}


	return true
}//end render_children



/**
* RENDER_CHILDREN_LIST
* Render a list of child nodes (child containers)
* @param object options
* {
* 	self: ts_object instance
* 	parent_nd_container: string|null
*	is_paginated: bool
* }
* @return bool
*/
const render_children_list = async function(options) {

	// options
		const self			= options.self
		const is_paginated	= options.is_paginated

	// short vars
		const ar_children_data		= self.children_data.ar_children_data
		const children_container	= self.children_container

	// nd_container
		let parent_nd_container = null
		if (self.is_root_node) {
			// Root nodes do not have a container for no descriptors.
			parent_nd_container = children_container
		}else{
			const wrapper_children		= children_container.parentNode.children
			const wrapper_children_len	= wrapper_children.length
			for (let i = wrapper_children_len - 1; i >= 0; i--) {
				if (wrapper_children[i].dataset.role==='nd_container') {
					parent_nd_container = wrapper_children[i];
					break
				}
			}
			if (!parent_nd_container) {
				console.log('self:', self);
				throw new Error("[render_children_list] The parent_nd_container could not be found.");
			}
			// Clean parent_nd_container always
			while (parent_nd_container && parent_nd_container.hasChildNodes()) {
				parent_nd_container.removeChild(parent_nd_container.lastChild);
			}
		}

	// children_number
	// It is used as base to set the correct order when pagination is present
	// The 'virtual_order' sums children_number + array key + 1 to create a continuous sequence
	// It is necessary to get from real DOM nodes because the pagination loads blocks or records.
	const children_number = is_paginated
		? ([...children_container.childNodes].filter(el => el.classList.contains('wrap_ts_object')).length || 0)
		: 0

	let counter = 0
	const ar_children_data_len = ar_children_data.length
	for (let i = 0; i < ar_children_data_len; i++) {

		const item = ar_children_data[i]

		const virtual_order = item.is_descriptor
			? children_number + counter + 1
			: counter + 1

		// Creates an ts_object instance for each child
		const ts_object_instance = new ts_object()
		ts_object_instance.init({
			thesaurus_mode				: self.thesaurus_mode,
			caller						: self,
			linker						: self.linker, // usually a portal component instance
			section_tipo				: item.section_tipo,
			section_id					: item.section_id,
			children_tipo				: item.children_tipo,
			target_section_tipo			: self.target_section_tipo,
			is_descriptor				: item.is_descriptor,
			is_root_node				: false,
			virtual_order				: virtual_order,
			ar_elements					: item.ar_elements,
			has_descriptor_children		: item.has_descriptor_children,
			// permissions
			permissions_button_delete	: item.permissions_button_delete,
			permissions_button_new		: item.permissions_button_new,
			permissions_indexation		: item.permissions_indexation
		})

		const node = await ts_object_instance.render()

		const parent_node = item.is_descriptor
			? children_container
			: parent_nd_container

		requestAnimationFrame(
			() => {
				parent_node.appendChild( node )
			}
		);

		if (item.is_descriptor) {
			// update virtual_order counter
			counter++;
		}
	}//end for (let i = 0; i < ar_childrens_data_len; i++)


	return true
}//end render_children_list



/**
* RENDER_TS_LINE
* Render standardized complete ts line with term ans buttons
* @param object options
* {
* 	self: object,
* 	child_data: object {ar_elements:[{}], has_descriptor_children:true, is_descriptor:true, ..}
* 	indexations_container_id: string as 'uhierarchy1_245_1730621944526'
* 	show_arrow_opened: bool
*	is_descriptor: bool
*	wrapper: HTMLElement
* }
* @return DocumentFragment fragment
*/
const render_ts_line = function(options) {

	// options
		const self						= options.self
		const ar_elements				= self.ar_elements
		const indexations_container_id	= options.indexations_container_id
		const show_arrow_opened			= options.show_arrow_opened
		const is_descriptor				= options.is_descriptor
		const wrapper					= options.wrapper

	// DocumentFragment
		const fragment = new DocumentFragment()

	// LIST_THESAURUS_ELEMENTS
	// Iterate child data switch between custom  render elements (buttons, etc)
	const ar_elements_len = ar_elements.length
	for (let j = 0; j < ar_elements_len; j++) {

		const current_element = ar_elements[j]

		const class_for_all		= 'list_thesaurus_element';
		const children_dataset	= {
			tipo	: current_element.tipo,
			type	: current_element.type
		}

		switch(true) {

			// TERM
				case (current_element.type==='term'): {

					const render_handler = self.caller.model==='area_ontology'
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
					wrapper.term_node = term_node
					break;
				}

			// ND BUTTON
				case (current_element.type==='link_children_nd'): {

					// Button for non descriptor [nd]
					const element_children_nd = ui.create_dom_element({
						element_type	: 'div',
						class_name		: 'link_children_nd ' + class_for_all + ' default term nd unselectable',
						data_set		: children_dataset,
						text_node		: current_element.value,
						parent			: fragment
					})
					// mousedown event
					const mousedown_handler = (e) => {
						e.stopPropagation()

						element_children_nd.classList.add('loading')

						// toggle_nd
						self.toggle_nd(element_children_nd, e)
						.then(function(){
							element_children_nd.classList.remove('loading')
						})
					}
					element_children_nd.addEventListener('mousedown', mousedown_handler)
					break;
				}

			// ARROW ICON
				case (current_element.type==='link_children'): {
					if (self.link_children_element) {
						// Use self calculated link_children_element node
						fragment.appendChild(self.link_children_element)
					}else{
						// button arrow link children
						const link_children_element = render_link_children({
							self				: self,
							add_class			: class_for_all,
							children_dataset	: children_dataset,
							child_data_item		: current_element,
							show_arrow_opened	: show_arrow_opened,
							ar_elements			: ar_elements
						})
						fragment.appendChild(link_children_element)
						// set pointer
						// wrapper.link_children = link_children
						self.link_children_element = link_children_element
					}
					break;
				}

			// INDEXATIONS
				case (  current_element.model==='component_relation_index'
					&& !current_element.show_data): {

					const total = parseInt(current_element.count_result?.total || 0)

					if(total > 0){
						// button_show_indexations. Build button
						const button_show_indexations = ui.create_dom_element({
							element_type	: 'div',
							class_name		: class_for_all + ' button_show_indexations',
							data_set		: children_dataset,
							text_node		: current_element.value, // generates a span with the value like '<span>U:37</span>'
							parent			: fragment
						})
						// mousedown event
						const mousedown_handler = (e) => {
							e.stopPropagation()

							button_show_indexations.classList.add('loading')
							console.log('current_element:', current_element);
							console.log('self:', self);
							const uid = current_element.tipo +'_'+ self.section_tipo +'_'+ self.section_id

							const current_total = parseInt(current_element.count_result?.total || 0)

							self.show_indexations({
								uid 				: uid,
								button_obj			: button_show_indexations,
								event				: e,
								section_tipo		: self.section_tipo,
								section_id			: self.section_id,
								component_tipo		: current_element.tipo,
								target_div			: document.getElementById(indexations_container_id),
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
								button_show_indexations.classList.remove('loading')
							})
						}
						button_show_indexations.addEventListener('mousedown', mousedown_handler)
					}
					break;
				}

				case (current_element.model==='component_relation_index'
					&& current_element.show_data === 'children'): {
					// if(current_element.data_type === 'related') {

					// recursive indexations
					const button_recusive_indexations = ui.create_dom_element({
						element_type	: 'div',
						class_name		: class_for_all + ' button_show_indexations',
						data_set		: children_dataset,
						text_node		: `⇣${current_element.value}`, // generates a span with the value like '<span>U:37</span>', // generates a span with the value like '<span>U:37</span>'
						parent			: fragment
					})
					// mousedown event
					const mousedown_handler = (e) => {
						e.stopPropagation()

						button_recusive_indexations.classList.add('loading')

						self.get_children_recursive({
							section_tipo	: self.section_tipo,
							section_id		: self.section_id
						})
						.then(function(children_recursive){

							self.show_indexations({
								uid 				: `${current_element.tipo}_recursive`,
								button_obj			: button_recusive_indexations,
								event				: e,
								section_tipo		: self.section_tipo,
								section_id			: self.section_id,
								component_tipo		: current_element.tipo,
								target_div			: document.getElementById(indexations_container_id),
								value				: null,
								total				: null,
								totals_group		: current_element.count_result.totals_group,
								filter_by_locators	: children_recursive
							})
							.then(function(){
								button_recusive_indexations.classList.remove('loading')
							})
						})
					}
					button_recusive_indexations.addEventListener('mousedown', mousedown_handler)
					break;
				}

			// IMG
				case (current_element.type==='img'): {

					if(current_element.value) {

						const element_img = ui.create_dom_element({
							element_type	: 'div',
							class_name		: class_for_all + ' term_img',
							data_set		: children_dataset,
							parent			: fragment
						})
						// mousedown handler
						const mousedown_handler = (e) => {
							e.stopPropagation()

							element_img.classList.add('loading')

							self.show_component_in_ts_object(element_img, e)
							.then(function(){
								element_img.classList.remove('loading')
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

			// OTHERS
				default: {

					const current_value = current_element.value

					// Case common buttons and links
					const button_show_component = ui.create_dom_element({
						element_type	: 'div',
						class_name		: class_for_all + ' default ' + current_element.tipo,
						data_set		: children_dataset,
						text_node		: current_value, // creates a span node with the value inside
						parent 			: fragment
					})
					// mousedown event
					const mousedown_handler = (e) => {
						e.stopPropagation()

						button_show_component.classList.add('loading')

						self.show_component_in_ts_object(button_show_component, e)
						.then(()=>{
							button_show_component.classList.remove('loading')
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
				class_name		: 'list_thesaurus_element model_value' + show_models_class,
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
		const self					= options.self
		const children_container	= options.children_container
		const pagination			= options.pagination

	// button_show_more
		const button_show_more = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'button show_more',
			inner_html		: get_label.show_more || 'Show more',
			parent			: children_container
		})
		// mousedown event
		const mousedown_handler = (e) => {
			e.stopPropagation()

			// loading
			button_show_more.classList.add('arrow_spinner')

			// nodes selection
			const wrapper				= children_container.parentNode
			const elements_container	= [...wrapper.childNodes].find(el => el.classList.contains('elements_container'))

			// increase offset pagination on get children call
			pagination.offset = (pagination.offset + pagination.limit)

			const section_tipo	= wrapper.dataset.section_tipo
			const section_id	= wrapper.dataset.section_id
			const children_tipo	= wrapper.dataset.children_tipo

			// children_data - render_children_data from API
			self.get_children_data({
				section_tipo	: section_tipo,
				section_id		: section_id,
				children_tipo	: children_tipo,
				pagination		: pagination,
				children		: null
			})
			.then(function(children_data){
				if (!children_data) {
					// error case
					console.warn("[ts_object.render_children] Error, children_data is null");
					return false
				}

				// render children
				self.render_children({
					clean_children_container : false
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
* @param object options
* @return HTMLElement id_column_content
*/
const render_id_column = function(options) {

	// options
		const self = options.self

	// short vars
		const section_tipo		= self.section_tipo
		const section_id		= self.section_id
		const children_tipo		= self.children_tipo
		const is_descriptor		= self.is_descriptor
		const is_indexable		= self.is_indexable
		const children_data		= self.children_data
		const mode				= self.mode
		const order				= self.virtual_order
		const wrapper			= self.node
		const is_from_root_node	= self.caller?.caller?.type === 'area'

	const id_column_content = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'id_column_content'
	})

	switch(self.thesaurus_mode) {

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
							const response = await self.add_child({
								section_id		: section_id,
								section_tipo	: section_tipo
							})

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
								section_tipo	: section_tipo,
								section_id		: section_id,
								children_tipo	: children_tipo,
								pagination		: pagination,
								children		: null
							})
							if (!children_data) {
								// error case
								console.warn("[ts_object.render_children] Error, children_data is null");
								return false
							}

						// refresh children container
							self.render_children({
								clean_children_container : true
							})
							.then(function(result){
								// result could be an array of children_container nodes or bool false
								// Open editor in new window
								if (result) {
									// edit call
									self.edit(
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
				}//end if (self.permissions_button_new>=2) {

			// MOVE DRAG . button drag element
				if (self.permissions_button_new>=2 && is_descriptor && !is_from_root_node) {
					const dragger = ui.create_dom_element({
						element_type	: 'div',
						class_name		: 'id_column_link ts_object_drag',
						title_label		: 'drag',
						parent			: id_column_content
					})
					// mousedown event
					const mousedown_handler = (e) => {
						e.stopPropagation()
						// event_handle. set with event value
						wrapper.event_handle = e
						// activate draggable
						wrapper.draggable = true
					}
					dragger.addEventListener('mousedown', mousedown_handler)
					// mouseup event . Reverts mousedown wrapper draggable set
					const mouseup_handler = (e) => {
						e.stopPropagation()
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
				if (self.permissions_button_new>=2 && is_descriptor && mode!=='search' && !is_from_root_node) {
					const order_number = ui.create_dom_element({
						element_type	: 'a',
						class_name		: 'id_column_link ts_object_order_number',
						text_node		: order,
						parent			: id_column_content
					})
					// click event
					const click_handler = (e) => {
						e.stopPropagation()
						self.build_order_form(order_number)
					}
					order_number.addEventListener('click', click_handler)
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
					self.edit(
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
						section_tipo,
						section_id,
						false
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

	// children_dataset
		const children_dataset	= {
			tipo	: ar_elements[key].tipo,
			type	: ar_elements[key].type
		}

	// overwrite dataset (we need section_id and section_tipo to select when content is updated)
		children_dataset.section_tipo	= self.section_tipo
		children_dataset.section_id		= self.section_id

	// term_text
		const term_text = Array.isArray( ar_elements[key].value )
			? ar_elements[key].value.join(' ')
			: ar_elements[key].value

	// term_node
		const term_node = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'list_thesaurus_element term',
			data_set		: children_dataset
		})
		// fix term pointer
		self.term_node = term_node
		// click event
		const click_handler = (e) => {
			e.stopPropagation()

			if(self.thesaurus_mode==='relation'){
				return // ignore relation click
			}

			term_node.classList.add('loading')

			// show_component_in_ts_object
			self.show_component_in_ts_object(term_node, e)
			.then(function(){
				term_node.classList.remove('loading')
			})
		}
		term_node.addEventListener('click', click_handler)

		// term_text
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'term_text' + (is_descriptor ? '' : ' no_descriptor'),
			inner_html		: term_text,
			parent			: term_node
		})

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

	// id_info. Like '[hierarchy1_246]' (Term tipo )
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'id_info',
			inner_html		: '['+ self.section_tipo +'_'+ self.section_id +']',
			parent			: term_node
		})


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
		const child_data	= options.child_data
		const is_descriptor	= options.is_descriptor
		const key			= options.key // int j

	// short vars
		const section_tipo	= child_data.section_tipo
		const section_id	= child_data.section_id

	// parse parts
		const regex				= /^(.*) ([a-z]{2,}) ([0-9]+)$/gm;
		const term_regex_result	= regex.exec(child_data.ar_elements[key].value)

		// term_id . like 'dd_1'
			const term_id	= term_regex_result
				? term_regex_result[2] + term_regex_result[3]
				: section_tipo + section_id

		// term_text
			const term_text = term_regex_result
				? term_regex_result[1]
				: child_data.ts_id

	// children_dataset
		const children_dataset	= {
			tipo	: child_data.ar_elements[key].tipo[0], // use only the first item of the array (title)
			type	: child_data.ar_elements[key].type
		}

	// overwrite dataset (we need section_id and section_tipo to select when content is updated)
		children_dataset.section_tipo	= section_tipo
		children_dataset.section_id		= section_id

	// term_node
		const term_node = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'list_thesaurus_element term',
			data_set		: children_dataset
		})

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

			term_node.classList.add('loading')

			// show_component_in_ts_object
			self.show_component_in_ts_object(term_node, e)
			.then(function(){
				term_node.classList.remove('loading')
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

	// id_info. Like '[hierarchy1_246]' (Term tipo)
		const id_info = ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'id_info ontology',
			inner_html		: '['+ term_id +']',
			title			: section_tipo + ' - ' + section_id,
			data_set		: {
				section : section_tipo + ' - ' + section_id,
				term_id : '['+ term_id +']'
			},
			parent			: term_node
		})
		const click_handler_id_info = (e) => {
			e.stopPropagation()
		}
		id_info.addEventListener('mousedown', click_handler_id_info)

	// button_duplicate
		const button_duplicate = ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'button_duplicate',
			inner_html		: '<span>+</span>',
			parent			: term_node
		})
		// click event
		const click_handler_duplicate = async (e) => {
			e.stopPropagation()

			if (!confirm(get_label.sure || 'Sure?')) {
				return false
			}

			const section = await get_instance({
				model			: 'section',
				section_tipo	: section_tipo,
				section_id		: section_id
			})
			const new_section_id = await section.duplicate_section(section_id)

			// navigate to the new record
			if (new_section_id) {
				// update parent
				if(SHOW_DEBUG===true) {
					console.log('Created new_section_id:', new_section_id);
				}
				const callback = () => {
					dd_request_idle_callback(
						() => {
							const term_node = document.querySelector('.list_thesaurus_element[data-type="term"][data-section_tipo="'+section_tipo+'"][data-section_id="'+new_section_id+'"]');
							if (term_node) {
								self.hilite_element(term_node)
							}
						}
					)
				}
				// refresh wrap avoiding hilite
				self.refresh_element(section_tipo, section_id, false, callback)
			}
		}
		button_duplicate.addEventListener('click', click_handler_duplicate)


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
			data_set		: dataset,
			// id				: self.id
		})
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

	// Fix DOM node
	self.node = wrap_ts_object


	return wrap_ts_object
}//end render_wrapper



/**
* RENDER_ROOT_WRAPPER
* Creates the first level nodes for root terms
* @return HTMLElement hierarchy_wrapper
*/
const render_root_wrapper = function (self) {

	// options
		const section_tipo				= self.section_tipo
		const section_id				= self.section_id
		// const children_tipo			= self.children_tipo
		const target_section_tipo	= self.target_section_tipo

	// dataset
		const dataset = {
			section_id		: section_id,
			section_tipo	: section_tipo,
			id				: self.id
		}

	// hierarchy_wrapper (hierarchy_root_node)
		const hierarchy_wrapper = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'wrap_ts_object hierarchy_root_node ' + target_section_tipo,
			dataset			: dataset
		})

	// children_container
		const children_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'children_container',
			parent			: hierarchy_wrapper
		})
		// hierarchy_wrapper.children_container = children_container
		self.children_container = children_container

	// fake items to preserve ts_objec->get_children structure and flow
		// // hierarchy_elements_container
		// const hierarchy_elements_container = ui.create_dom_element({
		// 	element_type	: 'div',
		// 	class_name		: 'hierarchy_elements_container',
		// 	parent			: hierarchy_wrapper
		// })
		// // link_children button
		// const link_children_element = ui.create_dom_element({
		// 	element_type	: 'div',
		// 	class_name		: 'link_children arrow_icon unselectable',
		// 	parent			: hierarchy_elements_container
		// })
		// // set pointer
		// self.link_children_element = link_children_element
		// // arrow icon
		// ui.create_dom_element({
		// 	element_type	: 'div',
		// 	class_name		: 'ts_object_children_arrow_icon',
		// 	parent			: link_children_element
		// })


	return hierarchy_wrapper
}//end render_root_wrapper



/**
* RENDER_LINK_CHILDREN
* Builds normalized link children HTMLElement
* @param object options
* {
* 	add_class : string
* 	children_dataset: object
* 	child_data_item: object
* 	show_arrow_opened: bool
* }
* @return HTMLElement link_children_element
*/
const render_link_children = function (options) {

	// options
		const self				= options.self
		const add_class			= options.add_class
		const children_dataset	= options.children_dataset
		const child_data_item	= options.child_data_item
		const show_arrow_opened	= options.show_arrow_opened

	// local_db_id. If thesaurus_mode is defined use a different status track
	// to prevent overwrite the main status of the ts_object element
		// const local_db_id = self.thesaurus_mode
		// 	? 'ts_object_status_' + self.thesaurus_mode +'_'+ self.ts_id
		// 	: 'ts_object_status_' + self.ts_id
		const local_db_id = self.id

	// Case link open children (arrow)
		const link_children_element = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'link_children ' + add_class + ' arrow_icon',
			data_set		: children_dataset
		})
		// fix
		self.link_children_element = link_children_element

	// set already calculated children list to prevent calculate it again
		link_children_element.children_list = null // child_data.children

	// link child_data pointer
		// link_children_element.child_data = child_data

	// mousedown event
		const mousedown_handler = (e) => {
			e.stopPropagation()

			self.toggle_view_children(link_children_element, e)

			// update status. Tracks element open children status
			const is_open = arrow_icon.classList.contains('ts_object_children_arrow_icon_open')
			if (is_open) {
				data_manager.set_local_db_data(
					{
						id		: local_db_id,
						value	: is_open
					}, // mixed data
					'status' // string table
				)
			}else{
				data_manager.delete_local_db_data(local_db_id, 'status')
			}
		}
		link_children_element.addEventListener('mousedown', mousedown_handler)

	// restore open arrow status
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
							requestAnimationFrame(
								() => {
									// fire mousedown event to force load children
									// Only dispatch the event if the arrow is not already open
									if (!arrow_icon.classList.contains('ts_object_children_arrow_icon_open')) {

										// check if this 'ts_id' is already open to prevent duplicity
										// in infinite loop cases
										if (self.opened_elements[self.ts_id]) {
											return
										}

										// fire mousedown_handler
										link_children_element.dispatchEvent(new MouseEvent('mousedown'));
									}
								}
							)
						}
					);
				})
			}
		);

	// arrow_icon
		const ar_class = ['ts_object_children_arrow_icon']
		if (child_data_item.value==='button show children unactive') {
			// not children case
			ar_class.push('arrow_unactive')
		}else if (show_arrow_opened===true){
			// opened case
			ar_class.push('ts_object_children_arrow_icon_open')
		}
		const arrow_icon = ui.create_dom_element({
			element_type	: 'div',
			class_name		: ar_class.join(' '),
			parent			: link_children_element
		})


	return link_children_element
}//end render_link_children



// @license-end
