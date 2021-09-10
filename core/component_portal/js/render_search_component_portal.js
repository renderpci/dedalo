/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../common/js/event_manager.js'
	// import {data_manager} from '../../common/js/data_manager.js'
	// import {get_instance, delete_instance} from '../../common/js/instances.js'
	import {ui} from '../../common/js/ui.js'
	import {service_autocomplete} from '../../services/service_autocomplete/js/service_autocomplete.js'
	import {build_content_data} from '../../component_portal/js/render_edit_component_portal.js'
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
render_search_component_portal.prototype.search = async function(options) {

	const self = this

	// options
		const render_level = options.render_level || 'full'

	// fix paginated key
		// self.paginated_key = 0

	// content_data. Note that function build_content_data is imported from edit mode
		const content_data = await build_content_data(self)
		if (render_level==='content') {
			return content_data
		}

	// wrapper. ui build_edit returns component wrapper
		const wrapper = ui.component.build_wrapper_search(self, {
			content_data : content_data
		})
		wrapper.classList.add("portal")

	// events
		add_events(self, wrapper)

	return wrapper
};//end search



/**
* ADD_EVENTS
* @return bool
*/
export const add_events = function(self, wrapper) {

	// click delegated
		wrapper.addEventListener("click", function(e){
			e.stopPropagation()

			// remove row
				if (e.target.matches('.button.remove')) {
					e.preventDefault()

					const changed_data = Object.freeze({
						action	: 'remove',
						key		: JSON.parse(e.target.dataset.key),
						value	: null
					})

					// update . return bool
						const update = self.update_data_value(changed_data)

					// publish search. Event to update the dom elements of the instance
						event_manager.publish('change_search_element', self)

					// refresh
						self.refresh()

					return true
				}

			event_manager.publish('active_component', self)

			// self.node.map(function(item_node) {
			// 	item_node.classList.add("active")
			// })

			// remove service autocomplete if active
				// if(self.autocomplete && self.autocomplete_active === true){
				// 	self.autocomplete.destroy()
				// 	self.autocomplete_active = false
				// 	self.autocomplete = null
				// }

			// activate service autocomplete. Enable the service_autocomplete when the user do click
				if(self.autocomplete_active===false){

					// set rqo
						self.rqo_search = self.rqo_search || self.build_rqo_search(self.rqo_config, 'search')
						// self.rqo.choose 	= self.rqo.choose || self.build_rqo('choose', self.context.request_config, 'get_data')

					// autocomplete
						self.autocomplete = new service_autocomplete()
						self.autocomplete.init({
							caller	: self,
							wrapper : wrapper
						})
						self.autocomplete_active = true
						self.autocomplete.search_input.focus()

					return true
				}

		})//end click event


	return true
};//end  add_events


