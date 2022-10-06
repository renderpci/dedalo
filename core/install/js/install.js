/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {data_manager} from '../../common/js/data_manager.js'
	import {common,create_source} from '../../common/js/common.js'
	import {render_install} from './render_install.js'



/**
* INSTALL
*/
export const install = function() {

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

	this.node
	this.ar_instances = []

	this.status

	return true
}//end install



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	install.prototype.install	= render_install.prototype.install
	install.prototype.render	= common.prototype.render
	install.prototype.destroy	= common.prototype.destroy
	install.prototype.refresh	= common.prototype.refresh



/**
* INIT
* @return bool
*/
install.prototype.init = async function(options) {

	const self = this

	// instance key used vars
	self.model			= options.model
	self.tipo			= options.tipo
	self.mode			= options.mode
	self.lang			= options.lang

	// DOM
	self.node			= null

	self.events_tokens	= []
	self.context		= options.context	|| null
	self.data			= options.data		|| null
	self.datum			= options.datum		|| null

	self.type			= 'install'
	self.label			= null


	// status update
		self.status = 'initiated'


	return true
}//end init



/**
* BUILD
* @param bool autoload = true
* @return promise
*	bool true
*/
install.prototype.build = async function(autoload=false) {

	const self = this

	// status update
		self.status = 'building'

	// autoload
		if (autoload===true) {

			// rqo build
				const rqo = {
					action : 'get_element_context',
					source : create_source(self, null)
				}

			// load data. get context and data
				const api_response = await data_manager.request({
					body : rqo
				})

			// set context and data to current instance
				self.context	= api_response.result.find(element => element.model===self.model);
				self.data		= {}
		}

	// debug
		if(SHOW_DEBUG===true) {
			//console.log("self.context section_group:",self.datum.context.filter(el => el.model==='section_group'));
			// console.log("__Time to build", self.model, " ms:", performance.now()-t0);
		}

	// status update
		self.status = 'built'


	return true
}//end build
