// imports
	import {common} from '../../common/js/common.js'
	import {area_common} from '../../common/js/area_common.js'
	import {render_area_development} from './render_area_development.js'


/**
* AREA_DEVELOPMENT
*/
export const area_development = function() {

	this.id

	// element properties declare
	this.model
	this.type
	this.tipo
	this.mode
	this.lang

	this.datum
	this.context
	this.data

	this.widgets

	this.node
	this.status

	return true
}//end area_development



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	area_development.prototype.edit 		= render_area_development.prototype.edit
	area_development.prototype.list 		= render_area_development.prototype.list

	area_development.prototype.init 		= area_common.prototype.init
	area_development.prototype.build 		= area_common.prototype.build
	area_development.prototype.render 		= common.prototype.render
	area_development.prototype.destroy 		= common.prototype.destroy
	area_development.prototype.refresh 		= common.prototype.refresh


