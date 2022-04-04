/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'



/**
* RENDER_EDIT_COMPONENT_FILTER
* Manage the components logic and appearance in client side
*/
export const render_edit_component_filter = function() {

	return true
};//end render_edit_component_filter



/**
* EDIT
* Render node for use in edit
* @return DOM node
*/
render_edit_component_filter.prototype.edit = async function(options={render_level:'full'}) {

	const self = this

	// render_level
		const render_level 	= options.render_level

	// content_data
		const content_data = get_content_data(self)
		if (render_level==='content') {
			return content_data
		}

	// buttons
		const buttons = get_buttons(self)

	// ui build_edit returns component wrapper
		const wrapper = ui.component.build_wrapper_edit(self, {
			content_data	: content_data,
			buttons			: buttons
		})

	// events (delegated)
		add_events(self, wrapper)


	return wrapper
};//end edit



/**
* ADD_EVENTS
*/
const add_events = function(self, wrapper) {

	// update value, subscription to the changes: if the dom input value was changed, observers dom elements will be changed own value with the observable value
		self.events_tokens.push(
			event_manager.subscribe('update_value_'+self.id, update_value)
		)
		function update_value (component) {
			// change the value of the current dom element
			const changed_data = component.data.changed_data
			const changed_node = wrapper.querySelector('input[data-key="'+component.selected_key+'"]')
			changed_node.checked = (changed_data.value === null) ? false : true
		}

	// add button element, subscription to the events
		self.events_tokens.push(
			event_manager.subscribe('edit_element_'+self.id, edit_element)
		)
		function edit_element(component) {
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
			const new_content_data = await get_content_data(instance)
			// replace the content_data with the refresh dom elements (imputs, delete buttons, etc)
			wrapper.childNodes[1].replaceWith(new_content_data)
		}

	// change event, for every change the value in the imputs of the component
		wrapper.addEventListener('change', (e) => {
			// e.stopPropagation()

			// update / remove
				if (e.target.matches('input[type="checkbox"]')) {

					const action 		= (e.target.checked===true) ? 'insert' : 'remove'
					const parsed_value 	= JSON.parse(e.target.value)
					const changed_key 	= self.get_changed_key(action, parsed_value)
					const changed_value = (action==='insert') ? parsed_value : null

					const changed_data = Object.freeze({
						action  : action,
						key 	: changed_key,
						value 	: changed_value
					})
					self.change_value({
						changed_data	: changed_data,
						//label			: e.target.nextElementSibling.textContent,
						refresh			: false,
						remove_dialog	: false
					})
					.then((api_response)=>{
						self.selected_key = e.target.dataset.key
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
						label  		 : 'All',
						refresh 	 : true
					})
					.then((api_response)=>{
						// rebuild and save the component
						// event_manager.publish('reset_element_'+self.id, self)
						// event_manager.publish('save_component_'+self.id, self)
					})

					return true
				}

			// edit target section
				if (e.target.matches('.button.edit')) {

					// rebuild_nodes. event to render the component again
					event_manager.publish('edit_element_'+self.id, self)

					return true
				}

			// change_mode
				if (e.target.matches('.button.close')) {
					//change mode
					self.change_mode('list', true)

					return true
				}
		})

	// dblclick event
		//wrapper.addEventListener("dblclick", function(e){
		//	e.stopPropagation()
		//
		//	if (self.mode==='edit_in_list') {
		//		// change mode (from 'edit_in_list' to 'list')
		//		self.change_mode('list', true)
		//	}
		//})

	// focus event
		wrapper.addEventListener("focus", e => {
			// e.stopPropagation()

			// selected_node. fix selected node
			self.selected_node = wrapper

			if (e.target.matches('input[type="checkbox"]')) {
			 	event_manager.publish('active_component', self)

			 	return true
			}
		},true)

	return true
};//end add_events



