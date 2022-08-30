/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'
	import {object_to_url_vars} from '../../common/js/utils/index.js'



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

	// options
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


	return wrapper
}//end edit



/**
* GET_CONTENT_DATA
* @return DOM node content_data
*/
const get_content_data = function(self) {

	// short vars
		const data		= self.data || {}
		const value		= data.value || []

	// content_data
		const content_data = ui.component.build_content_data(self)

	// values (inputs)
		const inputs_value	= value.length>0 ? value : [null]
		const value_length	= inputs_value.length
		for (let i = 0; i < value_length; i++) {
			const content_value = get_content_value(i, inputs_value[i], self)
			content_data.appendChild(content_value)
			// set pointers
			content_data[i] = content_value
		}


	return content_data
}//end get_content_data



/**
* GET_CONTENT_VALUE
* @param int i
* 	Value key like 0
* @param object|null current_value
* 	Current locator value as {section_id: '2', section_tipo: 'rsc740'}
* @param object self
* 	Component instance pointer
* @return DOM node content_value
*/
const get_content_value = (i, current_value, self) => {

	// short vars
		const data		= self.data || {}
		const datalist	= data.datalist || []
		// add empty option at beginning of the datalist array
		const empty_option = {
			label	: '',
			value	: null
		}
		datalist.unshift(empty_option);

	// content_value
		const content_value = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'content_value'
		})

	// select
		const select = ui.create_dom_element({
			element_type	: 'select',
			class_name		: 'select',
			parent			: content_value
		})
		// focus event
			select.addEventListener('focus', function(){
				// force activate on input focus (tabulating case)
				if (!self.active) {
					event_manager.publish('activate_component', self)
				}
			})
		// change event
			select.addEventListener('change', function(){
				const value = this.value
					? JSON.parse(this.value)
					: null
				if (value) {
					button_edit.classList.remove('hide')
				}else{
					button_edit.classList.add('hide')
				}

				const parsed_value = (select.value.length>0) ? JSON.parse(select.value) : null

				const changed_data = [Object.freeze({
					action	: (parsed_value != null) ? 'update' : 'remove',
					key		: (parsed_value != null) ? i : false,
					value	: parsed_value
				})]
				// fix instance changed_data
					self.data.changed_data = changed_data
				// force to save on every change
					self.change_value({
						changed_data	: changed_data,
						refresh			: false,
						remove_dialog	: false
					})
			})

	// select options
		const datalist_length = datalist.length
		for (let i = 0; i < datalist_length; i++) {

			const datalist_item = datalist[i]

			const current_section_id = typeof datalist_item.section_id!=='undefined'
				? datalist_item.section_id
				: null

			const current_label = (SHOW_DEBUG===true)
				? datalist_item.label + (current_section_id ? " [" + current_section_id + "]" : '')
				: datalist_item.label

			const option_node = ui.create_dom_element({
				element_type	: 'option',
				value			: JSON.stringify(datalist_item.value),
				inner_html		: current_label,
				parent			: select
			})
			// selected options set on match
			if (current_value && datalist_item.value &&
				current_value.section_id===datalist_item.value.section_id &&
				current_value.section_tipo===datalist_item.value.section_tipo
				) {
				option_node.selected = true
			}

			// developer_info
				// if (current_section_id) {
				// 	// developer_info
				// 	ui.create_dom_element({
				// 		element_type	: 'span',
				// 		class_name		: 'developer_info hide show_on_active',
				// 		text_content	: ` [${current_section_id}]`,
				// 		parent			: option_node
				// 	})
				// }
		}//end for (let i = 0; i < datalist_length; i++)

	// button_edit
		const button_edit = ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'button edit show_on_active',
			parent			: content_value
		})
		button_edit.addEventListener('click', function(e) {
			e.stopPropagation()

			try {

				if (!select.value) {
					return false
				}

				// short vars
					const selected_locator		= JSON.parse(select.value)
					const target_section_tipo	= selected_locator.section_tipo
					const target_section_id		= selected_locator.section_id

				// open a new window
					const url_vars = {
						tipo			: target_section_tipo,
						section_tipo	: target_section_tipo,
						id				: target_section_id,
						mode			: 'edit',
						menu			: false
					}
					const url				= DEDALO_CORE_URL + '/page/?' + object_to_url_vars(url_vars)
					const current_window	= window.open(url, '', 'width=1030,height=500')
					current_window.focus()

				// navigation
					// const user_navigation_options = {
					// 	source		: {
					// 		action			: 'search',
					// 		model			: 'section',
					// 		tipo			: target_section_tipo,
					// 		section_tipo	: target_section_tipo,
					// 		mode			: 'edit',
					// 		lang			: self.lang
					// 	},
					// 	sqo : {
					// 		section_tipo		: [{tipo : target_section_tipo}],
					// 		filter				: null,
					// 		limit				: 1,
					// 		filter_by_locators	: [{
					// 			section_tipo	: target_section_tipo,
					// 			section_id		: target_section_id
					// 		}]
					// 	}
					// }
					// event_manager.publish('user_navigation', user_navigation_options)
			} catch (error) {
				console.error('ERROR on component_select.get_content_value.button_edit:'. error)
			}
		})
		// console.log("current_value:", self.tipo, current_value);
		if (!current_value) {
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
