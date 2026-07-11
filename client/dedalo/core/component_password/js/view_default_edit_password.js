// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'
	import {handle_password_change} from './component_password.js'



/**
* VIEW_DEFAULT_EDIT_PASSWORD
* Default edit-mode view for component_password.
*
* Renders the standard edit interface for a password component, supporting the
* 'default', 'line', and 'print' views dispatched from render_edit_component_password.
* The module exposes a single static render() method; there is no instance state.
*
* Responsibilities:
* - Build the full component wrapper (wrapper + content_data + buttons) for edit mode.
* - Render a masked password <input> (permissions > 1) or a static masked placeholder
*   (permissions === 1, read-only).
* - Wire the 'change' event to handle_password_change(), which validates, freezes a
*   changed_data_item, and saves via component_common.change_value().
* - Suppress click/mousedown event propagation on the input to prevent accidental
*   section-level side effects (e.g. row-select handlers in list contexts).
*
* Data shape expected on self.data:
*   { entries: [ { id: <number|null>, value: { value: <string> } } ] }
* Only the first entry (index 0) is used; component_password stores a single password.
*
* Permissions convention (from component_common):
*   1 = read-only, >1 = editable.
*/
export const view_default_edit_password = function() {

	return true
}//end view_default_edit_password



/**
* RENDER
* Build the complete edit-mode DOM tree for a component_password instance.
*
* When render_level === 'content', only the content_data subtree is returned
* (used by inline-refresh partial updates that do not need to replace the full wrapper).
* For render_level === 'full' (the default), the standard component wrapper is assembled:
* content_data + (optional) buttons_container, then returned as the root node.
*
* In 'line' view the label node is suppressed by setting wrapper_options.label = null,
* because line-view layouts embed the label separately.
*
* @param {Object} self - component_password instance with context, data, permissions, view
* @param {Object} options - render options
* @param {string} [options.render_level='full'] - 'full' for complete wrapper, 'content' for inner subtree only
* @returns {Promise<HTMLElement>} wrapper element (full) or content_data element (content level)
*/
view_default_edit_password.render = async function(self, options) {

	// options
		const render_level = options.render_level || 'full'

	// content_data
		const content_data = await get_content_data_edit(self)
		if (render_level==='content') {
			return content_data
		}

	// buttons
		// Only render the buttons toolbar when the user has edit permissions (> 1).
		// Read-only users (permissions === 1) get no action buttons.
		const buttons = (self.permissions > 1)
			? get_buttons(self)
			: null

	// wrapper. ui build_edit returns component wrapper
		const wrapper_options = {
			content_data	: content_data,
			buttons			: buttons
		}
		if (self.view==='line') {
			wrapper_options.label = null // prevent to create label node
		}
		const wrapper = ui.component.build_wrapper_edit(self, wrapper_options)
		// set pointers
		// Attach content_data as a direct property on wrapper so callers can reach
		// the inner subtree without re-querying the DOM.
		wrapper.content_data = content_data


	return wrapper
}//end render



/**
* GET_CONTENT_DATA_EDIT
* Build the content_data container and populate it with the appropriate
* password value node (editable or read-only) based on component permissions.
*
* Only the single entry at index 0 is ever rendered; component_password is a
* scalar single-value component. The content_value_node is attached both as a
* DOM child and as a numeric-keyed property (content_data[0]) so the wrapper
* can address it directly without a querySelector call.
*
* @param {Object} self - component_password instance
* @returns {HTMLElement} content_data container with one child content_value node
*/
const get_content_data_edit = function(self) {

	// (!) key is always 0: component_password holds at most one entry.
	const key = 0

	// content_data
		const content_data = ui.component.build_content_data(self)

	// value (input)
		// Dispatch on permissions: read-only users see a static masked string;
		// editors see an interactive <input type="password">.
		const content_value_node = (self.permissions===1)
			? get_content_value_read(key, self)
			: get_content_value(key, self)
		content_data.appendChild(content_value_node)
		// set pointers
		// Numeric-key pointer allows direct access: content_data[0].
		content_data[key] = content_value_node


	return content_data
}//end get_content_data_edit



