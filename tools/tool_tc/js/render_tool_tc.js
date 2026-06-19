// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



/**
 * RENDER_TOOL_TC
 *
 * Client-side view layer for the tool_tc timecode-offset tool.
 *
 * tool_tc lets editors batch-adjust every `[TC_HH:MM:SS.mmm_TC]` tag embedded in
 * a transcription component by a given number of seconds (positive or negative).
 * This module owns the DOM construction for that interaction; the business logic
 * lives in tool_tc.js (constructor + prototype) and class.tool_tc.php (server).
 *
 * Responsibilities
 * ----------------
 * 1. Render the tool's "edit" view: a read-only preview of the source component
 *    alongside a language selector, an offset input, and an "Apply" button.
 * 2. Provide `change_component_lang` — a shared utility that re-renders the
 *    previewed component in a different language without full page reload.
 *
 * DOM structure produced by content_data_edit
 * --------------------------------------------
 *   content_data
 *     └─ components_container
 *          ├─ source_component_container   — read-only render of the main_element
 *          └─ tc_management_container
 *               ├─ source_select_lang      — <select> for language switching
 *               ├─ input.input_offset      — numeric seconds offset (text input)
 *               ├─ button.button_apply     — triggers change_all_time_codes()
 *               └─ div.response_div        — reserved for future status feedback
 *
 * Key data shapes
 * ---------------
 * self.main_element : component instance (e.g. component_input_autocomplete)
 *   The component whose TC tags will be transformed. Its `context`, `tipo`,
 *   `section_tipo`, `section_id`, and `lang` are forwarded to the server action
 *   `change_all_timecodes` via tool_tc.prototype.change_all_time_codes.
 *
 * self.langs : {string[]}
 *   Full list of project languages from page_globals.dedalo_projects_default_langs,
 *   used to populate the language selector.
 *
 * self.source_lang : {string}
 *   Active language code (e.g. 'lg-eng') inherited from the caller component;
 *   pre-selected in the language selector on render.
 *
 * self.offset_input : {HTMLElement}
 *   Reference to the text <input> stored on the tool instance so other code
 *   (e.g. keyboard shortcuts wired externally) can read its value.
 *
 * Exports
 * -------
 * render_tool_tc      — prototype constructor (assigned to tool_tc.prototype.edit)
 * change_component_lang — re-renders a component in a new language in-place
 *
 * Related files
 * -------------
 * tool_tc.js           — constructor, init, build, change_all_time_codes API call
 * class.tool_tc.php    — server: replace_tc_codes() + change_all_timecodes()
 * register.json        — tool metadata, labels (offset_in_seconds / apply /
 *                        empty_offset_value), and section-type allowlist (rsc36)
 */

// imports
	import {ui} from '../../../core/common/js/ui.js'



/**
* RENDER_TOOL_TC
* Prototype constructor for the tool_tc render layer.
* Instances are never created directly — tool_tc.prototype.edit is set to
* render_tool_tc.prototype.edit, so `this` inside those methods is always a
* tool_tc instance.
* @returns {boolean} Always true.
*/
export const render_tool_tc = function() {

	return true
}//end render_tool_tc



/**
* EDIT
* Builds and returns the full DOM wrapper for the tool's edit view.
*
* If `options.render_level` is 'content', only the inner content_data node is
* returned (used when the wrapper already exists and only its contents need
* refreshing). Otherwise the full wrapper produced by ui.tool.build_wrapper_edit
* is returned, with `wrapper.content_data` set as a convenience pointer.
*
* @param {Object} options - Render options.
* @param {string} [options.render_level='full'] - 'full' returns the outer wrapper;
*   'content' returns only the content_data node.
* @returns {Promise<HTMLElement>} wrapper — the top-level tool wrapper node, or
*   content_data when render_level is 'content'.
*/
render_tool_tc.prototype.edit = async function (options) {

	const self = this

	// options
		const render_level = options.render_level || 'full'

	// content_data
		const content_data = await content_data_edit(self)
		if (render_level==='content') {
			return content_data
		}

	// wrapper. ui build_edit returns component wrapper
		const wrapper = ui.tool.build_wrapper_edit(self, {
			content_data : content_data
		})
		// set pointers
		wrapper.content_data = content_data


	return wrapper
}//end edit



