/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../common/js/event_manager.js'
	import {data_manager} from '../../common/js/data_manager.js'
	import {create_source} from '../../common/js/common.js'
	// import {get_instance, delete_instance} from '../../common/js/instances.js'
	import {ui} from '../../common/js/ui.js'
	import {service_autocomplete} from '../../services/service_autocomplete/js/service_autocomplete.js'
	import {render_edit_view_table} from './render_edit_view_table.js'
	import {render_edit_view_line} from './render_edit_view_line.js'
	import {render_edit_view_tree} from './render_edit_view_tree.js'
	import {render_edit_view_mosaic} from './render_edit_view_mosaic.js'
	// import {clone, dd_console} from '../../common/js/utils/index.js'



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
* @param object options
* @return DOM node wrapper | null
*/
render_edit_component_portal.prototype.edit = async function(options) {

	const self = this

	// view
		const view	= self.context.view || 'table'

	switch(view) {

		case 'line':
			return render_edit_view_line.render(self, options)

		case 'tree':
			return render_edit_view_tree.render(self, options)

		case 'mosaic':
			return render_edit_view_mosaic.render(self, options)

		case 'table':
		default:
			return render_edit_view_table.render(self, options)
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
		const self			= options.caller
		const section_id	= options.section_id
		const section_tipo	= options.section_tipo

	const fragment = new DocumentFragment()

	// section_id
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'section_id',
			text_content	: section_id,
			parent			: fragment
		})

	// edit_button
		const edit_button = ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'button edit',
			parent			: fragment
		})
		edit_button.addEventListener("click", function(){
			const user_navigation_rqo = {
				caller_id	: self.id,
				source		: {
					action			: 'search',
					model			: 'section',
					tipo			: section_tipo,
					section_tipo	: section_tipo,
					mode			: 'edit',
					lang			: self.lang
				},
				sqo : {
					section_tipo		: [{tipo : section_tipo}],
					filter				: null,
					limit				: 1,
					filter_by_locators	: [{
						section_tipo	: section_tipo,
						section_id		: section_id,
					}]
				}
			}
			event_manager.publish('user_navigation', user_navigation_rqo)
		})

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
		const component_info = self.datum.data.find( item => item.tipo==='ddinfo' &&
															 item.section_id===section_id &&
															 item.section_tipo===section_tipo)
		if (component_info) {

			const info_value = component_info.value.join('')

			ui.create_dom_element({
				element_type	: 'span',
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

	const fragment = new DocumentFragment()

	// remove icon
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'button remove',
			dataset			: {
				key				: row_key,
				paginated_key	: paginated_key
			},
			parent			: fragment
		})

	return fragment
}// end render_column_remove()



