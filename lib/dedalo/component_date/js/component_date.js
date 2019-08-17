// imports
	import {component_common} from '../../common/js/component_common.js'
	import {render_component_date} from '../../component_date/js/render_component_date.js'



export const component_date = function(){
	
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
}//end component_date



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	component_date.prototype.init 	 	= component_common.prototype.init
	component_date.prototype.destroy 	= component_common.prototype.destroy
	component_date.prototype.save 	 	= component_common.prototype.save
	component_date.prototype.load_data 	= component_common.prototype.load_data
	component_date.prototype.get_value 	= component_common.prototype.get_value
	component_date.prototype.set_value 	= component_common.prototype.set_value

	// render
	component_date.prototype.render 	= component_common.prototype.render
	component_date.prototype.list 		= render_component_date.prototype.list
	component_date.prototype.edit 		= render_component_date.prototype.edit


