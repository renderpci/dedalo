// imports
	import {common} from '../../common/js/common.js'
	import {data_manager} from '../../common/js/data_manager.js'
	import event_manager from '../../page/js/page.js'
	import * as instances from '../../common/js/instances.js'
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
	self.mode 				= options.mode
	self.lang 				= options.lang

	// DOM
	self.node 				= []

	self.parent 			= options.parent

	self.events_tokens		= []
	self.ar_instances		= []
	//self.sqo_context		= options.sqo_context 	|| null

	self.datum 	 			= options.datum   		|| null
	self.context 			= options.context 		|| null
	self.data 	 			= options.data 	  		|| null

	self.widgets 	 		= options.widgets 	  	|| null

	self.type 				= 'area'
	self.label 				= null

	// events subscription
		// area_rendered
			self.events_tokens.push(
				event_manager.subscribe('area_rendered', (active_area) => {
					const debug = document.getElementById("debug")
						  debug.classList.remove("hide")
				})
			)

	// status update
		self.status = 'inited'


	return true
}//end init



/**
* BUILD
* @return promise
*	bool true
*/
area_common.prototype.build = async function() {
	const t0 = performance.now()

	const self = this

	// status update
		self.status = 'building'

	// area basic context
		const source_context = {
			model 	: self.model,
			tipo  	: self.tipo,
			lang  	: self.lang,
			mode  	: self.mode,
			action 	: 'get_data',
			typo 	: 'source'
		}

		const sqo_context = [source_context]

	// load data
		const current_data_manager = new data_manager()

	// get context and data
		const api_response 	= await current_data_manager.section_load_data(sqo_context)
			console.log("[area_common.build] api_response++++:",api_response);

	// set the result to the datum
		self.datum = api_response.result

	// set context and data to current instance
		self.context	= self.datum.context.filter(element => element.tipo===self.tipo)
		self.data 		= self.datum.data.filter(element => element.tipo===self.tipo)
		self.widgets 	= self.datum.context.filter(element => element.parent===self.tipo && element.typo==='widget')

	// debug
		if(SHOW_DEBUG===true) {
			//console.log("self.context section_group:",self.datum.context.filter(el => el.model==='section_group'));
			console.log("+ Time to build",self.model, ":", performance.now()-t0);
			//load_section_data_debug(self.section_tipo, self.sqo_context, load_section_data_promise)
		}

	// status update
		self.status = 'builded'

	return true
}//end build