/**
* GET_BUTTONS
* Render buttons DOM node
* @param object self instance
* @return DOM node buttons_container
*/
export const get_buttons = (self) => {

	const is_inside_tool		= self.is_inside_tool
	// const mode				= self.mode
	// const show				= self.rqo.show
	const target_section		= self.target_section
	const target_section_lenght	= target_section.length
		  // sort section by label ascendant
		  target_section.sort((a, b) => (a.label > b.label) ? 1 : -1)

	const fragment = new DocumentFragment()

	// button_add
		const button_add = ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'button add',
			parent			: fragment
		})
		button_add.addEventListener("click", async function(){

			//TO ADD SECTION SELECTOR
				const section_tipo = target_section_lenght >1
					? false
					: target_section[0].tipo


				// data_manager. create new record
				const api_response = await data_manager.prototype.request({
					body : {
						action				: 'add_new_element',
						source				: create_source(self),
						target_section_tipo	: section_tipo
					}
				})
				// add value to current data
				if (api_response.result) {
					self.refresh()
				}else{
					console.error("Error on api_response on try to create new row:", api_response);
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
					self.modal = ui.attach_to_modal(header_custom, iframe_container, null, 'big')

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
					const builded = await self.build(true)
					// render
					if (builded) {
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
* ADD_EVENTS
* Shared across views
* @return bool
*/
export const add_events = function(self, wrapper) {

	// add element, subscription to the events
	// show the add_value in the instance
		//self.events_tokens.push(
		//	event_manager.subscribe('add_element_'+self.id, add_element)
		//)
		//async function add_element(key) {
		//	self.refresh()
		//	// change the portal service to false and desactive it.
		//
		//	//if(self.portal_active===true){
		//	//	self.portal.destroy()
		//	//	self.portal_active = false
		//	//	self.portal 		 = null
		//	//}
		//
		//	//self.refresh();
		//
		//	// inset the new section_record into the ar_section_record and build the node of the new locator
		//	//ar_section_record.push(current_section_record)
		//	//const inputs_container 	= wrapper.querySelector('.inputs_container')
		//	//get_input_element(current_section_record, inputs_container)
		//}

	// subscribe to 'update_dom': if the DOM was changed by other DOM elements the value will be changed
		//self.events_tokens.push(
		//	event_manager.subscribe('update_dom_'+self.id, (value) => {
		//		// change the value of the current dom element
		//	})
		//)

	// click delegated
		wrapper.addEventListener("click", function(e){
			// e.stopPropagation()

			// ignore click on paginator
				// if (e.target.closest('.paginator')) {
				// 	return false
				// }

			// remove row
				if (e.target.matches('.button.remove')) {
					e.preventDefault()
					e.stopPropagation()

					// label
						const children = e.target.parentNode.parentNode.children
						const ar_label = []
						for (let i = 0; i < children.length; i++) {
							if(children[i].textContent.length>0) {
								ar_label.push(children[i].textContent)
							}
						}
						const label = ar_label.join(', ')

					// changed_data
						const changed_data = Object.freeze({
							action	: 'remove',
							// key	: JSON.parse(e.target.dataset.key),
							key		: JSON.parse(e.target.dataset.paginated_key),
							value	: null
						})

					// remove_dialog. User must to confirm the remove action to continue
					// On true, data pagination offset is changed
						const remove_dialog = function() {

							const msg = SHOW_DEBUG
								? `Sure to remove value: ${label} ? \n\nchanged_data:\n${JSON.stringify(changed_data, null, 2)}`
								: `Sure to remove value: ${label} ?}`

							if( !confirm(msg) ) {
								return false
							}

							// data pagination offset. Check and update self data to allow save API request return the proper paginated data
								const key = parseInt(e.target.dataset.key)
								if (key===0 && self.data.pagination.offset>0) {
									const next_offset = (self.data.pagination.offset - self.data.pagination.limit)
									// set before exec API request on Save
									self.data.pagination.offset = next_offset>0
										? next_offset
										: 0
								}

							return true
						}

					// change_value (implies saves too)
						const changed = self.change_value({
							changed_data	: changed_data,
							label			: label,
							refresh			: false,
							remove_dialog	: remove_dialog
						})
						changed.then(async (response)=>{

							// the user has selected cancel from delete dialog
								if (response===false) {
									return
								}

							// update pagination offset
								self.update_pagination_values('remove')

							// refresh
								await self.refresh({
									build_autoload : false
								})

							// check if the caller has active a tag_id
								if(self.active_tag){
									// filter component data by tag_id and re-render content
									self.filter_data_by_tag_id(self.active_tag)
								}

							// event to update the DOM elements of the instance
								event_manager.publish('remove_element_'+self.id, e.target.dataset.key)
						})

					return true
				}//end if (e.target.matches('.button.remove')) {

			// activate service autocomplete. Enable the service_autocomplete when the user do click
				if(self.autocomplete_active!==undefined && self.autocomplete_active===false){

					// set rqo
						self.rqo_search		= self.rqo_search || self.build_rqo_search(self.rqo_config, 'search')
						// self.rqo.choose	= self.rqo.choose || self.build_rqo('choose', self.context.request_config, 'get_data')

					self.autocomplete = new service_autocomplete()
					self.autocomplete.init({
						caller	: self,
						wrapper : wrapper
					})
					.then(function(){
						self.autocomplete_active = true
						self.autocomplete.search_input.focus()
					})

					return true
				}//end if(self.autocomplete_active!==undefined && self.autocomplete_active===false)
		})//end click event


	return true
}//end add_events



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


