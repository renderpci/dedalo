// imports
	import {component_common} from '../../common/js/component_common.js'
	import {render_component_autocomplete} from '../../component_autocomplete/js/render_component_autocomplete.js'
	//import * as instances from '../../common/js/instances.js'
	//import event_manager from '../../page/js/page.js'
	//import {ui} from '../../common/js/ui.js'	
	//import {data_manager} from '../../common/js/data_manager.js'



export const component_autocomplete = function(){
	
	// element properties declare
		this.model
		this.tipo
		this.section_tipo
		this.section_id
		this.mode
		this.lang

		this.section_lang
		
		this.datum
		this.context
		this.data
		this.parent
		this.node
		this.id

	return true
}//end component_autocomplete



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	component_autocomplete.prototype.init 	 	= component_common.prototype.init
	component_autocomplete.prototype.save 	 	= component_common.prototype.save
	component_autocomplete.prototype.load_data 	= component_common.prototype.load_data
	component_autocomplete.prototype.load_datum = component_common.prototype.load_datum
	component_autocomplete.prototype.get_value 	= component_common.prototype.get_value
	component_autocomplete.prototype.set_value 	= component_common.prototype.set_value

	// render
	component_autocomplete.prototype.list 		= render_component_autocomplete.prototype.list
	component_autocomplete.prototype.edit 		= render_component_autocomplete.prototype.edit
	component_autocomplete.prototype.render 	= component_common.prototype.deep_render


