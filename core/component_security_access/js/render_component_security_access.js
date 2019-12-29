/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'
	import {data_manager} from '../../common/js/data_manager.js'




/**
* Render_component
* Manages the component's logic and apperance in client side
*/
export const render_component_security_access = function() {

	return true
}//end render_component_security_access



/**
* LIST
* Render node for use in list
* @return DOM node
*/
render_component_security_access.prototype.list = async function() {

	const self = this

	// Options vars
		const context 	= self.context
		const data 		= self.data

	// wrapper
		const wrapper = ui.component.build_wrapper_list(self, {
			autoload : false
		})

	// Value as string
		const value_string = data.value.join(self.divisor)

	// Set value
		wrapper.textContent = value_string


	return wrapper
}//end list



/**
* EDIT
* Render node for use in modes: edit, edit_in_list
* @return DOM node wrapper
*/
render_component_security_access.prototype.edit = async function(options={render_level:'full'}) {

	const self = this

	// fix non value scenarios
		self.data.value = (self.data.value.length<1) ? [null] : self.data.value

	const render_level 	= options.render_level

	// content_data
		const current_content_data = await content_data_edit(self)
		if (render_level==='content') {
			return current_content_data
		}

	// wrapper. ui build_edit returns component wrapper
		const wrapper = ui.component.build_wrapper_edit(self, {
			content_data : current_content_data
		})

	// add events
		add_events(self, wrapper)


	return wrapper
}//end edit



/**
* ADD_EVENTS
*/
const add_events = function(self, wrapper) {

	// update value, subscription to the changes: if the dom input value was changed, observers dom elements will be changed own value with the observable value
		self.events_tokens.push(
			event_manager.subscribe('update_value_'+self.id, update_value)
		)
		function update_value (changed_data) {
			//console.log("-------------- - event update_value changed_data:", changed_data);
			// change the value of the current dom element
			const changed_node = wrapper.querySelector('input[data-key="'+changed_data.key+'"]')
			changed_node.value = changed_data.value
		}

	// click event [mousedown]
		// wrapper.addEventListener("mousedown", e => {
		// 	e.stopPropagation()

		// 	// change_mode
		// 		if (e.target.matches('.button.close')) {

		// 			//change mode
		// 			self.change_mode('list', false)

		// 			return true
		// 		}

		// })
	return true
}//end add_events



/**
* SEARCH
* Render node for use in edit
* @return DOM node wrapper
*/
render_component_security_access.prototype.search = async function() {

	const self 	= this

	const content_data = await content_data_edit(self)

	// ui build_edit returns component wrapper
		const wrapper = ui.component.build_wrapper_edit(self, {
			content_data : content_data
		})

	// id
		wrapper.id = self.id

	// Events

		// change event, for every change the value in the imputs of the component
			wrapper.addEventListener('change', (e) => {
				e.stopPropagation()

				// input_value. The standard input for the value of the component
				if (e.target.matches('input[type="text"].input_value')) {
					//get the input node that has changed
					const input = e.target
					//the dataset.key has the index of correspondence self.data.value index
					const i 	= input.dataset.key
					// set the selected node for change the css
					self.selected_node = wrapper
					// set the changed_data for replace it in the instance data
					// update_data_value. key is the posistion in the data array, the value is the new value
					const value = (input.value.length>0) ? input.value : null
					// set the changed_data for update the component data and send it to the server for change when save
					const changed_data = {
						action	: 'update',
						key	  	: i,
						value 	: value
					}
					// update the data in the instance previous to save
					self.update_data_value(changed_data)
					// set the change_data to the instance
					self.data.changed_data = changed_data
					// event to update the dom elements of the instance
					event_manager.publish('change_search_element', self)
					return true
				}

				// q_operator. get the input value of the q_operator
				// q_operator: is a separate operator used with components that is impossible mark the operator in the input_value,
				// like; radio_button, check_box, date, autocomplete, etc
				if (e.target.matches('input[type="text"].q_operator')) {
					//get the input node that has changed
					const input = e.target
					// set the changed_data for replace it in the instance data
					// update_data_value. key is the posistion in the data array, the value is the new value
					const value = (input.value.length>0) ? input.value : null
					// update the data in the instance previous to save
					self.data.q_operator = value
					// event to update the dom elements of the instance
					event_manager.publish('change_search_element', self)
					return true
				}
			}, false)



	return wrapper
}//end search



/**
* CONTENT_DATA_EDIT
* @return DOM node content_data
*/
const content_data_edit = async function(self) {

	const value 	= self.data.value
	const datalist	= self.data.datalist
	const mode 		= self.mode

	const fragment = new DocumentFragment()

	level_hierarchy({
						datalist 		: datalist,
						value 			: value,
						ul_container 	: fragment,
						parent_tipo		: 'dd1'
					})


	// buttons container
		const buttons_container = ui.create_dom_element({
			element_type	: 'div',
			class_name 		: 'buttons_container',
			parent 			: fragment
		})

	// // button close
	// 	if(mode==='edit_in_list' && !ui.inside_tool(self)){
	// 		const button_close = ui.create_dom_element({
	// 			element_type	: 'span',
	// 			class_name 		: 'button close',
	// 			parent 			: buttons_container
	// 		})
	// 	}

	// // button add input
	// 	if((mode==='edit' || mode==='edit_in_list') && !ui.inside_tool(self)){
	// 		const button_add_input = ui.create_dom_element({
	// 			element_type	: 'span',
	// 			class_name 		: 'button add',
	// 			parent 			: buttons_container
	// 		})
	// 	}

	// tools
		if (!ui.inside_tool(self)) {
			const tools = self.tools
			const tools_length = tools.length

			for (let i = 0; i < tools_length; i++) {
				if(tools[i].show_in_component){
					buttons_container.appendChild( ui.tool.build_tool_button(tools[i], self) );
				}
			}
		}

	// content_data
		const content_data = document.createElement("div")
			  content_data.classList.add("content_data", self.type, "nowrap")
		content_data.appendChild(fragment)


	return content_data
}//end content_data_edit



