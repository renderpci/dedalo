// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../common/js/event_manager.js'
	import {get_instance, get_all_instances} from '../../common/js/instances.js'
	import {when_in_dom} from '../../common/js/events.js'
	import {data_manager} from '../../common/js/data_manager.js'
	// import {create_source} from '../../common/js/common.js'
	import {clone, object_to_url_vars, open_window} from '../../common/js/utils/index.js'
	import {ui} from '../../common/js/ui.js'
	import {service_autocomplete} from '../../services/service_autocomplete/js/service_autocomplete.js'
	import {view_default_edit_portal} from './view_default_edit_portal.js'
	import {view_line_edit_portal} from './view_line_edit_portal.js'
	import {view_tree_edit_portal} from './view_tree_edit_portal.js'
	import {view_mosaic_edit_portal} from './view_mosaic_edit_portal.js'
	import {view_indexation_edit_portal} from './view_indexation_edit_portal.js'
	import {view_content_edit_portal} from './view_content_edit_portal.js'
	import {view_text_list_portal} from './view_text_list_portal.js'
	import {
		on_dragstart,
		on_dragover,
		on_dragleave,
		on_dragend,
		on_drop
	} from './drag_and_drop.js'



/**
* RENDER_EDIT_COMPONENT_PORTAL
* Manages the component's logic and appearance in client side
*/
export const render_edit_component_portal = function() {

	return true
}//end render_edit_component_portal



/**
* EDIT
* Chose the view render module to generate DOM nodes
* based on self.context.view value
* @param object options
* {
* 	render_level : string full|content_data
* }
* @return HTMLElement|null
*/
render_edit_component_portal.prototype.edit = async function(options) {

	const self = this

	// view
		const view = self.view || self.context?.view || null

	// wrapper
	switch(view) {

		case 'text':
			return view_text_list_portal.render(self, options)

		case 'line':
			return view_line_edit_portal.render(self, options)

		case 'tree':
			return view_tree_edit_portal.render(self, options)

		case 'mosaic':
			return view_mosaic_edit_portal.render(self, options)

		case 'indexation':
			return view_indexation_edit_portal.render(self, options)

		case 'content':
			return view_content_edit_portal.render(self, options)

		case 'print':
			// view print use the same view as default, except it will use read only to render content_value
			// as different view as default it will set in the class of the wrapper
			// sample: <div class="wrapper_component component_portal oh24 oh1_oh24 edit view_print disabled_component">...</div>
			// take account that to change the css when the component will render in print context
			// for print we need to use read of the content_value and it's necessary force permissions to use read only element render
			self.permissions = 1

		case 'default':
		default:
			// dynamic try
				const render_view = self.render_views.find(el => el.view===view && el.mode===self.mode)
				if (render_view) {
					const path			= render_view.path || './' + render_view.render +'.js'
					const render_method	= await import (path)
					return render_method[render_view.render].render(self, options)
				}

			return view_default_edit_portal.render(self, options)
	}
}//end edit



