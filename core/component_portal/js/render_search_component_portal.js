/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../common/js/event_manager.js'
	// import {data_manager} from '../../common/js/data_manager.js'
	// import {get_instance, delete_instance} from '../../common/js/instances.js'
	import {ui} from '../../common/js/ui.js'
	import {service_autocomplete} from '../../services/service_autocomplete/js/service_autocomplete.js'
	// import {build_content_data} from '../../component_portal/js/render_edit_component_portal.js'
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

	// content_data. Note that function build_content_data is imported from edit mode
		const content_data = build_content_data(self)
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

	// change event, for every change the value in the inputs of the component
		wrapper.addEventListener('change', (e) => {

			// q_operator. get the input value of the q_operator
				// q_operator: is a separate operator used with components that is impossible mark the operator in the input_value,
				// like; radio_button, check_box, date, autocomplete, etc
				if (e.target.matches('input[type="text"].q_operator')) {

					// input. Get the input node that has changed
						const input = e.target
					// value
						const value = (input.value.length>0) ? input.value : null
					// q_operator. Fix the data in the instance previous to save
						self.data.q_operator = value
					// publish search. Event to update the dom elements of the instance
						event_manager.publish('change_search_element', self)

					return true
				}
		})

	// click delegated
		wrapper.addEventListener("click", function(e){
			e.stopPropagation()

			if (e.target.matches('input[type="text"].q_operator')) {
				// prevent activate component on click inside q_operator input
				return true
			}

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


/**
* BUILD_CONTENT_DATA
* Used too in search mode
* @return DOM node content_data
*/
export const build_content_data = function(self) {

	const fragment = new DocumentFragment()

	// q operator (search only)
		const q_operator = self.data.q_operator
		const input_q_operator = ui.create_dom_element({
			element_type	: 'input',
			type			: 'text',
			value			: q_operator,
			class_name		: 'q_operator',
			parent			: fragment
		})

	// inputs container
		const inputs_container = ui.create_dom_element({
			element_type	: 'ul',
			class_name		: 'inputs_container'
		})

	// build values (add all nodes from the rendered_section_record)
		const build_values = async function() {

			const ar_section_record = await self.get_ar_instances({mode:'mini'})
			// store to allow destroy later
			self.ar_instances.push(...ar_section_record)

			const length = ar_section_record.length
			for (let i = 0; i < length; i++) {

				const current_section_record = ar_section_record[i]
				if (!current_section_record) {
					console.warn("empty current_section_record:",current_section_record)
				}

				// input_element. Get_input_element, also renders current section record
				const input_element = get_input_element(current_section_record)
				inputs_container.appendChild(input_element)
			}

			return true
		}
		fragment.appendChild(inputs_container)

	// set node only when it is in DOM (to save browser resources)
		const observer = new IntersectionObserver(function(entries) {
			const entry = entries[1] || entries[0]
			if (entry.isIntersecting===true || entry.intersectionRatio > 0) {
				observer.disconnect();
				build_values()
			}
		}, { threshold: [0] });
		observer.observe(inputs_container);
		// build_values()

	// build references
		// if(self.data.references && self.data.references.length > 0){
		// 	const references_node = render_references(self.data.references)
		// 	fragment.appendChild(references_node)
		// }

	// content_data
		const content_data = ui.component.build_content_data(self)
			  content_data.appendChild(fragment)


	return content_data
};//end build_content_data



/**
* GET_INPUT_ELEMENT
* @return dom element li
*/
const get_input_element = function(current_section_record){

	 // key. when portal is in search mode, is undefined, fallback to zero
	const key = current_section_record.paginated_key || 0

	// li
		const li = ui.create_dom_element({
			element_type	: 'li',
			dataset			: { key : key }
		})

	// input field
		current_section_record.render()
		.then(function(section_record_node){

			// section_record_node append
				li.appendChild(section_record_node)

			// button remove
				const button_remove = ui.create_dom_element({
					element_type	: 'span',
					class_name		: 'button remove',
					dataset			: { key : key },
					parent			: li
				})
		})

	return li
};//end  get_input_element


