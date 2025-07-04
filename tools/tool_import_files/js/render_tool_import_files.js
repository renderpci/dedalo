// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_ROOT_WEB Dropzone */
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../../core/common/js/ui.js'
	import {time_unit_auto} from '../../../core/common/js/utils/index.js'
	import {data_manager} from '../../../core/common/js/data_manager.js'
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

	// content_data
		const content_data = ui.tool.build_content_data(self)

	// short vars
		const ar_file_processor	= self.tool_config.file_processor || null
		const local_db_id		= 'process_import_files_' + self.section_tipo
		const lock_items		= []

	// options_container
		const options_container = render_options_container(self, content_data)
		lock_items.push(options_container)
		content_data.appendChild(options_container)

	// drop_zone
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'drop_zone',
			parent			: content_data
		})

	// template_container
		const template_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'template_container',
			parent			: content_data
		})
		lock_items.push(template_container)

		const template = await self.service_dropzone.render()
		template_container.appendChild(template)

		content_data.template_container = template_container

	// inputs components container label
		const inputs_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'inputs_container',
			parent			: content_data
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
			parent			: content_data
		})

	// buttons_bottom_container
		const buttons_bottom_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'buttons_bottom_container success',
			parent			: content_data
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
					self.files_data[i].file_processor = current_value.previewElement.querySelector(".file_processor_select").value === 'null'
					? null
					: current_value.previewElement.querySelector(".file_processor_select").value
				}
				self.files_data[i].component_option = current_value.previewElement.querySelector(".option_component_select").value;
			}
			// get the data from every component used to propagate to every file uploaded
			const components_temp_data = self.service_tmp_section.get_components_data()

			// get the global configuration (to apply in the server)
			const is_section_or_direct_mode = ['section', 'direct'].includes(self.tool_config.import_mode);
			self.tool_config.import_file_name_mode = ( is_section_or_direct_mode && options_container.control_section_id_check_box.checked)
				? 'enumerate'
				: (is_section_or_direct_mode && options_container.same_name_check_box.checked)
					? 'named'
					: null

			// match is active
			// when match is active all previous set will be overwrite.
			// !! This mode is incompatible with other options
			self.tool_config.import_file_name_mode = !options_container.name_with_id_match_check_box.checked
				? self.tool_config.import_file_name_mode
				: 'match'

			self.tool_config.import_file_name_mode = !options_container.free_name_match_check_box.checked
				? self.tool_config.import_file_name_mode
				: 'match_freename'

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
					local_db_id	: local_db_id,
					container	: response_message,
					lock_items	: lock_items,
					self		: self
				})
		})//end button_process_import.addEventListener('click')

		// drop_zone_success. On upload file success, re-activate button
		const drop_zone_success_handler = () => {
			button_process_import.classList.remove('loading')
		}
		self.events_tokens.push(
			event_manager.subscribe('drop_zone_success', drop_zone_success_handler)
		)

		// on reload page, if files_data exists, activate button
		if(self.files_data.length > 0){
			button_process_import.classList.remove('loading')
		}

	// check process status always
		const check_process_data = () => {
			data_manager.get_local_db_data(
				local_db_id,
				'status'
			)
			.then(function(local_data){
				if (local_data && local_data.value) {
					update_process_status({
						pid			: local_data.value.pid,
						pfile		: local_data.value.pfile,
						local_db_id	: local_db_id,
						container	: response_message,
						lock_items	: lock_items,
						self		: self
					})
				}
			})
		}
		check_process_data()


	return content_data
}//end get_content_data_edit



