/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	// import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'
	// import {service_tinymce} from '../../services/service_tinymce/js/service_tinymce.js'
	// import {clone,dd_console} from '../../common/js/utils/index.js'



/**
* RENDER_LIST_DD_GRID
* Manage the components logic and appearance in client side
*/
export const render_list_dd_grid = function() {

	return true
};//end render_list_dd_grid



/**
* LIST
* Render node for use in list
* @return DOM node
*/
render_list_dd_grid.prototype.list = async function() {

	const self = this

	// Options vars
		const data		= self.data

	// wrapper

	const wrapper = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'wrapper_dd_grid' + ' ' + self.tipo + ' ' + self.mode
		})

console.log("data:",data);
	// Value as string
		const grid = get_grid_nodes( data )

	// Set value
		// wrapper.innerHTML = value_string
		wrapper.appendChild(grid)


	return wrapper
};//end list


const get_grid_nodes = function( data ){


	const fragment = new DocumentFragment()
	const data_len = data.length

	for (let i = 0; i < data_len; i++) {
		const current_data = data[i]

		const cell_nodes = []

		if (current_data.type) {
			const node = get_div_container(current_data)

			if(current_data.type === 'column' && current_data.render_label){
				const label_node = get_label_column(current_data)
				node.appendChild(label_node)
			}

			if(current_data.type === 'column' && current_data.cell_type){

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

					case 'text':
					default:
						const column_node = get_text_column(current_data)
						node.appendChild(column_node)

				}//end switch(current_data.cell_type)


			}// end if


			if(current_data.value){
				const child_node = get_grid_nodes(current_data.value)
				node.appendChild(child_node)
			}

			cell_nodes.push(node)
		}else{
			continue;
		}

		fragment.appendChild(...cell_nodes)
	}

 return fragment
}

const get_div_container = function(current_data){


	const class_list = (current_data.class_list)
		? current_data.type + ' ' + current_data.class_list
		: current_data.type

	const div_container = ui.create_dom_element({
		element_type	: 'div',
		class_name		: class_list,
	})

	return div_container
}

const get_label_column = function(current_data){

	const label_node = ui.create_dom_element({
		element_type	: 'label',
		text_content	:  current_data.label
	})

	return label_node
}


const get_text_column = function(current_data){

	const class_list = current_data.class_list || ''

	const text_node = ui.create_dom_element({
		element_type	: 'span',
		class_name		: class_list,
		text_content	: current_data.value.join('')
	})


	return text_node
}


const get_av_column = function(current_data){

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
		// ui.component.add_image_fallback(image)


	return image
}


const get_img_column = function(current_data){

	const class_list = current_data.class_list || ''

	// url
		const url 	= current_data.value[0]
	// image
		const image = ui.create_dom_element({
			element_type	: "img",
			class_name		: class_list,
			src 			: url
		})
		// ui.component.add_image_fallback(image)


	return image
}


const get_button_column = function(current_data){

	const value = current_data.value[0]

	const class_list = value.class_list || ''

	// image
		const button = ui.create_dom_element({
			element_type	: "img",
			class_name		: class_list
		})

		if (value.action && value.action.event) {

			button.addEventListener(value.action.event, async (e)=>{
				const options			= value.action.options
				options.button_caller	= e.target

				const module = await import (value.action.module_path)
				module[value.action.method](options)
			})
		}
		// ui.component.add_image_fallback(image)


	return button


}





