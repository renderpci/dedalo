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
		const errors			= info.errors
		const result			= info.result || []

	// content_data
		const content_data = ui.create_dom_element({
			element_type : 'div'
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

	// tables
		const tables = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'tables',
			parent			: content_data
		})


	// missing_container
		const missing_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'table missing_container',
			parent			: tables
		})
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'label',
			inner_html		: 'Missing constants',
			parent			: missing_container
		})

	// obsolete_container
		const obsolete_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'table obsolete_container',
			parent			: tables
		})
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'label',
			inner_html		: 'Obsolete constants',
			parent			: obsolete_container
		})

	// result iterate
		const result_length = result.length
		for (let i = 0; i < result_length; i++) {
			const item = result[i]

			// missing
			{
				// file_container (grid)
				const file_container = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'file_container ' + item.file_name,
					parent			: missing_container
				})
				// sample_vs_config
				// label
				ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'label sample_vs_config',
					inner_html		: `${item.file_name}`,
					parent			: file_container
				})
				// data
				const data_text = item.sample_vs_config.length>0
					? item.sample_vs_config.join('<br>')
					: get_label.ok || 'OK'
				ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'data' + (item.sample_vs_config.length>0 ? ' missing' : ''),
					inner_html		: data_text,
					parent			: file_container
				})
			}

			// obsolete
			{
				// file_container (grid)
				const file_container = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'file_container ' + item.file_name,
					parent			: obsolete_container
				})
				// config_vs_sample
				// label
				ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'label config_vs_sample',
					inner_html		: `${item.file_name}`,
					parent			: file_container
				})
				// data
				const data_text = item.config_vs_sample.length>0
					? item.config_vs_sample.join('<br>')
					: get_label.ok || 'OK'
				ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'data' + (item.config_vs_sample.length>0 ? ' obsolete' : ''),
					inner_html		: data_text,
					parent			: file_container
				})
			}

			// list
			{
				// const_list_node
				const const_list_node = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'datalist_container show_list',
					inner_html		: '<span class="button icon eye"></span>Display all sample.'+item.file_name+' constants list',
					parent			: content_data
				})
				const_list_node.addEventListener('click', function(e) {
					e.stopPropagation();
					const_list_pre.classList.toggle('hide')
				})
				const const_list	= item.sample_config_constants_list || []
				const const_list_pre = ui.create_dom_element({
					element_type	: 'pre',
					class_name		: 'hide',
					inner_html		: JSON.stringify(const_list, null, 2),
					parent			: const_list_node
				})

			}

		}//end for (let i = 0; i < result_length; i++)


	return content_data
}//end get_content_data_edit



// @license-end
