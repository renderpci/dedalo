// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/* global get_label, page_globals, SHOW_DEBUG, flatpickr */
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'
	import {attach_item_dataframe} from '../../component_common/js/component_common.js'
	import {view_default_edit_number} from './view_default_edit_number.js'
	import {view_line_edit_number} from './view_line_edit_number.js'
	import {view_mini_number} from './view_mini_number.js'



/**
* RENDER_EDIT_COMPONENT_NUMBER
* Edit-mode render mixin for component_number.
*
* This module is NOT a standalone class. It is a prototype-assignment vehicle:
* component_number.prototype.edit is wired to
* render_edit_component_number.prototype.edit (see component_number.js).
* The constructor itself is a no-op placeholder so that prototype methods can be
* attached to it using the standard Dédalo pattern.
*
* Exports (named):
*   render_edit_component_number — constructor / prototype carrier
*   get_content_data             — builds the main content_data DOM node containing
*                                  one content_value slot per data entry (or a single
*                                  empty slot when entries is empty).
*   get_content_value            — builds one editable <input type="text"> slot with
*                                  validation, activation, and optional remove button.
*   get_buttons                  — builds the buttons_container (add / tools).
*   change_handler               — 'change' event handler; validates, formats, and
*                                  persists the new numeric value via self.change_value().
*   remove_handler               — 'click' handler for the per-slot remove button;
*                                  triggers a confirmation and issues a 'remove' action.
*
* Data shape expected on self.data:
*   entries {Array<{id:number|null, value:number|null}>}
*     The array of stored numeric values.  Each slot carries an id (server-assigned
*     row identifier used for update/remove actions) and value (the raw number).
*     When entries is empty or absent, the UI renders one empty input slot so the
*     component is never completely blank.
*
* Data shape expected on self.context:
*   view              {string}  — render view name: 'default'|'line'|'mini'|'print'
*   fields_separator  {string}  — separator string between multi-value display labels;
*                                 defaults to ' | ' when absent.
*   properties        {Object}  — ontology properties block (type, precision,
*                                 show_interface, …); consumed by self.get_steps()
*                                 and self.fix_number_format().
*
* self.show_interface keys consumed here:
*   button_add {boolean} — when true, renders an "Add" button that inserts a new
*                          empty entry via self.change_value({action:'insert'}).
*   tools      {boolean} — when true, renders the ontology-configured tool buttons
*                          via ui.add_tools().
*
* Global references (page-provided, declared in the global directive above):
*   get_label  — localised label map ({new:'New', delete:'Delete', sure:'Are you sure?', …})
*   SHOW_DEBUG — boolean flag; not currently used inside this module but declared for
*                parity with the rest of the component family.
*   flatpickr  — date-picker library declared here for the broader component family;
*                not used by this module directly.
*/
export const render_edit_component_number = function() {

	return true
}//end render_edit_component_number



