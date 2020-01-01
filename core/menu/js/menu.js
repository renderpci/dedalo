/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {common} from '../../common/js/common.js'
	import {render_menu} from './render_menu.js'



export const menu = function(){

	this.id
	this.mode
	this.model
	this.lang

	this.section_lang
	this.datum
	this.context
	this.data
	this.node
	this.li_nodes
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

	self.datum 			= options.datum
	self.model 			= options.model
	self.node 			= []
	self.li_nodes 		= []
	self.ar_instances 	= []
	self.mode 			= 'edit'
	self.context 		= self.datum.context
	self.data 			= self.datum.data[0]
	self.events_tokens 	= []

	// status update
		self.status = 'initied'

	return true
}




/**
* BUILD
* @return bool true
*/
menu.prototype.build = async function(){

	const self = this

	// status update
		self.status = 'builded'

	if(SHOW_DEBUG===true) {
		//console.log("paginator [build] self:",self);
	}


	return true
}//end build
