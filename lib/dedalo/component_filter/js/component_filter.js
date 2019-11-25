// imports
	import {common} from '../../common/js/common.js'
	import {component_common} from '../../component_common/js/component_common.js'
	import {render_component_filter} from '../../component_filter/js/render_component_filter.js'



export const component_filter = function(){
	
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
}//end component_filter




/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	component_filter.prototype.init 	 			= component_common.prototype.init
	component_filter.prototype.build 	 			= component_common.prototype.build
	component_filter.prototype.render 				= common.prototype.render
	component_filter.prototype.destroy 	 			= common.prototype.destroy
	component_filter.prototype.refresh 				= common.prototype.refresh
	component_filter.prototype.save 	 			= component_common.prototype.save
	component_filter.prototype.load_data 			= component_common.prototype.load_data
	component_filter.prototype.get_value 			= component_common.prototype.get_value
	component_filter.prototype.set_value 			= component_common.prototype.set_value
	component_filter.prototype.update_data_value	= component_common.prototype.update_data_value
	component_filter.prototype.update_datum 		= component_common.prototype.update_datum
	component_filter.prototype.change_value 		= component_common.prototype.change_value

	// render
	component_filter.prototype.list 		= render_component_filter.prototype.list
	component_filter.prototype.edit 		= render_component_filter.prototype.edit
	component_filter.prototype.edit_in_list	= render_component_filter.prototype.edit
	component_filter.prototype.search 		= render_component_filter.prototype.search
	component_filter.prototype.change_mode 	= component_common.prototype.change_mode



/**
* GET_CHANGED_KEY
*/
component_filter.prototype.get_changed_key = function(action, value) {

	const self = this

	if (action==='insert') {
		// insert value

		// check if value already exists
		const ar_found = self.data.value.filter(item => item.section_id===value.section_id && item.section_tipo===value.section_tipo)
		if (ar_found.length>0) {
			console.warn("Ignored to add value because already exists:", value);
			return false
		}

		// component common add value and save (without refresh)
			return self.data.value.length || 0

	}else{
		// remove value

		const value_key = self.data.value.findIndex( (item) => {
			return (item.section_id===value.section_id && item.section_tipo===value.section_tipo)
		})
		if (value_key===-1) {
			console.warn("Error. item not found in values:", value);
			return false
		}

		return value_key
	}

	return false
}//end get_changed_key

