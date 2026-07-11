// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0


// import
	import {ui} from '../../common/js/ui.js'



/**
* VIEW_DEFAULT_LIST_INVERSE
* Default list-view renderer for component_inverse.
*
* component_inverse stores back-references — it points from the current record to
* the section that references it (i.e. the inverse direction of a relation). Its data
* payload carries an `entries` array of relation objects, each with a `locator` sub-object
* whose `from_section_id` holds the numeric ID of the originating record.
*
* This namespace exposes a single static method (`render`) consumed by
* render_list_component_inverse when `context.view` is 'default' or unspecified.
* The constructor itself is a no-op placeholder; all functionality lives on the static
* `render` method.
*/
export const view_default_list_inverse = function() {

	return true
}//end view_default_list_inverse



/**
* RENDER
* Build the list-view DOM node for a component_inverse instance.
*
* Extracts the originating-record ID from the first entry's locator and passes it as
* a pre-formatted display string to `ui.component.build_wrapper_list`, which stamps the
* standard CSS classes and appends a <span> with the value when non-null.
*
* Only the first entry is surfaced here. If the component has multiple inverse relations
* (entries.length > 1), the additional entries are silently ignored in list view —
* they are handled in edit view where space allows a full listing.
*
* @param {Object} self - The component_inverse instance (provides .data, .context, .model, etc.).
* @param {Object} options - Render options forwarded from render_list_component_inverse.prototype.list.
* @returns {HTMLElement} wrapper - The constructed list wrapper element ready for DOM insertion.
*/
view_default_list_inverse.render = async function(self, options) {

	// short vars
		const data 		= self.data || {}
		const entries 	= data.entries || []

	// Value as string
	// Navigate the locator chain defensively: entries[0] may be absent (no inverse
	// relations exist for this record) or its locator may be missing (malformed data).
	// `from_section_id` is the numeric section ID of the record that points back to self.
		const value_string = entries && entries[0] && entries[0].locator
			? entries[0].locator.from_section_id
			: null

	// wrapper
	// build_wrapper_list applies standard CSS classes and, when value_string is provided,
	// appends a <span> containing it — no extra DOM manipulation needed here.
		const wrapper = ui.component.build_wrapper_list(self, {
			value_string : value_string
		})


	return wrapper
}//end render



// @license-end
