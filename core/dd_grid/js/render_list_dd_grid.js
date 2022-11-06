/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	// import {event_manager} from '../../common/js/event_manager.js'
	// import {ui} from '../../common/js/ui.js'
	// import {clone,dd_console} from '../../common/js/utils/index.js'
	import {view_csv_dd_grid} from './view_csv_dd_grid.js'
	import {view_table_dd_grid} from './view_table_dd_grid.js'
	import {view_default_dd_grid} from './view_default_dd_grid.js'
	import {view_text_dd_grid} from './view_text_dd_grid.js'



/**
* RENDER_LIST_DD_GRID
* Manage the components logic and appearance in client side
*/
export const render_list_dd_grid = function() {

	return true
}//end render_list_dd_grid



/**
* LIST
* Render node to use in list
* @return DOM node wrapper
*/
render_list_dd_grid.prototype.list = async function(options) {

	const self = this

	// view
		const view	= self.view
			? self.view
			: 'default'

	switch(view) {

		case 'csv':
			return view_csv_dd_grid.render(self, options)

		case 'table':
			return view_table_dd_grid.render(self, options)

		case 'text':
			return view_text_dd_grid.render(self, options)

		case 'default':
		default:
			return view_default_dd_grid.render(self, options)
	}

	return null
}//end list
