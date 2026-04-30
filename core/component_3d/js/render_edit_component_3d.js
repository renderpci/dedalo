// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global DEDALO_MEDIA_URL */
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'
	import {view_default_edit_3d} from './view_default_edit_3d.js'



/**
* RENDER_EDIT_COMPONENT_3D
* Manages the component's logic and appearance in client side
*/
export const render_edit_component_3d = function() {

	return true
}//end render_edit_component_3d



/**
* EDIT
* Render node for use in modes: edit
* @param object options
* @return HTMLElement wrapper
*/
render_edit_component_3d.prototype.edit = async function(options) {

	const self = this

	// view
		const view = self.context.view || 'default'

	switch(view) {

		case 'print':
			// for print we need to use read of the content_value and it's necessary force permissions to use read only element render
			self.permissions = 1;

		case 'line':
		case 'default':
		default:
			return view_default_edit_3d.render(self, options)
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
		const entries		= data.entries || []
		const files_info	= entries[0] && entries[0].files_info
			? entries[0].files_info
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
			const file_url = e.target.value
			event_manager.publish('3d_quality_change_'+self.id, file_url)
		})

		const quality_list		= files_info.filter(el => el.file_exist===true && el.extension===extension)
		const quality_list_len	= quality_list.length
		for (let i = 0; i < quality_list_len; i++) {

			const file_info = quality_list[i]

			// create the node with the all qualities sent by server
			const url = DEDALO_MEDIA_URL + file_info.file_path + '?t=' + (new Date()).getTime()

			const select_option = ui.create_dom_element({
				element_type	: 'option',
				value			: url,
				text_node		: quality_list[i].quality,
				parent			: quality_selector
			})
			//set the default quality_list to config variable dedalo_image_quality_default
			select_option.selected = quality_list[i].quality===quality ? true : false
		}


	return quality_selector
}//end get_quality_selector



// @license-end
