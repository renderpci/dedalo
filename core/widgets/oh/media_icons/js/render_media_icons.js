/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../../../common/js/ui.js'
	import {event_manager} from '../../../../common/js/event_manager.js'



/**
* RENDER_media_icons
* Manages the component's logic and apperance in client side
*/
export const render_media_icons = function() {

	return true
}//end render_media_icons



/**
* EDIT
* Render node for use in modes: edit, edit_in_list
* @return DOM node wrapper
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
* EDIT
* Render node for use in modes: list, list_in_list
* @return DOM node wrapper
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
* @return DOM node content_data
*/
const get_content_data_edit = async function(self) {

	const fragment = new DocumentFragment()

	// values container
		const values_container = ui.create_dom_element({
			element_type	: 'ul',
			class_name 		: 'values_container',
			parent 			: fragment
		})

	// values
		const ipo 			= self.ipo
		const ipo_length 	= ipo.length

		for (let i = 0; i < ipo_length; i++) {
			const data 		= self.value.filter(item => item.key === i)
			get_value_element(i, data , values_container, self)
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
* @return DOM node li
*/
const get_value_element = (i, data, values_container, self) => {

	console.log("data:",data);
	// li
		const li = ui.create_dom_element({
			element_type	: 'li',
			class 			: 'media_icons',
			parent 			: values_container
		})

	//column_id
		const column_id = ui.create_dom_element({
			type 		: 'div',
			parent 		: li
		})
		// value
		const data_id = data.find(item => item.id === 'id')

		const column_id_value = ui.create_dom_element({
			type 		: 'span',
			class_name	: 'value',
			inner_html 	: data_id.value,
			parent 		: column_id
		})

		column_id_value.addEventListener("click", e => {
			event.stopPropagation();
			// event_manager
				event_manager.publish('user_navigation', {
					source : {
						tipo		: data_id.locator.section_tipo,
						section_id	: data_id.locator.section_id,
						model		: 'section',
						mode		: 'edit'
					}
				})

		})

	//transcription
		const transcription = ui.create_dom_element({
			type 		: 'div',
			parent 		: li
		})
		// value
		const data_transcription = data.find(item => item.id === 'transcription')
		const transcription_value = ui.create_dom_element({
			type 		: 'span',
			class_name	: 'value',
			inner_html 	: 'TR ',
			parent 		: transcription
		})
		if(data_transcription.tool_context){
			transcription_value.addEventListener("click", e => {
				event.stopPropagation();
				// event_manager
					event_manager.publish('user_navigation', {
						source : {
							tipo		: data_transcription.tool_context.section_tipo,
							section_id	: data_transcription.tool_context.section_id,
							model		: 'section',
							mode		: 'edit'
						}
					})
			})

		}


	//indexation
		const indexation = ui.create_dom_element({
			type 		: 'div',
			parent 		: li
		})
		// value
		const data_indexation = data.find(item => item.id === 'indexation')
		const indexation_value = ui.create_dom_element({
			type 		: 'span',
			class_name	: 'value',
			inner_html 	: 'IN ',
			parent 		: indexation
		})

		indexation_value.addEventListener("click", e => {
			event.stopPropagation();
			// event_manager
				event_manager.publish('load_tool', {
					tool_context	: data_indexation.tool_context
				})
		})

	//translation
		const translation = ui.create_dom_element({
			type 		: 'div',
			parent 		: li
		})
		// value
		const data_translation = data.find(item => item.id === 'translation')
		const translation_value = ui.create_dom_element({
			type 		: 'span',
			class_name	: 'value',
			inner_html 	: 'TL ',
			parent 		: translation
		})

		translation_value.addEventListener("click", e => {
			event.stopPropagation();
			// event_manager
				event_manager.publish('load_tool', {
					tool_context	: data_translation.tool_context
				})
		})


	//Time code
		const column_tc = ui.create_dom_element({
			type 		: 'div',
			parent 		: li
		})
		// value
		const data_tc = data.find(item => item.id === 'tc')

		const column_tc_value = ui.create_dom_element({
			type 		: 'span',
			class_name	: 'value',
			inner_html 	: data_tc.value,
			parent 		: column_tc
		})




		// even manager model to use in other widgets_properties
		// this widget don't use it, because the info is not in the same section
		// than the components that changed our value
		// the user don't see the info and the imput componets at same time
		// self.events_tokens.push(
		// 	event_manager.subscribe('update_widget_value_'+i+'_'+self.id, (changed_data) =>{

		// 		media_weight_value.innerHTML 	= changed_data.find(item => item.id === 'media_weight').value

		// 	})
		// )

	return li
}//end get_value_element
