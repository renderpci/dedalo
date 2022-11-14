/*global get_label, page_globals, SHOW_DEBUG, DEDALO_ROOT_WEB */
/*eslint no-undef: "error"*/



// imports
	// import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'
	import {when_in_viewport} from '../../common/js/events.js'



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
* @return DOM node
*/
view_default_edit_pdf.render = async function(self, options) {

	// options
		const render_level = options.render_level || 'full'

	// content_data
		const content_data = await get_content_data_edit(self)
		if (render_level==='content') {
			return content_data
		}

	// buttons
		const buttons = get_buttons(self)

	// wrapper. ui build_edit returns component wrapper
		const wrapper = ui.component.build_wrapper_edit(self, {
			content_data	: content_data,
			buttons			: buttons
		})
		// set pointers
		wrapper.content_data = content_data

	// fix editor height. This guarantees that content_data grow to the maximum possible height
		// when_in_viewport(wrapper, ()=> {
		// 	const wrapper_height	= wrapper.offsetHeight
		// 	const label_height		= wrapper.label ? wrapper.label.offsetHeight : 0
		// 	wrapper.content_data.style.height = (wrapper_height - label_height) + 'px'
		// })


	return wrapper
}//end edit



/**
* GET_CONTENT_DATA_EDIT
* @return DOM node content_data
*/
export const get_content_data_edit = function(self) {

	// short vars
		const data	= self.data || {}
		const value	= data.value || []

	// content_data
		const content_data = ui.component.build_content_data(self)

	// values (documents)
		const inputs_value	= (value.length<1) ? [null] : value // force one empty element at least
		const value_length	= inputs_value.length
		for (let i = 0; i < value_length; i++) {
			const content_value = get_content_value(i, inputs_value[i], self)
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
* @return DOM node li
*/
const get_content_value = function(i, current_value, self) {

	// short vars
		const quality		= self.quality || self.context.quality
		const datalist		= self.data.datalist || []
		const offset_value	= current_value && current_value.lib_data && current_value.lib_data.offset!=='undefined' && current_value.lib_data.offset!==null
			? current_value.lib_data.offset
			: 1

	// content_value
		const content_value = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'content_value'
		})

	// pdf_url
		const file_info	= datalist.find(el => el.quality===quality && el.file_exist===true)
		const pdf_url	= file_info
			? file_info.url
			: null

	if (pdf_url) {

		// DES
			// const pdf_viewer = ui.create_dom_element({
			//    	element_type	: "div",
			//    	class_name 		: 'pdf_viewer_frame',
			//    	parent 			: li
			// })
			//
			// const shadow = pdf_viewer.attachShadow({mode: 'open'});
			//
			// const response =  await fetch(viewer_url)
			// // console.log("response", response);
			// // .then(response => response.text())
			// // .then( txt =>  new DOMParser().parseFromString(txt, 'text/html'))
			// const txt = await response.text();
			// // console.log("txt", txt);
			// const html =  new DOMParser().parseFromString(txt, 'text/html');
			//
			// console.log("html", html);
			//
			// shadow.appendChild(html.querySelector('html') )// = txt;

		// iframe. PDF viewer (pdfjs) is loaded inside a iframe
			const iframe = ui.create_dom_element({
				element_type	: 'iframe',
				class_name		: 'pdf_viewer_frame',
				parent			: content_value
			})
			// iframe.setAttribute('allowfullscreen',true)

			// webviewerloaded. when the standard html of pdf.js is loaded, it is possible to get the library and set the pdf
				// iframe.addEventListener("webviewerloaded", fn_webviewerloaded)
				top.document.addEventListener('webviewerloaded', fn_webviewerloaded, false)
				async function fn_webviewerloaded(e) {
					console.log("webviewerloaded e:",e);

					// shadow.addEventListener('load', (e) =>{
					const locale_code = page_globals.locale || 'es-ES'
					// Libraries are loaded via <script> tag, create shortcut to access PDF.js exports.
					// the pdf_js is not necesary load here, we will use only the viewer
					// self.pdf_js 						= iframe.contentWindow['pdfjs-dist/build/pdf'];

					// options
						const pdf_viewer_options = await iframe.contentWindow['PDFViewerApplicationOptions'];
						// remove the first page / default page of the library
						pdf_viewer_options.set('defaultUrl', '');
						// set correct locale
						pdf_viewer_options.set('locale', locale_code);

					// pdf_viewer
						self.pdf_viewer = await iframe.contentWindow['PDFViewerApplication'];

					// console.log("PDFViewerApplicationOptions", PDFViewerApplicationOptions);
					// console.log("/// pdf_url:",pdf_url);

					// load the pdf in the viewer
					self.pdf_viewer.open(pdf_url)
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
				// iframe.src = viewer_url // direct or by observe event

			// set iframe url on DOM entry
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
				class_name		: 'label',
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
	}//end if (pdf_url)


	return content_value
}//end input_element



/**
* GET_BUTTONS
* @param object instance
* @return DOM node buttons_container
*/
const get_buttons = (self) => {

	// DOM fragment
		const fragment = new DocumentFragment()

	// prevent show buttons inside a tool
		if (self.caller && self.caller.type==='tool') {
			return fragment
		}

	// buttons tools
		ui.add_tools(self, fragment)

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
