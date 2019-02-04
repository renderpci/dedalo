/**
* Render_component
* Manages the component's logic and apperance in client side
*/
var render_component_portal = new function() {


	'use strict'


	this.model = "component_portal"
	this.ar_content_nodes 	= [];

	/**
	* LIST
	* Render node for use in list
	* @return DOM node
	*/
	this.list = function(options) {

			const self = this

			//console.log(" ///// options:",options);

		// Options vars 
			const context 			= options.context
			const data 				= options.data
			const global_data 		= options.global_data
			const global_context 	= options.global_context
			const node_type 		= "div"
			const node_class_name 	= this.model + "_list"

			if (typeof options.is_recursion==="undefined" ) {
				this.ar_content_nodes = []
			}


			if (typeof data==="undefined" ) {
				// Node create for portal
				const empty_node = common.create_dom_element({
					element_type	: node_type,
					class_name		: node_class_name
				})

				return empty_node

			}

		// filter data
			const value 					= data.value
			if(value === false){
					
				// Node create for portal
				const empty_node = common.create_dom_element({
					element_type	: node_type,
					class_name		: node_class_name
				})

				return empty_node

			}else{
			
				const json_related_component 	= (typeof context.json_related_component!=='undefined') ? context.json_related_component : false
			
				if(json_related_component!==false){

					for (var i = 0; i < json_related_component.length; i++) {
						const current_related 	= json_related_component[i];
						const related_context 	= global_context.filter(item => item.type==='component_info' && item.tipo===current_related && item.section_tipo===value.section_tipo)[0];
						const related_data 		= global_data.filter(item => item.tipo===current_related && item.from_component_tipo===value.from_component_tipo && item.section_tipo===value.section_tipo && item.section_id === value.section_id)[0];

						self.list({
							context 		: related_context,
							data 			: related_data,
							global_context	: global_context,
							global_data		: global_data,
							is_recursion 	: true			
						})
					}
				}else{

					const model 			= context.model
					const f_name 			= "render_" + model + ".list"
					const component_node	= common.execute_function_by_name(f_name, window, {
							context 		: context,
							data 			: data,
							global_context	: global_context,
							global_data		: global_data						
						});

					self.ar_content_nodes.push(component_node);
				}
			
			// Node create for portal
				const node = common.create_dom_element({
					element_type	: node_type,
					class_name		: node_class_name
				})

			// Add final components nodes 
				const ar_content_nodes_length = self.ar_content_nodes.length
				for (let i = 0; i < ar_content_nodes_length; i++) {
					
					// Cell 
						const item_cell = common.create_dom_element({
							element_type : "div",
							class_name	 : this.model + "_column",
							parent 		 : node
						})

					// Component node
						const component_node = self.ar_content_nodes[i]

					// Add node to cell
						item_cell.appendChild(component_node);				
				}

		// Debug
			//console.log("++ context", context);
			//console.log("++ data:", data);
				return node
			}

		
	}//end list



	/**
	* EDIT
	* Render node for use in edit
	* @return DOM node
	*/
	this.edit = function(options) {
		
		// Options vars 
			const context 			= options.context
			const data 				= options.data
			const node_type 		= "div"
			const node_class_name 	= this.model + "_edit"
		
		// Value as string 
			const value_string = "Hello world " + this.model

		// Node create
			const node = common.create_dom_element({
				element_type	: node_type,
				class_name		: node_class_name,
				text_content 	: value_string
			})

		// Debug
			//console.log("++ context", context);
			//console.log("++ data:", data);

		return node
	}//end edit



}//end render_component_portal