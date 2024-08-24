// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_API_URL */
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../../../common/js/ui.js'
	import {render_hierarchies_import_block} from '../../../../install/js/render_install.js'



/**
* RENDER_ADD_HIERARCHY
* Manages the component's logic and appearance in client side
*/
export const render_add_hierarchy = function() {

	return true
}//end render_add_hierarchy



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
render_add_hierarchy.prototype.list = async function(options) {

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
		const value = self.value || {}

	// content_data
		const content_data = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'content_data'
		})

	// info
		const text = `Hierarchy files from install dir`
		const info = ui.create_dom_element({
			element_type	: 'div',
			inner_html		: text,
			class_name		: 'info_text',
			parent			: content_data
		})

	// short vars
		const hierarchies				= value.hierarchies
		const hierarchy_files_dir_path	= value.hierarchy_files_dir_path
		const hierarchy_typologies		= value.hierarchy_typologies
		const active_hierarchies		= []
		const active_hierarchies_length	= value.active_hierarchies.length
		for (let i = 0; i < active_hierarchies_length; i++) {
			const item = value.active_hierarchies[i]
			if (item.tld) {
				active_hierarchies.push( item.tld.toLowerCase() )
			}else{
				console.error('Ignored empty tld item from active_hierarchies:', item);
			}
		}

	// callback. If exec on success
		function fn_callback(api_response) {
			// add button refresh
			const button_refresh = ui.create_dom_element({
				element_type	: 'button',
				class_name		: 'light button_refresh',
				inner_html		: get_label.reload || 'Reload',
				parent			: body_response
			})
			button_refresh.addEventListener('click', function(e) {
				e.stopPropagation()

				self.refresh({
					build_autoload	: false,
					render_level	: 'content',
					destroy			: true
				})
			})
		}

	// hierarchies_import_node
		const hierarchies_import_options = {
			hierarchies					: hierarchies,
			active_hierarchies			: active_hierarchies,
			hierarchy_files_dir_path	: hierarchy_files_dir_path,
			hierarchy_typologies 		: hierarchy_typologies,
			default_checked				: [],
			callback					: fn_callback
		}
		const hierarchies_import_node = render_hierarchies_import_block(hierarchies_import_options)
		content_data.appendChild(hierarchies_import_node)

	// body_response
		const body_response = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'body_response'
		})
		// add at end body_response
		content_data.appendChild(body_response)


	return content_data
}//end get_content_data_edit



// @license-end
