/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'



/**
* Render_component
* Manage the components logic and appearance in client side
*/
export const render_component_text_area = function() {

	return true
}//end render_component_text_area



/**
* LIST
* Render node for use in list
* @return DOM node
*/
render_component_text_area.prototype.list = async function() {

	const self = this

	// Value as string
		const value_string = self.data.value //"component_text_area not finish yet!" //data.value.join(' | ')

	// Node create
		const node = ui.create_dom_element({
			element_type	: "div",
			class_name		: self.model + '_list ' + self.tipo,
			inner_html 		: value_string
		})


	return node
}//end list



/**
* EDIT
* Render node for use in modes: edit, edit_in_list
* @return DOM node wrapper
*/
render_component_text_area.prototype.edit = async function(options={render_level:'full'}) {

	const self = this

	// fix non value scenarios
		self.data.value = (self.data.value.length<1) ? [null] : self.data.value

	const render_level 	= options.render_level

	// content_data
		const current_content_data = await content_data_edit(self)
		if (render_level==='content') {
			return current_content_data
		}

	// wrapper. ui build_edit returns component wrapper
		const wrapper = ui.component.build_wrapper_edit(self, {
			content_data : current_content_data
		})

	// add events
		add_events(self, wrapper)

	// defaultParagraphSeparator for contenteditable
		document.execCommand("defaultParagraphSeparator", false, "p");


	return wrapper
}//end edit



/**
* ADD_EVENTS
*/
const add_events = function(self, wrapper) {

	// add element, subscription to the events
		self.events_tokens.push(
			event_manager.subscribe('add_element_'+self.id, add_element)
		)
		function add_element(changed_data) {
			const inputs_container = wrapper.querySelector('.inputs_container')
			// add new dom input element
			const input_element = get_input_element(changed_data.key, changed_data.value, self)
			inputs_container.appendChild(input_element)
		}

	// focus
		wrapper.addEventListener('focus', async (e) => {
			// e.stopPropagation()

			// store current inner html to compare when blur
			if (e.target.matches('.input_tex_area')) {

				// store current contenteditable content
					e.target.data_orig = e.target.innerHTML;

				// contenteditable_buttons. use existing contenteditable_buttons or create a fresh one if not
					const contenteditable_buttons = document.querySelector(".contenteditable_buttons") || ui.get_contenteditable_buttons()
						  contenteditable_buttons.target = e.target // set current contenteditable as target
					e.target.parentNode.appendChild(contenteditable_buttons)

				return true
			}

		}, true)

	// blur
		wrapper.addEventListener('blur', async (e) => {
			// e.stopPropagation()

			// store current inner html to compare when blur
			if (e.target.matches('.input_tex_area')) {

				// remove existing contenteditable_buttons
					const contenteditable_buttons = document.querySelector(".contenteditable_buttons")
					if (contenteditable_buttons) contenteditable_buttons.remove()

				// save changes if content is different
					const changed = e.target.innerHTML!==e.target.data_orig
					if (changed===true) {

						const value = e.target.innerHTML

						const changed_data = Object.freeze({
							action	: 'update',
							key		: JSON.parse(e.target.dataset.key),
							value	: value
						})
						self.change_value({
							changed_data : changed_data,
							refresh 	 : false
						})
						.then((save_response)=>{
							// event to update the dom elements of the instance
							event_manager.publish('update_value_'+self.id, changed_data)
						})
					}
				return true
			}

		}, true)

	// click [click]
		wrapper.addEventListener("click", e => {
			// e.stopPropagation()


				const all_buttons_remove =wrapper.querySelectorAll('.remove')
					for (let i = all_buttons_remove.length - 1; i >= 0; i--) {
						all_buttons_remove[i].classList.add("display_none")
					}


				if (e.target.matches('.contenteditable')) {
					// set the button_remove associated to the input selected to visible
						const button_remove = e.target.parentNode.querySelector('.remove')
						button_remove.classList.remove("display_none")
				}

			// insert
				if (e.target.matches('.button.add')) {

					const changed_data = Object.freeze({
						action	: 'insert',
						key		: self.data.value.length,//self.data.value.length>0 ? self.data.value.length : 1,
						value	: null
					})
					self.change_value({
						changed_data : changed_data,
						refresh 	 : false
					})
					.then((save_response)=>{
						// event to update the dom elements of the instance
						event_manager.publish('add_element_'+self.id, changed_data)
					})

					return true
				}

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

			// change_mode
				if (e.target.matches('.button.close')) {

					// change mode
					self.change_mode('list', false)

					return true
				}

			//const current_buttons_editor = document.querySelector(".buttons_editor")
			//if (current_buttons_editor) current_buttons_editor.remove()

		}, false)


	return true
}//end add_events



