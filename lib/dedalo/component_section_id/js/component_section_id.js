// imports
	import {common} from '../../common/js/common.js'
	import {component_common} from '../../common/js/component_common.js'
	import {render_component_section_id} from '../../component_section_id/js/render_component_section_id.js'
	//import * as instances from '../../common/js/instances.js'
	//import event_manager from '../../page/js/page.js'
	//import {ui} from '../../common/js/ui.js'
	//import {data_manager} from '../../common/js/data_manager.js'



export const component_section_id = function(){

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
		this.id

	return true
}//end component_section_id



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	component_section_id.prototype.init 	 = component_common.prototype.init
	component_section_id.prototype.destroy 	 = common.prototype.destroy
	component_section_id.prototype.save 	 = component_common.prototype.save
	component_section_id.prototype.load_data = component_common.prototype.load_data
	component_section_id.prototype.get_value = component_common.prototype.get_value
	component_section_id.prototype.set_value = component_common.prototype.set_value

// render
	component_section_id.prototype.render 	= common.prototype.render
	component_section_id.prototype.list 	= render_component_section_id.prototype.list
	component_section_id.prototype.edit 	= render_component_section_id.prototype.edit

