// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, get_current_url_vars */
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'
	import {when_in_dom} from '../../common/js/events.js'
	import {render_relation_list} from '../../section/js/render_common_section.js'
	import {ts_object} from './ts_object.js'



/**
* RENDER_TS_LINE
* Render standard complete ts line with term ans buttons
* @param object options
* @return DOM DocumentFragment
*/
export const render_ts_line = function(options) {

	// options
		const self						= options.self
		const child_data				= options.child_data
		const indexations_container_id	= options.indexations_container_id
		const show_arrow_opened			= options.show_arrow_opened
		const is_descriptor				= options.is_descriptor

	// DocumentFragment
		const fragment = new DocumentFragment()

	// LIST_THESAURUS_ELEMENTS
	// Custom elements (buttons, etc)
	const child_data_len = child_data.ar_elements.length
	for (let j = 0; j < child_data_len; j++) {

		const class_for_all		= 'list_thesaurus_element';
		const children_dataset	= {
			tipo	: child_data.ar_elements[j].tipo,
			type	: child_data.ar_elements[j].type
		}

		switch(true) {

			// TERM
			case (child_data.ar_elements[j].type==='term'): {

				const term_node = render_term({
					self			: self,
					child_data		: child_data,
					is_descriptor	: is_descriptor,
					key				: j
				})
				fragment.appendChild(term_node)
				break;
			}

			// ND
			case (child_data.ar_elements[j].type==='link_children_nd'): {

				const element_children_nd = ui.create_dom_element({
					element_type	: 'div',
					class_name		: class_for_all + ' default term nd',
					data_set		: children_dataset,
					text_node		: child_data.ar_elements[j].value,
					parent			: fragment
				})

				const fn_child_nd_click = function(e) {
					e.stopPropagation()

					element_children_nd.classList.add('loading')

					// toggle_nd
					self.toggle_nd(element_children_nd, e)
					.then(function(){
						element_children_nd.classList.remove('loading')
					})
				}
				element_children_nd.addEventListener('mousedown', fn_child_nd_click)
				break;
			}

			// ARROW ICON
			case (child_data.ar_elements[j].type==='link_children'): {

				// button wrapper
					// Case link open children (arrow)
					const element_link_children = ui.create_dom_element({
						element_type	: 'div',
						class_name		: class_for_all + ' arrow_icon',
						data_set		: children_dataset,
						parent			: fragment
					})
					element_link_children.addEventListener('mousedown', (e)=>{
						e.stopPropagation()
						self.toggle_view_children(element_link_children, e)
					})

				// arrow_icon
					const ar_class = ['ts_object_children_arrow_icon']
					if (child_data.ar_elements[j].value==='button show children unactive') {
						// not children case
						ar_class.push('arrow_unactive')
					}else if (show_arrow_opened===true){
						// opened case
						ar_class.push('ts_object_children_arrow_icon_open')
					}
					ui.create_dom_element({
						element_type	: 'div',
						class_name		: ar_class.join(' '),
						parent			: element_link_children
					})
				break;
			}

			// INDEXATIONS AND STRUCTURATIONS
			case (child_data.ar_elements[j].model==='component_relation_index'
				&& !child_data.ar_elements[j].show_data): {

				// if (   child_data.ar_elements[j].tipo==='hierarchy40' && child_data.permissions_indexation>=1
				// 	|| child_data.ar_elements[j].tipo==='ww34' && child_data.permissions_indexation>=1
				// 	|| child_data.ar_elements[j].tipo==='hierarchy91' && child_data.permissions_structuration>=1
				// 	) {
				const total = parseInt( child_data.ar_elements[j].count_result.total )

				if(total > 0){
					// button_show_indexations. Build button
					const button_show_indexations	= ui.create_dom_element({
						element_type	: 'div',
						class_name		: class_for_all + ' button_show_indexations',
						data_set		: children_dataset,
						text_node		: child_data.ar_elements[j].value, // generates a span with the value like '<span>U:37</span>'
						parent			: fragment
					})
					button_show_indexations.addEventListener('mousedown', (e)=>{
						e.stopPropagation()

						button_show_indexations.classList.add('loading')

						self.show_indexations({
							uid 				: child_data.ar_elements[j].tipo,
							button_obj			: button_show_indexations,
							event				: e,
							section_tipo		: child_data.section_tipo,
							section_id			: child_data.section_id,
							component_tipo		: child_data.ar_elements[j].tipo,
							target_div			: document.getElementById(indexations_container_id),
							value				: null,
							total				: parseInt( child_data.ar_elements[j].count_result.total ),
							totals_group		: child_data.ar_elements[j].count_result.totals_group,
							filter_by_locators	: [{
								section_tipo	: child_data.section_tipo,
								section_id		: child_data.section_id,
								tipo			: child_data.ar_elements[j].tipo
							}]
						})
						.then(function(){
							button_show_indexations.classList.remove('loading')
						})
					})
				}
				break;
			}
			case (child_data.ar_elements[j].model==='component_relation_index'
				&& child_data.ar_elements[j].show_data === 'children'): {
				// if(child_data.ar_elements[j].data_type === 'related') {

					// recursive indexations
						const button_recusive_indexations = ui.create_dom_element({
							element_type	: 'div',
							class_name		: class_for_all + ' button_show_indexations',
							data_set		: children_dataset,
							text_node		: `⇣${child_data.ar_elements[j].value}`, // generates a span with the value like '<span>U:37</span>', // generates a span with the value like '<span>U:37</span>'
							parent			: fragment
						})
						button_recusive_indexations.addEventListener('mousedown', (e)=>{
							e.stopPropagation()

							button_recusive_indexations.classList.add('loading')

							self.get_children_recursive({
								section_tipo	: child_data.section_tipo,
								section_id		: child_data.section_id
							})
							.then(function(children_recursive){

								self.show_indexations({
									uid 				: `${child_data.ar_elements[j].tipo}_recursive`,
									button_obj			: button_recusive_indexations,
									event				: e,
									section_tipo		: child_data.section_tipo,
									section_id			: child_data.section_id,
									component_tipo		: child_data.ar_elements[j].tipo,
									target_div			: document.getElementById(indexations_container_id),
									value				: null,
									total				: null,
									totals_group		: child_data.ar_elements[j].count_result.totals_group,
									filter_by_locators	: children_recursive
								})
								.then(function(){
									button_recusive_indexations.classList.remove('loading')
								})
							})
						})

				break;
			}

			// IMG
			case (child_data.ar_elements[j].type==='img'): {

				if(child_data.ar_elements[j].value) {

					const element_img = ui.create_dom_element({
						element_type	: 'div',
						class_name		: class_for_all + ' term_img',
						data_set		: children_dataset,
						parent			: fragment
					})
					element_img.addEventListener('mousedown', (e)=>{
						e.stopPropagation()

						element_img.classList.add('loading')

						self.show_component_in_ts_object(element_img, e)
						.then(function(){
							element_img.classList.remove('loading')
						})
					})
					// image
					ui.create_dom_element({
						element_type	: 'img',
						src				: child_data.ar_elements[j].value,
						parent			: element_img
					})
				}
				break;
			}

			// OTHERS
			default: {

				const current_value = child_data.ar_elements[j].value

				// Case common buttons and links
				const element_show_component = ui.create_dom_element({
					element_type	: 'div',
					class_name		: class_for_all + ' default',
					data_set		: children_dataset,
					text_node		: current_value, // creates a span node with the value inside
					parent 			: fragment
				})
				element_show_component.addEventListener('mousedown', (e)=>{
					e.stopPropagation()

					element_show_component.classList.add('loading')

					self.show_component_in_ts_object(element_show_component, e)
					.then(function(){
						element_show_component.classList.remove('loading')
					})
				})
				break;
			}
		}//end switch(true)
	}//end for (var j = 0; j < ch_len; j++)


	return fragment
}//end render_ts_line