/**
* RENDER_COLUMN_ID
* Generic render_column_id
* Used by view table and mosaic renders
* @param object options
* @return DocumentFragment
*/
export const render_column_id = function(options) {

	// options
		const self			= options.caller
		const section_id	= options.section_id
		const section_tipo	= options.section_tipo

	// DocumentFragment
		const fragment = new DocumentFragment()

	// button_edit. component portal caller (link)
		const button_edit = ui.create_dom_element({
			element_type	: 'button',
			class_name		: 'button_edit button_view_' + self.context.view,
			parent			: fragment
		})
		button_edit.addEventListener('click', function(e){
			e.stopPropagation()

			// user_navigation event
				// const user_navigation_rqo = {
				// 	caller_id	: self.id,
				// 	source		: {
				// 		action			: 'search',
				// 		model			: 'section',
				// 		tipo			: section_tipo,
				// 		section_tipo	: section_tipo,
				// 		mode			: 'edit',
				// 		lang			: self.lang
				// 	},
				// 	sqo : {
				// 		section_tipo		: [{tipo : section_tipo}],
				// 		filter				: null,
				// 		limit				: 1,
				// 		filter_by_locators	: [{
				// 			section_tipo	: section_tipo,
				// 			section_id		: section_id
				// 		}]
				// 	}
				// }
				// event_manager.publish('user_navigation', user_navigation_rqo)

			/*
			// open a new window
				const url = DEDALO_CORE_URL + '/page/?' + object_to_url_vars({
					tipo			: section_tipo,
					section_tipo	: section_tipo,
					id				: section_id,
					mode			: 'edit',
					menu			: false
				})
				const new_window = open_window({
					url		: url,
					name	: 'record_view',
					width	: 1280,
					height	: 740
				})
				new_window.addEventListener('blur', async function() {
					await self.refresh({
						build_autoload : true
					})
					// fire window_bur event
					event_manager.publish('window_bur_'+self.id, self)
				})

			// button_edit_click event. Subscribed to close current modal if exists (mosaic view case)
				event_manager.publish('button_edit_click', this)
			*/
			self.edit_record_handler({
				section_tipo	: section_tipo,
				section_id		: section_id
			})
		})
		button_edit.addEventListener('mouseenter', function(e) {
			e.stopPropagation()

			if (drag_node.classList.contains('hide')) {
				drag_node.classList.remove('hide')
			}
		});
		button_edit.addEventListener('mouseleave', function(e) {
			e.stopPropagation()

			if (!drag_node.classList.contains('hide')) {
				drag_node.classList.add('hide')
			}
		});

		// section_id node
			const small_css = section_id.length>5 ? ' small' : ''
			ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'section_id' + small_css,
				text_content	: section_id,
				parent			: button_edit
			})

		// edit icon
			ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'button edit icon',
				parent			: button_edit
			})

	// drag and drop

	// drag_node
		const drag_node = render_drag_node(options)
		fragment.appendChild(drag_node)

	// drop_node
		const drop_node = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'drop hide',
			parent			: fragment
		})
		drop_node.addEventListener('dragover', function(e) { return on_dragover(this, e)})
		drop_node.addEventListener('dragleave', function(e) { return on_dragleave(this, e)})
		drop_node.addEventListener('drop', function(e) { return on_drop(this, e, options)})


	return fragment
}//end render_column_id



/**
* RENDER_DRAG_NODE
* @param object options
* @return HTMLElement
*/
const render_drag_node = function(options) {

	// options
		const paginated_key	= options.paginated_key
		const locator		= options.locator
		const self			= options.caller
		const section_id	= options.section_id
		const total_records	= self.total

	// drag_node
		const drag_node = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'drag icon hide'
		})
		drag_node.addEventListener('mouseenter', function(e) {
			e.stopPropagation()

			if (drag_node.classList.contains('hide')) {
				drag_node.classList.remove('hide')
			}
		});
		drag_node.addEventListener('mouseout', function(e) {
			e.stopPropagation()

			// if (!drag_node.classList.contains('hide')) {
				drag_node.classList.add('hide')
			// }
		});

	drag_node.draggable	= true
		drag_node.addEventListener('dragstart', function(e) { return on_dragstart(this, e, options)})
		drag_node.addEventListener('dragend', function(e) { return on_dragend(this, e, options)})

	drag_node.addEventListener('dblclick', function(e) {
		e.stopPropagation()

		// header
			const header = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'header'
			})
			ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'label',
				text_node		: get_label.change_order_for || 'Change order for '+ section_id,
				parent			: header
			})

		// body
			const body = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'content body'
			})
			const target_key_input = ui.create_dom_element({
				element_type	: 'input',
				type			: 'number',
				value			: options.paginated_key + 1,
				class_name		: 'target_key',
				parent			: body
			})

		// footer
			const footer = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'footer content'
			})
			// button_ok
				const button_ok = ui.create_dom_element({
					element_type	: 'button',
					class_name		: 'button_sort_order success',
					text_content	: 'OK',
					parent			: footer
				})
				button_ok.addEventListener('click', function(e){
					e.stopPropagation()
					change_order_modal()
				})
				// CHANGE_ORDER_MODAL
				// get the user data and check it to be correct before sort data
				// sort data if the new position is ok.
				const change_order_modal = function() {
					// user input data has not the array data order, the user will introduce the natural order 1,2,3,etc
					// it's necessary subtract one position to get the array position 0,1,2,etc
					const user_target_key = parseInt(target_key_input.value) -1
					// fix enter values with data boundaries,
					// the new position has to be between 0 (first array key of the data) and the last section_records (last key)
					const last_key = total_records - 1
					// check the position entered to be correct in boundaries
					const target_key = user_target_key < 0
						? 0
						: (user_target_key > last_key)
							? last_key
							: user_target_key
					// if the user enter the same position didn't nothing and close
					if(paginated_key===target_key){
						modal.close()
						return false
					}
					// change the order by the normal way
					const sort_data = {
						value		: locator,
						source_key	: paginated_key,
						target_key	: target_key
					}
					self.sort_data(sort_data)

					modal.close()
				}

		// modal
			const modal = ui.attach_to_modal({
				header		: header,
				body		: body,
				footer		: footer,
				size		: 'small', // string size big|normal|small
				minimizable	: false
			})
			// set the input field active
			target_key_input.focus()
			// add events to modal options
			target_key_input.addEventListener('keyup',function(evt){
				switch(true) {
					// Enter
					case evt.code==='Enter' || evt.code==='NumpadEnter':
						change_order_modal()
					break;
				}
			})
	})//end drag_node.addEventListener('dblclick', function(e)


	return drag_node
}//end render_drag_node



