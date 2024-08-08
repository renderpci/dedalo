// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../../core/common/js/event_manager.js'
	import {ui} from '../../../core/common/js/ui.js'
	import {render_node_info} from '../../../core/common/js/utils/notifications.js'



/**
* RENDER_tool_numisdata_order_coins
* Manages the component's logic and appearance in client side
*/
export const render_tool_numisdata_order_coins = function() {

	return true
}//end render_tool_numisdata_order_coins



/**
* EDIT
* Render node
* @return HTMLElement wrapper
*/
render_tool_numisdata_order_coins.prototype.edit = async function(options={render_level:'full'}) {

	const self = this

	// render level
		const render_level = options.render_level || 'full'

	// content_data
		const content_data = await get_content_data_edit(self)
		if (render_level==='content') {
			return content_data
		}

	// wrapper. ui build_edit returns component wrapper
		const wrapper = ui.tool.build_wrapper_edit(self, {
			content_data : content_data
		})

	// transcription_options are the buttons to get access to other tools (buttons in the header)
		const header_options_node = await render_header_options(self, content_data)
		wrapper.tool_buttons_container.appendChild(header_options_node)


	// render_activity_info are the information of the activity as "Save"
		const activity_info = render_activity_info(self)
		wrapper.activity_info_container.appendChild(activity_info)

		self.node = wrapper
		// set pointers
		wrapper.content_data = content_data
		get_ordered_coins(self)


	return wrapper
}//end edit



/**
* GET_CONTENT_DATA_EDIT
* @return HTMLElement content_data
*/
const get_content_data_edit = async function(self) {

	const fragment = new DocumentFragment()

	// left_container
		const left_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'left_container',
			parent			: fragment
		})

	// component_epigraphy. render another node of component caller and append to container

		self.coins.render_views.push(
			{
				view	: 'coins_mosaic',
				mode	: 'edit',
				render	: 'view_coins_mosaic_portal',
				path 	: '../../../tools/tool_numisdata_order_coins/js/view_coins_mosaic_portal.js'
			}
		)
		self.coins.show_interface.button_external = false
		const coins_node = await self.coins.render()
		left_container.appendChild(coins_node)


	// right_container
		const right_container = ui.create_dom_element({
			element_type	: 'div',
			class_name 		: 'right_container',
			parent 			: fragment
		})


	// content_data
		const content_data = ui.tool.build_content_data(self)
		content_data.appendChild(fragment)
		// save the pointers of the content_data nodes, to used by the buttons to access to the components
		content_data.left_container		= left_container
		content_data.right_container	= right_container


	return content_data
}//end get_content_data_edit



/**
* RENDER_HEADER_OPTIONS
* This is used to build a optional buttons inside the header
* @return HTMLElement fragment
*/
const render_header_options = async function(self, content_data) {

	const fragment = new DocumentFragment()

	const order_by_label = ui.create_dom_element({
		element_type	: 'span',
		class_name		: 'tool_button order_by light',
		text_content	: self.get_tool_label('order_by') || 'Order by:',
		parent			: fragment
	})

	const order_by_weight = ui.create_dom_element({
		element_type	: 'button',
		class_name		: 'tool_button order_by_weight light',
		text_content	: self.get_tool_label('weight') || 'Weight',
		parent			: fragment
	})

	// set a order object to define the current active option
	const order_active = {}
	order_by_weight.addEventListener('mouseup', ()=>{
		order_by_diameter.classList.remove('active')
		order_active.button_node	= order_by_weight
		order_active.tipo	= 'numisdata133'
		order_by(order_active)
	})

	const order_by_diameter = ui.create_dom_element({
		element_type	: 'button',
		class_name		: 'tool_button order_by_diameter light',
		text_content	: self.get_tool_label('diameter') || 'Diameter',
		parent			: fragment
	})

	order_by_diameter.addEventListener('mouseup', ()=>{
		order_by_weight.classList.remove('active')
		order_active.button_node = order_by_diameter
		order_active.tipo	= 'numisdata135'
		order_by(order_active)
	})

	// subscribe to window_blur of the portal coins
	event_manager.subscribe('window_bur_'+self.coins.id, fn_reorder)

	function fn_reorder(options) {
		order_active.button_node.classList.remove('active')
		order_by(order_active)
	}

	// order_by, get data and order by components or by section_id
	const order_by = async function (options) {
		//options
		const button_node	= options.button_node
		const tipo			= options.tipo

		button_node.classList.toggle('active')

		const data			= self.coins.data
		const order_data_value = []
		// if the button is active order by the component
		// else order by id (reorder the original data)
		if(button_node.classList.contains('active')){
			const weight_data	= self.coins.datum.data.filter(el => el.tipo === tipo)
			const order_weight	= weight_data.sort(function(a, b) {
				//check if the values are valid if not set null
				const a_value = a.value && a.value[0] ? a.value[0] : null
				const b_value = b.value && b.value[0] ? b.value[0] : null
				// order null values to end and lower data first ---> 0.1, 0.5, 1, 8, null
				return (a_value === null) - (b_value === null) || a_value - b_value;
			});
			// use the component order (diameter or weight) and apply to data of the coins portal data
			const weight_data_len = weight_data.length
			for (let i = 0; i < weight_data_len; i++) {
				const section_id	= weight_data[i].section_id
				const value_order	= data.value.find(el=>el.section_id === section_id)
				order_data_value.push(value_order)
			}
		}else{
			// order by original section_id
			const order_data	= data.value.sort(function(a, b) {
				return a.section_id - b.section_id;
			});

			order_data_value.push(...order_data)
		}
		// set the order data to the component build and render it and append to the left container
		self.coins.data.value = order_data_value
		await self.coins.build(false)
		self.coins.render('content')
	}

	const set_original_button = ui.create_dom_element({
		element_type	: 'button',
		class_name		: 'tool_button set_original light',
		text_content	: self.get_tool_label('original_copy') || 'Set Original / Copy',
		parent			: fragment
	})
	set_original_button.addEventListener('mouseup', async ()=>{
		const left_container = self.node.content_data.left_container

		const input_original_nodes	= left_container.querySelectorAll('input.input_original')
		const input_copy_nodes		= left_container.querySelectorAll('input.input_copy')

		const ar_original = []
		const input_original_nodes_len = input_original_nodes.length

		for (let i = input_original_nodes_len - 1; i >= 0; i--) {
			if(input_original_nodes[i].checked){
				ar_original.push(input_original_nodes[i])
			}
		}

		const ar_copies	= []
		const input_copy_nodes_len = input_copy_nodes.length
		for (let i = input_copy_nodes_len - 1; i >= 0; i--) {
			if(input_copy_nodes[i].checked){
				ar_copies.push(input_copy_nodes[i])
			}
		}
		self.set_original_copy({
			ar_original	: ar_original,
			ar_copies	: ar_copies
		})

	})

	return fragment
}//end render_header_options



