// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



/**
* VIEW_DEFAULT_EDIT_COMPONENT_EXTERNAL
* Default edit-mode view for component_external.
*
* This module is selected by render_edit_component_external.prototype.edit for the
* 'default', 'line', 'mini', and 'print' view variants (the dispatcher falls through
* to 'default'). Its sole public surface is the static render() method; the
* constructor is a no-op placeholder that keeps the module consistent with Dédalo's
* static-view pattern used across all view_* modules.
*
* Responsibilities:
*  - Build the outer component wrapper (via ui.component.build_wrapper_edit).
*  - Build the content area: one read-only entry node per item in self.data.entries,
*    or a single placeholder node when the entries array is empty.
*  - Attach the action-button bar (fullscreen, tools) for users with permissions > 1,
*    delegated to get_buttons() from render_edit_component_external.
*
* Since component_external's data is entirely server-resolved from a remote API (see
* class.component_external.php), the edit view is intentionally read-only at the value
* level: no inputs are rendered, and no change events are wired. The component cannot
* write data back to the external source, so the "edit" mode here is effectively a
* richer read-only display (with buttons for tools such as fullscreen).
*
* Data shape consumed: self.data = { entries: string[], entries_kind?: ('text'|'markup')[],
*  source_status?: Object }
*  Each entry is a pre-formatted string produced server-side by the fields_map
*  transformation. Entries render as TEXT unless the server marks them 'markup'
*  (2026-08-06 — the old "the server is responsible for sanitisation" contract was
*  never true; see external_render.js rule 1), and a degraded source renders its
*  status marker (rule 2).
*
* Main exports:
*  - view_default_edit_component_external  (constructor — namespace only)
*  - view_default_edit_component_external.render  (static async method — actual entry point)
*/

// imports
	import {ui} from '../../common/js/ui.js'
	import {append_source_status, build_entry_node} from './external_render.js'
	import {get_buttons} from './render_edit_component_external.js'



/**
* VIEW_DEFAULT_EDIT_COMPONENT_EXTERNAL
* Constructor placeholder — no instance state is needed; all logic is on static
* methods. Following Dédalo's view_* module convention, the constructor simply
* returns true so that callers can safely call `new view_default_edit_component_external()`
* without error, even though it is never instantiated in practice.
*/
export const view_default_edit_component_external = function() {

	return true
}//end view_default_edit_component_external



/**
* RENDER
* Build and return the full component DOM node for the default edit view.
*
* When options.render_level is 'content', only the inner content_data node is
* returned — no wrapper, no buttons. This allows callers such as
* component_common.prototype.refresh to replace only the content area without
* re-creating the outer wrapper, preserving event listeners attached to the wrapper.
*
* Side effects:
*  - Sets wrapper.content_data as a pointer to the inner content element so callers
*    can locate individual entry rows via self.node.content_data[i].
*
* @param {Object} self - The component_external instance.
*   Expected properties: self.permissions {number}, self.data {Object},
*   self.context {Object}, self.show_interface {Object}.
* @param {Object} options - Render configuration.
*   options.render_level {string} 'full' (default) | 'content' — controls whether
*   to build the outer wrapper and button bar, or return only the content area.
* @returns {Promise<HTMLElement>} The wrapper div (render_level='full') or the
*   content_data div (render_level='content').
*/
view_default_edit_component_external.render = async function(self, options)  {

	// options
		const render_level = options.render_level || 'full'

	// content_data
		const content_data = get_content_data_edit(self)
		if (render_level==='content') {
			return content_data
		}

	// buttons
		// Only rendered for users with write access (permissions > 1). Read-only
		// users (permissions === 1) receive no button bar at all.
		const buttons = (self.permissions > 1)
			? get_buttons(self)
			: null

	// wrapper. ui build_edit returns component wrapper
		const wrapper = ui.component.build_wrapper_edit(self, {
			content_data : content_data,
			buttons 	 : buttons
		})
		// set pointers
		wrapper.content_data = content_data


	return wrapper
}//end render



/**
* GET_CONTENT_DATA_EDIT
* Build the content_data container and populate it with one display node per entry
* in self.data.entries.
*
* When entries is empty, a synthetic [null] placeholder is injected so that at least
* one (blank) content_value node is always rendered — without it the component would
* appear completely empty on a record with no external data yet resolved.
*
* Each built entry node is stored both as a numeric property on content_data
* (content_data[i]) and appended as a DOM child, giving callers O(1) access to
* individual rows via self.node.content_data[i].
*
* Note: Unlike interactive components (e.g. component_input_text), this function
* does not branch on self.permissions because the external view is always read-only
* at the value level. The button bar (built separately) controls the available tools.
*
* The degradation marker is appended AFTER the value slots: this is the view a
* cataloguer works in, and it is the one place where an empty component must
* explain itself rather than look like a record with nothing to say.
*
* @param {Object} self - The component_external instance.
*   Expected: self.data.entries {Array|undefined} — array of pre-formatted entry strings.
* @returns {HTMLElement} content_data - The populated content container div.
*/
const get_content_data_edit = function(self) {

	// short vars
		const data		= self.data || {}
		const entries	= data.entries || []

	// content_data
		const content_data = ui.component.build_content_data(self)

	// values (inputs)
		// force one empty slot at least, so the component keeps its layout position
		const entries_length = (entries.length<1) ? 1 : entries.length

		for (let i = 0; i < entries_length; i++) {
			// get the content_value
			const content_value = get_content_value(i, self)
			// set the pointer
			content_data[i] = content_value
			// add node to content_data
			content_data.appendChild(content_value)
		}

	// source_status. Marker when the remote values are degraded (absent otherwise)
		append_source_status(content_data, data)


	return content_data
}//end get_content_data_edit



/**
* GET_CONTENT_VALUE
* Build one display node for the entry at index i.
*
* (!) CHANGED 2026-08-06 — the entry is no longer injected as HTML. It used to
* be, on the contract "the server is responsible for sanitising"; the server
* sanitised nothing, so a remote service's markup ran in the curator's session.
* build_entry_node now renders textContent unless the server marked THAT entry
* 'markup' (data.entries_kind), which it only does for values it put through
* its allowlist sanitizer. See external_render.js rule 1 — this is a deliberate
* behaviour change, and structured markup that was never declared as such now
* renders as the characters it contains.
*
* When the entry is absent (index 0 of an empty entries array, the synthetic
* slot get_content_data_edit forces) the node renders empty. This is
* intentional: the component must keep a visible slot to retain its layout
* position in the containing section — and the source_status marker, appended
* by the caller, is what tells the user WHY it is empty.
*
* No events are wired because component_external values are read-only on the
* client; the server exclusively controls the data via its remote API fetch.
*
* @param {number} i - Zero-based index of this entry in data.entries.
* @param {Object} self - The component_external instance; self.data supplies
*   both `entries` and the parallel `entries_kind`.
* @returns {HTMLElement} content_value - A <div class="content_value"> holding
*   the entry node (empty for the no-entry case).
*/
const get_content_value = (i, self) => {

	// content_value node
		return build_entry_node(self.data || {}, i, {
			element_type	: 'div',
			class_name		: 'content_value'
		})
}//end get_content_value



// @license-end
