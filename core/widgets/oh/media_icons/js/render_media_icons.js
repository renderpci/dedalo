/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL */
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../../../common/js/ui.js'
	import {event_manager} from '../../../../common/js/event_manager.js'
	import {open_tool} from '../../../../../tools/tool_common/js/tool_common.js'
	import {object_to_url_vars} from '../../../../common/js/utils/index.js'



/**
* RENDER_MEDIA_ICONS
* Manages the component's logic and appearance in client side
*/
export const render_media_icons = function() {

	return true
}//end render_media_icons



/**
* EDIT
* Render node for use in modes: edit, edit_in_list
* @return HTMLElement wrapper
*/
render_media_icons.prototype.edit = async function(options) {

	const self = this

	const render_level = options.render_level

	// content_data
		const content_data = await get_content_data_edit(self)
		if (render_level==='content') {
			return content_data
		}

	// wrapper. ui build_edit returns widget wrapper
		const wrapper = ui.widget.build_wrapper_edit(self, {
			content_data : content_data
		})


	return wrapper
}//end edit



/**
* LIST
* Render node for use in modes: list, list_in_list
* @return HTMLElement wrapper
*/
render_media_icons.prototype.list = async function(options) {

	const self = this

	const render_level = options.render_level

	// content_data
		const content_data = await get_content_data_edit(self)
		if (render_level==='content') {
			return content_data
		}

	// wrapper. ui build_list returns widget wrapper
		const wrapper = ui.widget.build_wrapper_edit(self, {
			content_data : content_data
		})


	return wrapper
}//end list



/**
* GET_CONTENT_DATA_EDIT
* @param object self
* @return HTMLElement content_data
*/
const get_content_data_edit = async function(self) {

	// DocumentFragment
		const fragment = new DocumentFragment()

	// values container
		const values_container = ui.create_dom_element({
			element_type	: 'ul',
			class_name 		: 'values_container',
			parent 			: fragment
		})

	// values
		const ipo			= self.ipo
		const ipo_length	= ipo.length
		const value			= self.value
		const value_length	= value.length
		for (let i = 0; i < value_length; i++) {

			const data_item = value[i]

			for (let i = 0; i < ipo_length; i++) {

				const current_ipo = ipo[i]

				const value_element_node = get_value_element(i, data_item, self, current_ipo)
				values_container.appendChild(value_element_node)
			}
		}

	// content_data
		const content_data = ui.create_dom_element({
			element_type : 'div'
		})
		content_data.appendChild(fragment)


	return content_data
}//end get_content_data_edit



/**
* GET_VALUE_ELEMENT
* @return HTMLElement li
*/
const get_value_element = (i, data, self, current_ipo) => {

	// li
		const li = ui.create_dom_element({
			element_type	: 'li',
			class_name		: 'widget_item media_icons'
		})

	// column_id
		const data_id = data.id // find(item => item.id==='id')
		const column_id_value = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'value id link',
			inner_html		: data_id.value,
			parent			: li
		})
		column_id_value.addEventListener('click', e => {
			e.stopPropagation();
			// event_manager
				// event_manager.publish('user_navigation', {
				// 	source : {
				// 		tipo		: data_id.locator.section_tipo,
				// 		section_id	: data_id.locator.section_id,
				// 		model		: 'section',
				// 		mode		: 'edit'
				// 	}
				// })
			// open a new window
				const url_vars = {
					tipo			: data_id.locator.section_tipo,
					section_tipo	: data_id.locator.section_id,
					id				: data_id.locator.section_id,
					mode			: 'edit',
					menu			: false
				}
				const width				= window.screen.width < 1350 ? window.screen.width : 1350;
				const height			= window.screen.height < 1024 ? window.screen.height : 1024;
				const url				= DEDALO_CORE_URL + '/page/?' + object_to_url_vars(url_vars)
				const current_window	= window.open(url, 'record_viewer', `width=${width},height=${height}`)
				current_window.focus()
		})

	// icon media
		const icon_media_node = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'value av link',
			parent			: li
		})
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'button file_av icon',
			parent			: icon_media_node
		})
		icon_media_node.addEventListener('click', e => {
			e.stopPropagation();

			const ipo_input_paths	= current_ipo.input.paths[0][0];
			const id_el				= data.id // find(el => el.id==='id')

			// open a new window
				const url_vars = {
					tipo			: ipo_input_paths.component_tipo,
					section_tipo	: ipo_input_paths.section_tipo,
					id				: id_el.value,
					mode			: 'edit',
					view			: 'viewer',
					menu			: false
				}
				const url				= DEDALO_CORE_URL + '/page/?' + object_to_url_vars(url_vars)
				const current_window	= window.open(url, 'av_viewer', 'width=1024,height=720')
				current_window.focus()
		})

	// transcription
		const data_transcription = data.transcription // find(item => item.id==='transcription')
		const transcription_value = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'value tr link',
			inner_html		: 'TR ',
			parent			: li
		})
		if(data_transcription.tool_context){
			transcription_value.addEventListener('click', e => {
				e.stopPropagation();

				const tool_context = data_transcription.tool_context

				// open_tool (tool_common)
				open_tool({
					tool_context	: tool_context,
					caller			: self.caller.caller.caller // section
				})
			})
		}

	// indexation
		const data_indexation = data.indexation // find(item => item.id==='indexation')
		const indexation_value = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'value in link',
			inner_html		: 'IN ',
			parent			: li
		})
		if(data_indexation.tool_context){
			indexation_value.addEventListener('click', e => {
				e.stopPropagation();

				const tool_context = data_indexation.tool_context

				// open_tool (tool_common)
				open_tool({
					tool_context	: tool_context,
					caller			: self.caller.caller.caller // section
				})
			})
		}

	// translation
		const data_translation = data.translation // find(item => item.id==='translation')
		const translation_value = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'value tl link',
			inner_html		: 'TL ',
			parent			: li
		})
		if(data_translation.tool_context){
			translation_value.addEventListener('click', e => {
				e.stopPropagation();

				const tool_context = data_translation.tool_context

				// open_tool (tool_common)
				open_tool({
					tool_context	: tool_context,
					caller			: self.caller.caller.caller // section
				})
			})
		}

	// time code
		const data_tc = data.tc //find(item => item.id==='tc')
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'value tc',
			inner_html		: data_tc.value || '',
			parent			: li
		})

	// DES
		// even manager model to use in other widgets_properties
		// this widget don't use it, because the info is not in the same section
		// than the components that changed our value
		// the user don't see the info and the imput componets at same time
		// self.events_tokens.push(
		// 	event_manager.subscribe('update_widget_value_'+i+'_'+self.id, (changed_data) =>{
		// 		media_weight_value.innerHTML 	= changed_data.find(item => item.id==='media_weight').value
		// 	})
		// )


	return li
}//end get_value_element