/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../common/js/event_manager.js'
	// import {data_manager} from '../../common/js/data_manager.js'
	// import {get_instance, delete_instance} from '../../common/js/instances.js'
	import {ui} from '../../common/js/ui.js'
	import {service_autocomplete} from '../../services/service_autocomplete/js/service_autocomplete.js'
	import {build_content_data, add_events} from '../../component_portal/js/render_edit_component_portal.js'
	// import {view_autocomplete} from './view_autocomplete.js'



/**
* RENDER_SEARCH_COMPONENT_PORTAL
* Manages the component's logic and apperance in client side
*/
export const render_search_component_portal = function() {

	return true
};//end render_search_component_portal



/**
* SEARCH
* Render node for use in search
* @return DOM node wrapper
*/
render_search_component_portal.prototype.search = async function(options={render_level:'full'}) {

	const self = this

	// render_level
	const render_level = options.render_level

	const content_data = await build_content_data(self)
	if (render_level==='content') {
		return content_data
	}

	// wrapper. ui build_edit returns component wrapper
		const wrapper = ui.component.build_wrapper_edit(self, {
			content_data : content_data
		})
		wrapper.classList.add("portal")

	// id
		wrapper.id = self.id

	// events
		add_events(self, wrapper)

	// activate service autocomplete. Enable the service_autocomplete when the user do click
		if(self.autocomplete_active===false){

			// set rqo
				self.rqo_search = self.rqo_search || self.build_rqo_search(self.rqo_config, 'search')

			self.autocomplete = new service_autocomplete()
			self.autocomplete.init({
				caller	: self,
				wrapper : wrapper
			})
			self.autocomplete_active = true
			self.autocomplete.search_input.focus()
		}

	return wrapper
};//end search


