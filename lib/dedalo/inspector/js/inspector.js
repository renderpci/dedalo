// import
	import event_manager from '../../page/js/page.js'
	import {common} from '../../common/js/common.js'
	import {render_inspector} from './render_inspector.js'



/**
*  INSPECTOR
*
*/
export const inspector = function() {

	return true
}//end inspector



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	inspector.prototype.edit 	= render_inspector.prototype.edit
	inspector.prototype.render 	= common.prototype.render
	inspector.prototype.refresh = common.prototype.refresh



/**
* INIT
* @return bool true
*/
inspector.prototype.init = function(options) {

	const self = this

	self.section_tipo	= options.section_tipo
	self.section_id		= options.section_id
	self.mode 			= 'edit'
	self.node 			= []

	return true
}// end init



/**
* BUILD
* @return bool true
*/
inspector.prototype.build = async function(){

	return true
}// end build

