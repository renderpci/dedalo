// imports
	import event_manager from '../../page/js/page.js'
	//import {data_manager} from '../../common/js/data_manager.js'
	//import * as instances from '../../common/js/instances.js'



/**
* ui
*/
export const ui = {

	component : {

		/**
		* BUILD_EDIT
		*/
		build_edit : (instance, content_data) => {
			if(SHOW_DEBUG===true) {
				//console.log("[ui.build_edit] instance:",instance)
			}

			const id 		= instance.id || 'id is not set'
			const tipo 		= instance.tipo
			const model 	= instance.model
			const mode 		= instance.mode
			const label 	= instance.context.label

			// wrapper
				const wrapper = ui.create_dom_element({
						element_type	: 'div',
						//id 			: id,
						class_name		: 'wrapper_component' + ' ' + 'wrap_component_' + tipo + ' ' + model + ' ' + tipo + ' ' + mode
					})
				// event click activate component
				wrapper.addEventListener('click', (e) => {
					e.stopPropagation()
					event_manager.publish('active_component', instance)
				}, false)

			// elements node
				const elements = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'elements',
					parent 			: wrapper
				})
				// buttons node
					const buttons = ui.create_dom_element({
						element_type	: 'div',
						class_name		: 'buttons',
						parent 			: elements
					})
				// filter node
					if (instance.filter) {
						const filter = ui.create_dom_element({
							element_type	: 'div',
							class_name		: 'filter',
							parent 			: elements
						})
					}
				// paginator node
					if (instance.paginator) {
						const paginator = ui.create_dom_element({
							element_type	: 'div',
							class_name		: 'paginator',
							parent 			: elements
						})
					}

			// label
				const component_label = ui.create_dom_element({
						element_type	: 'div',
						class_name		: 'label',
						inner_html 		: label,
						parent 			: wrapper
					})

			// content_data
				content_data.classList.add("content_data")
				wrapper.appendChild(content_data)
				//const content_data = ui.create_dom_element({
				//		element_type	: 'div',
				//		class_name		: 'content_data',
				//		parent 			: wrapper
				//	})
				//// move all nodes from container to content data
				//	while (container.childNodes.length > 0) {
				//		content_data.appendChild(container.childNodes[0])
				//	}

			return wrapper
		},//end build_edit



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
					//component.node.classList.add("active")
					component.node.map(function(item_node) {
						item_node.classList.add("active")
					})

				return true

			}else{

				// not match. Remove wrapper css active if exists
					//component.node.classList.remove("active")
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




	},//end section


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

		return element;
	},//end create_dom_element



}// interface


export const dom = {

}
