// imports
	import {common} from '../../common/js/common.js'
	import {area_common} from '../../common/js/area_common.js'
	import {data_manager} from '../../common/js/data_manager.js'
	import {render_area_thesaurus} from './render_area_thesaurus.js'
	import {ts_object} from '../../ts_object/js/ts_object.js'



/**
* AREA_THESAURUS
*/
export const area_thesaurus = function() {

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
}//end area_thesaurus



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	area_thesaurus.prototype.init 		= area_common.prototype.init
	area_thesaurus.prototype.build 		= area_common.prototype.build
	area_thesaurus.prototype.render 	= common.prototype.render
	area_thesaurus.prototype.refresh 	= common.prototype.refresh
	area_thesaurus.prototype.destroy 	= common.prototype.destroy
	area_thesaurus.prototype.edit 		= render_area_thesaurus.prototype.edit
	area_thesaurus.prototype.list 		= render_area_thesaurus.prototype.list

