/*global get_label, page_globals, SHOW_DEBUG */
/*eslint no-undef: "error"*/



// imports
	// import {event_manager} from '../../../common/js/event_manager.js'
	import {ui} from '../../../common/js/ui.js'
	import {
		render_info,
		render_progress_bar,
		render_filedrag,
		file_selected
		// file_select_handler
	} from './render_edit_service_upload.js'



/**
* RENDER_MINI_SERVICE_UPLOAD
* Manages the component's logic and apperance in client side
*/
export const render_mini_service_upload = function() {

	return true
};//end render_mini_service_upload



/**
* MINI
* Render node for use like button
* @return DOM node
*/
render_mini_service_upload.prototype.mini = async function (options) {

	const self = this

	const render_level 	= options.render_level || 'full'

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
};//end render_mini_service_upload



/**
* GET_CONTENT_DATA
* @return DOM node content_data
*/
const get_content_data = function(self) {

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

	// input
		const input = ui.create_dom_element({
			element_type	: 'input',
			type			: 'file',
			id				: 'file_to_upload',
			parent			: form
		})
		input.addEventListener('change', function() {

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
		const content_data = document.createElement("div")
			  content_data.classList.add("content_data", self.type)
			  content_data.appendChild(fragment)


	return content_data
};//end get_content_data



/**
* GET_CONTENT_DATA
* @return DOM node content_data
*/
	// const get_content_data_OLD = function(self) {

	// 	const fragment = new DocumentFragment()

	// 	const preview_image	= null;

	// 	// form
	// 		const form = ui.create_dom_element({
	// 			element_type	: 'form',
	// 			id				: 'form_upload',
	// 			parent			: fragment
	// 		})
	// 		form.name		= 'form_upload'
	// 		form.enctype	= 'multipart/form-data'
	// 		form.method		= 'post'


	// 	// input
	// 		const input = ui.create_dom_element({
	// 			element_type	: 'input',
	// 			type			: 'file',
	// 			id				: 'file_to_upload',
	// 			parent			: form
	// 		})
	// 		input.addEventListener("change", function(){
	// 			const file = this.files[0]
	// 			self.upload_file(file, content_data, response_msg, preview_image, progress_bar_container)
	// 		})

	// 	// filedrag label
	// 		const filedrag = ui.create_dom_element({
	// 			element_type	: 'label',
	// 			class_name		: 'filedrag',
	// 			// text_content	: 'Select a file to upload or drop it here', // get_label.seleccione_un_fichero ||
	// 			parent			: form
	// 		})
	// 		filedrag.setAttribute("for",'file_to_upload')
	// 		filedrag.addEventListener("dragover", file_drag_hover, false);
	// 		filedrag.addEventListener("dragleave", file_drag_hover, false);
	// 		filedrag.addEventListener("drop", function(e){

	// 			// cancel event and hover styling
	// 			file_drag_hover(e);

	// 			// fetch FileList object
	// 			const files = e.target.files || e.dataTransfer.files;

	// 			// process all File objects
	// 			for (let i = 0; i < files.length; i++) {

	// 				const file = files[i]

	// 				// parse file info
	// 				// parse_local_file(file);

	// 				// upload
	// 				self.upload_file(file, content_data, response_msg, preview_image, progress_bar_container)

	// 				break; // only one is allowed
	// 			}
	// 		})

	// 		// label icon
	// 		ui.create_dom_element({
	// 			element_type	: 'img',
	// 			src				: DEDALO_TOOLS_URL + '/' + self.model + '/img/icon.svg',
	// 			parent			: filedrag
	// 		})
	// 		// label text
	// 		ui.create_dom_element({
	// 			element_type	: 'span',
	// 			class_name		: '',
	// 			text_content	: 'Select or drop a file it here',
	// 			parent			: filedrag
	// 		})

	// 	// filedrag
	// 		// const filedrag = ui.create_dom_element({
	// 		// 	element_type	: 'div',
	// 		// 	class_name		: 'filedrag',
	// 		// 	text_content 	: 'or drop a file here',
	// 		// 	parent 			: form
	// 		// })


	// 	// file_info
	// 		const file_info = ui.create_dom_element({
	// 			element_type	: 'div',
	// 			class_name		: 'file_info',
	// 			text_content	: '',
	// 			parent			: form
	// 		})

	// 	// progress_bar_container
	// 		const progress_bar_container = get_progress_bar(self)
	// 		fragment.appendChild(progress_bar_container)

	// 	// response_container
	// 		const response_container = ui.create_dom_element({
	// 			element_type	: 'div',
	// 			class_name		: 'response_container',
	// 			parent			: fragment
	// 		})
	// 		// response_msg
	// 		const response_msg = ui.create_dom_element({
	// 			element_type	: 'div',
	// 			class_name		: 'response_msg',
	// 			parent			: response_container
	// 		})
	// 		// preview_image
	// 		// const preview_image = ui.create_dom_element({
	// 		// 	element_type	: 'img',
	// 		// 	class_name		: 'preview_image',
	// 		// 	parent			: response_container
	// 		// })
	// 		// preview_image.addEventListener("click", function(e){
	// 		// 	e.stopPropagation()
	// 		// 	window.open(this.src)
	// 		// })

	// 	// info
	// 		// buton_info
	// 		const button_info = ui.create_dom_element({
	// 			element_type	: 'span',
	// 			class_name		: 'button info',
	// 			parent			: fragment
	// 		})
	// 		button_info.addEventListener("click", function(e){
	// 			info.classList.toggle('hide')
	// 		})
	// 		// container info
	// 		const info = ui.create_dom_element({
	// 			element_type	: 'div',
	// 			class_name		: 'info hide',
	// 			// text_content	: '',
	// 			parent			: fragment
	// 		})
	// 		// caller component
	// 		ui.create_dom_element({
	// 			element_type	: 'div',
	// 			inner_html		: '<label>Caller</label>' + self.caller.model,
	// 			parent			: info
	// 		})
	// 		// target quality
	// 		if (self.caller.context.default_target_quality) {
	// 			ui.create_dom_element({
	// 				element_type	: 'div',
	// 				inner_html		: '<label>Target quality</label>' + self.caller.context.default_target_quality,
	// 				parent			: info
	// 			})
	// 		}
	// 		// allowed extensions
	// 		ui.create_dom_element({
	// 			element_type	: 'div',
	// 			inner_html		: '<label>Allowed extensions</label>' + self.caller.context.allowed_extensions.join(", "),
	// 			parent			: info
	// 		})
	// 		// max upload file size
	// 		const max_mb = Math.floor(self.max_size_bytes / (1024*1024))
	// 		ui.create_dom_element({
	// 			element_type	: 'div',
	// 			class_name		: (max_mb < 100) ? 'warning' : '',
	// 			inner_html		: '<label>Max file size</label>' + max_mb.toLocaleString() + ' MB',
	// 			parent			: info
	// 		})
	// 		// sys_get_temp_dir
	// 		ui.create_dom_element({
	// 			element_type	: 'div',
	// 			inner_html		: '<label>System temp dir</label>' + self.sys_get_temp_dir,
	// 			parent			: info
	// 		})
	// 		// upload_tmp_dir
	// 		ui.create_dom_element({
	// 			element_type	: 'div',
	// 			inner_html		: '<label>User upload tmp dir</label>' + self.upload_tmp_dir,
	// 			parent			: info
	// 		})
	// 		// upload_tmp_perms
	// 		ui.create_dom_element({
	// 			element_type	: 'div',
	// 			inner_html		: '<label>User upload tmp perms</label>' + self.upload_tmp_perms,
	// 			parent			: info
	// 		})
	// 		// session_cache_expire
	// 		const session_cache_expire = (self.session_cache_expire / 60) > 24
	// 			? (self.session_cache_expire / (60 * 24)).toLocaleString() + ' Days'
	// 			: (self.session_cache_expire / 60).toLocaleString() + ' Hours'
	// 		ui.create_dom_element({
	// 			element_type	: 'div',
	// 			inner_html	 	: '<label>Session cache expire</label>' + session_cache_expire + ' [' + self.session_cache_expire.toLocaleString() + ' minutes]',
	// 			parent 			: info
	// 		})


	// 	// // buttons container
	// 	// 	const buttons_container = ui.create_dom_element({
	// 	// 		element_type	: 'div',
	// 	// 		class_name 		: 'buttons_container',
	// 	// 		parent 			: components_container
	// 	// 	})

	// 	// content_data
	// 		const content_data = document.createElement("div")
	// 			  content_data.classList.add("content_data", self.type)
	// 			  content_data.appendChild(fragment)


	// 	return content_data
	// };//end get_content_data



/**
* GET_PROGRESS_BAR
*/
	// const get_progress_bar = function(self) {

	// 	// progress_bar_container
	// 		const progress_bar_container = ui.create_dom_element({
	// 			element_type	: 'div',
	// 			class_name		: 'progress_bar_container'
	// 		})

	// 		// progress_info
	// 		const progress_info = ui.create_dom_element({
	// 			element_type	: 'div',
	// 			class_name		: 'progress_info',
	// 			parent 			: progress_bar_container
	// 		})

	// 		// progress_line
	// 		const progress_line = ui.create_dom_element({
	// 			element_type	: 'progress',
	// 			class_name		: 'progress_line',
	// 			parent 			: progress_bar_container
	// 		})
	// 		progress_line.max   = 100;
	// 		progress_line.value = 0;


	// 	return progress_bar_container
	// };//end get_progress_bar



/**
* FILE_DRAG_HOVER
*/
	// const file_drag_hover = function(e) {

	// 	e.stopPropagation();
	// 	e.preventDefault();

	// 	if (e.type==="dragover") {
	// 		e.target.classList.add("hover")
	// 	}else{
	// 		e.target.classList.remove("hover")
	// 	}

	// 	return true
	// };//end file_drag_hover



/**
* FILE_SELECT_HANDLER
*/
	// const file_select_handler = function(e) {

	// 	// cancel event and hover styling
	// 	file_drag_hover(e);

	// 	// fetch FileList object
	// 	const files = e.target.files || e.dataTransfer.files;

	// 	// process all File objects
	// 	for (let i = 0; i < files.length; i++) {

	// 		const file = files[i]

	// 		// parse file info
	// 		// parse_local_file(file);

	// 		// upload
	// 		self.upload_file(file, content_data, response_msg, preview_image, progress_bar_container)

	// 		break; // only one is allowed
	// 	}

	// 	return true
	// };//end file_select_handler


