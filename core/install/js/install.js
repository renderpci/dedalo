// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
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
	install.prototype.render	= common.prototype.render
	install.prototype.install	= render_install.prototype.render
	install.prototype.list		= render_install.prototype.render
	install.prototype.edit		= render_install.prototype.render
	install.prototype.destroy	= common.prototype.destroy
	install.prototype.refresh	= common.prototype.refresh



/**
* INIT
* @return bool
*/
install.prototype.init = async function(options) {

	const self = this

	// safe init double control. To detect duplicated events cases
		if (typeof this.is_init!=='undefined') {
			console.error('Duplicated init for element:', this);
			if(SHOW_DEBUG===true) {
				alert('Duplicated init element');
			}
			return false
		}
		this.is_init = true

	// status update
		self.status = 'initializing'

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
		self.status = 'initialized'


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

			// rqo build.
			// Note that get_install_context does not need a previous login action as similar call get_element_context
				const rqo = {
					action	: 'get_install_context',
					dd_api	: 'dd_utils_api',
					source	: create_source(self, null)
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



// @license-end
