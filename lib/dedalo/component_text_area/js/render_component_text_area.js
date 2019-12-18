/*global get_label, page_globals, SHOW_DEBUG, DEDALO_LIB_BASE_URL*/
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
	const t0 = performance.now()

	const self = this

	// Options vars
		const context 			= self.context
		const data 				= self.data

	// Value as string
		const value_string = data.value //"component_text_area not finish yet!" //data.value.join(' | ')

	// Node create
		const node = ui.create_dom_element({
			element_type	: "div",
			class_name		: self.model + '_list ' + self.tipo,
			inner_html 		: value_string
		})

	// debug
		if(SHOW_DEBUG===true) {
			const total = performance.now()-t0
			if (total>50) {
				console.warn("+ Time to generate text_area list ms:", total);
			}
		}

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
			//console.log("-------------- + event add_element changed_data:", changed_data);
			const inputs_container = wrapper.querySelector('.inputs_container')
			// add new dom input element
			input_element(changed_data.key, changed_data.value, inputs_container, self)
		}

	// focus
		wrapper.addEventListener('focus', async (e) => {
			e.stopPropagation()

			// store current inner html to compare when blur
			if (e.target.matches('.input_tex_area')) {

				e.target.data_orig = e.target.innerHTML;
				return true
			}

		}, true)

	// blur
		wrapper.addEventListener('blur', async (e) => {
			e.stopPropagation()

			// store current inner html to compare when blur
			if (e.target.matches('.input_tex_area')) {

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

	// click event [mousedown]
		wrapper.addEventListener("mousedown", e => {
			e.stopPropagation()

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

					//change mode
					self.change_mode('list', false)

					return true
				}

		})

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

	// inputs container
		const inputs_container = ui.create_dom_element({
			element_type	: 'ul',
			class_name 		: 'inputs_container',
			parent 			: fragment
		})

	// values (inputs)
		const inputs_value = value//(value.length<1) ? [''] : value
		const value_length = inputs_value.length
		for (let i = 0; i < value_length; i++) {
			input_element(i, inputs_value[i], inputs_container, self)
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
* INPUT_ELEMENT
* @return dom element li
*/
const input_element = (i, current_value, inputs_container, self) => {

	const mode = self.mode

	//document.designMode = "on"

	// li
		const li = ui.create_dom_element({
			element_type : 'li',
			parent 		 : inputs_container
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

	// buttons_editor
		const buttons_editor = ui.create_dom_element({
			element_type	: 'div',
			class_name 		: 'buttons_editor',
			parent 			: li
		})
		buttons_editor.addEventListener("mousedown", (e)=>{e.preventDefault()})

		// bold
			const button_bold = ui.create_dom_element({
				element_type	: 'div',
				class_name 		: 'button bold',
				text_content 	: "Bold",
				parent 			: buttons_editor
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
				parent 			: buttons_editor
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
				parent 			: buttons_editor
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
				parent 			: buttons_editor
			})
			button_replace.addEventListener("click", (e)=>{
				e.stopPropagation()
				//replace_selected_text('nuevooooo')
				do_command('insertText', 'nuevooooo')
			})


	// input contenteditable
		const input = ui.create_dom_element({
			element_type 	: 'div',
			class_name 		: 'input_tex_area contenteditable',
			dataset 	 	: { key : i },
			inner_html 		: current_value,
			contenteditable : true,
			parent 		 	: li
		})
		//input.setAttribute('contenteditable', true)


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
}//end input_element



const do_command = (command, val) => {
	document.execCommand(command, false, (val || ""));
}


// function replace_selected_text(replacementText) {
//    document.execCommand( 'insertText', false, replacementText );
// }


