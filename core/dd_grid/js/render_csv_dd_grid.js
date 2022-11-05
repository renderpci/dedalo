/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	// import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'
	// import {clone,dd_console} from '../../common/js/utils/index.js'



/**
* RENDER_csv_DD_GRID
* Manage the components logic and appearance in client side
*/
export const render_csv_dd_grid = function() {

	return true
}//end render_csv_dd_grid



/**
* TABLE
* Render node for use in table
* @return DOM node wrapper
*/
render_csv_dd_grid.prototype.table = function() {

	const self = this

	// Options vars
		const data = self.data

	// wrapper
		const wrapper = ui.create_dom_element({
			element_type	: 'table',
			class_name		: 'wrapper_dd_grid' + ' ' + self.tipo + ' ' + self.mode
		})

	// grid. Value as string
		const grid = get_table_nodes(data, self.data_format)

	// Set value
		wrapper.appendChild(grid)


	return wrapper
}//end table



/**
* GET_TABLE_NODES
* @param array data
* 	Array of objects; full data sent by the server with all information.
* @return DocumentFragment
* 	Node with the table
*/
const get_table_nodes = function(data, data_format) {

	// the root node
	const fragment = new DocumentFragment()

	// First row;
	// get the columns form the first row of the data, it content the columns map with all columns calculated in the server for all data,
	// sometimes the columns are section_id columns, that is, some columns comes from rows inside portals, all rows below the main portal will be converted to section_id columns
	// some portals could have a information that other rows of the same portal doesn't has, ex: one interview, with two informants, every informant has different amount of professions,
	// every profession of every informant will create his own columns as: profession ; profession|1 ; etc
	// the first row has all columns, direct columns and calculated columns (from section_ids rows)
	// ar_columns_obj will be the map of the columns, used for create the header of the table and for extract the data and fill the empty values.
	const ar_columns		= data[0].value
	const ar_columns_obj	= ar_columns.map(item => item.ar_columns_obj)

	// build the header
	// get every column to create the header of the table, get the node and add to the root node
	const column_labels = [];
	const ar_columns_len = ar_columns.length
	for (let i = 0; i < ar_columns_len; i++) {
		const column = ar_columns[i]
		const column_cell = get_table_columns(column)
		const node_len = column_cell.length
		for (let j = 0; j < node_len; j++) {
			column_labels.push(column_cell)
		}
	}

	// build the rows, row 0 are the columns that is not used here
	// get every row with data, the first row is the header, and it begins at 1 row to calculate the cells
	// the top row doesn't create node, because it will be created by the get_portal_rows() to be compatible between flat row or portal rows
	const data_len = data.length
	for (let i = 1; i < data_len; i++) {
		// the current row
		const row_data = data[i]
		const nodes = get_portal_rows(row_data, ar_columns_obj)
		fragment.appendChild(nodes)
	}

	// rows_nodes
	const rows_nodes = get_portal_rows(data, ar_columns_obj)


	return fragment
}//end get_table_nodes



/**
* GET_PORTAL_ROWS
* This method calculate the rows when the main row has sub rows that comes from portals
* sometime the row don't has portal information, but the calculation will be the same, because the server use a
* row_count to identify the amount rows that will be necessary to build
* if the row don't has portals the row_count will be 1, if has portals have multiple locators, the row_count will be the total
* locators of the first level, sub-levels of information are calculated as section_id columns
* @param object row
* 	all information of the row, the main row
* @param array ar_columns_obj
* 	array of objects, the column map with all columns to be matched with the data
*
* @return DOM DocumentFragment
* 	Node with the tr of the table
*/
const get_portal_rows = function(row, ar_columns_obj) {

	const fragment = new DocumentFragment()

	// get the total rows will be created
	// the top row has the total rows that is collected for every component, in a portal has two locators and other portal has 5 locators the amount of rows will be 5
	const data_len = row.row_count

	for (let row_key = 0; row_key < data_len; row_key++) {

		// get the columns data
		const column_data = row.value
		// create the node
		const row_node = get_row_container()
		fragment.appendChild(row_node)
		// process the data column to get the cells
		const nodes = get_columns(column_data, ar_columns_obj, row_key)
		row_node.appendChild(nodes)
	}

	return fragment
}// end get_portal_rows



