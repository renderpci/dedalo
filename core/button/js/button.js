// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {common} from '../../common/js/common.js'
	import {render_edit_button} from '../../button/js/render_edit_button.js'
	import {set_context_vars, create_source} from '../../common/js/common.js'
	import {render_list_button} from '../../button/js/render_list_button.js'



export const button = function(){

	this.id				= null

	// element properties declare
	this.model			= null
	this.tipo			= null
	this.section_tipo	= null
	this.section_id		= null
	this.mode			= null
	this.lang			= null

	this.section_lang	= null
	this.context		= null
	this.data			= null
	this.parent			= null
	this.node			= null

	this.tools			= null


	return true
}//end button



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	// lifecycle
	// button.prototype.init				= common.prototype.init
	// button.prototype.build				= common.prototype.build
	button.prototype.render					= common.prototype.render
	button.prototype.refresh				= common.prototype.refresh
	button.prototype.destroy				= common.prototype.destroy
	// button.prototype.events_subscription	= events_subscription

	// others
	button.prototype.build_rqo				= common.prototype.build_rqo

	// render
	button.prototype.edit					= render_edit_button.prototype.edit
	button.prototype.list					= render_list_button.prototype.list
	// button.prototype.search				= render_search_button.prototype.search



/**
* INIT
* @return promise bool
*/
button.prototype.init = async function(options) {
console.log('options:', options);
	const self = this

	// call the generic common tool init
		const common_init = await common.prototype.init.call(self, options);

	return common_init
}//end init



/**
* BUILD
* Set the main component properties.
* Could be from database context and data or injected by caller section, tools, etc.
* @param bool autoload = false
* @return object self
*/
button.prototype.build = async function(autoload=false){
	// const t0 = performance.now()

	const self = this

	// status update
		self.status = 'building'

	// self.datum. On building, if datum is not created, creation is needed
		self.datum = self.datum || {
			data	: [],
			context	: []
		}
		self.context	= self.context || {}
		self.data		= self.data || {}

	// update instance properties from context:
	// 	type, label, tools, value_separator, permissions
		set_context_vars(self, self.context)


	// status update
		self.status = 'built'


	return self
}//end component_common.prototype.build



// @license-end
