// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'



/**
* VIEW_DEFAULT_LIST_INFO
* Manages the component's logic and appearance in client side
*/
export const view_default_list_info = function() {

	return true
}//end view_default_list_info



/**
* RENDER
* Render component node to use in list
* @return HTMLElement wrapper
*/
view_default_list_info.render = async function(self, options) {

	// widgets load
		await self.get_widgets()

	// content_data
		const content_data = await get_content_data(self)

	// wrapper
		const wrapper = ui.component.build_wrapper_list(self, {})

	// Set value
		wrapper.appendChild(content_data)


	return wrapper
}//end render



/**
* GET_CONTENT_DATA
* @return DOM DocumentFragment
*/
export const get_content_data = async function(self) {

	const fragment = new DocumentFragment()

	// values (inputs)
		const widgets			= self.ar_instances
		const widgets_length	= widgets.length
		for (let i = 0; i < widgets_length; i++) {

			const current_widget = widgets[i]

			await current_widget.build()
			const widget_node = await current_widget.render()
			fragment.appendChild(widget_node)
		}


	return fragment
}//end get_content_data



// @license-end