/**
* EDIT
* Dispatch to the appropriate view renderer based on self.context.view.
*
* View routing:
*   'line'    — compact single-line view, no outer wrapper label row.
*   'mini'    — minimal read-style view, used in embedded / inline contexts.
*   'print'   — forces self.permissions to 1 (read-only) then falls through to
*               'default'.  This is an intentional fall-through (no break/return).
*               The mutation of self.permissions is side-effectful on the instance
*               for the lifetime of the render call; the view_print CSS class is
*               applied by ui.component.build_wrapper_edit() from context.view.
*   'default' — full wrapper: label row, buttons_container, content_data with one
*               <input> per entry.  Read users (permissions === 1) see only static
*               text nodes rendered by get_content_value_read().
*
* (!) The 'print' case intentionally falls through to 'default' via a missing
*     break/return. Do not add one — the permissions mutation IS the purpose of
*     the 'print' branch and must execute before the view renderer is called.
*
* Sets self.context.fields_separator to ' | ' when the ontology has not defined one,
* so downstream label-join logic can rely on it being present.
*
* @param {Object} options - Render options forwarded verbatim to the selected view
*                           renderer (e.g. {render_level:'content'})
* @returns {Promise<HTMLElement>} Resolved component wrapper node (or content_data
*                                 when options.render_level === 'content')
*/
render_edit_component_number.prototype.edit = async function(options) {

	const self = this

	// field separator
		if (!self.context.fields_separator) {
			self.context.fields_separator = ' | '
		}

	// view
		const view = self.context.view || 'default'

	switch(view) {

		case 'line':
			return view_line_edit_number.render(self, options)

		case 'mini':
			return view_mini_number.render(self, options)

		case 'print':
			// view print use the same view as default, except it will use read only to render content_value
			// as different view as default it will set in the class of the wrapper
			// sample: <div class="wrapper_component component_input_text oh14 oh1_oh14 edit view_print disabled_component">...</div>
			// take account that to change the css when the component will render in print context
			// for print we need to use read of the content_value and it's necessary force permissions to use read only element render
			self.permissions = 1

		case 'default':
		default:
			return view_default_edit_number.render(self, options)
	}
}//end edit



/**
* GET_CONTENT_DATA
* Build the content_data DOM node that holds all numeric input slots.
*
* Iterates self.data.entries and produces one content_value child per slot.
* When entries is empty the loop still executes once (value_length defaults to 1)
* so the component always renders at least one empty input rather than appearing
* blank.  The caller (view_default_edit_number.render) is responsible for attaching
* content_data to the wrapper and for setting wrapper.content_data = content_data
* so that get_buttons' add-handler can reach new slots by numeric index after a
* refresh.
*
* Permission branching:
*   permissions === 1 (read-only) — delegates to get_content_value_read(); produces
*     a static <div> with the raw numeric value as inner HTML; no interaction.
*   permissions >= 2 (read-write) — delegates to get_content_value(); produces an
*     editable <input> slot with all event handlers attached.
*
* Numeric index pointers are set on the content_data node itself
* (content_data[i] = content_value_node) so that callers can reach individual slots
* by index for focus-after-add or targeted refresh.
*
* @param {Object} self - Component instance (component_number); must have
*                        self.data.entries, self.permissions, and self.node set
* @returns {HTMLElement} content_data node with all child content_value nodes appended
*/
export const get_content_data = function(self) {

	// short vars
		const data		= self.data || {}
		const entries	= data.entries || []

	// content_data
		const content_data = ui.component.build_content_data(self)

	// build values
		const value_length = entries.length || 1
		for (let i = 0; i < value_length; i++) {
			const content_value_node = (self.permissions===1)
				? get_content_value_read(i, entries[i], self)
				: get_content_value(i, entries[i], self)
			content_data.appendChild(content_value_node)
			// set pointers
			content_data[i] = content_value_node
		}


	return content_data
}//end get_content_data



