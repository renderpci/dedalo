// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../common/js/event_manager.js'



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
}//end area_common



/**
* INIT
* @param object options
* @return bool
*/
area_common.prototype.init = async function(options) {

	const self = this

	// instance key used vars
	self.model			= options.model
	self.tipo			= options.tipo
	self.section_tipo	= options.section_tipo || self.tipo
	self.mode			= options.mode
	self.lang			= options.lang
	self.properties		= options.properties

	// DOM
	self.node			= null

	self.parent			= options.parent

	self.events_tokens	= []
	self.ar_instances	= []

	self.caller			= options.caller || null

	// dd request
	self.dd_request		= {
		show	: null,
		search	: null,
		select	: null
	}

	self.datum		= options.datum   		|| null
	self.context	= options.context 		|| null
	self.data		= options.data 	  		|| null
	self.pagination	= { // pagination info
		total : 0,
		offset: 0
	}

	self.type	= 'area'
	self.label	= null

	self.widgets		= options.widgets 	  	|| null
	self.permissions	= options.permissions 	|| null


	// events subscription
		// render_ event
			const render_token = event_manager.subscribe('render_'+self.id, fn_render)
			self.events_tokens.push(render_token)
			function fn_render() {

				// menu label control
					const update_menu = (menu) => {

						// menu instance check. Get from caller page
						if (!menu) {
							if(SHOW_DEBUG===true) {
								console.log('menu is not available from area.');
							}
							return
						}

						// update_section_label
						menu.update_section_label({
							value					: self.label,
							mode					: self.mode,
							section_label_on_click	: null
						})
					}

				// call only for direct page created sections
					if (self.caller && self.caller.model==='page') {
						// menu. Get from caller page
						const menu_instance = self.caller && self.caller.ar_instances
							? self.caller.ar_instances.find(el => el.model==='menu')
							: null
						update_menu( menu_instance )
					}
			}

	// status update
		self.status = 'initialized'


	return true
}//end init



// @license-end
