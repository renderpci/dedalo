// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'



/**
* VIEW_DESCRIPTORS_DD_GRID
* The "descriptors" view variant of dd_grid.
*
* Rather than rendering a row-per-record grid (as view_default_dd_grid does),
* this view aggregates all leaf column values across every record and renders a
* frequency-sorted tag cloud / descriptor list.  Each unique string label gets
* one `.descriptors_item` div; a `.descriptors_item_total` badge shows how many
* records share that label.
*
* Dispatch path (render_list_dd_grid.prototype.list):
*   view === 'descriptors'  →  view_descriptors_dd_grid.render(self, options)
*
* Exports:
*   view_descriptors_dd_grid          - namespace constructor (always returns true)
*   view_descriptors_dd_grid.render   - async render entry point
*/
export const view_descriptors_dd_grid = function() {

	return true
}//end view_descriptors_dd_grid



/**
* RENDER
* Build the wrapper DOM node for the 'descriptors' view of a dd_grid instance.
*
* Reads `self.data` (the server-supplied grid tree), calls `get_grid_nodes` to
* produce a DocumentFragment of aggregated descriptor items, and returns the
* wrapping div.  The wrapper carries `wrapper_dd_grid`, the section tipo, the
* current mode, and `view_descriptors` CSS classes so LESS rules can target it.
*
* @param {Object} self    - The dd_grid instance; must expose `.data`, `.tipo`,
*                           `.mode`, and `.view`.
* @param {Object} options - Render options (currently unused in this view).
* @returns {Promise<HTMLElement>} The populated wrapper div.
*/
view_descriptors_dd_grid.render = async function(self, options) {

	// data
		const data = self.data

	// wrapper
		const wrapper = ui.create_dom_element({
			element_type	: 'div',
			class_name		: `wrapper_dd_grid ${self.tipo} ${self.mode} view_${self.view}`
		})

	// grid. Value as string
		const grid = get_grid_nodes( data )
		wrapper.appendChild(grid)


	return wrapper
}//end render



/**
* GET_GRID_NODES
* Recursively traverse the dd_grid data tree, aggregate column values by label,
* sort alphabetically, and render one `.descriptors_item` div per unique label.
*
* Algorithm overview:
*   1. The inner `get_grid_values` walk visits every node in the tree.
*      - A node with `type === 'column'` AND a truthy `cell_type` is a leaf
*        whose display value is `value[0]` (falling back to `fallback_value[0]`
*        when `value` is absent or empty).
*      - Non-column nodes (rows, groups) are traversed for their `.value`
*        children to reach nested columns.
*   2. Each unique label string is accumulated into `ar_values` as
*      `{ label: string, total: number }`.  Duplicate labels increment `total`.
*   3. Items without a resolved label are silently skipped.
*   4. The accumulated array is locale-sorted (numeric, case-insensitive) so
*      that labels such as "2. Dating" sort before "10. Material".
*   5. For each sorted item a `.descriptors_item` div is created containing a
*      `.descriptors_item_total` badge span.
*
* Data shape expected (server-supplied grid tree, one level shown):
* @example
* [
*   {
*     type: 'row',
*     value: [
*       { type: 'column', cell_type: 'text', value: ['Bronze'], fallback_value: [''] },
*       { type: 'column', cell_type: 'text', value: [],         fallback_value: ['unknown'] }
*     ]
*   },
*   ...
* ]
*
* @param {Array} data - The root (or recursive) array of grid node objects.
*   If data item type is 'column', generates a node, else recursively resolve the value
* @returns {DocumentFragment} Fragment containing `.descriptors_item` divs,
*   one per unique label, in locale sort order.
*/
const get_grid_nodes = function(data) {

	const fragment = new DocumentFragment()

	// ar_values accumulates { label: string, total: number } entries.
	// Defined in get_grid_nodes scope so that the inner recursive function
	// can push into it without returning anything.
	const ar_values = []

	/**
	* GET_GRID_VALUES
	* Inner recursive walk that populates the outer `ar_values` array.
	* Declared as a named function expression so it can call itself by name.
	*
	* @param {Array} data - Array of grid node objects at the current depth.
	* @returns {void}
	*/
	function get_grid_values(data) {

		const data_len = data.length
		for (let i = 0; i < data_len; i++) {

			const current_data = data[i]
			if (current_data && current_data.type) {

				// column
				// A leaf node with both `type === 'column'` and a `cell_type`
				// holds a displayable value.  Pick `value[0]` when available,
				// otherwise fall back to `fallback_value[0]`.
					if(current_data.type==='column' && current_data.cell_type) {

						const current_value	= current_data.value && current_data.value[0]
							? current_data.value[0]
							: current_data.fallback_value[0]

						// Increment existing label counter or register a new one.
						// Nodes whose resolved label is falsy (empty string, null,
						// undefined) are skipped — they would produce meaningless
						// blank descriptor items.
						const found = ar_values.find(el => el.label===current_value)
						if (found) {
							found.total++
						}else{
							if (current_value) {
								ar_values.push({
									label : current_value,
									total : 1
								})
							}
						}
					}//end if(current_data.type==='column' && current_data.cell_type)

				// value. Recursion
				// Non-leaf nodes (rows, groups, etc.) may carry nested child
				// nodes in their `.value` array — descend into them.
					if(current_data.value) {
						get_grid_values(current_data.value)
					}
			}
		}//end for (let i = 0; i < data_len; i++)
	}
	get_grid_values(data)

	// sort items
	// Locale-aware numeric sort keeps "9. X" before "10. X".
	// Empty labels are pushed to the very end via the 'zzz' sentinel.
		ar_values.sort((a, b) => {
			const a_label = a.label || 'zzz'
			const b_label = b.label || 'zzz'
			return a_label.localeCompare(b_label, undefined, { numeric: true, sensitivity: 'base' })
		});

	// Build one `.descriptors_item` div per unique label.
	// The inner `.descriptors_item_total` span is appended as a child so CSS
	// can position it (e.g. as a badge) relative to the label text.
	const ar_values_length = ar_values.length
	for (let i = 0; i < ar_values_length; i++) {
		const item = ar_values[i]
		const text_node = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'descriptors_item',
			inner_html		: `${item.label}`
		})
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'descriptors_item_total',
			inner_html		: `${item.total}`,
			parent			: text_node
		})

		fragment.appendChild(text_node)
	}


	return fragment
}//end get_grid_nodes



/**
* GET_DIV_CONTAINER
* Create a generic container div for a single grid data node, merging the
* node's structural `type` with any optional `class_list` CSS classes.
*
* When `current_data.class_list` is present the resulting class string is
* `"<type> <class_list>"` (type first so LESS rules can key on it);
* otherwise just `"<type>"` is used.
*
* Note: Unlike `view_indexation_dd_grid`'s homonymous function, this version
* does NOT apply `--base_color` CSS custom properties, since the descriptors
* view does not use section-level colour theming.
*
* @param {Object} current_data           - A single grid node object.
* @param {string} current_data.type      - Structural role, e.g. 'row', 'column', 'group'.
* @param {string} [current_data.class_list] - Optional extra CSS classes from the server.
* @returns {HTMLElement} A `<div>` with the resolved class string applied.
*/
const get_div_container = function(current_data) {

	const class_list = (current_data.class_list)
		? current_data.type + ' ' + current_data.class_list
		: current_data.type

	const div_container = ui.create_dom_element({
		element_type	: 'div',
		class_name		: class_list
	})


	return div_container
}//end get_div_container



// @license-end
