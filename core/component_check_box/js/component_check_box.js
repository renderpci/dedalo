/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {component_common} from '../../component_common/js/component_common.js'
	import {render_component_check_box} from '../../component_check_box/js/render_component_check_box.js'
	import {common} from '../../common/js/common.js'



export const component_check_box = function(){

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
}//end component_check_box



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	// lifecycle
	component_check_box.prototype.init 	 			= component_common.prototype.init
	component_check_box.prototype.build 			= component_common.prototype.build
	component_check_box.prototype.render 			= common.prototype.render
	component_check_box.prototype.refresh 			= common.prototype.refresh
	component_check_box.prototype.destroy 	 		= common.prototype.destroy

	// change data
	component_check_box.prototype.save 	 			= component_common.prototype.save
	component_check_box.prototype.update_data_value = component_common.prototype.update_data_value
	component_check_box.prototype.update_datum		= component_common.prototype.update_datum
	component_check_box.prototype.change_value 		= component_common.prototype.change_value

	// render
	component_check_box.prototype.list 				= render_component_check_box.prototype.list
	component_check_box.prototype.edit 				= render_component_check_box.prototype.edit
	component_check_box.prototype.edit_in_list		= render_component_check_box.prototype.edit
	component_check_box.prototype.tm				= render_component_check_box.prototype.edit
	component_check_box.prototype.search 			= render_component_check_box.prototype.search
	component_check_box.prototype.change_mode 		= component_common.prototype.change_mode



/**
* GET_CHANGED_KEY
*/
component_check_box.prototype.get_changed_key = function(action, value) {

	const self = this

	console.log("action", action);
	console.log("value", value);

	const changed_key = (() => {

		if (action==='insert') {

			// insert value
			if (self.data.value) {

				// check if value already exists
				const ar_found = self.data.value.filter(item => item.section_id===value.section_id && item.section_tipo===value.section_tipo)
				if (ar_found.length>0) {
					console.warn("Ignored to add value because already exists:", value)
				}

				// component common add value and save (without refresh)
				return self.data.value.length || 0
			}

		}else{

			// remove value
			const value_key = self.data.value.findIndex(item => {
				return (item.section_id===value.section_id && item.section_tipo===value.section_tipo)
			})
			if (value_key===-1) {
				console.warn("Error. item not found in values:", value)
			}else{
				return value_key
			}
		}

		return 0;
	})()


	return changed_key
}//end get_changed_key


