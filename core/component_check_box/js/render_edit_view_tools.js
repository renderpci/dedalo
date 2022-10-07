/*global get_label, page_globals, SHOW_DEBUG, DEDALO_TOOLS_URL */
/*eslint no-undef: "error"*/



// import
	import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'
	import {strip_tags} from '../../common/js/utils/index.js'
	import {get_buttons} from './render_edit_component_check_box.js'


/**
* RENDER_EDIT_VIEW_tools
* Manage the components logic and appearance in client side
*/
export const render_edit_view_tools = function() {

	return true
}//end render_edit_view_tools



/**
* RENDER
* Render node for use in edit
* @return DOM node
*/
render_edit_view_tools.render = async function(self, options) {

	// render_level
		const render_level = options.render_level || 'full'

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
		wrapper.classList.add('view_'+self.context.view)
		// set pointers
		wrapper.content_data = content_data


	return wrapper
}//end render



/**
* GET_CONTENT_DATA
* Render content_data node with all included contents
* @param instance object self
* @return DOM node content_data
*/
const get_content_data = function(self) {

	// short vars
		const datalist = self.data.datalist || []

	// content_data
		const content_data = ui.component.build_content_data(self, {
			autoload : true
		})
		content_data.classList.add('nowrap')

	// build options
		const datalist_length = datalist.length
		for (let i = 0; i < datalist_length; i++) {
			const input_element_node = get_input_element(i, datalist[i], self)
			content_data.appendChild(input_element_node)
			// set the pointer
			content_data[i] = input_element_node
		}


	return content_data
}//end get_content_data



/**
* GET_INPUT_ELEMENT
* @return DOM node content_value
*/
const get_input_element = (i, current_value, self) => {

	// short vars
		const data				= self.data || {}
		const value				= data.value || []
		const value_length		= value.length
		const datalist_item		= current_value
		const datalist_value	= datalist_item.value
		const label				= datalist_item.label // string e.g. 'Tool posterframe | <mark>tool_posterframe</mark>'
		const section_id		= datalist_item.section_id

	// create content_value
		const content_value = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'content_value'
		})

	// label
		const label_parts		= label.split(' | ')
		const tool_label		= label_parts[0]
		const tool_name			= strip_tags(label_parts[1])
		// const label_string	= (SHOW_DEBUG===true) ? tool_label + ` [${tool_name} - ${section_id}]` : tool_label
		const option_label	= ui.create_dom_element({
			element_type	: 'label',
			inner_html		: tool_label,
			parent			: content_value
		})

	// input checkbox
		const input_checkbox = ui.create_dom_element({
			element_type	: 'input',
			type			: 'checkbox'
		})
		option_label.prepend(input_checkbox)
		input_checkbox.addEventListener('focus', function() {
			// force activate on input focus (tabulating case)
			if (!self.active) {
				ui.component.activate(self)
			}
		})
		input_checkbox.addEventListener('change', function(){

			const action		= (input_checkbox.checked===true) ? 'insert' : 'remove'
			const changed_key	= self.get_changed_key(action, datalist_value) // find the data.value key (could be different of datalist key)
			const changed_value	= (action==='insert') ? datalist_value : null

			const changed_data = [Object.freeze({
				action	: action,
				key		: changed_key,
				value	: changed_value
			})]
			// fix instance changed_data
				self.data.changed_data = changed_data
			// force to save on every change
				self.change_value({
					changed_data	: changed_data,
					refresh			: false,
					remove_dialog	: ()=>{
						return true
					}
				})
				.then((api_response)=>{
					self.selected_key = i
				})
		})//end change event
		// checked input_checkbox set on match
		for (let j = 0; j < value_length; j++) {
			if (value[j] && datalist_value &&
				value[j].section_id===datalist_value.section_id &&
				value[j].section_tipo===datalist_value.section_tipo
				) {
					input_checkbox.checked = 'checked'
			}
		}

	// developer_info
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'developer_info show_on_active',
			text_content	: `[${tool_name} - ${section_id}]`,
			parent			: content_value
		})

	// tool_icon
		const icon_url	= DEDALO_TOOLS_URL + '/' + tool_name + '/img/icon.svg'
		const tool_icon	= ui.create_dom_element({
			element_type	: 'img',
			class_name		: 'tool_icon',
			src				: icon_url
		})
		content_value.prepend(tool_icon)


	return content_value
}//end get_input_element
