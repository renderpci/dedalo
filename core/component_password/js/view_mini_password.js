// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'



/**
* VIEW_MINI_PASSWORD
* Read-only mini view for component_password.
*
* This view is used when a password component appears inside an autocomplete
* suggestion list, a portal thumbnail, or any other context that requests the
* 'mini' render level.  Because a password's raw value must never be exposed
* to the browser, the rendered node always shows a fixed placeholder string
* ('****************') regardless of the stored datum.
*
* The view follows the same constructor-plus-static-render pattern as every
* other Dédalo view module: the exported function is a no-op constructor
* (required by the component dispatch machinery) and the real work is done by
* the static `render` method attached directly to that constructor.
*
* Exports:
*   view_mini_password          - Constructor (no-op; required by component dispatch)
*   view_mini_password.render   - Static async render factory
*/



/**
* VIEW_MINI_PASSWORD
* No-op constructor required by the Dédalo component view dispatch system.
* Component dispatch creates instances of view objects; the actual rendering
* is performed by the static `render` method, not the constructor body.
* @returns {boolean} Always returns true (signals successful instantiation).
*/
export const view_mini_password = function() {

	return true
}//end view_mini_password



/**
* RENDER
* Builds a mini wrapper node for component_password.
*
* Intended for use inside autocomplete suggestion lists, portal thumbnails,
* or any other context that requests the 'mini' render level.  The component
* should rarely appear in these contexts (passwords are not meaningful in
* lists), but the view is provided so the page does not break if an operator
* accidentally adds a password component to such a layout.
*
* Security note: the actual password value is NEVER included in the rendered
* output.  The fixed obfuscation string '****************' is always used in
* place of `data.entries[*].value`, so no plaintext or hashed credential is
* sent to or rendered in the browser.
*
* The `entries` variable is extracted from `self.data` following the standard
* Dédalo datum shape, but it is intentionally unused in the render body — the
* obfuscation string is hardcoded and does not depend on whether an entry
* exists.
* (!) FLAG: `entries` is declared but never read. This is intentional by design
*     (security through constant masking), but static analysis tools may warn
*     about the unused variable. Do not remove the declaration — it documents
*     that the component correctly receives data even when it does not render it.
*
* @param {Object} self    - The component_password instance, providing `.data`
*                           (Dédalo datum object with `.entries` array) and all
*                           standard instance properties consumed by
*                           `ui.component.build_wrapper_mini`.
* @param {Object} options - Render options passed by the component dispatcher
*                           (not currently consumed by this view).
* @returns {HTMLElement} wrapper - A <span> element built by
*                           `ui.component.build_wrapper_mini`, with `.type`
*                           set to 'password' so parent contexts can identify
*                           the component kind without inspecting instance data.
*/
view_mini_password.render = async function(self, options) {

	// short vars
		const data		= self.data
		const entries	= data.entries || []

	// Value as string
	// Password values are never displayed; always use the fixed obfuscation
	// string so no credential data reaches the browser DOM.
		const value_string = '****************' // value


	// wrapper
	// build_wrapper_mini returns a <span> with CSS classes 'mini' and
	// '<model>_mini', and inserts value_string via insertAdjacentHTML.
		const wrapper = ui.component.build_wrapper_mini(self, {
			value_string : value_string
		})
		// Mark the wrapper type so parent contexts (e.g. autocomplete lists)
		// can detect the field kind without reading the component instance.
		wrapper.type = 'password'


	return wrapper
}//end render



// @license-end
