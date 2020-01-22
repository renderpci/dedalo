/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../../common/js/event_manager.js'
	import {ui} from '../../../common/js/ui.js'



/**
* RENDER_TOOL_UPLOAD
* Manages the component's logic and apperance in client side
*/
export const render_tool_upload = function() {

	return true
}//end render_tool_upload



/**
* RENDER_TOOL_upload
* Render node for use like button
* @return DOM node
*/
render_tool_upload.prototype.edit = async function (options={render_level:'full'}) {

	const self = this

	const render_level 	= options.render_level

	// content_data
		const current_content_data = await get_content_data(self)
		if (render_level==='content') {
			return current_content_data
		}

	// wrapper. ui build_edit returns component wrapper
		const wrapper = await ui.tool.build_wrapper_edit(self, {
			content_data : current_content_data
		})

	// // buttons container
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

	// modal container
		ui.tool.attach_to_modal(wrapper, self)

	// events
		// click
			// wrapper.addEventListener("click", function(e){
			// 	e.stopPropagation()
			// 	console.log("e:",e);
			// 	return
			// })


	return wrapper
}//end render_tool_upload



/**
* GET_CONTENT_DATA
* @return DOM node content_data
*/
const get_content_data = async function(self) {


	const fragment = new DocumentFragment()


	// form
		const form = ui.create_dom_element({
			element_type	: 'form',
			id 				: 'form_upload',
			parent 			: fragment
		})
		form.name 		= 'form_upload'
		form.enctype 	= 'multipart/form-data'
		form.method 	= 'post'

	// input
		const input = ui.create_dom_element({
			element_type	: 'input',
			type 			: 'file',
			id 				: 'file_to_upload',
			parent 			: form
		})
		input.addEventListener("change", function(e){
			const file = this.files[0]
			self.upload_file(file, content_data, response_msg, preview_image, progress_bar_container)
		})

	// label
		const label = ui.create_dom_element({
			element_type	: 'label',
			for 			: 'file_to_upload',
			text_content 	: get_label.seleccione_un_fichero || 'Select a file to upload',
			parent 			: form
		})

	// progress_bar_container
		const progress_bar_container = get_progress_bar(self)
		fragment.appendChild(progress_bar_container)

	// response_container
		const response_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'response_container',
			parent 			: fragment
		})
		// response_msg
		const response_msg = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'response_msg',
			parent 			: response_container
		})
		// preview_image
		const preview_image = ui.create_dom_element({
			element_type	: 'img',
			class_name		: 'preview_image',
			parent 			: response_container
		})
		preview_image.addEventListener("click", function(e){
			window.open(this.src)
		})

	// info
		// container info
		const info = ui.create_dom_element({
			element_type	: 'div',
			class_name 		: 'info',
			// text_content 	: '',
			parent 			: fragment
		})
		// caller component
		ui.create_dom_element({
			element_type	: 'div',
			inner_html	 	: '<label>Caller component</label>' + self.caller.model,
			parent 			: info
		})
		// target quality
		ui.create_dom_element({
			element_type	: 'div',
			inner_html	 	: '<label>Target quality</label>' + self.caller.context.default_target_quality,
			parent 			: info
		})
		// allowed extensions
		ui.create_dom_element({
			element_type	: 'div',
			inner_html	 	: '<label>Allowed extensions</label>' + self.caller.context.allowed_extensions.join(", "),
			parent 			: info
		})
		// max upload file size
		const max_mb = Math.floor(self.max_size_bytes / (1024*1024))
		ui.create_dom_element({
			element_type	: 'div',
			class_name 		: (max_mb < 100) ? 'warning' : '',
			inner_html	 	: '<label>Max file size</label>' + max_mb.toLocaleString() + ' MB',
			parent 			: info
		})
		// sys_get_temp_dir
		ui.create_dom_element({
			element_type	: 'div',
			inner_html	 	: '<label>System temp dir</label>' + self.sys_get_temp_dir,
			parent 			: info
		})
		// upload_tmp_dir
		ui.create_dom_element({
			element_type	: 'div',
			inner_html	 	: '<label>User upload tmp dir</label>' + self.upload_tmp_dir,
			parent 			: info
		})
		// upload_tmp_perms
		ui.create_dom_element({
			element_type	: 'div',
			inner_html	 	: '<label>User upload tmp perms</label>' + self.upload_tmp_perms,
			parent 			: info
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


	// // buttons container
	// 	const buttons_container = ui.create_dom_element({
	// 		element_type	: 'div',
	// 		class_name 		: 'buttons_container',
	// 		parent 			: components_container
	// 	})

	// content_data
		const content_data = document.createElement("div")
			  content_data.classList.add("content_data", self.type)
			  content_data.appendChild(fragment)


	return content_data
}//end get_content_data



/**
* GET_PROGRESS_BAR
*/
const get_progress_bar = function(self) {

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

		// progress_line
		const progress_line = ui.create_dom_element({
			element_type	: 'progress',
			class_name		: 'progress_line',
			parent 			: progress_bar_container
		})
		progress_line.max   = 100;
		progress_line.value = 0;


	return progress_bar_container
}//end get_progress_bar



/**
* ADD_COMPONENT

export const add_component = async (self, component_container, value) => {

	// user select blank value case
		if (!value) {
			while (component_container.firstChild) {
				// remove node from dom (not component instance)
				component_container.removeChild(component_container.firstChild)
			}
			return false
		}

	const component = await self.load_component(value)
	const node = await component.render()

	while (component_container.firstChild) {
		component_container.removeChild(component_container.firstChild)
	}
	component_container.appendChild(node)

	return true
}//end add_component
*/




