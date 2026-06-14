// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0



// import
	import {ui} from '../../common/js/ui.js'



/**
* VIEW_DEFAULT_EDIT_INVERSE
* Default edit-mode view for component_inverse.
*
* component_inverse is a read-computed (never stored) component that surfaces the
* "backlinks" of the current section — i.e. which other sections point to this record
* via portal or relationship components. This view renders those backlinks inside the
* standard edit-wrapper so editors can see incoming references at a glance.
*
* The component data shape (self.data) is:
* {
*   entries: Array<{
*     id               : number,          // internal row id
*     section_id       : string,          // section_id of the target (current) record
*     section_tipo     : string,          // tipo of the target section (e.g. "rsc550")
*     from_section_tipo: string,          // tipo of the referencing section (e.g. "tch1")
*     from_section_id  : string,          // section_id of the referencing record
*     from_component_tipo: string         // tipo of the portal/relation component that holds the link
*   }>
* }
*
* This view is selected by render_edit_component_inverse when self.context.view is
* 'default', 'print' (with permissions forced to 1), or absent.
*
* Exports: view_default_edit_inverse (static namespace object — not a class).
*/
export const view_default_edit_inverse = function() {

	return true
}//end view_default_edit_inverse



/**
* RENDER
* Build and return the full edit wrapper for a component_inverse instance.
*
* Two rendering levels are supported:
*   - 'content': returns only the content_data node (used for partial refreshes
*     when the wrapper already exists in the DOM).
*   - 'full' (default): builds content_data + optional buttons and wraps them with
*     ui.component.build_wrapper_edit, which applies CSS classes, permission state,
*     and label visibility.
*
* When self.view === 'line' the label node is suppressed because line-view wrappers
* rely on CSS grid layout and an explicit label would break the column alignment.
*
* Side effects:
*   - wrapper.content_data is set as a pointer so callers can access the inner
*     content node without querying the DOM.
*
* @param {Object} self - component_inverse instance (component_common shape).
*   @param {Object}  self.data        - Server-resolved data; expected to have .entries.
*   @param {number}  self.permissions - 1 = read-only, >1 = edit allowed.
*   @param {string}  self.view        - Ontology-configured view name (e.g. 'default', 'line').
* @param {Object} options - Render options passed from common.prototype.render.
*   @param {string} [options.render_level='full'] - 'content' for partial re-render.
* @returns {Promise<HTMLElement>} wrapper or content_data depending on render_level.
*/
view_default_edit_inverse.render = async function(self, options) {

	// options
		const render_level = options.render_level || 'full'

	// content_data
		const content_data = get_content_data(self)
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
			wrapper_options.label = null // prevent to crate label node
		}
		const wrapper = ui.component.build_wrapper_edit(self, wrapper_options)
		// set pointers
		wrapper.content_data = content_data


	return wrapper
}//end render



/**
* GET_CONTENT_DATA
* Build the content_data container holding one content_value node per inverse-reference
* entry.
*
* When self.data.entries is empty the loop still executes once (value_length defaults
* to 1) so the view always renders at least one (empty) slot — this matches the
* pattern used by other edit views to keep the component area from collapsing to
* zero height.
*
* Each built content_value_node is appended as a child AND stored under a numeric
* index on content_data itself (content_data[i] = node) so that callers can retrieve
* individual value nodes without a DOM query.
*
* @param {Object} self - component_inverse instance.
*   @param {Object}  self.data - Component data; .entries is Array of inverse-reference objects.
* @returns {HTMLElement} content_data - The populated container div.
*/
const get_content_data = function(self) {

	// short vars
		const data		= self.data || {}
		const entries	= data.entries || []

	// content_data
		const content_data = ui.component.build_content_data(self)

	// values (inputs)
		const inputs_value	= entries
		const value_length	= inputs_value.length || 1
		for (let i = 0; i < value_length; i++) {

			const current_value = inputs_value[i] || {}

			const content_value_node = get_content_value(i, current_value, self)
			content_data.appendChild(content_value_node)
			// set the pointer
			content_data[i] = content_value_node
		}


	return content_data
}//end get_content_data



/**
* GET_CONTENT_VALUE
* Build a single row representing one inverse-reference locator.
*
* Each entry in self.data.entries is a flat locator object with the shape:
*   {
*     from_section_id  : string,   // section_id of the referencing record (displayed)
*     from_section_tipo: string,   // tipo of the referencing section
*     from_component_tipo: string  // tipo of the portal/relation that holds the link
*   }
*
* The entry object is used directly as `locator`; note that unlike the list/mini views
* (which access entries[0].locator.from_section_id), this view accesses .from_section_id
* directly on the entry — the two access patterns differ and may indicate a data-shape
* inconsistency across views. (!) Do not change this to add a .locator wrapper without
* verifying what the server actually delivers for each view context.
*
* When permissions === 1 the 'read_only' CSS class is added to the container so that
* the stylesheet can style it as non-interactive.
*
* @param {number}  i             - Zero-based index of this entry within entries.
* @param {Object}  current_value - One inverse-reference locator entry from data.entries.
* @param {Object}  self          - component_inverse instance; .permissions is read.
* @returns {HTMLElement} content_value - A div containing a span with from_section_id text.
*/
const get_content_value = (i, current_value, self) => {

	// short vars
		const locator	= current_value

	// content_value
		const content_value = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'content_value' + (self.permissions===1 ? ' read_only' : '')
		})

	// span field section_id from related inverse section
		if (locator) {
			ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'inverse_show_section_id',
				text_node		: locator.from_section_id,
				parent			: content_value
			})
		}

	return content_value
}//end get_content_value



/**
* GET_BUTTONS
* Build and return the standard buttons container for this component.
*
* Delegates entirely to ui.component.build_buttons_container, which reads
* self.show_interface to decide which tool/action buttons to include.
* component_inverse is read-only (no save), so the button set is typically
* limited to fold/navigation controls from the standard container.
*
* @param {Object} self - component_inverse instance passed to the button builder.
* @returns {HTMLElement} buttons_container - Standard buttons wrapper element.
*/
const get_buttons = (self) => {

	return ui.component.build_buttons_container(self)
}//end get_buttons



// @license-end
