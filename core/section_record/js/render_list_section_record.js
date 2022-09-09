/*global get_label, page_globals, SHOW_DEBUG*/
/*eslint no-undef: "error"*/



// imports
	// import {event_manager} from '../../common/js/event_manager.js'
	// import {clone} from '../../common/js/utils/index.js'
	// import {data_manager} from '../../common/js/data_manager.js'
	// import {when_in_dom} from '../../common/js/events.js'
	import {ui} from '../../common/js/ui.js'
	// import {open_tool} from '../../../tools/tool_common/js/tool_common.js'
	import {render_list_view_default} from './render_list_view_default.js'
	import {render_view_mini} from './render_view_mini.js'
	import {render_view_text} from './render_view_text.js'


/**
* RENDER_LIST_SECTION_RECORD
* Manage the components logic and appearance in client side
*/
export const render_list_section_record = function() {

	return true
}//end render_list_section_record



/**
* LIST
* Render node for use in list with all columns and rendered components
* @param array ar_instances
* @return Promise DOM node wrapper
*/
render_list_section_record.prototype.list = async function(options={}) {

	const self = this

	// view
		const view	= self.context.view || 'default'

	switch(view) {

		case 'mini':
			return render_view_mini.render(self, options)

		case 'text':
			return render_view_text.render(self, options)

		case 'default':
		default:
			return render_list_view_default.render(self, options)
	}

	return null
}//end render_list_section_record.prototype.list

