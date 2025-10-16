// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/* global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL */
/* eslint no-undef: "error" */



// imports
	import {ui} from '../../common/js/ui.js'
	import {strip_tags} from '../../../core/common/js/utils/index.js'
	import {view_default_edit_iri} from './view_default_edit_iri.js'
	import {view_line_edit_iri} from './view_line_edit_iri.js'
	import {view_mini_iri} from './view_mini_iri.js'
	import {get_dataframe} from '../../component_common/js/component_common.js'
	import {delete_dataframe} from '../../component_common/js/component_common.js'
	import {dd_request_idle_callback} from '../../common/js/events.js'



/**
* RENDER_EDIT_COMPONENT_IRI
* Manage the components logic and appearance in client side
*/
export const render_edit_component_iri = function() {

	return true
}//end render_edit_component_iri



/**
* EDIT
* Render node for use in current mode
* @param object options
* @return HTMLElement wrapper
*/
render_edit_component_iri.prototype.edit = async function(options) {

	const self = this

	// view
		const view = self.context.view || 'default'

	switch(view) {

		case 'line':
			return view_line_edit_iri.render(self, options)

		case 'mini':
			return view_mini_iri.render(self, options)

		case 'print':
			// view print use the same view as default, except it will use read only to render content_value
			// as different view as default it will set in the class of the wrapper
			// sample: <div class="wrapper_component component_input_text oh14 oh1_oh14 edit view_print disabled_component">...</div>
			// take account that to change the css when the component will render in print context
			// for print we need to use read of the content_value and it's necessary force permissions to use read only element render
			self.permissions = 1

		case 'default':
		default:
			return view_default_edit_iri.render(self, options)
	}
}//end edit



/**
* GET_CONTENT_DATA
* @param object self
* @return HTMLElement content_data
*/
export const get_content_data = function(self) {

	// short vars
		const data	= self.data || {}
		const value	= data.value || []

	// content_data
		const content_data = ui.component.build_content_data(self)

	// values (inputs)
		const inputs_value	= (value.length<1) ? [{}] : value
		const value_length	= inputs_value.length
		for (let i = 0; i < value_length; i++) {
			const current_value = inputs_value[i]
			const content_value_node = (self.permissions===1)
				? get_content_value_read(i, current_value, self)
				: get_content_value(i, current_value, self)

			content_data.appendChild(content_value_node)
			// set pointers
			content_data[i] = content_value_node
		}


	return content_data
}//end get_content_data