/**
* RENDER_TS_PAGINATION
* Render pagination button with events
* @param object options
* @return DOM button_show_more
*/
export const render_ts_pagination = function(options) {

	// options
		const children_container	= options.children_container
		const pagination			= options.pagination

	// button_show_more
		const button_show_more = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'button show_more',
			inner_html		: get_label.show_more || 'Show more',
			parent			: children_container
		})
		button_show_more.addEventListener('mousedown', function(e) {
			e.stopPropagation()

			// loading
			button_show_more.classList.add('arrow_spinner')

			// nodes selection
			const wrapper			= children_container.parentNode
			const elements_container= [...wrapper.childNodes].find(el => el.classList.contains('elements_container'))
			const children_element	= [...elements_container.childNodes].find(el => el.classList.contains('arrow_icon'))

			// increase offset pagination on get children call
			pagination.offset = (pagination.offset + pagination.limit)

			// render children
			ts_object.get_children(
				children_element,
				pagination, // object|null pagination
				false // bool clean_children_container
			)
			.then(function(){
				button_show_more.remove()
			})
		})//end click


	return button_show_more
}//end render_ts_pagination



/**
* RENDER_CHILDREN_LIST
* Render a list of child nodes
* @param object options
* @return array ar_children_c
*/
export const render_children_list = function(options) {

	// options
		const self							= options.self
		const ar_children_data				= options.ar_children_data
		const node_type						= options.node_type
		let next_node_type					= options.next_node_type
		const target_section_tipo			= options.target_section_tipo
		const children_container			= options.children_container
		const parent_nd_container			= options.parent_nd_container
		const children_container_is_loaded	= options.children_container_is_loaded
		const show_arrow_opened				= options.show_arrow_opened
		const mode							= options.mode

	const ar_children_c = []

	const ar_children_data_len = ar_children_data.length
	for (let i = 0; i < ar_children_data_len; i++) {

		// ch_len. Calculated once. Used in various calls
			// const ch_len = ar_children_data[i].ar_elements.length

		// is_descriptor element is descriptor check
			const is_descriptor = ar_children_data[i].is_descriptor

		// is_indexable element is index-able check
			const is_indexable = ar_children_data[i].is_indexable

		// wrap_ts_object . ts_object wrapper
			if (node_type==='hierarchy_node') {
				next_node_type = 'thesaurus_node'
			}

			// dataset
				const current_section_id	= ar_children_data[i].section_id
				const current_section_tipo	= ar_children_data[i].section_tipo
				const dataset = {
					section_tipo	: current_section_tipo,
					section_id		: current_section_id,
					node_type		: next_node_type
				}
				if (target_section_tipo) {
					dataset.target_section_tipo = target_section_tipo
				}

			const wrap_ts_object = ui.create_dom_element({
				element_type	: 'div',
				parent			: is_descriptor===true ? children_container : parent_nd_container,
				class_name		: is_descriptor===true ? "wrap_ts_object" : "wrap_ts_object wrap_ts_object_nd",
				data_set		: dataset,
				draggable		: true
			})
			// drag events attach
				if (is_descriptor===true) {
					// dragstart event
					wrap_ts_object.addEventListener('dragstart', self.on_dragstart)
					// dragend event
					wrap_ts_object.addEventListener('dragend', self.on_drag_end)
					// drop event
					wrap_ts_object.addEventListener('drop', self.on_drop)
					// dragover event
					wrap_ts_object.addEventListener('dragover', self.on_dragover)
					// dragleave
					wrap_ts_object.addEventListener("dragleave", self.on_dragleave)
				}

		// ID COLUMN . id column content
			const id_column_node = render_id_column({
				self			: self,
				section_tipo	: current_section_tipo,
				section_id		: current_section_id,
				node_type		: node_type,
				is_descriptor	: is_descriptor,
				is_indexable	: is_indexable,
				children_data	: ar_children_data[i],
				mode			: mode,
				key				: i
			})
			wrap_ts_object.appendChild(id_column_node)

		// ELEMENTS CONTAINER . elements container
			const elements_container = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'elements_container',
				data_set		: {role : 'elements_container'},
				parent			: wrap_ts_object
			})

		// DATA CONTAINER . elements data container
			ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'data_container',
				data_set		: {role : 'data_container'},
				parent			: wrap_ts_object
			})

		// INDEXATIONS CONTAINER
			const indexations_container_id = 'u' + ar_children_data[i].section_tipo + '_' + ar_children_data[i].section_id +'_'+ (new Date()).getTime()
			ui.create_dom_element({
				element_type	: 'div',
				id				: indexations_container_id,
				class_name		: 'indexations_container hide',
				parent			: wrap_ts_object
			})

		// ND CONTAINER
			if (is_descriptor===true && node_type!=='hierarchy_node') {
				ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'nd_container',
					data_set		: {role : 'nd_container'},
					parent			: wrap_ts_object
				})
			}

		// CHILDREN CONTAINER . children container
			if (is_descriptor===true) {
				const children_c_class_name = (children_container_is_loaded===true)
					? 'children_container'
					: 'children_container js_first_load'
				const children_c = ui.create_dom_element({
					element_type	: 'div',
					class_name		: children_c_class_name,
					data_set		: {
						role		:'children_container',
						section_id	: ar_children_data[i].section_id
					},
					parent			: wrap_ts_object
				})
				// Fix current main_div
				// Important. Fix global var self.current_main_div used by search to parse results
				self.current_main_div = children_c

				// Add to ar_children_c
				ar_children_c.push(children_c)
			}//end if (is_descriptor===true)

		// LIST_THESAURUS_ELEMENTS
			// const ts_line_node = build_ts_line( ar_children_data[i], indexations_container_id )
			const ts_line_node = render_ts_line({
				self						: self,
				child_data					: ar_children_data[i],
				indexations_container_id	: indexations_container_id,
				show_arrow_opened			: show_arrow_opened,
				is_descriptor				: is_descriptor
			})
			elements_container.appendChild(ts_line_node)
	}//end for (let i = 0; i < ar_childrens_data_len; i++)


	return ar_children_c
}//end render_children_list



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
		const self			= options.self
		const section_tipo	= options.section_tipo
		const section_id	= options.section_id
		const node_type		= options.node_type
		const is_descriptor	= options.is_descriptor
		const is_indexable	= options.is_indexable
		const children_data	= options.children_data
		const mode			= options.mode
		const key			= options.key

	const id_column_content = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'id_column_content'
	})

	switch(self.thesaurus_mode) {

		case 'relation': {
			// hierarchy_node cannot be used as related  and not index-able too
			if (node_type==='hierarchy_node' || is_indexable===false) break;

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
				link_related.addEventListener('click', (e)=>{
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
				})
			// related icon
				ui.create_dom_element({
					element_type	: 'span',
					class_name		: 'button arrow_link', // ts_object_add_icon
					parent			: link_related
				})
			break;
		}

		default: {

			// ADD . button + add element
				if (children_data.permissions_button_new>=2) {
					if(is_descriptor===true) {
						const link_add = ui.create_dom_element({
							element_type	: 'a',
							class_name		: 'id_column_link ts_object_add',
							title_label		: 'add',
							parent			: id_column_content
						})
						link_add.addEventListener('click', function(e){
							e.stopPropagation()

							// mode set in dataset
								this.dataset.mode = (node_type==='hierarchy_node') ? "add_child_from_hierarchy" : "add_child"

							// add_child
								self.add_child(this)
								.then(function(response){

									// response is an object as
									// {
									// 	API response ...
									// 	result: 40
									//  button_obj: a.id_column_link.ts_object_add
									// 	wrap: div.wrap_ts_object
									// }

									// vars from response
										// new_section_id . Generated as response by the trigger add_child
											const new_section_id 	= response.result
										// section_tipo. When dataset target_section_tipo exists, is hierarchy_node. Else is normal node
											const section_tipo 	  	= response.wrap.dataset.target_section_tipo || response.wrap.dataset.section_tipo
										// button_obj. button plus that user clicks
											const button_obj 		= response.button_obj
										// children_element. list_thesaurus_element of current wrapper
											const children_element 	= self.get_link_children_from_wrap(response.wrap)
											if(!children_element) {
												return console.error("[ts_object.add_child] Error on find children_element 'link_children'");
											}

									// refresh children container
										self.get_children(
											children_element, // current node arrow (is the father of the new created item)
											null, // object|null pagination
											true // bool clean_children_container
										)
										.then(function(result){
											// result could be an array of children_container nodes or bool false
											// Open editor in new window
											if (result) {
												self.edit(button_obj, null, new_section_id, section_tipo)
											}
										})
								})
						})//end link_add.addEventListener("click", function(e)

						// add_icon_link_add
							ui.create_dom_element({
								element_type	: 'div',
								class_name		: 'ts_object_add_icon',
								parent			: link_add
							})
					}//if(is_descriptor===true)
				}//end if (children_data.permissions_button_new>=2) {

			// MOVE DRAG . button drag element
				if (children_data.permissions_button_new>=2) {
					if(is_descriptor===true) {
						const link_drag = ui.create_dom_element({
							element_type	: 'div',
							class_name		: 'id_column_link ts_object_drag',
							title_label		: 'drag',
							parent			: id_column_content
						})
						link_drag.addEventListener('mousedown', (e)=>{
							e.stopPropagation()
							self.on_drag_mousedown(e)
						})
						// drag icon
						ui.create_dom_element({
							element_type	: 'div',
							class_name		: 'ts_object_drag_icon',
							parent			: link_drag
						})
					}//if(is_descriptor===true)
				}

			// DELETE . button delete element
				if (children_data.permissions_button_delete>=2) {
					const link_delete = ui.create_dom_element({
						element_type	: 'a',
						class_name		: 'id_column_link ts_object_delete',
						title_label		: 'delete',
						parent			: id_column_content
					})
					// click event
					link_delete.addEventListener('click', (e) =>{
						e.stopPropagation()
						// delete record using wrapper data
						render_delete_record_dialog({
							self					: self,
							section_id				: section_id,
							section_tipo			: section_tipo,
							has_descriptor_children	: children_data.has_descriptor_children
						})
					})
					// delete icon
					ui.create_dom_element({
						element_type    : 'div',
						class_name		: 'ts_object_delete_icon',
						parent			: link_delete
					 })
				}//end if (children_data.permissions_button_delete>=2)

			// ORDER number element
				if (children_data.permissions_button_new>=2) {
					if(is_descriptor===true && node_type!=='hierarchy_node' && mode!=='search') {
						// var event_function = [{'type':'click','name':'ts_object.build_order_form'}];
						const order_number = ui.create_dom_element({
							element_type	: 'a',
							class_name		: 'id_column_link ts_object_order_number',
							text_node		: key + 1,
							parent			: id_column_content
						})
						order_number.addEventListener('click', (e)=>{
							e.stopPropagation()
							self.build_order_form(order_number)
						})
					}//if(is_descriptor===true && node_type!=='hierarchy_node')
				}

			// EDIT . button edit element
				//if (node_type!=='hierarchy_node') {
				// var event_function 		= [{'type':'click','name':'ts_object.edit'}];
				const link_edit = ui.create_dom_element({
					element_type	: 'a',
					class_name		: 'id_column_link ts_object_edit',
					title_label		: 'edit',
					parent			: id_column_content
				})
				link_edit.addEventListener('mousedown', (e)=>{
					e.stopPropagation()
					self.edit(
						link_edit,
						e,
						children_data.section_id,
						children_data.section_tipo
					)
				})
				// section_id number
				ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'ts_object_section_id_number',
					text_node		: children_data.section_id,
					parent			: link_edit
				})
				// edit icon
				ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'ts_object_edit_icon',
					parent			: link_edit
				})
				//}//end if (node_type!=='hierarchy_node')
		}
	}//end switch(ts_object.thesaurus_mode)


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
			return
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
					ts_object.refresh_element(section_tipo, section_id)

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
				setTimeout(function(){
					button_delete.focus()
					button_delete.classList.add('focus')
				}, 100)
				button_delete.addEventListener('keyup', (e)=>{
					e.preventDefault()
					if(e.key==='Enter'){
						console.log('button_delete:', button_delete);
						// button_delete.click()
					}
				})
			}
			// when the modal will be ready in DOM fire the function to attack the event
			when_in_dom(button_delete, focus_the_button)
	}

	// modal
		const modal = ui.attach_to_modal({
			header		: header,
			body		: body,
			footer		: footer,
			size		: 'normal', // string size small|big|normal
			callback	: (dd_modal) => {
				dd_modal.modal_content.style.width = '50rem'
				dd_modal.modal_content.style.maxWidth = '100%'
			}
		})

	// self.delete(link_delete)

}//end render_delete_record_dialog



