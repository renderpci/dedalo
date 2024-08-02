// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global */
/*eslint no-undef: "error"*/


// UNDER CONSTRUCTION. (!) NOTE THAT CURRENTLY, THIS COMPONENT IS NOT SHOWED IN SEARCH LIST


// imports
	import {ui} from '../../common/js/ui.js'
	import {
		get_content_data
	}
	from './view_default_edit_geolocation.js'



/**
* RENDER_SEARCH_COMPONENT_GEOLOCATION
* Manages the component's logic and appearance in client side
*/
export const render_search_component_geolocation = function() {

	return true
}//end render_search_component_geolocation



/**
* SEARCH
* Render node for use in edit
* @return HTMLElement wrapper
*/
render_search_component_geolocation.prototype.search = async function(options) {

	const self = this

	// render_level
		const render_level = options.render_level || 'full'

	// content_data
		const content_data = await get_content_data(self)
		if (render_level==='content') {
			return content_data
		}

	// wrapper. ui build_edit returns component wrapper
		const wrapper = ui.component.build_wrapper_search(self, {
			content_data : content_data
		})
		// set pointers
		wrapper.content_data = content_data


	return wrapper
}//end search



// @license-end
