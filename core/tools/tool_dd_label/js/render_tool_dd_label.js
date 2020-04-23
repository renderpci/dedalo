/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../../common/js/event_manager.js'
	import {ui} from '../../../common/js/ui.js'



/**
* RENDER_TOOL_UPLOAD
* Manages the component's logic and apperance in client side
*/
export const render_tool_dd_label = function() {

	return true
}//end render_tool_dd_label



/**
* RENDER_TOOL_upload
* Render node for use like button
* @return DOM node
*/
render_tool_dd_label.prototype.edit = async function (options={render_level:'full'}) {

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

	// modal container
		const header = wrapper.querySelector('.tool_header')
		const modal  = ui.attach_to_modal(header, wrapper, null, 'big')
		// const modal  = ui.attach_to_modal(header, wrapper, null)
		modal.on_close = () => {
			self.destroy(true, true, true)
		}

	// events
		// click
			// wrapper.addEventListener("click", function(e){
			// 	e.stopPropagation()
			// 	console.log("e:",e);
			// 	return
			// })


	return wrapper
}//end render_tool_dd_label



/**
* GET_CONTENT_DATA
* @return DOM node content_data
*/
const get_content_data = async function(self) {


	const fragment = new DocumentFragment()

	// add button
		const add_button = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'button tool add',
			text_content 	: '',
			parent 			: fragment
		})
		add_button.addEventListener("mouseup", (e) =>{
			this.zoom.activate()
			activate_status(zoom)
		})

	// table
		const label_matix = ui.create_dom_element({
			element_type	: 'ul',
			class_name		: 'label_matix',
			text_content 	: '',
			parent 			: fragment
		})

	const ar_langs = self.loaded_langs
	// header
	const header = await get_rows(self, ar_langs, true, 'name')

	label_matix.appendChild(header)

	// labels
	const ar_names = self.ar_data.find(item => item.type==='main').names

	for (let i = 0; i < ar_names.length; i++) {
		const current_name = ar_names[i]
		const row = await get_rows(self, ar_langs, false, current_name)
		label_matix.appendChild(row)
	}


	// content_data
		const content_data = document.createElement("div")
			  content_data.classList.add("content_data", self.type)
			  content_data.appendChild(fragment)


	return content_data
}//end get_content_data



/**
* GET_ROWS
* @return DOM node content_data
*/
const get_rows = async function(self, ar_langs, header=false, name) {

	const lang_length = ar_langs.length

	// li
		const li = ui.create_dom_element({
			element_type	: 'li',
			class_name		: header===true ? 'label_header' : 'row'
		})
		li.style = `grid-template-columns: repeat(${lang_length+1}, 1fr);`

	// label name
		const language = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'label name',
			text_content 	: header===true ? 'name' : name,
			parent 			: li
		})


	for (let i = 0; i < lang_length; i++) {
		const current_lang = ar_langs[i]
		get_inputs(self, current_lang, header, name, li)
	}

	return li
}// end get_rows




/**
* GET_INPUTS
* @return DOM node content_data
*/
const get_inputs = async function(self, current_lang, header, name, li) {

	const data = self.ar_data.find(item => item.name === name && item.lang === current_lang.value )

	const label_value = typeof data !== 'undefined'
		? data.value
		: ''

	// label language
		const language = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'label',
			text_content 	: header===true ? current_lang.label : label_value,
			dataset 		: header===true ? '' : {"placeholder": name},
			contenteditable : header===true ? false : true,
			parent 			: li
		})
}// end get_inputs
