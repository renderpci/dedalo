/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, tool_import_dedalo_csv */
/*eslint no-undef: "error"*/



// imports
	// import {event_manager} from '../../../core/common/js/event_manager.js'
	import {validate_tipo} from '../../../core/common/js/common.js'
	import {ui} from '../../../core/common/js/ui.js'



/**
* RENDER_TOOL_import_dedalo_csv
* Manages the component's logic and appearance in client side
*/
export const render_tool_import_dedalo_csv = function() {

	return true
}//end render_tool_import_dedalo_csv



/**
* TOOL_IMPORT_DEDALO_CSV
* Render tool DOM nodes
* This function is called by render common attached in 'tool_import_dedalo_csv.js'
* @param object options
* @return DOM node
*/
render_tool_import_dedalo_csv.prototype.edit = async function(options) {

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

	// service_upload
		// Use the service_upload to get and render the button to upload the file,
		// get functionality defined (drag, drop, create folder, etc..)
		// service_upload_container
		const service_upload_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'service_upload_container'
		})
		// spinner
		const spinner = ui.create_dom_element({
			element_type	: 'div',
			class_name		: "spinner",
			parent : service_upload_container
		})
		wrapper.tool_header.after(service_upload_container)
		// service_upload. Build and render
		self.service_upload.build()
		.then(function(){
			self.service_upload.render()
			.then(function(tool_upload_node){
				// clean node
				// while (service_upload_container.firstChild) {
				// 	service_upload_container.removeChild(service_upload_container.firstChild);
				// }
				service_upload_container.appendChild(tool_upload_node)
				spinner.remove()
			})
		})


	// modal container
		// if (!window.opener) {
		// 	const header	= wrapper.tool_header // is created by ui.tool.build_wrapper_edit
		// 	const modal		= ui.attach_to_modal(header, wrapper, null, 'big')
		// 	modal.on_close	= () => {
		// 		// when closing the modal, common destroy is called to remove tool and elements instances
		// 		self.destroy(true, true, true)
		// 	}
		// }


	return wrapper
}//end tool_import_dedalo_csv



