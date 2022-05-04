/*global get_label, page_globals, SHOW_DEBUG, DEDALO_TOOLS_URL */
/*eslint no-undef: "error"*/



// imports
	// import {event_manager} from '../../../core/common/js/event_manager.js'
	import {ui} from '../../../core/common/js/ui.js'



/**
* RENDER_TOOL_UPLOAD
* Manages the tool's logic and apperance in client side
*/
export const render_tool_upload = function() {

	return true
};//end render_tool_upload



/**
* EDIT
* Render node for use like button
* @return DOM node
*/
render_tool_upload.prototype.edit = async function (options) {

	const self = this

	// options
		const render_level = options.render_level || 'full'

	// content_data
		const content_data = get_content_data(self)
		if (render_level==='content') {
			return content_data
		}

	// wrapper. ui build_edit returns component wrapper
		const wrapper = ui.tool.build_wrapper_edit(self, {
			content_data : content_data
		})

	// buttons container
		// 	const buttons_container = ui.create_dom_element({
		// 		element_type	: 'div',
		// 		class_name 		: 'buttons_container',
		// 		parent 			: wrapper
		// 	})

	// tool_container
		//const tool_container = document.getElementById('tool_container')
		//if(tool_container!==null){
		//	tool_container.appendChild(wrapper)
		//}else{
		//	const main = document.getElementById('main')
		//	const new_tool_container = ui.create_dom_element({
		//		id 				: 'tool_container',
		//		element_type	: 'div',
		//		parent 			: main
		//	})
		//	new_tool_container.appendChild(wrapper)
		//}

	// service_upload
		// Use the service_upload to get and render the button to upload the file,
		// get functionality defined (drag, drop, create folder, etc..)
		// service_upload_container
		const service_upload_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'service_upload_container'
		})
		wrapper.prepend(service_upload_container)
		// service_upload. Build and render
		self.service_upload.build()
		.then(function(){
			self.service_upload.render()
			.then(function(tool_upload_node){
				service_upload_container.appendChild(tool_upload_node)
			})
		})

	// modal container
		// if (!window.opener) {
		// 	const header	= wrapper.tool_header // is created by ui.tool.build_wrapper_edit
		// 	const modal		= ui.attach_to_modal(header, wrapper, null)
		// 	modal.on_close	= () => {
		// 		// when closing the modal, common destroy is called to remove tool and elements instances
		// 		self.destroy(true, true, true)
		// 	}
		// }


	return wrapper
};//end edit



/**
* GET_CONTENT_DATA
* @return DOM node content_data
*/
export const get_content_data = function(self) {

	const fragment = new DocumentFragment()

	// process_file
		const process_file = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'process_file',
			parent			: fragment
		})
		self.process_file = process_file

	// preview_image
		const preview_image = ui.create_dom_element({
			element_type	: 'img',
			class_name		: 'preview_image',
			parent			: fragment
		})
		preview_image.addEventListener("click", function(e){
			e.stopPropagation()
			window.open(this.src)
		})
		// fix
		self.preview_image = preview_image

	// content_data
		const content_data = document.createElement("div")
			  content_data.classList.add("content_data", self.type)
			  content_data.appendChild(fragment)


	return content_data
};//end get_content_data



/**
* UPLOAD_DONE
* Called on service_upload has finished of upload file using a event
* @see event subscription at 'init' function
* @param object options
* @return promise
*/
render_tool_upload.prototype.upload_done = async function (options) {

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

	// reset preview_image
		self.preview_image.src = ''

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

				// preview image update
					if (response.preview_url) {
						self.preview_image.src = response.preview_url
					}

				// caller update. (usually media component like component_image)
					self.caller.refresh()
			}
		})

	return true
};//end upload_done


