/*global get_label, DEDALO_CORE_URL */
/*eslint no-undef: "error"*/



// imports
	// import {event_manager} from '../../../common/js/event_manager.js'
	import {ui} from '../../../common/js/ui.js'



/**
* RENDER_EDIT_SERVICE_UPLOAD
* Manages the service's logic and apperance in client side
*/
export const render_edit_service_upload = function() {

	return true
};//end render_edit_service_upload



/**
* EDIT
* Render node for use like button
* @return DOM node
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


	return wrapper
};//end render_edit_service_upload



/**
* GET_CONTENT_DATA
* @return DOM node content_data
*/
export const get_content_data = function(self) {

	const fragment = new DocumentFragment()

	// form
		const form = ui.create_dom_element({
			element_type	: 'form',
			id				: 'form_upload',
			parent			: fragment
		})
		form.name		= 'form_upload'
		form.enctype	= 'multipart/form-data'
		form.method		= 'post'

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

	// progress_bar_container
		const progress_bar_container = render_progress_bar(self)
		fragment.appendChild(progress_bar_container)

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
};//end get_content_data



/**
* RENDER_INFO
* @return DOM node info
*/
export const render_info = function(self) {

	// container info
		const info = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'info'
		})

	// caller component
		ui.create_dom_element({
			element_type	: 'div',
			inner_html		: '<label>Caller</label>' + self.caller.model,
			parent			: info
		})

	// target quality
		const target_quality = self.caller.context.target_quality || self.caller.context.default_target_quality
		if (target_quality) {
			ui.create_dom_element({
				element_type	: 'div',
				inner_html		: '<label>Target quality</label>' + target_quality,
				parent			: info
			})
		}

	// allowed extensions
		ui.create_dom_element({
			element_type	: 'div',
			inner_html		: '<label>Allowed extensions</label>' + self.allowed_extensions.join(", "),
			parent			: info
		})

	// max upload file size
		const max_mb = Math.floor(self.max_size_bytes / (1024*1024))
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: (max_mb < 100) ? 'warning' : '',
			inner_html		: '<label>Max file size</label>' + max_mb.toLocaleString() + ' MB',
			parent			: info
		})

	// sys_get_temp_dir
		ui.create_dom_element({
			element_type	: 'div',
			inner_html		: '<label>System temp dir</label>' + self.sys_get_temp_dir,
			parent			: info
		})

	// upload_tmp_dir
		ui.create_dom_element({
			element_type	: 'div',
			inner_html		: '<label>User upload tmp dir</label>' + self.upload_tmp_dir,
			parent			: info
		})

	// upload_tmp_perms
		ui.create_dom_element({
			element_type	: 'div',
			inner_html		: '<label>User upload tmp perms</label>' + self.upload_tmp_perms,
			parent			: info
		})

	// session_cache_expire
		const session_cache_expire = (self.session_cache_expire / 60) > 24
			? (self.session_cache_expire / (60 * 24)).toLocaleString() + ' Days'
			: (self.session_cache_expire / 60).toLocaleString() + ' Hours'
		ui.create_dom_element({
			element_type	: 'div',
			inner_html	 	: '<label>Session cache expire</label>' + session_cache_expire + ' [' + self.session_cache_expire.toLocaleString() + ' minutes]',
			parent 			: info
		})


	return info
};//end render_info



/**
* RENDER_FILEDRAG
* @return DOM node filedrag
*/
export const render_filedrag = function(self) {

	// filedrag node
		const filedrag = ui.create_dom_element({
			element_type	: 'label',
			class_name		: 'filedrag'
			// text_content	: 'Select a file to upload or drop it here', // get_label.seleccione_un_fichero ||
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
			text_content	: 'Select or drop a file it here',
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
};//end render_filedrag



/**
* FILE_SELECTED
* Manages user drag file or user file selection
*/
export const file_selected = async function(self, file) {

	self.filedrag.classList.add('loading_file')

	// upload file to server
		const response = await self.upload_file({
			file : file
		})

	// show filedrag again
		self.filedrag.classList.remove('loading_file')

	// on success actions
		// if (response.result===true) {
		// 	self.response_msg.innerHTML = response.msg || 'OK. File uploaded'
		// }else{
		// 	self.response_msg.innerHTML = response.msg || 'Error on upload file'
		// }


	return response
}//end file_selected



/**
* RENDER_PROGRESS_BAR
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
};//end render_progress_bar



/**
* FILE_DRAG_HOVER
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
};//end file_drag_hover