/**
* GET_CONTENT_DATA
* Render tool body or 'content_data'
* @param instance self
* @return DOM node content_data
*/
const get_content_data = async function(self) {

	const fragment = new DocumentFragment()

	// process_file
		const process_file = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'process_file',
			parent			: fragment
		})
		self.process_file = process_file

	// user_msg_container
		const user_msg_container = ui.create_dom_element({
			element_type	: 'div',
			class_name 		: 'user_msg_container',
			parent 			: fragment
		})
		self.user_msg_container = user_msg_container

	// files_list
		const files_list = ui.create_dom_element({
			element_type	: 'div',
			class_name 		: 'files_list',
			parent 			: fragment
		})
		const csv_files_list_length = self.csv_files_list.length
		for (let i = 0; i < csv_files_list_length; i++) {
			const item		= self.csv_files_list[i]
			const file_info	= render_file_info(self, item)
			files_list.appendChild(file_info)
		}

	// submit_container
		const submit_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'submit_container',
			parent			: fragment
		})

		// import_button
			const import_button = ui.create_dom_element({
				element_type	: 'button',
				class_name		: 'warning import_button',
				inner_html		: get_label.importar || 'Import',
				parent			: submit_container
			})
			import_button.addEventListener('click', function(){

				// selected files
					const selected_files = self.csv_files_list.filter(el => el.checked===true)
					if (selected_files.length<1) {
						alert( get_label.seleccione_un_fichero || 'Select a file');
						return
					}
				// loading
					content_data.classList.add('loading')
					api_response.classList.add('loading')
					api_response.classList.remove('hide')
				// array of file names
					const files = selected_files.map(el => {
						return {
							file			: el.name, // string like 'exported_oral-history_-1-oh1.csv'
							section_tipo	: el.section_tipo, // string like 'oh1'
							ar_columns_map	: el.ar_columns_map // array of objects like [{checked: false, label: "", mapped_to: "", model: "", tipo: "section_id"}]
						}
					})
					// console.log("selected_files:",selected_files);
					// console.log("files:",files);

				// time_machine_save
					const time_machine_save = checkbox_time_machine_save.checked
				// import
					self.import_files(files, time_machine_save)
					.then(function(response){
						if (response.debug && response.debug.rqo) {
							response.debug.rqo = JSON.parse(response.debug.rqo)
						}

						const result_len = response.result.length

						for (var i = result_len - 1; i >= 0; i--) {
							const current_rensponse = response.result[i]
							const current_file = selected_files.find(el => el.name === current_rensponse.file && el.section_tipo === current_rensponse.section_tipo)

							const result_container = current_file.result_container || null
							if(result_container){

								const class_button_response = current_rensponse.result
									? 'success'
									: 'danger'
								const button_label = current_rensponse.result
									? get_label.ok || 'ok'
									: get_label.error || 'Error'

								const import_button = ui.create_dom_element({
									element_type	: 'div',
									class_name		: 'alert ' + class_button_response,
									inner_html		: button_label,
									parent			: result_container
								})

								const result_info_container = ui.create_dom_element({
									element_type	: 'div',
									class_name 		: 'result_info_container',
									parent			: result_container
								})

								const msg_container = ui.create_dom_element({
									element_type	: 'div',
									class_name 		: 'user_msg_container',
									inner_html		: current_rensponse.msg,
									parent			: result_info_container
								})

								if(current_rensponse.result){

									if(current_rensponse.created_rows.length>0){

										const headder = ui.create_dom_element({
											element_type	: 'div',
											class_name 		: 'headder',
											parent			: result_info_container
										})

										// const created_nodes = current_rensponse.created_rows.map(el => '<span>'+el+',</span>')
											const created_label = ui.create_dom_element({
												element_type	: 'div',
												class_name 		: 'label',
												inner_html		: get_label.created || 'Created' + ':',
												parent			: headder
											})

											const copy_to_find_button = ui.create_dom_element({
												element_type	: 'button',
												class_name		: 'warning tool_update_cache',
												inner_html		: get_label.copy_to_find || 'copy to find',
												parent			: headder
											})

											const copy_as_column_button = ui.create_dom_element({
												element_type	: 'button',
												class_name		: 'warning tool_update_cache',
												inner_html		: get_label.copy_as_column || 'copy as column',
												parent			: headder
											})


										const created_rows = ui.create_dom_element({
											element_type	: 'div',
											class_name 		: 'section_id_container',
											inner_html		: current_rensponse.created_rows.join('<br>'),
											parent			: result_info_container
										})


										copy_to_find_button.addEventListener( 'click', () => {
											navigator.clipboard.writeText(current_rensponse.created_rows.join(','))
												.then(() => {
													alert('Text copied to clipboard');
												})
												.catch(err => {
													alert('Error in copying text: ', err);
												});
										})
										copy_as_column_button.addEventListener( 'click', () => {
											navigator.clipboard.writeText(current_rensponse.created_rows.join('\n'))
												.then(() => {
													alert('Text copied to clipboard');
												})
												.catch(err => {
													alert('Error in copying text: ', err);
												});
										})
									}
									if(current_rensponse.updated_rows.length>0){
										// const updated_nodes = current_rensponse.updated_rows.map(el => '<span>'+el+',</span>')

										const headder = ui.create_dom_element({
											element_type	: 'div',
											class_name 		: 'headder',
											parent			: result_info_container
										})

											const updated_label = ui.create_dom_element({
												element_type	: 'div',
												class_name 		: 'label',
												inner_html		: get_label.updated || 'Updated' + ':',
												parent			: headder
											})

											const copy_to_find_button = ui.create_dom_element({
												element_type	: 'button',
												class_name		: 'warning tool_update_cache',
												inner_html		: get_label.copy_to_find || 'copy to find',
												parent			: headder
											})

											const copy_as_column_button = ui.create_dom_element({
												element_type	: 'button',
												class_name		: 'warning tool_update_cache',
												inner_html		: get_label.copy_as_column || 'copy as column',
												parent			: headder
											})

										const updated_rows = ui.create_dom_element({
											element_type	: 'div',
											class_name 		: 'section_id_container',
											inner_html		: current_rensponse.updated_rows.join('<br>'),
											parent			: result_info_container
										})

										copy_to_find_button.addEventListener( 'click', () => {
											navigator.clipboard.writeText(current_rensponse.updated_rows.join(','))
												.then(() => {
													alert('Text copied to clipboard');
												})
												.catch(err => {
													alert('Error in copying text: ', err);
												});
										})
										copy_as_column_button.addEventListener( 'click', () => {
											navigator.clipboard.writeText(current_rensponse.updated_rows.join('\n'))
												.then(() => {
													alert('Text copied to clipboard');
												})
												.catch(err => {
													alert('Error in copying text: ', err);
												});
										})
									}
								}



							}

						}


						api_response.innerHTML = JSON.stringify(response, null, 2)
						content_data.classList.remove('loading')
						api_response.classList.remove('loading')
					})
			})

		// checkbox_time_machine_save
			const checkbox_label = ui.create_dom_element({
				element_type	: 'label',
				class_name		: 'checkbox_label',
				inner_html		: 'Save time machine history on import',
				parent			: submit_container
			})
			const checkbox_time_machine_save = ui.create_dom_element({
				element_type	: 'input',
				type			: 'checkbox',
				class_name		: 'checkbox_time_machine_save'
			})
			checkbox_time_machine_save.checked = 'checked' // default is checked
			checkbox_label.prepend(checkbox_time_machine_save)

		// api_response
			const api_response = ui.create_dom_element({
				element_type	: 'pre',
				class_name		: 'api_response hide',
				parent			: fragment
			})

	// content_data
		const content_data = ui.tool.build_content_data(self)
		content_data.appendChild(fragment)


	return content_data
}//end get_content_data



