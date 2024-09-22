// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_ROOT_WEB */
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'
	import {when_in_viewport} from '../../common/js/events.js'
	import {open_tool} from '../../../tools/tool_common/js/tool_common.js'



/**
* VIEW_DEFAULT_EDIT_PDF
* Manage the components logic and appearance in client side
*/
export const view_default_edit_pdf = function() {

	return true
}//end view_default_edit_pdf



/**
* RENDER
* Render node for use in current view
* @param object self
* @param object options
* @return HTMLElement wrapper
*/
view_default_edit_pdf.render = async function(self, options) {

	// options
		const render_level = options.render_level || 'full'

	// content_data
		const content_data = get_content_data_edit(self)
		if (render_level==='content') {
			return content_data
		}

	// buttons
		const buttons = (self.permissions > 1)
			? get_buttons(self)
			: null

	// wrapper. ui build_edit returns component wrapper
		const wrapper_options = {
			content_data	: content_data,
			buttons			: buttons,
			add_styles		: ['media_wrapper'] // common media classes
		}
		if (self.view==='line') {
			wrapper_options.label = null // prevent to create label node
		}
		const wrapper = ui.component.build_wrapper_edit(self, wrapper_options)
		// set pointers
		wrapper.content_data = content_data


	return wrapper
}//end render



/**
* GET_CONTENT_DATA_EDIT
* @param object self
* @return HTMLElement content_data
*/
export const get_content_data_edit = function(self) {

	// short vars
		const data	= self.data || {}
		const value	= data.value || []

	// content_data
		const content_data = ui.component.build_content_data(self)
		// common media classes
		content_data.classList.add('media_content_data')

	// values (documents)
		const inputs_value	= (value.length<1) ? [null] : value // force one empty element at least
		const value_length	= inputs_value.length
		for (let i = 0; i < value_length; i++) {
			// get the content_value
			const content_value = get_content_value(i, inputs_value[i], self)
			// add node to content_data
			content_data.appendChild(content_value)
			// set the pointer
			content_data[i] = content_value
		}


	return content_data
}//end get_content_data_edit