/**
* GET_CONTENT_VALUE
* Build the editable content_value div containing a masked <input type="password">.
*
* The input is pre-filled with a placeholder mask ('****************') so that the
* UI clearly signals that a password is already stored without revealing it.
* autocomplete is set to 'new-password' to prevent the browser from auto-filling
* with existing credentials, which would silently overwrite the stored password.
*
* Event handling:
* - 'change': delegates to handle_password_change() which validates, builds a
*   frozen changed_data_item, calls set_changed_data(), and saves via change_value().
*   The entry id is read live from self.data.entries[0].id (not from a stale closure)
*   so that the id captured reflects any first-save assignment from the API.
* - 'click' / 'mousedown': propagation is stopped to prevent parent containers
*   (e.g. section row-select or drag handlers) from reacting to password-field interactions.
*
* @param {number} i - entry index (always 0 for component_password)
* @param {Object} self - component_password instance
* @returns {HTMLElement} content_value div containing the password input
*/
const get_content_value = function(i, self) {

	// content_value
		const content_value = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'content_value'
		})

	// input field
		const input = ui.create_dom_element({
			element_type	: 'input',
			type			: 'password',
			class_name		: 'password_value',
			value			: '****************', // default value — visual mask only, not the real password
			parent			: content_value
		})
		// Prevent browsers from suggesting saved credentials in a field that sets/changes passwords.
		input.autocomplete = 'new-password'

		// change event
		const change_handler = async (e) => {
			e.preventDefault()

			// common change handler (validate, build changed_data_item, set_changed_data, change_value)
			// read id dynamically from self.data (not from stale closure)
			// (!) The id must be re-read on every change: on a brand-new record the entry id
			// is null at render time and only becomes available after the first API save.
				const current_id = self.data.entries?.[0]?.id ?? null
				await handle_password_change(self, input.value, input, current_id)
		}
		input.addEventListener('change', change_handler)

		// click event. Capture event propagation
		// Stops parent containers from interpreting a click on the input as a row-select
		// or other section-level action.
		input.addEventListener('click', (e) => {
			e.stopPropagation()
		})

		// mousedown event. Capture event propagation
		// Stops drag-start or mousedown-based selection handlers on ancestor elements.
		input.addEventListener('mousedown', (e) => {
			e.stopPropagation()
		})


	return content_value
}//end get_content_value



/**
* GET_CONTENT_VALUE_READ
* Build a read-only content_value div showing a fixed password mask.
*
* Used when self.permissions === 1 (read-only access). The actual stored password
* is never sent to the client; this element simply confirms that a password is set.
* The 'read_only' CSS class is applied so styling can distinguish this state from
* the editable variant.
*
* @param {number} i - entry index (always 0 for component_password, kept for API symmetry with get_content_value)
* @param {Object} self - component_password instance (unused; kept for call-site symmetry)
* @returns {HTMLElement} content_value div with static masked content
*/
const get_content_value_read = function(i, self) {

	// content_value
		// inner_html renders the mask string directly; no interactive element is created.
		const content_value = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'content_value read_only',
			inner_html		: '****************'
		})

	return content_value
}//end get_content_value_read



/**
* GET_BUTTONS
* Build the component buttons toolbar for edit mode.
*
* For component_password in its current state the buttons_fold is constructed but
* no action buttons (save, cancel, etc.) are appended to the fragment — the password
* component auto-saves on the 'change' event via handle_password_change(), so explicit
* save/cancel controls are not needed. The container structure is kept so future
* buttons can be added without restructuring the wrapper.
*
* Note: show_interface is read from self but not consumed below; it is available for
* future per-button visibility checks.
*
* @param {Object} self - component_password instance (provides show_interface context)
* @returns {HTMLElement} buttons_container element (currently holds an empty buttons_fold)
*/
const get_buttons = (self) => {

	// short vars
		const show_interface = self.show_interface

	// fragment
		// DocumentFragment used as a staging area for button nodes before DOM insertion.
		const fragment = new DocumentFragment()

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
