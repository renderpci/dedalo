/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_ROOT_WEB Dropzone */
/*eslint no-undef: "error"*/



// imports
	// import {event_manager} from '../../../core/common/js/event_manager.js'
	// import {clone, dd_console} from '../../../core/common/js/utils/index.js'
	import {ui} from '../../../core/common/js/ui.js'
	import {data_manager} from '../../../core/common/js/data_manager.js'
	import {create_source} from '../../../core/common/js/common.js'



/**
* RENDER_TOOL_IMPORT_FILES
* Manages the component's logic and appearance in client side
*/
export const render_tool_import_files = function() {

	return true
}//end render_tool_import_files



/**
* EDIT
* Render node for use in current mode
* @return HTMLElement wrapper
*/
render_tool_import_files.prototype.edit = async function(options) {

	const self = this

	// options
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

	wrapper.content_data	= content_data

	// modal tool container
		// if (!window.opener) {
		// 	const header					= wrapper.tool_header // is created by ui.tool.build_wrapper_edit
		// 	self.tool_container				= ui.attach_to_modal(header, wrapper, null, 'big')
		// 	self.tool_container.on_close	= () => {
		// 		self.caller.refresh()
		// 		// set the images in the dropzone instance, that were uploaded and stay in the server, to ADDED status, to prevent delete them in the server when the tool close
		// 		const files = self.active_dropzone.files
		// 		for (let i = files.length - 1; i >= 0; i--) {
		// 			files[i].status = Dropzone.ADDED
		// 		}
		// 		self.active_dropzone.destroy()
		// 		self.destroy(true, true, true)
		// 	}
		// }

	return wrapper
}//end render_tool_import_files



