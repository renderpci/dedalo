/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	// import {event_manager} from '../../common/js/event_manager.js'
	// import {clone,dd_console} from '../../common/js/utils/index.js'
	import {ui} from '../../common/js/ui.js'
	import {
		get_av_column,
		get_img_column,
		get_label_column,
		get_json_column,
		get_section_id_column,
		get_iri_column
	} from './render_list_dd_grid.js'



/**
* VIEW_INDEXATION_DD_GRID
* Manage the components logic and appearance in client side
*/
export const view_indexation_dd_grid = function() {

	return true
}//end view_indexation_dd_grid



/**
* RENDER
* Render node for use in this view
* @return HTMLElement wrapper
*/
view_indexation_dd_grid.render = async function(self, options) {

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
* @param array data
* @return DocumentFragment
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

						case 'iri':
							const current_node = get_iri_column(current_data)
							node.appendChild(current_node)
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
							const column_node = get_text_column(
								current_data,
								true // bool use fallback value
							)
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
* @return HTMLElement div_container
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
* GET_BUTTON_COLUMN
* @param object current_data
* @return HTMLElement button (img)
*/
export const get_button_column = function(current_data) {

	const value			= current_data.value[0]
	const class_list	= value.class_list || ''

	// button
		const button = ui.create_dom_element({
			element_type	: 'button',
			class_name		: 'dd_grid_button',
			title			: value.label || ''
		})

	// icon
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'icon ' + class_list, // 'icon indexation',
			parent			: button
		})


	// event
		if (value.action && value.action.event) {

			// sample
				// 'class_list'	=> 'button label',
				// 'action'		=> (object)[
				// 		'event'			=> 'click',
				// 		'method'		=> 'open_tool',
				// 		'module_path'	=> '../../../tools/tool_common/js/tool_common.js',
				// 		'options'		=> (object)[
				// 			'tool_name'			=> 'tool_indexation',
				// 			'section_tipo'		=> $section_tipo,
				// 			'section_id'		=> $section_id,
				// 			'component_tipo'	=> $component_tipo,
				// 			'tag_id'			=> $tag_id,
				// 			'section_top_tipo'	=> $section_top_tipo,
				// 			'section_top_id'	=> $section_top_id
				// 		]
				// ]

			button.addEventListener(value.action.event, async (e)=>{

				// options
					const options			= value.action.options
					options.button_caller	= e.target

				// module
					const module = await import(value.action.module_path)
					console.log('module:', module);
				// method
					const method_name = value.action.method

				// function exec. Try with fallback
					const fn = module[method_name] // direct exported method
							|| module.default[method_name] // fallback to default method
							|| module.default.prototype[method_name] // fallback to default prototyped method

					if (fn && typeof fn==='function') {
						console.log('-> [button_column] Executing function:', method_name);
						fn(options)
					}else{
						console.error('Unable to call method:', method_name);
					}
			})
		}

	return button
}//end get_button_column



/**
* GET_TEXT_COLUMN
* Render a span DOM node with given value
* @param object data_item
* @param bool use_fallback
* @return HTMLElement text_node (span)
*/
export const get_text_column = function(data_item, use_fallback) {

	const class_list = data_item.class_list || ''

	const value = use_fallback===true
		? (data_item.value && data_item.value[0]!==undefined ? data_item.value : data_item.fallback_value)
		: data_item.value

	const value_string = value
		? value.join(' ')
		: ''

	const add_style = value_string.length>0
		? ''
		: ' empty'

	const text_node = ui.create_dom_element({
		element_type	: 'span',
		class_name		: class_list + add_style,
		inner_html		: value_string
	})

	// text_fragment case. Toggle class to display overflow hidden text
		if (data_item.class_list==='text_fragment') {
			console.log('data_item:', data_item);
			text_node.addEventListener('click', function(e) {
				text_node.classList.toggle('full')
			})
		}


	return text_node
}//end get_text_column
