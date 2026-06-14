// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/* global  */
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'
	import {attach_item_dataframe} from '../../component_common/js/component_common.js'
	import {
		get_content_value_read,
		render_input_element_date,
		render_input_element_range,
		render_input_element_time_range,
		render_input_element_period,
		render_input_element_time
	} from './render_edit_component_date.js'



/**
* VIEW_DEFAULT_EDIT_DATE
* Default full-page edit view for component_date.
*
* This module is selected by render_edit_component_date.prototype.edit when the
* view is 'default' or unrecognised (or 'print', with self.permissions forced
* to 1 beforehand). It builds the complete component wrapper, content area,
* and — for users with write access — the action buttons.
*
* Supported date_mode values (read from context.properties.date_mode):
*   'date'       — single date, one text input (default)
*   'range'      — start + end date pair, two inputs with a visual separator
*   'time_range' — start + end date-time pair (date + time fields)
*   'period'     — duration expressed as year/month/day counters
*   'time'       — time-of-day only, one text input
*
* The date_mode is applied as a CSS class on the wrapper so that mode-specific
* layout rules can be targeted without extra attribute checks.
*
* Entry rendering:
*   If the component data contains no entries an empty entry placeholder ([''])
*   is used so that at least one (empty) input is always shown.
*   For read-only users (permissions === 1) each entry is rendered via
*   get_content_value_read (plain text); for writers via get_content_value
*   (interactive input with calendar picker).
*
* Main exports:
*   view_default_edit_date  — constructor placeholder (callable; returns true)
*   get_content_data        — shared by other callers that need only the inner
*                             content area (e.g. refresh path)
*   get_content_value       — exported for unit-level reuse; builds a single
*                             entry's DOM node
*/



/**
* VIEW_DEFAULT_EDIT_DATE
* Constructor placeholder. All logic lives on the static .render() method.
* The function itself is never called as a constructor — it exists only as a
* namespace that other modules can import.
*/
export const view_default_edit_date = function() {

	return true
}//end view_default_edit_date



/**
* RENDER
* Build and return the full component DOM node for the default edit view.
*
* When options.render_level is 'content', only the inner content_data node is
* returned (no outer wrapper, no buttons). This allows the refresh path to
* replace only the content area without discarding the outer wrapper and its
* event listeners.
*
* Side effects:
*   - Sets wrapper.content_data as a direct property so callers can reach
*     individual entry nodes via self.node.content_data[i].
*   - Adds the active date_mode as a CSS class on the wrapper so that
*     mode-specific layout rules are applied automatically.
*
* @param {Object} self - The component_date instance.
*   Expected properties: self.permissions {number}, self.data {Object|null},
*   self.context {Object}, self.show_interface {Object}, self.get_date_mode
*   {Function}, self.load_editor {Function}.
* @param {Object} options - Render configuration.
*   @param {string} [options.render_level='full'] - 'full' returns the outer
*   wrapper; 'content' returns only the content_data element.
* @returns {Promise<HTMLElement>} The wrapper div (render_level='full') or the
*   content_data div (render_level='content').
*/
view_default_edit_date.render = async function(self, options) {

	// render_level
		const render_level = options.render_level || 'full'

	// date_mode . Defined in ontology properties
		const date_mode = self.get_date_mode()

	// load editor files (calendar)
		await self.load_editor()

	// content_data
		const content_data = get_content_data(self)
		if (render_level==='content') {
			return content_data
		}

	// buttons
		const buttons = (self.permissions > 1)
			? get_buttons(self)
			: null

	// ui build_edit returns component wrapper
		const wrapper = ui.component.build_wrapper_edit(self, {
			content_data	: content_data,
			buttons			: buttons
		})
	// set pointer to content_data
		wrapper.content_data = content_data

	// set the mode as class to be adapted to specific css
		wrapper.classList.add(date_mode)


	return wrapper
}//end render



/**
* GET_CONTENT_DATA
* Build and return the content_data element containing one entry node per
* data entry (or a single empty entry node when there is no data).
*
* The built element exposes numeric index properties (content_data[0],
* content_data[1], …) pointing to each entry's DOM node so that other
* subsystems (e.g. the refresh path) can address them directly.
*
* The selection between read-only (permissions === 1) and interactive
* (permissions > 1) rendering is made here: read-only entries use
* get_content_value_read; interactive entries use get_content_value.
*
* @param {Object} self - The component_date instance.
*   Expected properties: self.data {Object|null}, self.permissions {number}.
* @returns {HTMLElement} content_data - The populated content container element.
*/
export const get_content_data = function(self) {

	// short vars
		const data		= self.data || {}
		const entries	= data.entries || []

	// content_data
		const content_data = ui.component.build_content_data(self)

	// build values
		const input_nodes 	= []
		// When no entries are saved, synthesise a single empty entry so the
		// user always sees at least one input field ready to type into.
		const inputs_value	= (entries.length<1) ? [''] : entries
		const value_length	= inputs_value.length
		for (let i = 0; i < value_length; i++) {
			const input_element_edit = (self.permissions===1)
				? get_content_value_read(i, inputs_value[i], self)
				: get_content_value(i, inputs_value[i], self)
			content_data.appendChild(input_element_edit)
			// set pointers
			content_data[i] = input_element_edit
			input_nodes.push(input_element_edit)
		}


	return content_data
}//end get_content_data



