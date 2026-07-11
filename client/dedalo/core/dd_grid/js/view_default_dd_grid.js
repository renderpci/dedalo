// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'
	import {
		get_text_column,
		get_av_column,
		get_img_column,
		get_label_column,
		get_button_column,
		get_json_column,
		get_section_id_column,
		get_iri_column
	} from './render_list_dd_grid.js'



/**
* VIEW_DEFAULT_DD_GRID
* Default free-form card view for the dd_grid component.
*
* This module provides the 'default' view variant used by render_list_dd_grid
* when no specific view ('table', 'mini', 'indexation', 'descriptors') is
* requested. It renders each grid data item as a nested set of <div> containers
* rather than a <table>, which is appropriate for non-tabular layouts such as
* record cards or compact summary panels.
*
* Architecture:
* - view_default_dd_grid is a static-method namespace (not instantiated).
* - render_list_dd_grid.prototype.list() delegates here when view === 'default'.
* - The server builds the nested data array passed via self.data; this module
*   only produces DOM from that shape — no API calls are made here.
*
* Data shape expected in self.data (server-produced):
*   Array<{
*     type      : string,      // 'column' | 'row' | container type
*     cell_type : string,      // 'text' | 'av' | 'img' | 'iri' | 'button' | 'json' | 'section_id'
*     class_list: string,      // optional extra CSS classes
*     render_label: boolean,   // whether to prepend a <label> node
*     label     : string,      // label text (used when render_label is true)
*     value     : Array|*,     // leaf value array OR nested child data array for recursion
*   }>
*
* Exports: view_default_dd_grid (constructor namespace with .render static method)
*/
export const view_default_dd_grid = function() {

	return true
}//end view_default_dd_grid



/**
* RENDER
* Build and return the root wrapper element for the default dd_grid view.
*
* Creates a <div class="wrapper_dd_grid ..."> and populates it with the
* full DOM tree produced by get_grid_nodes() from self.data. The wrapper's
* class list encodes the component tipo, interaction mode, and view name so
* CSS rules can target each combination independently.
*
* @param {Object} self - dd_grid instance; must have .data, .tipo, .mode, .view
* @param {Object} options - render options (currently unused in this view)
* @returns {HTMLElement} wrapper div containing the rendered grid nodes
*/
view_default_dd_grid.render = async function(self, options) {

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
* Recursively converts a server-produced dd_grid data array into a DOM
* DocumentFragment of nested <div> containers.
*
* For each item in data:
*  1. A container div is created via get_div_container() using item.type
*     (and optional item.class_list) as CSS classes.
*  2. If item.type === 'column' and item.render_label is truthy, a <label>
*     node is prepended inside the container.
*  3. If item.type === 'column' and item.cell_type is set, the appropriate
*     leaf renderer from render_list_dd_grid.js is called (see switch).
*  4. If item.value is a nested array (container or row type), the function
*     recurses — allowing arbitrary nesting depth driven by the server layout.
*  5. Items without a .type property are skipped (continue).
*
* The 'text' case is the fallback for any unrecognised cell_type values.
* use_fallback is explicitly passed as false: the default view does not fall
* back to a fallback_value (callers that need fallback should use a different
* render path or wrap the call themselves).
*
* @param {Array} data - array of data-item objects produced by the dd_grid server response
* @returns {DocumentFragment} fragment containing one <div> per valid data item
*/
const get_grid_nodes = function(data) {

	const fragment = new DocumentFragment()

	const data_len = data.length
	for (let i = 0; i < data_len; i++) {
		const current_data = data[i]

		const cell_nodes = []
		if (current_data && current_data.type) {

			// node
				const node = get_div_container(current_data)

			// label
				if(current_data.type==='column' && current_data.render_label){
					const label_node = get_label_column(current_data)
					node.appendChild(label_node)
				}

			// column
				if(current_data.type==='column' && current_data.cell_type){

					switch(current_data.cell_type) {
						case 'av':
							node.appendChild(
								get_av_column(current_data)
							)
							break;

						case 'img':
							node.appendChild(
								get_img_column(current_data)
							)
							break;

						case 'iri':
							node.appendChild(
								get_iri_column(current_data)
							)
							break;

						case 'button':
							node.appendChild(
								get_button_column(current_data)
							)
							break;

						case 'json':
							node.appendChild(
								get_json_column(current_data)
							)
							break;

						case 'section_id':
							node.appendChild(
								get_section_id_column(current_data)
							)
							break;

						case 'text':
						default:
							node.appendChild(
								get_text_column(
									current_data,
									false // bool use fallback value
								)
							)
							break;
					}//end switch(current_data.cell_type)
				}// end if(current_data.type==='column' && current_data.cell_type)

			// value. Recursion
			// If the item has a .value array it is a container node (e.g. type='row').
			// Recurse into it so nested columns are rendered as child DOM nodes.
				if(current_data.value){
					const child_node = get_grid_nodes(current_data.value)
					node.appendChild(child_node)
				}

			cell_nodes.push(node)
		}else{
			continue;
		}

		// add cell_nodes (array of one value)
		// (!) fragment.appendChild is called with spread; cell_nodes always has
		// exactly one element at this point, so the spread is equivalent to a
		// direct single-argument call. The pattern mirrors the array-building
		// approach used in view_table_dd_grid for symmetry.
		fragment.appendChild(...cell_nodes)
	}//end for (let i = 0; i < data_len; i++)


	return fragment
}//end get_grid_nodes



/**
* GET_DIV_CONTAINER
* Create a <div> whose CSS class list encodes the item's structural type
* and any optional additional classes from the data descriptor.
*
* The element type string (e.g. 'column', 'row') is always set as the first
* class so CSS can target it generically. Extra classes from current_data.class_list
* are appended when present, allowing the server to inject layout hints
* (e.g. 'span2', 'highlight') without the client needing to understand them.
*
* @param {Object} current_data - single data-item object from the dd_grid data array
* @param {string} current_data.type - structural type string used as the base CSS class
* @param {string} [current_data.class_list] - optional space-separated extra CSS classes
* @returns {HTMLElement} newly created div element with the computed class list
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
