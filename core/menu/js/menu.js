/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {common} from '../../common/js/common.js'
	import {data_manager} from '../../common/js/data_manager.js'
	import {render_menu} from './render_menu.js'



export const menu = function(){

	this.id
	this.tipo
	this.mode
	this.model
	this.lang

	this.section_lang
	this.datum
	this.context
	this.data
	this.node
	this.li_nodes
	this.ul_nodes
	this.events_tokens

	this.ar_instances

	return true
}//end menu



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	// lifecycle
	menu.prototype.render 		= common.prototype.render
	menu.prototype.destroy 		= common.prototype.destroy
	menu.prototype.refresh 		= common.prototype.refresh

	// render
	menu.prototype.list 		= render_menu.prototype.list
	menu.prototype.edit 		= render_menu.prototype.edit



/**
* INIT
* @return bool true
*/
menu.prototype.init = function(options) {

	const self = this

	self.tipo 			= options.tipo
	self.model 			= options.model
	self.node 			= []
	self.li_nodes 		= []
	self.ul_nodes 		= []
	self.ar_instances 	= []
	self.mode 			= 'edit'
	self.rq_context 	= options.rq_context
	self.datum 			= options.datum
	self.context 		= options.context
	self.data 			= options.data
	self.events_tokens 	= []

	// status update
		self.status = 'initiated'

	return true
}//end init



/**
* BUILD
* @return bool true
*/
menu.prototype.build = async function(autoload=true){
	const t0 = performance.now()

	const self = this

	// status update
		self.status = 'building'


	if (autoload===true) {

		// load data
			const current_data_manager = new data_manager()

		// get context and data
			const api_response 	= await current_data_manager.get_menu(self.rq_context)
			console.log("menu build api_response", api_response);

		// set the result to the datum
			self.datum = api_response.result
	}

	// set context and data to current instance
		self.context	= self.datum.context.find(element => element.model===self.model && element.tipo===self.tipo);
		self.data		= self.datum.data.find(element => element.model===self.model &&  element.tipo===self.tipo)

	// debug
		if(SHOW_DEBUG===true) {
			//console.log("self.context section_group:",self.datum.context.filter(el => el.model==='section_group'));
			console.log("__Time to build", self.model, " ms:", performance.now()-t0);
			//load_section_data_debug(self.section_tipo, self.rq_context, load_section_data_promise)
		}

	// status update
		self.status = 'builded'


	return true
}//end build
