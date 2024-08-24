// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



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
* Manage the components logic and appearance in client side
*/
export const view_mini_dd_grid = function() {

	return true
}//end view_mini_dd_grid



/**
* RENDER
* Render node for use in this view
* @param object options
* 	Sample: {render_level: 'full'}
* @return HTMLElement wrapper
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
* Process recursively the grid data generating DOM nodes for each value
* @param array data
* @return array nodes
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
					if(data_item.value) {
						const child_nodes = get_grid_nodes(data_item.value)
						nodes.push(...child_nodes)
					}
			}//end if(data_item.type==='column' && data_item.cell_type)
	}//end for (let i = 0; i < data_len; i++)


	return nodes
}//end get_grid_nodes



// @license-end
