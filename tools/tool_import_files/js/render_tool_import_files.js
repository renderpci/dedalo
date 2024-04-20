// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_ROOT_WEB Dropzone */
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../../core/common/js/ui.js'
	import {time_unit_auto} from '../../../core/common/js/utils/index.js'
	import {data_manager} from '../../../core/common/js/data_manager.js'
	// import {create_source} from '../../../core/common/js/common.js'
	import {render_stream} from '../../../core/common/js/render_common.js'



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
* @param object options
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
		wrapper.content_data = content_data


	return wrapper
}//end render_tool_import_files



/**
* GET_CONTENT_DATA_EDIT
* @param object self
* @return HTMLElement content_data
*/
const get_content_data_edit = async function(self) {

	const fragment = new DocumentFragment()

	// short vars
		const ar_file_processor	= self.tool_config.file_processor || null
		const process_id		= 'process_import_files_' + self.section_tipo
		const lock_items		= []

	// options_container
		const options_container = render_options_container(self)
		lock_items.push(options_container)
		fragment.appendChild(options_container)

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
		lock_items.push(template_container)

		// const template = await create_template(self)
		const template = await self.service_dropzone.render()
		template_container.appendChild(template)

	// inputs components container label
		const inputs_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'inputs_container',
			parent			: fragment
		})
		lock_items.push(inputs_container)

		// inputs_container_caption (Values)
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'inputs_container_caption',
			inner_html		: get_label.values || 'Values',
			parent			: inputs_container
		})

		// service_tmp_section
		const inputs_nodes = await self.service_tmp_section.render()
		inputs_container.appendChild(inputs_nodes)

	// response_message
		const response_message = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'response_message',
			parent			: fragment
		})

	// buttons_bottom_container
		const buttons_bottom_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'buttons_bottom_container success',
			parent			: fragment
		})
		lock_items.push(buttons_bottom_container)

	// button process import
		const button_process_import = ui.create_dom_element({
			element_type	: 'button',
			class_name		: 'button_process_import success loading', // create with loading class
			inner_html		: get_label.import || 'IMPORT',
			parent			: buttons_bottom_container
		})
		button_process_import.addEventListener('click', async function(e){
			e.stopPropagation()

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
			const components_temp_data = self.service_tmp_section.get_components_data()

			// get the global configuration (to apply in the server)
			self.tool_config.import_file_name_mode = (self.tool_config.import_mode === 'section' && control_section_id_check_box.checked)
				? 'enumerate'
				: (self.tool_config.import_mode === 'section' && same_name_check_box.checked)
					? 'named'
					: null

			// API request
				const api_response = await self.import_files({
					components_temp_data : components_temp_data
				})
				self.node.classList.remove('loading')

				// error case
				if (!api_response.result) {
					const msg = "Error importing files " + (api_response.msg || 'Unknown')
					alert(msg);
					return
				}

			// update_process_status
				update_process_status({
					pid			: api_response.pid,
					pfile		: api_response.pfile,
					process_id	: process_id,
					container	: response_message,
					lock_items	: lock_items,
					self		: self
				})

			/*
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
							background_running		: true, // set run in background CLI
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
						.then(function(api_response){

							if(SHOW_DEBUG===true) {
								console.warn("-> API api_response:",api_response);
							}
							// change the loading to content_data to show message
							self.node.classList.remove('loading')
							self.node.content_data.classList.add('loading')
							// get message
							const msg = (api_response.result===true)
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

							resolve(api_response)
						})
					})
				*/
		})//end button_process_import.addEventListener('click',)
		// drop_zone_success. On upload file success, re-activate button
		event_manager.subscribe('drop_zone_success',() => {
			button_process_import.classList.remove('loading')
		})
		// on reload page, if files_data exists, activate button
		if(self.files_data.length > 0){
			button_process_import.classList.remove('loading')
		}

	// check process status always
		const check_process_data = () => {
			data_manager.get_local_db_data(
				process_id,
				'status'
			)
			.then(function(local_data){
				if (local_data && local_data.value) {
					update_process_status({
						pid			: local_data.value.pid,
						pfile		: local_data.value.pfile,
						process_id	: process_id,
						container	: response_message,
						lock_items	: lock_items,
						self		: self
					})
				}
			})
		}
		check_process_data()

	// content_data
		const content_data = ui.tool.build_content_data(self)
		content_data.appendChild(fragment)


	return content_data
}//end get_content_data_edit



