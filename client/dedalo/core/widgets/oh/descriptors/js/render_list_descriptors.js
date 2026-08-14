// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



/**
* RENDER_LIST_DESCRIPTORS
* List-mode renderer for the Oral History 'descriptors' widget.
*
* In list mode the server intentionally returns an empty value array
* (src/core/components/component_info/widgets/oh/descriptors.ts short-circuits
* with `if (context.mode === 'list') return []`, so a list row never pays for
* the portal read + grid build).
* This renderer therefore shows a lightweight placeholder button instead
* of the full thesaurus term grid.  When the user clicks the button the
* widget switches to 'edit' mode, triggers a full server round-trip via
* self.refresh(), and hands off to render_edit_descriptors.js — which
* receives the actual 'indexation' and 'terms' data items and builds the
* complete dd_grid view.
*
* Prototype assignment (in descriptors.js):
*   descriptors.prototype.list = render_list_descriptors.prototype.list
*
* Exports:
*   render_list_descriptors — constructor / prototype host; used only as a
*                             mixin source; never instantiated directly.
*/

// imports
	import {ui} from '../../../../common/js/ui.js'



/**
* RENDER_LIST_DESCRIPTORS
* Prototype constructor used exclusively as a mixin host.
* Instances are never created directly; the prototype method (.list) is
* copied onto the descriptors constructor in descriptors.js.
* @returns {boolean} true
*/
export const render_list_descriptors = function() {

	return true
}//end render_list_descriptors



/**
* LIST
* Render node for use in modes: list, list_in_list.
*
* Produces a widget wrapper that contains only a toggle button.
* Full term data is intentionally deferred: the server returns an empty
* value array in list mode for performance (no IPO resolution, no DB
* queries for term counts).  The button switches the widget to 'edit'
* mode and calls self.refresh() so the server re-resolves the widget with
* the full IPO processing pipeline.
*
* When render_level === 'content', returns the inner content_data element
* directly (used by callers that manage the wrapper themselves, e.g.
* component_info grid cells).
*
* @param {Object} options - Render options supplied by the lifecycle orchestrator.
* @param {string} options.render_level - 'content' → return content_data only;
*                                        any other value → return full wrapper.
* @returns {Promise<HTMLElement>} Resolves to the wrapper (or content_data when
*                                 render_level === 'content').
*/
render_list_descriptors.prototype.list = async function(options) {

	const self = this

	const render_level = options.render_level

	// content_data
		const content_data = await get_content_data_list(self)
		if (render_level==='content') {
			return content_data
		}

	// wrapper. ui build_edit returns widget wrapper
		const wrapper = ui.widget.build_wrapper_edit(self, {
			content_data : content_data
		})
		wrapper.content_data = content_data


	return wrapper
}//end list



/**
* GET_CONTENT_DATA_LIST
* Build the list-mode content area for the descriptors widget.
*
* Renders a single 'Terms' button.  On click the widget transitions to
* edit mode (removes the 'list' CSS class, adds 'edit') and calls
* self.refresh() so the server returns the full IPO-resolved data set
* consumed by render_edit_descriptors.js.
*
* A spinner element is appended to content_data while the refresh is in
* flight.  The handler awaits the refresh and clears the spinner and the
* 'loading' class in a finally block, so the cleanup also runs when the
* refresh rejects; the failure itself is reported with console.error and
* never swallowed.
*
* @param {Object} self - The descriptors widget instance (bound as `this`
*                        in render_list_descriptors.prototype.list).
* @returns {Promise<HTMLElement>} Resolves to the content_data div element.
*/
const get_content_data_list = async function(self) {

	// content_data
		const content_data = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'content_data widget'
		})

	// button_display
		const button_display = ui.create_dom_element({
			element_type	: 'button',
			class_name		: 'button_display',
			inner_html 		: get_label.terms || 'Terms',
			parent			: content_data
		})
		button_display.addEventListener('mouseup', async function(e){
			e.stopPropagation()

			button_display.classList.add('loading')

			// spinner
				const spinner = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'spinner small',
					parent			: content_data
				})

			// change mode
				self.mode = 'edit'
				self.node.classList.remove('list')
				self.node.classList.add('edit')

			try {
				await self.refresh()
			} catch (error) {
				// Never swallowed: the failure is visible in console and the cell stays interactive.
				console.error('Error refreshing descriptors widget:', error)
			} finally {
				spinner.remove()
				button_display.classList.remove('loading')
			}
		})


	return content_data
}//end get_content_data_list



// @license-end
