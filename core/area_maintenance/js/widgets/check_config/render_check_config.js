// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_API_URL */
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../../../common/js/ui.js'
	// import {data_manager} from '../../../../common/js/data_manager.js'
	import {open_window, object_to_url_vars} from '../../../../common/js/utils/index.js'



/**
* RENDER_check_config
* Manages the component's logic and appearance in client side
*/
export const render_check_config = function() {

	return true
}//end render_check_config



/**
* LIST
* Creates the nodes of current widget.
* The created wrapper will be append to the widget body in area_maintenance
* @param object options
* 	Sample:
* 	{
*		render_level : "full"
		render_mode : "list"
*   }
* @return HTMLElement wrapper
* 	To append to the widget body node (area_maintenance)
*/
render_check_config.prototype.list = async function(options) {

	const self = this

	const render_level = options.render_level || 'full'

	// content_data
		const content_data = await get_content_data_edit(self)
		if (render_level==='content') {
			return content_data
		}

	// wrapper. ui build_edit returns widget wrapper
		const wrapper = ui.widget.build_wrapper_edit(self, {
			content_data : content_data
		})
		// set pointers
		wrapper.content_data = content_data


	return wrapper
}//end list



/**
* GET_CONTENT_DATA_EDIT
* @param object self
* @return HTMLElement content_data
*/
const get_content_data_edit = async function(self) {

	// short vars
		const value				= self.value || {}
		const info				= value.info || {}
		const constants_list	= info.constants_list || []
		const ar_missing		= info.ar_missing || []
		const errors			= info.errors

	// content_data
		const content_data = ui.create_dom_element({
			element_type : 'div'
		})

	// working here..
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: '',
			inner_html		: 'Check your config file to find errors.',
			parent			: content_data
		})

	// missing_total
		const missing_class = ar_missing.length > 0 ? 'warning' : 'success'
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'missing_total ' + missing_class,
			inner_html		: 'Non defined config constants total: <b>' + ar_missing.length + '</b> of ' + constants_list.length,
			parent			: content_data
		})

	// errors
		if (errors && errors.length>0) {
			const errors_container = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'errors_container',
				inner_html		: 'Some errors found',
				parent			: content_data
			})
			ui.create_dom_element({
				element_type	: 'pre',
				class_name		: 'error_pre',
				inner_html		: errors.join('\n'),
				parent			: errors_container
			})
		}

	// body_response
		const body_response = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'body_response'
		})

	// datalist
		const datalist_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'datalist_container',
			parent			: content_data
		})
		// header

		// missing_list
			const ar_missing_length = ar_missing.length
			for (let i = 0; i < ar_missing_length; i++) {

				const item = ar_missing[i]

				const datalist_item_container = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'datalist_item_container',
					parent			: datalist_container
				})

				// section_name
					ui.create_dom_element({
						element_type	: 'div',
						class_name		: 'item_column non_defined',
						inner_html		: item,
						parent			: datalist_item_container
					})
			}//end for (let i = 0; i < ar_missing_length; i++)

		// constants_list_node
			const constants_list_node = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'datalist_container show_list',
				inner_html		: 'Display all sample.config constants list',
				parent			: content_data
			})
			constants_list_node.addEventListener('click', function(e) {
				e.stopPropagation();
				constants_list_pre.classList.toggle('hide')

			})
			const constants_list_pre = ui.create_dom_element({
				element_type	: 'pre',
				class_name		: 'hide',
				inner_html		: JSON.stringify(constants_list, null, 2),
				parent			: constants_list_node
			})



	// add at end body_response
		content_data.appendChild(body_response)


	return content_data
}//end get_content_data_edit



// @license-end
