// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0


// import
	import {ui} from '../../common/js/ui.js'



/**
* VIEW_MINI_INVERSE
* Compact inline view for component_inverse used in autocomplete services and datalists.
*
* component_inverse is a read-only, derived component: it does not store data of its own.
* Instead, it exposes inverse-relation locators — records in other sections that hold a
* relation pointing back to the current section. Each entry in data.entries is one such
* locator, carrying fields like from_section_id, from_section_tipo, and from_component_tipo.
*
* This 'mini' view renders only the section-id of the first inverse locator as a compact
* <span> element (classes: 'mini' + '<model>_mini'), suitable for embedding in autocomplete
* drop-downs, summary cells, and other space-constrained contexts.
*
* Consumed by:
*   - render_edit_component_inverse.edit()   (case 'mini')
*   - render_list_component_inverse.list()   (case 'mini')
*
* @module view_mini_inverse
*/
export const view_mini_inverse = function() {

	return true
}//end view_mini_inverse



/**
* RENDER
* Builds a compact <span> wrapper displaying only the from_section_id of the first
* inverse-relation locator entry.
*
* The wrapper element is created by ui.component.build_wrapper_mini, which produces
* a <span> with CSS classes 'mini' and '<model>_mini'. The section-id string is
* then injected via insertAdjacentHTML('afterbegin', …).
*
* Data shape expected on self.data:
*   {
*     entries: [
*       {
*         locator: {
*           from_section_id:    {string}  — id of the referencing section record
*           from_section_tipo:  {string}  — tipo of the referencing section
*           from_component_tipo:{string}  — tipo of the referencing component
*         }
*       },
*       …   // further entries are ignored in this view; only entries[0] is displayed
*     ]
*   }
*
* (!) value_string is null when data.entries is empty or entries[0].locator is absent.
*     insertAdjacentHTML is then called with null, which coerces to the string "null"
*     in the DOM — no guard is applied here. Compare view_text_inverse.render which
*     falls back to the empty string '' instead.
*
* (!) The lookup path data.entries[0].locator.from_section_id diverges from the raw
*     server payload in api_data.json, where from_section_id sits directly on each
*     entry object (not nested under a .locator key). The access via .locator will
*     always be undefined unless the data was reshaped upstream before reaching this
*     view. This is a suspected stale accessor — do not "fix" here; flag for review.
*
* @param {Object} self    - The live component_inverse instance.
*   @param {Object}  self.data            - API data payload for this component.
*   @param {Array}   self.data.entries    - Inverse-locator entries; may be empty.
*   @param {string}  self.model           - Component model name (used for CSS class).
* @param {Object} options - Reserved for future use; not consumed by this function.
* @returns {Promise<HTMLElement>} The constructed <span> wrapper element.
*/
view_mini_inverse.render = async function(self, options) {

	// short vars
		const data = self.data

	// wrapper
		const wrapper = ui.component.build_wrapper_mini(self)

	// Value as string
		const value_string = data.entries && data.entries[0] && data.entries[0].locator
			? data.entries[0].locator.from_section_id
			: null

	// Set value (as text node to avoid HTML injection)
		wrapper.prepend(value_string !== null && value_string !== undefined ? String(value_string) : '')


	return wrapper
}//end render



// @license-end
