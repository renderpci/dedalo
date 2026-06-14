// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global */
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'
	import {event_manager} from '../../common/js/event_manager.js'
	import {open_window, object_to_url_vars} from '../../common/js/utils/index.js'
	import {view_default_edit_input_text} from './view_default_edit_input_text.js'
	import {view_line_edit_input_text} from './view_line_edit_input_text.js'
	import {view_text_input_text} from './view_text_input_text.js'
	import {view_mini_input_text} from './view_mini_input_text.js'
	import {view_colorpicker_edit_input_text} from './view_colorpicker_edit_input_text.js'



/**
* RENDER_EDIT_COMPONENT_INPUT_TEXT
* Manages the component's logic and appearance in client side
*/
export const render_edit_component_input_text = function() {

	return true
}//end render_edit_component_input_text



/**
* EDIT
* Render node for use in modes: edit, edit_in_list
* @param object options
* @return HTMLElement wrapper
*/
render_edit_component_input_text.prototype.edit = async function(options) {

	const self = this

	// self.context.fields_separator
		if (!self.context.fields_separator) {
			self.context.fields_separator = ', '
		}

	// view
		const view = self.context.view || 'default'

	switch(view) {

		case 'mini':
			// used by service_autocomplete
			// one span with class as '<span class="component_input_text_mini">CODE 2, CODDE 2-b</span>'
			return view_mini_input_text.render(self, options)

		case 'text':
			// one span clean as '<span>CODE 2, CODDE 2-b</span>'
			return view_text_input_text.render(self, options)

		case 'line':
			// same as default but without label
			return view_line_edit_input_text.render(self, options)

		case 'colorpicker':
			// used as view color and open the color picker
			return view_colorpicker_edit_input_text.render(self, options)

		case 'print':
			// view print use the same view as default, except it will use read only to render content_value
			// as different view as default it will set in the class of the wrapper
			// sample: <div class="wrapper_component component_input_text oh14 oh1_oh14 edit view_print disabled_component">...</div>
			// take account that to change the css when the component will render in print context
			// for print we need to use read of the content_value and it's necessary force permissions to use read only element render
			self.permissions = 1

		case 'default':
		default:
			// full with wrapper, label, buttons and content_data
			return view_default_edit_input_text.render(self, options)
	}
}//end edit



/**
* CHANGE_HANDLER
* Store current value in self.data.changed_data
* Handles mandatory class toggle and duplicate check generically.
* Accepts optional post_process callback for view-specific logic.
* @param event e
* @param int key
* @param object self
* @param object options - { post_process: function(e, key, self) }
* @return bool
*/
export const change_handler = function(e, key, self, options={}) {

	const data			= self.data || {}
	const entries		= data.entries || []
	const item_value	= (entries[key]) ? entries[key] : {lang: self.lang}

	const safe_value = self.context.properties?.validation
		? self.validate(e.target.value)
		: e.target.value || ''

	if (e.target.value!=safe_value) {
		e.target.value = safe_value
	}

	item_value.value = safe_value

	// change data
		const changed_data_item = Object.freeze({
			action	: 'update',
			id		: entries[key]?.id || null,
			key		: key,
			value	: item_value
		})

	// change_value (save data)
		self.change_value({
			changed_data : [changed_data_item],
			refresh		 : false
		})

	// mandatory style update
		if (self.context.properties.mandatory) {
			const input = e.target
			if (input.value && input.value.length) {
				input.classList.remove('mandatory')
			}else{
				input.classList.add('mandatory')
			}
		}

	// is_unique check
		if (self.context.properties.unique) {
			// invalidate cache for the old value so re-check is fresh
			self.find_equal_cache.delete(e.target.value)
			check_duplicates(self, e.target.value)
		}

	// view-specific post-processing
		if (typeof options.post_process==='function') {
			options.post_process(e, key, self)
		}

	return true
}//end change_handler



