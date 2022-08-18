/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// import
	import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'
	import {get_buttons} from './render_edit_component_check_box.js'



/**
* RENDER_EDIT_VIEW_DEFAULT
* Manage the components logic and appearance in client side
*/
export const render_edit_view_default = function() {

	return true
}//end render_edit_view_default



/**
* RENDER
* Render node for use in edit
* @return DOM node
*/
render_edit_view_default.render = async function(self, options) {

	// render_level
		const render_level = options.render_level || 'full'

	// content_data
		const content_data = get_content_data_edit(self)
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

	return wrapper
}//end render



/**
* GET_CONTENT_DATA_EDIT
* @param instance self
* @return DOM node content_data
*/
export const get_content_data_edit = function(self) {

	// short vars
		const datalist = self.data.datalist || []

	const fragment = new DocumentFragment()

	// inputs
		const inputs_container = ui.create_dom_element({
			element_type	: 'ul',
			class_name		: 'inputs_container',
			parent			: fragment
		})

		// build options
		const datalist_length = datalist.length
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

		content_data.classList.add("nowrap")
		content_data.appendChild(fragment)


	return content_data
}//end get_content_data_edit



/**
* GET_INPUT_ELEMENT_EDIT
* @return DOM node li
*/
const get_input_element_edit = (i, current_value, self) => {

	const value				= self.data.value || []
	const value_length		= value.length
	const datalist_item		= current_value
	const datalist_value	= datalist_item.value
	const label				= datalist_item.label
	const section_id		= datalist_item.section_id

	// create li
		const li = ui.create_dom_element({
			element_type	: 'li'
		})

	// input checkbox
		const option = ui.create_dom_element({
			element_type	: 'input',
			type 			: 'checkbox',
			id 				: self.id +"_"+ i,
			parent 			: li
		})
		option.addEventListener('change', function(){
			const action 		= (option.checked===true) ? 'insert' : 'remove'
			const changed_key 	= self.get_changed_key(action, datalist_value) // find the data.value key (could be different of datalist key)
			const changed_value = (action==='insert') ? datalist_value : null

			const changed_data = Object.freeze({
				action  : action,
				key 	: changed_key,
				value 	: changed_value
			})
			self.change_value({
				changed_data	: changed_data,
				refresh			: false,
				remove_dialog	: ()=>{
					return true
				}
			})
			.then((api_response)=>{
				self.selected_key = i
				// event to update the dom elements of the instance
				event_manager.publish('update_value_'+self.id, self)
			})
		})//end change event

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
		// const label_string = (SHOW_DEBUG===true) ? label + " [" + section_id + "]" : label
		const option_label = ui.create_dom_element({
			element_type	: 'label',
			inner_html		: label,
			parent			: li
		})
		option_label.setAttribute("for", self.id +"_"+ i)

	// developer_info
		const developer_info = ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'developer_info show_on_active',
			text_content	: `[${section_id}]`,
			parent			: li
		})

	// button_edit
		// const button_edit = ui.create_dom_element({
		// 	element_type	: 'span',
		// 	class_name		: 'button edit show_on_active',
		// 	parent			: li
		// })
		// button_edit.addEventListener("click", function(e){
		// 	e.stopPropagation()
		// 	try {
		// 		// target_section
		// 			const sqo = self.context.request_config.find(el => el.api_engine==='dedalo').sqo //.sqo.section_tipo
		// 			const target_section_tipo = sqo.section_tipo[0].tipo
		// 			console.log("+++ sqo:",sqo);
		// 		// navigation
		// 			const user_navigation_options = {
		// 				source		: {
		// 					action			: 'search',
		// 					model			: 'section',
		// 					tipo			: target_section_tipo,
		// 					section_tipo	: target_section_tipo,
		// 					mode			: 'edit',
		// 					lang			: self.lang
		// 				},
		// 				sqo : {
		// 					section_tipo		: [{tipo : target_section_tipo}],
		// 					filter				: null,
		// 					limit				: 1,
		// 					filter_by_locators	: [{
		// 						section_tipo	: target_section_tipo,
		// 						section_id		: section_id
		// 					}]
		// 				}
		// 			}
		// 		event_manager.publish('user_navigation', user_navigation_options)
		// 	} catch (error) {
		// 		console.error(error)
		// 	}
		// })



	return li
}//end get_input_element_edit