/**
* INPUT_ELEMENT
* @return dom element li
*/
const input_element = (i, current_value, inputs_container, self) => {

	const mode = self.mode

	// li
		const li = ui.create_dom_element({
			element_type : 'li',
			parent 		 : inputs_container
		})

	// q operator (search only)
		if(mode==='search'){
			const q_operator = self.data.q_operator
			const input_q_operator = ui.create_dom_element({
				element_type 	: 'input',
				type 		 	: 'text',
				value 		 	: q_operator,
				class_name 		: 'q_operator',
				parent 		 	: li
			})
		}

	// input field
		const input = ui.create_dom_element({
			element_type 	: 'input',
			type 		 	: 'text',
			class_name 		: 'input_value',
			dataset 	 	: { key : i },
			value 		 	: current_value,
			parent 		 	: li
		})

	// button remove
		if((mode==='edit' || 'edit_in_list') && !ui.inside_tool(self)){
			const button_remove = ui.create_dom_element({
				element_type	: 'div',
				class_name 		: 'button remove display_none',
				dataset			: { key : i },
				parent 			: li
			})
		}


	return li
}//end input_element

/**
* LEVEL HIERARCHY
* @return dom element li
*/
const level_hierarchy = async (options) => {

	const datalist 		= options.datalist
	const value 		= options.value
	const ul_container 	= options.ul_container
	const parent_tipo	= options.parent_tipo


	const root_areas = datalist.filter(item => item.parent === parent_tipo)

	// inputs container
		const inputs_container = ui.create_dom_element({
			element_type	: 'ul',
			class_name 		: 'inputs_container',
			parent 			: ul_container
		})

	// values (inputs)
		const root_areas_length = root_areas.length
		for (let i = 0; i < root_areas_length; i++) {
			item_hierarchy({
							datalist 		: datalist,
							value 			: value,
							ul_container 	: inputs_container, 
							item 			: root_areas[i]
							})
		}	
}


/**
* ITEM_HIERARCHY
* @return dom element li
*/
const item_hierarchy = async (options) => {

	const datalist 		= options.datalist
	const value 		= options.value
	const ul_container 	= options.ul_container
	const item 			= options.item
	const children_item = datalist.find(children_item => children_item.parent === item.tipo)

	// get the item value
	const item_value 	= value.find(item_value => item_value.tipo === item.tipo)

	const datalist_value ={
		"tipo": item.tipo,
		"type": "area",
		"value": 2,
		"parent": item.tipo,
	}

	// li
		const li = ui.create_dom_element({
			element_type : 'li',
			parent 		 : ul_container
		})

	// input field
		const input = ui.create_dom_element({
			element_type 	: 'input',
			type 		 	: 'checkbox',
			class_name 		: 'input_value',
			dataset 	 	: { key : item.tipo },
			//value 		 	: datalist_value,
			parent 		 	: li
		})

		// checked option set on match
		if (typeof item_value !=='undefined') {
			item_value.value== 2 ? input.indeterminate = true :	input.checked = true
		}
		
		input.addEventListener("change", e => {
			e.stopPropagation()
			parents_node(li, input.checked)
		})


	// label
		const label = ui.create_dom_element({
			element_type	: 'label',
			class_name		: 'area_label',
			inner_html 		: item.label,
			parent 			: li
		})

		if (children_item) {
			const button_add_input = ui.create_dom_element({
				element_type	: 'span',
				class_name 		: 'button add',
				parent 			: li
			})

			button_add_input.addEventListener("mousedown", e => {
				e.stopPropagation()
				
				if(button_add_input.classList.contains('open')){

					button_add_input.classList.remove ('open')
					li.removeChild(li.querySelector('ul'))

				}else{
					button_add_input.classList.add ('open')
					level_hierarchy({
									datalist 		: datalist,
									value 			: value,
									ul_container	: li,
									parent_tipo		: item.tipo
								})
				}
			})

		}

		if(item.model ==='section'){

			const button_section = ui.create_dom_element({
				element_type	: 'span',
				class_name 		: 'button close',
				parent 			: li
			})

			button_section.addEventListener("mouseup", async (e) => {
				e.stopPropagation()
				// data_manager
					const current_data_manager = new data_manager()

					const api_response = await current_data_manager.request({
						body : {
							action 		: 'ontology_get_childrens_recursive',
							target_tipo : item.tipo							
						}
					})


				// render the new items
					const new_datalist = datalist.concat(api_response.result)
					level_hierarchy({
									datalist 		: new_datalist,
									value 			: value,
									ul_container	: li,
									parent_tipo		: item.tipo
								})
			})
		}

}//end item_hierarchy

const parents_node = async(child_node, checked) => {

	if(checked === false){
		return
	}

	const parent_node = child_node.parentNode.parentNode

	if(parent_node.classList.contains('content_data')){
		return true
	}else{
		const input_node = parent_node.querySelector('.input_value')
		if(input_node)
		input_node.checked = checked

		parents_node(parent_node, checked)
	}


}