/**
* RENDER_OPTIONS_CONTAINER
* @param object self
* 	component instance
* @return HTMLElement options_container
*/
const render_options_container = function (self) {

	// options_container
		const options_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'options_container'
		})

	// filter processor options of the files, it could be defined in the preferences or could be the caller
		const ar_file_processor = self.tool_config.file_processor || null
		if(ar_file_processor){

			const processor = ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'processor',
				parent			: options_container
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
					class_name		: 'component select',
					parent			: processor
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

	// component options to store the file, normally the component_portal,
	// it could be defined in the preferences or could be the caller
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
				class_name		: 'target_componet',
				parent			: options_container
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
				class_name		: 'component select',
				parent			: target_componet
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
			self.custom_target_quality		= default_target_quality || null

			const target_componet = ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'target_componet',
				parent			: options_container
			})

			// label
				const quality_label = self.get_tool_label('quality') || 'Quality'
				ui.create_dom_element({
					element_type	: 'label',
					class_name		: 'quality label',
					inner_html		: quality_label + ': ',
					parent			: target_componet
				})

			// select_quality. options process
				const select_quality = ui.create_dom_element({
					element_type	: 'select',
					class_name		: 'component select',
					parent			: target_componet
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
				parent			: options_container
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

					// label_section_id_check_box
						ui.create_dom_element({
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

					// label_same_name_check_box
						ui.create_dom_element({
							element_type	: 'span',
							class_name		: 'checkbox-label',
							inner_html		: get_label.same_name_same_record || 'Same name same record',
							parent			: same_name_same_section
						})


	return options_container
}//end render_options_container



/**
* UPDATE_PROCESS_STATUS
* Call API get_process_status and render the info nodes
* @param object options
* @return void
*/
const update_process_status = (options) => {

	const pid			= options.pid
	const pfile			= options.pfile
	const process_id	= options.process_id
	const container		= options.container
	const lock_items	= options.lock_items
	const self			= options.self

	// locks lock_items
	lock_items.map(el =>{
		el.classList.add('loading')
	})

	// blur button
	document.activeElement.blur()

	// clean container
	while (container.firstChild) {
		container.removeChild(container.firstChild);
	}

	// get_process_status from API and returns a SEE stream
	data_manager.request_stream({
		body : {
			dd_api		: 'dd_utils_api',
			action		: 'get_process_status',
			update_rate	: 1000, // int milliseconds
			options		: {
				pid		: pid,
				pfile	: pfile
			}
		}
	})
	.then(function(stream){

		// render base nodes and set functions to manage
		// the stream reader events
		const render_response = render_stream({
			container		: container,
			id				: process_id,
			pid				: pid,
			pfile			: pfile,
			display_json	: true
		})

		// average process time for record
			const ar_samples = []
			const get_average = (arr) => {
				let sum = 0;
				const arr_length = arr.length;
				for (let i = 0; i < arr_length; i++) {
					sum += arr[i];
				}
				return Math.ceil( sum / arr_length );
			}

		// on_read event (called on every chunk from stream reader)
		const on_read = (sse_response) => {

			// fire update_info_node on every reader read chunk
			render_response.update_info_node(sse_response, (info_node) => {

				const is_running = sse_response?.is_running ?? true

				if (is_running===false) {
					if (sse_response.data.errors && sse_response.data.errors.length>0) {
						ui.create_dom_element({
							element_type	: 'div',
							class_name		: 'container error',
							inner_html		: sse_response.data.errors.join('<br>'),
							parent			: container
						})
					}
				}

				const compound_msg = (sse_response) => {
					const data = sse_response.data
					const parts = []
					parts.push(data.msg)
					if (data.counter) {
						parts.push(data.counter +' '+ (get_label.of || 'of') +' '+ data.total)
					}
					if (data.total_ms) {
						parts.push( time_unit_auto(data.total_ms) )
					}else{
						parts.push(sse_response.total_time)
					}
					if (data.current_time) {
						// save in samples array to make average
						if (ar_samples.length>100) {
							ar_samples.shift() // remove older element
						}
						ar_samples.push(data.current_time)

						const average			= get_average(ar_samples)
						const remaining_ms		= ((data.total - data.counter) * average)
						const remaining_time	= time_unit_auto(remaining_ms)
						parts.push('Time remaining: ' + remaining_time)
					}

					return parts.join(' | ')
				}

				const msg = sse_response
							&& sse_response.data
							&& sse_response.data.msg
							&& sse_response.data.msg.length>5
					? compound_msg(sse_response)
					: is_running
						? 'Process running... please wait'
						: 'Process completed in ' + sse_response.total_time

				if(!info_node.msg_node) {
					info_node.msg_node = ui.create_dom_element({
						element_type	: 'div',
						class_name		: 'msg_node' + (is_running===false ? ' done' : ''),
						parent			: info_node
					})
				}
				ui.update_node_content(info_node.msg_node, msg)
			})
		}

		// on_done event (called once at finish or cancel the stream read)
		const on_done = () => {
			// is triggered at the reader's closing
			render_response.done()
			// unlock lock_items
			lock_items.map(el =>{
				el.classList.remove('loading')
			})

			// service_dropzone. Clean files list
			self.service_dropzone.reset_dropzone();

			// de-activate button_process_import
			const button_process_import = document.querySelector('.button_process_import')
			if (button_process_import) {
				button_process_import.classList.add('loading')
			}
		}

		// read stream. Creates ReadableStream that fire
		// 'on_read' function on each stream chunk at update_rate
		// (1 second default) until stream is done (PID is no longer running)
		data_manager.read_stream(stream, on_read, on_done)

		// scroll down page
		setTimeout(function(){
			// window.scrollTo(0, document.body.scrollHeight);
			window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })
		}, 25)
	})
}//end update_process_status



/**
* SET_IMPORT_MODE
* @param object self
* @param bool apply
* @return bool
*/
const set_import_mode = function (self, apply) {

	const files_data		= self.files_data || []
	const files_data_length	= files_data.length
	for (let i = 0; i < files_data_length; i++) {

		const current_value = files_data[i]

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



// @license-end