/**
* GET_CONTENT_VALUE
* Renders the current value DOM nodes.
* @param int i - Value key from the data array
* @param object current_value - Value itself
* @param object self - component instance
* @return HTMLElement content_value
*/
const get_content_value = (i, current_value, self) => {

	// current_value. (!) Fallback to {} because could be null when new blank value is added
		current_value = current_value || {}

	// short vars
		const mode					= self.mode
		const title					= current_value.title || ''
		const iri					= current_value.iri || ''
		const with_lang_versions	= self.context.properties.with_lang_versions || false
		const transliterate_value	= self.data?.transliterate_value?.[i] || null

	// content_value
		const content_value = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'content_value'
		})

	// If the value is empty, return the empty node
		const value_is_empty = !current_value || Object.keys(current_value).length === 0
		if(value_is_empty){
			if (transliterate_value?.id) {
				current_value.id = transliterate_value.id
			}else{
				current_value.id = self.data.counter+1
			}
		}

	// dataframe
	// Get a built component_datataframe instance ready for render
		get_dataframe({
			self				: self,
			section_id			: self.section_id,
			section_id_key		: current_value.id,
			section_tipo_key	: self.section_tipo,
			main_component_tipo	: self.tipo,
			view				: 'line',
			mode				: 'edit'
		})
		.then(async function(component_dataframe){

			// dataframe
				// set the component_dataframe, is mandatory use it.
				if(component_dataframe){
					// Add dataframe instance to component dependencies array
					self.ar_instances.push(component_dataframe)
					// Render it and add to content_value
					const dataframe_node = await component_dataframe.render()
					dataframe_node.classList.add('dataframe')
					// Ensure empty transliterations do not add new dataframes accidentally
					if (value_is_empty && transliterate_value) {
						dataframe_node.classList.add('loading')
					}
					content_value.appendChild(dataframe_node)
				}

			// title
				const use_title = typeof(self.context.properties.use_title) !== 'undefined'
					? self.context.properties.use_title
					: true
				if(use_title){
					// placeholder. Strip label HTML tags
						const placeholder_label = mode.indexOf('edit')!==-1
							? (get_label.title || 'Title')
							: null
						const placeholder_text = placeholder_label ? strip_tags(placeholder_label) : null

					// input title field
						const input_title = ui.create_dom_element({
							element_type	: 'input',
							type			: 'text',
							class_name		: 'input_value title',
							placeholder		: placeholder_text,
							value			: title,
							parent			: content_value
						})
						// change event
						const change_title_handler = (e) => {
							// update_value(self, i, current_value)
							current_value.title = input_title.value
							self.change_handler(i, current_value)
						}
						input_title.addEventListener('change', change_title_handler)
						// focus event
							input_title.addEventListener('focus', function() {
								// force activate on input focus (tabulating case)
								if (!self.active) {
									ui.component.activate(self, false)
								}
							})
						// click event
							input_title.addEventListener('click', function(e) {
								e.stopPropagation()
							})
						// click event
							input_title.addEventListener('mousedown', function(e) {
								e.stopPropagation()
							})
						// keyup event
							const input_title_keyup_handler = (e) => {
								if(e.key === 'Enter'){
									input_iri.focus()
									return false
								}
							}
							input_title.addEventListener('keyup', input_title_keyup_handler)
				}// end if(use_title)

			// IRI input field
				// const regex = /^((https?):\/\/)?([w|W]{3}\.)+[a-zA-Z0-9\-\.]{3,}\.[a-zA-Z]{2,}(\.[a-zA-Z]{2,})?$/;
				const input_iri = ui.create_dom_element({
					element_type	: 'input',
					type			: 'url',
					class_name		: 'input_value url',
					placeholder		: 'http://',
					value			: iri,
					parent			: content_value
				})
				// change event
					const change_iri_handler = (e) => {
						// check if the new value is valid
						// only uris with protocol (http || https) and valid domain are validated
						const valid_value = self.check_iri_value( input_iri.value )
						// if the value is not valid stop the change and show error style
						if( !valid_value ){
							input_iri.classList.add('error')
							return false
						}

						// clean error class if exists
						// if the new value is valid, remove previous error style
							if (input_iri.classList.contains('error')) {
								input_iri.classList.remove('error')
							}

						// update property iri
							current_value.iri = input_iri.value

						// update_value(self, i, current_value)
							self.change_handler(i, current_value)

						// Refresh dataframe once
							if(component_dataframe
								&& component_dataframe.node?.classList.contains('loading')
								){
								// Force render again component_dataframe to load
								// value that is not loaded if component_iri value is empty
								// because it depends of the subdatum in current lang.
								component_dataframe.refresh({
									build_autoload	: true,
									render_level	: 'content'
								})
								.then(function(){
									component_dataframe.node.classList.remove('loading')
								})
							}

					}//end change_iri_handler
					input_iri.addEventListener('change', change_iri_handler)

				// focus event
					input_iri.addEventListener('focus', function() {
						// force activate on input focus (tabulating case)
						if (!self.active) {
							ui.component.activate(self, false)
						}
					})
				// keyup event
					const input_iri_keyup_handler = (e) => {
						// Enter key force to dispatchEvent change
						if ( e.key === 'Enter' && self.data.changed_data?.length ) {
							input_iri.dispatchEvent(new Event('change'))
							self.save()
							return false
						}
					}
					input_iri.addEventListener('keyup', input_iri_keyup_handler)

			// active
				const use_active_check = typeof(self.context.properties.use_active_check) !== 'undefined'
					? self.context.properties.use_active_check
					: false
				if(use_active_check){

					const dataframe_data = current_value.dataframe
						? true
						: false

					const input_iri_active = ui.create_dom_element({
						element_type	: 'input',
						type			: 'checkbox',
						class_name		: 'input_iri_active',
						parent			: content_value
					})
					input_iri_active.checked = dataframe_data
					input_iri_active.addEventListener('change', fn_chnage)
					async function fn_chnage(e){

						// add style modified to wrapper node
							if (!self.node.classList.contains('modified')) {
								self.node.classList.add('modified')
							}

						// checked set for dataframe
							current_value.dataframe = input_iri_active.checked

						// set_changed_data
							const changed_data_item = Object.freeze({
								action	: 'update',
								key		: i,
								value	: current_value
							})
							// fix instance changed_data
							await self.set_changed_data(changed_data_item)

						// force to save on every change
							const changed_data = self.data.changed_data || []
							self.change_value({
								changed_data	: changed_data,
								refresh			: false
							})
					}//end change event
				}

				const active_check_class = (use_active_check) ? 'active_check' : ''

			// button remove
				const button_remove = ui.create_dom_element({
					element_type	: 'span',
					title			: get_label.delete || 'Delete',
					class_name		: 'button remove hidden_button '+ active_check_class,
					parent			: content_value
				})
				button_remove.addEventListener('mousedown', function(e) {
					e.stopPropagation()
					e.preventDefault()

					if (!confirm(get_label.sure || 'Sure?')) {
						return
					}

					// force possible input change before remove
					document.activeElement.blur()

					const changed_data = [Object.freeze({
						action	: 'remove',
						key		: i,
						value	: null
					})]
					self.change_value({
						changed_data	: changed_data,
						label			: button_remove.previousElementSibling.value,
						refresh			: true
					})

					// remove dataframe
					// delete_dataframe_record
					delete_dataframe({
						self				: self,
						section_id			: self.section_id,
						section_tipo		: self.section_tipo,
						section_id_key		: current_value.id,
						section_tipo_key	: self.section_tipo,
						paginated_key		: false,
						row_key				: false
					})
				})

			// button link
				const button_link = ui.create_dom_element({
					element_type	: 'span',
					title			: get_label.vincular_recurso || 'Link resource',
					class_name		: 'button link hidden_button '+ active_check_class,
					parent			: content_value
				})
				button_link.addEventListener('mousedown', function(e) {
					e.stopPropagation()
					e.preventDefault()

				// open a new window
					const url				= input_iri.value
					const current_window	= window.open(url, 'component_iri_opened', 'width=1024,height=720')
					// Ensure no reverse tabnabbing
					if (current_window) {
						current_window.opener = null;
						current_window.focus()
					}
				})

			// transliterate value object
				if(transliterate_value) {
					const transliterate_value_container = render_transliterate_value(transliterate_value);
					content_value.appendChild(transliterate_value_container)
				}
		})//end .then


	return content_value
}//end get_content_value



