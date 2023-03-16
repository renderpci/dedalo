/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../../core/common/js/event_manager.js'
	import {ui} from '../../../core/common/js/ui.js'
	import {keyboard_codes} from '../../../core/common/js/utils/keyboard.js'
	import {render_node_info} from '../../../core/common/js/utils/notifications.js'
	import {open_tool} from '../../tool_common/js/tool_common.js'
	import {data_manager} from '../../../core/common/js/data_manager.js'



/**
* RENDER_tool_numisdata_cataloging
* Manages the component's logic and appearance in client side
*/
export const render_tool_numisdata_cataloging = function() {

	return true
}//end render_tool_numisdata_cataloging



/**
* EDIT
* Render node
* @return HTMLElement wrapper
*/
render_tool_numisdata_cataloging.prototype.edit = async function(options={render_level:'full'}) {

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
		// get_ordered_coins(self)


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

	// section_to_cataloging section. render another node of component caller and append to container
		self.section_to_cataloging.render_views.push(
			{
				view	: 'types_mosaic',
				mode	: 'list',
				render	: 'view_types_mosaic',
				path 	: '../../../tools/tool_numisdata_cataloging/js/view_types_mosaic.js'
			}
		)
		const section_node = await self.section_to_cataloging.render()
		left_container.appendChild(section_node)


	// right_container
		const right_container = ui.create_dom_element({
			element_type	: 'div',
			class_name 		: 'right_container',
			parent 			: fragment
		})

		// thesaurus render
			self.area_thesaurus.render()
			.then(function(node){
				right_container.appendChild(node)
				// fix pointer
				right_container.area_thesaurus_node = node
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
* This is used to build the ordered coins node ans assign the drop
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
	const ordered_coins_node = await self.ordered_coins.render()
	coins_container.appendChild(ordered_coins_node)

	// listen the portal refreshed in other window ans assign the drop events to refreshed nodes
	self.events_tokens.push(
		event_manager.subscribe('window_bur_'+ self.ordered_coins.id, assing_drop)
	)
	function assing_drop(options) {

		drop({
			self : self
		})
	}


	drop({
		self : self
	})
}//end get_ordered_coins




/**
* DROP
* This is used to build the ordered coins node ans assign the drop
* @param object self
* 	instance of current tool
*/
const drop = function (options) {

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
							}
						)
				},false)
	}// end for (let i = drop_zones_len - 1; i >= 0; i--)

}// end drop
