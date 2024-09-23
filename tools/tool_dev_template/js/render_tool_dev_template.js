// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, tool_dummy */
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../../core/common/js/event_manager.js'
// import ui to create DOM nodes and common HTML structures as wrappers or content_data compatible with the all Dédalo
	import {ui} from '../../../core/common/js/ui.js'
	import {pause} from '../../../core/common/js/utils/index.js'
	import {open_tool} from '../../../tools/tool_common/js/tool_common.js'
	import * as instances from '../../../core/common/js/instances.js'
	import {data_manager} from '../../../core/common/js/data_manager.js'


/**
* RENDER_TOOL_DEV_TEMPLATE
* Manages the component's logic and appearance in client side
*/
export const render_tool_dev_template = function() {

	return true
}//end render_tool_dev_template



/**
* EDIT
* Render tool DOM nodes
* This function is called by render common attached in 'tool_dummy.js'
* @param object options
* @return HTMLElement wrapper
*/
render_tool_dev_template.prototype.edit = async function(options) {

	const self = this

	// options
		const render_level = options.render_level || 'full'

	// content_data
		const content_data = await get_content_data(self)
		if (render_level==='content') {
			return content_data
		}

	// wrapper. ui build_edit returns a standard built tool wrapper
		const wrapper = ui.tool.build_wrapper_edit(self, {
			content_data : content_data
		})


	return wrapper
}//end edit



