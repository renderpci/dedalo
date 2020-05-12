// imports
	import {data_manager} from '../../common/js/data_manager.js'
	import {common,create_source} from '../../common/js/common.js'
	import {component_common} from '../../component_common/js/component_common.js'
	import {event_manager} from '../../common/js/event_manager.js'


	import {render_component_calculation} from '../../component_calculation/js/render_component_calculation.js'
	// import * as instances from '../../common/js/instances.js'



export const component_calculation = function(){

	this.id

	// element properties declare
	this.model
	this.tipo
	this.section_tipo
	this.section_id
	this.mode
	this.lang

	this.section_lang
	this.context
	this.data
	this.parent
	this.node
	this.tools

	return true
}//end component_calculation


// prototypes assign
	// lifecycle
	component_calculation.prototype.init 	 		= component_common.prototype.init
	component_calculation.prototype.build 	 		= component_common.prototype.build
	component_calculation.prototype.render 			= common.prototype.render
	component_calculation.prototype.refresh 		= common.prototype.refresh
	component_calculation.prototype.destroy 	 	= common.prototype.destroy

	// change data
	component_calculation.prototype.save 	 			= component_common.prototype.save
	component_calculation.prototype.update_data_value	= component_common.prototype.update_data_value
	component_calculation.prototype.update_datum 		= component_common.prototype.update_datum
	component_calculation.prototype.change_value 		= component_common.prototype.change_value

	// render
	component_calculation.prototype.list 				= render_component_calculation.prototype.list
	component_calculation.prototype.edit 				= render_component_calculation.prototype.edit
	// component_calculation.prototype.edit_in_list		= render_component_calculation.prototype.edit
	// component_calculation.prototype.tm				= render_component_calculation.prototype.edit
	component_calculation.prototype.search 				= render_component_calculation.prototype.search
	// component_calculation.prototype.change_mode 		= component_common.prototype.change_mode
