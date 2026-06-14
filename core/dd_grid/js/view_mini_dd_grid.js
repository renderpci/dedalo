// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



/**
* VIEW_MINI_DD_GRID
* Compact ('mini') card-style view for the dd_grid component.
*
* This module implements the 'mini' view variant dispatched by
* render_list_dd_grid.prototype.list when self.view === 'mini'.
* Instead of wrapping each grid data item in a <div> container (as
* view_default_dd_grid does), it flattens the nested data tree into a plain
* array of inline DOM nodes — text spans, images, IRI anchors, etc. — that are
* appended directly into a single wrapper <div>. This produces a compact,
* flow-layout card suitable for summarising a record in limited space, such as
* inside search result lists or relation picker overlays.
*
* Key differences from view_default_dd_grid:
*  - No wrapping <div> per column; all leaf nodes go directly into the wrapper.
*  - Text columns use use_fallback=true so the first non-empty value is always
*    displayed (primary or fallback_value), keeping the card content-rich even
*    when primary values are absent.
*  - Empty text nodes are suppressed; a plain space string (' ') is inserted
*    after each non-empty text span so the browser can wrap long inline content.
*  - get_label_column and get_button_column are intentionally NOT imported (they
*    are commented out in the import list) because the mini view never renders
*    column labels or action buttons.
*
* Data shape expected in self.data (server-produced):
*   Array<{
*     type      : string,   // 'column' | 'row' | other container type
*     cell_type : string,   // 'text'|'av'|'img'|'iri'|'json'|'section_id'
*     class_list: string,   // optional extra CSS classes on the leaf element
*     value     : Array|*,  // leaf value array OR nested child data for recursion
*     fallback_value: Array|*, // optional; used by text columns when value is empty
*   }>
*
* Exports: {view_mini_dd_grid}
*/

// imports
	import {ui} from '../../common/js/ui.js'
	import {
		get_text_column,
		get_av_column,
		get_img_column,
		// get_label_column,
		// get_button_column,
		get_json_column,
		get_section_id_column,
		get_iri_column
	} from './render_list_dd_grid.js'



/**
* VIEW_MINI_DD_GRID
* Constructor namespace for the mini view.
* Not instantiated; used solely as a static-method host for view_mini_dd_grid.render.
*/
export const view_mini_dd_grid = function() {

	return true
}//end view_mini_dd_grid



/**
* RENDER
* Build and return the root wrapper element for the mini dd_grid view.
*
* Creates a <div class="wrapper_dd_grid ..."> containing all inline leaf nodes
* produced by get_grid_nodes(). The wrapper's class list encodes the component
* tipo, interaction mode, and view name so LESS/CSS rules can target each
* combination independently.
*
* Note: render_level is read from options but not used in this view — it is
* retained so the signature matches the other view renderers, which do branch
* on render_level for progressive rendering.
*
* @param {Object} self - dd_grid instance; must have .data {Array}, .tipo {string},
*   .mode {string}, and .view {string} populated by dd_grid.prototype.init
* @param {Object} options - render options forwarded by render_list_dd_grid.prototype.list
* @param {string} [options.render_level='full'] - rendering depth hint (unused in mini view)
* @returns {Promise<HTMLElement>} wrapper div containing the flattened inline grid nodes
*/
view_mini_dd_grid.render = async function(self, options) {

	// options
		const render_level = options.render_level || 'full'

	// data
		const data	= self.data

	// wrapper
		const wrapper = ui.create_dom_element({
			element_type	: 'div',
			class_name		: `wrapper_dd_grid ${self.tipo} ${self.mode} view_${self.view}`
		})

	// grid. Array of nodes deep resolved
		const grid = get_grid_nodes( data )
		wrapper.append(...grid)


	return wrapper
}//end render



/**
* GET_GRID_NODES
* Recursively convert a server-produced dd_grid data array into a flat array
* of DOM nodes suitable for inline flow layout (the mini view).
*
* The function walks data depth-first:
*  - If an item has type === 'column' and a cell_type, it delegates to the
*    appropriate column-builder helper from render_list_dd_grid.js and pushes
*    the resulting node into the output array.
*  - The 'text' / default branch passes use_fallback=true so that
*    fallback_value is substituted when the primary value is empty. Only
*    non-empty text nodes are appended; a plain space string (' ') is pushed
*    immediately after each one to allow the browser to wrap long runs of
*    inline content without inserting unwanted markup.
*  - If an item is a container (any type without cell_type, e.g. 'row'), its
*    .value array is recursed into and the resulting child nodes are spread
*    into the current output array (no wrapper element added, keeping the mini
*    layout flat).
*  - Items that are falsy or lack a .type property are skipped with a warning.
*
* Contrast with view_default_dd_grid.get_grid_nodes(), which wraps every item
* in a <div> and returns a DocumentFragment rather than a flat array.
*
* @param {Array} data - array of data-item objects from the dd_grid server response
* @returns {Array<HTMLElement|string>} flat array of DOM nodes and space strings
*   ready to be appended to the wrapper via wrapper.append(...grid)
*/
const get_grid_nodes = function(data) {

	const nodes = []

	const data_len = data.length
	for (let i = 0; i < data_len; i++) {

		// data_item. could be type column or row
			const data_item = data[i]

		// check data_item is valid
			if (!data_item || !data_item.type) {
				console.warn('Ignored bad data_item:', data_item);
				continue;
			}

		// column
			if(data_item.type==='column' && data_item.cell_type) {

				// column cell value
				switch(data_item.cell_type) {
					case 'av':
						nodes.push(
							get_av_column(data_item)
						)
						break;

					case 'img':
						nodes.push(
							get_img_column(data_item)
						)
						break;

					case 'json':
						nodes.push(
							get_json_column(data_item)
						)
						break;

					case 'section_id':
						nodes.push(
							get_section_id_column(data_item)
						)
						break;

					case 'iri':
						nodes.push(
							get_iri_column(data_item)
						)
						break;

					case 'text':
					default: {
						// (!) use_fallback=true: mini view always prefers showing
						// fallback_value when primary value is absent, to keep
						// compact cards content-rich.
						const column_node = get_text_column(
							data_item,
							true // use fallback value
						)
						// add only non empty nodes
						if (column_node.firstChild) {
							nodes.push(column_node)
							// add space node to allow browser cut long text
							nodes.push(' ')
						}
						break;
					}
				}//end switch(data_item.cell_type)
			}else{

				// value. Recursion
				// Container node (e.g. type='row'): recurse into .value and
				// spread the child nodes flat — no wrapping element is added,
				// preserving the inline flow layout of the mini view.
					if(data_item.value) {
						const child_nodes = get_grid_nodes(data_item.value)
						nodes.push(...child_nodes)
					}
			}//end if(data_item.type==='column' && data_item.cell_type)
	}//end for (let i = 0; i < data_len; i++)


	return nodes
}//end get_grid_nodes



// @license-end
