// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, DEDALO_CORE_URL */
/*eslint no-undef: "error"*/



// imports
	// import {event_manager} from '../../../common/js/event_manager.js'
	import {ui} from '../../../common/js/ui.js'
	import {data_manager} from '../../../common/js/data_manager.js'
	import {create_source} from '../../../common/js/common.js'




/**
* RENDER_EDIT_SERVICE_TMP_SECTION
* Manages the service's logic and appearance in client side
*/
export const render_edit_service_tmp_section = function() {

	return true
}//end render_edit_service_tmp_section



/**
* EDIT
* Render node for use like button
* @param object options
* @return HTMLElement wrapper
*/
render_edit_service_tmp_section.prototype.edit = async function (options) {

	const self = this

	// options
		const render_level = options.render_level || 'full'

	// content_data
		const content_data = await get_content_data(self)
		if (render_level==='content') {
			return content_data
		}

	// wrapper
		const wrapper = ui.create_dom_element({
			element_type	: 'div',
			class_name		: self.model
		})
		wrapper.appendChild(content_data)
		// set pointers
		wrapper.content_data = content_data


	return wrapper
}//end edit



/**
* GET_CONTENT_DATA
* @param object self
* @return HTMLElement content_data
*/
export const get_content_data = async function(self) {

	// content_data
		const content_data = document.createElement('div')
			  content_data.classList.add('content_data')

	// render template
		const tmp_components_node = await render_tmp_components(self)
		content_data.appendChild(tmp_components_node)


	return content_data
}//end get_content_data



/**
* RENDER_TMP_COMPONENTS
* @object self
* @return HTMLElement DocumentFragment
*/
const render_tmp_components = async function(self) {

	const fragment = new DocumentFragment();

	const ar_instances			= self.ar_instances
	const ar_instances_length	= ar_instances.length
	for (let i = 0; i < ar_instances_length; i++) {

		const current_instance = ar_instances[i]

		// show_interface
		current_instance.show_interface.tools = true

		const instance_node = await current_instance.render()
		fragment.appendChild(instance_node)
	}


	return fragment
}//end render_tmp_components



// @license-end

