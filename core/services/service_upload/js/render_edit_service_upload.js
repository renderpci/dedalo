// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, DEDALO_CORE_URL */
/*eslint no-undef: "error"*/



// imports
	// import {event_manager} from '../../../common/js/event_manager.js'
	import {ui} from '../../../common/js/ui.js'



/**
* RENDER_EDIT_SERVICE_UPLOAD
* Manages the service's logic and appearance in client side
*/
export const render_edit_service_upload = function() {

	return true
}//end render_edit_service_upload



/**
* EDIT
* Render node for use like button
* @return HTMLElement wrapper
*/
render_edit_service_upload.prototype.edit = async function (options) {

	const self = this

	// options
		const render_level = options.render_level || 'full'

	// content_data
		const content_data = get_content_data(self)
		if (render_level==='content') {
			return content_data
		}

	// wrapper
		const wrapper = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'service_upload'
		})
		wrapper.appendChild(content_data)
		// set pointers
		wrapper.content_data = content_data


	return wrapper
}//end edit



/**
* GET_CONTENT_DATA
* @return HTMLElement content_data
*/
export const get_content_data = function(self) {

	const fragment = new DocumentFragment();

	self.process_options = {
		ocr			: false,
		ocr_lang	: null
	}

	// form
		const form = ui.create_dom_element({
			element_type	: 'form',
			id				: 'form_upload',
			parent			: fragment
		})
		form.name		= 'form_upload'
		form.enctype	= 'multipart/form-data'
		form.method		= 'post'
		// fix form
		self.form		= form

	// input_file
		const input_file = ui.create_dom_element({
			element_type	: 'input',
			type			: 'file',
			id				: 'file_to_upload',
			parent			: form
		})
		input_file.addEventListener('change',function() {

			const file = this.files[0] || null
			if (!file) {
				return false
			}

			file_selected(self, file)
		})
		input_file.accept = self.allowed_extensions.map((ext) => {return '.'+ext}).join(", ");

	// filedrag (add node to form)
		const filedrag = render_filedrag(self)
		form.appendChild(filedrag)

	// file_info
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'file_info',
			text_content	: '',
			parent			: form
		})


	if(self.allowed_extensions.includes('pdf') && self.pdf_ocr_engine) {

		// OCR_options
			const ocr_options_container = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'ocr_options_container',
				parent			: form
			})

		// checkbox_label
			const checkbox_label = ui.create_dom_element({
				element_type	: 'label',
				class_name		: 'label checkbox_label',
				inner_html		: 'OCR',
				parent			: ocr_options_container
			})

		// input checkbox
			const checkbox_input = ui.create_dom_element({
				element_type	: 'input',
				type			: 'checkbox',
				name			: 'checkbox_active'
			})

			checkbox_label.prepend(checkbox_input)

			checkbox_input.addEventListener('click', function(e) {
				e.stopPropagation()

				self.process_options.ocr = checkbox_input.checked
			})

		// combobox_label
			const combobox_label = ui.create_dom_element({
				element_type	: 'label',
				class_name		: 'label combobox_label',
				inner_html		: get_label.language || 'Language',
				parent			: ocr_options_container
			})

		// input combobox
			const combobox_input = ui.create_dom_element({
				element_type	: 'select',
				name			: 'combobox_active'
			})

			combobox_label.prepend(combobox_input)

		// input Languages (from dedalo config)
			page_globals.dedalo_application_langs.forEach((lang) => {
				var lang_option = ui.create_dom_element({
					element_type	: 'option',
					value			: lang.value,
					text_content	: lang.label,
					parent			: combobox_input
				});
			});

			combobox_input.addEventListener('click', function(e) {
				self.process_options.ocr_lang = combobox_input.value;
			})
	}

	// progress_bar_container
		const progress_bar_container = render_progress_bar(self)
		fragment.appendChild(progress_bar_container)
		// fix progress_bar_container
		self.progress_bar_container = progress_bar_container

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
		// fix
		self.response_msg = response_msg

	// info
		// button_info
		const button_info = ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'button info',
			parent			: fragment
		})
		button_info.addEventListener('click', function(){
			info_node.classList.toggle('hide')
		})
		const info_node = render_info(self)
		info_node.classList.add('hide')
		fragment.appendChild(info_node)

	// content_data
		const content_data = document.createElement('div')
			  content_data.classList.add('content_data')
			  content_data.appendChild(fragment)


	return content_data
}//end get_content_data