/**
* RENDER_TRANSLITERATE_VALUE
* Create the transliterate value DOM nodes from transliterate_value
* @param object transliterate_value
* @return HTMLElement transliterate_value_container
*/
export const render_transliterate_value = function (transliterate_value) {

	const transliterate_value_container = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'transliterate_value'
	})

	// elements
	const transliterate_elements = []

	// title
	if (transliterate_value.title) {
		const transliterate_title = ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'title',
			inner_html		: transliterate_value.title
		})
		transliterate_elements.push(transliterate_title)
	}

	// IRI
	if (transliterate_value.iri) {
		const transliterate_iri = ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'iri',
			inner_html		: transliterate_value.iri
		})
		transliterate_elements.push(transliterate_iri)
	}

	// Add nodes to transliterate_value_container
	const transliterate_elements_length = transliterate_elements.length
	for (let i = 0; i < transliterate_elements_length; i++) {
		const item = transliterate_elements[i]
		transliterate_value_container.appendChild(item)
		// separator. Add to all except the last node
		if (i < transliterate_elements_length -1) {
			ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'separator',
				inner_html		: ' - ',
				parent			: transliterate_value_container
			})
		}
	}


	return transliterate_value_container
}//end render_transliterate_value



/**
* GET_CONTENT_VALUE_READ
* Renders the current value DOM nodes for read only cases.
* @param int i
* @param object current_value
* @param object self
* @return HTMLElement content_value
*/
const get_content_value_read = (i, current_value, self) => {

	// current_value. (!) Fallback to {} because could be null when new blank value is added
		current_value = current_value || {}

	// short vars
		const title	= current_value.title || ''
		const iri	= current_value.iri || ''

	// content_value
		const content_value = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'content_value read_only'
		})

	// dataframe
		get_dataframe({
			self				: self,
			section_id			: self.section_id,
			section_id_key		: current_value.id,
			section_tipo_key	: self.section_tipo,
			main_component_tipo	: self.tipo,
			view				: 'line',
			mode				: 'list'
		})
		.then(async function(component_dataframe){

			// dataframe
				// set the component_dataframe, is mandatory use it.
				if(component_dataframe){
					// Add dataframe instance to component dependencies array
					self.ar_instances.push(component_dataframe)
					// Render it and append to content_value only if has value
					if (component_dataframe.data?.value?.length) {
						const dataframe_node = await component_dataframe.render()
						dataframe_node.classList.add('dataframe')
						content_value.appendChild(dataframe_node)
					}
				}

			// title
				ui.create_dom_element({
					element_type	: 'span',
					class_name		: 'title',
					inner_html		: title,
					parent			: content_value
				})

			// iri
				const link = ui.create_dom_element({
					element_type	: 'a',
					href			: iri,
					class_name		: 'iri',
					inner_html		: iri,
					parent			: content_value
				})
				// safe open
				link.setAttribute("rel", "noopener noreferrer");
		})


	return content_value
}//end get_content_value_read