/**
* RENDER_FILE_INFO
* @return DOM node item_wrapper
*/
const render_file_info = function(self, item) {

	const fragment = new DocumentFragment()

	// file_line
		const file_line = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'file_line',
			parent			: fragment
		})

		// icon file
			ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'button csv',
				parent			: file_line
			})

		// checkbox
			const checkbox_label = ui.create_dom_element({
				element_type	: 'label',
				class_name		: 'checkbox_label',
				inner_html		: item.name,
				parent			: file_line
			})
			const checkbox_file_selection = ui.create_dom_element({
				element_type	: 'input',
				type			: 'checkbox',
				value			: item.dir + '/' + item.name,
				class_name		: ''
			})
			checkbox_file_selection.addEventListener("change", function(){
				item.checked = checkbox_file_selection.checked ? true : false
			})
			checkbox_label.prepend(checkbox_file_selection)

		// section_tipo
			const regex			= /.*-([a-z0-9]{3,}) ?.*\.csv/g;
			const res			= regex.exec(item.name)
			const section_tipo	= (res && res[1]) ? res[1] : null
			const section_tipo_label = ui.create_dom_element({
				element_type	: 'label',
				class_name		: 'section_tipo_label',
				inner_html		: 'section tipo',
				parent			: file_line
			})
			const input_section_tipo = ui.create_dom_element({
				element_type	: 'input',
				type			: 'text',
				value			: section_tipo,
				class_name		: 'input_section_tipo',
				parent			: section_tipo_label
			})
			item.section_tipo = section_tipo // assign to item
			input_section_tipo.addEventListener('keyup', function(){
				item.section_tipo = input_section_tipo.value // update item value
				update_section_warn()
			})
			function update_section_warn() {

				// clean columns_maper
				while (columns_maper.firstChild) {
					columns_maper.removeChild(columns_maper.firstChild);
				}

				const valid_section_tipo = validate_tipo(item.section_tipo)
				if (!valid_section_tipo) {
					section_warn.classList.remove('hide')
					section_warn.innerHTML = 'Autodetected file section tipo "'+section_tipo+'" appears to be invalid.'
				}else{
					section_warn.classList.add('hide')
					// render again columns_maper
					render_columns_mapper(self, item)
					.then(function(columns_list){
						columns_maper.appendChild(columns_list)
					})
				}
			}
			// const section_warn = (!section_tipo)
			// 	? 'Unable to autodetected file section tipo "'+section_tipo+'" using name file. Remember, only current ('+self.caller.tipo+') is accepted'
			// 	: (section_tipo!==self.caller.tipo)
			// 		? 'Autodetected file section tipo "'+section_tipo+'" appears to be invalid. Remember, only current ('+self.caller.tipo+') is accepted'
			// 		: false

		// icon delete
			const icon_delete = ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'button delete',
				parent			: file_line
			})
			icon_delete.addEventListener("click", function(){
				if(confirm(get_label.seguro || 'Sure?')) {
					// remove file
					self.remove_file(item)
					.then(function(){
						self.refresh()
					})
				}
			})

	// section_tipo input
		const section_warn = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'warning error hide',
			parent			: fragment
		})
		// update_section_warn()

	// info
		// const info_text = `Records: ${item.n_records} - Columns: ${item.n_columns} - Header:<br><span class="columns">` + item.file_info.join(', ') + '</span>'
		const info_text = `Records: ${item.n_records} - Columns: ${item.n_columns}`
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'info_text',
			inner_html		: info_text,
			parent			: fragment
		})

	// preview
		const button_preview = ui.create_dom_element({
			element_type	: 'button',
			class_name		: 'button_preview info',
			inner_html		: get_label.preview || 'Preview',
			parent			: fragment
		})
		button_preview.addEventListener("click", function(){
			preview.classList.toggle('hide')
		})
		// preview text
		let preview
		if (item.sample_data_errors.length>0) {

			// errors found
			const text = JSON.stringify(item.sample_data_errors, null, 2)

			preview = ui.create_dom_element({
				element_type	: 'pre',
				class_name		: 'preview error hide',
				// inner_html	: text, // text.replaceAll('<br>','\n'),
				inner_html		: text.replaceAll('<br>','\n'),
				parent			: fragment
			})
			button_preview.classList.add('error')
			button_preview.innerHTML += '. ERROR: BAD JSON FORMAT'

		}else{

			const text = JSON.stringify(item.sample_data, null, 2)

			preview = ui.create_dom_element({
				element_type	: 'pre',
				class_name		: 'preview hide',
				inner_html		: text.replaceAll('<br>','\n'),
				parent			: fragment
			})
			button_preview.classList.add('ok')
		}

	// columns_mapper
		const columns_maper = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'columns_mapper',
			parent			: fragment
		})

	// result
		const result_container = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'result',
				parent			: fragment
			})
		item.result_container = result_container

	// item_wrapper
		const item_wrapper = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'file_item'
		})
		item_wrapper.appendChild(fragment)

	// update_section_warn first time
		update_section_warn()


	return item_wrapper
}//end render_file_info



