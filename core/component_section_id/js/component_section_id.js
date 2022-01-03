/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {common} from '../../common/js/common.js'
	import {component_common} from '../../component_common/js/component_common.js'
	import {render_edit_component_section_id} from '../../component_section_id/js/render_edit_component_section_id.js'
	import {render_search_component_section_id} from '../../component_section_id/js/render_search_component_section_id.js'
	import {render_mini_component_section_id} from '../../component_section_id/js/render_mini_component_section_id.js'
	import {render_list_component_section_id} from '../../component_section_id/js/render_list_component_section_id.js'



export const component_section_id = function(){

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
		this.id				= null

	return true
};//end component_section_id



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
	// lifecycle
	component_section_id.prototype.init					= component_common.prototype.init
	component_section_id.prototype.build				= component_common.prototype.build
	component_section_id.prototype.render				= common.prototype.render
	component_section_id.prototype.refresh				= common.prototype.refresh
	component_section_id.prototype.destroy				= common.prototype.destroy

	// change data
	component_section_id.prototype.save					= component_common.prototype.save
	component_section_id.prototype.update_data_value	= component_common.prototype.update_data_value
	component_section_id.prototype.update_datum			= component_common.prototype.update_datum
	component_section_id.prototype.change_value			= component_common.prototype.change_value
	component_section_id.prototype.build_rqo			= common.prototype.build_rqo

	// render
	component_section_id.prototype.mini					= render_mini_component_section_id.prototype.mini
	component_section_id.prototype.list					= render_list_component_section_id.prototype.list
	component_section_id.prototype.edit					= render_edit_component_section_id.prototype.edit
	component_section_id.prototype.edit_in_list			= render_edit_component_section_id.prototype.edit
	component_section_id.prototype.tm					= render_edit_component_section_id.prototype.list
	component_section_id.prototype.search				= render_search_component_section_id.prototype.search
	component_section_id.prototype.change_mode			= component_common.prototype.change_mode