/**
* RENDER_COLUMN_COMPONENT_INFO
* Render node for use in edit
* @param object options
* @return DocumentFragment
*/
export const render_column_component_info = function(options) {

	// options
		const self 			= options.caller
		const section_id	= options.section_id
		const section_tipo	= options.section_tipo

	const fragment = new DocumentFragment()

	// component_info
		const component_info = self.datum.data.find(
			item => item.tipo==='ddinfo' &&
					item.section_id===section_id &&
					item.section_tipo===section_tipo
		)
		if (component_info) {

			const info_value = component_info.value.join(', ')

			ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'ddinfo_value',
				inner_html		: info_value,
				parent			: fragment
			})
		}

	return fragment
}//end render_column_component_info()



/**
* RENDER_COLUMN_REMOVE
* Render column_remov node
* Shared across views
* @param object options
* @return DocumentFragment
*/
export const render_column_remove = function(options) {

	// options
		const self			= options.caller
		const row_key		= options.row_key
		const paginated_key	= options.paginated_key
		const section_id	= options.section_id
		const section_tipo	= options.section_tipo

	// DocumentFragment
		const fragment = new DocumentFragment()

	// button_remove
		const button_remove = ui.create_dom_element({
			element_type	: 'button',
			class_name		: 'button_remove',
			parent			: fragment
		})
		button_remove.addEventListener('click', function(e){
			e.stopPropagation()

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

			// footer
				const footer = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'footer content'
				})

			// button_unlink_and_delete
				const display_delete_record = options.caller.view!=='indexation'
				if (display_delete_record) {
					const button_unlink_and_delete = ui.create_dom_element({
						element_type	: 'button',
						class_name		: 'danger remove',
						text_content	: get_label.delete_resource_and_links || 'Delete resource and all links',
						parent			: footer
					})
					button_unlink_and_delete.addEventListener('click', async function(e) {
						e.stopPropagation()

						// stop if the user don't confirm
						if (!confirm(get_label.sure)) {
							return
						}

						footer.classList.add('loading')

						await self.delete_linked_record({
							section_tipo	: section_tipo,
							section_id		: section_id
						})

						self.unlink_record({
							paginated_key	: paginated_key,
							row_key			: row_key,
							section_id		: section_id
						})
						.then(modal.on_close)

						self.delete_dataframe_record({
							section_id : section_id
						})

						footer.classList.remove('loading')
					})
				}

			// button_unlink_record
				const button_unlink_record = ui.create_dom_element({
					element_type	: 'button',
					class_name 		: 'warning remove',
					text_content 	: get_label.delete_only_the_link || 'Delete only the link',
					parent			: footer
				})
				button_unlink_record.addEventListener('click', function(e){
					e.stopPropagation()

					// stop if the user don't confirm
					if (!confirm(get_label.sure)) {
						return
					}

					footer.classList.add('loading')

					self.unlink_record({
						paginated_key	: paginated_key,
						row_key			: row_key,
						section_id		: section_id
					})
					.then(modal.on_close)

					self.delete_dataframe_record({
						section_id : section_id
					})

					footer.classList.remove('loading')
				})

			// modal
				const modal = ui.attach_to_modal({
					header	: header,
					body	: body,
					footer	: footer,
					size	: 'small' // string size big|normal
				})
				// when the modal will be ready in dom fire the function to attack the event
				when_in_dom(modal, focus_the_button)
				// set the default button to be fired when the modal is active
				// when the user press the Enter key in the keyboard
				// the unlink option will be fired
				function focus_the_button() {
					// set the focus to the button_unlink
					setTimeout(function(){
						button_unlink_record.focus()
						button_unlink_record.classList.add('focus')
					}, 100)
					button_unlink_record.addEventListener('keyup', (e)=>{
						if(e.key==='Enter'){
							button_unlink_record.click()
						}
					})
				}

			// data pagination offset. Check and update self data to allow save API request return the proper paginated data
				const key = parseInt(row_key)
				if (key===0 && self.data.pagination.offset>0) {
					const next_offset = (self.data.pagination.offset - self.data.pagination.limit)
					// set before exec API request on Save
					self.data.pagination.offset = next_offset>0
						? next_offset
						: 0
				}
		})

	// remove_icon
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'button delete_light icon',
			parent			: button_remove
		})


	return fragment
}//end render_column_remove()



