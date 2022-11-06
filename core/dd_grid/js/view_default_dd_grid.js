/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	// import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'
	// import {clone,dd_console} from '../../common/js/utils/index.js'



/**
* VIEW_DEFAULT_DD_GRID
* Manage the components logic and appearance in client side
*/
export const view_default_dd_grid = function() {

	return true
}//end view_default_dd_grid



/**
* RENDER
* Render node for use in this view
* @return DOM node wrapper
*/
view_default_dd_grid.render = async function(self, options) {

	// data
		const data	= self.data

	// wrapper
		const wrapper = ui.create_dom_element({
			element_type	: 'div',
			class_name		: `wrapper_dd_grid ${self.tipo} ${self.mode} view_${self.view}`
		})

	// grid. Value as string
		const grid = get_grid_nodes( data )

	// Set value
		wrapper.appendChild(grid)


	return wrapper
}//end list



/**
* GET_GRID_NODES
*/
const get_grid_nodes = function(data) {

	const fragment = new DocumentFragment()

	const data_len = data.length
	for (let i = 0; i < data_len; i++) {
		const current_data = data[i]

		const cell_nodes = []
		if (current_data && current_data.type) {
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
							const av_node = get_av_column(current_data)
							node.appendChild(av_node)
							break;

						case 'img':
							const img_node = get_img_column(current_data)
							node.appendChild(img_node)
							break;

						case 'button':
							const button_node = get_button_column(current_data)
							node.appendChild(button_node)
							break;

						case 'json':
							const json_node = get_json_column(current_data)
							node.appendChild(json_node)
							break;

						case 'section_id':
							const section_id_node = get_section_id_column(current_data)
							node.appendChild(section_id_node)
							break;


						case 'text':
						default:
							const column_node = get_text_column(current_data)
							node.appendChild(column_node)
							break;
					}//end switch(current_data.cell_type)
				}// end if(current_data.type==='column' && current_data.cell_type)

			// value
				if(current_data.value){
					const child_node = get_grid_nodes(current_data.value)
					node.appendChild(child_node)
				}

			cell_nodes.push(node)
		}else{
			continue;
		}

		// add cell_nodes (array of one value)
		fragment.appendChild(...cell_nodes)
	}//end for (let i = 0; i < data_len; i++)


	return fragment
}//end get_grid_nodes



/**
* GET_DIV_CONTAINER
* @param object current_data
* @return DOM node div_container (div)
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



/**
* GET_DIV_CONTAINER
* @param object current_data
* @return DOM node label_node (label)
*/
const get_label_column = function(current_data) {

	const label_node = ui.create_dom_element({
		element_type	: 'label',
		inner_html		: current_data.label
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
		element_type	: 'span',
		class_name		: class_list,
		inner_html		: current_data.value.join('')
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

	// url
		const posterframe_url 	= current_data.value[0].posterframe_url
		const url 				= posterframe_url

	// image
		const image = ui.create_dom_element({
			element_type	: "img",
			class_name		: class_list,
			src 			: url
		})

	return image
}//end get_av_column


/**
* GET_IMG_COLUMN
* @param object current_data
* @return DOM node image (img)
*/
const get_img_column = function(current_data){

	const class_list = current_data.class_list || ''

	// url
		const url = current_data.value[0]
	// image
		const image = ui.create_dom_element({
			element_type	: "img",
			class_name		: class_list,
			src 			: url
		})

	return image
}//end get_img_column



/**
* GET_BUTTON_COLUMN
* @param object current_data
* @return DOM node button (img)
*/
const get_button_column = function(current_data){

	const value			= current_data.value[0]
	const class_list	= value.class_list || ''

	// image
		const button = ui.create_dom_element({
			element_type	: "img",
			class_name		: class_list
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

	return button
}//end get_button_column



/**
* GET_JSON_COLUMN
* @param object current_data
* @return DOM node text_json (span)
*/
const get_json_column = function(current_data) {

	const class_list = current_data.class_list || ''

	const text_json = ui.create_dom_element({
		element_type	: 'span',
		class_name		: class_list,
		inner_html		: JSON.stringify(current_data.value)
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
		element_type	: 'span',
		class_name		: class_list,
		inner_html		: current_data.value
	})

	return section_id_node
}//end get_section_id_column

