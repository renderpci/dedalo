/*global get_label, Promise, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../common/js/event_manager.js'
	import {when_in_dom} from '../../common/js/events.js'
	import {data_manager} from '../../common/js/data_manager.js'
	import {create_source} from '../../common/js/common.js'
	import {clone, object_to_url_vars, open_window} from '../../common/js/utils/index.js'
	import {get_instance} from '../../common/js/instances.js'
	import {ui} from '../../common/js/ui.js'
	import {service_autocomplete} from '../../services/service_autocomplete/js/service_autocomplete.js'
	import {view_default_edit_portal} from './view_default_edit_portal.js'
	import {view_line_edit_portal} from './view_line_edit_portal.js'
	import {view_tree_edit_portal} from './view_tree_edit_portal.js'
	import {view_mosaic_edit_portal} from './view_mosaic_edit_portal.js'
	import {view_indexation_edit_portal} from './view_indexation_edit_portal.js'
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
* @return DOM node wrapper | null
*/
render_edit_component_portal.prototype.edit = async function(options) {

	const self = this

	// view
		const view	= self.context.view

	// wrapper
		switch(view) {

			case 'text':
				return view_text_list_portal.render(self, options)
				break;

			case 'line':
				return view_line_edit_portal.render(self, options)
				break;

			case 'tree':
				return view_tree_edit_portal.render(self, options)
				break;

			case 'mosaic':
				return view_mosaic_edit_portal.render(self, options)
				break;

			case 'indexation':
				return view_indexation_edit_portal.render(self, options)
				break;

			default:
				return view_default_edit_portal.render(self, options)
				break;
		}

	return null
}//end edit