/**
* GET_CONTENT_VALUE
* Build one editable numeric input slot for a single data entry.
*
* DOM output shape (appended to the parent content_data by get_content_data):
*   <div class="content_value">
*     <input type="text" class="input_value" value="{entry.value|''}">
*     [<span class="button remove hidden_button" title="Delete">]  (when i > 0)
*   </div>
*
* The input uses type="text" (not type="number") so that the component can apply
* its own locale-aware parsing via self.clean_value() / self.fix_number_format()
* without the browser overriding the decimal separator.  The step attribute is
* set from self.get_steps() to assist assistive technologies and any future
* range-clamping logic.
*
* Events attached to the input element:
*   mousedown — stopPropagation; prevents the parent activation handler from firing
*               a second activate while the user simply clicks into the field.
*   focus     — activates the component via ui.component.activate(self, false) when
*               not already active; supports keyboard tab-navigation into the field.
*   keydown   — stopPropagation on all keys; on Tab, explicitly deactivates the
*               component so focus moves cleanly to the next field.
*   click     — stopPropagation; same rationale as mousedown.
*   change    — delegates to change_handler(e, i, self) to validate, format, and
*               persist the value; called after the browser's native change fires
*               (i.e. on blur or Enter).
*   input     — calls self.clean_value() on every keystroke via input_check_value_handler
*               to coerce the live display (e.g. '5,21' → '5.21') before change fires.
*
* The remove button (a <span>) is only rendered when i > 0 (the first slot cannot
* be removed, only cleared).  Its mousedown prevents the component from deactivating
* on the mouse press, and its click calls remove_handler() which issues a 'remove'
* action via self.change_value().  The button is hidden by CSS unless the component
* wrapper is in the active state (class 'hidden_button').
*
* attach_item_dataframe is called unconditionally after the input is built; it is a
* no-op when context.properties.has_dataframe is not set, so there is no guard needed.
*
* @param {number} i             - Zero-based index of this slot in the entries array;
*                                 used to identify which entry is being edited and to
*                                 decide whether to render the remove button (i > 0)
* @param {Object} current_value - One entry: {id:number|null, value:number|null};
*                                 may be undefined when entries is empty (first-slot
*                                 placeholder); optional chaining guards all access
* @param {Object} self          - Component instance (component_number)
* @param {Object} [options={}]  - Optional overrides:
*                                   show_remove_button {boolean} — set to false to
*                                   suppress the remove button even for i > 0
*                                   (used by view_line_edit_number)
* @returns {HTMLElement} content_value <div> with the input (and optional remove
*                        button) inside
*/
export const get_content_value = (i, current_value, self, options={}) => {

	// content_value
		const content_value = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'content_value'
		})

	// input field
		const input = ui.create_dom_element({
			element_type	: 'input',
			type			: 'text',
			class_name		: 'input_value',
			value			: current_value?.value || '',
			parent			: content_value
		})
		input.step = self.get_steps()

		// mousedown event. Capture event propagation
		input.addEventListener('mousedown', (e) => {
			e.stopPropagation()
		})

		// focus event
		input.addEventListener('focus', function() {
			// force activate on input focus (tabulating case)
			if (!self.active) {
				ui.component.activate(self, false)
			}
		})

		// keydown event
		input.addEventListener('keydown', function(e) {
			e.stopPropagation()
			if(e.key==='Tab'){
				ui.component.deactivate(self)
				return
			}
		})

		// click event. Capture event propagation
		input.addEventListener('click', (e) => {
			e.stopPropagation()
		})

		// change event
		input.addEventListener('change', (e) => {
			change_handler(e, i, self)
		})

		// input event
		const input_check_value_handler = (e) => {
			// fix value to valid format as '5.21' from '5,21'
			e.target.value = self.clean_value(e.target.value)
		}
		input.addEventListener('input', input_check_value_handler)

	// button remove
		const show_remove_button = options.show_remove_button !== false
		if (i>0 && show_remove_button) {
			const button_remove = ui.create_dom_element({
				element_type	: 'span',
				title			: get_label.delete || 'Delete',
				class_name		: 'button remove hidden_button',
				parent			: content_value
			})
			button_remove.addEventListener('mousedown', function(e) {
				e.stopPropagation()
				e.preventDefault()
			})
			button_remove.addEventListener('click', function(e){
				e.stopPropagation()
				remove_handler(input, current_value?.id, self)
			})
		}

	// component_dataframe (shared literal-view glue, no-op without has_dataframe)
		attach_item_dataframe({
			self		: self,
			item		: current_value,
			container	: content_value,
			view		: self.view
		})


	return content_value
}//end get_content_value



