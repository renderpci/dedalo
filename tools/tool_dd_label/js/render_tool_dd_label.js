// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../../core/common/js/ui.js'



/**
* RENDER_TOOL_DD_LABEL
* Manages the component's logic and appearance in client side
*/
export const render_tool_dd_label = function() {

	return true
}//end render_tool_dd_label



/**
* EDIT
* Render tool main node
* @param object options = {}
* @return HTMLElement wrapper
*/
render_tool_dd_label.prototype.edit = async function (options={}) {

	const self = this

	// options
		const render_level = options.render_level

	// content_data
		const content_data = await get_content_data(self)
		if (render_level==='content') {
			return content_data
		}

	// wrapper. ui build_edit returns component wrapper
		const wrapper = ui.tool.build_wrapper_edit(self, {
			content_data : content_data
		})
		// set pointers
		wrapper.content_data = content_data


	return wrapper
}//end render_tool_dd_label



/**
* GET_CONTENT_DATA
* Render tool content_data node and children
* @param object self
* @return HTMLElement content_data
*/
const get_content_data = async function(self) {

	// short vars
		const ar_langs = self.loaded_langs
		const ar_names = self.ar_names

	// DocumentFragment
		const fragment = new DocumentFragment()

	// table
		const label_matix = ui.create_dom_element({
			element_type	: 'ul',
			class_name		: 'label_matix',
			parent			: fragment
		})
		label_matix.style = `grid-template-columns: 2em repeat(${ar_langs.length+1}, 1fr);`
		// set pointer
		self.label_matix = label_matix

	// header_row
		const header_row = await render_row(
			self,
			ar_langs,
			true, // bool is header
			'name',
			null // key
		)
		label_matix.appendChild(header_row)

	// rows. One row for each name
		const ar_names_length = ar_names.length
		for (let i = 0; i < ar_names_length; i++) {
			const current_name = ar_names[i]
			const row = await render_row(
				self,
				ar_langs,
				false, // bool is header
				current_name,
				i
			)
			label_matix.appendChild(row)
		}

	// content_data
		const content_data = ui.tool.build_content_data(self)
		content_data.appendChild(fragment)


	return content_data
}//end get_content_data



/**
* RENDER_ROW
* Render all tool rows
* @param object self
* @param array ar_langs
* @param bool header
* @param string name
* @param int key
* @return HTMLElement li
*/
const render_row = async function(self, ar_langs, header, name, key) {

	const lang_length = ar_langs.length

	// li
		const li = ui.create_dom_element({
			element_type	: 'li',
			class_name		: 'row ' + (header===true ? 'label_header' : 'label_data')
		})

	// left button : add / remove based on row type
		if(header===true) {

			// add button
			const add_button = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'button tool add',
				inner_html		: '',
				parent			: li
			})
			add_button.addEventListener('click', async (e) =>{
				e.stopPropagation()

				// safe_leght
					const rows_list = li.parentNode.querySelectorAll('.label_data')
					const safe_leght = [...rows_list].length

				const row = await render_row(
					self,
					ar_langs, // array ar_langs
					false, // bool is header
					'', // string name
					safe_leght // self.ar_names.length // int key
				)
				self.label_matix.appendChild(row)
			})

		}else{

			// remove_button
			const remove_button = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'button tool remove',
				parent			: li
			})
			remove_button.addEventListener('click', async (e) =>{
				e.stopPropagation()

				// safe key
					const rows_list = li.parentNode.querySelectorAll('.label_data')
					const safe_key = [...rows_list].findIndex(el => el==li)

				// old value
					const old_value = self.ar_names[safe_key]

				// remove from array
					for (let i = self.ar_data.length - 1; i >= 0; i--) {
						const item = self.ar_data[i]
						if(item.name===old_value) {
							self.ar_data.splice(i,1)
						}
					}
					self.ar_names.splice(safe_key,1)

				// update data
					self.update_data()

				// remove row node
					li.remove()
			})
		}

	// label_name
		const label_name = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'label name',
			inner_html		: header===true ? 'name' : name,
			contenteditable	: header===true ? false : true,
			parent			: li
		})
		label_name.addEventListener('blur', function(){

			const old_value		= self.ar_names[key]
			const dirty_value	= label_name.innerText
			const lower_value	= dirty_value.replace(/\w/g, u => u.toLowerCase())
			const value			= lower_value.replace(/\s/g, '_')

			const data = self.ar_data.filter(item => item.name===old_value)
			for (let i = 0; i < data.length; i++) {
				data[i].name = value
			}

			self.ar_names[key]		= value
			label_name.innerText	= value

			// update the data into the instance, prepared to save
			// (but is not saved directly, the user need click in the save button)
			self.update_data()
		})
		// event keydown. If the user press return key = 13, we blur the text box
		label_name.addEventListener('keydown', (e) =>{
			if(e.keyCode === 13) {
				e.stopPropagation()
				e.preventDefault()
				label_name.blur()
			}
		})

	// add language_label nodes
		for (let i = 0; i < lang_length; i++) {

			const language_label_node = await render_language_label(
				self,
				ar_langs[i],
				header, name,
				key
			)
			li.appendChild(language_label_node)
		}


	return li
}//end render_row



/**
* RENDER_LANGUAGE_LABEL
* Create each language_label node
* @param object self
* @param string current_lang
* @param bool header
* @param string|null name
* @param int key
* @return HTMLElement language_label
*/
const render_language_label = async function(self, current_lang, header, name, key) {

	// data
		let data = self.ar_data.find(item => item.name===name && item.lang===current_lang.value )

	// label
		const label_value = typeof data!=='undefined'
			? data.value || ''
			: ''
		const placeholder = name || ''

	// language_label
		const language_label = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'label',
			inner_html		: header===true ? current_lang.label : label_value,
			dataset			: header===true ? '' : { placeholder : placeholder },
			contenteditable	: header===true ? false : true
		})

		// change event
			// language_label.addEventListener("change", async (e) =>{
			// 	data.value = language_label.value
			// 	console.log("data", data);
			// })

		// mouseup event. When the user has double click in the text we active the edit text box
			// language_label.addEventListener("mouseup", (e) =>{
			// 	language_label.focus();
			// })

		const save_sequence = function() {

			if(typeof data!=='undefined'){

				// update data value
				data.value = language_label.innerText

			}else{

				const name		= self.ar_names[key]
				const new_data	= {
					lang	: current_lang.value,
					name	: name,
					value	: language_label.innerText
				}
				self.ar_data.push(new_data)

				// update current data
				data = self.ar_data.find(item => item.name===name && item.lang===current_lang.value )
			}

			// update_data. Updates caller data
			// update the data into the instance, prepared to save
			// (but is not saved directly, the user need click in the save button)
		 	self.update_data()
		}

		// blur event. When the user blur the text box save the name into the layer structure
			language_label.addEventListener('blur', (e)=> {
				save_sequence()
			})

		// keyup event
			language_label.addEventListener('keyup', (e)=> {
				// e.preventDefault()
				// e.stopPropagation()
				save_sequence()
			})

		// keydown event. If the user press return key = 13, we blur the text box
			language_label.addEventListener('keydown', (e) =>{
				if(e.keyCode === 13) {
					e.preventDefault()
					e.stopPropagation()
					language_label.blur()
				}
			})


	return language_label
}//end render_language_label



// @license-end
