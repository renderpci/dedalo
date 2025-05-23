// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL */
/*eslint no-undef: "error"*/



// imports
	import {common} from '../../common/js/common.js'
	import {component_common} from '../../component_common/js/component_common.js'
	import {render_edit_component_svg} from './render_edit_component_svg.js'
	import {render_list_component_svg} from './render_list_component_svg.js'
	import {render_search_component_svg} from './render_search_component_svg.js'



export const component_svg = function(){

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
	this.quality

	this.file_name
	this.file_dir
}//end component_svg



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
	// prototypes assign
	// lifecycle
	component_svg.prototype.init				= component_common.prototype.init
	component_svg.prototype.build				= component_common.prototype.build
	component_svg.prototype.render				= common.prototype.render
	component_svg.prototype.refresh				= common.prototype.refresh
	component_svg.prototype.destroy				= common.prototype.destroy

	// change data
	component_svg.prototype.save				= component_common.prototype.save
	component_svg.prototype.update_data_value	= component_common.prototype.update_data_value
	component_svg.prototype.update_datum		= component_common.prototype.update_datum
	component_svg.prototype.change_value		= component_common.prototype.change_value
	component_svg.prototype.set_changed_data	= component_common.prototype.set_changed_data
	component_svg.prototype.build_rqo			= common.prototype.build_rqo


	// render
	component_svg.prototype.list				= render_list_component_svg.prototype.list
	component_svg.prototype.tm					= render_list_component_svg.prototype.list
	component_svg.prototype.edit				= render_edit_component_svg.prototype.edit
	component_svg.prototype.search				= render_search_component_svg.prototype.search



// @license-end
