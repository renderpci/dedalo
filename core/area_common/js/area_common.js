/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../common/js/event_manager.js'
	import {data_manager} from '../../common/js/data_manager.js'
	import * as instances from '../../common/js/instances.js'
	import {common} from '../../common/js/common.js'
	import {ui} from '../../common/js/ui.js'



/**
* AREA_COMMON
*/
export const area_common = function() {
	
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

	this.id_variant

	return true
};//end area_common



/**
* INIT
* @return bool
*/
area_common.prototype.init = async function(options) {

	const self = this

	// instance key used vars
	self.model 				= options.model
	self.tipo 				= options.tipo
	self.section_tipo 		= options.section_tipo || self.tipo
	self.mode 				= options.mode
	self.lang 				= options.lang

	// DOM
	self.node 				= []

	self.parent 			= options.parent

	self.events_tokens		= []
	self.ar_instances		= []

	// dd request
	self.dd_request			= {
		show	: null,
		search	: null,
		select	: null
	}

	self.datum 	 			= options.datum   		|| null
	self.context 			= options.context 		|| null
	self.data 	 			= options.data 	  		|| null
	self.pagination 		= { // pagination info
		total : 0,
		offset: 0
	}

	self.type 				= 'area'
	self.label 				= null

	self.widgets 	 		= options.widgets 	  	|| null
	self.permissions 		= options.permissions 	|| null



	// events subscription


	// status update
		self.status = 'initiated'


	return true
};//end init
