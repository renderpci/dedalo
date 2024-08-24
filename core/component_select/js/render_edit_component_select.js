// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'
	import {view_default_edit_select} from './view_default_edit_select.js'
	import {view_line_edit_select} from './view_line_edit_select.js'



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
* @param object options
* @return HTMLElement wrapper
*/
render_edit_component_select.prototype.edit = async function(options) {

	const self = this

	// view
		const view = self.context.view || 'default'

	// show_interface.button_edit
		if (page_globals.is_global_admin===true) {
			// default is false
			self.show_interface.button_edit = true
		}

	switch(view) {

		case 'line':
			return view_line_edit_select.render(self, options)

		case 'print':
			// view print use the same view as default, except it will use read only to render content_value
			// as different view as default it will set in the class of the wrapper
			// sample: <div class="wrapper_component component_select oh21 oh1_oh21 edit view_default disabled_component active">...</div>
			// take account that to change the css when the component will render in print context
			// for print we need to use read of the content_value and it's necessary force permissions to use read only element render
			self.permissions = 1

		case 'default':
		default:
			return view_default_edit_select.render(self, options)
	}
}//end edit



/**
* GET_CONTENT_DATA
* @param object self
* @param object options
* @return HTMLElement content_data
*/
export const get_content_data = function(self, options) {

	// options
		const render_content_data		= options.render_content_data
		const render_content_value_read	= options.render_content_value_read

	// short vars
		const data				= self.data || {}
		const datalist			= data.datalist || []
		const datalist_length	= datalist.length
		const value				= data.value || []
		const permissions		= self.permissions

	// content_data
		const content_data = ui.component.build_content_data(self)

	// permissions switch
		if (permissions===1) {

			// filtered_datalist. Datalist values that exists into component value
				for (let i = 0; i < value.length; i++) {
					const data_value = value[i]
					const current_datalist_item	= datalist.find(el =>
						el.value &&
						el.value.section_id==data_value.section_id &&
						el.value.section_tipo===data_value.section_tipo
					)
					if(current_datalist_item){
						const current_value = current_datalist_item.label || ''
						// build options
						const content_value_node = render_content_value_read(0, current_value, self)
						content_data.appendChild(content_value_node)
						// set pointers
						content_data[i] = content_value_node
					}
				}

			// fill empty value cases with one empty content_value node
				if(!content_data[0]) {
					const current_value = '';
					const content_value_node = render_content_value_read(0, current_value, self)
					content_data.appendChild(content_value_node)
					// set pointers
					content_data[0] = content_value_node
				}

		}else{

			// build options. Only one value is expected
				const value_length = value.length || 1
				for (let i = 0; i < value_length; i++) {
					// get the content_value
					const content_value = render_content_data(i, value[i], self)
					// add node to content_data
					content_data.appendChild(content_value)
					// set pointers
					content_data[i] = content_value
				}
		}


	return content_data
}//end get_content_data



// @license-end