/**
* RENDER_OPTIONS_CONTAINER
* @param object self
* 	component instance
* @param HTMLElement content_data
* @return HTMLElement options_container
*/
const render_options_container = function (self, content_data) {

	// component options to store the file, normally the component_portal,
	// it could be defined in the preferences or it could be the caller
	const ddo_option_components = self.tool_config.ddo_map.filter(el => el.role === 'component_option')
	const option_components = (ddo_option_components.length > 0)
		? ddo_option_components
		: [{
			role				: 'component_option',
			tipo				: self.caller.tipo,
			map_name			: null,
			label				: self.caller.label,
			section_id			: 'self',
			section_tipo		: self.caller.tipo,
			target_section_tipo	: self.tool_config.ddo_map.find(el => el.role === 'target_component').section_tipo
		  }]

	// options_container
	const options_container = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'options_container'
	})

	// processor
	// file processor options of the files, it could be defined in the preferences or could be the caller
	const file_processor_options = self.tool_config?.file_processor;
	if(file_processor_options){
		const processor_selector_container = render_file_processor_selector(self, options_container, file_processor_options);
		options_container.appendChild(processor_selector_container)
		// set pointer
		options_container.processor = processor_selector_container
	}

	// target field
	const target_field_selector_container = render_target_field_selector(self, options_container, option_components);
	options_container.appendChild(target_field_selector_container)
	// set pointer
	options_container.target_component = target_field_selector_container

	// quality
	// Define the quality target to upload the files
	const features = self.target_component_context.features || null
	if(features){

		const ar_quality				= features.ar_quality || ['original']
		const default_target_quality	= features.default_target_quality || 'original'
		self.custom_target_quality		= default_target_quality || null

		const quality_selector_container = render_quality_selector(self, options_container, ar_quality, default_target_quality)
		options_container.appendChild(quality_selector_container)
	}//end if(features)

	// matching options
	// name_match previous uploaded images.
	// Note that this options are rendered always but are only displayed for 'section' and 'direct' import modes
	const matching_options_container = render_matching_options(self, options_container, content_data)
	options_container.appendChild(matching_options_container)

	// configuration options
	// Includes check-boxes for name, section_id, same name
	const tool_configuration_options_container = render_configuration_options(self, options_container, content_data, option_components)
	options_container.appendChild(tool_configuration_options_container)


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
	const local_db_id	= options.local_db_id
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
			container	: container,
			id			: local_db_id,
			pid			: pid,
			pfile		: pfile
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
* Updates DOM options selectors
* @param object self
*  tool instance
* @param bool apply
* @return bool
*/
const set_import_mode = function (self, apply) {

	const files_data		= self.files_data || []
	const files_data_length	= files_data.length
	for (let i = 0; i < files_data_length; i++) {

		const current_value = files_data[i]

		// current element selector options node
		const option_component_select = current_value.previewElement.querySelector('.option_component_select')

		if(apply===true){

			const regex = /^(.*?)-(.*?)-?([a-zA-Z]{1,2})\.([a-zA-Z]{3,4})$/gm;
			// const name = current_value.name; //`123 85-456 fd-a.jpg`;
			const map_name = regex.exec(current_value.name)
			if ( map_name!==null && map_name[3]!==null ) {

				const map_name_upper = map_name[3].toUpperCase();
				const target_portal = self.tool_config.ddo_map.find(el => el.role==='component_option' && el.map_name.toUpperCase()===map_name_upper)
				if (target_portal && option_component_select) {
					option_component_select.value = target_portal.tipo
				}
			}
		}else{

			if (option_component_select) {
				const default_target_portal	= self.tool_config.ddo_map.find(el => el.role === 'component_option' && el.default === true)
				if(default_target_portal){
					option_component_select.value = default_target_portal.tipo
				}else{
					// note that option_component_select.options may not exists
					if (option_component_select.options[0]) {
						option_component_select.options[0].selected = true
					}
				}
			}
		}
	}


	return true
}//end set_import_mode