/**
* GET_CONTENT_DATA
* Render tool body or 'content_data'
* @param instance self
* @return HTMLElement content_data
*/
const get_content_data = async function(self) {

	const fragment = new DocumentFragment()

	// info_container
		const info_container = ui.create_dom_element({
			element_type	: 'div',
			class_name 		: 'info_container',
			inner_html 		: `This sample tool is only to be used as a basis or reference for creating new tools..<br>
							   To see more complete information about how to create tools see the http://dedalo.dev documentation about tools`,
			parent 			: fragment
		})

	// components_container
		const components_container = ui.create_dom_element({
			element_type	: 'div',
			class_name 		: 'components_container',
			parent 			: fragment
		})

	// source component
		const main_component_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'main_component_container',
			parent			: components_container
		})
		self.main_element.render()
		.then(function(component_node){
			main_component_container.appendChild(component_node)
		})

	// footer_buttons_container
		const footer_buttons_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'footer_buttons_container',
			parent			: fragment
		})

	// test_button 1
		const test_button = ui.create_dom_element({
			element_type	: 'button',
			class_name		: 'primary',
			inner_html		: self.get_tool_label('my_first_label') || 'Hello button without label 1',
			parent			: footer_buttons_container
		})
		test_button.addEventListener('click', function(e) {
			e.stopPropagation()

			const node = ui.load_item_with_spinner({
				container			: value_container,
				preserve_content	: false,
				label				: 'component local value',
				callback			: async () => {

					await pause(700) // fake process wait

					const value_node = ui.create_dom_element({
						element_type	: 'pre',
						class_name		: '',
						inner_html		: JSON.stringify(self.main_element.data.value, null, 2)
					})
					return value_node
				}
			})//end ui.load_item_with_spinner
		})

	// test_button 2
		const test_button2 = ui.create_dom_element({
			element_type	: 'button',
			class_name		: 'primary',
			inner_html		: self.get_tool_label('my_second_label') || 'Hello button without label 2',
			parent			: footer_buttons_container
		})
		test_button2.addEventListener('click', function(e) {
			e.stopPropagation()

			const node = ui.load_item_with_spinner({
				container			: value_container,
				preserve_content	: false,
				label				: 'value from server',
				callback			: async () => {

					await pause(500) // fake process wait

					const response = await self.get_some_data_from_server()

					const value_node = ui.create_dom_element({
						element_type	: 'pre',
						class_name		: '',
						inner_html		: JSON.stringify(response.result, null, 2)
					})
					return value_node
				}
			})//end ui.load_item_with_spinner
		})


	// test_button3 upload_file (generic)
		const test_button3 = ui.create_dom_element({
			element_type	: 'button',
			class_name		: 'primary',
			inner_html		: self.get_tool_label('upload_file') || 'Upload generic file',
			parent			: footer_buttons_container
		})
		test_button3.addEventListener('click', function(e) {
			e.stopPropagation()

			const node = ui.load_item_with_spinner({
				container			: value_container,
				preserve_content	: false,
				label				: 'service upload',
				callback			: async () => {

					await pause(300) // fake process wait

					const service_upload = await instances.get_instance({
						id_variant			: 'generic_upload_file', // prevent id collisions
						model				: 'service_upload',
						allowed_extensions	: ['zip','kml'],
						mode				: 'edit',
						caller				: self
					})
					await service_upload.build()
					const service_upload_node = await service_upload.render()

					// event upload_file_done_
					event_manager.subscribe('upload_file_done_' + self.id, fn_upload_done)
					async function fn_upload_done(response) {
						// handle the result
						await self.file_upload_handler(response)
						// remove service
						await service_upload.destroy(true, true, true)
						// add info
						value_container.innerHTML = 'File "'+response.file_data.name+'" uploaded successfully. Processing file.. please wait'
					}

					return service_upload_node
				}
			})//end ui.load_item_with_spinner
		})

	// test_button4 upload_file (image)
		const test_button4 = ui.create_dom_element({
			element_type	: 'button',
			class_name		: 'primary',
			inner_html		: self.get_tool_label('upload_image_file') || 'Update image file',
			parent			: footer_buttons_container
		})
		test_button4.addEventListener('click', function(e) {
			e.stopPropagation()

			const node = ui.load_item_with_spinner({
				container			: value_container,
				preserve_content	: false,
				label				: 'service upload',
				callback			: async () => {

					console.log('self:', self);

					await pause(300) // fake process wait

					const section_resources_image_tipo	 = DD_TIPOS.DEDALO_SECTION_RESOURCES_IMAGE_TIPO // 'rsc170';
					const component_resources_image_tipo = DD_TIPOS.DEDALO_COMPONENT_RESOURCES_IMAGE_TIPO // 'rsc29';

					// data_manager. create
					const rqo = {
						action	: 'create',
						source	: {
							section_tipo : section_resources_image_tipo
						}
					}
					const api_response = await data_manager.request({
						body : rqo
					})
					if (api_response.result && api_response.result>0) {

						const section_id = api_response.result

						// resource component used as tool_upload caller
						// It is necessary because he knows the proper tool context
							const component_image = await instances.get_instance({
								model			: 'component_image',
								tipo			: component_resources_image_tipo,
								section_tipo	: section_resources_image_tipo,
								section_id		: section_id,
								mode			: 'edit',
								caller			: self
							})
							await component_image.build(true);

						// tool context. Get the upload tool context to be fired
							const tool_upload = component_image.tools.find(el => el.model === 'tool_upload')

						// open_tool, it will be the interface to upload data in new window.
							const tool = await open_tool({
								tool_context	: tool_upload,
								open_as			: 'modal',
								caller			: component_image
							})

						// event process_uploaded_file_done_
							const fn_process_done = async function(api_response) {

								// close modal. This action also destroys the tool
									if (tool.node && tool.node.modal) {
										tool.node.modal.close()
									}

								// add info
									value_container.innerHTML = 'File uploaded and processed successfully.'

								// available files
									// build component again to force read DDBB updated data
									await component_image.build(true);
									const data	= component_image.data || {}
									const value	= data.value || []
									const files_info = value[0]
										? value[0].files_info
										: null

									if (files_info) {
										// display available files list
										// (!) Note that if your config.php file definition contains
										// the constant 'DEDALO_IMAGE_ALTERNATIVE_EXTENSIONS', other formats
										// than default JPG will be available to use (like PNG, AVIF ...)
										// @see DOCU https://dedalo.dev/docs/config/config/#defining-alternative-image-extensions-of-image-files
										ui.create_dom_element({
											element_type	: 'pre',
											class_name		: '',
											inner_html		: JSON.stringify(files_info, null, 2),
											parent			: value_container
										})

										// preview all available images
											const files_info_length = files_info.length
											for (let k = 0; k < files_info_length; k++) {
												const url = DEDALO_MEDIA_URL + files_info[k].file_path
												ui.create_dom_element({
													element_type	: 'img',
													src				: url,
													title			: files_info[k].extension + ' ' + files_info[k].quality,
													parent			: value_container
												})
												ui.create_dom_element({
													element_type	: 'pre',
													class_name		: '',
													inner_html		: JSON.stringify(files_info[k], null, 2),
													parent			: value_container
												})
											}
									}else{
										console.error('Failed to read files info from component data:', data);
									}
							}
							event_manager.subscribe('process_uploaded_file_done_' + tool.id, fn_process_done)
					}

					return null
				}
			})//end ui.load_item_with_spinner
		})



	// value_container
		const value_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'value_container',
			parent			: fragment
		})

	// content_data
		const content_data = ui.tool.build_content_data(self)
		content_data.appendChild(fragment)


	return content_data
}//end get_content_data



/**
* ADD_COMPONENT_SAMPLE
* @param instance self
* @param DOM node component_container
* @param string lang
* @return bool true
*/
export const add_component_sample = async (self, component_container, lang) => {

	// user select blank lang case
		if (!lang) {
			while (component_container.firstChild) {
				// remove node from DOM (not component instance)
				component_container.removeChild(component_container.firstChild)
			}
			return false
		}

	const component = await self.load_component_sample({
		lang	: self,
		ddo		: self.main_element
	})
	const node 		= await component.render()

	// clean container
		while (component_container.firstChild) {
			component_container.removeChild(component_container.firstChild)
		}

	// append node
		component_container.appendChild(node)


	return true
}//end add_component_sample



// @license-end
