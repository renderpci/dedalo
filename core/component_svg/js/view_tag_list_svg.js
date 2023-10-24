// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	// import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'
	// import {view_mini_list_svg} from './view_mini_list_svg.js'



/**
* VIEW_TAG_LIST_SVG
* Manage the components logic and appearance in client side
*/
export const view_tag_list_svg = function() {

	return true
}//end view_tag_list_svg



/**
* RENDER
* Render node for use in list
* @param object self
* @param object options
* @return HTMLElement wrapper
*/
view_tag_list_svg.render = function(self, options) {

	// short vars
		const data				= self.data || {}
		const value				= data.value || [] // value is a files_info list
		const files_info		= value
		const external_source	= data.external_source
		const quality			= self.quality || self.context.features.quality

	// wrapper
		const wrapper = ui.component.build_wrapper_list(self, {})

	// svg elements
		const inputs_value	= value // force one empty input at least
		const value_length = inputs_value.length || 1
		for (let i = 0; i < value_length; i++) {

			// media url from files_info based on selected context quality
				const file_info	= files_info.find(el => el.quality===quality)
				const url		= file_info
					? DEDALO_MEDIA_URL + file_info.file_path + '?t=' + (new Date()).getTime()
					: page_globals.fallback_image

			// convert the data_tag to string to be used it in html
			// replace the " to ' to be compatible with the dataset of html5, the tag strore his data ref inside the data-data html
			// json use " but it's not compatible with the data-data storage in html5
				const data_string = JSON.stringify({
					section_tipo	: self.section_tipo,
					section_id		: self.section_id,
					component_tipo	: self.tipo
				}).replace(/"/g, '\'')

			// image node
				const image	= ui.create_dom_element({
					element_type	: 'img',
					src				: url,
					class_name		: 'svg',
					dataset			:{
						tag_id	: 1,
						type	: 'svg',
						state	: 'n',
						data	: data_string
					},
					parent			: wrapper
				})
		}//end for (let i = 0; i < value_length; i++)


	return wrapper
}//end render



// @license-end
