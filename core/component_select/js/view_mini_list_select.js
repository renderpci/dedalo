// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'



/**
* VIEW_MINI_LIST_SELECT
* Compact list-mode view for component_select.
*
* Acts as a static-method namespace — the constructor is never instantiated.
* Provides a single static method, `render`, which is called by
* render_list_component_select.prototype.list when `self.context.view === 'mini'`.
*
* The 'mini' view is used in contexts that require a minimal, inline display of
* the selected value — for example, autocomplete suggestion rows or datalist
* thumbnails — where a full edit-capable wrapper would be too heavy.
*
* Produced DOM: a <span> with CSS classes 'mini' and '<model>_mini', containing
* the value string injected via insertAdjacentHTML (see ui.component.build_wrapper_mini).
*
* No click/interaction handlers are attached; this view is strictly read-only.
*/
export const view_mini_list_select = function() {

	return true
}//end view_mini_list_select



/**
* RENDER
* Builds the compact (mini) wrapper element for a component_select in list mode.
*
* Reads `self.data.entries` directly as a pre-rendered HTML string and passes it
* to `ui.component.build_wrapper_mini`, which inserts it via insertAdjacentHTML.
*
* (!) `self.data.entries` is consumed here as a raw string (with `|| ''` fallback),
* unlike `view_default_list_select` where `data.entries` is treated as an Array and
* joined with `.join(' ')`. Whether this difference is intentional (server sends a
* pre-rendered string only for mini mode) or a latent inconsistency is unclear from
* the code alone; callers should ensure the server response matches the expected type
* for the active view.
*
* (!) The `options` parameter is declared in the signature but is never referenced
* inside the function body. It is accepted for API symmetry with other view render
* methods called by render_list_component_select.prototype.list.
*
* @param {Object} self    - The component_select instance. Must expose:
*                           - self.data         {Object} component data payload
*                           - self.data.entries {string|Array|undefined} pre-rendered
*                                               value string (or falsy if empty)
*                           - self.model        {string} used by build_wrapper_mini for CSS class
* @param {Object} options - Render options (currently unused; present for API parity)
* @returns {Promise<HTMLElement>} Resolves to the constructed <span> mini wrapper element
*/
view_mini_list_select.render = async function(self, options) {

	// short vars
		const value_string	= self.data.entries || ''

	// wrapper
		const wrapper = ui.component.build_wrapper_mini(self, {
			value_string : value_string
		})


	return wrapper
}//end render



// @license-end
