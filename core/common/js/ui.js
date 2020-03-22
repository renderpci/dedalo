/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../common/js/event_manager.js'
	import {get_instance, delete_instance} from '../../common/js/instances.js'



/**
* UI
*/
export const ui = {

	message_timeout : null,
	/**
	* SHOW_MESSAGE
	* @param element wrapper
	*	component wrapper where message is placed
	* @param text message
	*	Text message to show inside message container
	*/
	show_message : (wrapper, message, msg_type='error', message_node='component_message', clean=false) => {

		// message_wrap. always check if already exists
			const message_wrap = wrapper.querySelector("."+message_node) || (()=>{

				const new_message_wrap = ui.create_dom_element({
					element_type	: 'div',
					class_name 		: message_node, // + msg_type,
					parent 			: wrapper
				})

				const close_button = ui.create_dom_element({
					element_type	: 'div',
					class_name 		: 'close',
					text_content 	: ' x ',
					parent 			: new_message_wrap
				}).addEventListener("click", (e) => {
					e.stopPropagation()
					message_wrap.remove()
				})

				return new_message_wrap
			})()

		// set style
			message_wrap.classList.remove('error','warning','ok')
			message_wrap.classList.add(msg_type)

		// clean messages
			if (clean===true) {
				// clean
				const items = message_wrap.querySelectorAll(".text")
				for (var i = items.length - 1; i >= 0; i--) {
					items[i].remove()
				}
			}

		// add msg text
			const text = ui.create_dom_element({
				element_type	: 'div',
				class_name 		: 'text',
				text_content 	: message,
				parent 			: message_wrap
			})

		// adjust height
			message_wrap.style.top = "-" + message_wrap.offsetHeight + "px"

		// close button move to bottom when height is too much
			if (message_wrap.offsetHeight>120) {
				const close_button = message_wrap.querySelector('.close')
				close_button.style.top 		= 'unset';
				close_button.style.bottom 	= '0px';
			}

		// remove msg after time
			clearTimeout(ui.message_timeout);
			if (msg_type==='ok') {
				ui.message_timeout = setTimeout(()=>{
					message_wrap.remove()
				}, 7000)
			}


		return message_wrap
	},//end show_message



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
			const label 	= (mode==='edit_in_list') ? null : instance.label // instance.context.label
			const component_css = instance.context.css || {}

			const fragment = new DocumentFragment()

			// label
				if (label===null || items.label===null) {
					// no label add
				}else if(items.label) {
					// add custom label
					fragment.appendChild(items.label)
				}else{
					// default
					const component_label = ui.create_dom_element({
						element_type	: 'div',
						//class_name	: 'label'  + tipo + (label_structure_css ? ' ' + label_structure_css : ''),
						inner_html 		: label + ' [' + instance.lang.substring(3) + ']' + ' ' + tipo + ' ' + (model.substring(10)) + ' [' + instance.permissions + ']'
					})
					fragment.appendChild(component_label)
					// css
		 				const label_structure_css = typeof component_css.label!=="undefined" ? component_css.label : []
						const ar_css = ['label', ...label_structure_css]
						component_label.classList.add(...ar_css)
				}

			// buttons
				if (items.buttons) {
					const buttons = ui.create_dom_element({
						element_type	: 'div',
						class_name		: 'buttons',
						parent 			: fragment
					})
					const items_buttons_length = items.buttons.length;
					for (let i = 0; i < items_buttons_length; i++) {
						buttons.appendChild(items.buttons[i])
					}
				}

			// filter
				if (instance.filter) {
					const filter = ui.create_dom_element({
						element_type	: 'div',
						class_name		: 'filter',
						parent 			: fragment
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
						parent 			: fragment
					})
					instance.paginator.render().then(paginator_wrapper =>{
						paginator.appendChild(paginator_wrapper)
					})
				}

			// content_data
				if (items.content_data) {
					const content_data = items.content_data
					// css
						const content_data_structure_css = typeof component_css.content_data!=="undefined" ? component_css.content_data : []
						const ar_css = ["content_data", type, ...content_data_structure_css]
						content_data.classList.add(...ar_css)

					fragment.appendChild(content_data)
				}

			// tooltip
				if (mode==="search" && instance.context.search_options_title) {
					//fragment.classList.add("tooltip_toggle")
					const tooltip = ui.create_dom_element({
						element_type	: 'div',
						class_name		: 'tooltip hidden_tooltip',
						inner_html 		: instance.context.search_options_title || '',
						parent 			: fragment
					})
				}

			// wrapper
				const wrapper = ui.create_dom_element({
					element_type	: 'div'
 				})
 				// css
	 				const wrapper_structure_css = typeof component_css.wrapper!=="undefined" ? component_css.wrapper : []
					const ar_css = ['wrapper_'+type, model, tipo, mode,	...wrapper_structure_css]
					if (mode==="search") ar_css.push("tooltip_toggle")
					wrapper.classList.add(...ar_css)
				// event click activate component
				// focus event [focusin]
					wrapper.addEventListener("click", e => {
						e.stopPropagation()
						event_manager.publish('active_component', instance)
					})

				wrapper.appendChild(fragment)


			return wrapper
		},//end build_wrapper_edit



		/**
		* BUILD_WRAPPER_LIST
		*/
		build_wrapper_list : (instance, options={}) => {
			if(SHOW_DEBUG===true) {
				//console.log("[ui.build_wrapper_list] instance:",instance)
			}

			const id 			= instance.id || 'id is not set'
			const model 		= instance.model 	// like component_input-text
			const type 			= instance.type 	// like 'component'
			const tipo 			= instance.tipo 	// like 'rsc26'
			const mode 			= instance.mode 	// like 'edit'
			const autoload 		= typeof options.autoload==="undefined" ? false : options.autoload
			const edit_in_list 	= (instance.section_tipo === 'dd542') ? false : true // dd542-> activity section

			// wrapper
				const wrapper = ui.create_dom_element({
					element_type	: 'div',
					class_name 		: 'wrapper_' + type + ' ' + model + ' ' + tipo + ' ' + mode
 				})

 			// event dblclick change component mode
 			if(edit_in_list){

 				wrapper.addEventListener("dblclick", function(e){
					e.stopPropagation()

					// change mode (from 'list' to 'edit_in_list')
					instance.change_mode('edit_in_list', autoload)
				})
 			}

			return wrapper
		},//end build_wrapper_list



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
		},//end regenerate



		/**
		* ADD_IMAGE_FALLBACK
		* Unified fallback image adds event listener error and changes the image src when event error is triggered
		*/
		add_image_fallback : (img_node) => {

			function change_src(item) {

				// remove onerror listener to avoid infinite loop (!)
				item.target.removeEventListener("error", change_src, true);

				// set fallback src to the image
				item.target.src = page_globals.fallback_image

				return true
			}

			img_node.addEventListener("error", change_src, true)


			return true
		}//end add_image_fallback



	},//end component



	section : {


		/**
		* BUILD_WRAPPER_EDIT
		*/
		build_wrapper_edit : (instance, items={}) => {
			if(SHOW_DEBUG===true) {
				//console.log("[ui.build_wrapper_edit] instance:",instance)
			}

			const id 			= instance.id || 'id is not set'
			const model 		= instance.model 	// like component_input-text
			const type 			= instance.type 	// like 'component'
			const tipo 			= instance.tipo 	// like 'rsc26'
			const mode 			= instance.mode 	// like 'edit'
			const label 		= mode === 'edit_in_list' ? null : instance.label // instance.context.label
			const main_context 	= instance.context.find(element => element.tipo===instance.tipo)
			const element_css 	= main_context.css || {}

 			const fragment = new DocumentFragment()

			// label
				if (label===null || items.label===null) {
					// no label add
				}else if(items.label) {
					// add custom label
					fragment.appendChild(items.label)
				}else{
					// default
					const component_label = ui.create_dom_element({
						element_type	: 'div',
						class_name		: 'label',
						inner_html 		: label + ' [' + instance.lang.substring(3) + '] [' + instance.permissions +']',
						parent 			: fragment
					})
				}

			// inspector
				if (instance.inspector) {
					// // icon toggle inspector
					// const toggle = ui.create_dom_element({
					// 	element_type	: 'div',
					// 	class_name		: 'toggle_inspector',
					// 	parent 			: fragment
					// }).addEventListener("click", function(e) {
					// 	ui.toggle_inspector(e)
					// })
					const inspector = ui.create_dom_element({
						element_type	: 'div',
						class_name		: 'inspector',
						parent 			: fragment
					})
					// wrapper
					instance.inspector.render().then(inspector_wrapper =>{
						inspector.appendChild(inspector_wrapper)
					})
				}

			// buttons
				if (items.buttons) {
					const buttons = ui.create_dom_element({
						element_type	: 'div',
						class_name		: 'buttons',
						parent 			: fragment
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
						parent 			: fragment
					})
					instance.filter.render().then(filter_wrapper =>{
						filter.appendChild(filter_wrapper)
					})
				}

			// paginator
				if (instance.paginator) {
					// const paginator = ui.create_dom_element({
					// 	element_type	: 'div',
					// 	class_name		: 'paginator',
					// 	parent 			: fragment
					// })
					instance.paginator.render().then(paginator_wrapper =>{
						//paginator.appendChild(paginator_wrapper)

						// place paginator in inspector
						ui.place_element({
							source_node 		: paginator_wrapper,
							source_instance 	: instance,
							target_instance 	: instance.inspector,
							container_selector 	: ".paginator_container",
							target_selector 	: ".wrapper_paginator"
						})
					})
				}

			// content_data
				if (items.content_data) {
					const content_data = items.content_data
					// css
						const content_data_structure_css = typeof element_css.content_data!=="undefined" ? element_css.content_data : []
						const ar_css = ["content_data", type, ...content_data_structure_css]
						content_data.classList.add(...ar_css)
					// add to fragment
						fragment.appendChild(content_data)
				}


			// wrapper
				const wrapper = ui.create_dom_element({
					element_type	: 'div',
					class_name 		: 'wrapper_' + type + ' ' + model + ' ' + tipo + ' ' + mode
 				})
 				// css
	 				const wrapper_structure_css = typeof element_css.wrapper!=="undefined" ? element_css.wrapper : []
					const ar_css = ['wrapper_'+type, model, tipo, mode,	...wrapper_structure_css]
					wrapper.classList.add(...ar_css)
 				// append fragment
 					wrapper.appendChild(fragment)



			return wrapper
		}//end build_wrapper_edit



	},//end section



	area : {


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
			const label 	= instance.label 	// instance.context.label

			const fragment = new DocumentFragment()

			// label
				if (label===null || items.label===null) {
					// no label add
				}else if(items.label) {
					// add custom label
					fragment.appendChild(items.label)
				}else{
					// default
					const component_label = ui.create_dom_element({
						element_type	: 'div',
						class_name		: 'label',
						inner_html 		: label + ' [' + instance.lang.substring(3) + ']',
						parent 			: fragment
					})
				}

			// buttons
				if (items.buttons) {
					const buttons = ui.create_dom_element({
						element_type	: 'div',
						class_name		: 'buttons',
						parent 			: fragment
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
						parent 			: fragment
					})
					instance.filter.render().then(filter_wrapper =>{
						filter.appendChild(filter_wrapper)
					})
				}

			// content_data
				if (items.content_data) {

					const content_data = items.content_data
					content_data.classList.add("content_data", type)
					fragment.appendChild(content_data)
				}

			// wrapper
				const wrapper = ui.create_dom_element({
					element_type	: 'div',
					class_name 		: 'wrapper_' + type + ' area ' + model + ' ' + tipo + ' ' + mode
 				})
 				wrapper.appendChild(fragment)


			return wrapper
		}//end build_wrapper_edit



	},//end area



	tool : {



		build_wrapper_edit : async(instance, items={})=>{

			const id 		= instance.id || 'id is not set'
			const model 	= instance.model 	// like component_input_text
			const type 		= instance.type 	// like 'component'
			const tipo 		= instance.tipo 	// like 'rsc26'
			const mode 		= instance.mode 	// like 'edit'
			const label 	= instance.label

			const fragment = new DocumentFragment()

			// header
				const tool_header = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'tool_header',
					parent 			: fragment
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

			// description
				if (instance.description!==null) {
					// default
					const component_description = ui.create_dom_element({
						element_type	: 'div',
						class_name		: 'description',
						inner_html 		: instance.description,
						parent 			: tool_header
					})
				}

			// buttons
				if (items.buttons) {
					const buttons = ui.create_dom_element({
						element_type	: 'div',
						class_name		: 'buttons',
						parent 			: fragment
					})
					const items_buttons_length = items.buttons.length
					for (let i = 0; i < items_buttons_length; i++) {
						buttons.appendChild(items.buttons[i])
					}
				}

			// content_data
				if (items.content_data) {
					const content_data = items.content_data
					content_data.classList.add("content_data", type)
					fragment.appendChild(content_data)
				}

			// wrapper
				const wrapper = ui.create_dom_element({
					element_type	: 'div',
					class_name 		: 'wrapper_' + type + ' ' + model + ' ' + mode
 				})
 				wrapper.appendChild(fragment)


			return wrapper
		},//end build_wrapper_edit



		/**
		* BUILD_TOOL_BUTTON
		* Generate button element for open the target tool
		* @return dom element tool_button
		*/
		build_tool_button : (tool_object, self) => {

			// button
				// const tool_button = ui.create_dom_element({
				// 	element_type	: 'span',
				// 	class_name 		: 'button tool',
				// 	style 			: { "background-image": "url('" +tool_object.icon +"')" },
				// 	dataset			: { tool :tool_object.name },
				// 	title_label 	: tool_object.label
				// })
				const tool_button = ui.create_dom_element({
					element_type	: 'img',
					class_name 		: 'button tool',
					// style 		: { "background-image": "url('" +tool_object.icon +"')" },
					src 			: tool_object.icon,
					dataset			: { tool :tool_object.name },
					title_label 	: tool_object.label
				})

			// Events
				tool_button.addEventListener('click', publish_load_tool)

				function publish_load_tool(e) {
					e.stopPropagation();

					//common.prototype.load_tool(self, tool_object)
					// ui.tool.load_tool(self, tool_object)
					event_manager.publish('load_tool', {
						self 		: self,
						tool_object : tool_object
					})
				}

			return tool_button
		},//build_tool_button



		/**
		* ATTACH_TO_MODAL
		* Insert tool html into a modal box
		* @return dom element tool_button
		*/
		attach_to_modal : (wrapper, self, size="normal") => {

			// modal tool container
				const modal_container = document.querySelector('dd-modal')
					  modal_container.caller_instance = self // set current tool instance as modal caller_instance
					  modal_container.on_close = function(e) {
					  		event_manager.publish('modal_close', e)
					  }

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
				switch(size) {
					case "big" :
						modal_container._showModalBig();

						// hide contents to avoid double scrollbars
							const content_data_page = document.querySelector(".content_data.page")
								  content_data_page.classList.add("display_none")
							const menu_wrapper = document.querySelector(".content_data.page")
								  menu_wrapper.classList.add("display_none")
							const debug_div = document.getElementById("debug")
								  if(debug_div) debug_div.classList.add("display_none")

						event_manager.subscribe('modal_close', () => {
							content_data_page.classList.remove("display_none")
							menu_wrapper.classList.remove("display_none")
							if(debug_div) debug_div.classList.remove("display_none")
						})
						break;
					default :
						modal_container._showModal()
				}

				// modal_container.addEventListener("_hideModal", function(e){
						// console.log("+++++++++++e:",e);
				// })


			return true
		}//attach_to_modal



	},//end tool



	button : {



		/**
		* BUILD_BUTTON
		* Generate button element for open the target tool
		* @return dom element tool_button
		*/
		build_button : (options) => {

			const class_name = 'button' + (options.class_name ? (' ' + options.class_name) : '')
			const label 	 = options.label || "undefined"

			// button
				const button = ui.create_dom_element({
					element_type	: 'div',
					class_name 		: class_name,
					text_content  	: label
					//style 			: { "background-image": "url('" +tool_object.icon +"')" },
				})

			// Events
				//button.addEventListener('mouseup', (e) => {
				//	e.stopPropagation()
				//	alert("Click here! "+label)
				//})

			return button
		}//build_button



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

		if (type && element_type!=='textarea') {
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
	},//end create_dom_element



	/**
	* UPDATE_DOM_NODES
	*/
	update_dom_nodes : async function(ar_nodes, new_node) {

		const ar_nodes_length = ar_nodes.length
		// replace content data node in each element dom node
		for (let i = 0, l = ar_nodes_length; i < l; i++) {

			const current_dom_node = ar_nodes[i]

			// move node on first appearance and move a clone in next
			const current_new_node = (i===0) ? new_node : new_node.cloneNode(true)

			// replace the node with the new render
			current_dom_node.parentNode.replaceChild(current_new_node, current_dom_node)
		}

		return true
	},//end update_dom_nodes



	/**
	* INSIDE_TOOL
	* Check if instance is inside tool
	* @return bool | string tool name
	*/
	inside_tool : function(self) {

		if (self.caller && self.caller.type==='tool') {
			return self.caller.constructor.name
		}

		return false
	},//end inside_tool



	/**
	* ADD_TOOLS
	* Adds all the existent tools for the selected component
	* @return bool
	*/
	add_tools : function(self, buttons_container) {

		const tools = self.tools
		const tools_length = tools.length

		for (let i = 0; i < tools_length; i++) {
			if(tools[i].show_in_component){
				buttons_container.appendChild( ui.tool.build_tool_button(tools[i], self) )
			}
		}

	},//end add_tools



	/**
	* PLACE_ELEMENT
	* Place dom element inside target intance nodes
	* Used in section_record to send component_filter to inspector
	* @return bool | string tool name
	*/
	place_element : function(options) {

		const source_node 		= options.source_node // like node of component_filter
		const source_instance 	= options.source_instance // like section
		const target_instance 	= options.target_instance // like inspector instance
		const container_selector= options.container_selector // like .project_container
		const target_selector 	= options.target_selector // like .wrapper_component.component_filter
		const place_mode 		= options.place_mode || 'replace' // like 'add' | 'replace'

		if (!target_instance) {
			console.error("[ui.place_element] Error on get target instance:", options);
			return false
		}

		if (target_instance.status==="rendered") {

			if (typeof target_instance.node[0]==="undefined") {
				console.error("Error. Instance node not found:", target_instance);
			}

			// instance node already exists case
			const node_length = target_instance.node.length;
			for (let i = 0; i < node_length; i++) {

				const target_container 	= target_instance.node[i].querySelector(container_selector)
				const target_node 		= target_container.querySelector(target_selector)
				if (!target_node) {
					// first set inside container. Append
					target_container.appendChild(source_node)
				}else{
					// already exist target node like 'wrapper_x'. Replace or add
					if (place_mode==='add') {
						target_container.appendChild(source_node)
					}else{
						target_node.parentNode.replaceChild(source_node, target_node)
					}
				}
			}
		}else{

			// target_instance node not ready case
			source_instance.events_tokens.push(
				event_manager.subscribe('render_'+target_instance.id , async (instance_wrapper) => {
					const target_container = instance_wrapper.querySelector(container_selector)
					if (target_container) {
						target_container.appendChild(source_node)
					}
				})
			)//end events push
		}


		return true
	},//end place_element



	/**
	* TOGGLE_INSPECTOR
	*/
	toggle_inspector : (e) => {

		const inspector_wrapper = document.querySelector(".inspector")
		if (inspector_wrapper) {

			const wrapper_section = document.querySelector(".wrapper_section.edit")

			if (inspector_wrapper.classList.contains("hide")) {
				inspector_wrapper.classList.remove("hide")
				wrapper_section.classList.remove("full_width")
			}else{
				inspector_wrapper.classList.add("hide")
				wrapper_section.classList.add("full_width")
			}
		}

		return true
	},//end toggle_inspector



	/**
	* BUILD_SELECT_LANG
	*/
	build_select_lang : (options) => {

		// options
			const id  			= options.id || null
			const langs  		= options.langs
			const selected 		= options.selected || page_globals.dedalo_application_lang
			const action 		= options.action
			const class_name	= options.class_name || 'select_lang'

		const fragment = new DocumentFragment()

		// unify format from object to array
			const ar_langs = (!Array.isArray(langs))
				// object case (associative array)
				? (()=>{
					const ar_langs = []
					for (const lang in langs) {
						ar_langs.push({
							value : lang,
							label : langs[lang]
						})
					}
					return ar_langs
				})()
				// default array of objects case
				: langs

		// iterate array of langs and create option for each one
			const ar_langs_lenght = ar_langs.length
			for (let i = 0; i < ar_langs_lenght; i++) {

				const option = ui.create_dom_element({
					element_type	: 'option',
					value 			: ar_langs[i].value,
					text_content 	: ar_langs[i].label,
					parent 			: fragment
				})
				// selected options set on match
				if (ar_langs[i].value===selected) {
					option.selected = true
				}
			}

		// des
			// for (const lang in langs) {
			// 	const option = ui.create_dom_element({
			// 		element_type	: 'option',
			// 		value 			: lang,
			// 		text_content 	: langs[lang],
			// 		parent 			: fragment
			// 	})
			// 	// selected options set on match
			// 	if (lang===reference_lang) {
			// 		option.selected = true
			// 	}
			// }

		const select_lang = ui.create_dom_element({
			id 				: id,
			element_type	: 'select',
			class_name 		: class_name
		})
		select_lang.addEventListener("change", action)
		select_lang.appendChild(fragment)


		return select_lang
	},//end build_select_lang



	/**
	* GET_CONTENTEDITABLE_BUTTONS
	*/
	get_contenteditable_buttons : () => {

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
				ui.do_command('bold', null)
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
				ui.do_command('italic', null)
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
				ui.do_command('underline', null)
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
				//const editor = document.activeElement.innerHTML
				//.textContent
				//.inner
				console.log("editor:",contenteditable_buttons.target);
					//console.log("editor:",editor);

				ui.do_search('palabras',contenteditable_buttons.target)

				ui.do_command('insertText', 'nuevoooooXXX')
			})

		// contenteditable_buttons
			const contenteditable_buttons = ui.create_dom_element({
				element_type	: 'div',
				class_name 		: 'contenteditable_buttons'
			})
			contenteditable_buttons.addEventListener("mousedown", (e)=>{
				e.preventDefault()
			})
			contenteditable_buttons.appendChild(fragment)


		return contenteditable_buttons
	},//end get_contenteditable_buttons



	/**
	* DO_COMMAND
	* Exec document 'execCommand' https://developer.mozilla.org/en-US/docs/Web/API/Document/execCommand
	* Obsolete (!)
	*/
	do_command : (command, val) => {
		document.execCommand(command, false, (val || ""));
	},



	/**
	* DO_SEARCH
	* Unfinished function (!)
	*/
	do_search : (search_text, contenteditable) =>{
		//get the regext

		const regext_text = search_text.replace(/([.*+?^=!:${}()|[\]\/\\])/g, '\\$1');
		const regext = RegExp(regext_text, 'g')


		//const regext_text = search_text.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, '\\$&').replace(/\s/g, '[^\\S\\r\\n]');

		//const regext_text = search_text.replace(/([.*+?^=!:${}()|[\]\/\\])/g, '\\$1');

		//const regext = new RegExp(regext_text)

		const text = getText(contenteditable)

		let match = regext.exec(text)

		console.log(match[0])

			const endIndex = match.index + match[0].length;
			const startIndex = match.index;
				console.log("endIndex:",endIndex);
				console.log("startIndex:",startIndex);

			const range = document.createRange();
			range.setStart(contenteditable, 0);
			range.setEnd(contenteditable, 3);
			const sel = window.getSelection();

		// const regext = (text, full_word) => {
		// 	const regext_text = text.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, '\\$&').replace(/\s/g, '[^\\S\\r\\n]');
		// 	return wholeWord ? '\\b' + escapedText + '\\b' : escapedText;
		// };

			function getText(node) {

				// if node === text_node (3), text inside an Element or Attr. don't has other nodes and return the full data
				if (node.nodeType === Node.TEXT_NODE) {
					return [node.data];
				}

				var txt = [''];
				var i = 0;

				if (node = node.firstChild) do {

					if (node.nodeType === Node.TEXT_NODE) {
						txt[i] += node.data;
						continue;
					}

					var innerText = getText(node);


					if (typeof innerText[0] === 'string') {
						// Bridge nested text-node data so that they're
						// not considered their own contexts:
						// I.e. ['some', ['thing']] -> ['something']
						txt[i] += innerText.shift();
					}
					if (innerText.length) {
						txt[++i] = innerText;
						txt[++i] = '';
					}

				} while (node = node.nextSibling);

				return txt;
			}
	}//end do_search



	// /**
	// * EXEC_SCRIPTS_INSIDE
	// * @return js promise
	// */
	// exec_scripts_inside( element ) {
	// 	console.log("context:",context);

	// 	const scripts 		 = Array.prototype.slice.call(element.getElementsByTagName("script"))
	// 	const scripts_length = scripts.length
	// 	if (scripts_length<1) return false

	// 	const js_promise = new Promise((resolve, reject) => {

	// 		const start = new Date().getTime()

	// 		for (let i = 0; i < scripts_length; i++) {

	// 			if(SHOW_DEBUG===true) {
	// 				var partial_in = new Date().getTime()
	// 			}

	// 			if (scripts[i].src!=="") {
	// 				const tag 	  = document.createElement("script")
	// 					  tag.src = scripts[i].src
	// 				document.getElementsByTagName("head")[0].appendChild(tag)

	// 			}else{
	// 				//eval(scripts[i].innerHTML);
	// 				console.log(scripts[i].innerHTML); //continue;

	// 				// Encapsulate code in a function and execute as well
	// 				const my_func = new Function(scripts[i].innerHTML)
	// 					//console.log("my_func:",my_func); continue;
	// 					my_func() // Exec
	// 			}

	// 			if(SHOW_DEBUG===true) {
	// 				const end  	= new Date().getTime()
	// 				const time 	= end - start
	// 				const partial = end - partial_in
	// 				//console.log("->insertAndExecute: [done] "+" - script time: " +time+' ms' + ' (partial:'+ partial +')')
	// 			}
	// 		}

	// 	});//end js_promise


	// 	return js_promise;
	// }//end exec_scripts_inside



}//end  ui



/**
* EXECUTE_FUNCTION_BY_NAME
*
*//*
export const execute_function_by_name = function(functionName, context /*, args *\/) {

	const args 		 = Array.prototype.slice.call(arguments, 2);
	const namespaces = functionName.split(".");
	const func = namespaces.pop();
	for(let i = 0; i < namespaces.length; i++) {
		context = context[namespaces[i]];
	}

	return context[func].apply(context, args);
}//end execute_function_by_name
*/
