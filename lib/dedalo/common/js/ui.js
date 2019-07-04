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
				// wrapper.addEventListener('click', () => ui.component.active(component), false)
				wrapper.addEventListener('click', (e) => {
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



		/**
		* ACTIVE_DES
		* Set component state as active
		* @return bool
		*/
		active_DES : (component) => {
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
		},//end active_DES



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

			//console.log("---- ui.active component:", component)
			//console.log("---- ui.active id:", id)
		
			if (component.id===actived_component.id) {
				
				// match . Add wrapper css active			
					component.node.classList.add("active")
				
				return true
			
			}else{
				
				// not match. Remove wrapper css active if exists
					component.node.classList.remove("active")
				
				return false
			}
		},//end active



		/**
		* SAVE
		* Receive full component object and start the save process across the section_record
		* @param object component
		* @return promise save_promise
		*/
		save : async (component, saved_component) => {
			if(SHOW_DEBUG===true) {				
				//console.log("component save",component)
				//console.log("instances:",instances);				
			}

			if (component.id!==saved_component.id) {
				return saved_component
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

					// check result for errors
						section_record_save_promise.then(function(response){
								//console.log("+++++++++++++++++ save response:",response);
							// result expected is current section_id. False is returned if a problem found 
							const result = response.result
							if (result===false) {
								node.classList.add("error")
								if (response.msg) {
									alert("Error on save component data: \n" + response.msg)
								}
								if (response.error) {
									console.error(response.error)
								}
							}
						})

					return section_record_save_promise
				})
				console.log("--- save_promise:",save_promise);

			return save_promise
		},//end active



		init : async (component, options) => {

			const self = component

			self.model 			= options.model
			self.tipo 			= options.tipo
			self.section_tipo 	= options.section_tipo
			self.section_id 	= options.section_id
			self.mode 			= options.mode
			self.lang 			= options.lang

			self.section_lang 	= options.section_lang	
			self.parent 		= options.parent
			self.id 			= options.id

			// Optional vars 
			self.context = options.context  || null
			self.data 	 = options.data 	|| []

			// events subscription
				// event active (when user focus in dom)
				event_manager.subscribe('component_active', (actived_component) => {
					// call ui.component
					ui.component.active(self, actived_component)
					.then( response => { // response is bool value
						if (response===true) {
							//self.active_custom()
						}
					})
				})
				// event save (when user change component value)
				event_manager.subscribe('component_save', (saved_component) => {
					// call ui.component
					ui.component.save(self, saved_component)
					.then( response => { // response is saved_component object
						//console.log("+++++++++++++++++++ component_save response:",response);
					})
				})
				//event_manager.subscribe('stateChange', () => self.render())


			return true
		},//end init component



	},//end component

	

	section : {


		

	}//end section



}// interface