/**
* GET_CONTENT_DATA_EDIT
* @param object self
* @return HTMLElement content_data
*/
const get_content_data_edit = async function(self) {

	const fragment = new DocumentFragment()

	// options container
		const options_wrapper = ui.create_dom_element({
			element_type	: 'div',
			class_name 		: 'component options',
			parent 			: fragment
		})

	// filter processor options of the files, it could be defined in the preferences or could be the caller
		const ar_file_processor = self.tool_config.file_processor || null
		if(ar_file_processor){

			const processor = ui.create_dom_element({
				element_type	: 'span',
				class_name 		: 'processor',
				parent 			: options_wrapper
			})

			// label
			const label = self.get_tool_label('file_processor') || 'Processor'
				ui.create_dom_element({
					element_type	: 'label',
					class_name		: 'processor label',
					inner_html		: label + ': ',
					parent			: processor
				})
			// options process
				const select_process = ui.create_dom_element({
					element_type	: 'select',
					class_name 		: 'component select',
					parent 			: processor
				})

				select_process.addEventListener('change', function(){
					const file_processor_nodes = document.querySelectorAll("select.file_processor_select")
					const len = file_processor_nodes.length
					for (let i = len - 1; i >= 0; i--) {
						file_processor_nodes[i].value = select_process.value
					}
				})

			const default_option_node = new Option('', null, true, false);
				select_process.appendChild(default_option_node)

			for (let i = 0; i < ar_file_processor.length; i++) {
				const option = ar_file_processor[i]

					const option_procesor_node = ui.create_dom_element({
						element_type	: 'option',
						class_name		: 'component select',
						inner_html		: self.get_tool_label(option.function_name),
						parent			: select_process
					})
					option_procesor_node.value = option.function_name
			}// end for
		}// end if(ar_file_processor)


	// component options to store the file, normally the component_portal, it could be defined in the preferences or could be the caller
		const ddo_option_components = self.tool_config.ddo_map.filter(el => el.role === 'component_option')

		const option_components = (ddo_option_components)
			? ddo_option_components
			: [
				{
					role				: 'component_option',
					tipo				: self.caller.tipo,
					map_name			: null,
					section_id			: 'self',
					section_tipo		: self.caller.tipo,
					target_section_tipo	: self.tool_config.ddo_map.find(el => el.role === 'target_component').section_tipo
				}
			]

			const target_componet = ui.create_dom_element({
				element_type	: 'span',
				class_name 		: 'target_componet',
				parent 			: options_wrapper
			})

			// label
			const target_componet_label = self.get_tool_label('target_componet') || 'Target field'
				ui.create_dom_element({
					element_type	: 'label',
					class_name		: 'target_componet label',
					inner_html		: target_componet_label + ': ',
					parent			: target_componet
				})

		// select_options
			const select_options = ui.create_dom_element({
				element_type	: 'select',
				class_name 		: 'component select',
				parent 			: target_componet
			})
			select_options.addEventListener('change', function(){
				const option_component_nodes = document.querySelectorAll('select.option_component_select')
				const len = option_component_nodes.length
				for (let i = len - 1; i >= 0; i--) {
					option_component_nodes[i].value = select_options.value
				}
			})
			for (let i = 0; i < option_components.length; i++) {

				const option = option_components[i]
				// const map_name = option.map_name ? option.map_name + ' = ' : ''

					const option_node = ui.create_dom_element({
						element_type	: 'option',
						class_name		: 'component select',
						inner_html		: option.label,
						parent			: select_options
					})

					if(option.default){
						option_node.selected = true
					}
					option_node.value = option.tipo
			}

	// Define the quality target to upload the files
		const features = self.target_component_context.features || null
		if(features){

			const ar_quality				= features.ar_quality || ['original']
			const default_target_quality	= features.default_target_quality || 'original'
			self.custom_target_quality 		= default_target_quality || null

			const target_componet = ui.create_dom_element({
				element_type	: 'span',
				class_name 		: 'target_componet',
				parent 			: options_wrapper
			})

			// label
			const quality_label = self.get_tool_label('quality') || 'Quality'
				ui.create_dom_element({
					element_type	: 'label',
					class_name		: 'quality label',
					inner_html		: quality_label + ': ',
					parent			: target_componet
				})

			// options process
				const select_quality = ui.create_dom_element({
					element_type	: 'select',
					class_name 		: 'component select',
					parent 			: target_componet
				})

				select_quality.addEventListener('change', function(){
					self.custom_target_quality = select_quality.value
				})

			const default_option_node = new Option(default_target_quality, default_target_quality, true, true);
				select_quality.appendChild(default_option_node)

			for (let i = 0; i < ar_quality.length; i++) {
				const option = ar_quality[i]
				if(option===default_target_quality){
					continue
				}
				const option_procesor_node = ui.create_dom_element({
					element_type	: 'option',
					class_name		: 'component select',
					inner_html		: option,
					parent			: select_quality
				})
				option_procesor_node.value = option
			}// end for
		}// end if(ar_quality)



	// file name control
		// hide the options when the tool is caller by components, the import_mode is defined in preferences.
			const class_name_configuration = (self.tool_config.import_mode && self.tool_config.import_mode==='section')
				? ''
				: ' hide'

		// tool_configuration_options
			const tool_configuration_options = ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'tool_configuration_options'+class_name_configuration,
				parent			: options_wrapper
			})

			// name_control_field
				const name_control_field = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'name_control name_control_field',
					parent			: tool_configuration_options
				})

				// switcher
					const control_field_switcher = ui.create_dom_element({
						element_type	: 'label',
						class_name		: 'switcher text_unselectable',
						parent			: name_control_field
					})

				// check_box
					const control_field_check_box = ui.create_dom_element({
						element_type	: 'input',
						type			: 'checkbox',
						parent			: control_field_switcher
					})
					control_field_check_box.addEventListener('change', function(e) {
						set_import_mode(self, this.checked)
					})

					// switch_label
					ui.create_dom_element({
						element_type	: 'i',
						parent			: control_field_switcher
					})

					const label_field_check_box = ui.create_dom_element({
						element_type	: 'span',
						class_name		: 'checkbox-label',
						inner_html		: get_label.name_to_field || 'Name indicates field',
						parent			: name_control_field
					})

					// info_options_select
						const info_options = ui.create_dom_element({
							element_type	: 'select',
							class_name		: 'info_options_select',
							parent			: name_control_field
						})
						for (let i = 0; i < option_components.length; i++) {

							const option	= option_components[i]
							const map_name	= option.map_name ? option.map_name + ' = ' : ''

							// option_node
							ui.create_dom_element({
								element_type	: 'option',
								inner_html		: map_name + option.label,
								parent			: info_options
							})
						}//end for (let i = 0; i < option_components.length; i++)

			// name_control_to_section_id
				const name_control_section_id = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'name_control name_control_section_id',
					parent			: tool_configuration_options
				})
				// switcher
					const control_section_id_switcher = ui.create_dom_element({
						element_type	: 'label',
						class_name		: 'switcher text_unselectable',
						parent			: name_control_section_id
					})
					// check_box
						const control_section_id_check_box = ui.create_dom_element({
							element_type	: 'input',
							type			: 'checkbox',
							class_name		: 'ios-toggle',
							parent			: control_section_id_switcher
						})
						control_section_id_check_box.addEventListener('change', function(e) {
							if(control_section_id_check_box.checked){
								template_container.classList.add('name_id')
							}else{
								template_container.classList.remove('name_id')
							}
							if(same_name_check_box.checked){
								same_name_check_box.checked = false
								template_container.classList.remove('same_name_section')
							}
						})
						// switch_label
						ui.create_dom_element({
							element_type	: 'i',
							parent			: control_section_id_switcher
						})


					const label_section_id_check_box = ui.create_dom_element({
						element_type	: 'span',
						class_name		: 'checkbox-label',
						inner_html		: get_label.name_to_record_id || 'Name indicates id',
						parent			: name_control_section_id
					})

			// same_name_same_section
				const same_name_same_section = ui.create_dom_element({
					element_type	: 'div',
					class_name 		: 'name_control same_name_same_section',
					parent 			: tool_configuration_options
				})

				// switcher
					const same_name_same_section_switcher = ui.create_dom_element({
						element_type	: 'label',
						class_name		: 'switcher text_unselectable',
						parent			: same_name_same_section
					})

					// check_box
						const same_name_check_box = ui.create_dom_element({
							element_type	: 'input',
							type			: 'checkbox',
							class_name		: 'ios-toggle',
							parent			: same_name_same_section_switcher
						})
						same_name_check_box.addEventListener('change', function(e) {
							if(control_section_id_check_box.checked){
								control_section_id_check_box.checked = false
								template_container.classList.remove('name_id')
							}
							if(same_name_check_box.checked){
								template_container.classList.add('same_name_section')
							}else{
								template_container.classList.remove('same_name_section')
							}


						})

						// switch_label
						ui.create_dom_element({
							element_type	: 'i',
							parent			: same_name_same_section_switcher
						})

					const label_same_name_check_box = ui.create_dom_element({
						element_type	: 'span',
						class_name		: 'checkbox-label',
						inner_html		: get_label.same_name_same_record || 'Same name same record',
						parent			: same_name_same_section
					})



	// components container
		const drop_zone = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'drop_zone',
			parent			: fragment
		})


	// template_container
		const template_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'template_container',
			parent			: fragment
		})

		const template = await create_template(self)
		template_container.appendChild(template)


		// inputs components container label
		const inputs_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'inputs_container',
			parent			: fragment
		})

		const inputs_container_caption = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'inputs_container_caption',
			inner_html		: get_label.values || 'Values',
			parent			: inputs_container
		})

		// inputs components container
		const components_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'components_container',
			parent			: inputs_container
		})

		const inputs_nodes = await get_temp_sections(self)
		components_container.appendChild(inputs_nodes)

	// buttons_bottom_container
		const buttons_bottom_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'buttons_bottom_container success',
			parent			: fragment
		})

	// button process import
		const button_process_import = ui.create_dom_element({
			element_type	: 'button',
			class_name		: 'processing_import success',
			inner_html		: get_label.import || 'IMPORT',
			parent			: buttons_bottom_container
		})
		button_process_import.addEventListener('click', function(){
			if(self.files_data.length < 1){
				return
			}
			// add loading class to wrapper to block all actions for the user
				self.node.classList.add('loading')

			// get the options from the every file uploaded
			for (let i = self.files_data.length - 1; i >= 0; i--) {
				const current_value = self.files_data[i]
				if(ar_file_processor){
					self.files_data[i].file_processor = current_value.previewElement.querySelector(".file_processor_select").value
				}
				self.files_data[i].component_option = current_value.previewElement.querySelector(".option_component_select").value;
			}
			// get the data from every component used to propagate to every file uploaded
			const ar_instances = self.ar_instances
			const components_temp_data = []
			for (let i = ar_instances.length - 1; i >= 0; i--) {
				const current_instance = ar_instances[i]
				components_temp_data.push(current_instance.data)
			}

			// get the global configuration (to apply in the server)
			self.tool_config.import_file_name_mode = (self.tool_config.import_mode === 'section' && control_section_id_check_box.checked)
				? 'enumerate'
				: (self.tool_config.import_mode === 'section' && same_name_check_box.checked)
					? 'named'
					: null

			// source. Note that second argument is the name of the function to manage the tool request like 'delete_tag'
			// this generates a call as my_tool_name::my_function_name(options)
				const source = create_source(self, 'import_files')

			// process the images in the server (uploaded previously)
			// rqo
				const rqo = {
					dd_api	: 'dd_tools_api',
					action	: 'tool_request',
					source	: source,
					options	: {
						tipo					: self.caller.tipo,
						section_tipo			: self.caller.section_tipo,
						section_id				: self.caller.section_id,
						tool_config				: self.tool_config,
						files_data				: self.files_data,
						components_temp_data	: components_temp_data,
						key_dir					: self.key_dir,
						custom_target_quality	: self.custom_target_quality
					}
				}

			// call to the API, fetch data and get response
				return new Promise(function(resolve){

					data_manager.request({
						body : rqo
					})
					.then(function(response){

						if(SHOW_DEBUG===true) {
							console.warn("-> API response:",response);
						}
						// change the loading to content_data to show message
						self.node.classList.remove('loading')
						self.node.content_data.classList.add('loading')
						// get message
						const msg = (response.result===true)
							? self.get_tool_label('upload_done') || 'Files imported successfully'
							: self.get_tool_label('upload_error') || 'Files no imported!'
						// add the message to wrapper (outside content_data that has loading class)
						const msg_container = ui.create_dom_element({
							element_type	: 'div',
							class_name		: 'msg_container',
							inner_html 		: msg,
							parent			: self.node
						})
						// when user click reload the tool
						self.node.addEventListener('click',function(){
							window.location.reload();
						})
						resolve(response)
					})
				})
		})

	// content_data
		const content_data = ui.tool.build_content_data(self)
		content_data.appendChild(fragment)


	return content_data
}//end get_content_data_edit