/**
* RENDER_INFO
* @param object self
* @return HTMLElement info
*/
export const render_info = function(self) {

	// container info
		const info = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'info_container '
		})

	// caller component
		ui.create_dom_element({
			element_type	: 'label',
			inner_html		: 'Caller',
			parent			: info
		})
		ui.create_dom_element({
			element_type	: 'div',
			inner_html		: self.caller.model,
			parent			: info
		})

	// target quality
		const target_quality = self.caller.context.features
			? self.caller.context.features.target_quality || self.caller.context.features.default_target_quality
			: null
		if (target_quality) {
			ui.create_dom_element({
				element_type	: 'label',
				inner_html		: 'Target quality',
				parent			: info
			})
			ui.create_dom_element({
				element_type	: 'div',
				inner_html		: target_quality,
				parent			: info
			})
		}

	// allowed extensions
		ui.create_dom_element({
			element_type	: 'label',
			inner_html		: 'Allowed extensions',
			parent			: info
		})
		ui.create_dom_element({
			element_type	: 'div',
			inner_html		: self.allowed_extensions.join(", "),
			parent			: info
		})

	// max file size upload file size
		const max_mb = Math.floor(self.max_size_bytes / (1024*1024))
		ui.create_dom_element({
			element_type	: 'label',
			inner_html		: 'Max file size',
			parent			: info
		})
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: (max_mb < 100) ? 'warning' : '',
			inner_html		: max_mb.toLocaleString() + ' MB',
			parent			: info
		})

	// DEDALO_UPLOAD_SERVICE_CHUNK_FILES
		ui.create_dom_element({
			element_type	: 'label',
			inner_html		: 'Chunk files size',
			parent			: info
		})
		const chunk_text = self.upload_service_chunk_files
			? self.upload_service_chunk_files + ' MB'
			: JSON.stringify(self.upload_service_chunk_files)
		ui.create_dom_element({
			element_type	: 'div',
			inner_html		: chunk_text,
			parent			: info
		})

	// sys_get_temp_dir
		ui.create_dom_element({
			element_type	: 'label',
			inner_html		: 'System temp dir',
			parent			: info
		})
		ui.create_dom_element({
			element_type	: 'div',
			inner_html		: self.sys_get_temp_dir,
			parent			: info
		})

	// upload_tmp_dir
		ui.create_dom_element({
			element_type	: 'label',
			inner_html		: 'User upload tmp dir',
			parent			: info
		})
		ui.create_dom_element({
			element_type	: 'div',
			inner_html		: self.upload_tmp_dir,
			parent			: info
		})

	// upload_tmp_perms
		ui.create_dom_element({
			element_type	: 'label',
			inner_html		: 'User upload tmp perms',
			parent			: info
		})
		ui.create_dom_element({
			element_type	: 'div',
			inner_html		: self.upload_tmp_perms,
			parent			: info
		})

	// session_cache_expire
		const session_cache_expire = (self.session_cache_expire / 60) > 24
			? (self.session_cache_expire / (60 * 24)).toLocaleString() + ' Days'
			: (self.session_cache_expire / 60).toLocaleString() + ' Hours'
		ui.create_dom_element({
			element_type	: 'label',
			inner_html		: 'Session cache expire',
			parent			: info
		})
		ui.create_dom_element({
			element_type	: 'div',
			inner_html	 	: session_cache_expire + ' [' + self.session_cache_expire.toLocaleString() + ' minutes]',
			parent 			: info
		})


	return info
}//end render_info



/**
* RENDER_FILEDRAG
* @return HTMLElement filedrag
*/
export const render_filedrag = function(self) {

	// filedrag node
		const filedrag = ui.create_dom_element({
			element_type	: 'label',
			class_name		: 'filedrag'
			// text_content	: 'Select a file to upload or drop it here', // get_label.select_a_file ||
			// parent		: form
		})
		filedrag.setAttribute('for','file_to_upload')
		filedrag.addEventListener("dragover", file_drag_hover, false);
		filedrag.addEventListener("dragleave", file_drag_hover, false);
		filedrag.addEventListener("drop", function(e){

			// cancel event and hover styling
			file_drag_hover(e);

			// fetch FileList object
			const files = e.target.files || e.dataTransfer.files;

			// process all File objects
			// for (let i = 0; i < files.length; i++) {

				// const file = files[i]

				// parse file info
				// parse_local_file(file);

				const file = files[0] || null
				if (!file) {
					return false
				}

				file_selected(self, file)

				// break; // only one is allowed
			// }
		})
		// fix
		self.filedrag = filedrag

	// label icon
		ui.create_dom_element({
			element_type	: 'img',
			src				: DEDALO_CORE_URL + '/services/' + self.model + '/img/icon.svg',
			parent			: filedrag
		})

	// label text
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: '',
			inner_html		: `Select or drop a file here <span class="note">[${self.allowed_extensions.join(',')}]</span>`,
			parent			: filedrag
		})

	// filedrag
		// const filedrag = ui.create_dom_element({
		// 	element_type	: 'div',
		// 	class_name		: 'filedrag',
		// 	text_content 	: 'or drop a file here',
		// 	parent 			: form
		// })


	return filedrag
}//end render_filedrag



/**
* FILE_SELECTED
* Manages user drag file or user file selection
* Trigger upload file action
* @param object self
* @param object file
* @return object response
*/
export const file_selected = async function(self, file) {

	self.filedrag.classList.add('loading_file')

	// upload file to server
		const response = await self.upload_file({
			file : file
		})

	// show filedrag again
		self.filedrag.classList.remove('loading_file')

	// reset classes
		self.response_msg.classList.remove('failed')
		self.response_msg.classList.remove('success')

	// on finish actions
		if (response.result===true) {
			self.response_msg.innerHTML = response.msg || 'OK. File uploaded'
			self.response_msg.classList.add('success')

		}else{
			self.response_msg.innerHTML = response.msg || 'Error on upload file'
			self.response_msg.classList.add('failed')
		}


	return response
}//end file_selected



/**
* RENDER_PROGRESS_BAR
* @param object options
* @return HTMLElement progress_bar_container
*/
export const render_progress_bar = function(self) {

	// progress_bar_container
		const progress_bar_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'progress_bar_container'
		})

	// progress_info
		const progress_info = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'progress_info',
			parent 			: progress_bar_container
		})
		// fix
		self.progress_info = progress_info

	// progress_line
		const progress_line = ui.create_dom_element({
			element_type	: 'progress',
			class_name		: 'progress_line',
			parent 			: progress_bar_container
		})
		progress_line.max   = 100;
		progress_line.value = 0;
		// fix
		self.progress_line = progress_line


	return progress_bar_container
}//end render_progress_bar



/**
* FILE_DRAG_HOVER
* @param event e
* return bool
*/
export const file_drag_hover = function(e) {

	e.stopPropagation();
	e.preventDefault();

	if (e.type==="dragover") {
		e.target.classList.add("hover")
	}else{
		e.target.classList.remove("hover")
	}

	return true
}//end file_drag_hover



// @license-end
