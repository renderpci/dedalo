/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {common} from '../../common/js/common.js'
	import {component_common} from '../../component_common/js/component_common.js'
	import {render_edit_component_inverse} from '../../component_inverse/js/render_edit_component_inverse.js'
	import {render_list_component_inverse} from '../../component_inverse/js/render_list_component_inverse.js'
	import {render_mini_component_inverse} from '../../component_inverse/js/render_mini_component_inverse.js'


export const component_inverse = function(){

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
};//end component_inverse



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	component_inverse.prototype.init		= component_common.prototype.init
	component_inverse.prototype.build		= component_common.prototype.build
	component_inverse.prototype.destroy		= common.prototype.destroy
	component_inverse.prototype.save		= component_common.prototype.save
	component_inverse.prototype.load_data	= component_common.prototype.load_data
	component_inverse.prototype.build_rqo	= common.prototype.build_rqo

	// render
	component_inverse.prototype.render		= common.prototype.render
	component_inverse.prototype.mini		= render_mini_component_inverse.prototype.mini
	component_inverse.prototype.list		= render_list_component_inverse.prototype.list
	component_inverse.prototype.edit		= render_edit_component_inverse.prototype.edit
	component_inverse.prototype.search		= render_edit_component_inverse.prototype.edit