/**
* GET_CONTENT_DATA
* @return DOM node content_data
*/
const get_content_data = function(self) {

	// short vars
		const data				= self.data || {}
		const datalist			= data.datalist || []
		const datalist_length	= datalist.length

	const fragment = new DocumentFragment()

	// inputs
		const inputs_container = ui.create_dom_element({
			element_type	: 'ul',
			class_name 		: 'inputs_container',
			parent 			: fragment
		})

		// render all items sequentially
			const tree_object = {}
			for (let i = 0; i < datalist_length; i++) {

				const datalist_item = datalist[i];

				const tree_node = (datalist_item.type==='typology')
					? get_grouper_element(i, datalist_item, self) // grouper
					: get_input_element(i, datalist_item, self) // input checkbox

				tree_node.item = datalist_item

				// store in the tree_object
				const key = datalist_item.section_tipo +'_'+ datalist_item.section_id
				tree_object[key] = tree_node
			}

		// hierarchize nodes
			const tree_fragment = new DocumentFragment()
			for(const key in tree_object) {

				const tree_node	= tree_object[key]

				if (!tree_node.item.parent) {
					// add to root level
					tree_fragment.appendChild(tree_node)
				}else{
					// add to parent typology branch
					const parent_key = tree_node.item.parent.section_tipo + '_' + tree_node.item.parent.section_id
					if(tree_object[parent_key]) {
						// add to parent branch
						tree_object[parent_key].branch.appendChild(tree_node)
						// console.log("Added to parent branch:", key, parent_key);
					}else{
						// add to root level
						tree_fragment.appendChild(tree_node)
					}
				}
			}
			inputs_container.appendChild(tree_fragment)

	// content_data
		const content_data = ui.component.build_content_data(self)
			  content_data.classList.add("nowrap")
			  content_data.appendChild(fragment)


	return content_data
};//end get_content_data



/**
* GET_BUTTONS
* @param object instance
* @return DOM node buttons_container
*/
const get_buttons = (self) => {

	const is_inside_tool= self.is_inside_tool
	const mode 			= self.mode

	const fragment = new DocumentFragment()

	// button edit (go to target section)
		if((mode==='edit' || mode==='edit_in_list') && !is_inside_tool) {

			const target_sections			= self.context.target_sections
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

	// button reset
		ui.create_dom_element({
			element_type	: 'span',
			class_name 		: 'button reset',
			parent 			: fragment
		})

	// buttons tools
		if (!is_inside_tool) {
			ui.add_tools(self, fragment)
		}

	// buttons container
		const buttons_container = ui.component.build_buttons_container(self)
		buttons_container.appendChild(fragment)


	return buttons_container
};//end get_buttons



/**
* GET_GROUPER_ELEMENT
*	Typology element
* @return DOM node li
*/
const get_grouper_element = (i, datalist_item, self) => {

	const key = datalist_item.section_tipo +'_'+ datalist_item.section_id

	// grouper
		const grouper = ui.create_dom_element({
			element_type	: 'li',
			class_name		: 'grouper'
			// data_set		: {
			// 	id		: key,
			// 	parent	: datalist_item.parent ? (datalist_item.parent.section_tipo +'_'+ datalist_item.parent.section_id) : ''
			// }
		})

	// grouper_label
		const grouper_label = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'grouper_label icon_arrow',
			inner_html		: datalist_item.label,
			parent			: grouper
		})

	// branch
		const branch = ui.create_dom_element({
			element_type	: 'ul',
			class_name		: 'branch',
			parent			: grouper
		})
		grouper.branch = branch

	// collapse_toggle_track
		ui.collapse_toggle_track({
			header				: grouper_label,
			content_data		: branch,
			collapsed_id		: 'collapsed_component_filter_group_' + key,
			collapse_callback	: collapse,
			expose_callback		: expose
		})
		function collapse() {
			grouper_label.classList.remove('up')
		}
		function expose() {
			grouper_label.classList.add('up')
		}


	return grouper
};//end get_grouper_element



/**
* GET_INPUT_ELEMENT
* @return DOM node li
*/
const get_input_element = (i, current_value, self) => {

	const value  		 = self.data.value || []
	const value_length   = value.length
	const datalist_item  = current_value
	const datalist_value = datalist_item.value
	const label 		 = datalist_item.label
	const section_id	 = datalist_item.section_id

	// create li
		const li = ui.create_dom_element({
			element_type	: 'li',
			data_set		: {
				id		: datalist_item.section_tipo +'_'+ datalist_item.section_id,
				parent	: datalist_item.parent ? (datalist_item.parent.section_tipo +'_'+ datalist_item.parent.section_id) : ''
			}
		})

	// input checkbox
		const option = ui.create_dom_element({
			element_type	: 'input',
			type			: 'checkbox',
			id				: self.id +"_"+ i,
			dataset			: { key : i },
			value			: JSON.stringify(datalist_value),
			parent			: li
		})
		// checked option set on match
		for (let j = 0; j < value_length; j++) {
			if (value[j] && datalist_value &&
				value[j].section_id===datalist_value.section_id &&
				value[j].section_tipo===datalist_value.section_tipo
				) {
					option.checked = 'checked'
			}
		}

	// label
		const label_string = (SHOW_DEBUG===true) ? label + " [" + section_id + "]" : label
		const option_label = ui.create_dom_element({
			element_type	: 'label',
			inner_html		: label_string,
			parent			: li
		})
		option_label.setAttribute("for", self.id +"_"+ i)


	return li
};//end get_input_element