/**
* RENDER_FILEDRAG
* @return DOM node filedrag
*/
	// export const render_filedrag = function(self) {

	// 	// filedrag node
	// 		const filedrag = ui.create_dom_element({
	// 			element_type	: 'label',
	// 			class_name		: 'filedrag'
	// 			// text_content	: 'Select a file to upload or drop it here', // get_label.seleccione_un_fichero ||
	// 			// parent		: form
	// 		})
	// 		filedrag.setAttribute('for','file_to_upload')
	// 		filedrag.addEventListener("dragover", file_drag_hover, false);
	// 		filedrag.addEventListener("dragleave", file_drag_hover, false);
	// 		filedrag.addEventListener("drop", function(e){

	// 			// cancel event and hover styling
	// 			file_drag_hover(e);

	// 			// fetch FileList object
	// 			const files = e.target.files || e.dataTransfer.files;

	// 			// process all File objects
	// 			// for (let i = 0; i < files.length; i++) {

	// 				// const file = files[i]

	// 				// parse file info
	// 				// parse_local_file(file);

	// 				// upload
	// 				// self.upload_file(file, content_data, response_msg, preview_image, progress_bar_container)


	// 				const file = files[0] || null
	// 				if (!file) {
	// 					return false
	// 				}

	// 				file_selected(self, file)

	// 				filedrag.classList.add('loading_file')

	// 				// reset preview_image
	// 				if (self.preview_image) {
	// 					self.preview_image.src = ''
	// 				}

	// 				self.upload_file({
	// 					file : file
	// 				})
	// 				.then(function(response){
	// 					// show filedrag again
	// 						filedrag.classList.remove('loading_file')

	// 					// on success actions
	// 						if (response.result===true) {
	// 							if (response.preview_url && self.preview_image) {
	// 								self.preview_image.src = response.preview_url
	// 								self.caller.refresh()
	// 							}
	// 							self.response_msg.innerHTML = response.msg || 'OK. File uploaded'
	// 						}else{
	// 							self.response_msg.innerHTML = response.msg || 'Error on upload file'
	// 						}
	// 				})

	// 				// break; // only one is allowed
	// 			// }
	// 		})
	// 		// fix
	// 		self.filedrag = filedrag

	// 	// label icon
	// 		ui.create_dom_element({
	// 			element_type	: 'img',
	// 			src				: DEDALO_TOOLS_URL + '/' + self.model + '/img/icon.svg',
	// 			parent			: filedrag
	// 		})

	// 	// label text
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


	// 	return filedrag
	// };//end render_filedrag



/**
* FILE_SELECTED
* Manages user drag file or user file selection
*/
	// export const file_selected = async function(self, file) {

	// 	self.filedrag.classList.add('loading_file')

	// 	// reset preview_image if exists
	// 		if (self.preview_image) {
	// 			self.preview_image.src = ''
	// 		}

	// 	// upload file to server
	// 		const response = await self.upload_file({
	// 			file : file
	// 		})

	// 	// show filedrag again
	// 		self.filedrag.classList.remove('loading_file')

	// 	// on success actions
	// 		if (response.result===true) {
	// 			if (response.preview_url && self.preview_image) {
	// 				self.preview_image.src = response.preview_url
	// 			}
	// 			self.caller.refresh()
	// 			self.response_msg.innerHTML = response.msg || 'OK. File uploaded'
	// 		}else{
	// 			self.response_msg.innerHTML = response.msg || 'Error on upload file'
	// 		}


	// 	return response
	// }//end file_selected



/**
* RENDER_PROGRESS_BAR
*/
	// export const render_progress_bar = function(self) {

	// 	// progress_bar_container
	// 		const progress_bar_container = ui.create_dom_element({
	// 			element_type	: 'div',
	// 			class_name		: 'progress_bar_container'
	// 		})

	// 	// progress_info
	// 		const progress_info = ui.create_dom_element({
	// 			element_type	: 'div',
	// 			class_name		: 'progress_info',
	// 			parent 			: progress_bar_container
	// 		})
	// 		// fix
	// 		self.progress_info = progress_info

	// 	// progress_line
	// 		const progress_line = ui.create_dom_element({
	// 			element_type	: 'progress',
	// 			class_name		: 'progress_line',
	// 			parent 			: progress_bar_container
	// 		})
	// 		progress_line.max   = 100;
	// 		progress_line.value = 0;
	// 		// fix
	// 		self.progress_line = progress_line


	// 	return progress_bar_container
	// };//end render_progress_bar



/**
* FILE_DRAG_HOVER
*/
	// export const file_drag_hover = function(e) {

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
	// export const file_select_handler = function(e) {

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


// Removed for the time being (!)
	// // output information
	// function msg_output(msg) {
	// 	// file_info.innerHTML = msg + file_info.innerHTML;
	// 	file_info.innerHTML += msg;
	// }

	// // output file information
	// function parse_local_file(file) {

	// 	msg_output(
	// 		"<div><span>Name:</span> <strong>" + file.name + "</strong></div>" +
	// 		"<div><span>Type:</span> <strong>" + file.type + "</strong></div>" +
	// 		"<div><span>Size:</span> <strong>" + parseInt(file.size/1024) + "</strong> Kbytes</div>"
	// 	);

	// 	// display an image
	// 	if (file.type.indexOf("image") == 0) {
	// 		var reader = new FileReader();
	// 		reader.onload = function(e) {
	// 			msg_output(
	// 				'<div><img src="' + e.target.result + '" /></div>'
	// 			);
	// 		}
	// 		reader.readAsDataURL(file);
	// 	}

	// 	// display text
	// 	if (file.type.indexOf("text") == 0) {
	// 		var reader = new FileReader();
	// 		reader.onload = function(e) {
	// 			msg_output(
	// 				"<p><strong>" + file.name + ":</strong></p><pre>" +
	// 				e.target.result.replace(/</g, "&lt;").replace(/>/g, "&gt;") +
	// 				"</pre>"
	// 			);
	// 		}
	// 		reader.readAsText(file);
	// 	}

	// 	return true
	// };//end parse_local_file
