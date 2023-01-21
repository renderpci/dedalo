/* global get_label, page_globals, SHOW_DEBUG, flatpickr */
/*eslint no-undef: "error"*/



// imports
	import {view_default_edit_json} from './view_default_edit_json.js'
	import {view_mini_json} from './view_mini_json.js'
	import {view_text_json} from './view_text_json.js'



/**
* RENDER_EDIT_COMPONENT_JSON
* Manage the components logic and appearance in client side
*/
export const render_edit_component_json = function() {

	return true
}//end render_edit_component_json



/**
* EDIT
* Render node for use in edit
* @param object options
* @return DOM node
*/
render_edit_component_json.prototype.edit = async function(options) {

	const self = this

	// view
		const view	= self.context.view || 'default'

	switch(view) {

		case 'mini':
			return view_mini_json.render(self, options)

		case 'text':
			return view_text_json.render(self, options)

		case 'default':
		default:
			return view_default_edit_json.render(self, options)
	}


	return null
}//end edit



/**
* ON_CHANGE
*/
export const on_change = function(self, editor, json_string, key) {

	const value = json_string // JSON_parse_safely(json_string)

	// change data
		const changed_data_item = Object.freeze({
			action	: 'update',
			key		: key,
			value	: value
		})

	// fix instance changed_data
		const changed = self.set_changed_data(changed_data_item)

	return changed
}//end on_change