/**
* GET_CONTENT_VALUE
*
* @param int i
* 	Value key
* @param object current_value
* 	Object value as
* {
	"original_file_name": "rsc209_rsc205_524_lg-spa.pdf",
	"original_upload_date": {
	  "day": 21,
	  "hour": 13,
	  "time": 65009224561,
	  "year": 2022,
	  "month": 8,
	  "minute": 56,
	  "second": 1
	}
  }
* @param object self
* @return HTMLElement content_value
*/
const get_content_value = function(i, current_value, self) {

	// short vars
		const quality		= self.quality || self.context.features.quality
		const offset_value	= current_value && current_value.lib_data && current_value.lib_data.offset!=='undefined' && current_value.lib_data.offset!==null
			? current_value.lib_data.offset
			: 1
		const data			= self.data || {}
		const value			= data.value || []
		const files_info	= value[0]
			? (value[0].files_info || [])
			: []
		const external_source	= data.external_source
		const extension			= self.context.features.extension

	// content_value node
		const content_value = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'content_value media_content_value'
		})

	// pdf_url
		const file_info	= files_info.find(el => el.quality===quality && el.file_exist===true && el.extension===extension)
		const pdf_url	= file_info
			? DEDALO_MEDIA_URL + file_info.file_path + '?t=' + (new Date()).getTime()
			: null
		// no PDF file url available case
		if (!pdf_url) {

			const url = page_globals.fallback_image // page_globals.fallback_image

			const image = ui.create_dom_element({
				element_type	: 'img',
				class_name		: '',
				src				: url,
				parent			: content_value
			})
			// open viewer
			image.addEventListener('mousedown', function (e) {
				e.stopPropagation();

				// get the upload tool to be fired
					const tool_upload = self.tools.find(el => el.model === 'tool_upload')

				// open_tool (tool_common)
					open_tool({
						tool_context	: tool_upload,
						caller			: self
					})
			})

			return content_value
		}

	// iframe. PDF viewer (pdfjs) is loaded inside a iframe
		const iframe = ui.create_dom_element({
			element_type	: 'iframe',
			class_name		: 'pdf_viewer_frame',
			parent			: content_value
		})
		// iframe.setAttribute('allowfullscreen',true)

		// webviewerloaded event. When the standard html of pdf.js is loaded, it is possible to get the library and set the PDF file
			top.document.addEventListener('webviewerloaded', fn_webviewerloaded, false)
			async function fn_webviewerloaded() {

				// shadow.addEventListener('load', (e) =>{
				const locale_code = page_globals.locale || 'es-ES'
				// Libraries are loaded via <script> tag, create shortcut to access PDF.js exports.
				// the pdf_js is not necessary load here, we will use only the viewer
				// self.pdf_js 						= iframe.contentWindow['pdfjs-dist/build/pdf'];

				if (!iframe.contentWindow) {
					console.warn('! Ignored not found iframe contentWindow:', 'fn_webviewerloaded');
					return
				}

				// add css to change the interface
				iframe.classList.add('loading')
				iframe.addEventListener('load', function(e) {

						const doc = iframe.contentDocument
						const href_css = (self.permissions===1)
							? DEDALO_CORE_URL + '/component_pdf/css/pdfjs_default_read_only.css' // css for read_only
							: DEDALO_CORE_URL + '/component_pdf/css/pdfjs_default_edit.css' // css for edit

						const css_link = document.createElement("link");
						css_link.href = href_css
						css_link.rel = 'stylesheet';
						css_link.type = 'text/css';
						doc.head.appendChild(css_link);

						iframe.classList.remove('loading')
				})

				// options
					const pdf_viewer_options = await iframe.contentWindow['PDFViewerApplicationOptions'];
					if (pdf_viewer_options) {
						// remove the first page / default page of the library
						pdf_viewer_options.set('defaultUrl', '');
						// set correct locale
						pdf_viewer_options.set('locale', locale_code);
						pdf_viewer_options.set("enablePermissions", true); //allow PDF documents to disable copying in the viewer
					}

				// pdf_viewer
					self.pdf_viewer = await iframe.contentWindow['PDFViewerApplication'];
					if (!self.pdf_viewer) {
						return
					}

				// console.log("PDFViewerApplicationOptions", PDFViewerApplicationOptions);
				// console.log("/// pdf_url:",pdf_url);

				// load the pdf in the viewer
				self.pdf_viewer.open({
					url : pdf_url
				})
				.then(function() {
					// PDFViewerApplicationOptions.document.webL10n.setLanguage(locale_code)
					// PDFViewerApplicationOptions.set('locale', locale_code);
					// PDFViewerApplicationOptions.locale = locale_code
					// PDFViewerApplicationOptions.set('locale', locale_code);
					// console.log("PDFViewerApplication.pagesCount", self.pdf_viewer.pagesCount);
				});

				// listener. Remove the listener to prevent navigation problems
				top.document.removeEventListener('webviewerloaded', fn_webviewerloaded, false)
			}//end fn_webviewerloaded

		// viewer_url. the standard html viewer of the pdf.js library
			const viewer_url = DEDALO_ROOT_WEB + '/lib/pdfjs/web/viewer.html'

		// set iframe URL on DOM entry
			when_in_viewport(
				iframe, // node to observe
				() => { // callback function
					iframe.src = viewer_url // load URL to iframe
				}
			)

	// fields. Bottom line with input offset options
		const fields = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'fields',
			parent			: content_value
		})
		// offset label
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'offset',
			text_node		: 'offset',
			parent			: fields
		})
		// offset_input field
		const offset_input = ui.create_dom_element({
			element_type	: 'input',
			type			: 'number',
			class_name		: '',
			value			: offset_value,
			parent			: fields
		})
		offset_input.addEventListener('change', function() {

			if (this.value.length>0) {

				current_value[i].lib_data = current_value[i].lib_data || {}
				// add/update offset
				current_value[i].lib_data.offset = parseInt(this.value)

				const changed_data = [Object.freeze({
					action	: 'update',
					key		: i,
					value	: current_value
				})]
				self.change_value({
					changed_data	: changed_data,
					refresh			: false
				})
			}
		})


	return content_value
}//end get_content_value



/**
* GET_BUTTONS
* @param object instance
* @return HTMLElement buttons_container
*/
const get_buttons = (self) => {

	// short vars
		const show_interface = self.show_interface

	// fragment
		const fragment = new DocumentFragment()

	// buttons tools
		if(show_interface.tools === true){
			ui.add_tools(self, fragment)
		}

	// button_fullscreen
		if(show_interface.button_fullscreen === true){

			const button_fullscreen = ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'button full_screen',
				title			: get_label.full_screen || 'Full screen',
				parent			: fragment
			})
			button_fullscreen.addEventListener('click', function(e) {
				e.stopPropagation()
				ui.enter_fullscreen(self.node)
			})
		}

	// buttons container
		const buttons_container = ui.component.build_buttons_container(self)

	// buttons_fold (allow sticky position on large components)
		const buttons_fold = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'buttons_fold',
			parent			: buttons_container
		})
		buttons_fold.appendChild(fragment)


	return buttons_container
}//end get_buttons



// @license-end
