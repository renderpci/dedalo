/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'



/**
* Render_component
* Manage the components logic and appearance in client side
*/
export const render_component_pdf = function(component) {

	return true
}//end render_component_pdf



/**
* LIST
* Render node for use in list
* @return DOM node
*/
render_component_pdf.prototype.list = function(options) {

	const self = this

	// Options vars
		const context 	= self.context
		const data 		= self.data

	// wrapper
		const wrapper = ui.component.build_wrapper_list(self, {
			autoload : false
		})

	// url
		const value = data.value
		const url 	= DEDALO_CORE_URL + "/themes/default/pdf_icon.png"

	// image
		const image = ui.create_dom_element({
			element_type	: "img",
			src 			: url,
			parent 			: wrapper
		})


	return wrapper
}//end list



/**
* EDIT
* Render node for use in edit
* @return DOM node
*/
render_component_pdf.prototype.edit = async function(options) {

	const self = this

	// render_level
		const render_level = options.render_level

	// content_data
		const content_data = await get_content_data_edit(self)
		if (render_level==='content') {
			return content_data
		}

	// buttons
		const buttons = get_buttons(self)

	// wrapper. ui build_edit returns component wrapper
		const wrapper = ui.component.build_wrapper_edit(self, {
			content_data : content_data,
			buttons 	 : buttons
		})

	// add events
		add_events(self, wrapper)


	return wrapper
}//end edit

/**
* ADD_EVENTS
*/
const add_events = function(self, wrapper) {

	// change event, for every change the value in the imputs of the component
		wrapper.addEventListener('change', (e) => {
			// e.stopPropagation()

			// input_value. The standard input for the value of the component
			if (e.target.matches('input[type="number"].input_value')) {

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
		}, false)

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
}//end add_events




/**
* GET_CONTENT_DATA_EDIT
* @return DOM node content_data
*/
const get_content_data_edit = async function(self) {

	// sort vars
		const value 		= self.data.value
		const mode 			= self.mode
		const is_inside_tool = self.is_inside_tool

	const fragment = new DocumentFragment()

	// inputs container
		const inputs_container = ui.create_dom_element({
			element_type	: 'ul',
			class_name 		: 'inputs_container',
			parent 			: fragment
		})
		console.log("value", value);

	// values (inputs)
		const inputs_value = value//(value.length<1) ? [''] : value
		const value_length = inputs_value.length
		for (let i = 0; i < value_length; i++) {
			get_input_element_edit(i, inputs_value[i], inputs_container, self, is_inside_tool)
		}

	// content_data
		const content_data = ui.component.build_content_data(self)
			  content_data.appendChild(fragment)


	return content_data
}//end get_content_data_edit


/**
* INPUT_ELEMENT
* @return DOM node li
*/
const get_input_element_edit = (i, current_value, inputs_container, self) => {

	const mode 		 	= self.mode
	const is_inside_tool= self.is_inside_tool

	// li
		const li = ui.create_dom_element({
			element_type : 'li',
			parent 		 : inputs_container
		})

	// url
		const pdf_url 		= self.data.datalist[i].url || null
		// the standar html viewer of the pdf.js library
		const viewer_url 	= DEDALO_ROOT_WEB + '/lib/pdfjs/web/viewer.html'
	// iframe
		if (pdf_url) {
			const iframe = ui.create_dom_element({
				element_type	: "iframe",
				class_name 		: 'pdf_viewer_frame',
				parent 			: li
			})
			iframe.setAttribute('allowfullscreen',true)
			// when the standard html of pdf.js is loaded, is possible get the library and set the pdf
			iframe.addEventListener('load', (e) =>{
				// Libraries are loaded via <script> tag, create shortcut to access PDF.js exports.
				// the pdf_js is not necesary load here, we will use only the viewer
				// const pdf_js 						= iframe.contentWindow['pdfjs-dist/build/pdf'];
				const PDFViewerApplicationOptions 	= iframe.contentWindow['PDFViewerApplicationOptions'];
				self.pdf_viewer 					= iframe.contentWindow['PDFViewerApplication'];
				// remove the first page / default page of the library
				PDFViewerApplicationOptions.set('defaultUrl', '');
				// load the pdf in the viewer
				self.pdf_viewer.open(pdf_url).then(function (pdfDocument) {
					console.log("PDFViewerApplication.pagesCount", self.pdf_viewer.pagesCount);
				});
			})

			iframe.src = viewer_url
		}//end if (pdf_url)




	// FIELDS
		const fields = ui.create_dom_element({
				element_type 	: 'span',
				class_name 		: 'fields',
				parent 		 	: li
			})
		// offset label
			const offset_label = ui.create_dom_element({
					element_type 	: 'span',
					class_name 		: 'label',
					text_node 	 	: 'offset',
					parent 		 	: fields
				})

		// offset input field
			const input = ui.create_dom_element({
				element_type 	: 'input',
				type 		 	: 'number',
				class_name 		: 'input_value',
				dataset 	 	: { key : i },
				value 		 	: current_value.offset,
				parent 		 	: fields
			})

	return li
}//end input_element


/**
* GET_BUTTONS
* @param object instance
* @return DOM node buttons_container
*/
const get_buttons = (self) => {

	const is_inside_tool= self.is_inside_tool
	const mode 			= self.mode

	const fragment = new DocumentFragment()

	// button full_screen
		const button_full_screen = ui.create_dom_element({
			element_type	: 'span',
			class_name 		: 'button full_screen',
			parent 			: fragment
		})
		button_full_screen.addEventListener("mouseup", (e) =>{
			self.node[0].classList.toggle('fullscreen')
			const fullscreen_state = self.node[0].classList.contains('fullscreen') ? true : false
			event_manager.publish('full_screen_'+self.id, fullscreen_state)
		})

	// buttons tools
		if (!is_inside_tool) {
			ui.add_tools(self, fragment)
		}

	// buttons container
		const buttons_container = ui.component.build_buttons_container(self)
		buttons_container.appendChild(fragment)


	return buttons_container
}//end get_buttons
