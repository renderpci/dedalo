/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {common} from '../../common/js/common.js'
	import {component_common} from '../../component_common/js/component_common.js'
	import {render_component_image} from '../../component_image/js/render_component_image.js'



export const component_image = function(){

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
}//end component_image



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	// lifecycle
	component_image.prototype.init 	 			= component_common.prototype.init
	component_image.prototype.build 	 		= component_common.prototype.build
	component_image.prototype.render 			= common.prototype.render
	component_image.prototype.refresh 			= common.prototype.refresh
	component_image.prototype.destroy 	 		= common.prototype.destroy

	// change data
	component_image.prototype.save 	 			= component_common.prototype.save
	component_image.prototype.update_data_value	= component_common.prototype.update_data_value
	component_image.prototype.update_datum 		= component_common.prototype.update_datum
	component_image.prototype.change_value 		= component_common.prototype.change_value

	// render
	component_image.prototype.list 				= render_component_image.prototype.list
	component_image.prototype.edit 				= render_component_image.prototype.edit



// /**
// * BUILD
// */
// component_image.prototype.build = async function(autoload=false) {

// 	const self = this

// 	// call generic component commom build
// 		const common_build = component_common.prototype.build.call(this, autoload);

// 	// fix useful vars
// 		// self.allowed_extensions 	= self.context.allowed_extensions
// 		// self.default_target_quality = self.context.default_target_quality


// 	return common_build
// }//end build_custom


