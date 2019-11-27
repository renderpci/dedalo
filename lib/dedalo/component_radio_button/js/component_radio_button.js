// imports
	import {common} from '../../common/js/common.js'
	import {component_common} from '../../component_common/js/component_common.js'
	import {render_component_radio_button} from '../../component_radio_button/js/render_component_radio_button.js'


export const component_radio_button = function(){

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

	return true
}//end component_radio_button



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	component_radio_button.prototype.init 	 			= component_common.prototype.init
	component_radio_button.prototype.build 				= component_common.prototype.build
	component_radio_button.prototype.render 			= common.prototype.render
	component_radio_button.prototype.destroy 	 		= common.prototype.destroy
	component_radio_button.prototype.refresh 			= common.prototype.refresh
	component_radio_button.prototype.save 	 			= component_common.prototype.save
	component_radio_button.prototype.load_data 			= component_common.prototype.load_data
	component_radio_button.prototype.get_value 			= component_common.prototype.get_value
	component_radio_button.prototype.set_value 			= component_common.prototype.set_value
	component_radio_button.prototype.update_data_value 	= component_common.prototype.update_data_value
	component_radio_button.prototype.update_datum		= component_common.prototype.update_datum
	component_radio_button.prototype.change_value 		= component_common.prototype.change_value

	// render
	component_radio_button.prototype.list 				= render_component_radio_button.prototype.list
	component_radio_button.prototype.edit 				= render_component_radio_button.prototype.edit
	component_radio_button.prototype.edit_in_list		= render_component_radio_button.prototype.edit
	component_radio_button.prototype.change_mode 		= component_common.prototype.change_mode


/**
* GET_CHECKED_VALUE_LABEL
*/
component_radio_button.prototype.get_checked_value_label = function() {

	const self = this
	
	if (self.data.value[0] !=null) {

		const checked_key = self.data.datalist.findIndex( (item) => {
				return (item.section_id===self.data.value[0].section_id)
			})

		return self.data.datalist[checked_key].label

	}else{

		return ''

	}
	
}//end get_checked_value_label