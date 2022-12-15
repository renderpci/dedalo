/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'
	import {tr} from '../../common/js/tr.js'
	// import {event_manager} from '../../common/js/event_manager.js'
	// import {service_tinymce} from '../../services/service_tinymce/js/service_tinymce.js'
	// import {clone,dd_console} from '../../common/js/utils/index.js'



/**
* VIEW_NOTE_TEXT_AREA
* Manage the components logic and appearance in client side
*/
export const view_note_text_area = function() {

	return true
}//end view_note_text_area



/**
* MINI
* Render node to be used by service autocomplete or any datalist
* @return DOM node
*/
view_note_text_area.render = async function(self, options) {

	// short vars
		const data			= self.data
		const value			= data.value || []
		const value_string	= tr.add_tag_img_on_the_fly( value.join(self.context.fields_separator) )

	// wrapper
		const wrapper = ui.create_dom_element({
			element_type	: 'div',
			class_name		: `wrapper_component ${self.model} ${self.mode} view_${self.view}`
		})

	// image_note
		const css = value.length===0 ? '' : ' green'
		const image_note = ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'button note' + css,
			parent			: wrapper
		})
		image_note.addEventListener('click', function(e) {
			e.stopPropagation()

			// modal. create new modal
				ui.attach_to_modal({
					header	: `Note ${self.section_tipo}-${self.section_id}`,
					body	: value_string || '...   Working here!   ...',
					footer	: null,
					size	: 'small'
				})
		})

	// add value
		wrapper.append(value_string)



	return wrapper
}//end render
