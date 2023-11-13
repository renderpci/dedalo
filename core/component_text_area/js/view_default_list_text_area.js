// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'
	// import {tr} from '../../common/js/tr.js'
	import {get_fallback_value} from '../../common/js/common.js'
	import * as instances from '../../common/js/instances.js'
	// import {service_tinymce} from '../../services/service_tinymce/js/service_tinymce.js'
	// import {event_manager} from '../../common/js/event_manager.js'
	// import {clone,dd_console} from '../../common/js/utils/index.js'



/**
* VIEW_DEFAULT_LIST_TEXT_AREA
* Manage the components logic and appearance in client side
*/
export const view_default_list_text_area = function() {

	return true
}//end view_default_list_text_area



/**
* RENDER
* Render node for use in list
* @param object self
* @param object options
* @return HTMLElement wrapper
*/
view_default_list_text_area.render = async function(self, options) {

	// short vars
		const data				= self.data
		const value				= data.value || []
		const fallback_value	= data.fallback_value || []
		const fallback			= get_fallback_value(value, fallback_value)
		const value_string		= fallback.join(self.context.fields_separator)

	// wrapper
		const wrapper = ui.component.build_wrapper_list(self, {
			// value_string : value_string
		})
		if (self.show_interface.read_only!==true) {
			wrapper.addEventListener('click', function(e){
				e.stopPropagation()
				/**
				 * @todo Working here to allow inline editor
				 * */
				// modal
				render_edit_modal(self)
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
* RENDER_EDIT_MODAL
* Creates a modal container where place a new component instance in edit mode
* @param object self
* @return HTMLElement modal_node
*/
const render_edit_modal = async function(self) {

	// lang. Use lang from data instead from context because the problem with component_text_area context lang
		const lang = self.data && self.data.lang
			? self.data.lang
			: self.lang
		console.log('lang:', lang);

	// header
		const header = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'header'
		})
		// header_label_node
		const header_label_node = ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'label',
			inner_html		: (get_label.edit || 'Edit') + ' ' + self.label + ' - ID: ' + self.section_id,
			parent			: header
		})

	// body
		const body = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'body content'
		})
		// component instance
		const instance = await instances.get_instance({
			model			: self.model,
			tipo			: self.tipo,
			section_tipo	: self.section_tipo || self.tipo,
			section_id		: self.section_id,
			mode			: 'edit',
			view			: null, // self.view || self.context?.view || null, // 'default',
			lang			: lang
		})
		instance.auto_init_editor = true
		await instance.build(true)
		const node = await instance.render()
		body.appendChild(node)
		ui.component.activate(instance)

	// footer
		const footer = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'footer content distribute'
		})

	const modal_node = ui.attach_to_modal({
		header	: header,
		body	: body,
		footer	: footer,
		on_close : () => {
			// force to preserve the editing language (can be different from the language in list mode)
			self.lang = lang
			// refresh whole component
			self.refresh({
				autoload : false
			})
		}
		// size	: 'normal' // string size big|normal|small
	})


	return modal_node
}//end render_edit_modal



// @license-end