/**
* GET_BUTTONS
* Render buttons DOM node
* @param object self instance
* @return HTMLElement buttons_container
*/
export const get_buttons = (self) => {

	// short vars
		const is_inside_tool		= self.caller && self.caller.type==='tool'
		const target_section		= self.target_section || []
		const target_section_lenght	= target_section.length
			  // sort section by label ascendant
			  target_section.sort((a, b) => (a.label > b.label) ? 1 : -1)

	// buttons container
		const buttons_container = ui.component.build_buttons_container(self)

	// buttons_fold (allow sticky position on large components)
		const buttons_fold = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'buttons_fold',
			parent			: buttons_container
		})

	// button_update_data_external
		if(self.show_interface.button_external===true) {
			// button_update data external
				const button_update_data_external = ui.create_dom_element({
					element_type	: 'span',
					class_name		: 'button sync',
					parent			: buttons_fold
				})
				button_update_data_external.addEventListener('click', fn_update_data_external)
				async function fn_update_data_external(e){
					e.stopPropagation()
					// force server data to calculate external data
					const source = self.rqo.source
					source.build_options = {
						get_dato_external : true
					}
					// const built = await self.build(true)
					// if (built) {
					// 	self.render({render_level : 'content'})
					// }
					self.refresh({
						build_autoload	: true,
						render_level	: 'content'
					})
				}
		}//end button external

	// button_add
		if(self.show_interface.button_add===true) {
			const button_add = ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'button add',
				parent			: buttons_fold
			})
			button_add.addEventListener('click', fn_add)
			async function fn_add(e){
				e.stopPropagation()

				// target_section_tipo. to add section selector
					const target_section_tipo = target_section_lenght > 1
						? false
						: target_section[0].tipo
					if (!target_section_tipo) {
						alert('Error. Empty or invalid target_section');
						return
					}

				// add_new_element
					const result = await self.add_new_element(target_section_tipo)
					if (result===true) {

						// last_value. Get the last value of the portal to open the new section
							const last_value	= self.data.value[self.data.value.length-1]
							const section_tipo	= last_value.section_tipo
							const section_id	= last_value.section_id

						// section. Create the new section instance
							const section = await get_instance({
								model			: 'section',
								mode			: 'edit',
								tipo			: section_tipo,
								section_tipo	: section_tipo,
								section_id		: section_id,
								inspector		: false,
								session_save	: false,
								session_key		: 'section_' + section_tipo + '_' + self.tipo
							})
							await section.build(true)
							const section_node = await section.render()

						// header
							const header = (get_label.new || 'New section') + ' ' + target_section[0].label

						// modal. Create a modal to attach the section node
							const modal = ui.attach_to_modal({
								header		: header,
								body		: section_node
							})
							modal.on_close = function(){
								self.refresh()
							}

						// first_ddo. Get the first ddo in ddo_map to be focused
							const first_ddo = self.request_config_object.show.ddo_map.find(el =>
								el.model !== 'component_publication' &&
								el.model !== 'component_radio_button' &&
								el.model !== 'component_info' &&
								!el.is_dataframe
							)
							if (first_ddo) {
								// instance search. Get the instance of the component that was created by the section in build-render process
									const all_instances	= get_all_instances()
									const component		= all_instances.find( el =>
										el.tipo === first_ddo.tipo &&
										el.section_tipo === section_tipo &&
										el.section_id === section_id &&
										el.parent === section_tipo
									)

								// activate component
								// If the component is ready and the section is in DOM, activate it and focus his input node.
									if(component && component.node){
										when_in_dom(component.node, function(){
											// activate the component in DOM
											ui.component.activate(component)

											// focus the input node of the component
											if(component.node.content_data[0]){
												component.node.content_data[0].querySelector('input').focus()
											}
										})
									}
							}
					}//end if (result===true)

				// remove aux items
					if (window.page_globals.service_autocomplete) {
						window.page_globals.service_autocomplete.destroy(true, true, true)
					}
			}
		}//end button_add

	// button_link
		if(self.show_interface.button_link===true) {
			const button_link = ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'button link',
				parent			: buttons_fold
			})
			button_link.addEventListener('click', fn_link)
			async function fn_link(e){
				e.stopPropagation()

				// const section_tipo	= select_section.value
				// const section_label	= select_section.options[select_section.selectedIndex].innerHTML;
				const section_tipo		= target_section[0].tipo;
				// const section_label	= target_section[0].label;

				// iframe
					( () => {

						const get_iframe_url = (tipo) => {

							const session_key = 'section_' + tipo + '_' + self.tipo

							const url_vars = object_to_url_vars({
								tipo		: tipo,
								mode		: 'list',
								session_key	: session_key, // used to save server and local DDB custom SQO
								menu		: false,
								initiator	: self.id // initiator is the caller (self)
							})

							return DEDALO_CORE_URL + '/page/?' + url_vars
						}

						// modal_body
							const iframe_container = ui.create_dom_element({
								element_type : 'div',
								class_name : 'iframe_container'
							})
							const iframe = ui.create_dom_element({
								element_type	: 'iframe',
								class_name		: 'fixed',
								src				: get_iframe_url(section_tipo),
								parent			: iframe_container
							})

						// modal_header
							// header_custom
							const header_custom = ui.create_dom_element({
								element_type	: 'div',
								class_name		: 'header_custom'
							})
							// header label
							const header = ui.create_dom_element({
								element_type	: 'span',
								inner_html		: get_label.section,
								class_name		: 'label',
								parent			: header_custom
							})

						// select_section
							const select_section = ui.create_dom_element({
								element_type	: 'select',
								class_name		: 'select_section' + (target_section_lenght===1 ? ' mono' : ''),
								parent			: header_custom
							})
							select_section.addEventListener('change', function(){
								iframe.src = get_iframe_url(this.value)
							})
							// options for select_section
								for (let i = 0; i < target_section_lenght; i++) {
									const item = target_section[i]
									ui.create_dom_element({
										element_type	: 'option',
										value			: item.tipo,
										inner_html		: item.label + ' [' + item.tipo + ']',
										parent			: select_section
									})
								}

						// fix modal to allow close later, on set value
							self.modal = ui.attach_to_modal({
								header	: header_custom,
								body	: iframe_container,
								footer	: null,
								size	: 'big'
							})

					})()
					return
			}
		}//end button_link

	// button_open_section_list (button_add)
		if(self.show_interface.button_add===true) {

			const first_section = target_section[0] || null
			if (first_section) {
				// Note that in some component_autocomplete_hi items, target_section_tipo
				// resolution could result in zero sections. Check this value to prevent
				// errors in this cases (example: oh126 in section oh1)

				const label = (SHOW_DEBUG===true)
					? `${first_section.label} [${first_section.tipo}]`
					: first_section.label

				const button_open_section_list = ui.create_dom_element({
					element_type	: 'span',
					class_name		: 'button pen',
					title			: label,
					parent			: buttons_fold
				})
				button_open_section_list.addEventListener('click', fn_click)
				function fn_click(e){
					e.stopPropagation()

					// open a new window
						const url = DEDALO_CORE_URL + '/page/?' + object_to_url_vars({
							tipo	: first_section.tipo,
							mode	: 'list',
							menu	: false
						})
						const new_window = open_window({
							url		: url,
							name	: 'section_view',
							width	: 1280,
							height	: 740
						})
						new_window.addEventListener('blur', function() {
							// refresh current instance
							self.refresh({
								build_autoload : true
							})
						})
				}//end fn_click
			}
		}

	// button tree terms selector
		if(self.show_interface.button_tree===true) {
			const button_tree_selector = ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'button gear',
				parent			: buttons_fold
			})
			// add listener to the select
			button_tree_selector.addEventListener('mouseup', function(){

			})
		}//end button_external

	// buttons tools
		if(self.show_interface.tools===true) {
			// if (!is_inside_tool && self.mode==='edit') {
				ui.add_tools(self, buttons_fold)
			// }
		}//end add tools


	return buttons_container
}//end get_buttons



