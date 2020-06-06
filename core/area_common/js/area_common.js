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
}//end area_common



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

	self.rq_context 		= options.rq_context 	|| null

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


	// source. add to rq_context if not exists. Be careful not to add a source element twice
	// (!) VERIFICAR QUE REALMENTE HACE FALTA
		// if (self.rq_context && self.rq_context.show) {
		// 	const current_source = self.rq_context.show.find(element => element.typo==='source')
		// 	if (current_source) {
		// 		console.warn("Source alredy exists. Skipped source creation for rq_context",current_source)
		// 	}else{
		// 		const source = create_source(self,'get_data')
		// 		self.rq_context.show.push(source)
		// 		if(SHOW_DEBUG===true) {
		// 			console.warn("Added created 'source' element to rq_context.show on init section",source)
		// 		}
		// 	}
		// }

		// // area basic context
		// 	const source_context = {
		// 		model 			: self.model,
		// 		tipo  			: self.tipo,
		// 		lang  			: self.lang,
		// 		mode  			: self.mode,
		// 		action 			: 'get_data',
		// 		typo 			: 'source',
		// 		build_options 	: self.build_options
		// 	}
		// 	const rq_context = [source_context]


	// events subscription


	// status update
		self.status = 'inited'


	return true
}//end init



/**
* BUILD
* @return promise
*	bool true
*/
area_common.prototype.build___DES = async function() {
	// const t0 = performance.now()

	// const self = this

	// // status update
	// 	self.status = 'building'


	// // build_options. Add custom area build_options to source
	// 	const source = self.rq_context.show.find(element => element.typo==='source')
	// 		  source.build_options = self.build_options

	// // load data
	// 	const current_data_manager = new data_manager()

	// // get context and data
	// 		console.log("self.rq_context.show:",self.rq_context.show);
	// 	const api_response 	= await current_data_manager.section_load_data(self.rq_context.show)
	// 		console.log("[area_common.build] api_response++++:",api_response);

	// // set the result to the datum
	// 	self.datum = api_response.result

	// // set context and data to current instance
	// 	self.context	= self.datum.context.filter(element => element.tipo===self.tipo)
	// 	self.data 		= self.datum.data.filter(element => element.tipo===self.tipo)
	// 	self.widgets 	= self.datum.context.filter(element => element.parent===self.tipo && element.typo==='widget')

	// 	const area_ddo	= self.context.find(element => element.type==='area')
	// 	self.label 		= area_ddo.label

	// // permissions. calculate and set (used by section records later)
	// 	self.permissions = area_ddo.permissions || 0

	// // section tipo
	// 	self.section_tipo = area_ddo.section_tipo || null

	// // debug
	// 	if(SHOW_DEBUG===true) {
	// 		//console.log("self.context section_group:",self.datum.context.filter(el => el.model==='section_group'));
	// 		console.log("+ Time to build", self.model, " ms:", performance.now()-t0);
	// 		//load_section_data_debug(self.section_tipo, self.rq_context, load_section_data_promise)
	// 	}

	// // status update
	// 	self.status = 'builded'


	// return true
}//end build
