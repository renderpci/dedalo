// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global */
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'
	import {attach_item_dataframe} from '../../component_common/js/component_common.js'
	import {change_handler} from './render_edit_component_input_text.js'



/**
* VIEW_LINE_EDIT_INPUT_TEXT
* Compact, label-free edit view for component_input_text.
*
* This module implements the 'line' render variant selected by
* render_edit_component_input_text.prototype.edit when context.view === 'line'.
* It is structurally identical to the 'default' view (view_default_edit_input_text)
* but omits the component label and the toolbar buttons, making it suitable for
* inline use — e.g. inside list rows or embedded in another component's edit area
* where the surrounding context already provides labelling.
*
* Key differences from 'default':
*  - No label node is rendered (label : null passed to build_wrapper_edit).
*  - No add/remove buttons or tool buttons (no get_buttons call).
*  - A "close edit" button (button_exit_edit) is injected at the top of
*    content_data so the user can leave edit mode without a full toolbar.
*  - Permissions are not checked: this view always renders interactive inputs.
*    Read-only protection must be enforced by the caller (the parent component
*    or section) before dispatching to this view.
*
* Main export: view_line_edit_input_text (constructor placeholder); all logic
* lives on the static .render() method assigned directly to the constructor.
*
* Related files:
*  - render_edit_component_input_text.js — view dispatcher + change_handler
*  - view_default_edit_input_text.js     — full-feature sibling view
*  - component_common/js/dataframe.js    — attach_item_dataframe
*/
export const view_line_edit_input_text = function() {

	return true
}//end view_line_edit_input_text



/**
* RENDER
* Render node for view
*
* Entry point called by render_edit_component_input_text.prototype.edit.
* Builds and returns the component wrapper for the 'line' edit view.
*
* When render_level === 'content', only the inner content_data fragment is
* returned (used by callers that build their own wrapper, e.g. list rows).
* For render_level === 'full' (default) a full wrapper node is returned with
* content_data attached and a convenience back-reference at wrapper.content_data.
*
* @param {Object} self    - Component instance (component_input_text); provides
*                           self.data, self.context, self.view, self.lang, etc.
* @param {Object} options - Render options.
*   @param {string} [options.render_level='full'] - 'content' to return only the
*                           inner fragment, 'full' for the complete wrapper node.
* @returns {Promise<HTMLElement>} wrapper (full) or content_data (content level).
*/
view_line_edit_input_text.render = async function(self, options) {

	// options
		const render_level = options.render_level || 'full'

	// content_data
		const content_data = get_content_data_edit(self)
		if (render_level==='content') {
			return content_data
		}

	// wrapper. ui build_edit returns component wrapper
		const wrapper = ui.component.build_wrapper_edit(self, {
			content_data	: content_data,
			label			: null
		})
		// set pointers
		wrapper.content_data = content_data


	return wrapper
}//end edit



/**
* GET_CONTENT_DATA_EDIT
* Build the content_data container with a close button and one editable
* input (or textarea) per data entry.
*
* Forces at least one empty input slot when data.entries is empty so the
* component is always editable even for new, never-saved records.
* Each value slot is indexed on content_data (content_data[i]) as a DOM
* pointer used by callers that need to focus a specific input after mutation.
*
* @param {Object} self - Component instance.
* @returns {HTMLElement} content_data — populated container node ready to attach.
*/
const get_content_data_edit = function(self) {

	// short vars
		const data		= self.data || {}
		const entries	= data.entries || []

	// content_data
		const content_data = ui.component.build_content_data(self)

	// button_exit_edit
		const button_exit_edit = ui.component.build_button_exit_edit(self)
		content_data.appendChild(button_exit_edit)

	// values (inputs)
		const inputs_value	= (entries.length<1) ? [{value:null}] : entries // force one empty input at least
		const value_length	= inputs_value.length
		for (let i = 0; i < value_length; i++) {
			const input_element_node = get_content_value(i, inputs_value[i], self)
			content_data.appendChild(input_element_node)
			// set the pointer
			content_data[i] = input_element_node
		}


	return content_data
}//end get_content_data_edit



/**
* GET_CONTENT_VALUE
* Creates the current input text node
*
* Builds one content_value div for the entry at index i.  The inner
* form control is either an <input type="text"> or a <textarea>, determined
* by context.properties.multi_line.
*
* (!) multi_line=true is deprecated — prefer component_text_area for multi-line
* content.  The flag is still honoured here for backward compatibility.
*
* Fallback display: when the current entry has no value, the stored
* data.fallback_value[i].value (resolved by the server from the language
* fallback chain) is shown as the input's placeholder attribute so the user
* can see the inherited value without it being submitted as a real value.
*
* Events wired on the input:
*  - focus   — activates the component via ui.component.activate if not already
*              active (covers tabbing into the field without a prior click).
*  - keydown — stopPropagation so page-level shortcut handlers (e.g. the search
*              panel toggle) do not fire while the user types.
*  - click   — stopPropagation to prevent accidental section-level delegation.
*  - change  — delegates to change_handler (from render_edit_component_input_text)
*              which writes the new value into self.data.changed_data and triggers
*              the save / mandatory / unique update cycle.
*
* component_dataframe is conditionally attached via attach_item_dataframe; the
* call is a no-op when context.properties.has_dataframe is falsy.
*
* @param {number} i              - Zero-based index of this entry within entries.
* @param {Object} current_value  - Data item for this slot; shape: {id, value, lang?}.
*                                  May be {value:null} for a forced empty slot.
* @param {Object} self           - Component instance.
* @returns {HTMLElement} content_value div containing the input and any dataframe node.
*/
const get_content_value = (i, current_value, self) => {

	// short vars
		const multi_line = (self.context.properties && self.context.properties.hasOwnProperty('multi_line'))
			? self.context.properties.multi_line
			: false
		const element_type = (multi_line===true) ? 'textarea' : 'input'

	// content_value
		const content_value = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'content_value'
		})

	// input field
		const input_value = current_value.value || null
		const fallback_value = self.data.fallback_value?.[i].value || ''
		const input = ui.create_dom_element({
			element_type	: element_type,
			type			: 'text',
			class_name		: 'input_value',
			value			: input_value,
			placeholder		: (input_value ? '' : fallback_value),
			parent			: content_value
		})
		// focus event
			input.addEventListener('focus', function() {
				// force activate on input focus (tabulating case)
				if (!self.active) {
					ui.component.activate(self)
				}
			})
		// keydown event. Prevent to fire page events like open search panel
			input.addEventListener('keydown', function(e) {
				e.stopPropagation()
			})

		// click event
			input.addEventListener('click', function(e) {
				e.stopPropagation()
			})

		// change event
			input.addEventListener('change', function(e) {
				change_handler(e, i, self)
			})

	// component_dataframe (shared literal-view glue, no-op without has_dataframe)
		attach_item_dataframe({
			self		: self,
			item		: current_value,
			container	: content_value,
			view		: self.view
		})


	return content_value
}//end get_content_value



// @license-end
