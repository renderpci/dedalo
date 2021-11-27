/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	// import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'
	// import {clone,dd_console} from '../../common/js/utils/index.js'



/**
* RENDER_TABLE_DD_GRID
* Manage the components logic and appearance in client side
*/
export const render_table_dd_grid = function() {

	return true
}//end render_table_dd_grid



/**
* TABLE
* Render node for use in table
* @return DOM node wrapper
*/
render_table_dd_grid.prototype.table = function() {

	const self = this

	// Options vars
		const data = self.data

	// wrapper
		const wrapper = ui.create_dom_element({
			element_type	: 'table',
			class_name		: 'wrapper_dd_grid' + ' ' + self.tipo + ' ' + self.mode
		})

	// grid. Value as string
		const grid = get_table_nodes(data)

	// Set value
		wrapper.appendChild(grid)


	return wrapper
}//end table



/**
* GET_TABLE_NODES
*/
const get_table_nodes = function(data){

	const fragment = new DocumentFragment()
	console.log("data:",data);
	// first row
	// const data_value = data[0].value
	const ar_columns_obj = data[0].value.map(item => item.ar_columns_obj)

	// build the header
	const ar_columns_obj_len = ar_columns_obj.length
	for (let i = 0; i < ar_columns_obj_len; i++) {
		const column = ar_columns_obj[i]
		const column_node = get_label_column(column)
		fragment.appendChild(column_node)
	}

	// build the rows, row 0 are the columns that is not used here
	const data_len = data.length
	for (let i = 1; i < data_len; i++) {
		// the columns
		const row_data = data[i]
		const nodes = get_portal_rows(row_data, ar_columns_obj)
		fragment.appendChild(nodes)

		const cell_nodes = []
	}

	const rows_nodes = get_portal_rows(data, ar_columns_obj)

	return fragment
}//end get_table_nodes

const get_portal_rows = function(row, ar_columns_obj){

	const fragment = new DocumentFragment()

	// build the rows, row 0 are the columns that is not used here
	const data_len = row.row_count

	for (let row_key = 0; row_key < data_len; row_key++) {

		// the columns
		const column_data = row.value
		const row_node = get_row_container()
		fragment.appendChild(row_node)

		const nodes = get_columns(column_data, ar_columns_obj, row_key)
		row_node.appendChild(nodes)

	}
return fragment
}

const get_columns = function(column_data, ar_columns_obj, parent_row_key){

	const fragment = new DocumentFragment()
	const column_len	= ar_columns_obj.length

	// const ar_lasts_columns = []

	for (let i = 0; i < column_len; i++) {

		const column = ar_columns_obj[i]

		const column_value = column_data.find(item => item.ar_columns_obj.find(el => el.id === column.id))
		 ? column_data.find(item => item.ar_columns_obj.find(el => el.id === column.id))
		 : {
				ar_columns_obj: [column],
				type		: 'column',
				cell_type	: 'text',
				value		: '',
				class_list	:'empty_value'

			}
		// if the column is the last column with data, identify by cell_type, render the node
		if(column_value && column_value.type === 'column' && column_value.cell_type){

			const column_nodes = get_table_columns(column_value)
			const node_len = column_nodes.length
			for (let j = 0; j < node_len; j++) {
				fragment.appendChild(column_nodes[j])
			}
		// else if the column could has rows (the portal rows) or could be colum_portal that has the column with the information (when the column is created by the section_id in the portal)
		}else if(column_value && column_value.type === 'column'){
			const sub_portal_values	= column_value.value
			// if the column has rows:
			if(sub_portal_values[0].type === 'row'){
				const current_ar_columns_obj = [column]
				// some times sub_values could be empty, because the rows_columns created by section_id could be empty between different rows, it depends of the data
				// if the data don't exist, create a empty node to be rendered
				const sub_values	= sub_portal_values[parent_row_key]
					? sub_portal_values[parent_row_key].value
					: [{
						ar_columns_obj: [{id:current_ar_columns_obj}],
						type		: 'column',
						cell_type	: 'text',
						value		: '',
						class_list	:'empty_value'

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
}




/**
* GET_TABLE_COLUMNS
*/
const get_table_columns = function(current_data){

	// const data_len = data.length

	const column_nodes = []

		if (current_data && current_data.type) {

			// label head
				if(current_data.type==='column' && current_data.render_label){
					const label_node = get_label_column(current_data)
					column_nodes.push(label_node)
				}

			// column
				if(current_data.type==='column' && current_data.cell_type){

					switch(current_data.cell_type) {
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

	const row_container = ui.create_dom_element({
		element_type	: 'tr'
		// class_name	: class_list
	})

	return row_container
}//end get_row_container



/**
* GET_DIV_CONTAINER
* @param object current_data
* @return DOM node label_node (label)
*/
const get_label_column = function(current_data) {

	const ar_labels		= current_data.ar_labels || []
	const even_labels	= ar_labels.filter((label, index) => index % 2  === 1)
	const label_node = ui.create_dom_element({
		// id			: current_data.id,
		element_type	: 'th',
		text_content	:  even_labels.join(' | ')
	})

	return label_node
}//end get_label_column



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
		text_content	: text
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
			element_type	: "img",
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
			element_type	: "img",
			class_name		: class_list,
			src 			: url,
			parent 			: image_node
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
			element_type	: "img",
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
		text_content	: JSON.stringify(current_data.value)
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
		text_content	: current_data.value
	})

	return section_id_node
}//end get_section_id_column