/**
* CREATE_TEMPLATE
*
* @param object self
* 	Instance of current tool
* @return DOM fragment
*/
const create_template = async function(self) {

	const fragment = new DocumentFragment();

	// actions row
		const actions = ui.create_dom_element({
			element_type	: 'div',
			id				: 'actions',
			class_name		: 'row',
			parent			: fragment
		})

	// column_left
		const column_left = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'col-lg-7 column_left',
			parent			: actions
		})

		// button_add_files
			const button_add_files = ui.create_dom_element({
				element_type	: 'button',
				class_name		: 'success add dz-clickable',
				inner_html		: get_label.add_file || 'Add files',
				parent			: column_left
			})

		// button_start_upload
			const button_submit_files = ui.create_dom_element({
				element_type	: 'button',
				class_name		: 'primary upload start',
				inner_html		: get_label.start_upload || 'Start upload',
				parent			: column_left
			})
			// button_submit_files.addEventListener('click', function(e) {
			// 	e.stopPropagation()
			// })

		// button_cancel_upload
			const button_cancel_upload = ui.create_dom_element({
				element_type	: 'button',
				class_name		: 'warning cancel',
				inner_html		: get_label.cancel_upload || 'Cancel upload',
				parent			: column_left
			})
			button_cancel_upload.addEventListener('click', function() {
				current_dropzone.removeAllFiles(true);
			});

		// button_delete
			const button_delete = ui.create_dom_element({
				element_type	: 'button',
				class_name		: 'danger delete',
				inner_html		: get_label.delete_file || 'Delete file',
				dataset 		: {dzRemove : ""},
				parent			: column_left
			})

		// delete_check_box
			const delete_check_box = ui.create_dom_element({
				element_type	: 'input',
				type			: 'checkbox',
				class_name 		: 'all_delete_checkbox',
				parent 			: column_left
			})
			delete_check_box.addEventListener('change',function(e){
				const delete_check_nodes = document.querySelectorAll(".delete_checkbox")
				const len = delete_check_nodes.length
				for (let i = len - 1; i >= 0; i--) {
					delete_check_nodes[i].checked = delete_check_box.checked
				}
			})

	// column_right
		const column_right = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'col-lg-5 column_right',
			parent			: actions
		})
		// The global file processing state
			const fileupload_process = ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'fileupload-process',
				parent			: column_right
			})
			// The global file processing state
				const global_progress = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'progress progress-striped active',
					parent			: fileupload_process
				})
				global_progress.style.opacity = "0";
			// global_progress_bar
				const global_progress_bar = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'progress-bar progress-bar-success',
					dataset			: {dzUploadprogress : ''},
					parent			: global_progress
				})

	// grid template used for rows
		const previews_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'table table-striped',
			parent			: fragment
		})
		// template used for rows
			const template = ui.create_dom_element({
				id 				: 'template',
				element_type	: 'div',
				class_name		: 'file-row',
				parent			: previews_container
			})

		// preview_wrapp
			const preview_wrapp = ui.create_dom_element({
				element_type	: 'div',
				class_name 		: 'preview_wrapp',
				parent			: template
			})
			// preview
				const preview = ui.create_dom_element({
					element_type	: 'span',
					class_name		: 'preview',
					parent			: preview_wrapp
				})
			// image
				const preview_image = ui.create_dom_element({
					element_type	: 'img',
					dataset 		: {dzThumbnail : ''},
					parent			: preview_wrapp
				})
				// preview_image.dataset.dzThumbnail = ''

		// details_wrapp
			const details_wrapp = ui.create_dom_element({
				element_type	: 'div',
				class_name 		: 'details_wrapp',
				parent			: template
			})
			// name
				const name = ui.create_dom_element({
					element_type	: 'span',
					class_name		: 'name',
					dataset 		: {dzName : ''},
					parent			: details_wrapp
				})
			// error
				const error = ui.create_dom_element({
					element_type	: 'span',
					class_name		: 'error text-danger',
					dataset 		: {dzErrormessage : ''},
					parent			: details_wrapp
				})
			// size
				const size = ui.create_dom_element({
					element_type	: 'span',
					class_name		: 'size',
					dataset 		: {dzSize : ''},
					parent			: details_wrapp
				})

		// options container
			const options_fragment = new DocumentFragment();

			const row_options_wrapper = ui.create_dom_element({
				element_type	: 'div',
				class_name 		: 'component options',
				parent 			: options_fragment
			})

			// filter processor options of the files, it could be defined in the preferences or could be the caller
				const ar_file_processor = self.tool_config.file_processor || null

				if(ar_file_processor){
					// options process
						const select_process = ui.create_dom_element({
							element_type	: 'select',
							class_name 		: 'file_processor_select',
							parent 			: row_options_wrapper
						})

					const row_option_node = new Option('', null, true, false);
					select_process.appendChild(row_option_node)

					for (let i = 0; i < ar_file_processor.length; i++) {
						const option = ar_file_processor[i]
						const row_option_node = new Option(self.get_tool_label(option.function_name), option.function_name, option.default || false, false);
						select_process.appendChild(row_option_node)

					}// end for
				}// end if(ar_file_processor)


			// component options to store the file, normally the component_portal, it could be defined in the preferences or could be the caller
				const ddo_option_components = self.tool_config.ddo_map.filter(el => el.role === 'component_option')

				const option_components = (ddo_option_components)
					? ddo_option_components
					: [
						{
							tipo: self.caller.tipo,
							label : self.label,
							default: true
						}
					]

				// options select
					const row_select_options = ui.create_dom_element({
						element_type	: 'select',
						class_name 		: 'option_component_select',
						parent 			: row_options_wrapper
					})

					for (let i = 0; i < option_components.length; i++) {
						const option = option_components[i]
						const row_option_node = new Option(option.label, option.tipo, option.default || false, false);
						row_select_options.appendChild(row_option_node)
					}

		template.appendChild(options_fragment)


		// row_progress_bar
			const row_progress_bar = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'row_progress_bar',
				parent			: template
			})
			// row_progress_bar
				const row_progress_bar_active = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'progress progress-striped active',
					parent			: row_progress_bar
				})
			// row_progress_bar
				const row_progress_bar_success = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'progress-bar progress-bar-success',
					dataset			: {dzUploadprogress : ''},
					parent			: row_progress_bar_active
				})

		// row_buttons
			const row_buttons = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'row_buttons',
				parent			: template
			})

			// row_button_submit_files
				const row_button_submit_files = ui.create_dom_element({
					element_type	: 'button',
					class_name		: 'primary start',
					inner_html		: get_label.submit || 'Start upload',
					parent			: row_buttons
				})

			// row_button_cancel_upload
				const row_button_cancel_upload = ui.create_dom_element({
					element_type	: 'button',
					class_name		: 'warning cancel',
					inner_html		: get_label.cancel_upload || 'Cancel upload',
					dataset			: {dzRemove : ""},
					parent			: row_buttons
				})

			// row_button_delete
				ui.create_dom_element({
					element_type	: 'button',
					class_name		: 'danger delete row_button_delete hide',
					inner_html		: get_label.delete_file || 'Delete file',
					dataset			: {dzRemove : ""},
					parent			: row_buttons
				})

			// row_delete_check_box
				ui.create_dom_element({
					element_type	: 'input',
					type			: 'checkbox',
					class_name		: 'delete_checkbox row_delete_check_box hide',
					parent			: row_buttons
				})

	// Get the template HTML and remove it from the document the template HTML and remove it from the document
		const previewNode		= template;
		previewNode.id			= "";
		const previewTemplate	= previewNode.parentNode.innerHTML;
		previewNode.parentNode.removeChild(previewNode);

	// dropzone init
		const current_dropzone = self.active_dropzone || new Dropzone(document.body, { // Make the whole body a dropzone
			url					: DEDALO_ROOT_WEB + '/tools/tool_import_files/handle_files.php', // Set the 'trigger' manager url
			// thumbnailWidth	: 192,
			thumbnailHeight		: 96,
			thumbnailMethod		: 'contain',
			parallelUploads		: 20,
			previewTemplate		: previewTemplate,
			autoQueue			: false, // Make sure the files aren't queued until manually added
			previewsContainer	: previews_container, // Define the container to display the previews
			clickable			: button_add_files, // Define the element that should be used as click trigger to select files.
			addRemoveLinks 		: false,
			params				: {
				key_dir			: self.key_dir,
				section_tipo	: self.section_tipo
			},
			renameFile			: function (file){
				const files = self.files_data;
				const { name } = file;

				if (files.some(file => file.name === name)) {

					const last_dot = name.lastIndexOf('.');
					// const base_name = name.slice((name.lastIndexOf('.') - 1 >>> 0) + 2);
					const file_name = name.substring(0, last_dot);
					const file_extension = name.substring(last_dot + 1);

					return file_name +' ('+ files.length +').'+file_extension;
				}

				return name;
			}
		});
		self.active_dropzone = current_dropzone

	// event addedfile
		current_dropzone.on('addedfile', function(file) {

			const button_start				= file.previewElement.querySelector('.start')
			const button_cancel				= file.previewElement.querySelector(".cancel")
			const button_delete				= file.previewElement.querySelector(".delete")
			const button_delete_check_box	= file.previewElement.querySelector(".delete_checkbox")

			if(file.url){
				button_start.disabled	= true;
				button_cancel.disabled	= true;
				button_delete.disabled	= false;

				button_start.classList.add('hide')
				button_cancel.classList.add('hide')
				button_delete.classList.remove('hide')
				button_delete_check_box.classList.remove('hide')
			}else{

				button_start.disabled	= false;
				button_cancel.disabled	= false;
				button_delete.disabled	= true;

				button_start.classList.remove('hide')
				button_cancel.classList.remove('hide')
				button_delete.classList.add('hide')
				button_delete_check_box.classList.add('hide')
			}

			// check if the file comes from the server or from dropzone
			const current_name = (file.upload && file.upload.filename) ? file.upload.filename : file.name

			// Hookup the start button
			button_start.onclick = function() {
				current_dropzone.enqueueFile(file);
			};
			file.previewElement.querySelector(".name").innerHTML = current_name
			button_delete_check_box.value = current_name

			self.files_data.push({
				name			: current_name,
				previewTemplate	: file.previewTemplate,
				previewElement	: file.previewElement,
				size			: file.size
			})
		});

	// event removedfile
		current_dropzone.on('removedfile', async function(file) {

			const current_name = (file.upload && file.upload.filename) ? file.upload.filename : file.name;

			const data_length = self.files_data.length
			for (let i = data_length - 1; i >= 0; i--) {
				const current_data = self.files_data[i]
				if(current_data.name === current_name){
					self.files_data.splice(i,1);
				}
			}

			if(file.url || file.status==='success'){

				// source
					const source = create_source(self, 'delete_uploaded_file')

				// rqo
					const rqo = {
						dd_api	: 'dd_tools_api',
						action	: 'tool_request',
						source	: source,
						options	: {
							key_dir			: self.key_dir,
							file_name		: current_name,
							section_tipo	: self.section_tipo
						}
					}

				// call to the API, fetch data and get response
					const response = await data_manager.request({
						body : rqo
					})
			}
		});

	// event totaluploadprogress. Update the total progress bar
		current_dropzone.on('totaluploadprogress', function(progress) {
			// document.querySelector('#total-progress .progress-bar').style.width = progress + '%';
			global_progress_bar.style.width = progress + '%';
		});

	// event sending
		current_dropzone.on('sending', function(file) {
			// Show the total progress bar when upload starts
			// document.querySelector('#total-progress').style.opacity = '1';
			global_progress.style.opacity = '1';
			// And disable the start button
			file.previewElement.querySelector('.start').setAttribute('disabled', 'disabled');
		});

	// event queuecomplete. Hide the total progress bar when nothing's uploading anymore
		current_dropzone.on('queuecomplete', function(progress) {
			// document.querySelector("#total-progress").style.opacity = "0";
			global_progress.style.opacity = '0';
		});

	// Setup the buttons for all transfers
	// The 'add files' button doesn't need to be setup because the config
	// `clickable` has already been specified.
	// document.querySelector('#actions .start').onclick = function() {

	// button_submit_files
		// button_submit_files.onclick = function() {
		// 	current_dropzone.enqueueFiles(current_dropzone.getFilesWithStatus(Dropzone.ADDED))
		// }

	// button_submit_files
		// document.querySelector('#actions .cancel').onclick = function() {
		button_submit_files.onclick = function() {

			current_dropzone.enqueueFiles(current_dropzone.getFilesWithStatus(Dropzone.ADDED))

			// current_dropzone.removeAllFiles(true);
			const files = current_dropzone.getFilesWithStatus(Dropzone.UPLOADING)
			for (let i = files.length - 1; i >= 0; i--) {
				const current_file = files[i]
				current_dropzone.cancelUpload(current_file)
				current_file.status = Dropzone.ADDED
			}
		}

	// button_delete
		button_delete.onclick= async function() {

			const delete_checkbox_nodes	= document.querySelectorAll('.delete_checkbox')
			const len					= delete_checkbox_nodes.length
			for (let i = len - 1; i >= 0; i--) {
				if(delete_checkbox_nodes[i].checked){
					const row_delete_node	= delete_checkbox_nodes[i].parentNode.querySelector('button.delete')
					if(row_delete_node){
						row_delete_node.click()
					}
				}
			}
		}

	// event success
		current_dropzone.on('success', function(file, response) {

			//showing an image created by the server after upload
			this.emit('thumbnail', file, response.thumbnail_file);
			// Handle the responseText here. For example, add the text to the preview element:
			file.previewTemplate.appendChild(document.createTextNode(response.msg));
			const button_start	= file.previewElement.querySelector('.start')
			const button_cancel	= file.previewElement.querySelector('.cancel')
			const button_delete	= file.previewElement.querySelector('.delete')
			const button_delete_check_box = file.previewElement.querySelector('.delete_checkbox')

			button_start.disabled = true;
			button_cancel.disabled = true;
			button_delete.disabled = false;

			button_start.classList.add('hide')
			button_cancel.classList.add('hide')
			button_delete.classList.remove('hide')
			button_delete_check_box.classList.remove('hide')

			const row_progress_bar = file.previewElement.querySelector('.progress')
			row_progress_bar.style.opacity = '0';
		});

	// get the images in the server (uploaded previously), and display into the dropzone
		// const files = await data_manager.request({
		// 	url: DEDALO_ROOT_WEB + "/tools/tool_import_files/list_files.php",
		// 	body:{key_dir: self.key_dir}
		// })

		// source. Note that second argument is the name of the function to manage the tool request like 'delete_tag'
			// this generates a call as my_tool_name::my_function_name(options)
			const source = create_source(self, 'list_uploaded_files')

		// rqo
			const rqo = {
				dd_api	: 'dd_tools_api',
				action	: 'tool_request',
				source	: source,
				options	: {
					key_dir			: self.key_dir,
					section_tipo	: self.section_tipo
				}
			}

		// call to the API, fetch data and get response
			const response = await data_manager.request({
				body : rqo
			})
			const files = response.result

		// Access to the original image sizes on your server,
		// to resize them in the browser:
		const files_length = files.length

		const callback			= null; // Optional callback when it's done
		const crossOrigin		= null; // Added to the `img` tag for crossOrigin handling
		const resizeThumbnail	= false; // Tells Dropzone whether it should resize the image first

		for (let i = 0; i < files_length; i++) {
			const current_file = files[i]
			current_dropzone.displayExistingFile(current_file, current_file.url, callback, crossOrigin, resizeThumbnail);
		}


	return fragment
}//end create_template



