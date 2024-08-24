// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG */
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'
	import {get_fallback_value} from '../../common/js/common.js'



/**
* VIEW_LINE_EDIT_TEXT_AREA
* Manage the components logic and appearance in client side
*/
export const view_line_edit_text_area = function() {

	return true
}//end view_line_edit_text_area



/**
* RENDER
* Render node for use in modes: edit, edit_in_list
* @return HTMLElement wrapper
*/
view_line_edit_text_area.render = async function(self, options) {
	// render_level
		const render_level = options.render_level || 'full'
		// fix render_level
		self.render_level = render_level

	// content_data
		const content_data = get_content_data_edit(self)
		if (render_level==='content') {
			return content_data
		}

	// wrapper. ui build_edit returns component wrapper
		const wrapper_options = {
			content_data	: content_data,
			label			: null
		}

		const wrapper = ui.component.build_wrapper_edit(self, wrapper_options)
		// set pointers
		wrapper.content_data = content_data

	return wrapper
}//end render



/**
* GET_CONTENT_DATA_EDIT
* @param object self
* @return HTMLElement content_data
*/
const get_content_data_edit = function(self) {

	// short vars
		const data	= self.data || {}
		const value	= data.value || []


	// content_data
		const content_data = ui.component.build_content_data(self)

	// values (inputs)
		const inputs_value	= value // is array
		const value_length	= inputs_value.length || 1
		for (let i = 0; i < value_length; i++) {
			// get the content_value
			const content_value = (self.permissions===1)
				? get_content_value_read(i, inputs_value[i], self)
				: get_content_value(i, inputs_value[i], self)
			// add node to content_data
			content_data.appendChild(content_value)
			// set pointers
			content_data[i] = content_value
		}

	return content_data
}//end get_content_data_edit



/**
* GET_CONTENT_VALUE
* @return HTMLElement content_value
*/
const get_content_value = (i, current_value, self) => {

	// get fallback when current_value is empty
	// clean fallback to only text
		const data					= self.data || {}
		const value					= data.value || []
		const ar_fallback_value		= data.fallback_value || []
		const fallback				= get_fallback_value(value, ar_fallback_value)
		const dirty_fallback_value	= fallback[i]
	// clean fallback of any tag
		const fallback_fragment = document.createDocumentFragment();
		const fb_content_value = ui.create_dom_element({
			element_type	: 'div',
			inner_html 		: dirty_fallback_value,
			parent  		: fallback_fragment
		})
		const fallback_value = fallback_fragment.firstChild.innerText;

	// value_string is a raw html without parse into nodes (txt format)
		const value_string = current_value
			? self.tags_to_html(current_value)
			: null

	// content_value
		const content_value = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'content_value'
		})

	// toolbar_container
		const toolbar_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'toolbar_container hide',
			parent			: content_value
		})

	// value_container
		const value_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'value_container editor_container',
			inner_html 		: value_string,
			parent			: content_value
		})
		// placeholder_node. Create a Place placeholder if no value found
		const placeholder_node = (!value_string)
			? ui.create_dom_element({
				element_type	: 'p',
				class_name		: 'placeholder ck-placeholder',
				inner_html		: fallback_value,
				parent			: value_container
			  })
			: null

	// init_current_service_text_editor
		const init_current_service_text_editor = async function() {

			// permissions check
				if (!self.permissions || parseInt(self.permissions)<2) {
					return
				}

			// placeholder_node. Remove it from value_container
				if (placeholder_node) {
					placeholder_node.remove()
				}

			// service_editor. Fixed on init
				const current_service_text_editor = new self.service_text_editor()

			// fix service instance with current input key
				self.service_text_editor_instance[i] = current_service_text_editor

			// toolbar. create the toolbar base
				const toolbar = ['bold','italic','underline','|','undo','redo','|', 'button_save']
				// toolbar add custum_buttons
					if(self.context.toolbar_buttons){
						toolbar.push(...self.context.toolbar_buttons)
					}

			// editor_config
				const editor_config = {
					toolbar			: toolbar, // array of strings like ['bold','italic']
					custom_buttons	: get_custom_buttons(self, current_service_text_editor, i),
					custom_events	: get_custom_events(self, i, current_service_text_editor),
					read_only		: self.show_interface.read_only || false
				}

			// init editor
				await current_service_text_editor.init({
					caller				: self,
					value_container		: value_container,
					toolbar_container	: toolbar_container,
					fallback_value		: fallback_value,
					key					: i,
					editor_config		: editor_config,
					editor_class		: 'ddEditor' // ddEditor | InlineEditor
				})

			// fix current_service_text_editor when is ready
				self.text_editor[i] = current_service_text_editor

			// permissions <2 turn editor read only
				// if (!self.permissions || parseInt(self.permissions)<2) {
				// 	current_service_text_editor.editor.enableReadOnlyMode(
				// 		current_service_text_editor.editor.id
				// 	)
				// }

			// event ready
				event_manager.publish(
					'editor_ready_' + self.id,
					current_service_text_editor
				)

			return current_service_text_editor
		}//end init_current_service_text_editor


	// user click in the wrapper and init the editor. When it's not read only
		if (self.show_interface.read_only!==true && self.permissions >1) {

			const auto_init_editor = self.auto_init_editor!==undefined
				? self.auto_init_editor
				: (self.render_level==='content') ? true : false
			// const auto_init_editor = true
			if (auto_init_editor===true) {

				// activate now

				value_container.classList.add('loading')
				// use timeout only to force real async execution
				setTimeout(function(){
					init_current_service_text_editor()
					// .then(()=>{
						value_container.classList.remove('loading')
					// })
				}, 35)

			}else{

				// activate on user click

				// click event
				const fn_click_init = function(e) {
					e.stopPropagation()

					value_container.classList.add('loading')

					// init editor on user click
					init_current_service_text_editor()
					.then(function(service_editor) {
						if (self.context.view === 'html_text') {
							service_editor.editor.focus()
							// service_editor.value_container.classList.remove('loading')
						}else{
							// trigger service_editor click action (show toolbar and focus it)
							service_editor.click(e)
						}
					})
					// once only. Remove event to prevent duplicates
					content_value.removeEventListener('click', fn_click_init)
				}//end fn_click_init
				content_value.addEventListener('click', fn_click_init)
				// mousedown event. Capture event propagation
				content_value.addEventListener('mousedown', (e) => {
					e.stopPropagation()
				})
			}
		}//end if (self.show_interface.read_only!==true)


	return content_value
}//end get_content_value



