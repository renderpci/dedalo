// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_API_URL */
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../../../common/js/ui.js'
	import {data_manager} from '../../../../common/js/data_manager.js'
	import {load_json_editor_files} from '../../../js/area_maintenance.js'
	import {print_response} from '../../../js/render_area_maintenance.js'



/**
* RENDER_DEDALO_API_TEST_ENVIRONMENT
* Manages the component's logic and appearance in client side
*/
export const render_dedalo_api_test_environment = function() {

	return true
}//end render_dedalo_api_test_environment



/**
* LIST
* Creates the nodes of current widget.
* The created wrapper will be append to the widget body in area_maintenance
* @param object options
* 	Sample:
* 	{
*		render_level : "full"
		render_mode : "list"
*   }
* @return HTMLElement wrapper
* 	To append to the widget body node (area_maintenance)
*/
render_dedalo_api_test_environment.prototype.list = async function(options) {

	const self = this

	const render_level = options.render_level || 'full'

	// content_data
		const content_data = await get_content_data_edit(self)
		if (render_level==='content') {
			return content_data
		}

	// wrapper. ui build_edit returns widget wrapper
		const wrapper = ui.widget.build_wrapper_edit(self, {
			content_data : content_data
		})
		// set pointers
		wrapper.content_data = content_data


	return wrapper
}//end list



/**
* GET_CONTENT_DATA_EDIT
* @param object self
* @return HTMLElement content_data
*/
const get_content_data_edit = async function(self) {

	// short vars
		const value = self.value || {}

	// content_data
		const content_data = ui.create_dom_element({
			element_type : 'div'
		})

	// load editor gracefully
		ui.load_item_with_spinner({
			container			: content_data,
			preserve_content	: false,
			label				: self.name,
			callback			: async () => {

				await load_json_editor_files()

				// container
					const container = new DocumentFragment()

				// label
					ui.create_dom_element({
						element_type	: 'label',
						inner_html		: 'API send RQO (Request Query Object) default dd_api is "dd_core_api"',
						parent			: container
					})

				// button_submit
					const button_submit = ui.create_dom_element({
						element_type	: 'button',
						class_name		: 'button_submit border light',
						inner_html		: `OK`,
						parent			: container
					})
					// click event
					const click_handler = async (e) => {
						e.stopPropagation()

						const editor_text = self.editor.getText()
						if (editor_text.length<3) {
							return false
						}

						const rqo = JSON.parse(editor_text)
						if (!rqo) {
							console.warn("Invalid editor text", rqo);
							return false
						}

						// loading
						content_data.classList.add('loading')

						// data_manager
						const api_response = await data_manager.request({
							body : rqo
						})
						if(SHOW_DEBUG===true) {
							// console.log("/// json_editor_api api_response:",api_response);
						}

						// loading
						content_data.classList.remove('loading')

						print_response(body_response, api_response)
					}
					button_submit.addEventListener('click', click_handler)

				// json_editor_api_container
					const json_editor_api_container = ui.create_dom_element({
						element_type	: 'div',
						class_name		: 'editor_json_container',
						parent			: container
					})

				// JSON editor
					const options = {
						mode	: 'code',
						modes	: ['code', 'form', 'text', 'tree', 'view'], // allowed modes
						onError	: function (err) {
							alert(err.toString());
						},
						onChange: async function () {
							const editor_text = editor.getText()
							if (editor_text.length<3) return

							// check is JSON valid and store
							try {
								const body_options = JSON.parse(editor_text)
								if (body_options) {
									window.localStorage.setItem('json_editor_api', editor_text);
								}
							} catch (error) {
								// console.error(error)
							}
						}
					}
					// localStorage
					const sample_data	= {"id":"section_oh1_edit_lg-eng","action":"read","source":{"typo":"source","type":"section","action":"search","model":"section","tipo":"rsc170","section_tipo":"rsc170","section_id":null,"mode":"edit","view":null,"lang":"lg-eng"},"sqo":{"section_tipo":["rsc170"],"limit":1,"offset":0}}
					const saved_value	= localStorage.getItem('json_editor_api')
					const editor_value	= JSON.parse(saved_value) || sample_data
					const editor		= new JSONEditor(json_editor_api_container, options, editor_value)
					// set pointer
					self.editor = editor

				// add at end body_response
					const body_response = ui.create_dom_element({
						element_type	: 'div',
						class_name		: 'body_response',
						parent			: container
					})

				return container
			}
		})//end ui.load_item_with_spinner


	return content_data
}//end get_content_data_edit



// @license-end
