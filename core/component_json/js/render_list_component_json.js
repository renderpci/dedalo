/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, JSONEditor */
/*eslint no-undef: "error"*/



// imports
	// import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'



/**
* render_list_component_json
* Manage the components logic and appearance in client side
*/
export const render_list_component_json = function() {

	return true
}//end render_list_component_json



/**
* LIST
* Render node for use in list
* @return DOM node
*/
render_list_component_json.prototype.list = function() {

	const self = this

	// value_string
		const value_string = get_value_string(self)

	// wrapper
		const wrapper = ui.component.build_wrapper_list(self, {
			value_string : value_string
		})


	return wrapper
}//end list



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
		if(self.section_tipo==='dd542'){

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