/**
* RENDER_COLUMNS_MAPPER
* @return DOM node item_wrapper
*/
const render_columns_mapper = async function(self, item) {

	// short vars
		const file_info					= item.file_info // array of columns name (first row of csv file)
		const section_tipo				= item.section_tipo
		const section_components_list	= await self.get_section_components_list(section_tipo)
		const section_label				= section_components_list.label
		const ar_components				= section_components_list.list
		const ar_columns_map			= item.ar_columns_map

	const fragment = new DocumentFragment()

	// no results case
		if (!ar_components) {
			ui.create_dom_element({
				element_type	: 'div',
				class_name		: '',
				inner_html		: section_components_list.msg,
				parent			: fragment
			})

			return fragment
		}

	// header
		const header = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'columns_header icon_arrow',
			inner_html		: 'Columns mapper: <b>' + section_label + '</b>',
			parent			: fragment
		})

	// body
		const body = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'columns_body',
			parent			: fragment
		})

	// columns names
		// line
			const line = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'columns_mapper_line names',
				parent			: body
			})
			// ui.create_dom_element({
			// 	element_type	: 'div',
			// 	inner_html		: 'Position',
			// 	parent			: line
			// })
			ui.create_dom_element({
				element_type	: 'div',
				inner_html		: 'Name',
				parent			: line
			})
			ui.create_dom_element({
				element_type	: 'div',
				inner_html		: 'Model',
				parent			: line
			})
			ui.create_dom_element({
				element_type	: 'div',
				inner_html		: 'Label',
				parent			: line
			})
			ui.create_dom_element({
				element_type	: 'div',
				inner_html		: 'Selected',
				parent			: line
			})
			ui.create_dom_element({
				element_type	: 'div',
				inner_html		: 'Mapped to',
				parent			: line
			})
			ui.create_dom_element({
				element_type	: 'div',
				inner_html		: 'Sample data',
				parent			: line
			})

	// columns value
		const file_info_length = file_info.length
		for (let i = 0; i < file_info_length; i++) {

			const column_name = file_info[i]

			// line
				const line = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'columns_mapper_line',
					parent			: body
				})

			// // original position
			// 	const position = ui.create_dom_element({
			// 		element_type	: 'div',
			// 		class_name		: 'position',
			// 		// text_content	: i,
			// 		parent			: line
			// 	})
			// 	position.textContent = i

			// column_name (original in csv document)
				ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'column_name',
					inner_html		: column_name,
					parent			: line
				})

			// column_info detected model
				ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'column_info',
					inner_html		: item.ar_columns_map[i].model,
					parent			: line
				})

			// column_info detected label
				ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'column_info',
					inner_html		: item.ar_columns_map[i].label,
					parent			: line
				})

			// selected checkbox
				const checkbox_file_selection = ui.create_dom_element({
					element_type	: 'input',
					type			: 'checkbox',
					value			: i,
					parent			: line
				})
				checkbox_file_selection.addEventListener('change', function(){
					ar_columns_map[i].checked = checkbox_file_selection.checked
				})

			// target component list selector
				const target_select = ui.create_dom_element({
					element_type	: 'select',
					class_name		: 'column_select',
					inner_html		: column_name,
					parent			: line
				})
				// empty option
				ui.create_dom_element({
					element_type	: 'option',
					value			: '',
					parent			: target_select
				})
				const ar_components_lenght = ar_components.length
				for (let k = 0; k < ar_components_lenght; k++) {

					const option = ui.create_dom_element({
						element_type	: 'option',
						value			: ar_components[k].value,
						inner_html		: ar_components[k].label + ' [' + ar_components[k].value + ' - '+ ar_components[k].model +']',
						parent			: target_select
					})
					// assign the model to the option to be obtained by the the event
					option.model = ar_components[k].model

					// selected options set on match
					if ( ar_components[k].value===column_name ||
						(column_name==='section_id' && ar_components[k].model==='component_section_id')) {
						option.selected = true
						// checkbox_file_selection update
						checkbox_file_selection.checked = true

						// update ar_columns_map object
						ar_columns_map[i].checked	= true
						ar_columns_map[i].map_to	= ar_components[k].value
					}
				}
				target_select.addEventListener("change", function(e){
					// checkbox_file_selection update
					if (e.target.value && e.target.value.length>0) {
						checkbox_file_selection.checked = true
					}else{
						checkbox_file_selection.checked = false
					}

					// update ar_columns_map object
					ar_columns_map[i].checked	= checkbox_file_selection.checked
					ar_columns_map[i].map_to	= e.target.value
					ar_columns_map[i].model 	= e.target.options[e.target.selectedIndex].model
				})

			// sample_data (search non empty values)
				let sample_data = ''
				const item_sample_data_length = item.sample_data.length
				for (let j = 0; j < item_sample_data_length; j++) {
					const sd = item.sample_data[j][i]
					if (sd && sd.length>0) {
						sample_data = sd
						break;
					}
				}
				ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'sample_data',
					inner_html		: sample_data,
					parent			: line
				})
		}//end for (let i = 0; i < file_info_length; i++)

	// collapse_toggle_track
		ui.collapse_toggle_track({
			header				: header,
			content_data		: body,
			collapsed_id		: 'collapsed_' + item.section_tipo,
			collapse_callback	: collapse,
			expose_callback		: expose
		})
		function collapse() {
			header.classList.remove('up')
		}
		function expose() {
			header.classList.add('up')
		}


	return fragment
}//end render_columns_mapper



/**
* UPLOAD_DONE
* Called on service_upload has finished of upload file using a event
* @see event subscription at 'init' function
* @param object options
* @return promise
*/
render_tool_import_dedalo_csv.prototype.upload_done = async function (options) {

	const self = this

	// options
		const file_data = options.file_data

	// process_file loading
		while (self.process_file.firstChild) {
			self.process_file.removeChild(self.process_file.firstChild);
		}
		const spinner = ui.create_dom_element({
			element_type	: 'div',
			class_name		: "spinner",
			parent			: self.process_file
		})
		const process_file_info = ui.create_dom_element({
			element_type	: 'span',
			inner_html		: 'Processing file..',
			class_name		: "info",
			parent			: self.process_file
		})
		self.process_file.appendChild(spinner)

	// process uploaded file (move temp uploaded file to definitive location and name)
		self.process_uploaded_file(file_data)
		.then(function(response) {

			spinner.remove()

			// process_file remove info loading
			if (!response.result) {
				// error case
				process_file_info.innerHTML = response.msg || 'Error on processing file!'

			}else{
				// OK case
				process_file_info.innerHTML = response.msg || 'Processing file done successfully.'

				// self update (forces update list of files)
					self.refresh()
			}
		})


	return true
}//end upload_done