/**
* ACTIVATE_AUTOCOMPLETE
* Shared across views
* Activate service autocomplete. Enable the service_autocomplete when the user do click
* @param object self
* @param HTMLElement wrapper
* @return bool
*/
export const activate_autocomplete = async function(self, wrapper) {

	// permissions check
		if (self.permissions<2) {
			return
		}

	// already active
		if (self.autocomplete_active===true) {
			self.autocomplete.show()
			// focus
			self.autocomplete.search_input.focus({preventScroll:true});
			return true
		}

	// Default source external buttons configuration,
	// if show.interface is defined in properties used the definition, else use this default
		if(self.context.properties.source?.mode==='external' && !self.request_config_object?.show?.interface) {
			self.show_interface.show_autocomplete = false
		}//end if external

	// service_autocomplete instance
		if( self.show_interface.show_autocomplete===true
			&& self.autocomplete!==false
			&& self.autocomplete_active!==undefined
			&& self.autocomplete_active===false ){

			self.autocomplete = new service_autocomplete()
			await self.autocomplete.init({
				caller			: self,
				tipo			: self.tipo,
				section_tipo	: self.section_tipo,
				request_config	: self.context.request_config,
				properties		: self.context.properties.service_autocomplete || null
			})

			await self.autocomplete.build()
			// render. Build_autocomplete_input nodes
			const autocomplete_node = await self.autocomplete.render()
			// removed attach to document 02-08-2023. see view_default_autocomplete.render()
			// document.body.appendChild(autocomplete_node)
			self.autocomplete_active = true
			// focus
			self.autocomplete.search_input.focus({preventScroll:true});
		}//end if(self.autocomplete_active!==undefined && self.autocomplete_active===false)


	return true
}//end activate_autocomplete