/**
* GET_COLUMNS
* the columns has the information of the components
* is the component is a final component it will create a node
* if the component is a relation component, portals, it could has other rows or portal columns with "sub-columns" of the final components
* in the case of column has rows, extract the row with parent_row_key and star again
* in the case of the column of a portal, extract his value and star again
* @param array column_data
* 	array of objects; full data with the columns to be processed, in the recursion it could be a part of this data to be processed
* @param array ar_columns_object
* 	array of object; the column map with all columns to be matched with the data
* @param int parent_row_key
* 	the current position of the row to be used to match with the portal data
* @return DocumentFragment
* 	node with the td of the table
*/
const get_columns = function(column_data, ar_columns_obj, parent_row_key) {

	const fragment = new DocumentFragment()

	// first we loop all map columns, independently of the data
	const column_len = ar_columns_obj.length
	for (let i = 0; i < column_len; i++) {
		// specify the current column to be filled
		const column = ar_columns_obj[i]
		// find the data of the column, if it's not present, create a empty column
		const column_value = column_data.find(item => item.ar_columns_obj.find(el => el.id === column.id))
			? column_data.find(item => item.ar_columns_obj.find(el => el.id === column.id))
			: {
				ar_columns_obj	: [column],
				type			: 'column',
				cell_type		: 'text',
				value			: '',
				class_list		:'empty_value'
			  }
		// if the column is the last column with data, identify by cell_type property, render the node
		if(column_value && column_value.type === 'column' && column_value.cell_type){

			const column_nodes = get_table_columns(column_value)
			const node_len = column_nodes.length
			for (let j = 0; j < node_len; j++) {
				fragment.appendChild(column_nodes[j])
			}
		// else if the column is a portal column, it could has rows (the portal rows) or could be colum_portal, that has the column with the information.
		// in the second case, the column of the portal, this column content the other components columns and if the sub component is a relation component it is created by the section_id in the portal
		}else if(column_value && column_value.type === 'column'){
			const sub_portal_values	= column_value.value
			// if the column has rows:
			// this case is the main portal in the section to export, sub-portals don't create rows
			if(sub_portal_values[0].type === 'row'){
				const current_ar_columns_obj = [column]
				// some times sub_values could be empty, because the rows_columns created by section_id could be empty between different rows, it depends of the data
				// if the data don't exist, create a empty node to be rendered
				const sub_values	= sub_portal_values[parent_row_key]
					? sub_portal_values[parent_row_key].value
					: [{
						ar_columns_obj	: [{id:current_ar_columns_obj}],
						type			: 'column',
						cell_type		: 'text',
						value			: '',
						class_list		: 'empty_value'
					  }]
				const sub_portal_nodes = get_columns(sub_values, current_ar_columns_obj, parent_row_key)
				fragment.appendChild(sub_portal_nodes)

			// else, the column don't has rows and is section_id column (portal inside portal doesn't create rows, it only create columns)
			}else{
				const current_ar_columns_obj = [column]
				const sub_nodes = get_columns(sub_portal_values, current_ar_columns_obj, parent_row_key)
				fragment.appendChild(sub_nodes)
			}
		}
	}

	return fragment
}// end get_columns




/**
* GET_TABLE_COLUMNS
* Use the column_data to create the right node
* @param object current_data
* 	The full column data
* @return array column_nodes
*/
const get_table_columns = function(current_data) {

	// const data_len = data.length

	const column_nodes = []

	if (current_data && current_data.type) {

		// label head
			// if(current_data.type==='column' && current_data.render_label){
			// 	const label_node = get_header_column(current_data)
			// 	column_nodes.push(label_node)
			// }

		// column
			if(current_data.type==='column' && current_data.cell_type){

				switch(current_data.cell_type) {
					case 'header':
						const header_node = get_header_column(current_data)
						column_nodes.push(header_node)
						break;
					case 'av':
						const av_node = get_av_column(current_data)
						column_nodes.push(av_node)
						break;

					case 'img':
						const img_node = get_img_column(current_data)
						column_nodes.push(img_node)
						break;

					case 'button':
						const button_node = get_button_column(current_data)
						column_nodes.push(button_node)
						break;

					case 'json':
						const json_node = get_json_column(current_data)
						column_nodes.push(json_node)
						break;

					case 'section_id':
						const section_id_node = get_section_id_column(current_data)
						column_nodes.push(section_id_node)
						break;

					case 'text':
					default:
						const column_node = get_text_column(current_data)
						column_nodes.push(column_node)
						break;
				}//end switch(current_data.cell_type)
			}// end if(current_data.type==='column' && current_data.cell_type)

	}else{

		const empty_data = {
			value : ''
		}
		const empty_node = get_text_column(empty_data)
		column_nodes.push(empty_node)
	}

	return column_nodes
}//end get_table_columns



