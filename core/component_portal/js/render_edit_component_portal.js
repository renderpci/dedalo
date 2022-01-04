/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	// import {event_manager} from '../../common/js/event_manager.js'
	// import {data_manager} from '../../common/js/data_manager.js'
	// import {create_source} from '../../common/js/common.js'
	// import {get_instance, delete_instance} from '../../common/js/instances.js'
	import {ui} from '../../common/js/ui.js'
	// import {service_autocomplete} from '../../services/service_autocomplete/js/service_autocomplete.js'
	import {render_edit_view_table} from './render_edit_view_table.js'
	import {render_edit_view_line} from './render_edit_view_line.js'
	import {render_edit_view_tree} from './render_edit_view_tree.js'
	import {render_edit_view_mosaic} from './render_edit_view_mosaic.js'
	// import {clone, dd_console} from '../../common/js/utils/index.js'



/**
* RENDER_EDIT_COMPONENT_PORTAL
* Manages the component's logic and apperance in client side
*/
export const render_edit_component_portal = function() {

	return true
};//end render_edit_component_portal



/**
* EDIT
* Render node for use in edit
* @return DOM node wrapper | null
*/
render_edit_component_portal.prototype.edit = async function(options) {

	const self = this

	// view
		const view	= self.context.view || 'table'

	switch(view) {

		case 'line':
			return render_edit_view_line.render(self, options)

		case 'tree':
			return render_edit_view_tree.render(self, options)

		case 'mosaic':
			return render_edit_view_mosaic.render(self, options)

		case 'table':
		default:
			return render_edit_view_table.render(self, options)
	}

	return null
}//end edit



/**
* RENDER_COLUMN_COMPONENT_INFO
* Render node for use in edit
* @param object options
* @return DOM DocumentFragment
*/
export const render_column_component_info = function(options) {

	// options
		const self 			= options.caller
		const section_id	= options.section_id
		const section_tipo	= options.section_tipo

	const fragment = new DocumentFragment()

	// component_info
		const component_info = self.datum.data.find( item => item.tipo==='ddinfo' &&
															 item.section_id===section_id &&
															 item.section_tipo===section_tipo)
		if (component_info) {

			const info_value = component_info.value.join('')

			ui.create_dom_element({
				element_type	: 'span',
				inner_html		: info_value,
				parent			: fragment
			})
		}

	return fragment
}//end render_column_component_info()



/**
* RENDER_COLUMN_REMOVE
* Render node for use in edit
* @param object options
* @return DOM DocumentFragment
*/
export const render_column_remove = function(options) {

	// options
		const self		= options.caller
		const row_key	= options.row_key

	const fragment = new DocumentFragment()

	// remove icon
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'button remove',
			dataset			: { key : row_key },
			parent			: fragment
		})

	return fragment
}// end render_column_remove()