/**
* GET_CONTENT_VALUE_READ
* Build a single read-only content_value node that displays the raw numeric value.
*
* Used when permissions === 1 or the component is rendered in 'print' view.
* No interaction elements (input, remove button) are rendered.  The node receives
* both 'content_value' and 'read_only' CSS classes so that the print/read stylesheet
* can apply the correct appearance.
*
* current_value?.value is used with optional chaining to guard the case where
* the entry slot is undefined (e.g. when entries is empty and the loop runs once
* with i=0 but entries[0] is absent).
*
* @param {number} i             - Zero-based slot index (unused inside this function;
*                                 kept for API symmetry with get_content_value and to
*                                 match the caller's loop pattern)
* @param {Object|undefined} current_value - One entry {id:number|null, value:number|null},
*                                           or undefined for the placeholder slot
* @param {Object} self          - Component instance (component_number); not used
*                                 inside this function but kept for API symmetry
* @returns {HTMLElement} <div class="content_value read_only"> with inner_html set
*                        to the numeric value string, or '' when absent
*/
const get_content_value_read = (i, current_value, self) => {

	// content_value
		const content_value = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'content_value read_only',
			inner_html		: current_value?.value || ''
		})


	return content_value
}//end get_content_value_read



/**
* GET_BUTTONS
* Build the buttons_container DOM node for the edit toolbar.
*
* Two optional button groups are assembled into a DocumentFragment, then placed
* inside a buttons_fold wrapper that allows sticky positioning on taller components.
* Each group is guarded by its self.show_interface flag, so ontology config drives
* what is visible without code changes:
*
*   button_add {boolean} — an "Add" button that appends a new empty entry to the
*     component's data.  Internally issues a single 'insert' changed_data atom with
*     value:{value:null}, then refreshes the component.  After the refresh, it
*     focuses the newly created input slot identified by index
*     (self.data.entries.length - 1) so the user can start typing immediately.
*     The event is attached to 'mouseup' (not 'click') to avoid conflicts with the
*     wrapper's mousedown-based activation listener.
*
*   tools {boolean} — appends the ontology-configured tool buttons from self.tools[]
*     via ui.add_tools(self, fragment).  Tools are assembled server-side from the
*     model + ontology; no tool types are hardcoded here.
*
* @param {Object} self - Component instance (component_number); must have
*                        self.show_interface, self.data.entries, self.node.content_data,
*                        and self.tools set
* @returns {HTMLElement} buttons_container node with the buttons_fold child already
*                        populated
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

			const add_handler = async function(e) {
				e.stopPropagation()

				const changed_data = [Object.freeze({
					action	: 'insert',
					id		: null,
					value	: {value: null}
				})]

				await self.change_value({
					changed_data	: changed_data,
					refresh			: true
				})

				const new_key = self.data.entries.length - 1
				const input_node = self.node.content_data[new_key]
					? self.node.content_data[new_key].querySelector('input')
					: null
				if (input_node) {
					input_node.focus()
				}
			}
			button_add_input.addEventListener('mouseup', add_handler)
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



/**
* CHANGE_HANDLER
* Validate, format, and persist a new numeric value entered in an input slot.
*
* Called by the input's 'change' event (fires on blur or Enter).  The raw string
* from the input is passed through self.fix_number_format() which:
*   1. calls self.clean_value() to normalise the decimal separator (',' → '.')
*      and strip disallowed characters;
*   2. converts the cleaned string to a JS number;
*   3. applies precision rounding via get_format_number() according to the
*      ontology type ('int' or 'float') and precision properties.
*
* UIUX-03 validation rule:
*   A non-empty input that cannot be parsed (parsed_value === null) is treated as
*   invalid.  The field receives a visual error state via ui.component.error(true)
*   and the function returns false without saving — the user's entry is NOT silently
*   overwritten with null.  An empty input IS a legitimate intentional clear and
*   proceeds normally.
*
* After validation, when the formatted value differs from what the input currently
* shows (e.g. '5.321' rounded to '5.32'), the input's displayed value is corrected
* in place.  An empty/null result is stored as null (not '') to avoid persisting
* empty strings.
*
* The changed_data atom shape sent to self.change_value():
*   {
*     action : 'update' | 'insert',  // 'insert' when self.data.entries is absent
*     id     : number | null,         // server-assigned row id for the updated entry
*     value  : {id, value}            // the full entry object with the new value
*   }
*
* refresh is always false: a change to a numeric value only updates the stored datum;
* the DOM slot does not need to be rebuilt.
*
* @param {Event}  e    - Native DOM 'change' event; e.target is the <input> element
* @param {number} key  - Zero-based index of the slot being changed, matching the
*                        position in self.data.entries
* @param {Object} self - Component instance (component_number)
* @returns {boolean} true on success, false when validation fails
*/
export const change_handler = function(e, key, self) {

	// set the value in the configured number format. e.g. 'float'
	const raw_value = e.target.value
	const parsed_value = self.fix_number_format(raw_value)

	// UIUX-03: give validation feedback. Non-empty input that fails to parse
	// (parsed_value===null) is invalid: flag the field and do NOT silently save
	// null over the user's entry. An empty input is a legitimate clear.
	const had_input = typeof raw_value === 'string' && raw_value.trim() !== ''
	if (had_input && parsed_value === null) {
		ui.component.error(true, e.target)
		return false
	}
	// valid value or intentional clear: clear any prior error state
	ui.component.error(false, e.target)

	if (parsed_value != e.target.value) {
		// replace changed value
		e.target.value = parsed_value
	}

	const safe_value = (parsed_value !== '')
		? parsed_value
		: null;

	// update value item
	const item = self.data.entries
		? (self.data.entries[key] || {})
		: {}

	const action = self.data.entries
		? 'update'
		: 'insert'

	item.value = safe_value

	// change data
	const changed_data_item = Object.freeze({
		action	: action,
		id		: item.id || null,
		value	: item
	})

	// change_value (save data)
	self.change_value({
		changed_data	: [changed_data_item],
		refresh			: false
	})


	return true
}//end change_handler



