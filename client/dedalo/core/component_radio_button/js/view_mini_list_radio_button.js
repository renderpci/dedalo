// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'



/**
* VIEW_MINI_LIST_RADIO_BUTTON
* Compact read-only list renderer for component_radio_button in 'mini' view mode.
*
* Responsibilities:
*   - Produce a lightweight <span> wrapper (via ui.component.build_wrapper_mini) that
*     displays the component's selected radio-button value as a single flat string.
*   - Serve contexts that embed component values inline without interaction — for example
*     autocomplete suggestions, datalist popups, portal row previews, and table cells
*     where the full 'default' list view (with click-to-edit) would be too heavy.
*
* View routing:
*   render_list_component_radio_button.prototype.list dispatches to this module when
*   self.context.view === 'mini'.  The other list views are:
*     'default' → view_default_list_radio_button  (adds click-to-edit handler)
*     'text'    → view_text_list_radio_button     (uses a plain <span>, not the ui wrapper)
*
* Data contract:
*   self.data.entries — In mini mode the server delivers entries as a pre-serialized
*                       display string (not as an Array<locator> as in default/edit modes).
*                       When there is no selected value the server omits the property and
*                       the fallback empty string '' is used.
*   self.model        — String model identifier; used by build_wrapper_mini to compose
*                       CSS class names (e.g. 'component_radio_button_mini').
*
* No interactive listeners are attached — this view is intentionally read-only.
* For a clickable list view that allows in-place editing, use view_default_list_radio_button.
*
* Exports:
*   view_mini_list_radio_button        — constructor stub (no-op; all logic on the static render)
*   view_mini_list_radio_button.render — async render called by render_list_component_radio_button
*/
export const view_mini_list_radio_button = function() {

	return true
}//end view_mini_list_radio_button



/**
* RENDER
* Builds and returns the mini wrapper node for a component_radio_button in list context.
*
* Reads the pre-serialized display string from self.data.entries (or falls back to '')
* and injects it into a <span class="mini component_radio_button_mini"> element built
* by ui.component.build_wrapper_mini.
*
* In mini mode the server delivers data.entries as a single string rather than an
* Array<locator>, matching the behaviour of view_mini_list_select.  The value_string
* is passed directly to build_wrapper_mini (which inserts it via insertAdjacentHTML),
* so HTML markup in the resolved label (e.g. <mark> tags from search highlighting) is
* preserved.
*
* No event listeners are added; the returned node is display-only.
*
* Called by:
*   render_list_component_radio_button.prototype.list  (when context.view === 'mini')
*
* @param {Object} self    - The component_radio_button instance.
*                           Must expose:
*                             self.data.entries  {string} pre-serialized display value, or omitted
*                             self.model         {string} used by build_wrapper_mini for CSS class
* @param {Object} options - Reserved options object forwarded from the list dispatcher;
*                           not currently consumed by this view.
* @returns {Promise<HTMLElement>} Resolves to the rendered <span> ready to be inserted into the DOM.
*/
view_mini_list_radio_button.render = async function(self, options) {

	// Value as string
		const value_string = self.data.entries || ''

	// wrapper
		const wrapper = ui.component.build_wrapper_mini(self, {
			value_string : value_string
		})


	return wrapper
}//end render



// @license-end