/**
* REMOVE_HANDLER
* Handle button remove actions
* For translatable components, shows a modal warning that the entry
* will be deleted across all languages.
* @param DOM  node input
* @param int id
* @param int key - array index of the entry in data_lang
* @param object self
* @return promise response
*/
export const remove_handler = function(input, id, key, self) {

	// force possible input change before remove
		document.activeElement.blur()

	// value
		const current_value = input.value ? input.value : null

	// translatable components: show modal warning that deletion affects all languages
		const is_translatable = self.context?.translatable === true

	if (is_translatable) {

		// header
			const header = ui.create_dom_element({
				element_type	: 'div',
				class_name	: 'header'
			})
			ui.create_dom_element({
				element_type	: 'span',
				class_name	: 'label',
				inner_html	: (get_label.delete || 'Delete'),
				parent		: header
			})

		// body
			const body = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'content delete_entry'
			})
			ui.create_dom_element({
				element_type	: 'p',
				inner_html		: (get_label.sure_delete_entry_all_langs || 'This entry will be deleted from all languages.'),
				parent			: body
			})

		// footer
			const footer = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'content footer'
			})
			// button delete
				const button_delete = ui.create_dom_element({
					element_type	: 'button',
					class_name	: 'danger remove',
					text_content	: (get_label.delete || 'Delete'),
					parent			: footer
				})
				button_delete.addEventListener('click', function(e) {
					e.stopPropagation()
					// proceed with deletion
					modal.on_close()
					_do_remove(input, id, key, self, current_value)
				})
			// button cancel
				const button_cancel = ui.create_dom_element({
					element_type	: 'button',
					class_name	: 'warning',
					text_content	: (get_label.cancel || 'Cancel'),
					parent			: footer
				})
				button_cancel.addEventListener('click', function(e) {
					e.stopPropagation()
					modal.on_close()
				})

		// modal
			const modal = ui.attach_to_modal({
				header	: header,
				body	: body,
				footer	: footer,
				size	: 'small'
			})

		return
	}

	// non-translatable: simple confirm dialog
	if (current_value) {
		if (!confirm(get_label.sure)) {
			return
		}
	}

	_do_remove(input, id, key, self, current_value)
}//end remove_handler



/**
* _DO_REMOVE
* Executes the actual remove operation after confirmation
* @param DOM  node input
* @param int id
* @param int key
* @param object self
* @param string|null current_value
* @return promise response
*/
const _do_remove = function(input, id, key, self, current_value) {

	// changed_data
		const changed_data = [Object.freeze({
			action	: 'remove',
			id		: id,
			key		: key,
			value	: null
		})]

	// change_value. Returns a promise that is resolved on api response is done
		const response = self.change_value({
			changed_data	: changed_data,
			label			: current_value,
			refresh			: true
		})


		// dataframe cleanup is server-authoritative: update_data_value 'remove'
		// cascades the paired dataframe rows (single-writer rule). No client
		// delete_dataframe call here.


	return response
}//end _do_remove



/**
* CHECK_DUPLICATES
* Search duplicates from database
* @param object self
* @param string|null value
* @return Promise<void>
*/
export const check_duplicates = async function(self, value) {

	if (!self.context?.properties?.unique) {
		return
	}

	// reset warning
	const reset_warning = () => {
		if (self.node.warning_wrap) {
			self.node.warning_wrap.remove()
			self.node.warning_wrap = null
		}
	}

	// empty case
		if (!value || value.length<1) {
			reset_warning()
			return
		}

	// into tool case
		if (self.caller?.type==='tool') {
			reset_warning()
			return
		}

	const equal_value = await self.find_equal(value)
	if (equal_value) {
		ui.component.add_component_warning(
			self.node,
			// UIUX-09: use the localized label instead of a hardcoded English string.
			`${get_label.duplicated || 'Duplicated'}: '${value}' (id: ${equal_value})`,
			'alert',
			true, // clean buttons
			function(e) {
				e.stopPropagation()
				const section_id = equal_value
				// open new window
				const url = DEDALO_CORE_URL + '/page/?' + object_to_url_vars({
					tipo			: self.section_tipo,
					id				: section_id,
					mode			: 'edit',
					menu			: false,
					session_save	: false
				})
				open_window({
					url		: url,
					name	: 'section_id_' + section_id,
					on_blur : function(e) {
						// check again
						check_duplicates(self, value)
					}
				})
			}
		)
	}else{
		reset_warning()
	}
}//end check_duplicates



// @license-end