/**
* GET_CONTENT_VALUE
* Build and return the DOM node for a single date entry in interactive
* (write-access) edit mode.
*
* The rendered inner input node is chosen based on date_mode:
*   'date'       → render_input_element_date     (one text input)
*   'range'      → render_input_element_range     (start + end date inputs)
*   'time_range' → render_input_element_time_range (start + end time inputs)
*   'period'     → render_input_element_period    (year / month / day counters)
*   'time'       → render_input_element_time      (one time input)
*
* The date_mode is applied as a CSS class on content_value so that
* mode-specific layout rules target the correct element.
*
* If the component has an associated component_dataframe, attach_item_dataframe
* appends the dataframe glue below the input node; if there is no dataframe the
* call is a no-op.
*
* @param {number} i - Zero-based index of this entry within data.entries.
*   Used by the render_input_element_* functions and by the change handler to
*   address the correct slot when saving back.
* @param {Object|null} current_value - The raw entry object from data.entries[i].
*   Shape depends on date_mode; e.g. for 'date': { start: dd_date } where
*   dd_date is { year, month, day[, time] }.  May be null/empty for new entries.
* @param {Object} self - The component_date instance.
*   Expected: self.get_date_mode {Function}, self.view {string},
*   self.permissions {number}.
* @returns {HTMLElement} content_value - The div wrapping the input node and any
*   attached dataframe glue.
*/
export const get_content_value = (i, current_value, self) => {

	// date mode
		const date_mode	= self.get_date_mode()

	// content_value
		const content_value = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'content_value'
		})

	// input node
		// The IIFE receives date_mode as an argument to avoid closure over the
		// outer variable, making the switch-case fully self-contained.
		const input_node = ((date_mode)=>{

			// build date base on date_mode
			switch(date_mode) {
				case 'range':
					return render_input_element_range(i, current_value, self)

				case 'time_range':
					return render_input_element_time_range(i, current_value, self)

				case 'period':
					return render_input_element_period(i, current_value, self)

				case 'time':
					return render_input_element_time(i, current_value, self)

				case 'date':
				default:
					return render_input_element_date(i, current_value, self)
			}
		})(date_mode)

	// set class selector
		content_value.classList.add(date_mode)

	// add input_node to the content_value
		content_value.appendChild(input_node)

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
* GET_BUTTONS
* Build and return the buttons container for the component toolbar.
*
* Only called when permissions > 1 (write access). Renders:
*   - An "Add input" button (span.button.add) when show_interface.button_add
*     is true. Clicking it dispatches a change_value call with action 'insert'
*     and refresh: true, which causes the whole content area to re-render with
*     a new empty entry appended.
*   - Standard tool buttons (via ui.add_tools) when show_interface.tools is
*     true (e.g. delete-all, copy from another language, …).
*
* (!) get_label is a global object injected at page level — it is NOT imported.
*   A missing get_label will cause a ReferenceError at runtime.  The fallback
*   string 'New' guards against a null/undefined label key only.
*
* @param {Object} self - The component_date instance.
*   Expected: self.show_interface {Object} (with boolean keys button_add, tools),
*   self.change_value {Function}.
* @returns {HTMLElement} buttons_container - The populated buttons toolbar element.
*/
const get_buttons = (self) => {

	// short vars
		const show_interface	= self.show_interface

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
			// event to insert new input
			button_add_input.addEventListener('mouseup', function(e) {
				e.stopPropagation()

				const changed_data = [Object.freeze({
					action	: 'insert',
					id		: null,
					value	: null
				})]

				self.change_value({
					changed_data	: changed_data,
					refresh			: true
				})
			})
		}

	// buttons tools
		if(show_interface.tools === true){
			ui.add_tools(self, fragment)
		}

	// buttons container
		const buttons_container = ui.component.build_buttons_container(self)
		buttons_container.appendChild(fragment)


	return buttons_container
}//end get_buttons



// @license-end