/**
* RENDER_FILE_PROCESSOR_SELECTOR
* Renders the file processor selector with given options
* @param object self instance of the tool
* @param HTMLElement options_container (used for link nodes access)
* @param array file_processor_options
* @return HTMLElement processor_selector_container
*/
export const render_file_processor_selector = function (self, options_container, file_processor_options) {

	const processor_selector_container = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'processor_selector_container'
	})

	// label
	const label = self.get_tool_label('file_processor') || 'Processor'
	ui.create_dom_element({
		element_type	: 'label',
		class_name		: 'processor label',
		inner_html		: label + ': ',
		parent			: processor_selector_container
	})

	// select_process
	const select_process = ui.create_dom_element({
		element_type	: 'select',
		class_name		: 'component select',
		parent			: processor_selector_container
	})
	// change event handler
	const select_process_change_handler = () => {
		const file_processor_nodes = document.querySelectorAll('select.file_processor_select')
		const len = file_processor_nodes.length
		for (let i = len - 1; i >= 0; i--) {
			file_processor_nodes[i].value = select_process.value
		}
	}
	select_process.addEventListener('change', select_process_change_handler)

	// default option
	const default_option_node = new Option('', null, true, false);
	select_process.appendChild(default_option_node)

	// other options
	const file_processor_options_length = file_processor_options?.length
	for (let i = 0; i < file_processor_options_length; i++) {

		const option = file_processor_options[i]

		if (!option || !option.function_name) {
			console.warn(`Invalid option at index ${i}:`, option);
			continue;
		}

		const option_procesor_node = ui.create_dom_element({
			element_type	: 'option',
			class_name		: 'component select',
			inner_html		: self.get_tool_label(option.function_name),
			parent			: select_process
		})
		option_procesor_node.value = option.function_name
	}//end for (let i = 0; i < file_processor_options.length; i++)


	return processor_selector_container
}//end render_file_processor_selector



/**
* RENDER_TARGET_FIELD_SELECTOR
* Renders the target field selector with given options
* @param object self instance of the tool
* @param HTMLElement options_container (used for link nodes access)
* @param array option_components
* @return HTMLElement target_field_selector_container
*/
export const render_target_field_selector = function (self, options_container, option_components) {

	// target_component
	const target_field_selector_container = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'target_component'
	})

	// label
	const target_component_label = self.get_tool_label('target_component') || 'Target field'
	ui.create_dom_element({
		element_type	: 'label',
		class_name		: 'target_component label',
		inner_html		: target_component_label + ': ',
		parent			: target_field_selector_container
	})

	// select_options
	const select_options = ui.create_dom_element({
		element_type	: 'select',
		class_name		: 'component select',
		parent			: target_field_selector_container
	})
	// set pointer
	options_container.select_options = select_options
	// change event handler
	const change_handler = () => {
		const option_component_nodes = document.querySelectorAll('select.option_component_select')
		const len = option_component_nodes.length
		for (let i = len - 1; i >= 0; i--) {
			option_component_nodes[i].value = select_options.value
		}
	}
	select_options.addEventListener('change', change_handler)

	// options
	for (let i = 0; i < option_components.length; i++) {

		const option = option_components[i]

		if (!option || !option.tipo) {
			console.warn(`Invalid option at index ${i}:`, option);
			continue;
		}

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


	return target_field_selector_container
}//end render_target_field_selector



/**
* RENDER_QUALITY_SELECTOR
* Renders the quality selector with given options
* @param object self instance of the tool
* @param HTMLElement options_container (used for link nodes access)
* @param array ar_quality
* @param string default_target_quality
* @return HTMLElement quality_selector_container
*/
export const render_quality_selector = function (self, options_container, ar_quality, default_target_quality) {

	// target_quality
	const quality_selector_container = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'target_quality'
	})

	// label
	const quality_label = self.get_tool_label('quality') || 'Quality'
	ui.create_dom_element({
		element_type	: 'label',
		class_name		: 'quality label',
		inner_html		: quality_label + ': ',
		parent			: quality_selector_container
	})

	// select_quality. options process
	const select_quality = ui.create_dom_element({
		element_type	: 'select',
		class_name		: 'component select',
		parent			: quality_selector_container
	})
	// set pointer
	options_container.select_quality = select_quality
	// change event handler
	const change_handler = () => {
		self.custom_target_quality = select_quality.value
	}
	select_quality.addEventListener('change', change_handler)

	// default option
	const default_option_node = new Option(default_target_quality, default_target_quality, true, true);
	select_quality.appendChild(default_option_node)

	// other options
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
	}//end for (let i = 0; i < ar_quality.length; i++)


	return quality_selector_container
}//end render_quality_selector



