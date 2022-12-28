/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL */
/*eslint no-undef: "error"*/



// imports
	// import {ui} from '../../../../core/common/js/ui.js'
	// import {set_element_css} from '../../../../core/page/js/css.js'
	// import {event_manager} from '../../../../core/common/js/event_manager.js'
	import {
		common_render
	} from './render_service_time_machine_list.js'



/**
* VIEW_DEFAULT_TIME_MACHINE_LIST
* Manages the component's logic and appearance in client side
*/
export const view_default_time_machine_list = function() {

	return true
}//end view_default_time_machine_list



/**
* RENDER
* Renders main element wrapper for current view
* @param object self
* @param object options
* @return DOM node wrapper
*/
view_default_time_machine_list.render = async function(self, options) {

	const wrapper = common_render(self, options)

	return wrapper
}//end render



/**
* REBUILD_COLUMNS_MAP
* Adding control columns to the columns_map that will processed by section_recods
* @return obj columns_map
*/
	// const rebuild_columns_map = async function(self) {

	// 	const columns_map = []

	// 	// columns base
	// 		const base_columns_map = await self.columns_map

	// 	// ignore_columns
	// 		const ignore_columns = self.config.ignore_columns
	// 			? self.config.ignore_columns
	// 			: [
	// 				'dd1573' // matrix_id
	// 			  ]

	// 	// modify list and labels
	// 		const base_columns_map_length = base_columns_map.length
	// 		for (let i = 0; i < base_columns_map_length; i++) {
	// 			const el = base_columns_map[i]

	// 			// ignore some columns
	// 				if (ignore_columns.includes(el.tipo)) {
	// 					continue;
	// 				}

	// 			columns_map.push(el)
	// 		}


	// 	return columns_map
	// }//end rebuild_columns_map
