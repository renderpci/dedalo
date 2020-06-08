/*global get_label, page_globals, SHOW_DEBUG*/
/*eslint no-undef: "error"*/



// imports
	// import {event_manager} from '../../common/js/event_manager.js'
	// import {data_manager} from '../../common/js/data_manager.js'
	// import * as instances from '../../common/js/instances.js'
	// import {create_source} from '../../common/js/common.js'
	// import {ui} from '../../common/js/ui.js'



export const widget_common = function(){

	return true
}//end widget_common



/**
* INIT
* Common init prototype to use in components as default
* @return bool true
*/
widget_common.prototype.init = async function(options) {

	const self = this

	// set vars
		self.id				= options.id
		self.section_tipo	= options.section_tipo
		self.section_id		= options.section_id
		self.lang			= options.lang
		self.mode			= options.mode
		self.value			= options.value
		self.datalist		= options.datalist
		self.ipo			= options.ipo

	// status update
		self.status = 'initiated'


	return true
}//end init
