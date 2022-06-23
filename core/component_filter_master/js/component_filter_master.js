/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {common} from '../../common/js/common.js'
	import {component_common} from '../../component_common/js/component_common.js'
	import {component_filter} from '../../component_filter/js/component_filter.js'
	//import {render_component_filter} from '../../component_filter/js/render_component_filter.js'
	//mport {render_component_filter_master} from '../../component_filter_master/js/render_component_filter_master.js'



export const component_filter_master = function(){

	this.id				= null

	// element properties declare
	this.model			= null
	this.tipo			= null
	this.section_tipo	= null
	this.section_id		= null
	this.mode			= null
	this.lang			= null

	this.section_lang	= null
	this.context		= null
	this.data			= null
	this.parent			= null
	this.node			= null

	this.tools			= null

	return true
}//end component_filter_master




/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	component_filter_master.prototype.init				= component_common.prototype.init
	component_filter_master.prototype.build				= component_common.prototype.build
	component_filter_master.prototype.render			= common.prototype.render
	component_filter_master.prototype.destroy			= common.prototype.destroy
	component_filter_master.prototype.refresh			= common.prototype.refresh
	component_filter_master.prototype.save				= component_common.prototype.save
	component_filter_master.prototype.update_data_value	= component_common.prototype.update_data_value
	component_filter_master.prototype.update_datum		= component_common.prototype.update_datum
	component_filter_master.prototype.change_value		= component_common.prototype.change_value
	component_filter_master.prototype.build_rqo			= common.prototype.build_rqo

	// render (from component_filter_master)
	component_filter_master.prototype.mini				= component_filter.prototype.mini
	component_filter_master.prototype.list				= component_filter.prototype.list
	component_filter_master.prototype.edit				= component_filter.prototype.edit
	component_filter_master.prototype.edit_in_list		= component_filter.prototype.edit
	component_filter_master.prototype.search			= component_filter.prototype.search
	component_filter_master.prototype.change_mode		= component_filter.prototype.change_mode

	// others (from component_filter)
	component_filter_master.prototype.get_changed_key	= component_filter.prototype.get_changed_key
