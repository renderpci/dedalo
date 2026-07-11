// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// import
	import {ui} from '../../common/js/ui.js'
	import {set_element_css} from '../../page/js/css.js'



/**
* VIEW_DEFAULT_EDIT_SECTION_ID
* Default edit-mode view template for component_section_id.
*
* Renders the section's integer primary key as a read-only value inside the
* standard edit wrapper. This module is the single shared template used by the
* 'default', 'line', and 'print' view variants — dispatched from
* render_edit_component_section_id.prototype.edit via the view-router switch.
*
* Responsibilities:
* - Build the content_data node containing a plain div that shows the numeric id.
* - Build the full wrapper (including label) via ui.component.build_wrapper_edit,
*   suppressing the label when the component is rendered in 'line' view.
* - Apply the parent-section colour from context.color as a CSS background-color
*   rule on both the normal and active states of the wrapper, so that the column
*   header badge matches the section theme defined in the ontology.
* - Attach buttons (only when permissions > 1) and expose content_data as a
*   pointer on the wrapper node for downstream partial-refresh access.
*
* (!) This component is read-only in edit mode. Any mutation of the section id
* is not supported here; search mode (render_search_component_section_id) is the
* only view that provides an interactive numeric input.
*
* Context shape required:
*   self.context.view   – 'default' | 'line' | 'print'
*   self.context.color  – hex string (e.g. '#b9b9b9') from ontology_node::get_color;
*                         set in component_section_id_json.php for the 'default'
*                         context_type only (absent in 'simple' context).
*
* Data shape required:
*   self.data.entries   – Array; entries[0] is either an integer or an object
*                         with a .value property containing the integer id.
*
* Exported symbols:
*   view_default_edit_section_id        – stub constructor (never instantiated directly)
*   view_default_edit_section_id.render – async factory; main entry point
*/
export const view_default_edit_section_id = function() {

	return true
}//end view_default_edit_section_id



/**
* RENDER
* Build and return the component's edit-mode DOM wrapper.
*
* Orchestrates three build phases:
*   1. content_data – the inner node holding the numeric id display (see get_content_data_edit).
*      When render_level === 'content' the function returns early with just this node,
*      used by partial-refresh callers that already have the outer wrapper in the DOM.
*   2. buttons – optional action bar built only when self.permissions > 1. For
*      component_section_id the buttons container is structurally present but contains
*      no buttons (get_buttons builds an empty buttons_fold). Reserved for future tools.
*   3. wrapper – full component wrapper assembled by ui.component.build_wrapper_edit.
*      In 'line' view the label is suppressed (wrapper_options.label = null) to avoid
*      redundant column-header labels in dense grid layouts.
*
* After the wrapper is built, set_element_css injects a scoped CSS rule keyed by
* `${section_tipo}_${tipo}.edit` that applies self.context.color as the background
* on both the idle and active states of the wrapper. This colours the component's
* column header to match its parent section's display colour in the ontology.
*
* A content_data pointer is attached to the returned wrapper element so that
* consumers can locate the inner node without re-querying the DOM.
*
* @param {Object} self    - component_section_id instance
* @param {Object} options - render options forwarded from the edit controller
*   @param {string} [options.render_level='full'] - 'full' returns the complete wrapper;
*     'content' returns only the content_data node (used by partial refresh)
* @returns {Promise<HTMLElement>} the component wrapper, or content_data when render_level==='content'
*/
view_default_edit_section_id.render = async function(self, options) {

	// options
		const render_level = options.render_level || 'full'

	// content_data
		const content_data = get_content_data_edit(self)
		if (render_level==='content') {
			return content_data
		}

	// buttons
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

		const selector = `${self.section_tipo}_${self.tipo}.edit`
		set_element_css(selector, {
			".wrapper_component": {
				'background-color' : self.context.color
			},
			".wrapper_component.active": {
				'background-color' : self.context.color
			}
		})

		// set pointers
		wrapper.content_data = content_data


	return wrapper
}//end render



/**
* GET_CONTENT_DATA_EDIT
* Build the inner content_data node that displays the section's integer id.
*
* Extracts the id value from the first entry in self.data.entries. Entries may
* arrive in two shapes depending on the caller:
*   - Primitive:  entries[0] is the raw integer (e.g. 42)
*   - Object:     entries[0] is `{ id: int, value: int|null }` (server JSON shape)
* The ternary guard normalises both shapes to a plain scalar before rendering.
*
* The id is rendered as the innerHTML of a '.content_value.section_id' div so that
* the section's integer id is visible in edit view. No input is created because
* this component is read-only outside of search mode.
*
* (!) Note: this component is only editable in search mode (see
* render_search_component_section_id for the interactive version). The label in the
* original code says "editable only in search mode" — that contract must not change.
*
* @param {Object} self - component_section_id instance
* @returns {HTMLElement} content_data node with the id value as inner HTML
*/
const get_content_data_edit = function(self) {

	const entries = self.data.entries || []
	const value = (entries[0] && typeof entries[0]==='object') ? entries[0].value : entries[0]

	// content_data
		const content_data = ui.component.build_content_data(self)

	// section_id value
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'content_value section_id',
			inner_html		: value,
			parent			: content_data
		})

	return content_data
}//end get_content_data_edit



/**
* GET_BUTTONS
* Build and return the component's buttons container.
*
* Creates the standard buttons_container via ui.component.build_buttons_container and
* appends an empty buttons_fold div inside it. For component_section_id no action
* buttons are wired at this level — the fold is present as a structural placeholder
* compatible with the standard Dédalo edit-wrapper layout, allowing future tools to
* append buttons here without restructuring the DOM.
*
* The DocumentFragment is built but currently carries no children before being
* appended to buttons_fold. This is intentional: the fragment serves as a safe
* batching point for any future button nodes without causing redundant reflows.
*
* Called from render() only when self.permissions > 1 (editors/admins).
* Returns null implicitly when permissions are insufficient (handled by the caller).
*
* @param {Object} self - component_section_id instance (used by build_buttons_container
*   to read tipo, section_tipo, mode, and show_interface)
* @returns {HTMLElement} buttons_container wrapping an empty buttons_fold div
*/
const get_buttons = (self) => {

	// short vars
		const show_interface = self.show_interface

	// fragment
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