/**
* RENDER_TERM
* Creates the term nodes like:
* <div class="list_thesaurus_element term" data-tipo="hierarchy25" data-type="term" data-section_tipo="aa1" data-section_id="1">
*  <span class="term_text">Social Anthropology</span>
*  <span class="id_info"> [aa1_1]</span>
* </div>
* @param object options
* @return HTMLElement term_node
*/
const render_term = function(options) {

	// options
		const self			= options.self
		const child_data	= options.child_data
		const is_descriptor	= options.is_descriptor
		const key			= options.key // int j

	// children_dataset
		const children_dataset	= {
			tipo	: child_data.ar_elements[key].tipo,
			type	: child_data.ar_elements[key].type
		}

	// overwrite dataset (we need section_id and section_tipo to select when content is updated)
		children_dataset.section_tipo	= child_data.section_tipo
		children_dataset.section_id		= child_data.section_id

	// term_text
		const term_text = Array.isArray( child_data.ar_elements[key].value )
			? child_data.ar_elements[key].value.join(' ')
			: child_data.ar_elements[key].value

	// term_node
		const term_node = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'list_thesaurus_element term',
			data_set		: children_dataset
		})
		term_node.addEventListener('click', (e)=>{
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
		})
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'term_text ' + (is_descriptor ? '' : 'no_descriptor'),
			inner_html		: term_text,
			parent			: term_node
		})

	// element_to_hilite
		if (self.element_to_hilite) {
			if(		term_node.dataset.section_id == self.element_to_hilite.section_id
				&& 	term_node.dataset.section_tipo===self.element_to_hilite.section_tipo) {
				// hilite element
				setTimeout(function(){
					self.hilite_element(term_node)
				}, 200)
			}
		}

	// id_info. Like '[hierarchy1_246]' (Term terminoID )
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'id_info',
			inner_html		: ' ['+ child_data.section_tipo +'_'+ child_data.section_id +']',
			parent			: term_node // fragment
		})


	return term_node
}//end render_term



// @license-end
