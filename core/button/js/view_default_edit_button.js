// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global */
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'



/**
* VIEW_DEFAULT_EDIT_button
* Manages the component's logic and appearance in client side
*/
export const view_default_edit_button = function() {

	return true
}//end view_default_edit_button



/**
* EDIT
* Render node for use in modes: edit, edit_in_list
* @return HTMLElement wrapper
*/
view_default_edit_button.render = async function(self, options) {

	// options
		const render_level = options.render_level || 'full'

	// content_data
		const content_data = get_content_data(self)
		if (render_level==='content') {
			return content_data
		}

	// buttons
		// const buttons = (self.permissions > 1)
		// 	? get_buttons(self)
		// 	: null

	// wrapper. ui build_edit returns component wrapper
		const wrapper = ui.create_dom_element({
			element_type : 'div',
			class_name : `wrapper_component ${'wrapper_'+self.type} _${self.model} ${self.tipo} ${self.section_tipo+'_'+self.tipo} ${self.mode} ${self.view}`
		})

	// css new way v6
		if (self.context.css) {
			const selector = `${self.section_tipo}_${self.tipo}.${self.mode}`
			set_element_css(selector, self.context.css)
		}

	// label
		const component_label = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'label',
			inner_html		: self.label
		})
		wrapper.appendChild(component_label)

	// content_data
		wrapper.appendChild(content_data)


	return wrapper
}//end render



/**
* GET_CONTENT_DATA
* @param object self
* @return HTMLElement content_data
*/
const get_content_data = function(self) {

	// short vars
		const data	= self.data || {}
		const value	= data.value || []

	// content_data
		const content_data = document.createElement('div')
			  content_data.classList.add('content_data', '_'+self.type)

		const current_value = self.label

	// values (inputs)
		const content_value = ui.create_dom_element({
			element_type	: 'button',
			class_name		: 'light data_link',
			inner_html		: current_value,
			parent			: content_data
		})


	return content_data
}//end get_content_data



/**
* GET_BUTTONS
* @param object instance
* @return HTMLElement buttons_container
*/
const get_buttons = (self) => {

	const fragment = new DocumentFragment()

	// button add input
		const button_add = ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'button add',
			title			: get_label.new || 'Add new input field',
			parent			: fragment
		})
		button_add.addEventListener('click', function(e) {
			e.stopPropagation()

			const key = self.data.value.length

			const changed_data = [Object.freeze({
				action	: 'insert',
				key		: key,
				value	: null
			})]
			self.change_value({
				changed_data	: changed_data,
				refresh			: true
			})
			.then(()=>{
				// console.log("self.node.content_data:",self.node.content_data[changed_data.key]);
				const input_node = self.node.content_data[key]
					? self.node.content_data[key].querySelector('input')
					: null
				if (input_node) {
					input_node.focus()
				}else{
					console.warn('Empty input_node:', self.node.content_data, key);
				}
			})
		})//end event click


	// buttons tools
		if(self.show_interface.tools === true){
			ui.add_tools(self, fragment)
		}//end add tools

	// buttons container
		const buttons_container = ui.component.build_buttons_container(self)

	// buttons_fold (allow sticky position on large components)
		const buttons_fold = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'buttons_fold',
			parent			: buttons_container
		})
		buttons_fold.appendChild(fragment)


	return buttons_container
}//end get_buttons


// @license-end
