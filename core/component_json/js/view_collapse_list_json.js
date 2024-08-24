// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, JSONEditor */
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'



/**
* VIEW_COLLAPSE_LIST_JSON
* Manage the components logic and appearance in client side
*/
export const view_collapse_list_json = function() {

	return true
}//end view_collapse_list_json



/**
* RENDER
* Render node for use in this view
* @param object self
* @param object options
* @return HTMLElement wrapper
*/
view_collapse_list_json.render = async function(self, options) {

	// value_string
		const value_string = get_value_string(self)

	// wrapper
		const wrapper = ui.component.build_wrapper_list(self, {
			value_string : value_string
		})
		wrapper.classList.add('collapsed')
		wrapper.addEventListener('click', function(e) {
			e.stopPropagation()
			wrapper.classList.toggle('collapsed')

			// propagate to siblings
				const section_record = wrapper.parentNode.parentNode
				const elements_collapsed = section_record.querySelectorAll('.view_collapse')
				const elements_collapsed_length = elements_collapsed.length
				for (let i = 0; i < elements_collapsed_length; i++) {
					const item = elements_collapsed[i]
					if (item!==wrapper) {
						item.classList.toggle('collapsed')
					}
				}
		})


	return wrapper
}//end render



/**
* GET_VALUE_STRING
* Get component value as string
* @return string value_string
*/
export const get_value_string = function(self) {

	// short vars
		const data	= self.data
		const value	= data.value || []

	// value_string
		// dd542 Activity section case
		if(self.section_tipo==='dd542') {
			// activity section case
			const ar_values	= []
			const value_len	= value.length
			for (let i = 0; i < value_len; i++) {
				const value_map = new Map(Object.entries(value[i]))
				for (let [key, value] of value_map) {
					ar_values.push( key + ': ' + value )
				}
			}
			const value_string = ar_values.join('<br>')

			return value_string
		}

	// default cases
		const list_show_key = typeof self.context.properties!=='undefined'
			? self.context.properties.list_show_key
			: 'msg'

		const value_string = value[0] && (typeof value[0][list_show_key]!=='undefined')
			? value[0][list_show_key]
			: value[0]
				? JSON.stringify(value).substring(0,100)+' ...'
				: ''


	return value_string
}//end get_value_string



// @license-end
