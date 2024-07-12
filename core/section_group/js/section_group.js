// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG*/
/*eslint no-undef: "error"*/



// imports
	import {common} from '../../common/js/common.js'
	import {render_section_group} from './render_section_group.js'



/**
* SECTION_GROUP
*/
export const section_group = function(){

	this.id				= null

	// element properties declare
	this.model			= null
	this.tipo			= null
	this.section_tipo	= null
	this.section_id		= null
	this.mode			= null
	this.lang			= null

	this.context		= null
	this.parent			= null
	this.type			= null
	this.label			= null

	this.node			= null

	this.id_variant		= null
}//end section_group



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	section_group.prototype.build	= common.prototype.build
	section_group.prototype.render	= common.prototype.render
	section_group.prototype.destroy	= common.prototype.destroy
	section_group.prototype.list	= render_section_group.prototype.list
	section_group.prototype.edit	= render_section_group.prototype.edit



/**
* INIT
* @return bool true
*/
section_group.prototype.init = function(options) {

	const self = this

	self.model			= options.model
	self.tipo			= options.tipo
	self.section_tipo	= options.section_tipo
	self.section_id		= options.section_id
	self.mode			= options.mode
	self.lang			= options.lang

	self.context		= options.context || null
	self.parent			= options.parent
	self.type			= options.type
	self.events_tokens	= []
	self.ar_instances	= []

	self.node			= null

	self.label			= self.context.label


	return true
}//end init



// @license-end