/**
* GET_TEMP_SECTIONS
* @return HTMLElement DocumentFragment
*/
const get_temp_sections = async function(self){

	const ar_instances = self.ar_instances

	const fragment = new DocumentFragment();

	for (let i = 0; i < ar_instances.length; i++) {

		const current_instance = ar_instances[i]

		const instance_node = await current_instance.render()

		fragment.appendChild(instance_node)
	}

	return fragment
}//end get_temp_sections



/**
* GET_TEMP_SECTIONS
* @return bool true
*/
const set_import_mode = function (self, apply){

	for (let i = self.files_data.length - 1; i >= 0; i--) {
		const current_value = self.files_data[i]

		if(apply===true){
			const regex = /^(.+)-([a-zA-Z])\.([a-zA-Z]{3,4})$/;
			// const name = current_value.name; //`123 85-456 fd-a.jpg`;
			const map_name = regex.exec(current_value.name)
			if ( map_name!==null && map_name[2]!==null ) {

				const map_name_upper = map_name[2].toUpperCase();
				const target_portal = self.tool_config.ddo_map.find(el => el.role==='component_option' && el.map_name===map_name_upper)

				if (target_portal) {
					current_value.previewElement.querySelector(".option_component_select").value = target_portal.tipo;
				}

			}
		}else{
			const default_target_portal = self.tool_config.ddo_map.find(el => el.role === 'component_option' && el.default === true)
			if(default_target_portal){
				current_value.previewElement.querySelector(".option_component_select").value = default_target_portal.tipo;
			}else{
				current_value.previewElement.querySelector(".option_component_select").options[0].selected = true ;
			}

		}
	}

	return true
}//end set_import_mode