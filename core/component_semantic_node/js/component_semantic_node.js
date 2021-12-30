/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/


// imports
	import {component_portal} from '../../component_portal/js/component_portal.js'


/**
* COMPONENT_SEMANTIC_NODE
*/
export const component_semantic_node = component_portal




// // imports
// 	import {data_manager} from '../../common/js/data_manager.js'
// 	import {common,create_source} from '../../common/js/common.js'
// 	import {component_common} from '../../component_common/js/component_common.js'
// 	import {render_edit_component_semantic_node} from '../../component_semantic_node/js/render_edit_component_semantic_node.js'
// 	import {render_list_component_semantic_node} from '../../component_semantic_node/js/render_list_component_semantic_node.js'
// 	import {render_search_component_semantic_node} from '../../component_semantic_node/js/render_search_component_semantic_node.js'
// 	import {render_mini_component_semantic_node} from '../../component_semantic_node/js/render_mini_component_semantic_node.js'



// export const component_semantic_node = function(){

// 	this.id				= null

// 	// element properties declare
// 	this.model			= null
// 	this.tipo			= null
// 	this.section_tipo	= null
// 	this.section_id		= null
// 	this.mode			= null
// 	this.lang			= null

// 	this.section_lang	= null
// 	this.context		= null
// 	this.data			= null
// 	this.parent			= null
// 	this.node			= null

// 	this.tools			= null

// 	this.duplicates		= false


// 	return true
// };//end component_semantic_node



// /**
// * COMMON FUNCTIONS
// * extend component functions from component common
// */
// // prototypes assign
// 	// lifecycle
// 	component_semantic_node.prototype.init				= component_common.prototype.init
// 	component_semantic_node.prototype.build				= component_common.prototype.build
// 	component_semantic_node.prototype.render			= common.prototype.render
// 	component_semantic_node.prototype.refresh			= common.prototype.refresh
// 	component_semantic_node.prototype.destroy			= common.prototype.destroy

// 	// change data
// 	component_semantic_node.prototype.save				= component_common.prototype.save
// 	component_semantic_node.prototype.update_data_value	= component_common.prototype.update_data_value
// 	component_semantic_node.prototype.update_datum		= component_common.prototype.update_datum
// 	component_semantic_node.prototype.change_value		= component_common.prototype.change_value
// 	component_semantic_node.prototype.build_rqo			= common.prototype.build_rqo

// 	// render
// 	component_semantic_node.prototype.list				= render_list_component_semantic_node.prototype.list
// 	component_semantic_node.prototype.search			= render_search_component_semantic_node.prototype.search
// 	component_semantic_node.prototype.mini				= render_mini_component_semantic_node.prototype.mini
// 	component_semantic_node.prototype.edit				= render_edit_component_semantic_node.prototype.edit
// 	component_semantic_node.prototype.edit_in_list		= render_edit_component_semantic_node.prototype.edit
// 	component_semantic_node.prototype.tm				= render_edit_component_semantic_node.prototype.edit

// 	component_semantic_node.prototype.change_mode		= component_common.prototype.change_mode




// /**
// * ACTIVE
// * Custom active function triggered after ui.active has finish
// */
// component_semantic_node.prototype.active = function() {

// 	//console.log("Yujuu! This is my component custom active test triggered after ui.active. id:", this.id )

// 	return true
// };//end active




