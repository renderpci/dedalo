// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'
	import {tr} from '../../common/js/tr.js'
	import {get_fallback_value} from '../../common/js/common.js'


/**
* VIEW_MINI_TEXT_AREA
* Manage the components logic and appearance in client side
*/
export const view_mini_text_area = function() {

	return true
}//end view_mini_text_area



/**
* RENDER
* Render node to be used by service autocomplete or any datalist
* @return HTMLElement wrapper
*/
view_mini_text_area.render = async function(self, options) {

	// short vars
		const data	= self.data
		const value	= data.value || []

	// fallback
		const fallback_value	= data.fallback_value || []
		const fallback			= get_fallback_value(value, fallback_value)


	// Value as string
		const value_string = tr.add_tag_img_on_the_fly( fallback.join(self.context.fields_separator) )

	// wrapper
		const wrapper = ui.component.build_wrapper_mini(self, {
			value_string : value_string
		})


	return wrapper
}//end render



// @license-end