/**
* RENDER_MATCHING_OPTIONS
* Renders the matching options with given options
* @param object self instance of the tool
* @param HTMLElement options_container (used for link nodes access)
* @param HTMLElement content_data
* @return HTMLElement matching_options_container
*/
export const render_matching_options = function (self, options_container, content_data) {

	// file name control
	// hide the options when the tool is caller by components, the import_mode is defined in preferences.
	const import_mode = self.tool_config?.import_mode

	// matching_options_container
	const matching_options_container = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'tool_name_match_options'
	})
	if (!['section'].includes(import_mode)) {
		matching_options_container.classList.add('hide')
	}

	// replace_existing_images_label
	ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'label title',
		inner_html		: self.get_tool_label('replace_existing_files') || 'Replace existing files',
		parent			: matching_options_container
	})

	// tool_name_match_label
	ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'label match',
		inner_html		: self.get_tool_label('match_name_with_previous_upload') || 'Matching the name with a previous upload:',
		parent			: matching_options_container
	})


	// name_match_id
	const name_match_id = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'name_control name_match',
		parent			: matching_options_container
	})

	// switcher name_match id
	const name_match_switcher = ui.create_dom_element({
		element_type	: 'label',
		class_name		: 'switcher text_unselectable',
		parent			: name_match_id
	})
	// check_box
	const name_with_id_match_check_box = ui.create_dom_element({
		element_type	: 'input',
		type			: 'checkbox',
		class_name		: 'ios-toggle',
		parent			: name_match_switcher
	})
	// event change
	const name_with_id_match_check_box_change_handler = () => {
		options_container.control_field_check_box.checked		= false
		options_container.same_name_check_box.checked			= false
		options_container.control_section_id_check_box.checked	= false
		options_container.free_name_match_check_box.checked		= false
		content_data.template_container.classList.remove('name_id','same_name_section','match_freename')
		if(name_with_id_match_check_box.checked === true){
			content_data.template_container.classList.add('match')
			if(options_container.processor){
				options_container.processor.classList.add('lock')
			}
			if(options_container.target_component){
				options_container.target_component.classList.add('lock')
			}
		}else{
			content_data.template_container.classList.remove('match')
			if(options_container.processor){
				options_container.processor.classList.remove('lock')
			}
			if(options_container.target_component){
				options_container.target_component.classList.remove('lock')
			}
		}
	}
	name_with_id_match_check_box.addEventListener('change', name_with_id_match_check_box_change_handler)
	// switch_label
	ui.create_dom_element({
		element_type	: 'i',
		parent			: name_match_switcher
	})

	// label_section_id_check_box
	ui.create_dom_element({
		element_type	: 'span',
		class_name		: 'checkbox-label',
		inner_html		: self.get_tool_label('matching_id') || 'Matching ID',
		parent			: name_match_id
	})
	// set the node to be used when data will send to server
	options_container.name_with_id_match_check_box = name_with_id_match_check_box

	// name_match_container
	const name_match_container = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'name_control name_match',
		parent			: matching_options_container
	})

	// switcher free names
	const free_names_match_switcher = ui.create_dom_element({
		element_type	: 'label',
		class_name		: 'switcher text_unselectable',
		parent			: name_match_container
	})
	// check_box
	const free_name_match_check_box = ui.create_dom_element({
		element_type	: 'input',
		type			: 'checkbox',
		class_name		: 'ios-toggle',
		parent			: free_names_match_switcher
	})
	// set pointer. Set the node to be used when data will send to server
	options_container.free_name_match_check_box = free_name_match_check_box
	// change event
	const free_name_match_check_box_change_handler = () => {
		options_container.control_field_check_box.checked		= false
		options_container.same_name_check_box.checked			= false
		options_container.control_section_id_check_box.checked	= false
		options_container.name_with_id_match_check_box.checked	= false
		content_data.template_container.classList.remove('name_id','same_name_section','match')
		if(free_name_match_check_box.checked === true){
			content_data.template_container.classList.add('match_freename')
			if(options_container.processor){
				options_container.processor.classList.add('lock')
			}
			if(options_container.target_component){
				options_container.target_component.classList.add('lock')
			}
		}else{
			content_data.template_container.classList.remove('match_freename')
			if(options_container.processor){
				options_container.processor.classList.remove('lock')
			}
			if(options_container.target_component){
				options_container.target_component.classList.remove('lock')
			}
		}
	}
	free_name_match_check_box.addEventListener('change', free_name_match_check_box_change_handler)
	// switch_label
	ui.create_dom_element({
		element_type	: 'i',
		parent			: free_names_match_switcher
	})
	// label_section_id_check_box
	ui.create_dom_element({
		element_type	: 'span',
		class_name		: 'checkbox-label',
		inner_html		: self.get_tool_label('matching_name') || 'Matching name',
		parent			: name_match_container
	})


	return matching_options_container
}//end render_matching_options



