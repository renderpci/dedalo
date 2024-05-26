// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0

/*eslint no-undef: "error"*/
/*eslint no-unused-vars: "error"*/


// imports
	// import {ui} from '../../common/js/ui.js'
	// import {clone,dd_console} from '../../common/js/utils/index.js'



/**
* VIEW_TSV_DD_GRID
* Manage the components logic and appearance in client side
*/
export const view_tsv_dd_grid = function() {

	return true
}//end view_tsv_dd_grid



/**
* RENDER
* Render a full csv_string form rows and columns
* Note that result is not a node in this render case
* @param object self
* @return string csv_string
*/
view_tsv_dd_grid.render = function(self) {

	// reset instance node
		self.node = null

	// separators
		self.row_separator		= '\n'
		self.column_separator	= '\t'

	// data
		const data = self.data

	// grid. Value as string
		const csv_string = build_csv_string(self, data)


	return csv_string
}//end render



/**
* BUILD_CSV_STRING
* @param array data
* 	array of objects; full data sent by the server with all information.
* @return string csv_string
*/
const build_csv_string = function(self, data) {

	const row_separator		= self.row_separator
	const column_separator	= self.column_separator

	const rows = []

	// First row;
	// get the columns form the first row of the data, it content the columns map with all columns calculated in the server for all data,
	// sometimes the columns are section_id columns, that is, some columns comes from rows inside portals, all rows below the main portal will be converted to section_id columns
	// some portals could have a information that other rows of the same portal doesn't has, ex: one interview, with two informants, every informant has different amount of professions,
	// every profession of every informant will create his own columns as: profession ; profession|1 ; etc
	// the first row has all columns, direct columns and calculated columns (from section_ids rows)
	// ar_columns_obj will be the map of the columns, used for create the header of the table and for extract the data and fill the empty values.
		const ar_columns		= data[0].value
		const ar_columns_obj	= data[0].value.map(item => item.ar_columns_obj)

	// header. build the header
	// get every column to create the header of the table, get the node and add to the root node
		const header_items = []
		const ar_columns_len = ar_columns.length
		for (let i = 0; i < ar_columns_len; i++) {
			const column		= ar_columns[i]
			const column_items	= get_table_columns(column)

			header_items.push( ...column_items )
		}
		rows.push(
			header_items.join(column_separator)
		)

	// rows. build the rows, row 0 are the columns that is not used here
	// get every row with data, the first row is the header, and it begins at 1 row to calculate the cells
	// the top row doesn't create node, because it will be created by the get_portal_rows() to be compatible between flat row or portal rows
		const data_len = data.length
		for (let i = 1; i < data_len; i++) {
			// the current row
			const row_data = data[i]
			const row_items = get_portal_rows(self, row_data, ar_columns_obj)

			rows.push( ...row_items )
		}

	// csv_string . Join all as final string
		const csv_string = rows.join(row_separator)


	return csv_string
}//end build_csv_string



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
* @return array portal_rows
*/
const get_portal_rows = function(self, row, ar_columns_obj) {

	const column_separator	= self.column_separator //("\t")

	const portal_rows = []

	// get the total rows will be created
	// the top row has the total rows that is collected for every component, in a portal has two locators and other portal has 5 locators the amount of rows will be 5
	const data_len = row.row_count
	for (let row_key = 0; row_key < data_len; row_key++) {

		// get the columns data
		const column_data = row.value

		// create the node
		// const row_line = [] // get_row_container()
		// portal_rows.push(row_node)

		// process the data column to get the cells
		const row_columns = get_columns(self, column_data, ar_columns_obj, row_key)
		portal_rows.push(
			row_columns.join(column_separator)
		)
	}


	return portal_rows
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
* @return array columns
*/
const get_columns = function(column_data, ar_columns_obj, parent_row_key) {

	const columns = []

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
				columns.push(column_nodes[j])
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
				// fragment.appendChild(sub_portal_nodes)
				columns.push(...sub_portal_nodes)

			// else, the column don't has rows and is section_id column (portal inside portal doesn't create rows, it only create columns)
			}else{
				const current_ar_columns_obj = [column]
				const sub_nodes = get_columns(sub_portal_values, current_ar_columns_obj, parent_row_key)
				// fragment.appendChild(sub_nodes)
				columns.push(...sub_nodes)
			}
		}
	}

	return columns
}// end get_columns



