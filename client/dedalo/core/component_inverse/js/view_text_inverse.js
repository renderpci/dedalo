// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0



// imports
	import {ui} from '../../common/js/ui.js'



/**
* VIEW_TEXT_INVERSE
* Plain-text list renderer for component_inverse in 'text' view mode.
*
* Produces the minimal DOM representation of an inverse-reference component:
* a bare <span> whose innerHTML is the section_id of the first referencing record.
* Unlike view_default_list_inverse it does not use the standard ui.component
* wrapper builder, making it suitable for embedding inside rich-text contexts
* (e.g. a formatted report cell or a portal auto-complete suggestion) where the
* additional CSS chrome of the heavier wrappers would be disruptive.
*
* View routing:
*   render_list_component_inverse.list() dispatches here when
*   self.context.view === 'text'. The other list views are:
*     'default' → view_default_list_inverse  (standard wrapper via ui.component)
*     'mini'    → view_mini_inverse          (compact wrapper via ui.component.build_wrapper_mini)
*
* About inverse references:
*   component_inverse holds no stored data of its own. Its data is computed
*   server-side by section::get_inverse_references(), which collects every
*   locator object that points back at the current record from another section.
*   Each locator in data.entries carries:
*     { from_section_tipo, from_component_tipo, from_section_id }
*   where from_section_id is the numeric record ID of the referencing section.
*
* Exports:
*   view_text_inverse        — constructor stub (no-op; all logic is on the static render method)
*   view_text_inverse.render — async render function called by the list dispatcher
*/
export const view_text_inverse = function() {

	return true
}//end view_text_inverse



/**
* RENDER
* Build a plain <span> wrapper displaying the section_id of the first inverse
* reference as a plain text string.
*
* Only the first entry is rendered (data.entries[0]). component_inverse may
* contain multiple locators when several sections reference the same record, but
* this 'text' view is intentionally limited to the primary / most-recent one.
* Use view_default_list_inverse or view_default_edit_inverse when all referencing
* section IDs must be visible.
*
* Note: the existing doc-block described this as rendering a "URL", which is
* incorrect — from_section_id is an integer record identifier, not a URL.
* (!) FLAG: @param annotations used legacy no-brace style (@param object self);
*   migrated to brace style below. No code was changed.
*
* Data contract (from self):
*   self.data                  {Object}         Server response object; defaults to {} if absent.
*   self.data.entries          {Array<Object>}  Array of inverse-reference locator objects.
*   self.data.entries[0]       {Object}         First (and only used) locator entry.
*   self.data.entries[0].locator               {Object} Locator sub-object containing the
*                                              back-reference coordinates.
*   self.data.entries[0].locator.from_section_id {string|number} Record ID of the section
*                                              that holds the forward reference to this record.
*                                              Falls back to '' when data is absent or empty,
*                                              so the wrapper is never rendered with undefined.
*
* CSS classes applied to the wrapper <span>:
*   'wrapper_component' — standard Dédalo component wrapper marker
*   self.model          — component model (e.g. 'component_inverse')
*   self.mode           — current render mode (e.g. 'list', 'tm')
*   'view_<self.view>'  — current view variant (e.g. 'view_text')
*
* @param {Object} self    - The component_inverse instance. Must expose
*   self.data, self.model, self.mode, and self.view (see data contract above).
* @param {Object} options - Render options passed by the dispatcher. Not used
*   by this view; accepted to match the standard render signature.
* @returns {Promise<HTMLElement>} Resolves to the constructed <span> element
*   ready for DOM insertion.
*/
view_text_inverse.render = async function(self, options) {

	// short vars
		const data			= self.data || {}
		const value_string	= data.entries && data.entries[0] && data.entries[0].locator
			? data.entries[0].locator.from_section_id
			: ''

	// wrapper. Set as span
		const wrapper = ui.create_dom_element({
			element_type	: 'span',
			class_name		: `wrapper_component ${self.model} ${self.mode} view_${self.view}`,
			inner_html		: value_string
		})


	return wrapper
}//end render



// @license-end