/**
* CONTENT_DATA_EDIT
* @return DOM node content_data
*/
const content_data_edit = async function(self) {

	const value = self.data.value
	const mode 	= self.mode

	const fragment = new DocumentFragment()


	// init the editor with the wrapper
		// const editor = ui.create_dom_element({
		// 	element_type	: 'div',
		// 	class_name 		: 'editor',
		// 	parent 			: fragment
		// })
		// const load_editor = (wrapper) => {
		// 	self.init_editor(editor)
		// }
		// self.events_tokens.push(
		// 	event_manager.subscribe('render_'+self.id, load_editor)
		// )


	// inputs container
		const inputs_container = ui.create_dom_element({
			element_type	: 'ul',
			class_name 		: 'inputs_container',
			parent 			: fragment
		})

	// values (inputs)
		const inputs_value = value // is array
		const value_length = inputs_value.length
		for (let i = 0; i < value_length; i++) {
			const input_element = get_input_element(i, inputs_value[i], self)
			inputs_container.appendChild(input_element)
		}

	// buttons container
		const buttons_container = ui.create_dom_element({
			element_type	: 'div',
			class_name 		: 'buttons_container',
			parent 			: fragment
		})

	// button close
		if(mode==='edit_in_list' && !ui.inside_tool(self)){
			const button_close = ui.create_dom_element({
				element_type	: 'span',
				class_name 		: 'button close',
				parent 			: buttons_container
			})
		}

	// button add input
		if((mode==='edit' || mode==='edit_in_list') && !ui.inside_tool(self)){
			const button_add_input = ui.create_dom_element({
				element_type	: 'span',
				class_name 		: 'button add',
				parent 			: buttons_container
			})
		}

	// tools
		if (!ui.inside_tool(self)) {
			const tools = self.tools
			const tools_length = tools.length

			for (let i = 0; i < tools_length; i++) {
				if(tools[i].show_in_component){
					buttons_container.appendChild( ui.tool.build_tool_button(tools[i], self) );
				}
			}
		}

	// content_data
		const content_data = document.createElement("div")
			  content_data.classList.add("content_data", self.type, "nowrap")
		content_data.appendChild(fragment)


	return content_data
}//end content_data_edit





/**
* GET_INPUT_ELEMENT
* @return dom element li
*/
const get_input_element = (i, current_value, self) => {

	const mode = self.mode

	// li
		const li = ui.create_dom_element({
			element_type : 'li'
		})

	// q operator (search only)
		if(mode==='search'){
			const q_operator = self.data.q_operator
			const input_q_operator = ui.create_dom_element({
				element_type 	: 'input',
				type 		 	: 'text',
				value 		 	: q_operator,
				class_name 		: 'q_operator',
				parent 		 	: li
			})
		}

	// input contenteditable
		const input = ui.create_dom_element({
			element_type 	: 'div',
			class_name 		: 'input_tex_area contenteditable',
			dataset 	 	: { key : i },
			inner_html 		: current_value,
			contenteditable : true,
			parent 		 	: li
		})

	// button remove
		if((mode==='edit' || 'edit_in_list') && !ui.inside_tool(self)){
			const button_remove = ui.create_dom_element({
				element_type	: 'div',
				class_name 		: 'button remove display_none',
				dataset			: { key : i },
				parent 			: li
			})
		}

	return li
}//end get_input_element



/**
* GET_CONTENTEDITABLE_BUTTONS
*//*
const get_contenteditable_buttons = () => {

	const fragment = new DocumentFragment()

	// bold
		const button_bold = ui.create_dom_element({
			element_type	: 'div',
			class_name 		: 'button bold',
			text_content 	: "Bold",
			parent 			: fragment
		})
		button_bold.addEventListener("click", (e)=>{
			e.stopPropagation()
			do_command('bold', null)
		})
	// italic
		const button_italic = ui.create_dom_element({
			element_type	: 'div',
			class_name 		: 'button italic',
			text_content 	: "Italic",
			parent 			: fragment
		})
		button_italic.addEventListener("click", (e)=>{
			e.stopPropagation()
			do_command('italic', null)
		})
	// underline
		const button_underline = ui.create_dom_element({
			element_type	: 'div',
			class_name 		: 'button underline',
			text_content 	: "Underline",
			parent 			: fragment
		})
		button_underline.addEventListener("click", (e)=>{
			e.stopPropagation()
			do_command('underline', null)
		})
	// find and replace
		const button_replace = ui.create_dom_element({
			element_type	: 'div',
			class_name 		: 'button replace',
			text_content 	: "Replace",
			parent 			: fragment
		})
		button_replace.addEventListener("click", (e)=>{
			e.stopPropagation()
			//replace_selected_text('nuevooooo')
			do_command('insertText', 'nuevoooooXXX')
		})

	// contenteditable_buttons
		const contenteditable_buttons = ui.create_dom_element({
			element_type	: 'div',
			class_name 		: 'contenteditable_buttons'
		})
		contenteditable_buttons.addEventListener("click", (e)=>{
			e.preventDefault()
		})
		contenteditable_buttons.appendChild(fragment)


	return contenteditable_buttons
}//end get_contenteditable_buttons
*/



/**
* DO_COMMAND
*//*
const do_command = (command, val) => {
	document.execCommand(command, false, (val || ""));
}*/


// function replace_selected_text(replacementText) {
//    document.execCommand( 'insertText', false, replacementText );
// }