/**
* GET_TABLE_COLUMNS
* Use the column_data to create the right node
* @param object current_data
* 	The full column data
* @return array column_items
*/
const get_table_columns = function(current_data) {

	// const data_len = data.length

	const column_items = []

	if (current_data && current_data.type) {

		// label head
			// if(current_data.type==='column' && current_data.render_label){
			// 	const label_node = get_header_column(current_data)
			// 	column_items.push(label_node)
			// }

		// column
			if(current_data.type==='column' && current_data.cell_type){

				switch(current_data.cell_type) {
					case 'header':
						column_items.push(
							get_header_column(current_data)
						)
						break;

					case 'av':
						column_items.push(
							get_av_column(current_data)
						)
						break;

					case 'img':
						column_items.push(
							get_img_column(current_data)
						)
						break;

					case 'json':
						column_items.push(
							get_json_column(current_data)
						)
						break;

					case 'section_id':
						column_items.push(
							get_section_id_column(current_data)
						)
						break;

					case 'iri':
					case 'text':
					default:
						column_items.push(
							get_text_column(current_data)
						)
						break;
				}//end switch(current_data.cell_type)
			}// end if(current_data.type==='column' && current_data.cell_type)

	}else{

		const empty_data = {
			value : ''
		}
		const empty_node = get_text_column(empty_data)
		column_items.push(empty_node)
	}


	return column_items
}//end get_table_columns



/**
* GET_DIV_CONTAINER
* @param object
* @return HTMLElement div_container
*/
	// const get_row_container = function() {

	// 	const row_container = '\n'

	// 	return row_container
	// }//end get_row_container



/**
* GET_HEADER_COLUMN
* @param object current_data
* @return string value
*/
const get_header_column = function(current_data) {

	const ar_labels		= current_data.ar_columns_obj.ar_labels || []
	const even_labels	= ar_labels.filter((label, index) => index % 2 === 1)
	const label			= even_labels.join(' | ')

	// value
		const value = label

	return value
}//end get_header_column



/**
* GET_TEXT_COLUMN
* @param object current_data
* @return string value
*/
const get_text_column = function(current_data) {

	const records_separator = (current_data.records_separator)
		? current_data.records_separator
		: ' | '

	const text = current_data.value && Array.isArray(current_data.value)
		? current_data.value.join(records_separator)
		: (current_data.value || '')

	// value
		const value = text

	return value
}//end get_text_column



/**
* GET_AV_COLUMN
* @param object current_data
* @return string value
*/
const get_av_column = function(current_data) {

	// url
		const posterframe_url	= current_data.value[0].posterframe_url
		const url				= posterframe_url
			? window.location.origin + posterframe_url
			: ''

	// value
		const value = url

	return value
}//end get_av_column



/**
* GET_IMG_COLUMN
* @param object current_data
* @return string value
*/
const get_img_column = function(current_data) {

	// url (absolute)
		const url = current_data.value[0]
			? window.location.origin + current_data.value[0]
			: ''

	// value
		const value = url

	return value
}//end get_img_column



/**
* GET_JSON_COLUMN
* @param object current_data
* @return string value
*/
const get_json_column = function(current_data) {

	// value
		const value = (!current_data.value || (Array.isArray(current_data.value) && !current_data.value.length))
			? ''
			: JSON.stringify(current_data.value)

	return value
}//end get_json_column



/**
* GET_SECTION_ID_COLUMN
* @param object current_data
* @return string value
*/
const get_section_id_column = function(current_data) {

	// value
		const value = current_data.value

	return value
}//end get_section_id_column



// @license-end
