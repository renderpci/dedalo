// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/* global get_label, page_globals, SHOW_DEBUG, flatpickr */
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'
	import {view_default_edit_image} from './view_default_edit_image.js'
	import {view_mini_image} from './view_mini_image.js'
	import {view_viewer_image} from './view_viewer_image.js'



/**
* RENDER_EDIT_COMPONENT_image
* Manage the components logic and appearance in client side
*/
export const render_edit_component_image = function() {

	return true
}//end render_edit_component_image



/**
* EDIT
* Render node for use in edit
* @param object options
* @return HTMLElement wrapper
*/
render_edit_component_image.prototype.edit = async function(options) {

	const self = this

	// view
		const view = self.view || 'default'

	switch(view) {

		case 'viewer':
			return view_viewer_image.render(self, options)

		case 'mini':
			return view_mini_image.render(self, options)

		case 'print':
			// view print use the same view as default, except it will use read only to render content_value
			// as different view as default it will set in the class of the wrapper
			// sample: <div class="wrapper_component component_input_text oh14 oh1_oh14 edit view_print disabled_component">...</div>
			// take account that to change the css when the component will render in print context
			// for print we need to use read of the content_value and it's necessary force permissions to use read only element render
			self.permissions = 1

		case 'line':
		case 'default':
		default:
			return view_default_edit_image.render(self, options)
	}
}//end edit



/**
* GET_QUALITY_SELECTOR
* @param object self
* @return HTMLElement quality_selector
*/
export const get_quality_selector = (self) => {

	// short vars
		const data			= self.data || {}
		const value			= data.value || []
		const files_info	= value[0] && value[0].files_info
			? value[0].files_info
			: []
		const quality		= self.quality || self.context.features.quality
		const extension		= self.context.features.extension

	const fragment = new DocumentFragment()

	// create the quality selector
		const quality_selector = ui.create_dom_element({
			element_type	: 'select',
			class_name		: 'quality_selector',
			parent			: fragment
		})
		quality_selector.addEventListener('mousedown', function(e) {
			e.stopPropagation()
		})
		quality_selector.addEventListener('click', function(e) {
			e.stopPropagation()
		})
		quality_selector.addEventListener('change', (e) =>{
			const img_src = e.target.value
			event_manager.publish('image_quality_change_'+self.id, img_src)
		})

		const quality_list	= files_info.filter(el => el.file_exist===true && el.extension===extension)

		const ar_resolved = []
		const quality_list_len	= quality_list.length
		for (let i = 0; i < quality_list_len; i++) {

			const file_info = quality_list[i]
			if (ar_resolved.find(el => el===file_info.quality)) {
				if(SHOW_DEBUG===true) {
					console.log('Skip quality already resolved:', file_info.quality, ar_resolved);
				}
				continue
			}

			// create the node with the all qualities sent by server
			const url = file_info
				? DEDALO_MEDIA_URL + file_info.file_path + '?t=' + (new Date()).getTime()
				: null

			const select_option = ui.create_dom_element({
				element_type	: 'option',
				value			: url,
				text_node		: quality_list[i].quality,
				parent			: quality_selector
			})
			//set the default quality_list to config variable dedalo_image_quality_default
			select_option.selected = quality_list[i].quality===quality ? true : false

			ar_resolved.push(file_info.quality)
		}


	return quality_selector
}//end get_quality_selector



// @license-end
