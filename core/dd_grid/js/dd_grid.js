// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {clone} from '../../common/js/utils/index.js'
	import {data_manager} from '../../common/js/data_manager.js'
	import {common} from '../../common/js/common.js'
	import {render_list_dd_grid} from '../../dd_grid/js/render_list_dd_grid.js'



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
	dd_grid.prototype.render	= common.prototype.render
	dd_grid.prototype.refresh	= common.prototype.refresh
	dd_grid.prototype.destroy	= common.prototype.destroy
	// render
	dd_grid.prototype.list		= render_list_dd_grid.prototype.list



/**
* INIT
* Custom init method.
* Call common init and then add custom properties
* @param object options
* @return bool
*/
dd_grid.prototype.init = async function(options) {

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
	// paginator options
		self.paginator_options = options.paginator_options || {}
	// totals group options
		self.totals_group = options.totals_group || {}


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



/**
* GET_TOTAL
* Called by the paginator when is initiated or refreshed
* @return int self.rqo.sqo.total
*/
dd_grid.prototype.get_total = async function() {

	const self = this

	// already calculated case
		if (self.rqo.sqo.total || self.rqo.sqo.total===0) {
			return self.rqo.sqo.total
		}

	const rqo_count = clone(self.rqo)

	rqo_count.action = 'count'
	delete rqo_count.sqo.limit
	delete rqo_count.sqo.offset
	delete rqo_count.sqo.total

	const api_count_response = await data_manager.request({
		body		: rqo_count,
		use_worker	: true
	})

	// API error case
		if ( api_count_response.result===false || api_count_response.errors?.length ) {
			console.error('Error on count total : api_count_response:', api_count_response);
			return
		}

	// set result
		self.rqo.sqo.total = api_count_response.result.total


	return self.rqo.sqo.total
}//end get_total



/**
* GET_GRID_VALUES
* Recursively resolves the given dd_grid data
* @param array data
* @return array values
* 	e.g. [{model:"component_image",label:"obverse",value:"https://domain.org/path/rsc29_rsc170_1381.jpg"}]
*/
dd_grid.prototype.get_grid_values = function(data) {

	const values = []

	const data_len = data.length
	for (let i = 0; i < data_len; i++) {

		const data_item = data[i]

		if (data_item && data_item.type) {

			if(data_item.value){

				// column case add
				if(data_item.type==='column' && data_item.cell_type){

					// values.push(data_item)
					values.push({
						ar_columns_obj	: data_item.ar_columns_obj,
						model			: data_item.model,
						label			: data_item.label,
						value			: data_item.value
					})
				}

				// value. Recursion
				const rec_values = this.get_grid_values(data_item.value)
				values.push(...rec_values)
			}
		}
	}//end for (let i = 0; i < data_len; i++)


	return values
}//end get_grid_values



// @license-end
