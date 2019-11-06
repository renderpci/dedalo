// imports
	import event_manager from '../../page/js/page.js'
	import {common} from '../../common/js/common.js'
	//import {data_manager} from '../../common/js/data_manager.js'
	//import * as instances from '../../common/js/instances.js'



/**
* UI
*/
export const ui = {

	component : {



		/**
		* BUILD_WRAPPER_EDIT
		*/
		build_wrapper_edit : (instance, items={}) => {
			if(SHOW_DEBUG===true) {
				//console.log("[ui.build_wrapper_edit] instance:",instance)
			}

			const id 		= instance.id || 'id is not set'
			const model 	= instance.model 	// like component_input-text
			const type 		= instance.type 	// like 'component'
			const tipo 		= instance.tipo 	// like 'rsc26'
			const mode 		= instance.mode 	// like 'edit'
			const label 	= mode === 'edit_in_list' ? null : instance.label // instance.context.label


			// wrapper
				const wrapper = ui.create_dom_element({
					element_type	: 'div',
					//id 			: id,
					//class_name		: 'wrapper_component' + ' ' + 'wrap_component_' + tipo + ' ' + model + ' ' + tipo + ' ' + mode
					class_name 		: 'wrapper_' + type + ' ' + model + ' ' + tipo + ' ' + mode
 				})
				// event click activate component
				wrapper.addEventListener('click', (e) => {
					e.stopPropagation()
					event_manager.publish('active_component', instance)
				})

			// label
				if (label===null || items.label===null) {
					// no label add
				}else if(items.label) {
					// add custom label
					wrapper.appendChild(items.label)
				}else{
					// default
					const component_label = ui.create_dom_element({
						element_type	: 'div',
						class_name		: 'label',
						inner_html 		: label + ' [' + instance.lang.substring(3) + ']',
						parent 			: wrapper
					})
				}

			// buttons
				if (items.buttons) {
					const buttons = ui.create_dom_element({
						element_type	: 'div',
						class_name		: 'buttons',
						parent 			: wrapper
					})
					const items_buttons_length = items.buttons.length
					for (let i = 0; i < items_buttons_length; i++) {
						buttons.appendChild(items.buttons[i])
					}
				}

			// filter
				if (instance.filter) {
					const filter = ui.create_dom_element({
						element_type	: 'div',
						class_name		: 'filter',
						parent 			: wrapper
					})
					instance.filter.render().then(filter_wrapper =>{
						filter.appendChild(filter_wrapper)
					})
				}

			// paginator
				if (instance.paginator) {
					const paginator = ui.create_dom_element({
						element_type	: 'div',
						class_name		: 'paginator',
						parent 			: wrapper
					})
					instance.paginator.render().then(paginator_wrapper =>{
						paginator.appendChild(paginator_wrapper)
					})
				}

			// content_data
				if (items.content_data) {

					const content_data = items.content_data
					content_data.classList.add("content_data",type)
					wrapper.appendChild(content_data)
				}

			// tooltip
				if (mode==="search" && instance.context.search_options_title) {
					wrapper.classList.add("tooltip_toggle")
					const tooltip = ui.create_dom_element({
						element_type	: 'div',
						class_name		: 'tooltip hidden_tooltip',
						inner_html 		: instance.context.search_options_title || '',
						parent 			: wrapper
					})
				}


			return wrapper
		},//end build_wrapper_edit



		/**
		* ACTIVE
		* Set component state as active by callback event
		* @see util.events event_manage.publish
		*
		* @param object component
		*	Full component instance
		* @param string id
		*	ID of clicked component
		* @return async promise
		*	Note that this function return always a promise to allow the caller
		*	continue aplying another custom actions
		*/
		active : async (component, actived_component) => {

			if (typeof actived_component==="undefined") {
				console.warn("[ui.component.active]: WARNING. Received undefined actived_component!");
				return false
			}

			if (component.id===actived_component.id) {

				// match . Add wrapper css active
					component.node.map(function(item_node) {
						item_node.classList.add("active")
					})

				return true

			}else{

				// not match. Remove wrapper css active if exists
					component.node.map(function(item_node) {
						item_node.classList.remove("active")
					})
					if(component.autocomplete_active === true){
						component.autocomplete.destroy()
						component.autocomplete_active = false
						component.autocomplete = null
					}

				return false
			}
		},//end active



		/**
		* ERROR
		* Set component state as valid or error
		*
		* @param boolean error
		*	Boolean value obtained from previous component validation functions
		* @param object component
		*	Component that has to be set as valid or with data errors
		* @return boolean
		*/
		error : async (error, component) => {

			if (error) {
				component.classList.add("error")

			}else{
				component.classList.remove("error")
			}

			return true
		},//end error



		/**
		* REGENERATE
		*/
		regenerate : async (current_node, new_node) => {

			//// clean
			//	while (current_node.firstChild) {
			//		current_node.removeChild(current_node.firstChild)
			//	}
			//// set children nodes
			//	while (new_node.firstChild) {
			//		current_node.appendChild(new_node.firstChild)
			//	}

			current_node.parentNode.replaceChild(new_node, current_node);

			return current_node
		}//end regenerate



	},//end component



	section : {


		/**
		* BUILD_WRAPPER_EDIT
		*/
		build_wrapper_edit : (instance, items={}) => {
			if(SHOW_DEBUG===true) {
				//console.log("[ui.build_wrapper_edit] instance:",instance)
			}

			const id 		= instance.id || 'id is not set'
			const model 	= instance.model 	// like component_input-text
			const type 		= instance.type 	// like 'component'
			const tipo 		= instance.tipo 	// like 'rsc26'
			const mode 		= instance.mode 	// like 'edit'
			const label 	= mode === 'edit_in_list' ? null : instance.label // instance.context.label


			// wrapper
				const wrapper = ui.create_dom_element({
					element_type	: 'div',
					class_name 		: 'wrapper_' + type + ' ' + model + ' ' + tipo + ' ' + mode
 				})

			// label
				if (label===null || items.label===null) {
					// no label add
				}else if(items.label) {
					// add custom label
					wrapper.appendChild(items.label)
				}else{
					// default
					const component_label = ui.create_dom_element({
						element_type	: 'div',
						class_name		: 'label',
						inner_html 		: label + ' [' + instance.lang.substring(3) + ']',
						parent 			: wrapper
					})
				}

			// buttons
				if (items.buttons) {
					const buttons = ui.create_dom_element({
						element_type	: 'div',
						class_name		: 'buttons',
						parent 			: wrapper
					})
					const items_buttons_length = items.buttons.length
					for (let i = 0; i < items_buttons_length; i++) {
						buttons.appendChild(items.buttons[i])
					}
				}

			// filter
				if (instance.filter) {
					const filter = ui.create_dom_element({
						element_type	: 'div',
						class_name		: 'filter',
						parent 			: wrapper
					})
					instance.filter.render().then(filter_wrapper =>{
						filter.appendChild(filter_wrapper)
					})
				}

			// paginator
				if (instance.paginator) {
					const paginator = ui.create_dom_element({
						element_type	: 'div',
						class_name		: 'paginator',
						parent 			: wrapper
					})
					instance.paginator.render().then(paginator_wrapper =>{
						paginator.appendChild(paginator_wrapper)
					})
				}

			// content_data
				if (items.content_data) {

					const content_data = items.content_data
					content_data.classList.add("content_data",type)
					wrapper.appendChild(content_data)
				}


			return wrapper
		},//end build_wrapper_edit



	},//end section



	tool : {



		build_wrapper_edit : async(instance, items={})=>{

			const id 		= instance.id || 'id is not set'
			const model 	= instance.model 	// like component_input_text
			const type 		= instance.type 	// like 'component'
			const tipo 		= instance.tipo 	// like 'rsc26'
			const mode 		= instance.mode 	// like 'edit'
			const label 	= instance.label

			// wrapper
				const wrapper = ui.create_dom_element({
					element_type	: 'div',
					class_name 		: 'wrapper_' + type + ' ' + model + ' ' + mode
 				})

			// header
				const tool_header = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'tool_header',
					parent 			: wrapper
				})

			// label
				if (instance.label!==null) {
					// default
					const component_label = ui.create_dom_element({
						element_type	: 'div',
						class_name		: 'label',
						inner_html 		: label,
						parent 			: tool_header
					})
				}

			// buttons
				if (items.buttons) {
					const buttons = ui.create_dom_element({
						element_type	: 'div',
						class_name		: 'buttons',
						parent 			: wrapper
					})
					const items_buttons_length = items.buttons.length
					for (let i = 0; i < items_buttons_length; i++) {
						buttons.appendChild(items.buttons[i])
					}
				}

			// content_data
				if (items.content_data) {

					const content_data = items.content_data
					content_data.classList.add("content_data",type)
					wrapper.appendChild(content_data)
				}


			return wrapper
		},//end build_wrapper_edit



		/**
		* BUILD_TOOL_BUTTON
		* Generate button element for open the target tool
		* @return dom element tool_button
		*/
		build_tool_button : (tool_object, self) => {

			// button
				const tool_button = ui.create_dom_element({
					element_type	: 'span',
					class_name 		: 'button tool',
					style 			: { "background-image": "url('" +tool_object.icon +"')" },
					dataset			: { tool :tool_object.name }
				})

			// Events
				tool_button.addEventListener('mouseup', (e) => {
					e.stopPropagation()
					common.prototype.load_tool(self, tool_object)
				})

			return tool_button
		},//build_tool_button



		/**
		* ATTACH_TO_MODAL
		* Insert tool html into a modal box
		* @return dom element tool_button
		*/
		attach_to_modal : (wrapper, self) => {

			// modal tool container
				const modal_container = document.querySelector('dd-modal')
					  modal_container.caller_instance = self // set current tool instance as modal caller_instance

			// header . move tool header to modal header and insert in slot
				const tool_header = wrapper.querySelector('.tool_header')
					  tool_header.slot = "header"

				//const actual_header = modal_container.querySelector('.tool_header')
				//if (actual_header) {
				//	actual_header.replaceWith(tool_header)
				//}else{
					modal_container.appendChild(tool_header)
				//}

			// body. add tool wrapper to modal body and insert in slot
				wrapper.slot = 'body'
				modal_container.appendChild(wrapper) 	// append tool html to modal

			// show modal
				modal_container._showModal()

			return true
		}//attach_to_modal



	},//end tool



	/**
	* CREATE_DOM_ELEMENT
	* Builds a DOM node baased on received options
	*/
	create_dom_element : function(element_options){

		const element_type			= element_options.element_type
		const parent				= element_options.parent
		const class_name			= element_options.class_name
		const style					= element_options.style
		let data_set				= element_options.data_set
			if (typeof data_set==="undefined" && typeof element_options.dataset!=="undefined") data_set = element_options.dataset

		const custom_function_events= element_options.custom_function_events
		const title_label			= element_options.title_label
		const text_node				= element_options.text_node
		const text_content			= element_options.text_content
		const inner_html			= element_options.inner_html
		const id 					= element_options.id
		const draggable				= element_options.draggable
		const value					= element_options.value
		const src					= element_options.src
		const type					= element_options.type
		const contenteditable		= element_options.contenteditable
		const name					= element_options.name
		const placeholder			= element_options.placeholder
		const pattern				= element_options.pattern

		const element = document.createElement(element_type);

		// Add id property to element
		if(id){
			element.id = id;
		}

		// A element. Add href property to element
		if(element_type==='a'){
			element.href = 'javascript:;';
		}

		// Class name. Add css classes property to element
		if(class_name){
			element.className = class_name
		}

		// Style. Add css style property to element
		if(style){
			for(let key in style) {
				element.style[key] = style[key]
				//element.setAttribute("style", key +":"+ style[key]+";");
			}
		}

		// Title . Add title attribute to element
		if(title_label){
			element.title = title_label
		}

		// Dataset Add dataset values to element
		if(data_set){
			for (let key in data_set) {
				element.dataset[key] = data_set[key]
			}
		}

		// Value
		if(value){
			element.value = value
		}

		// Text content
		if(text_node){
			//element.appendChild(document.createTextNode(TextNode));
			// Parse html text as object
			if (element_type==='span') {
				element.textContent = text_node
			}else{
				let el = document.createElement('span')
					el.innerHTML = " "+text_node // Note that prepend a space to span for avoid Chrome bug on selection
				element.appendChild(el)
			}
		}else if(text_content) {
			element.textContent = text_content
		}else if(inner_html) {
			element.innerHTML = inner_html
		}


		// Append created element to parent
		if (parent) {
			parent.appendChild(element)
		}

		// Dragable
		if(draggable){
			element.draggable = draggable;
		}

		// Add id property to element
		if(src){
			element.src = src;
		}

		if (type) {
			element.type = type;
		}

		if (contenteditable) {
			element.contentEditable = contenteditable;
		}

		if(name){
			element.name = name
		}

		if(placeholder){
			element.placeholder = placeholder
		}

		if(pattern){
			element.pattern = pattern
		}
		return element;
	}//end create_dom_element



}// interface



export const dom = {

}


