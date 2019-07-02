// imports
	import event_manager from '/dedalo/lib/dedalo/page/js/page.js'



/**
* ui
*/
export const ui = {

	component : {

	
		/**
		* BUILD_WRAPPER
		*/
		build_wrapper : (options) => {
			if(SHOW_DEBUG===true) {
				//console.log("[ui.build_wrapper] options:",options)
			}
				
			const id 		= options.id
			const tipo 		= options.tipo
			const model 	= options.model
			const mode 		= options.mode
			const component = options.component	

			// wrapper
				const wrapper = common.create_dom_element({
						element_type	: 'div',
						id 				: id,
						class_name		: 'wrapper_component ' + model + ' ' + tipo + ' ' + mode
					})
			// event click activate component
			if (component) wrapper.addEventListener('click', () => ui.component.active(component))

			return wrapper
		},//end build_wrapper


		/**
		* BUILD_LABEL
		*/
		build_label : (options) => {
			if(SHOW_DEBUG===true) {
				//console.log("[ui.build_label] options:",options)
			}				

			const mode 			= options.mode
			const label 		= options.label
			const parent 		= options.parent

			// label 
				const component_label = common.create_dom_element({
						element_type	: 'div',
						class_name		: 'label',
						inner_html 		: label,
						parent 			: parent
					})
			

			return component_label
		},//end build_label



		/**
		* BUILD_CONTENT_DATA
		*/
		build_content_data : (options) => {
			if(SHOW_DEBUG===true) {
				//console.log("[ui.build_content_data] options:",options)
			}
				
			const parent = options.parent

			// content_data 
				const content_data = common.create_dom_element({
						element_type	: 'div',
						class_name		: 'content_data',
						parent 			: parent
					})			
			

			return content_data
		},//end build_content_data



		/**
		* ACTIVE
		* Set component state as active
		* @return bool true
		*/
		active : (component) => {
			if(SHOW_DEBUG===true) {
				//console.log("component active",component)
			}
			
			const node  = component.node
			const tipo  = component.tipo
			const label = component.context.label

			node.classList.add("active")

			const sender_data = {
				tipo 	: tipo,
				node 	: node,
				label 	: label
			}

			const publish = event_manager.publish('component_active', component)
			

			return true
		}//end active



	},//end video_player

	

	section : {


		

	}



}// interface