/**
* GET_DIV_CONTAINER
* @param object
* @return DOM node div_container (div)
*/
const get_row_container = function() {

	const row_container = '\n'

	return row_container
}//end get_row_container



/**
* GET_HEADER_COLUMN
* @param object current_data
* @return DOM node label_node
* 	Label
*/
const get_header_column = function(current_data) {

	const ar_labels		= current_data.ar_columns_obj.ar_labels || []
	const even_labels	= ar_labels.filter((label, index) => index % 2 === 1)
	const label_node	= '"' + even_labels.join(' | ') + '"'

	return label_node
}//end get_header_column



/**
* GET_TEXT_COLUMN
* @param object current_data
* @return DOM node text_node (span)
*/
const get_text_column = function(current_data) {
	// console.log("---> get_text_column current_data.value:", current_data.value);

	const class_list = current_data.class_list || ''

	const text = current_data.value && Array.isArray(current_data.value)
		? current_data.value.join(' ')
		: (current_data.value || '')

	const text_node = ui.create_dom_element({
		// id			: current_data.id,
		element_type	: 'td',
		class_name		: class_list,
		inner_html		: text
	})

	return text_node
}//end get_text_column



/**
* GET_AV_COLUMN
* @param object current_data
* @return DOM node image (img)
*/
const get_av_column = function(current_data) {

	const class_list = current_data.class_list || ''

	const av_node = ui.create_dom_element({
		// id			: current_data.id,
		element_type	: 'td'
	})

	// url
		const posterframe_url	= current_data.value[0].posterframe_url
		const url				= posterframe_url

	// image
		const av = ui.create_dom_element({
			element_type	: 'img',
			class_name		: class_list,
			src				: url,
			parent			: av_node
		})

	return av_node
}//end get_av_column



/**
* GET_IMG_COLUMN
* @param object current_data
* @return DOM node image (img)
*/
const get_img_column = function(current_data){

	const class_list = current_data.class_list || ''

	const image_node = ui.create_dom_element({
		// id				: current_data.id,
		element_type	: 'td'
	})

	// url
		const url = current_data.value[0]
	// image
		const image = ui.create_dom_element({
			element_type	: 'img',
			class_name		: class_list,
			src				: url,
			parent			: image_node
		})

	return image_node
}//end get_img_column



/**
* GET_BUTTON_COLUMN
* @param object current_data
* @return DOM node button (img)
*/
const get_button_column = function(current_data){

	const value			= current_data.value[0]
	const class_list	= value.class_list || ''

	const button_node = ui.create_dom_element({
		// id			: current_data.id,
		element_type	: 'td'
	})

	// image
		const button = ui.create_dom_element({
			element_type	: 'img',
			class_name		: class_list,
			parent			: button_node
		})

	// event
		if (value.action && value.action.event) {

			button.addEventListener(value.action.event, async (e)=>{
				const options			= value.action.options
				options.button_caller	= e.target

				const module = await import (value.action.module_path)
				module[value.action.method](options)
			})
		}

	return button_node
}//end get_button_column



/**
* GET_JSON_COLUMN
* @param object current_data
* @return DOM node text_json (span)
*/
const get_json_column = function(current_data) {

	const class_list = current_data.class_list || ''

	const text_json = ui.create_dom_element({
		// id			: current_data.id,
		element_type	: 'td',
		class_name		: class_list,
		inner_html		: (!current_data.value || (Array.isArray(current_data.value) && !current_data.value.length))
			? ''
			: JSON.stringify(current_data.value)
	})

	return text_json
}//end get_json_column



/**
* GET_SECTION_ID_COLUMN
* @param object current_data
* @return DOM node text_node (span)
*/
const get_section_id_column = function(current_data) {

	const class_list = current_data.class_list || ''

	const section_id_node = ui.create_dom_element({
		// id			: current_data.id,
		element_type	: 'td',
		class_name		: class_list,
		inner_html		: current_data.value
	})

	return section_id_node
}//end get_section_id_column
