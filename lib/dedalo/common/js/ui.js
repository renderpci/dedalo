// imports
	import event_manager from '../../page/js/page.js'
	import {data_manager} from '../../common/js/data_manager.js'
	import * as instances from '../../common/js/instances.js'



/**
* ui
*/
export const ui = {

	component : {

	
		/**
		* BUILD_WRAPPER DEPRECATED
		*/
		//build_wrapper : (options) => {
		//	if(SHOW_DEBUG===true) {
		//		//console.log("[ui.build_wrapper] options:",options)
		//	}
		//		
		//	const id 		= options.id
		//	const tipo 		= options.tipo
		//	const model 	= options.model
		//	const mode 		= options.mode
		//	const component = options.component	
		//
		//	// wrapper
		//		const wrapper = common.create_dom_element({
		//				element_type	: 'div',
		//				id 				: id,
		//				class_name		: 'wrapper_component ' + model + ' ' + tipo + ' ' + mode
		//			})
		//	// event click activate component
		//	if (component) wrapper.addEventListener('click', () => ui.component.active(component), false)
		//
		//	return wrapper
		//},//end build_wrapper


		/**
		* BUILD_LABEL DEPRECATED
		*/
		//build_label : (options) => {
		//	if(SHOW_DEBUG===true) {
		//		//console.log("[ui.build_label] options:",options)
		//	}				
		//
		//	const mode 			= options.mode
		//	const label 		= options.label
		//	const parent 		= options.parent
		//
		//	// label 
		//		const component_label = common.create_dom_element({
		//				element_type	: 'div',
		//				class_name		: 'label',
		//				inner_html 		: label,
		//				parent 			: parent
		//			})
		//	
		//
		//	return component_label
		//},//end build_label



		/**
		* BUILD_CONTENT_DATA DEPRECATED
		*/
		//build_content_data : (options) => {
		//	if(SHOW_DEBUG===true) {
		//		//console.log("[ui.build_content_data] options:",options)
		//	}
		//		
		//	const parent = options.parent
		//
		//	// content_data 
		//		const content_data = common.create_dom_element({
		//				element_type	: 'div',
		//				class_name		: 'content_data',
		//				parent 			: parent
		//			})			
		//	
		//
		//	return content_data
		//},//end build_content_data



		/**
		* BUILD_EDIT
		*/
		build_edit : (component, content_data) => {
			if(SHOW_DEBUG===true) {
				//console.log("[ui.build_edit] component:",component)
			}

			const id 		= component.id || 'id is not set'
			const tipo 		= component.tipo
			const model 	= component.model
			const mode 		= component.mode
			const label 	= component.context.label			

			// wrapper
				const wrapper = common.create_dom_element({
						element_type	: 'div',
						id 				: id,
						class_name		: 'wrapper_component' + ' ' + 'wrap_component_' + tipo + ' ' + model + ' ' + tipo + ' ' + mode
					})
				// event click activate component
				wrapper.addEventListener('click', (e) => {
					e.stopPropagation()
					event_manager.publish('component_active', component)
				}, false)
			
			// label 
				const component_label = common.create_dom_element({
						element_type	: 'div',
						class_name		: 'label',
						inner_html 		: label,
						parent 			: wrapper
					})

			// content_data 
				content_data.classList.add("content_data")
				wrapper.appendChild(content_data)
				//const content_data = common.create_dom_element({
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
				
				return false
			}
		},//end active



		replace_node : (current_node, new_node) => {

			// clean
				while (current_node.firstChild) {
					current_node.removeChild(current_node.firstChild);
				}
			// set children nodes
				while (current_node.firstChild) {
					current_node.appendChild(current_node.firstChild);
				}

			return current_node
		},//end replace_node



	},//end component

	

	section : {


		

	}//end section



}// interface