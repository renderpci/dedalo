// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../../core/common/js/event_manager.js'
	import {ui} from '../../../core/common/js/ui.js'
	import {render_node_info} from '../../../core/common/js/utils/notifications.js'



/**
* RENDER_TOOL_CATALOGING
* Manages the component's logic and appearance in client side
*/
export const render_tool_cataloging = function() {

	return true
}//end render_tool_cataloging



/**
* EDIT
* Render node
* @return HTMLElement wrapper
*/
render_tool_cataloging.prototype.edit = async function(options={render_level:'full'}) {

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
		// set pointers
		wrapper.content_data = content_data

	// transcription_options are the buttons to get access to other tools (buttons in the header)
		const header_options_node = await render_header_options(self, content_data)
		wrapper.tool_buttons_container.appendChild(header_options_node)

	// render_activity_info are the information of the activity as "Save"
		const activity_info = render_activity_info(self)
		wrapper.activity_info_container.appendChild(activity_info)
		self.node = wrapper


	return wrapper
}//end edit



/**
* GET_CONTENT_DATA_EDITç
* @param object self
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
					view	: 'tool_cataloging_mosaic',
					mode	: 'list',
					render	: 'view_tool_cataloging_mosaic',
					path 	: '../../../tools/tool_cataloging/js/view_tool_cataloging_mosaic.js'
				}
			)
			// view . Note that view is set in properties, but it set again to clarify the code
			self.section_to_cataloging.view = 'tool_cataloging_mosaic'
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
* @param object self
* @param HTMLElement content_data
* @return HTMLElement DocumentFragment
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

			// revived options contains an object with instance and api_response
			const node_info_options = Object.assign(options,{
				container : activity_info_body
			})

			// render notification node
			const node_info = render_node_info(node_info_options)
			activity_info_body.prepend(node_info)
		}


	return activity_info_body
}//end render_activity_info



// @license-end
