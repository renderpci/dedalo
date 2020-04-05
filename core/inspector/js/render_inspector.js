// import
	import {ui} from '../../common/js/ui.js'
	import {data_manager} from '../../common/js/data_manager.js'
	import {event_manager} from '../../common/js/event_manager.js'



/**
* RENDER_inspector
* Manages the component's logic and apperance in client side
*/
export const render_inspector = function() {

	return true
}//end render_inspector



/**
* EDIT
* Render node for use in edit
* @return DOM node wrapper
*/
render_inspector.prototype.edit = async function(options) {

	const self = this

	// render_level
		const render_level = options.render_level || 'full'

	// content data
		const content_data = await get_content_data(self)
		if (render_level==='content') {
			return content_data
		}

	// label
		const label = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'label',
			inner_html 		: 'Inspector'
		})

	// wrapper
		const wrapper = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'wrapper_inspector text_unselectable',
		})

	// add elements
		wrapper.appendChild(label)
		wrapper.appendChild(content_data)

	// events
		// add_events(wrapper, self)


	return wrapper
}//end edit



/**
* ADD_EVENTS
* Attach element generic events to wrapper
*/
const add_events = (wrapper, self) => {

	// mousedown
		wrapper.addEventListener("mousedown", function(e){
			e.stopPropagation()
			//e.preventDefault()
			// prevent buble event to container element
			return false
		})


	return true
}//end add_events



/**
* GET_CONTENT_DATA
* @return DOM node content_data
*/
const get_content_data = async function(self) {

	// content_data
		const content_data = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'content_data inspector_content_data',
		})

	// paginator container
		const paginator_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'paginator_container',
			parent 			: content_data
		})

	// buttons container
		const buttons_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'buttons_container',
			parent 			: content_data
		})

		// button_new . Call API to create new section and navigate to the new record
			const button_new = ui.button.build_button({
				class_name 	: "new",
				label 		: get_label.nuevo || "New"
			})
			button_new.addEventListener('click', async (e) => {
				e.stopPropagation()

				// data_manager. create
				const api_response = await data_manager.prototype.request({
					body : {
						action 		: 'create',
						section_tipo: self.section_tipo
					}
				})
				if (api_response.result && api_response.result>0) {
					// launch event 'user_action' that page is watching
					event_manager.publish('user_action', {
						tipo 			 : self.caller.tipo,
						mode 			 : self.caller.mode,
						section_id		 : api_response.result
					})
				}
			})
			buttons_container.appendChild(button_new)


	// project container
		const project_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'project_container',
			parent 			: content_data
		})

	// data_link
		const data_link = ui.create_dom_element({
			element_type	: 'a',
			class_name		: 'data_link',
			title_label 	: 'Download record data',
			parent 			: content_data
		})
		data_link.addEventListener("click", (e)=>{
			e.preventDefault()
			// window.open( DEDALO_CORE_URL + '/json/' + self.section_tipo + '/' + self.section_id )
			window.open( DEDALO_CORE_URL + '/json/json_display.php?url_locator=' + self.section_tipo + '/' + self.section_id )
		})


	return content_data
}// end get_content_data


