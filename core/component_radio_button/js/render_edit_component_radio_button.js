/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'



/**
* RENDER_EDIT_COMPONENT_RADIO_BUTTON
* Manage the components logic and appearance in client side
*/
export const render_edit_component_radio_button = function() {

	return true
};//end render_edit_component_radio_button



/**
* EDIT
* Render node for use in modes: edit, edit_in_list
* @return DOM node
*/
render_edit_component_radio_button.prototype.edit = async function(options) {

	const self = this

	// render_level
		const render_level = options.render_level || 'full'

	// content_data
		const content_data = get_content_data_edit(self)
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

	// events
		add_events(self, wrapper)

	return wrapper
};//end edit



/**
* ADD_EVENTS
* @return bool
*/
const add_events = function(self, wrapper) {

	// events delegated
	// update value, subscription to the changes: if the dom input value was changed, observers dom elements will be changed own value with the observable value
		self.events_tokens.push(
			event_manager.subscribe('update_value_'+self.id, update_value)
		)
		function update_value (component) {
			// change the value of the current dom element
			const changed_data = component.data.changed_data
			const changed_node = wrapper.querySelector('input[data-key="'+component.selected_key+'"]')
		}

	// add button element, subscription to the events
		self.events_tokens.push(
			event_manager.subscribe('edit_element_'+self.id, edit_element)
		)
		function edit_element(changed_data) {
			// change the value of the current dom element
			//const changed_data = component.data.changed_data
			//const inputs_container = wrapper.querySelector('.inputs_container')
			//input_element(changed_data.key, changed_data.value, inputs_container)
		}

	// remove button element, subscription to the events
		self.events_tokens.push(
			event_manager.subscribe('reset_element_'+self.id, reset_element)
		)
		async function reset_element(instance) {
			// change all elements inside of content_data
			const new_content_data = await get_content_data_edit(instance)
			// replace the content_data with the refresh dom elements (imputs, delete buttons, etc)
			wrapper.childNodes[1].replaceWith(new_content_data)
		}

	// change event, for every change the value in the inputs of the component
		wrapper.addEventListener('change', (e) => {
			// e.stopPropagation()

			// update
				if (e.target.matches('input[type="radio"]')) {

					const parsed_value 	= JSON.parse(e.target.value)

					const changed_data = Object.freeze({
						action  : 'update',
						key 	: 0,
						value 	: parsed_value
					})

					self.change_value({
						changed_data : changed_data,
						refresh 	 : false
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

			// remove all
				if (e.target.matches('.button.reset')) {

					if (self.data.value[0] !=null) {
						// force possible input change before remove
						document.activeElement.blur()

						if (self.data.value.length===0) {
							return true
						}

						const changed_data = Object.freeze({
							action  : 'remove',
							key 	: false,
							value 	: null
						})

						self.change_value({
							changed_data : changed_data,
							label  		 : self.get_checked_value_label(),//'All',
							refresh 	 : true
						})
						.then((api_response)=>{
							// rebuild and save the component
							// event_manager.publish('reset_element_'+self.id, self)
							// event_manager.publish('save_component_'+self.id, self)
						})

						return true
					}
				}

			// edit target section
				if (e.target.matches('.button.edit')) {
					// rebuild_nodes. event to render the component again
					event_manager.publish('edit_element_'+self.id, self)

					return true
				}

		})

	// focus event
		// wrapper.addEventListener("focus", e => {
		// 	// e.stopPropagation()

		// 	// selected_node. fix selected node
		// 	self.selected_node = wrapper

		// 	if (e.target.matches('input[type="radio"]')) {
		// 	 	event_manager.publish('active_component', self)

		// 	 	return true
		// 	}
		// },true)


	return true
};//end add_events



/**
* GET_CONTENT_DATA_EDIT
* @return DOM node content_data
*/
const get_content_data_edit = function(self) {

	// short vars
		const datalist	= self.data.datalist
		const mode		= self.mode

	const fragment = new DocumentFragment()

	// inputs_container
		const inputs_container = ui.create_dom_element({
			element_type	: 'ul',
			class_name		: 'inputs_container',
			parent			: fragment
		})

	// inputs
		const value				= (self.data.value.length<1) ? [null] : self.data.value
		const value_compare		= value.length>0 ? value[0] : null
		const datalist_length	= datalist.length
		for (let i = 0; i < datalist_length; i++) {
			const input_element = get_input_element_edit(i, datalist[i], self)
			inputs_container.appendChild(input_element)
		}

	// buttons
		const buttons_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'buttons_container',
			parent			: fragment
		})

	// content_data
		const content_data = ui.component.build_content_data(self, {
			autoload : true
		})

		content_data.appendChild(fragment)

	return content_data
};//end get_content_data_edit



/**
* GET_BUTTONS
* @param object instance
* @return DOM node buttons_container
*/
const get_buttons = (self) => {

	const is_inside_tool	= self.is_inside_tool
	const mode				= self.mode

	const fragment = new DocumentFragment()

	// button edit
		if((mode==='edit' || mode==='edit_in_list') && !is_inside_tool){
			const button_edit = ui.create_dom_element({
				element_type	: 'span',
				class_name 		: 'button edit',
				parent 			: fragment
			})
			button_edit.addEventListener("click", function(e){
				e.stopPropagation()
				try {
					// target_section
						const sqo = self.context.request_config.find(el => el.api_engine==='dedalo').sqo //.sqo.section_tipo
						const target_section_tipo = sqo.section_tipo[0].tipo
					// navigation
						const user_navigation_options = {
							source		: {
								action			: 'search',
								model			: 'section',
								tipo			: target_section_tipo,
								section_tipo	: target_section_tipo,
								mode			: 'list',
								lang			: self.lang
							},
							sqo : sqo
						}
						console.log("user_navigation_options:",user_navigation_options);
					event_manager.publish('user_navigation', user_navigation_options)
				} catch (error) {
					console.error(error)
				}
			})
		}

	// button reset
		if(mode==='edit' || mode==='edit_in_list'){// && !is_inside_tool){
			ui.create_dom_element({
				element_type	: 'span',
				class_name 		: 'button reset',
				parent 			: fragment
			})
		}

	// buttons tools
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
};//end get_buttons



/**
* GET_INPUT_ELEMENT_EDIT
* @return DOM element li
*/
const get_input_element_edit = (i, current_value, self) => {

	const input_id = self.id +"_"+ i + "_" + new Date().getUTCMilliseconds()

	const value				= self.data.value || []
	const value_length		= value.length
	const datalist_item		= current_value
	const datalist_value	= datalist_item.value
	const label				= datalist_item.label
	const section_id		= datalist_item.section_id

	// li
		const li = ui.create_dom_element({
			element_type	: 'li'
		})

	// input checkbox
		const input = ui.create_dom_element({
			element_type	: 'input',
			type			: 'radio',
			id				: input_id,
			name			: self.id,
			dataset			: { key : i },
			value			: JSON.stringify(datalist_value),
			parent			: li
		})

	// checked input set on match
		for (let j = 0; j < value_length; j++) {
			if (value[j] && datalist_value &&
				value[j].section_id===datalist_value.section_id &&
				value[j].section_tipo===datalist_value.section_tipo
				) {
					input.checked = 'checked'
			}
		}

	// label
		// const label_string = (SHOW_DEBUG===true)
		// 	? label + ' [' + section_id + ']'
		// 	: label
		const input_label = ui.create_dom_element({
			element_type	: 'label',
			inner_html		: label,
			parent			: li
		})
		input_label.setAttribute("for", input_id)

	// developer_info
		const developer_info = ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'developer_info show_on_active',
			text_content	: `[${section_id}]`,
			parent			: li
		})


	// button_edit
		const button_edit = ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'button edit show_on_active',
			parent			: li
		})
		button_edit.addEventListener("click", function(e){
			e.stopPropagation()
			try {
				// target_section
					const sqo = self.context.request_config.find(el => el.api_engine==='dedalo').sqo //.sqo.section_tipo
					const target_section_tipo = sqo.section_tipo[0].tipo
					console.log("+++ sqo:",sqo);
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
								section_id		: section_id
							}]
						}
					}
				event_manager.publish('user_navigation', user_navigation_options)
			} catch (error) {
				console.error(error)
			}
		})


	return li
};//end get_input_element_edit


