// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_API_URL */
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../../../common/js/ui.js'
	import {data_manager} from '../../../../common/js/data_manager.js'
	import {when_in_viewport} from '../../../../common/js/events.js'
	import {createJSONEditor} from '../../../../../lib/jsoneditor/dist/standalone.js'
	import {print_response} from '../../../js/render_area_maintenance.js'



/**
* RENDER_SQO_TEST_ENVIRONMENT
* Manages the component's logic and appearance in client side
*/
export const render_sqo_test_environment = function() {

	return true
}//end render_sqo_test_environment



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
render_sqo_test_environment.prototype.list = async function(options) {

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

				// container
					const container = new DocumentFragment()

				// label
					ui.create_dom_element({
						element_type	: 'label',
						inner_html		: 'Test Search Query Object (SQO)',
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

						const editor_text = self.editor.get().text
						if (editor_text.length<3) {
							return false
						}

						const sqo = JSON.parse(editor_text)
						if (!sqo) {
							console.warn("Invalid editor text", sqo);
							return false
						}

						const rqo = {
							dd_api	: 'dd_utils_api',
							action	: 'convert_search_object_to_sql_query',
							options	: sqo
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
					const load_editor = () => {
						// localStorage
						const sample_data	= '{"section_tipo":["rsc170"],"limit":5,"offset":0}'
						const saved_value	= localStorage.getItem('json_editor_sqo')
						const editor_value	= saved_value || sample_data

						const editor = createJSONEditor({
							target	: json_editor_api_container,
							props	: {
								content 	: {text : editor_value},
								mode		: 'text',
								onChange	: (updatedContent, previousContent, { contentErrors, patchResult }) => {
									if(typeof contentErrors==='undefined'){
										// check is JSON valid and store
										try {
											const body_options = JSON.parse(updatedContent.text)
											if (body_options) {
												window.localStorage.setItem('json_editor_sqo', updatedContent.text);
											}
										} catch (error) {
											// console.error(error)
										}
									}
								}
							}
						})

						// set pointer
						self.editor = editor
					}

					// observe in viewport
					when_in_viewport(json_editor_api_container, load_editor)

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
