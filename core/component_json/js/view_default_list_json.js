// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, JSONEditor */
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'



/**
* VIEW_DEFAULT_LIST_JSON
* Manage the components logic and appearance in client side
*/
export const view_default_list_json = function() {

	return true
}//end view_default_list_json



/**
* RENDER
* Render node for use in this view
* @return HTMLElement wrapper
*/
view_default_list_json.render = async function(self, options) {

	// value_string
		const value_string = get_value_string(self)

	// wrapper
		const wrapper = ui.component.build_wrapper_list(self, {
			// value_string : value_string
		})
		if (self.show_interface.read_only!==true) {
			wrapper.addEventListener('click', function(e){
				e.stopPropagation()

				// modal way
					// lang. Use lang from data instead from context because the problem with component_text_area context lang
					const lang = self.data && self.data.lang
						? self.data.lang
						: self.lang
					// modal
					ui.render_edit_modal({
						self		: self,
						e			: e,
						lang		: lang, // to use in new instance
						callback	: (dd_modal) => {
							dd_modal.modal_content.style.width = '90%'

							dd_modal.on_close = () => {
								// refresh whole component
								self.refresh({
									autoload : false
								})
							}
						}
					})
			})
		}

	// content_data
		const content_data = document.createElement('div')
			  content_data.classList.add('content_data', self.mode, self.type)
			  wrapper.appendChild(content_data)
			  // set pointers
			  wrapper.content_data = content_data

	// value
		ui.create_dom_element({
			element_type	: 'span',
			inner_html		: value_string,
			parent			: content_data
		})


	return wrapper
}//end render



/**
* GET_VALUE_STRING
* Get component value as limited length string for list mode uses
* @return string value_string
*/
export const get_value_string = function(self) {

	// short vars
		const data	= self.data
		const value	= data.value || []

	// value_string Activity. Moved to view 'collapse' (view_collapse_list_json)
		// if(self.section_tipo==='dd542'){
		// 	// activity section case
		// 	const ar_values	= []
		// 	const value_len	= value.length
		// 	for (let i = 0; i < value_len; i++) {
		// 		const value_map = new Map(Object.entries(value[i]))
		// 		for (let [key, value] of value_map) {
		// 			ar_values.push( key + ': ' + value )
		// 		}
		// 	}
		// 	const value_string = ar_values.join('<br>')
		// 	return value_string
		// }

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