/**
* RENDER_ACTIVITY_INFO
* This is used to build a optional buttons inside the header
* @param object self
* 	instance of current tool
* @return HTMLElement activity_info_body
*/
const render_activity_info = function(self) {

	// activity alert
		const activity_info_body = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'activity_info_body'
		})

	// event save
		self.events_tokens.push(
			event_manager.subscribe('save', fn_saved)
		)
		function fn_saved(options) {

			// recived options contains an object with instance and api_response
			const node_info_options = Object.assign(options,{
				container : activity_info_body
			})

			// render notification node
			const node_info = render_node_info(node_info_options)
			activity_info_body.prepend(node_info)
		}


	return activity_info_body
}//end render_activity_info



/**
* GET_ORDERED_COINS
* This is used to build the ordered coins node and assign the drop
* @param object self
* 	instance of current tool
* @return HTMLElement activity_info_body
*/
const get_ordered_coins = async function(self){

	const right_container = self.node.content_data.right_container

	// clean the coins container
		while (right_container.firstChild) {
			right_container.removeChild(right_container.firstChild);
		}

	// Coins
		const coins_container = ui.create_dom_element({
			element_type	: 'div',
			class_name 		: 'coins_container',
			parent 			: right_container
		})

	await self.ordered_coins.destroy(false, true, true) // instance=false, delete_dependencies=true, remove_dom=true
	await self.ordered_coins.build(true)
	self.ordered_coins.show_interface.button_add		= true
	self.ordered_coins.show_interface.show_autocomplete	= false


	const ordered_coins_node = await self.ordered_coins.render()
	coins_container.appendChild(ordered_coins_node)

	// listen the portal refreshed in other window and assign the drop events to refreshed nodes
	// self.ordered_coins.events_tokens.push(
	// 	event_manager.subscribe('window_bur_'+ self.ordered_coins.id, assing_drop)
	// )
	// self.ordered_coins.events_tokens.push(
	// 	event_manager.subscribe('add_row_'+ self.ordered_coins.id, assing_drop)
	// )

	// function assing_drop(options) {

	// 	drop({
	// 		self : self
	// 	})
	// }


	render_tool_numisdata_order_coins.prototype.drop({
		self : self
	})
}//end get_ordered_coins



/**
* DROP
* This is used to build the ordered coins node ans assign the drop
* @param object self
* 	instance of current tool
* @return void
*/
render_tool_numisdata_order_coins.prototype.drop = function (options) {

	const self			= options.self
	const ar_drop_nodes = self.ordered_coins.node.querySelectorAll('.column_numisdata9')

	const drop_zones_len = ar_drop_nodes.length

	for (let i = drop_zones_len - 1; i >= 0; i--) {

		const current_node = ar_drop_nodes[i]

		// dragover event
			current_node.addEventListener('dragover',function(e){
				e.preventDefault()
				e.stopPropagation()
				e.dataTransfer.dropEffect = 'move'
				// css
					current_node.classList.add('dragover')
					current_node.classList.remove('drop')
			},false)

			// dragleave event
				current_node.addEventListener('dragleave',function(e){
					e.preventDefault()
					e.stopPropagation()
					e.dataTransfer.dropEffect = 'move'
					// css
						current_node.classList.remove('dragover')
				},false)

			// drop event
				current_node.addEventListener('drop', function(e){
					e.preventDefault()
					e.stopPropagation()

					// css
						current_node.classList.remove('dragover')
						current_node.classList.add('drop_ordered_coins')

					// data_transfer
						const data	= e.dataTransfer.getData('text/plain');// element that's move

					// the drag element will sent the data of the original position, the source_key
						const data_parse = JSON.parse(data)

					// assign element to target portal
						const change = self.assign_element({
							caller 	: current_node.component_instance,
							locator : data_parse.locator
						}).then( response =>{
							get_ordered_coins(self)

							// change the drag icon to show as used
							const draged_section_record = self.coins.ar_instances.find(el =>
								el.section_id === data_parse.locator.section_id
								&& el.section_tipo === data_parse.locator.section_tipo
								&& el.id_variant !== 'hover'
							)
							// select the drag node and add the class used
							if(draged_section_record){
								draged_section_record.node.querySelector('#col_original .drag').classList.add('used')
							}
						})
				},false)
	}// end for (let i = drop_zones_len - 1; i >= 0; i--)
}//end drop



// @license-end
