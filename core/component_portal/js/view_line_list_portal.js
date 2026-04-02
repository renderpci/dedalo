// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global Promise */
/*eslint no-undef: "error"*/



// imports
	import {get_section_records} from '../../section/js/section.js'
	import {ui} from '../../common/js/ui.js'
	import {render_references, render_column_component_info} from './render_edit_component_portal.js'



/**
* VIEW_LINE_LIST_PORTAL
* Manage the component's logic and appearance in client side
*/
export const view_line_list_portal = function() {

	return true
}//end view_line_list_portal



/**
* RENDER
* Render component nodes in current view
* @param component_portal instance self
* @param object options
* @return HTMLElement wrapper
* 	DOM node wrapper
*/
view_line_list_portal.render = async function(self, options) {

	// options
		const render_level = options.render_level || 'full'

	// view
		const children_view	= self.context.children_view || self.context.view || 'default'

		// columns_map
		self.columns_map = await rebuild_columns_map(self)

	// ar_section_record
		const ar_section_record	= await get_section_records({
			caller	: self,
			view	: children_view
		})
		// store to allow destroy later
		self.ar_instances.push(...ar_section_record)

	// content_data
		const content_data = await get_content_data(self, ar_section_record)
		if (render_level==='content') {
			return content_data
		}

	// wrapper. ui build_edit returns component wrapper.
	// Note: Use 'build_wrapper_list' instead 'build_wrapper_edit' because allow user to change mode on dblclick
		const wrapper = ui.component.build_wrapper_list(self, {
			autoload : true // bool set autoload when change mode is called (close button)
		})
		wrapper.classList.add('portal', 'view_line')
		wrapper.appendChild(content_data)
		// set pointers
		wrapper.content_data = content_data

	// change_mode
		if (self.show_interface.read_only !== true && self.permissions > 1) {
			wrapper.addEventListener('dblclick', function(e) {
				e.stopPropagation()

				// self.show_interface.read_only = true
				const change_mode = self.context?.properties?.with_value
					&& self.context.properties.with_value.mode !== self.mode
						? self.context.properties.with_value.mode
						: 'edit'

				const change_view = self.context?.properties?.with_value
					&& self.context.properties.with_value.view !== self.context.view
						? self.context.properties.with_value.view
						: 'line'

				self.change_mode({
					mode	: change_mode,
					view	: change_view
				})
			})
		}


	return wrapper
}//end render



/**
* GET_CONTENT_DATA
* Render all received section records and place it into a new div 'content_data'
* @param object self - Component instance
* @param array ar_section_record - List of records
* @return HTMLElement content_data
*/
const get_content_data = async function(self, ar_section_record) {

	// content_data
	const content_data = ui.component.build_content_data(self, {
		autoload : true
	})

	const section_record_count = ar_section_record.length

	// empty cases
	if (section_record_count === 0) {
		return content_data;
	}

	// Render promises
	const render_promises = ar_section_record.map(record => record.render());

	// fragment
	const fragment = new DocumentFragment()

	// Add all section_record rendered nodes to the fragment
	const rendered_nodes = await Promise.all(render_promises);
	for (let i = 0; i < section_record_count; i++) {
		if (rendered_nodes[i]) {
			fragment.appendChild(rendered_nodes[i])
		}
	}

	// Add references if they exist.
	if(self.data.references?.length > 0){
		const references_node = render_references(self.data.references)
		if (references_node) {
			fragment.appendChild(references_node)
		}
	}

	// Append final fragment at end
	content_data.appendChild(fragment)


	return content_data
}//end get_content_data



/**
* REBUILD_COLUMNS_MAP
* Adding control columns to the columns_map that will be processed by section_records
* @param object self
* @return array columns_map
*/
const rebuild_columns_map = async function(self) {

	// columns_map already rebuilt case
		if (self.fixed_columns_map===true) {
			return self.columns_map
		}

	const columns_map = []

	// base_columns_map
	const base_columns_map = self.columns_map || []

	// if the component has compnent_info its parents
	// add its own render column, the `ddinfo`,
	// columns exists because is added into common.js get_columns_map()
	// here only added the rendered callback
		if (self.add_component_info===true) {
			base_columns_map.forEach(el => {
				if(el.id==='ddinfo'){
					el.callback	= render_column_component_info
				}
			})
		}
		columns_map.push(...base_columns_map)


	// fixed as calculated
		self.fixed_columns_map = true


	return columns_map
}//end rebuild_columns_map



// @license-end
