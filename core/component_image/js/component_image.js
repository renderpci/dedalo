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
	component_image.prototype.init 	 		= component_common.prototype.init
	component_image.prototype.build 	 	= component_common.prototype.build
	component_image.prototype.destroy 	 	= common.prototype.destroy
	component_image.prototype.save 	 		= component_common.prototype.save
	component_image.prototype.load_data 	= component_common.prototype.load_data
	component_image.prototype.load_datum 	= component_common.prototype.load_datum
	component_image.prototype.get_value 	= component_common.prototype.get_value
	component_image.prototype.set_value 	= component_common.prototype.set_value

	// render
	component_image.prototype.render 		= common.prototype.render
	component_image.prototype.list 			= render_component_image.prototype.list
	component_image.prototype.edit 			= render_component_image.prototype.edit



/**
* BUILD_CUSTOM
* Is called from component common after common build is finished (!)
* Useful to append or change custom properties from components
* Is async always and is waited before set status as 'builded'
*/
component_image.prototype.build_custom = async function() {

	const self = this

		console.log("self.context:",self.context);

	// fix useful vars for tool upload
		self.file_name 			= 'pepet.jpg'
		self.target_dir 		= '/root/pepet_folder'
		self.allowed_extensions = self.context.allowed_extensions


	return true
}//end build_custom


