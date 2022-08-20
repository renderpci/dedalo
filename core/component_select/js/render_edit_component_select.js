/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'



/**
* RENDER_EDIT_COMPONENT_SELECT
* Manages the component's logic and appearance in client side
*/
export const render_edit_component_select = function() {

	return true
}//end render_edit_component_select



/**
* EDIT
* Render node for use in edit
* @return DOM node
*/
render_edit_component_select.prototype.edit = async function(options) {

	const self = this

	const render_level = options.render_level || 'full'

	// content_data
		const content_data = get_content_data(self)
		if (render_level==='content') {
			return content_data
		}

	// buttons
		const buttons = get_buttons(self)

	// wrapper. ui build_edit returns component wrapper
		const wrapper = ui.component.build_wrapper_edit(self, {
			content_data	: content_data,
			buttons			: buttons
		})
		// set pointers
		wrapper.content_data = content_data

	// add events delegated
		add_events(self, wrapper)


	return wrapper
}//end edit



/**
* ADD_EVENTS
*/
const add_events = (self, wrapper) => {

	// update value, subscription to the changes: if the dom input value was changed, observers dom elements will be changed own value with the observable value
		self.events_tokens.push(
			event_manager.subscribe('update_value_'+self.id, update_value)
		)
		function update_value (component) {
			// change the value of the current dom element
			const changed_data = component.data.changed_data
			const changed_node = wrapper.querySelector('input[data-key="'+component.selected_key+'"]')
		}

	// edit button element, subscription to the events
		self.events_tokens.push(
			event_manager.subscribe('edit_element_'+self.id, edit_element)
		)
		function edit_element(changed_data) {
			// change the value of the current dom element
			//const changed_data = component.data.changed_data
			//const inputs_container = wrapper.querySelector('.inputs_container')
			//input_element(changed_data.key, changed_data.value, inputs_container)
		}

	// change event, for every change the value in the inputs of the component
		wrapper.addEventListener('change', (e) => {
			// e.stopPropagation()

			// update
				if (e.target.matches('select')) {

					const parsed_value = (e.target.value.length>0) ? JSON.parse(e.target.value) : null

					const changed_data = Object.freeze({
						action	: (parsed_value != null) ? 'update' : 'remove',
						key		: (parsed_value != null) ? 0 : false,
						value	: parsed_value
					})

					self.change_value({
						changed_data	: changed_data,
						refresh			: false,
						remove_dialog	: false
					})
					.then((api_response)=>{
						//self.selected_key = e.target.dataset.key
						// event to update the dom elements of the instance
						event_manager.publish('update_value_'+self.id, self)
					})

					return true
				}
		})

	// click event
		wrapper.addEventListener("click", e => {
			// e.stopPropagation()

			// // edit target section
				// if (e.target.matches('.button.edit')) {
				// 	// rebuild_nodes. event to render the component again
				// 	event_manager.publish('edit_element_'+self.id, self)

				// 	return true
				// }

			// // mode change
			// 	if (e.target.matches('.button.close')) {
			// 		//change mode
			// 		self.change_mode('list', true)

			// 		return true
			// 	}
		})

	// focus event
		// wrapper.addEventListener("focus", e => {
		// 	// e.stopPropagation()

		// 	// selected_node. fix selected node
		// 	self.selected_node = wrapper

		// 	if (e.target.matches('select')) {
		// 	 	event_manager.publish('active_component', self)

		// 	 	return true
		// 	}
		// },true)


	return true
}//end add_events



/**
* GET_CONTENT_DATA
* @return DOM node content_data
*/
const get_content_data = function(self) {

	// content_data
		const content_data = ui.component.build_content_data(self)

	// build select-able options
		const i				= 0
		const content_value	= get_content_value(i, self)
		content_data.appendChild(content_value)
		// set pointers
		content_data[i] = content_value


	return content_data
}//end get_content_data



