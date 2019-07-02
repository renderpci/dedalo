// imports
	import event_manager from '/dedalo/lib/dedalo/page/js/page.js'
	import * as instances from '/dedalo/lib/dedalo/common/js/instances.js'



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
			if (component) wrapper.addEventListener('click', () => ui.component.active(component), false)

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
		* @return bool
		*/
		active : (component) => {
			const start = performance.now()	
			if(SHOW_DEBUG===true) {				
				//console.log("component active",component)				
				//console.log("instances:",instances);
			}

			const node  		= component.node
			const tipo  		= component.tipo
			const section_tipo  = component.section_tipo
			const section_id  	= component.section_id
			const label 		= component.context.label
			
			const component_instances = instances.instances.filter(element => element.type==='component' && element.section_tipo===section_tipo)
				//console.log("component_instances:",component_instances);
			
			const l = component_instances.length
			for (let i = l - 1; i >= 0; i--) {

				const current_instance 	= component_instances[i]
				const current_node 		= current_instance.instance.node

				if (current_instance.tipo===tipo && current_instance.section_id===section_id) {
					
					current_instance.active = true
					// css . Set wrapper apperance as active
					current_node.classList.add("active")
				
				}else{
					
					current_instance.active = false
					// css . remove wrapper apperance active
					if (current_node.classList.contains("active")) {
						current_node.classList.remove("active")					
					}
				}
			}
						
			// event_manager
				const sender_data = {
					tipo 	: tipo,
					node 	: node,
					label 	: label
				}
				const publish = event_manager.publish('component_active', component)				

			// debug
				if(SHOW_DEBUG===true) {					
					console.log("Call to ui component active function " + (performance.now() - start) + " milliseconds in",l,"instances");
				}
			
			return true
		},//end active



		/**
		* SAVE
		* Receive full component object and start the save process across the section_record
		* @param object component
		* @return promise save_promise
		*/
		save : (component) => {
			if(SHOW_DEBUG===true) {				
				//console.log("component save",component)
				//console.log("instances:",instances);				
			}

			const tipo = component.tipo
	
			// force to update / sync dom node and component value
				const node = component.node
				if(node){
					component.set_value()
				}			
			
			// section_record instance
				const instance_options = {
					model 			: 'section_record',
					tipo 			: component.section_tipo,
					section_tipo 	: component.section_tipo,
					section_id		: component.section_id,
					mode			: component.mode,
					lang			: component.section_lang
				}
				const save_promise = instances.get_instance(instance_options).then(function(section_record){
					
					// section record save execution
						const section_record_save_promise = section_record.save(tipo)

					// check result
						section_record_save_promise.then(function(response){
								console.log("+++++++++++++++++ save response:",response);
							// result expected is current section_id. False is returned if a problem found 
							const result = response.result
							if (result===false) {
								node.classList.add("error")
							}
						})

					return section_record_save_promise
				})

			return save_promise
		},//end active



		/**
		* BUILD_EDIT
		*/
		build_edit : (component, container) => {
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
						class_name		: 'wrapper_component ' + model + ' ' + tipo + ' ' + mode
					})
				// event click activate component
				wrapper.addEventListener('click', () => ui.component.active(component), false)

			// label 
				const component_label = common.create_dom_element({
						element_type	: 'div',
						class_name		: 'label',
						inner_html 		: label,
						parent 			: wrapper
					})

			// content_data 
				const content_data = common.create_dom_element({
						element_type	: 'div',
						class_name		: 'content_data',
						parent 			: wrapper
					})
				// move all nodes from container to content data
					while (container.childNodes.length > 0) {
						content_data.appendChild(container.childNodes[0])
					}


			return wrapper
		},//end build_edit



	},//end component

	

	section : {


		

	}//end section



}// interface