/**
* CONTENT_DATA_EDIT
* Constructs the inner DOM tree for the tool's edit view: a read-only component
* preview plus the TC-management controls (language selector, offset input, apply
* button, response area).
*
* Side effects:
* - Sets self.main_element.show_interface.read_only = true and .tools = false so
*   the source component is rendered without its editing affordances.
* - Sets self.main_element.auto_init_editor = false to prevent the inline editor
*   (e.g. TipTap) from initialising inside the preview pane, which would be
*   misleading since edits there are discarded.
* - Stores a reference to the offset <input> on self.offset_input so callers can
*   access the typed value without traversing the DOM.
* - Attaches a 'change' listener on the language <select> that calls
*   change_component_lang to re-render the preview in the new language.
* - Attaches a 'click' listener on the Apply button that:
*     1. Adds the 'loading' CSS class to components_container.
*     2. Validates that the offset field is non-empty and non-zero; if invalid
*        shows a native alert and aborts.  (!) alert() is intentional UX here —
*        the tool is a simple modal workflow; no toast infrastructure is available.
*     3. Calls self.change_all_time_codes(offset_seconds, true) and then
*        self.main_element.refresh() to show the updated timecodes inline.
*     4. Removes the 'loading' class on completion.
*
* @param {Object} self - The tool_tc instance.
* @returns {Promise<HTMLElement>} content_data — the fully wired content node.
*/
const content_data_edit = async function(self) {

	const fragment = new DocumentFragment()

	// components container
		const components_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'components_container',
			parent			: fragment
		})

	// source component
		const source_component_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'source_component_container',
			parent			: components_container
		})
		// main_element render
		// show_interface
		self.main_element.show_interface.read_only	= true
		self.main_element.show_interface.tools		= false
		// auto_init_editor
		self.main_element.auto_init_editor			= false
		self.main_element.render()
		.then(function(node){
			source_component_container.appendChild(node)
		})

	// tc_management_container. Language selection and time codes management container
		const tc_management_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'tc_management_container',
			parent			: components_container
		})

	// source_select_lang
		const source_select_lang = ui.build_select_lang({
			langs		: self.langs,
			selected	: self.source_lang,
			class_name	: 'source_lang'
		})
		tc_management_container.appendChild(source_select_lang)
		// When the user changes the language, re-render the preview component
		// in the new language so the displayed timecodes match the selection.
		source_select_lang.addEventListener('change', async function(e) {
			change_component_lang({
				self		: self,
				component	: self.main_element,
				lang		: e.target.value
			})
		})

	// offset_input in seconds
		// (!) The input is type='text' (not type='number') so the server-side PHP
		// cast to int handles locale-specific decimal separators gracefully.
		const offset_input = ui.create_dom_element({
			element_type	: 'input',
			type			: 'text',
			class_name		: 'input_offset',
			placeholder		: self.get_tool_label('offset_in_seconds') || '*Offset in seconds',
			parent			: tc_management_container
		})
		// fix input
		self.offset_input = offset_input

	// apply button
		const button_apply = ui.create_dom_element({
			element_type	: 'button',
			class_name		: 'button_apply',
			inner_html		: self.get_tool_label('apply') || 'Apply',
			parent			: tc_management_container
		})
		button_apply.addEventListener('click', (e) => {
			e.stopPropagation()

			// add loading
				components_container.classList.add('loading')

			// offset_seconds
				const offset_seconds = offset_input.value
				// Guard: reject empty, blank, or zero offsets — applying a 0-second
				// offset would overwrite all TC tags with identical values and trigger
				// an unnecessary save round-trip on the server.
				if (!offset_seconds || offset_seconds=='' || offset_seconds==0) {
					alert( self.get_tool_label('empty_offset_value') || 'Error. Empty offset value');
					// remove loading
					components_container.classList.remove('loading')
					return
				}

			// change_all_time_codes
				self.change_all_time_codes(offset_seconds, true)
				.then(function() {
					// refresh target
					self.main_element.refresh()
					.then(function(){
						// remove loading
						components_container.classList.remove('loading')
					})
				})
		})

	// response div
		// Reserved for future inline status/error feedback from the server response.
		const response_div = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'response_div',
			parent			: tc_management_container
		})

	// content_data
		const content_data = ui.tool.build_content_data(self)
		content_data.appendChild(fragment)


	return content_data
}//end content_data_edit



/**
* CHANGE_COMPONENT_LANG
* Re-renders a component instance in a different language in-place, without
* destroying and recreating the surrounding tool DOM.
*
* This is used by the language <select> in the tool's preview pane to switch
* which language's timecodes are displayed (and will be transformed on Apply).
*
* Workflow:
*   1. Add the 'loading' CSS class to component.node for visual feedback.
*   2. Override component.show_interface.read_only and component.lang.
*   3. Disable auto_init_editor so no inline editor attaches in preview mode.
*   4. Call component.refresh() (which re-fetches data for the new lang and
*      re-renders the node in place).
*   5. Remove the 'loading' class.
*
* (!) component.node must already be mounted in the DOM before this is called;
* `component.refresh()` replaces its own node via common.prototype.refresh.
*
* @param {Object} options - Options object.
* @param {Object} options.self - The tool_tc instance (unused here, available for
*   future extension such as updating self.source_lang after the change).
* @param {Object} options.component - The component instance whose language is
*   being switched. Must expose .node, .show_interface, .lang, .auto_init_editor,
*   and .refresh().
* @param {string} options.lang - Target language code (e.g. 'lg-eng').
* @returns {Promise<boolean>} Always resolves to true.
*/
export const change_component_lang = async (options) => {

	// options
		const self		= options.self
		const component	= options.component
		const lang		= options.lang

	// loading add
		component.node.classList.add('loading')

	// configure always
		component.show_interface.read_only	= true
		component.lang						= lang
		component.auto_init_editor			= false

	// render
		await component.refresh()

	// loading remove
		component.node.classList.remove('loading')


	return true
}//end change_component_lang



// @license-end