/**
* RENDER_COLUMN_ID
* Generic render_column_id
* Used by view table and mosaic renders
* @param object options
* @return DocumentFragment
*/
export const render_column_id = function(options){

	// options
		const paginated_key	= options.paginated_key
		const locator		= options.locator
		const self			= options.caller
		const section_id	= options.section_id
		const section_tipo	= options.section_tipo
		const total_records	= self.total

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
				new_window.addEventListener('blur', function() {
					self.refresh({
						build_autoload : true
					})
				})

			// button_edit_click event. Subscribed to close current modal if exists (mosaic view case)
				event_manager.publish('button_edit_click', this)
		})

		// section_id
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
		const drag_node = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'drag icon',
			parent			: fragment
		})
		// drag_id
			ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'drag_section_id hide',
				text_content	: section_id,
				parent			: drag_node
			})
		// drag_icon
			// const drag_icon = ui.create_dom_element({
			// 	element_type	: 'span',
			// 	class_name		: 'drag_icon',
			// 	parent			: drag_node
			// })
		drag_node.draggable	= true
		drag_node.addEventListener('dragstart', function(e) { return on_dragstart(this, e, options)})
		drag_node.addEventListener('dragend', function(e) { return on_dragend(this, e)})
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
				text_node		: get_label.change_order_for || 'Change order for '+ section_id +' :',
				parent			: header
			})

		// body
			const body = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'sort_order content body'
			})
			const target_key_input = ui.create_dom_element({
				element_type	: 'input',
				type			: 'number',
				value			: options.paginated_key + 1,
				class_name		: 'target_key',
				parent			: body
			})
			const button_ok = ui.create_dom_element({
				element_type	: 'button',
				class_name		: 'button_sort_order success',
				text_content	: 'OK',
				parent			: body
			})

		// modal
			const modal = ui.attach_to_modal({
				header	: header,
				body	: body,
				footer	: null,
				size	: 'small' // string size big|normal|small
			})
			// set the input field active
			target_key_input.focus()
			// add events to modal options
			target_key_input.addEventListener('keyup',function(evt){
				switch(true) {
					// Enter
					case evt.code === 'Enter' || evt.code === 'NumpadEnter':
						change_order_modal()
					break;
				}
			})

		// button_ok. user click in the button
		button_ok.addEventListener('click',function(){
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
			if(paginated_key === target_key){
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
	})//end drag_node.addEventListener('dblclick', function(e)

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
* RENDER_COLUMN_COMPONENT_INFO
* Render node for use in edit
* @param object options
* @return DOM DocumentFragment
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

			const info_value = component_info.value.join(' ')

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
* @return DOM DocumentFragment
*/
export const render_column_remove = function(options) {

	// options
		const self			= options.caller
		const row_key		= options.row_key
		const paginated_key	= options.paginated_key
		const section_id 	= options.section_id
		const section_tipo	= options.section_tipo
		// const locator		= options.locator

	const fragment = new DocumentFragment()

	// button_remove
		const button_remove = ui.create_dom_element({
			element_type	: 'button',
			class_name		: 'button_remove',
			parent			: fragment
		})
		button_remove.addEventListener('click', function(e){
			e.stopPropagation()

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
					class_name		: 'body content'
				})

			// footer
				const footer = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'footer content'
				})

			// button_unlink_and_delete
				const button_unlink_and_delete = ui.create_dom_element({
					element_type	: 'button',
					class_name		: 'danger remove',
					text_content	: get_label.delete_resource_and_links || 'Delete resource and all links',
					parent			: footer
				})
				button_unlink_and_delete.addEventListener("click", function(){
					// stop if the user don't confirm
					if (!confirm(get_label.sure)) {
						return
					}
					delete_linked_record()
					unlink_record()
					delete_dataframe_record()
				})

			// button_unlink_record
				const button_unlink_record = ui.create_dom_element({
					element_type	: 'button',
					class_name 		: 'warning remove',
					text_content 	: get_label.delete_only_the_link || 'Delete only the link',
					parent			: footer
				})
				button_unlink_record.addEventListener("click", function(){
					// stop if the user don't confirm
					if (!confirm(get_label.sure)) {
						return
					}
					unlink_record()
					delete_dataframe_record()
				})

			const unlink_record = function() {
				// changed_data
				const changed_data = [Object.freeze({
					action	: 'remove',
					key		: paginated_key,
					value	: null
				})]
				// change_value (implies saves too)
				// remove the remove_dialog it's controlled by the event of the button that call
				// prevent the double confirmation
				self.change_value({
					changed_data	: changed_data,
					label			: section_id,
					refresh			: false,
					remove_dialog	: ()=>{
						return true
					}
				})
				.then(async (response)=>{
					// the user has selected cancel from delete dialog
						if (response===false) {
							// modal. Close modal if isset
							modal.on_close()
							return
						}

					// update pagination offset
						self.update_pagination_values('remove')

					// refresh
						await self.refresh({
							build_autoload : true // when true, force reset offset
						})

					// check if the caller has active a tag_id
						if(self.active_tag){
							// filter component data by tag_id and re-render content
							self.filter_data_by_tag_id(self.active_tag)
						}

					// event to update the DOM elements of the instance
						event_manager.publish('remove_element_'+self.id, row_key)

					// modal. Close modal if it's set
						modal.on_close()
				})
			}

			const delete_linked_record = async function() {

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
						filter			: false
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
				section.delete_section({
					sqo			: sqo,
					delete_mode	: 'delete_record'
				})
				.then(function(){
					modal.on_close()
				})
			}

			const delete_dataframe_record = async function() {
				// check if the show has any ddo that call to any dataframe section.
				const ddo_dataframe = self.rqo_config.show.ddo_map.find(el => el.is_dataframe === true)

				if(!ddo_dataframe){
					return
				}
				// create the instance of the section called by the row of the portal,
				// section will be in list because it's not necessary get all data, only the instance context to be deleted it.
					const instance_options = {
						model			: 'section',
						tipo			: ddo_dataframe.section_tipo,
						section_tipo	: ddo_dataframe.section_tipo,
						section_id		: section_id,
						mode			: 'list',
						lang			: self.lang,
						caller			: self,
						inspector		: false,
						filter			: false
					}
				// get the instance
					const section =	await get_instance(instance_options)

				// caller_dataframe
					const caller_dataframe = (self.caller && self.caller.model==='section_record' && self.caller.caller)
						? {
							section_tipo	: self.caller.caller.section_tipo,
							section_id		: self.caller.caller.section_id
						  }
						: null

				// call to the section and delete it
					section.delete_section({
						delete_mode			: 'delete_dataframe',
						caller_dataframe	: caller_dataframe
					})


			}

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
					button_unlink_record.focus()
					button_unlink_record.addEventListener('keyup',(e)=>{
						if(e.key === 'Enter'){
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
* @return DOM node buttons_container
*/
export const get_buttons = (self) => {

	// short vars
		const is_inside_tool		= self.caller && self.caller.type==='tool'
		const target_section		= self.target_section
		const target_section_lenght	= target_section.length
			  // sort section by label ascendant
			  target_section.sort((a, b) => (a.label > b.label) ? 1 : -1)

	// fragment
		const fragment = new DocumentFragment()

		if (is_inside_tool===true || self.context.properties.source?.mode==='external') {
			return fragment
		}

	// button_add
		const button_add = ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'button add',
			parent			: fragment
		})
		button_add.addEventListener('click', async function(){

			// target_section_tipo. to add section selector
				const target_section_tipo = target_section_lenght > 1
					? false
					: target_section[0].tipo
				if (!target_section_tipo) {
					alert("Error. Empty target_section");
					return
				}

			// source
				const source = create_source(self, null)

			// data
				const data = clone(self.data)
				data.changed_data = {
					action	: 'add_new_element',
					key		: null,
					value	: target_section_tipo
				}

			// rqo
				const rqo = {
					action	: 'save',
					source	: source,
					data	: data
				}

			// data_manager. create new record
				const api_response = await data_manager.request({
					body : rqo
				})
				// add value to current data
				if (api_response.result) {
					self.refresh()
				}else{
					console.error('Error on api_response on try to create new row:', api_response);
				}
		})

	// button_link
		const button_link = ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'button link',
			parent			: fragment
		})
		button_link.addEventListener("click", async function(e){
			e.stopPropagation()

			// const section_tipo	= select_section.value
			// const section_label	= select_section.options[select_section.selectedIndex].innerHTML;
			const section_tipo	= target_section[0].tipo;
			// const section_label	= target_section[0].label;

			// iframe
				( () => {

					const iframe_url = (tipo) => {
						return DEDALO_CORE_URL + '/page/?tipo=' + tipo + '&mode=list&menu=false&initiator=' + self.id
					}

					const iframe_container = ui.create_dom_element({element_type : 'div', class_name : 'iframe_container'})
					const iframe = ui.create_dom_element({
						element_type	: 'iframe',
						class_name		: 'fixed',
						src				: iframe_url(section_tipo),
						parent			: iframe_container
					})

					// select_section
						const select_section = ui.create_dom_element({
							element_type	: 'select',
							class_name		: 'select_section' + (target_section_lenght===1 ? ' mono' : '')
						})
						select_section.addEventListener("change", function(){
							iframe.src = iframe_url(this.value)
						})
						// options for select_section
							for (let i = 0; i < target_section_lenght; i++) {
								const item = target_section[i]
								ui.create_dom_element({
									element_type	: 'option',
									value			: item.tipo,
									inner_html		: item.label + " [" + item.tipo + "]",
									parent			: select_section
								})
							}

					// header label
						const header = ui.create_dom_element({
							element_type	: 'span',
							inner_html		: get_label.seccion,
							class_name		: 'label'
						})

					// header custom
						const header_custom = ui.create_dom_element({
							element_type	: 'div',
							class_name		: 'header_custom'
						})
						header_custom.appendChild(header)
						header_custom.appendChild(select_section)

					// fix modal to allow close later, on set value
						self.modal = ui.attach_to_modal({
							header	: header_custom,
							body	: iframe_container,
							footer	: null,
							size	: 'big'
						})

				})()
				return
		})

	// button tree terms selector
		if( self.rqo_config.show.interface &&
			self.rqo_config.show.interface.button_tree &&
			self.rqo_config.show.interface.button_tree=== true){
			const button_tree_selector = ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'button gear',
				parent			: fragment
			})
			// add listener to the select
			button_tree_selector.addEventListener('mouseup',function(){

			})
		}

	// button_update_data_external
		if( self.rqo_config.show.interface &&
			self.rqo_config.show.interface.button_external &&
			self.rqo_config.show.interface.button_external === true){

			// button_update data external
				const button_update_data_external = ui.create_dom_element({
					element_type	: 'span',
					class_name		: 'button sync',
					parent			: fragment
				})
				button_update_data_external.addEventListener("click", async function(){
					const source = self.rqo_config.show.find(item => item.typo === 'source')
					source.build_options = {
						get_dato_external : true
					}
					const built = await self.build(true)
					// render
					if (built) {
						self.render({render_level : 'content'})
					}
				})
		}

	// buttons tools
		if (!is_inside_tool && self.mode==='edit') {
			ui.add_tools(self, fragment)
		}

	// buttons container
		const buttons_container = ui.component.build_buttons_container(self)
			  // buttons_container.appendChild(fragment)

	// buttons_fold (allow sticky position on large components)
		const buttons_fold = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'buttons_fold',
			parent			: buttons_container
		})
		buttons_fold.appendChild(fragment)


	return buttons_container
}//end get_buttons



/**
* ACTIVATE_AUTOCOMPLETE
* Shared across views
* Activate service autocomplete. Enable the service_autocomplete when the user do click
* @param object self
* @param DOM node wrapper
* @return bool
*/
export const activate_autocomplete = async function(self, wrapper) {

	if(self.autocomplete!==false && self.autocomplete_active!==undefined && self.autocomplete_active===false){

		// set rqo
			self.rqo_search	= self.rqo_search || await self.build_rqo_search(self.rqo_config, 'search')

		self.autocomplete = new service_autocomplete()
		await self.autocomplete.init({
			caller		: self,
			wrapper		: wrapper,
			properties	: self.context.properties.service_autocomplete || null
		})

		self.autocomplete_active = true
		// self.autocomplete.search_input.focus()
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
* @return DOM node content_data
*/
export const build_header = function(columns_map, ar_section_record, self) {

	// build using common ui builder
		const list_header_node = ui.render_list_header(columns_map, self)

	// hide list_header_node if no records found
		if (ar_section_record.length<1) {
			list_header_node.classList.add("hide")
		}

	return list_header_node;
}//end build_header



/**
* RENDER_REFERENCES
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
				button_link.addEventListener("click", function(e){
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
	}//end for


	return fragment
}//end render_references
