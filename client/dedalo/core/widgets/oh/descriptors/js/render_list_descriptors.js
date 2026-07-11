// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



/**
* RENDER_LIST_DESCRIPTORS
* List-mode renderer for the Oral History 'descriptors' widget.
*
* In list mode the server intentionally returns an empty value array
* (class.descriptors.php::get_data() short-circuits when mode === 'list').
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
	import {get_instance} from '../../../../common/js/instances.js'
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
* mode and calls self.refresh() so the server re-runs get_data() with
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
* flight and removed once the promise resolves.
*
* (!) The mouseup handler is not async; the spinner cleanup relies on
* .then() chained on the refresh() promise.  If refresh() rejects the
* spinner will remain in the DOM and the 'loading' class will not be
* removed.
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
		button_display.addEventListener('mouseup', function(e){
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

			self.refresh()
			.then(function(response){
				spinner.remove()
				button_display.classList.remove('loading')
			})
		})


	return content_data
}//end get_content_data_list



/**
* GET_VALUE_ELEMENT
* Build a single list item (<li>) for one IPO entry, showing the
* descriptor term count and the dd_grid term list on demand.
*
* Called once per IPO key within the descriptors widget when it is
* rendering in a context that already has value data available (i.e.
* after the mode has transitioned to edit and a refresh has been
* completed — this function is reachable from the list DOM even though
* it is defined in the list renderer module).
*
* Data shape expected in `data` (flat items, NOT nested under .value
* unlike render_edit_descriptors.js):
*   { widget_id: 'indexation', value: <number> }
*   { widget_id: 'terms',      value: <component_grid_value Object> }
*
* (!) Structural difference from render_edit_descriptors.js: that file
* accesses el.value.widget_id (nested), while this file accesses
* el.widget_id directly.  They consume the same PHP data shape but
* through different wrapping layers — verify alignment if the server
* data format changes.
*
* (!) If no item with widget_id === 'indexation' is found in `data`,
* data.find() returns undefined and the next line (`indexation.value`)
* will throw a TypeError.  There is no null guard here.
*
* If the indexation count is less than 1 the li is returned immediately
* without any content — callers can check for this empty-item case.
*
* Clicking the rendered value span toggles visibility of the
* descriptors_list_container via CSS class 'hide'.
*
* @param {number}      i                - Zero-based IPO entry index (for future
*                                         use; not currently consumed here).
* @param {Array}       data             - Flat array of widget data items for
*                                         this IPO entry (widget_id + value pairs).
* @param {HTMLElement} values_container - Parent element that receives the <li>.
* @param {Object}      self             - The descriptors widget instance.
* @returns {Promise<HTMLElement>} Resolves to the <li> element (may be empty
*                                 if indexation value < 1).
*/
const get_value_element = async (i, data, values_container, self) => {

	const indexation	= data.find(el => el.widget_id==='indexation')
	const value			= indexation.value

	// li
		const li = ui.create_dom_element({
			element_type	: 'li',
			class_name		: 'widget_item descriptors',
			parent			: values_container
		})

		if (value<1) {
			return li
		}

	// label
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'label',
			inner_html 		: get_label.terms || 'Terms',
			parent			: li
		})

	// value
		const column_id_value = ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'value link',
			inner_html		: value+'',
			parent			: li
		})
		column_id_value.addEventListener('click', async (e) => {
			e.stopPropagation();
			e.preventDefault();

			// toggle visibility when is already loaded
			descriptors_list_container.classList.toggle('hide')

		})

	// descriptors_list_container
		const descriptors_list_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'descriptors_list_container',
			parent			: li
		})

	// dd_grid build
		// Extract the pre-resolved component_grid_value object produced by
		// class.descriptors.php and wrap it in a single-element array as
		// dd_grid expects its `data` option to be an array of grid-value objects.
		const dd_grid_data	= [data.find(el => el.widget_id==='terms').value]
		const dd_grid		= await get_instance({
			model			: 'dd_grid',
			section_tipo	: self.section_tipo,
			section_id		: self.section_id,
			tipo			: self.section_tipo,
			mode			: 'list',
			lang			: page_globals.dedalo_data_lang,
			data			: dd_grid_data
		})
		await dd_grid.build(false)
		const node = await dd_grid.render()
		descriptors_list_container.appendChild(node)


	return li
}//end get_value_element



// @license-end
