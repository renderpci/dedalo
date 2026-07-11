// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'



/**
* VIEW_DEFAULT_LIST_PUBLICATION
* Default list-mode view for component_publication.
*
* Renders a compact, read-friendly row for the publication status of a record
* inside a section list. This is the view that `render_list_component_publication`
* selects when `context.view` is 'default' (or absent). The other list views —
* 'mini' (view_mini_list_publication) and 'text' (view_text_list_publication) —
* serve more restricted display contexts.
*
* Unlike the edit views, this module exposes only a single static method (`render`);
* the constructor returns `true` and is never instantiated. This follows the
* Dédalo static-namespace pattern shared by all view_* modules.
*
* Interaction contract:
*   A click on the rendered wrapper promotes the component from list mode to
*   edit/line mode via `instance.change_mode()`, allowing the user to toggle the
*   publication switch inline without navigating to the full record editor.
*   The promotion is suppressed when `show_interface.read_only === true`, though
*   event propagation is deliberately NOT stopped in that branch so that parent
*   containers (e.g. portal rows) still receive the click.
*
* Data shape expected on `self.data`:
*   {
*     entries: Array<{
*       id              : number,
*       type            : string,   // DEDALO_RELATION_TYPE_LINK ('dd151')
*       section_id      : string,   // '1' = yes/published, '2' = no/not published
*       section_tipo    : string,   // DEDALO_SECTION_SI_NO_TIPO ('dd64')
*       from_component_tipo : string
*     }>
*   }
*   The entries array contains at most one locator because each record has a single
*   publication state. An empty array means the state has not been set.
*/
export const view_default_list_publication = function() {

	return true
}//end view_default_list_publication



/**
* RENDER
* Builds the list-mode DOM node for a component_publication instance.
*
* The rendered wrapper contains a `<span>` whose text is derived from
* `data.entries.join(' ')`. Because `entries` holds locator objects rather
* than plain strings, the join produces "[object Object]" for each entry —
* see the FLAG below. In practice the wrapper's visual value is less important
* than the click-to-edit affordance it provides.
*
* When `show_interface.read_only` is false, a click listener upgrades the
* component to 'edit' mode with the 'line' view, rendering the inline toggle
* switch inside the same DOM position without a full page reload.
*
* (!) FLAG — value_string: `entries.join(' ')` coerces each locator Object
*     to "[object Object]". The other list views (mini, text) use
*     `entries.join(self.context.fields_separator)` and may suffer the same
*     issue. The intended display value is probably the resolved yes/no label
*     from `data.datalist` (see get_content_value_read in
*     render_edit_component_publication.js). Do not fix here; track separately.
*
* (!) FLAG — separator: this file uses a hardcoded space `' '` as the join
*     separator instead of `self.context.fields_separator` which the sibling
*     views (mini, text) use. The discrepancy may be intentional (single-entry
*     use-case) but is undocumented.
*
* @param {Object} self - component_publication instance (the Dédalo component
*   object carrying .data, .context, .show_interface, .change_mode, etc.)
* @param {Object} options - render options (not currently consumed by this view,
*   forwarded for API consistency with other view modules)
* @returns {Promise<HTMLElement>} resolves to the wrapper div built by
*   ui.component.build_wrapper_list — a `<div class="wrapper_component
*   component_publication <tipo> <section_tipo>_<tipo> list view_default">` node
*/
view_default_list_publication.render = async function(self, options) {

	// short vars
		const data			= self.data || {}
		const entries		= data.entries || []
		// (!) entries contains locator objects; join coerces each to "[object Object]"
		const value_string	= entries.join(' ')

	// wrapper
		// build_wrapper_list creates the standard component wrapper <div> and
		// appends a <span> with value_string when the string is truthy.
		const wrapper = ui.component.build_wrapper_list(self, {
			value_string : value_string
		})
		wrapper.addEventListener('click', function(e){
			if (self.show_interface.read_only===true) {
				// do not stop propagation here
				// Propagation is intentionally left running so that parent
				// containers (portal rows, list rows) can handle the click event
				// when the component is in read-only mode.
				return
			}

			e.stopPropagation()

			// Promote to inline edit mode so the user can toggle the publication
			// switch without navigating away from the list context.
			self.change_mode({
				mode : 'edit',
				view : 'line'
			})
		})


	return wrapper
}//end render



// @license-end
