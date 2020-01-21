/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {common} from '../../common/js/common.js'
	import {component_common} from '../../component_common/js/component_common.js'
	import {render_component_svg} from '../../component_svg/js/render_component_svg.js'



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

	this.file_name
	this.file_dir

	return true
}//end component_svg



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	// lifecycle
	component_svg.prototype.init 	 			= component_common.prototype.init
	//component_svg.prototype.build 	 		= component_common.prototype.build
	component_svg.prototype.render 				= common.prototype.render
	component_svg.prototype.refresh 			= common.prototype.refresh
	component_svg.prototype.destroy 	 		= common.prototype.destroy

	// change data
	component_svg.prototype.save 	 			= component_common.prototype.save
	component_svg.prototype.update_data_value	= component_common.prototype.update_data_value
	component_svg.prototype.update_datum 		= component_common.prototype.update_datum
	component_svg.prototype.change_value 		= component_common.prototype.change_value


	// render
	component_svg.prototype.list 				= render_component_svg.prototype.list
	component_svg.prototype.edit 				= render_component_svg.prototype.edit




/**
* BUILD
*/
component_svg.prototype.build = async function(autoload=false) {

	const self = this

	// call generic component commom build
		const common_build = component_common.prototype.build.call(this, autoload);

	// fix useful vars
		self.allowed_extensions 	= self.context.allowed_extensions
		self.default_target_quality = self.context.default_target_quality


	return common_build
}//end build_custom