// imports
	import {component_common} from '../../common/js/component_common.js'
	import {render_component_state} from '../../component_state/js/render_component_state.js'
	


export const component_state = function(){
	
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
}//end component_state



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	component_state.prototype.init 	 	= component_common.prototype.init
	component_state.prototype.save 	 	= component_common.prototype.save
	component_state.prototype.load_data = component_common.prototype.load_data
	component_state.prototype.get_value = component_common.prototype.get_value
	component_state.prototype.set_value = component_common.prototype.set_value

	// render
	component_state.prototype.list = render_component_state.prototype.list
	component_state.prototype.edit = render_component_state.prototype.edit