/**
* GET_CONTENT_VALUE
* @return DOM node content_value
*/
const get_content_value = (i, self) => {

	// short vars
		const data		= self.data || {}
		const value		= data.value || []
		const datalist	= data.datalist || []

	// content_value
		const content_value = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'content_value'
		})

	// select
		const select = ui.create_dom_element({
			element_type	: 'select',
			class_name		: 'select_lang',
			parent			: content_value
		})
		select.addEventListener('change', function(){
			const value = this.value
				? JSON.parse(this.value)
				: null
			if (value) {
				button_edit.classList.remove('hide')
			}else{
				button_edit.classList.add('hide')
			}
		})

	// add empty option at beginning of the array
		const empty_option = {
			label	: '',
			value	: null
		}
		datalist.unshift(empty_option);

	// build options
		const value_compare		= value.length>0 ? value[0] : null
		const datalist_length	= datalist.length
		for (let i = 0; i < datalist_length; i++) {

			const datalist_item = datalist[i]

			const current_section_id = typeof datalist_item.section_id!=='undefined'
				? datalist_item.section_id
				: null

			const option = ui.create_dom_element({
				element_type	: 'option',
				value			: JSON.stringify(datalist_item.value),
				inner_html		: datalist_item.label,
				parent			: select
			})
			// selected options set on match
			if (value_compare && datalist_item.value &&
				value_compare.section_id===datalist_item.value.section_id &&
				value_compare.section_tipo===datalist_item.value.section_tipo
				) {
				option.selected = true
			}

			// developer_info
				if (current_section_id) {
					// developer_info
					ui.create_dom_element({
						element_type	: 'span',
						class_name		: 'developer_info hide show_on_active',
						text_content	: ` [${current_section_id}]`,
						parent			: option
					})
				}
		}//end for (let i = 0; i < datalist_length; i++)

	// button_edit
		const button_edit = ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'button edit show_on_active',
			parent			: content_value
		})
		button_edit.addEventListener("click", function(e){
			e.stopPropagation()
			try {

				if (!select.value) {
					return false
				}

				const selected_locator = JSON.parse(select.value)
				// target_section
				const target_section_tipo	= selected_locator.section_tipo
				const target_section_id		= selected_locator.section_id

				// navigation
					const user_navigation_options = {
						source		: {
							action			: 'search',
							model			: 'section',
							tipo			: target_section_tipo,
							section_tipo	: target_section_tipo,
							mode			: 'edit',
							lang			: self.lang
						},
						sqo : {
							section_tipo		: [{tipo : target_section_tipo}],
							filter				: null,
							limit				: 1,
							filter_by_locators	: [{
								section_tipo	: target_section_tipo,
								section_id		: target_section_id
							}]
						}
					}
				event_manager.publish('user_navigation', user_navigation_options)
			} catch (error) {
				console.error(error)
			}
		})
		// console.log("value_compare:", self.tipo, value_compare);
		if (!value_compare) {
			button_edit.classList.add('hide')
		}


	return content_value
}//end get_content_value



/**
* GET_BUTTONS
* @param object instance
* @return DOM node buttons_container
*/
const get_buttons = (self) => {

	const is_inside_tool	= self.is_inside_tool
	const mode				= self.mode

	const fragment = new DocumentFragment()

	// button edit (go to target section)
		if((mode==='edit' || mode==='edit_in_list') && !is_inside_tool) {

			const target_sections			= self.context.target_sections || []
			const target_sections_length	= target_sections.length
			for (let i = 0; i < target_sections_length; i++) {

				const item = target_sections[i]

				const label = (SHOW_DEBUG===true)
					? `${item.label} [${item.tipo}]`
					: item.label

				const button_edit = ui.create_dom_element({
					element_type	: 'span',
					class_name		: 'button edit',
					title			: label,
					parent			: fragment
				})
				button_edit.addEventListener("click", function(e){
					e.stopPropagation()
					// navigate link
					event_manager.publish('user_navigation', {
						source : {
							tipo	: item.tipo,
							model	: 'section',
							mode	: 'list'
						}
					})
				})
			}
		}

	// tools buttons
		if (!is_inside_tool) {
			ui.add_tools(self, fragment)
		}

	// buttons container
		const buttons_container = ui.component.build_buttons_container(self)
			// buttons_container.appendChild(fragment)

	// buttons_fold (allow sticky position on large components)
		const buttons_fold = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'buttons_fold',
			parent			: buttons_container
		})
		buttons_fold.appendChild(fragment)


	return buttons_container
}//end get_buttons
