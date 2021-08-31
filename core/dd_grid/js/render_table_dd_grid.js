/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	// import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'
	// import {clone,dd_console} from '../../common/js/utils/index.js'



/**
* RENDER_table_DD_GRID
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
render_table_dd_grid.prototype.table = async function() {

	const self = this

	// Options vars
		const data		= self.data

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
const get_table_nodes = function(data) {

	const fragment = new DocumentFragment()

	const data_len = data.length
		console.log("data:",data);

	for (let i = 0; i < data_len; i++) {
		const current_data = data[i]

		const row_nodes = []

		if (current_data.type) {

			const row_count		= (current_data.row_count || 1)
			const column_count	= (current_data.column_count || 1)
			// build all rows
			for (let current_row = 0; current_row < row_count; current_row++) {
				const node = get_div_container(current_data)

				// columns
				for (let current_column = 0; current_column < column_count; current_column++) {
					const column = current_data.value[current_column]
					const column_nodes = get_table_columns(column, current_row, current_column)
					console.log("column_nodes:",column_nodes);
					const len = column_nodes.length
					for (let j = 0; j < len; j++) {
						node.appendChild(column_nodes[j])
					}
				}
				row_nodes.push(node)
			}
			// add column_nodes (array of one value)
			const row_nodes_len = row_nodes.length
			for (let j = 0; j < row_nodes_len; j++) {
				fragment.appendChild(row_nodes[j])
			}
		}
	}//end for (let i = 0; i < data_len; i++)

	return fragment
}//end get_table_nodes



const get_table_columns = function(current_data, current_row, current_column){

	// const data_len = data.length

	const column_nodes = []
	// for (let i = 0; i < data_len; i++) {
	// 	const current_data = data[i]

		console.log("current_data:",current_data);
		if (current_data && current_data.type) {
			// current_data.id = current_row+'_'+current_column

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

			// value
				if(current_data.type==='row'){
					const row_data = current_data.value[current_row]
					get_table_columns(row_data, current_row, current_column)
				}
				if(current_data.type==='column', current_data.value && typeof(current_data.cell_type)==='undefined'){
					const child_node = get_table_columns(current_data.value[current_column], current_row, current_column)
					// column_nodes.push(child_node)
				}

		}else{

			const empty_data = {
				value : ''
			}
			const empty_node = get_text_column(empty_data)
			column_nodes.push(empty_node)
		}
	// }//end for (let i = 0; i < data_len; i++)

	return column_nodes
}//end get_table_columns



/**
* GET_DIV_CONTAINER
* @param object current_data
* @return DOM node div_container (div)
*/
const get_div_container = function(current_data) {

	// const class_list = (current_data.class_list)
	// 	? current_data.type + ' ' + current_data.class_list
	// 	: current_data.type

	const div_container = ui.create_dom_element({
		element_type	: 'tr'
		// class_name	: class_list
	})

	return div_container
}//end get_div_container



/**
* GET_DIV_CONTAINER
* @param object current_data
* @return DOM node label_node (label)
*/
const get_label_column = function(current_data) {

	const label_node = ui.create_dom_element({
		// id			: current_data.id,
		element_type	: 'th',
		text_content	:  current_data.label
	})

	return label_node
}//end get_label_column



/**
* GET_TEXT_COLUMN
* @param object current_data
* @return DOM node text_node (span)
*/
const get_text_column = function(current_data) {

	const class_list = current_data.class_list || ''

	const text_node = ui.create_dom_element({
		// id			: current_data.id,
		element_type	: 'td',
		class_name		: class_list,
		text_content	: current_data.value.join('')
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


