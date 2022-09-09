/*global get_label, page_globals, SHOW_DEBUG*/
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../common/js/event_manager.js'
	// import {data_manager} from '../../common/js/data_manager.js'
	// import {get_instance} from '../../common/js/instances.js'
	import {ui} from '../../common/js/ui.js'
	import {render_edit_view_default} from './render_edit_view_default.js'
	import {render_view_text} from './render_view_text.js'
	import {render_view_mini} from './render_view_mini.js'



/**
* RENDER_EDIT_SECTION_RECORD
* Manage the components logic and appearance in client side
*/
export const render_edit_section_record = function() {

	return true
}//end render_edit_section_record



/**
* EDIT
* Render the node to use in edit mode
* @param object options
* @return DOM node
*/
render_edit_section_record.prototype.edit = async function(options={}) {

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
			return render_edit_view_default.render(self, options)
	}

	return null
}//end edit

