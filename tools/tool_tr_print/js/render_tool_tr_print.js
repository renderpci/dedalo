/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../../core/common/js/event_manager.js'
	import {ui} from '../../../core/common/js/ui.js'
	import {keyboard_codes} from '../../../core/common/js/utils/keyboard.js'
	import {render_node_info} from '../../../core/common/js/utils/notifications.js'
	// import {clone, dd_console} from '../../../core/common/js/utils/index.js'


/**
* RENDER_TOOL_TRANSCRIPTION
* Manages the component's logic and apperance in client side
*/
export const render_tool_tr_print = function() {

	return true
};//end render_tool_tr_print



/**
* EDIT
* Render node
* @return DOM node
*/
render_tool_tr_print.prototype.edit = async function(options={render_level:'full'}) {

	const self = this

	// render level
		const render_level = options.render_level || 'full'

	// content_data
		const content_data = await get_content_data_edit(self)
		if (render_level==='content') {
			return content_data
		}

	// wrapper. ui build_edit returns component wrapper
		const wrapper = ui.tool.build_wrapper_edit(self, {
			content_data : content_data
		})

	// transcription_options are the buttons to get access to other tools (buttons in the header)
		const tanscription_options = await render_tanscription_options(self, content_data)
		wrapper.tool_buttons_container.appendChild(tanscription_options)

	// render_activity_info are the information of the activity as "Save"
		const activity_info = render_activity_info(self)
		wrapper.activity_info_container.appendChild(activity_info)


	return wrapper
};//end render_tool_tr_print



/**
* GET_CONTENT_DATA_EDIT
* @return DOM node content_data
*/
const get_content_data_edit = async function(self) {

	const fragment = new DocumentFragment()

	// left_container
		const left_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'left_container',
			parent			: fragment
		})

	// right_container
		const right_container = ui.create_dom_element({
			element_type	: 'div',
			class_name 		: 'right_container',
			parent 			: fragment
		})

	// component_text_area. render another node of component caller and append to container
		const component_text_area = self.transcription_component || await self.get_component(self.lang)
		component_text_area.render()
		.then(function(node){
			right_container.appendChild(node)
		})


	// content_data
		const content_data = ui.create_dom_element({
			element_type	: 'div'
		})
		content_data.appendChild(fragment)
		// save the pointers of the content_data nodes, to used by the buttons to access to the components
		content_data.left_container		= left_container
		content_data.right_container	= right_container


	return content_data
};//end get_content_data_edit



/**
* RENDER_TANSCRIPTION_OPTIONS
* This is used to build a optional buttons inside the header
* @return DOM node fragment
*/
const render_tanscription_options = async function(self, content_data) {

	const fragment = new DocumentFragment()

	// lang selector
		const lang_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'lang_selector',
			parent			: fragment
		})
		const lang_label = ui.create_dom_element({
			element_type	: 'div',
			class_name 		: 'lang_label',
			inner_html 		: get_label.idioma || 'Language',
			parent 			: lang_container
		})
		// the lang selector use the content_data pointer .right_container to remove the transcription text_area and rebuild the new node
		const lang_selector = ui.build_select_lang({
			id			: "index_lang_selector",
			selected	: self.lang,
			class_name	: 'dd_input',
			action		: async function(e){
				// create new one
				const component = await self.get_component(e.target.value)
				self.lang = e.target.value
				component.render().then(function(node){
					// remove previous nodes
					while (content_data.right_container.lastChild) {//} && content_data.right_container.lastChild.id!==lang_selector.id) {
						content_data.right_container.removeChild(content_data.right_container.lastChild)
					}
					// add the new one
					content_data.right_container.appendChild(node)
				})
			}
		})
		lang_container.appendChild(lang_selector)


	return fragment
};//end render_tanscription_options


/**
* RENDER_ACTIVITY_INFO
* This is used to build a optional buttons inside the header
* @return DOM node fragment
*/
const render_activity_info = function(self) {

	const fragment = new DocumentFragment()

	// activity alert
		const activity_info_body = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'activity_info_body',
			parent			: fragment
		})
		self.events_tokens.push(
			event_manager.subscribe('save', fn_saved)
		)
		function fn_saved(options){
			const node_info = render_node_info(options)
			activity_info_body.prepend(node_info)
		}

	return fragment
}