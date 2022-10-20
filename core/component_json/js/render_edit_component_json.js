/* global get_label, page_globals, SHOW_DEBUG, flatpickr */
/*eslint no-undef: "error"*/



// imports
	import {view_default_edit_json} from './view_default_edit_json.js'
	import {view_mini_json} from './view_mini_json.js'


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

		case 'default':
		default:
			return view_default_edit_json.render(self, options)
	}


	return null
}//end edit



/**
* ON_CHANGE
*/
export const on_change = function(self, editor) {

	const editor_wrapper	= editor.frame
	const button_save		= editor_wrapper.previousElementSibling
	const db_value			= typeof self.data.value[0]!=="undefined" ? self.data.value[0] : null

	button_save.classList.add("warning")
	editor_wrapper.classList.add("isDirty")

	try {
		const edited_value 	= editor.get()

		if (typeof edited_value!=="undefined") {

			const changed = JSON.stringify(db_value)!==JSON.stringify(edited_value)
			if (changed) {

				editor_wrapper.classList.add("isDirty")
				button_save.classList.add("warning")

				// set_before_unload (bool) add
					set_before_unload(true)
			}else{

				if (editor_wrapper.classList.contains("isDirty")) {
					editor_wrapper.classList.remove("isDirty")
					button_save.classList.remove("warning")
				}

				// set_before_unload (bool) remove
					set_before_unload(false)
			}
		}

	}catch(error){
		// console.log("error:",error);
		editor_wrapper.classList.add("isDirty")
	}


	return true
}//end on_change