/**
* GET_CONTENT_VALUE_READ
* @return HTMLElement content_value
*/
const get_content_value_read = (i, current_value, self) => {

	// value is a raw html without parse into nodes (txt format)
		const value = self.tags_to_html(current_value)

	// content_value
		const content_value = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'content_value editor_container read_only',
			inner_html		: value
		})

	return content_value
}//end get_content_value_read




/**
* GET_CUSTOM_BUTTONS
* @param instance self
* @param int i
*	self data element from array of values
* @return array custom_buttons
*/
const get_custom_buttons = (self, text_editor, i) => {

	// custom_buttons
	const custom_buttons = []

	// separator
		custom_buttons.push({
			name			: '|',
			manager_editor	: false,
			options	: {
				tooltip		: '',
				image		: '../../core/themes/default/icons/separator.svg',
				class_name	: 'separator',
				onclick		: null
			}
		})

	// bold
		custom_buttons.push({
			name			: "bold",
			manager_editor	: true,
			options	: {
				tooltip	: 'bold',
				image	: '../../core/themes/default/icons/bold.svg'
			}
		})

	// italic
		custom_buttons.push({
			name			: "italic",
			manager_editor	: true,
			options	: {
				tooltip	: 'italic',
				image	: '../../core/themes/default/icons/italic.svg'
			}
		})

	// underline
		custom_buttons.push({
			name			: "underline",
			manager_editor	: true,
			options	: {
				tooltip	: 'underline',
				image	: '../../core/themes/default/icons/underline.svg'
			}
		})

	// undo
		custom_buttons.push({
			name			: "undo",
			manager_editor	: true,
			options	: {
				tooltip		: 'undo',
				image		: '../../core/themes/default/icons/undo.svg',
				class_name	: 'disable'
			}
		})

	// redo
		custom_buttons.push({
			name			: "redo",
			manager_editor	: true,
			options	: {
				tooltip		: 'redo',
				image		: '../../core/themes/default/icons/redo.svg',
				class_name	: 'disable'
			}
		})

	// button_save
		const save_label = get_label.save.replace(/<\/?[^>]+(>|$)/g, "") || "Save"
		custom_buttons.push({
			name			: 'button_save',
			manager_editor	: false,
			options	: {
				text	: save_label,
				tooltip	: save_label,
				icon	: false,
				onclick	: function(e) {
					// save. text_editor save function calls current component save_value()
					text_editor.save()
				}
			}
		})


	return custom_buttons
}//end get_custom_buttons



/**
* GET_CUSTOM_EVENTS
* @param instance self
* @param int i
*	self data element from array of values
* @param function text_editor
*	select and return current text_editor
* @return object custom_events
*/
const get_custom_events = (self, i, text_editor) => {

	const custom_events	= {}
	const features		= self.context.features || {}

	// focus
		custom_events.focus = (evt, options) => {
			if (!self.active) {
				ui.component.activate(self)
			}
		}//end focus

	// blur
		// custom_events.blur = (evt, options) => {
		// 	// save. text_editor save function calls current component save_value()
		// 		text_editor.save()
		// }//end blur

	// click
		custom_events.click = (evt, options) => {
			// use the observe property into ontology of the components to subscribe to this events
			// img : click on img
			evt.preventDefault()
			evt.stopPropagation()
		}//end click

	// changeData
		custom_events.changeData = (evt, options) => {

			const ar_changes	= options
			const changes_len	= ar_changes.length
			for (let i = changes_len - 1; i >= 0; i--) {
				const change = ar_changes[i]
				// create the event name as:
				// editor_tag_geo_change_
				// editor_tag_indexIn_change_
				const event_name = 'editor_tag_'+ change.type + '_change_' + self.id_base
				event_manager.publish(event_name, change)
			}
		}//end changeData event


	return custom_events
}//end get_custom_events



// @license-end
