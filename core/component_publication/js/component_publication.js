// imports
	import {common} from '../../common/js/common.js'
	import {component_common} from '../../component_common/js/component_common.js'
	import {render_component_publication} from '../../component_publication/js/render_component_publication.js'


export const component_publication = function(){

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
}//end component_publication


/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	component_publication.prototype.init				= component_common.prototype.init
	component_publication.prototype.build				= component_common.prototype.build
	component_publication.prototype.render				= common.prototype.render
	component_publication.prototype.destroy				= common.prototype.destroy
	component_publication.prototype.refresh				= common.prototype.refresh
	component_publication.prototype.save				= component_common.prototype.save
	component_publication.prototype.load_data			= component_common.prototype.load_data
	component_publication.prototype.get_value			= component_common.prototype.get_value
	component_publication.prototype.set_value			= component_common.prototype.set_value
	component_publication.prototype.update_data_value	= component_common.prototype.update_data_value
	component_publication.prototype.update_datum		= component_common.prototype.update_datum
	component_publication.prototype.change_value		= component_common.prototype.change_value
	component_publication.prototype.build_dd_request	= common.prototype.build_dd_request

	// render	
	component_publication.prototype.list				= render_component_publication.prototype.list
	component_publication.prototype.edit				= render_component_publication.prototype.edit
	component_publication.prototype.edit_in_list		= render_component_publication.prototype.edit
	component_publication.prototype.tm					= render_component_publication.prototype.edit
	component_publication.prototype.change_mode			= component_common.prototype.change_mode