/**
* BUILD_HEADER
* Render portal list_header_node node ready to place it into 'list_body' node
* Note that component_info column will be added if self.add_component_info is true. That if defined
* when the component is built
* Also, note that the list_header_node is hidden if the portal records are empty for clean look
* Shared across views
* @param object columns_map
* @param array ar_section_record
* @param instance self
* @return HTMLElement list_header_node
*/
export const build_header = function(columns_map, ar_section_record, self) {

	// build using common ui builder
		const list_header_node = ui.render_list_header(columns_map, self)

	// hide list_header_node if no records found
		if (ar_section_record.length<1) {
			list_header_node.classList.add('hide')
		}

	return list_header_node;
}//end build_header



/**
* RENDER_REFERENCES
* @param array ar_references
* @return DocumentFragment
*/
export const render_references = function(ar_references) {

	const fragment = new DocumentFragment()

	// ul
		const ul = ui.create_dom_element({
			element_type	: 'ul',
			class_name		: 'references',
			parent			: fragment
		})

	// references label
		ui.create_dom_element({
			element_type	: 'div',
			inner_html		: get_label.references,
			parent			: ul
		})

	const ref_length = ar_references.length
	for (let i = 0; i < ref_length; i++) {

		const reference = ar_references[i]

		// li
			const li = ui.create_dom_element({
				element_type	: 'li',
				parent			: ul
			})
		// button_link
			const button_link = ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'button link',
				parent			: li
			})
			button_link.addEventListener('click', function(e){
				e.stopPropagation()
				window.location.href = DEDALO_CORE_URL + '/page/?tipo=' + reference.value.section_tipo + '&id='+ reference.value.section_id
				// window.open(url,'ref_edit')
			})
		// label
			const button_edit = ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'label',
				inner_html		: reference.label,
				parent			: li
			})
	}//end for (let i = 0; i < ref_length; i++)


	return fragment
}//end render_references



/**
* RENDER_DATAFRAME_TABLE
* Render column_remov node
* Shared across views
* @param object options
* @return DocumentFragment
*/
export const render_dataframe_table = async function(options) {

	// options
		const self = options.self

	// DocumentFragment
		const fragment = new DocumentFragment()

	// ddo_map
		const ddo_map			= self.request_config_object.show.ddo_map || []
		const column_dataframe	= ddo_map.find(el => el.is_dataframe===true)
		if (!column_dataframe) {
			return fragment
		}
		const section_tipo	= column_dataframe.section_tipo

	// data
		const data_item		= self.datum.data.find(el => el.section_tipo===section_tipo)
		const section_id	= data_item.section_id

	// section
		const section = await get_instance({
			model			: 'section',
			mode			: 'list',
			tipo			: section_tipo,
			section_tipo	: section_tipo,
			section_id		: section_id
		})
		await section.build(true)
		const section_node = await section.render()

	// body
		const body = ui.create_dom_element({ // string case. auto-create the body node
			element_type	: 'div',
			class_name		: 'body content'
		})
		body.appendChild(section_node)

		ui.attach_to_modal({
			header : 'Dataframe',
			body : body
		})


	return fragment
}//end render_dataframe_table



// @license-end

