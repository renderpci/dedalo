// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL */
/*eslint no-undef: "error"*/



// imports
	import {view_default_list_inverse} from './view_default_list_inverse.js'
	import {view_mini_inverse} from './view_mini_inverse.js'
	import {view_text_inverse} from './view_text_inverse.js'



/**
* RENDER_LIST_COMPONENT_INVERSE
* Client-side list renderer for component_inverse.
*
* component_inverse is a read-only, computed component that exposes the
* "backlinks" of a section — i.e. the inverse relation locators describing
* which other sections reference the current record through portals or
* relationship fields. No data is stored for this component; its data is
* calculated on-the-fly server-side via section->get_inverse_references().
*
* This module provides the `list` prototype method that is mixed into
* component_inverse (see component_inverse.js). It is also aliased as `tm`
* (Time Machine mode), so both 'list' and 'tm' modes share the same renderer.
*
* View dispatch table (driven by context.view):
*   'default' — full wrapper element built by ui.component.build_wrapper_list,
*               showing the from_section_id of the first inverse locator entry.
*               This is the fallback for any unrecognised view value.
*   'mini'    — minimal wrapper element built by ui.component.build_wrapper_mini,
*               used in autocomplete overlays and compact embedding contexts.
*   'text'    — bare <span> element with inner_html set to the from_section_id
*               string; no extra chrome, suitable for plain-text output contexts.
*
* Data shape consumed (self.data):
*   {
*     entries: Array<{
*       locator: {
*         from_section_id   : string  // section_id of the record that references us
*         from_section_tipo : string  // ontology tipo of the referencing section
*         from_component_tipo: string // ontology tipo of the referencing portal/component
*       }
*     }>
*   }
*
* Only the first entry's locator is rendered by the list views; inverse
* relations with multiple callers are handled at grid/export level (see
* class.component_inverse.php::get_grid_value).
*
* @see view_default_list_inverse — 'default' view implementation
* @see view_mini_inverse         — 'mini' view implementation
* @see view_text_inverse         — 'text' view implementation
* @see render_edit_component_inverse — edit/search mode counterpart
*/
export const render_list_component_inverse = function() {

	return true
}//end render_list_component_inverse



/**
* LIST
* Builds and returns the DOM node for this component in list (and tm) mode.
*
* Reads `self.context.view` to select the appropriate view renderer, then
* delegates rendering to the corresponding view module. The resolved element
* is returned directly to the component lifecycle caller (common.prototype.render).
*
* Falls through to 'default' for any unrecognised view string, ensuring that
* missing or new view values never break the render pipeline.
*
* (!) This method is installed on component_inverse.prototype as both `list`
* and `tm` — Time Machine mode reuses the list render unchanged.
*
* @param {Object} options - render options forwarded verbatim to the view renderer
* @returns {Promise<HTMLElement>} the rendered wrapper element
*/
render_list_component_inverse.prototype.list = async function(options) {

	const self = this

	// view
		const view	= self.context.view || 'default'

	switch(view) {

		case 'mini':
			return view_mini_inverse.render(self, options)

		case 'text':
			return view_text_inverse.render(self, options)

		case 'default':
		default:
			return view_default_list_inverse.render(self, options)
	}
}//end list



// @license-end