/**
* REMOVE_HANDLER
* Handle the remove button click for a single numeric entry slot.
*
* Blurs the currently focused element first (document.activeElement.blur()) to
* force any pending 'change' event on the input to fire and save before the slot
* is deleted.  This prevents a stale value being left in the database when the user
* edits then immediately clicks remove without tabbing out first.
*
* When the input holds a non-empty value, the user is prompted via confirm()
* (get_label.sure) before the deletion proceeds.  An empty slot is removed without
* confirmation since there is no data to lose.
*
* The changed_data atom shape sent to self.change_value():
*   {
*     action : 'remove',
*     id     : number | null,  // server-assigned row id for the entry to delete
*     value  : null
*   }
*
* refresh is true: after a remove the entry array shrinks, so the entire content_data
* node must be rebuilt to remove the DOM slot and keep numeric indices in sync.
*
* (!) confirm() is a blocking browser dialog. In automated/test environments this
*     may interfere with headless execution. No alternative confirmation mechanism
*     is currently implemented.
*
* @param {HTMLElement} input - The <input> element of the slot being removed;
*                              its current value determines whether to prompt
* @param {number|null} id    - Server-assigned row id of the entry to remove;
*                              null for an unsaved placeholder slot
* @param {Object} self       - Component instance (component_number)
* @returns {Promise<Object>} Promise resolved with the API response from
*                            self.change_value(), or undefined if cancelled
*/
export const remove_handler = function(input, id, self) {

	// force possible input change before remove
		document.activeElement.blur()

	// value
		const current_value = input.value ? input.value : null
		if (current_value) {
			if (!confirm(get_label.sure)) {
				return
			}
		}

	// changed_data
		const changed_data = [Object.freeze({
			action	: 'remove',
			id		: id,
			value	: null
		})]

	// change_value. Returns a promise that is resolved on api response is done
		const response = self.change_value({
			changed_data	: changed_data,
			label			: current_value,
			refresh			: true
		})


	return response
}//end remove_handler



// @license-end
