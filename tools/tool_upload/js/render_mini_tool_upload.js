/*global get_label, page_globals, SHOW_DEBUG, DEDALO_TOOLS_URL */
/*eslint no-undef: "error"*/



// imports
	// import {event_manager} from '../../../core/common/js/event_manager.js'
	import {ui} from '../../../core/common/js/ui.js'
	import {
		render_info,
		render_progress_bar,
		render_filedrag,
		file_drag_hover,
		// file_select_handler
	} from './render_edit_tool_upload.js'



/**
* RENDER_MINI_TOOL_UPLOAD
* Manages the component's logic and appearance in client side
*/
export const render_mini_tool_upload = function() {

	return true
};//end render_mini_tool_upload



/**
* MINI
* Render node for use like button
* @return DOM node
*/
render_mini_tool_upload.prototype.mini = async function (options) {

	const self = this

	const render_level 	= options.render_level || 'full'

	// content_data
		const current_content_data = get_content_data(self)
		if (render_level==='content') {
			return current_content_data
		}

	// wrapper. ui build_edit returns component wrapper
		const wrapper = ui.tool.build_wrapper_edit(self, {
			content_data	: current_content_data,
			label			: null
		})


	return wrapper
};//end render_mini_tool_upload



/**
* GET_CONTENT_DATA
* @return DOM node content_data
*/
const get_content_data = function(self) {

	const fragment = new DocumentFragment()

	const preview_image	= null;

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
		input.addEventListener("change", function(){

			filedrag.classList.add('loading_file')

			const file = this.files[0] || null
			if (!file) {
				return false
			}

			self.upload_file({
				file : file
			})
			.then(function(){
				filedrag.classList.remove('loading_file')
			})
		})

	// filedrag (add node to form)
		const filedrag = render_filedrag(self)
		form.appendChild(filedrag)

	// file_info
		const file_info = ui.create_dom_element({
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
* RENDER_PROGRESS_BAR
*/
	// const render_progress_bar = function(self) {

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
	// };//end render_progress_bar



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


