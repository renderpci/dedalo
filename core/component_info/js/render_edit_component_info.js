/* global get_label, page_globals, SHOW_DEBUG, flatpickr */
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'
	import {view_default_edit_info} from './view_default_edit_info.js'
	import {view_line_edit_info} from './view_line_edit_info.js'
	import {view_mini_info} from './view_mini_info.js'



/**
* RENDER_EDIT_COMPONENT_info
* Manage the components logic and appearance in client side
*/
export const render_edit_component_info = function() {

	return true
}//end render_edit_component_info



/**
* EDIT
* Render node for use in edit
* @param object options
* @return HTMLElement wrapper
*/
render_edit_component_info.prototype.edit = async function(options) {

	const self = this

	// view
		const view = self.context.view || 'default'

	switch(view) {

		case 'mini':
			return view_mini_info.render(self, options)

		case 'line':
			return view_line_edit_info.render(self, options)

		case 'print':
			// view print use the same view as default, except it will use read only to render content_value
			// as different view as default it will set in the class of the wrapper
			// sample: <div class="wrapper_component component_input_text oh14 oh1_oh14 edit view_print disabled_component">...</div>
			// take account that to change the css when the component will render in print context
			// for print we need to use read of the content_value and it's necessary force permissions to use read only element render
			self.permissions = 1

		case 'default':
		default:
			return view_default_edit_info.render(self, options)
	}
}//end edit



/**
* GET_CONTENT_DATA
* @param object self
* @return HTMLElement content_data
*/
export const get_content_data = function(self) {

	// content_data
		const content_data = ui.component.build_content_data(self)

	// values (inputs)
		const widgets			= self.ar_instances
		const widgets_length	= widgets.length
		for (let i = 0; i < widgets_length; i++) {
			const content_value = get_content_value(i, widgets[i], self)
			content_data.appendChild(content_value)
			// set pointers
			content_data[i] = content_value
		}


	return content_data
}//end get_content_data



/**
* GET_CONTENT_VALUE
* @param int i
* @param object current_widget
* @param object self
* @return HTMLElement content_value
*/
export const get_content_value = (i, current_widget, self) => {

	const add_classes = self.view==='print'
		? ' read_only'
		: ''

	// content_value
		const content_value = ui.create_dom_element({
			element_type	: 'div',
			class_name		: `content_value widget_item_${current_widget.name}` + add_classes
		})

	// widget
		current_widget.build()
		.then(function(){
			current_widget.render()
			.then(function(widget_node){
				content_value.appendChild(widget_node)
			})
		})


	return content_value
}//end get_content_value
