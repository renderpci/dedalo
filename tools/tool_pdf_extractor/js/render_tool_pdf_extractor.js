// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_tool_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../../core/common/js/event_manager.js'
	import {ui} from '../../../core/common/js/ui.js'
	import {render_footer} from '../../tool_common/js/render_tool_common.js'



/**
* RENDER_TOOL_PDF_EXTRACTOR
* Manages the component's logic and appearance in client side
*/
export const render_tool_pdf_extractor = function() {

	return true
}//end render_tool_pdf_extractor



/**
* EDIT
* Render node
* @param object options
* @return HTMLElement wrapper
*/
render_tool_pdf_extractor.prototype.edit = async function (options) {

	const self = this

	// options
		const render_level 	= options.render_level

	// content_data
		const current_content_data = await get_content_data(self)
		if (render_level==='content') {
			return current_content_data
		}

	// wrapper. ui build_edit returns component wrapper
		const wrapper = ui.tool.build_wrapper_edit(self, {
			content_data : current_content_data
		})


	return wrapper
}//end edit



/**
* GET_CONTENT_DATA
* @param object self
* @return HTMLElement content_data
*/
const get_content_data = async function(self) {

	// DocumentFragment
		const fragment = new DocumentFragment()

	// options_container
		const options_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'options_container',
			inner_html		: '',
			parent			: fragment
		})

		// page_in
			const page_in_label = ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'options_label',
				inner_html		: self.get_tool_label('page_in'),
				parent			: options_container
			})
			const page_in_input = ui.create_dom_element({
				element_type	: 'input',
				type 			: 'number',
				class_name		: 'options_input page_in',
				parent 			: options_container
			})
			const change_page_handler = (e) => {
				self.config.page_in = (!e.target.value || e.target.value==='')
					? false
					: e.target.value
			}
			page_in_input.addEventListener('change', change_page_handler)

		// page_out
			const page_out_label = ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'options_label',
				inner_html		: self.get_tool_label('page_out'),
				parent			: options_container
			})
			const page_out = ui.create_dom_element({
				element_type	: 'input',
				type 			: 'number',
				class_name		: 'options_input page_out',
				parent 			: options_container
			})
			const change_number_handler = (e) => {
				self.config.page_out = (!e.target.value || e.target.value==='')
					? false
					: e.target.value
			}
			page_out.addEventListener('change', change_number_handler)

		// method
			// the user can choose the method of the extraction, it can be "text" or "html",
			// the process will change the daemon into the server
				const method_label = ui.create_dom_element({
					element_type	: 'span',
					class_name		: 'options_label',
					inner_html		: self.get_tool_label('proces_method'),
					parent			: options_container
				})
			// method_selector
				const method_selector = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'method_selector',
					parent			: options_container
				})

			// change_handler
				const change_handler = (e) => {
					// fix config.method
					const method = e.target.value // html_engine | text_engine
					self.config.method = method
				}

			// option txt
				const option_txt_label = ui.create_dom_element({
					element_type	: 'label',
					class_name		: 'label',
					inner_html		: 'txt',
					parent			: method_selector
				})
				// option txt
				const option_txt = ui.create_dom_element({
					element_type	: 'input',
					type			: 'radio',
					value			: 'text_engine',
					name			: self.id
				})
				// set as checked by default
				option_txt.checked = 'checked'
				// set as method by default
				self.config.method = 'text_engine'
				// change event
				option_txt.addEventListener('change', change_handler)
				option_txt_label.prepend(option_txt)

			// option html
				const option_html_label = ui.create_dom_element({
					element_type	: 'label',
					class_name		: 'label',
					inner_html		: 'html',
					parent			: method_selector
				})
				const option_html = ui.create_dom_element({
					element_type	: 'input',
					type			: 'radio',
					value			: 'html_engine',
					name			: self.id
				})
				// change event
				option_html.addEventListener('change', change_handler)
				option_html_label.prepend(option_html)

	// button_submit
		const button_submit = ui.create_dom_element({
			element_type	: 'button',
			class_name		: 'button_submit warning',
			inner_html		: self.get_tool_label('do_process'),
			parent			: fragment
		})
		const mouseup_handler = async (e) => {
			e.stopPropagation()

			// cleanup
				response_msg.innerHTML = '<br>'
				response_msg.classList.remove('error')

			// loading css
				const elements = [
					options_container,
					button_submit,
					icon_gear
				]
				elements.map(el => el.classList.add('loading'))

			// pdf_data. Extract PDF file text/html
				const extracted_data_response = await self.get_pdf_data()
				if(!extracted_data_response || !extracted_data_response.result || extracted_data_response.result===false) {

					// loading css
					elements.map(el => el.classList.remove('loading'))

					// msg
					const msg = extracted_data_response.msg || 'Unknown error on get_pdf_data'
					if(SHOW_DEBUG===true) {
						console.warn('extracted_data_response:', extracted_data_response);
					}
					// alert(msg);
					response_msg.innerHTML = msg
					response_msg.classList.add('error')

					return false
				}

				// API response msg
				response_msg.innerHTML = extracted_data_response.msg

			// process_pdf_data. Apply result to target component value
				const raw_pdf_string	= extracted_data_response.result
				const pdf_data			= await self.process_pdf_data(raw_pdf_string)
				// debug
					if(SHOW_DEBUG===true) {
						// console.log('raw_pdf_string:', raw_pdf_string);
						// console.log('process_pdf_data -> pdf_data:', pdf_data);
						// console.log('self:', self);
					}
				// id_base like 'rsc176_3_rsc37'. Note that target component tipo comes from properties->tool_config->target_tipo
				const id_base = self.caller.section_tipo + '_' + self.caller.section_id + '_' + self.caller.tipo
				// set_pdf_data_ event is observed by component_text_area (init function) and get pdf_data and set as component value (set_value)
				// The published value must be an object like as expected by component_text_area->set_value
				event_manager.publish('set_pdf_data_'+ id_base, {
					key		: 0,
					value	: pdf_data
				})

			// preview
				preview.innerHTML = pdf_data

			// loading css
				preview.classList.remove('hide')
				elements.map(el => el.classList.remove('loading'))

			// show button select
				button_select.classList.remove('hide')
		}
		button_submit.addEventListener('mouseup', mouseup_handler)

		// icon
		const icon_gear = ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'button white icon gear'
		})
		button_submit.prepend(icon_gear)

	// response_container
		const response_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'response_container',
			parent			: fragment
		})
		// response_msg
		const response_msg = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'response_msg',
			parent			: response_container
		})
		// preview
		const preview = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'preview hide',
			parent			: response_container
		})
		// button_select
		const button_select = ui.create_dom_element({
			element_type	: 'button',
			class_name		: 'warning button_select hide',
			inner_html		: self.get_tool_label('select_text') || 'Select text',
			parent			: fragment
		})
		// click_handler
		const click_handler = (e) => {
			e.stopPropagation()

			window.getSelection()
				.selectAllChildren(
					preview
				)
		}
		button_select.addEventListener('click', click_handler)

	// info
		// container info
		// const info = ui.create_dom_element({
		// 	element_type	: 'div',
		// 	class_name		: 'info',
		// 	// inner_html	: '',
		// 	parent			: fragment
		// })
		// caller component
		// ui.create_dom_element({
		// 	element_type	: 'div',
		// 	inner_html		: '<label>Caller component</label>' + self.caller.model,
		// 	parent			: info
		// })

	// footer_node
		const footer_node = render_footer(self)
		fragment.appendChild(footer_node)

	// content_data
		const content_data = ui.tool.build_content_data(self)
		content_data.appendChild(fragment)


	return content_data
}//end get_content_data



// @license-end