/**
* GET_BUTTONS
* Renders the component main buttons DOM nodes displayed at top.
* Included 'Add' and tool buttons.
* @param object self - component instance
* @return HTMLElement buttons_container
*/
export const get_buttons = (self) => {

	// short vars
		const show_interface = self.show_interface

	// fragment
		const fragment = new DocumentFragment()

	// button add input
		if(show_interface.button_add === true){

			const button_add_input = ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'button add',
				title			: get_label.new || 'New',
				parent			: fragment
			})
			const button_add_input_click_habdler = (e) => {
				e.stopPropagation()

				// check existing key in transliterate_value
				// If the same key exists in the transliterate_value, force to refresh the component_iri
				// to get the subdatum of the dataframe.
				const current_key			= self.data.value?.length || 0
				const transliterate_value	= self.data.transliterate_value || []
				const build_autoload		= transliterate_value[current_key] ? true : false

				const changed_data = [Object.freeze({
					action	: 'insert',
					key		: self.data.value?.length || 0,
					value	: null
				})]
				self.change_value({
					changed_data	: changed_data,
					refresh			: true,
					build_autoload	: build_autoload
				})
				.then(()=>{
					dd_request_idle_callback(()=>{
						const input_node = self.node.content_data[changed_data[0].key].querySelector('input.url')
						if (input_node) {
							input_node.focus()
						}
					})
				})
			}
			button_add_input.addEventListener('click', button_add_input_click_habdler)
		}

	// buttons tools
		if(show_interface.tools === true){
			ui.add_tools(self, fragment)
		}

	// buttons container
		const buttons_container = ui.component.build_buttons_container(self)

	// buttons_fold (allow sticky position on large components)
		const buttons_fold = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'buttons_fold',
			parent			: buttons_container
		})
		buttons_fold.appendChild(fragment)


	return buttons_container
}//end get_buttons



// @license-end

