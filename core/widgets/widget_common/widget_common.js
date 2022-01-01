/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL */
/*eslint no-undef: "error"*/



// imports
	// import {event_manager} from '../../common/js/event_manager.js'
	// import {data_manager} from '../../common/js/data_manager.js'
	// import * as instances from '../../common/js/instances.js'
	import {common} from '../../common/js/common.js'
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
		self.name			= options.name
		self.properties		= options.properties

	// status update
		self.status = 'initiated'


	return true
}//end init



/**
* BUILD
* Generic widget build function. Load css files
* @param bool autoload
* @return promise bool
*/
widget_common.prototype.build = async function(autoload=false) {

	const self = this

	// status update
		self.status = 'building'

	// load self style
		const tool_css_url = DEDALO_CORE_URL + '/widgets/' + self.name + "/css/" + self.name + ".css"
		common.prototype.load_style(tool_css_url) // returns promise

	// autoload
		if (autoload===true) {
			// nothing to do now
		}

	// status update
		self.status = 'builded'


	return true
};//end build


