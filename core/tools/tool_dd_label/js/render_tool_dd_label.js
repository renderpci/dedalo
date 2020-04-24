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

	const ar_langs = self.loaded_langs
	const ar_names = self.ar_names

	const fragment = new DocumentFragment()

	// add button
		const add_button = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'button tool add',
			text_content 	: '',
			parent 			: fragment
		})
		add_button.addEventListener("mouseup", async (e) =>{
			const row = await get_rows(self, ar_langs, false, '', ar_names.length)
			label_matix.appendChild(row)
		})

	// table
		const label_matix = ui.create_dom_element({
			element_type	: 'ul',
			class_name		: 'label_matix',
			parent 			: fragment
		})
	label_matix.style = `grid-template-columns: 2em repeat(${ar_langs.length+1}, 1fr);
	grid-template-rows: repeat(${ar_names.length+1}, 1fr);
	`


	// header
	const header = await get_rows(self, ar_langs, true, 'name')

	label_matix.appendChild(header)

	// labels

	for (let i = 0; i < ar_names.length; i++) {
		const current_name = ar_names[i]
		const row = await get_rows(self, ar_langs, false, current_name, i)
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
const get_rows = async function(self, ar_langs, header=false, name, key) {

	const lang_length = ar_langs.length

	// li
		const li = ui.create_dom_element({
			element_type	: 'li',
			class_name		: header===true ? 'label_header' : 'row'
		})

	// remove button
	if(header !==true){
		const remove_button = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'button tool remove',
			parent 			: li
		})
		remove_button.addEventListener("mouseup", async (e) =>{
				const old_value 	= self.ar_names[key]

				for (let i = self.ar_data.length - 1; i >= 0; i--) {
					const item = self.ar_data[i]
					if(item.name === old_value){
						self.ar_data.splice(i,1)
					}
				}
				 self.ar_names.splice(key,1)
				// for (var i = 0; i < ar_keys.length; i++) {
				// 	self.ar_data.splice(ar_keys[i],1)
				// }
				li.remove()
				self.update_data()
		})
	}else{
		const remove_button = ui.create_dom_element({
			element_type	: 'div',
			class_name		: '',
			parent 			: li
		})

	}


	// label name
		const label_name = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'label name',
			text_content 	: header===true ? 'name' : name,
			contenteditable : header===true ? false : true,
			parent 			: li
		})
		label_name.addEventListener("blur", function(e){
			const old_value 	= self.ar_names[key]
			const dirty_value 	= label_name.innerText
			const lower_value 	= dirty_value.replace(/\w/g, u => u.toLowerCase())
			const value 		= lower_value.replace(/\s/g, '_')

			const data = self.ar_data.filter(item => item.name === old_value)

			for (let i = 0; i < data.length; i++) {
				data[i].name = value
			}

			self.ar_names[key] 	= value
			label_name.innerText = value

			// update the data into the instance, prepared to save
			// (but is not saved directly, the user need click in the save button)
			self.update_data()
		})
		// if the user press return key = 13, we blur the text box
		label_name.addEventListener("keydown", (e) =>{
			if(e.keyCode === 13) label_name.blur()
		})

	for (let i = 0; i < lang_length; i++) {
		const current_lang = ar_langs[i]
		get_inputs(self, current_lang, header, name, key, li)
	}

	return li
}// end get_rows




/**
* GET_INPUTS
* @return DOM node content_data
*/
const get_inputs = async function(self, current_lang, header, name, key, li) {

	let data = self.ar_data.find(item => item.name === name && item.lang === current_lang.value )

	const label_value = typeof data !== 'undefined'
		? data.value
		: ''

	// label language
		const label_language = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'label',
			text_content 	: header===true ? current_lang.label : label_value,
			dataset 		: header===true ? '' : {"placeholder": name},
			contenteditable : header===true ? false : true,
			parent 			: li
		})

		// label_language.addEventListener("change", async (e) =>{
		// 	data.value = label_language.value
		// 	console.log("data", data);
		// })

		// when the user has double click in the text we active the edit text box
		// label_language.addEventListener("mouseup", (e) =>{
		// 	label_language.focus();
		// })
		// when the user blur the text box save the name into the layer structure
		label_language.addEventListener("blur", (e)=>{

			if(label_language.innerText==='') return
			if(typeof data !== 'undefined'){
				data.value = label_language.innerText
			}else{
				const name 		= self.ar_names[key]
				const new_data 	= {
					lang 	: current_lang.value,
					name 	: name,
					value 	: label_language.innerText
				}
				self.ar_data.push(new_data)
				data = self.ar_data.find(item => item.name === name && item.lang === current_lang.value )
			}

			console.log("data", data);
			console.log("self.ar_data", self.ar_data);
			// update the data into the instance, prepared to save
			// (but is not saved directly, the user need click in the save button)
		 	self.update_data()
		})
		// if the user press return key = 13, we blur the text box
		label_language.addEventListener("keydown", (e) =>{
			if(e.keyCode === 13) label_language.blur()
		})
}// end get_inputs