/**
* RENDER_CONFIGURATION_OPTIONS
* Renders the configuration options with given options
* @param object self instance of the tool
* @param HTMLElement options_container (used for link nodes access)
* @param HTMLElement content_data
* @param array option_components
* @return HTMLElement tool_configuration_options_container
*/
export const render_configuration_options = function (self, options_container, content_data, option_components) {

	// file name control
	// hide the options when the tool is caller by components, the import_mode is defined in preferences.
	const import_mode = self.tool_config?.import_mode

	// tool_configuration_options_container
	const tool_configuration_options_container = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'tool_configuration_options'
	})
	if (!['section','direct'].includes(import_mode)) {
		tool_configuration_options_container.classList.add('hide')
	}

	// new_files_label
	ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'label title',
		inner_html		: self.get_tool_label('new_files') || 'New files',
		parent			: tool_configuration_options_container
	})

	// NAME (Suffix indicates field)

		// name_control_field
		const name_control_field = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'name_control name_control_field',
			parent			: tool_configuration_options_container
		})
		if (import_mode==='direct') {
			name_control_field.classList.add('hide')
		}

		// switcher
		const control_field_switcher = ui.create_dom_element({
			element_type	: 'label',
			class_name		: 'switcher text_unselectable',
			parent			: name_control_field
		})

		// control_field_check_box
		const control_field_check_box = ui.create_dom_element({
			element_type	: 'input',
			type			: 'checkbox',
			parent			: control_field_switcher
		})
		// set pointer
		options_container.control_field_check_box = control_field_check_box
		// change event
		const control_field_check_box_change_handler = () => {
			// match deactivate
				options_container.name_with_id_match_check_box.checked	= false
				options_container.free_name_match_check_box.checked		= false
				if(options_container.processor){
					options_container.processor.classList.remove('lock')
				}
				if(options_container.target_component){
					options_container.target_component.classList.remove('lock')
				}
			content_data.template_container.classList.remove('match','match_freename')

			set_import_mode(self, control_field_check_box.checked)
		}
		control_field_check_box.addEventListener('change', control_field_check_box_change_handler)
		// when the images was added (drop) set the import mode
		// (check the name and assign the field)
		const drop_zone_addedfile_handler = () => {
			set_import_mode(self, control_field_check_box.checked)
		}
		self.events_tokens.push(
			event_manager.subscribe('drop_zone_addedfile', drop_zone_addedfile_handler)
		)
		// switch_label
		ui.create_dom_element({
			element_type	: 'i',
			parent			: control_field_switcher
		})
		// label_field_check_box
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'checkbox-label',
			inner_html		: get_label.name_to_field || 'Suffix indicates field',
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
			const map_name	= option.map_name ? `- ${option.map_name} -> ` : ''

			// option_node
			ui.create_dom_element({
				element_type	: 'option',
				inner_html		: map_name + option.label,
				parent			: info_options
			})
		}//end for (let i = 0; i < option_components.length; i++)

	// SECTION ID (Prefix indicates id)

		// name_control_to_section_id
		const name_control_section_id = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'name_control name_control_section_id',
			parent			: tool_configuration_options_container
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
		// set pointer. Set the node to be used when data will send to server
		options_container.control_section_id_check_box = control_section_id_check_box
		// change event
		const control_section_id_check_box_change_handler = () => {
			// match deactivate
			options_container.name_with_id_match_check_box.checked	= false
			options_container.free_name_match_check_box.checked		= false
			if(options_container.processor){
				options_container.processor.classList.remove('lock')
			}
			if(options_container.target_component){
				options_container.target_component.classList.remove('lock')
			}
			content_data.template_container.classList.remove('match','match_freename')
			if(control_section_id_check_box.checked){
				content_data.template_container.classList.add('name_id')
			}else{
				content_data.template_container.classList.remove('name_id')
			}
			if(options_container.same_name_check_box.checked){
				options_container.same_name_check_box.checked = false
				content_data.template_container.classList.remove('same_name_section')
			}
		}
		control_section_id_check_box.addEventListener('change', control_section_id_check_box_change_handler)
		// switch_label
		ui.create_dom_element({
			element_type	: 'i',
			parent			: control_section_id_switcher
		})
		// label_section_id_check_box
		const current_label = import_mode==='direct'
			? self.get_tool_label('name_indicates_id') || 'Name indicates id'
			: get_label.name_to_record_id || 'Prefix indicates id'
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'checkbox-label',
			inner_html		: current_label,
			parent			: name_control_section_id
		})

	// SAME NAME (Same name same record. Create new ID)

		// same_name_same_section
		const same_name_same_section = ui.create_dom_element({
			element_type	: 'div',
			class_name 		: 'name_control same_name_same_section',
			parent 			: tool_configuration_options_container
		})
		if (import_mode==='direct') {
			same_name_same_section.classList.add('hide')
		}

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
		// set pointer. Set the node to be used when data will send to server
		options_container.same_name_check_box = same_name_check_box
		// change event
		const same_name_check_box_change_handler = () => {
			// match deactivate
				options_container.name_with_id_match_check_box.checked	= false
				options_container.free_name_match_check_box.checked		= false
				if(options_container.processor){
					options_container.processor.classList.remove('lock')
				}
				if(options_container.target_component){
					options_container.target_component.classList.remove('lock')
				}
			content_data.template_container.classList.remove('match','match_freename')
			if(control_section_id_check_box.checked){
				control_section_id_check_box.checked = false
				content_data.template_container.classList.remove('name_id')
			}
			if(same_name_check_box.checked){
				content_data.template_container.classList.add('same_name_section')
			}else{
				content_data.template_container.classList.remove('same_name_section')
			}
		}
		same_name_check_box.addEventListener('change', same_name_check_box_change_handler)
		// switch_label
		ui.create_dom_element({
			element_type	: 'i',
			parent			: same_name_same_section_switcher
		})
		// label_same_name_check_box
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'checkbox-label',
			inner_html		: get_label.same_name_same_record || 'Same name same record. Create new ID',
			parent			: same_name_same_section
		})


	return tool_configuration_options_container
}//end render_configuration_options



// @license-end
