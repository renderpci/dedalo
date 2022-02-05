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
};//end render_tool_import_dedalo_csv



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

	// tool_upload
		// file_uploader
		const file_uploader = ui.create_dom_element({
			element_type	: 'div',
			class_name 		: 'file_uploader'
		})
		wrapper.prepend(file_uploader)
		self.tool_upload.render()
		.then(function(tool_upload_node){
			file_uploader.appendChild(tool_upload_node)
		})

	// modal container
		const header = wrapper.querySelector('.tool_header') // is created by ui.tool.build_wrapper_edit
		const modal  = ui.attach_to_modal(header, wrapper, null, 'big')
		modal.on_close = () => {
			// when closing the modal, common destroy is called to remove tool and elements instances
			self.destroy(true, true, true)
		}


	return wrapper
};//end tool_import_dedalo_csv



/**
* GET_CONTENT_DATA
* Render tool body or 'content_data'
* @param instance self
* @return DOM node content_data
*/
const get_content_data = async function(self) {

	const fragment = new DocumentFragment()

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
				inner_html		: 'Import',
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
							file			: el.name,
							section_tipo	: el.section_tipo
						}
					})
				// time_machine_save
					const time_machine_save = checkbox_time_machine_save.checked
				// import
					self.import_files(files, time_machine_save)
					.then(function(response){
						if (response.debug && response.debug.rqo) {
							response.debug.rqo = JSON.parse(response.debug.rqo)
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
		const content_data = document.createElement("div")
			  content_data.classList.add("content_data", self.type)
			  content_data.appendChild(fragment)


	return content_data
};//end get_content_data



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
			input_section_tipo.addEventListener("keyup", function(){
				item.section_tipo = input_section_tipo.value // update item value
				update_section_warn()
			})
			function update_section_warn() {
				const valid_section_tipo = validate_tipo(item.section_tipo)
				if (!valid_section_tipo) {
					section_warn.classList.remove('hide')
					section_warn.innerHTML = 'Autodetected file section tipo "'+section_tipo+'" appears to be invalid.'
				}else{
					section_warn.classList.add('hide')
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
		update_section_warn()

	// info
		// console.log("item:",item);
		const info_text = `Records: ${item.n_records} - Columns: ${item.n_columns} - Header:<br><span class="columns">` + item.file_info.join(', ') + '</span>'
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
				text_content	: text.replaceAll('<br>','\n'),
				parent			: fragment
			})
			button_preview.classList.add('error')
			button_preview.innerHTML += '. ERROR: BAD JSON FORMAT'

		}else{

			const text = JSON.stringify(item.sample_data, null, 2)

			preview = ui.create_dom_element({
				element_type	: 'pre',
				class_name		: 'preview hide',
				// inner_html	: text,
				text_content	: text.replaceAll('<br>','\n'),
				parent			: fragment
			})
			button_preview.classList.add('ok')
		}

	// item_wrapper
		const item_wrapper = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'file_item'
		})
		item_wrapper.appendChild(fragment)


	return item_wrapper
};//end render_file_info


