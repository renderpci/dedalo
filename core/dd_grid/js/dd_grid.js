// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	// import {event_manager} from '../../common/js/event_manager.js'
	import {data_manager} from '../../common/js/data_manager.js'
	import {common} from '../../common/js/common.js'
	// import {instances, get_instance, delete_instance} from '../../common/js/instances.js'
	import {render_list_dd_grid} from '../../dd_grid/js/render_list_dd_grid.js'
	// import {render_table_dd_grid} from '../../dd_grid/js/render_table_dd_grid.js'
	// import {ui} from '../../common/js/ui.js'



export const dd_grid = function(){

	// element properties declare
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
}//end dd_grid



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	// lifecycle
	// dd_grid.prototype.init	= common.prototype.init
	// dd_grid.prototype.build	= common.prototype.build
	dd_grid.prototype.render	= common.prototype.render
	dd_grid.prototype.refresh	= common.prototype.refresh
	dd_grid.prototype.destroy	= common.prototype.destroy

	// render
	dd_grid.prototype.list		= render_list_dd_grid.prototype.list
	// dd_grid.prototype.table	= render_table_dd_grid.prototype.table
	// dd_grid.prototype.csv	= render_csv_dd_grid.prototype.table



/**
* INIT
* Custom init method.
* Call common init and then add custom properties
* @param object options
* @return bool
*/
dd_grid.prototype.init	= async function(options) {

	const self = this

	// call the generic common tool init
		const common_init = await common.prototype.init.call(this, options);

	// set data if exists
		self.data = options.data
	// column_id
		self.column_id = options.column_id
	// view. When caller is section_record, the view is inside context
		self.view = options.view || (options.context ? options.context.view : 'default')
	// set config
		self.config = options.config
	
	// // show_tipo_in_label
	// 	self.show_tipo_in_label = options.show_tipo_in_label || false


	return common_init
}//end build



/**
* BUILD
* Custom element builder
* @param bool autoload = false
* @return bool
*/
dd_grid.prototype.build	= async function(autoload=false) {

	const self = this

	// status update
		self.status = 'building'

	// api request
		if (autoload===true) {
			const api_response = await data_manager.request({
				body : self.rqo
			})
			self.data = api_response.result || null
		}

	// status update
		self.status = 'built'


	return true
}//end build



// @license-end
