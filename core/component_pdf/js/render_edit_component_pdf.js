/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_ROOT_WEB */
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'



/**
* RENDER_EDIT_COMPONENT_PDF
* Manage the components logic and appearance in client side
*/
export const render_edit_component_pdf = function() {

	return true
}//end render_edit_component_pdf



/**
* EDIT
* Render node for use in edit
* @return DOM node
*/
render_edit_component_pdf.prototype.edit = async function(options) {

	const self = this

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

	// add events
		add_events(self, wrapper)


	return wrapper
}; //end edit



/**
* ADD_EVENTS
*/
const add_events = function(self, wrapper) {

	// change event, for every change the value in the inputs of the component
		wrapper.addEventListener('change', (e) => {
			// e.stopPropagation()

			// offset. input_value. The standard input for the value of the component
			if (e.target.matches('input[type="number"]')) {

				const changed_data = Object.freeze({
					action	: 'update',
					key		: JSON.parse(e.target.dataset.key),
					value	: {offset : (e.target.value.length>0) ? parseInt(e.target.value) : null}
				})
				console.log("changed_data", changed_data);
				self.change_value({
					changed_data : changed_data,
					refresh 	 : false
				})
				.then((save_response)=>{
					// event to update the dom elements of the instance
					event_manager.publish('update_value_'+self.id, changed_data)
				})

				return true
			}
		})

	// click event [mousedown]
		wrapper.addEventListener("click", e => {
			// remove
			if (e.target.matches('.button.remove')) {

				// force possible input change before remove
				document.activeElement.blur()

				const changed_data = Object.freeze({
					action	: 'remove',
					key		: e.target.dataset.key,
					value	: null,
					refresh : true
				})
				self.change_value({
					changed_data : changed_data,
					label 		 : e.target.previousElementSibling.value,
					refresh 	 : true
				})
				.then(()=>{
				})

				return true
			}
		})

	return true
}; //end add_events



/**
* GET_CONTENT_DATA_EDIT
* @return DOM node content_data
*/
const get_content_data_edit = function(self) {

	// short vars
		const value = self.data.value

	const fragment = new DocumentFragment()

	// inputs container
		const inputs_container = ui.create_dom_element({
			element_type	: 'ul',
			class_name		: 'inputs_container',
			parent			: fragment
		})

	// url
		const quality		= self.quality || self.context.quality
		const datalist		= self.data.datalist
		const file_info		= datalist.find(el => el.quality===quality && el.file_exist===true)
		const pdf_url		= file_info
			? file_info.url
			: null

		if (pdf_url) {
			const i				= 0
			const inputs_value	= (value && value.length>0) ? value : [{}]
			const li			= get_input_element_edit(self, i, inputs_value[i], pdf_url)
			inputs_container.appendChild(li)
		}

	// values (inputs)
		// const inputs_value	= (value && value.length>0) ? value : [{}]
		// const value_length	= inputs_value.length
		// for (let i = 0; i < value_length; i++) {
		// 	const li = get_input_element_edit(i, inputs_value[i], self)
		// 	inputs_container.appendChild(li)
		// }

	// content_data
		const content_data = ui.component.build_content_data(self)
			  content_data.appendChild(fragment)


	return content_data
}; //end get_content_data_edit



/**
* INPUT_ELEMENT
* @return DOM node li
*/
const get_input_element_edit = function(self, i, current_value, pdf_url) {

	// offset
		const offset_value = current_value && current_value.offset!=='undefined' && current_value.offset!==null
			? current_value.offset
			: 1

	// li
		const li = ui.create_dom_element({
			element_type : 'li'
		})

	// url
		// // const pdf_url	= self.data.datalist[i].url || null
		// const quality		= self.quality || self.context.quality
		// const datalist		= self.data.datalist
		// const file_info		= datalist.find(el => el.quality===quality && el.file_exist===true)
		// const pdf_url		= file_info
		// 	? file_info.url
		// 	: null

	// iframe
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

			// iframe
				const iframe = ui.create_dom_element({
					element_type	: "iframe",
					class_name		: 'pdf_viewer_frame',
					parent			: li
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
				const observer = new IntersectionObserver(function(entries) {
					const entry = entries[1] || entries[0]
					if (entry.isIntersecting===true || entry.intersectionRatio > 0) {
						observer.disconnect();
						iframe.src = viewer_url // load URL to iframe
					}
				}, { threshold: [0] });
				observer.observe(iframe);

		}//end if (pdf_url)


	// fields
		const fields = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'fields',
			parent			: li
		})
		// offset label
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'label',
			text_node		: 'offset',
			parent			: fields
		})
		// offset input field
		ui.create_dom_element({
			element_type	: 'input',
			type			: 'number',
			class_name		: '',
			dataset			: { key : i },
			value			: offset_value,
			parent			: fields
		})


	return li
}; //end input_element



/**
* GET_BUTTONS
* @param object instance
* @return DOM node buttons_container
*/
const get_buttons = (self) => {

	const fragment = new DocumentFragment()

	// prevent show buttons inside a tool
		if (self.caller && self.caller.type==='tool') {
			return fragment
		}

	// button full_screen
		// const button_full_screen = ui.create_dom_element({
		// 	element_type	: 'span',
		// 	class_name		: 'button full_screen',
		// 	parent			: fragment
		// })
		// button_full_screen.addEventListener("mouseup", () =>{
		// 	self.node[0].classList.toggle('fullscreen')
		// 	const fullscreen_state = self.node[0].classList.contains('fullscreen') ? true : false
		// 	event_manager.publish('full_screen_'+self.id, fullscreen_state)
		// })

	// buttons tools
		ui.add_tools(self, fragment)

	// buttons container
		const buttons_container = ui.component.build_buttons_container(self)
			// buttons_container.appendChild(fragment)

	// buttons_fold (allow sticky position on large components)
		const buttons_fold = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'buttons_fold',
			parent			: buttons_container
		})
		buttons_fold.appendChild(fragment)


	return buttons_container
}; //end get_buttons


