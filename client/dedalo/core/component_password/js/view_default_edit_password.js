// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'
	import {format_label} from '../../common/js/common.js'
	import {error_text} from '../../common/js/render_api_error.js'
	import {register_unsaved_instance, deregister_unsaved_instance} from '../../common/js/events.js'
	import {save_password} from './component_password.js'
	import {check_password} from './password_policy.js'



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
* - Render the password editor (permissions > 1: field + confirm + live policy
*   checklist + explicit Save/Cancel + status line, see get_content_value) or a
*   static masked placeholder (permissions === 1, read-only).
* - Saves ONLY on explicit acceptance (Save button / Enter) through
*   save_password(), never on blur.
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
* Build the editable password editor: what is expected, what is wrong, and
* whether the value was accepted — all visible, nothing implied.
*
* Anatomy (content_value.password_editor):
* - password_field: <input type=password> + show/hide toggle. Always EMPTY:
*   the stored hash is never a value to edit or append to. Whether a password
*   is set is said by the idle status line.
* - password_confirm: a second field, shown once the first has a value. For an
*   administrator setting someone else's password a typo is otherwise silent.
* - password_rules: the policy checklist (password_policy.js — the SAME
*   evaluator the server refuses with), live on every keystroke. Each rule is
*   pending → ok / fail; the last row is "both passwords match".
* - password_actions: explicit Save (enabled only when every rule passes and
*   both fields match; Enter in either field also saves) + Cancel.
* - password_status (role=status, aria-live): the verdict in words — "Not saved
*   yet" while a draft exists, "Password saved" on acceptance, the server's
*   reason on refusal (validation.password_policy renders here, CORE_POLICY
*   keeps it off the generic inline/toast surfaces).
*
* A draft registers the instance as unsaved (register_unsaved_instance) WITHOUT
* setting changed_data, so leaving the page asks "discard unsaved changes?"
* and the auto-save sweep (save_unsaved_components) never commits an
* unconfirmed password on the user's behalf.
*
* @param {number} i - entry index (always 0 for component_password)
* @param {Object} self - component_password instance
* @returns {HTMLElement} content_value div containing the password editor
*/
const get_content_value = function(i, self) {

	// short vars
		const is_set	= () => Boolean(self.data?.entries?.[0]?.value)
		const uid		= self.id || (self.tipo + '_' + self.section_id)

	// content_value
		const content_value = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'content_value password_editor'
		})

	// password field (input + show/hide toggle)
		const field = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'password_field',
			parent			: content_value
		})
		const input = ui.create_dom_element({
			element_type	: 'input',
			type			: 'password',
			class_name		: 'password_value',
			placeholder		: get_label.new_password || 'New password',
			parent			: field
		})
		// Prevent browsers from suggesting saved credentials in a field that sets/changes passwords.
		input.autocomplete = 'new-password'
		input.spellcheck = false
		input.setAttribute('aria-label', self.label || get_label.password || 'Password')

		const toggle = ui.create_dom_element({
			element_type	: 'button',
			class_name		: 'password_toggle eye',
			title			: get_label.password_toggle_visibility || 'Show / hide password',
			parent			: field
		})
		toggle.type = 'button'
		toggle.setAttribute('aria-label', get_label.password_toggle_visibility || 'Show / hide password')
		toggle.setAttribute('aria-pressed', 'false')

	// confirm field
		const confirm_field = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'password_field password_confirm',
			parent			: content_value
		})
		const confirm_input = ui.create_dom_element({
			element_type	: 'input',
			type			: 'password',
			class_name		: 'password_confirm_value',
			placeholder		: get_label.repeat_password || 'Repeat new password',
			parent			: confirm_field
		})
		confirm_input.autocomplete = 'new-password'
		confirm_input.spellcheck = false
		confirm_input.setAttribute('aria-label', get_label.repeat_password || 'Repeat new password')

	// rules checklist
		const rules_id = 'password_rules_' + uid
		const rules_wrap = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'password_rules',
			parent			: content_value
		})
		rules_wrap.id = rules_id
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'password_rules_title',
			inner_html		: get_label.password_requirements || 'Password requirements',
			parent			: rules_wrap
		})
		const rules_list = ui.create_dom_element({
			element_type	: 'ul',
			parent			: rules_wrap
		})
		const rule_nodes = new Map()
		const add_rule_node = (id, text) => {
			const li = ui.create_dom_element({
				element_type	: 'li',
				class_name		: 'password_rule',
				text_content	: text,
				parent			: rules_list
			})
			li.dataset.rule		= id
			li.dataset.state	= 'pending'
			rule_nodes.set(id, li)
		}
		for (const rule of check_password('').rules) {
			const template = get_label[rule.label] || rule.label
			add_rule_node(rule.id, format_label(template, rule.params))
		}
		add_rule_node('match', get_label.password_confirm_match || 'Both passwords match')

	// actions
		const actions = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'password_actions',
			parent			: content_value
		})
		const save_button = ui.create_dom_element({
			element_type	: 'button',
			class_name		: 'primary password_save',
			inner_html		: get_label.save || 'Save',
			parent			: actions
		})
		save_button.type = 'button'
		const cancel_button = ui.create_dom_element({
			element_type	: 'button',
			class_name		: 'light password_cancel',
			inner_html		: get_label.cancel || 'Cancel',
			parent			: actions
		})
		cancel_button.type = 'button'

	// status (the verdict, in words)
		const status_id = 'password_status_' + uid
		const status_node = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'password_status',
			parent			: content_value
		})
		status_node.id = status_id
		status_node.setAttribute('role', 'status')
		status_node.setAttribute('aria-live', 'polite')

		input.setAttribute('aria-describedby', rules_id + ' ' + status_id)
		confirm_input.setAttribute('aria-describedby', rules_id + ' ' + status_id)

	// state
		const set_status = (state, text='') => {
			status_node.dataset.state	= state
			status_node.textContent		= text
		}
		// idle. With nothing typed, the status line says whether a password is
		// stored at all (the field itself is always empty: a hash is not a value).
		const set_idle = () => {
			set_status('idle', is_set()
				? (get_label.password_is_set || 'A password is set')
				: (get_label.password_not_set || 'No password set'))
		}

		// evaluate. Paint every rule + the match row, enable Save, return the verdict.
		const evaluate = () => {
			const value		= input.value
			const has_draft	= value.length > 0 || confirm_input.value.length > 0
			const verdict	= check_password(value)
			const matches	= value.length > 0 && value===confirm_input.value

			for (const rule of verdict.rules) {
				rule_nodes.get(rule.id).dataset.state = value.length===0
					? 'pending'
					: (rule.ok ? 'ok' : 'fail')
			}
			rule_nodes.get('match').dataset.state = confirm_input.value.length===0
				? 'pending'
				: (matches ? 'ok' : 'fail')

			content_value.classList.toggle('has_draft', has_draft)
			const acceptable	= verdict.valid && matches
			save_button.disabled = !acceptable

			return {has_draft, acceptable, verdict, matches}
		}

		// reset. Back to "nothing typed": clears both fields and the unsaved flag.
		const reset = () => {
			input.value			= ''
			confirm_input.value	= ''
			input.type			= 'password'
			confirm_input.type	= 'password'
			toggle.setAttribute('aria-pressed', 'false')
			toggle.classList.remove('active')
			evaluate()
			deregister_unsaved_instance(self)
			self.node?.classList.remove('modified')
		}

		// on_input. Live feedback + the unsaved-work guard.
		const on_input = () => {
			const {has_draft} = evaluate()
			if (has_draft) {
				register_unsaved_instance(self)
				self.node?.classList.add('modified')
				set_status('draft', get_label.password_not_saved || 'Not saved yet')
			} else {
				deregister_unsaved_instance(self)
				self.node?.classList.remove('modified')
				set_idle()
			}
		}

		// save. Explicit acceptance: refused locally with the reason, or sent and
		// the server's verdict shown.
		const save = async () => {
			if (self.saving) {
				return
			}
			const {acceptable, verdict, matches} = evaluate()
			if (!acceptable) {
				set_status('error', get_label.password_fix_requirements || 'Not saved: fix the requirements marked below')
				const target = (!verdict.valid) ? input : confirm_input
				target.focus()
				return
			}

			input.disabled			= true
			confirm_input.disabled	= true
			cancel_button.disabled	= true
			const result = await ui.run_with_button_spinner(save_button, () => save_password(self, input.value))
			input.disabled			= false
			confirm_input.disabled	= false
			cancel_button.disabled	= false

			if (result.ok) {
				reset()
				set_status('saved', get_label.password_saved || 'Password saved')
				input.blur()
			}else{
				evaluate()
				set_status('error', error_text(result.error))
				input.focus()
			}
		}

	// events
		set_idle()
		evaluate()

		input.addEventListener('input', on_input)
		confirm_input.addEventListener('input', on_input)

		// Stop parent containers (row select, drag handlers) from reacting to
		// clicks in the fields.
		for (const field_input of [input, confirm_input]) {
			field_input.addEventListener('click', (e) => { e.stopPropagation() })
			field_input.addEventListener('mousedown', (e) => { e.stopPropagation() })
		}

		const on_keydown = (e) => {
			if (e.key==='Enter') {
				e.preventDefault()
				save()
			} else if (e.key==='Escape' && content_value.classList.contains('has_draft')) {
				e.preventDefault()
				e.stopPropagation()
				reset()
				set_idle()
			}
		}
		input.addEventListener('keydown', on_keydown)
		confirm_input.addEventListener('keydown', on_keydown)

		// (!) The native 'change' event is deliberately NOT a save trigger any more:
		// blur is not consent. Stop it so no generic listener treats it as a commit.
		input.addEventListener('change', (e) => { e.stopPropagation() })
		confirm_input.addEventListener('change', (e) => { e.stopPropagation() })

		toggle.addEventListener('click', (e) => {
			e.preventDefault()
			const show = input.type==='password'
			input.type			= show ? 'text' : 'password'
			confirm_input.type	= show ? 'text' : 'password'
			toggle.setAttribute('aria-pressed', show ? 'true' : 'false')
			toggle.classList.toggle('active', show)
			input.focus()
		})

		save_button.addEventListener('click', (e) => {
			e.preventDefault()
			save()
		})

		cancel_button.addEventListener('click', (e) => {
			e.preventDefault()
			reset()
			set_idle()
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
