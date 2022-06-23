/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	// import {event_manager} from '../../common/js/event_manager.js'
	import {data_manager} from '../../common/js/data_manager.js'
	import {common} from '../../common/js/common.js'
	// import {instances, get_instance, delete_instance} from '../../common/js/instances.js'
	import {render_list_dd_grid} from '../../dd_grid/js/render_list_dd_grid.js'
	import {render_table_dd_grid} from '../../dd_grid/js/render_table_dd_grid.js'
	// import {ui} from '../../common/js/ui.js'




export const dd_grid = function(){

	// // element properties declare
		this.model
		this.tipo
		this.section_tipo
		this.section_id
		this.mode
		this.data_format
		this.lang

		this.rqo

		this.data
		this.node
		this.id

		this.events_tokens = []
	return true
}//end dd_grid



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	// lifecycle
	dd_grid.prototype.init			= common.prototype.init
	// dd_grid.prototype.build		= common.prototype.build
	dd_grid.prototype.render		= common.prototype.render
	dd_grid.prototype.refresh		= common.prototype.refresh
	dd_grid.prototype.destroy		= common.prototype.destroy

	//render
	dd_grid.prototype.list			= render_list_dd_grid.prototype.list
	dd_grid.prototype.table			= render_table_dd_grid.prototype.table
	// dd_grid.prototype.csv			= render_csv_dd_grid.prototype.table


/**
* BUILD
* @return promise
* 	bool true
*/
dd_grid.prototype.build	= async function(autoload=true){

	const self = this

	// status update
		self.status = 'building'

	const current_data_manager	= new data_manager()
	const api_response			= await current_data_manager.request({body:self.rqo})

	self.data = api_response.result || null
	// status update
		self.status = 'builded'

	return
}//end build


