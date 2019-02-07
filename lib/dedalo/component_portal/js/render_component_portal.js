/**
* Render_component
* Manages the component's logic and apperance in client side
*/
var render_component_portal = new function() {


	'use strict'


	this.model = "component_portal"
	this.ar_content_nodes 	= [];

	this.data_resolved = []

	/**
	* LIST
	* Render node for use in list
	* @return DOM node
	*/
	this.list = function(options) {

		const self = this

		console.log(" ///// PORTAL OPTIONS (list):", options);

		// Options vars 
			const context 			= options.context
			const data 				= options.data
			const global_data 		= options.global_data
			const global_context 	= options.global_context
			const node_type 		= "div"
			const node_class_name 	= this.model + "_list"
			const is_recursion 		= options.is_recursion

		// ar_content_nodes reset all
			if (is_recursion===false) {
				render_component_portal.ar_content_nodes = []
				render_component_portal.data_resolved 	 = []
				console.log("reset list:",data, JSON.parse(JSON.stringify(render_component_portal.data_resolved)), is_recursion );
			}		

		// Default node (empty for now)
			const node = common.create_dom_element({
					element_type	: node_type,
					class_name		: node_class_name
				})

		// loop prevention 
			/*
			const uid = data.from_component_tipo + "_" + data.tipo + "_" + data.section_tipo + "_" + data.section_id
			//const ar_match = render_component_portal.data_resolved.filter(item => item.from_component_tipo===data.from_component_tipo && item.tipo===data.tipo && item.section_tipo===data.section_tipo && item.section_id===data.section_id)
			//const current_data_resolved = JSON.parse( JSON.stringify(render_component_portal.data_resolved) )	
			const match = render_component_portal.data_resolved.indexOf(uid)			
			 	console.log("data_resolved match:", match, " uid:", uid, " data_resolved:", JSON.parse( JSON.stringify(render_component_portal.data_resolved) )	 );
			if (match!==-1) {
				return node
			}
			render_component_portal.data_resolved.push(uid)
			*/
			console.log("====== data.value:", context.model, data.section_tipo, data.tipo, " value:", data.value);

		// filter data			
			if(typeof data!=="undefined" && data.value!==false) {				
			
				// json_related_component cases
					const json_related_component = (typeof context.json_related_component!=='undefined') ? context.json_related_component : false
					if(json_related_component===false){

						// component_node. create and add
							const model 			= context.model
							const f_name 			= "render_" + model + ".list"
							//const component_node	= common.execute_function_by_name(f_name, window, {
							//		context 		: context,
							//		data 			: data,
							//		global_context	: global_context,
							//		global_data		: global_data,
							//		is_recursion 	: true
							//});
							if (model==="component_portal") {
								const component_node = self.list({
									context 		: context,
									data 			: data,
									global_context	: global_context,
									global_data		: global_data,
									is_recursion 	: true,
									caller_type		: "json_related_component false " + context.model
								})
								render_component_portal.ar_content_nodes.push(component_node)
							}else{
								const component_node = window["render_" + model]["list"]({
									context 		: context,
									data 			: data,
									global_context	: global_context,
									global_data		: global_data,
									is_recursion 	: true,
									caller_type		: "json_related_component false2 " + context.model
								})
								render_component_portal.ar_content_nodes.push(component_node)
							}							

					}else{

						const value = data.value						
						const json_related_component_length = json_related_component.length
						for (let i = 0; i < json_related_component_length; i++) {

							const related_tipo 	  = json_related_component[i]; // Like numisdata164

							const related_context = global_context.filter(item => item.type==='component_info' && item.tipo===related_tipo && item.section_tipo===value.section_tipo)[0];
							const ar_related_data = global_data.filter(item => item.tipo===related_tipo && item.from_component_tipo===value.from_component_tipo && item.section_tipo===value.section_tipo && item.section_id===value.section_id);
							if (ar_related_data.length>1) {
								console.error("Error. More than one related data found! ar_related_data:",ar_related_data);
								continue;
							}else if(ar_related_data.length<1) {
								console.error("Error. No related data found! ar_related_data:", ar_related_data);
								continue;
							}
							const related_data = ar_related_data[0]

								console.log("ar_related_data:",ar_related_data);
							//const uid   = ar_related_data.from_component_tipo + "_" + ar_related_data.tipo + "_" + ar_related_data.section_tipo + "_" + ar_related_data.section_id
							//const match = render_component_portal.data_resolved.indexOf(uid)			
							// 	console.log("data_resolved match:", match, " uid:", uid, " data_resolved:", JSON.parse( JSON.stringify(render_component_portal.data_resolved) )	 );
							//if (match!==-1) {
							//	continue;
							//}
							//render_component_portal.data_resolved.push(uid)

							// recursion on each item
								const current_node = self.list({
									context 		: related_context,
									data 			: related_data,
									global_context	: global_context,
									global_data		: global_data,
									is_recursion 	: true,
									caller_type		: "json_related_component true " + related_context.model
								})										
						}

					}//end if(json_related_component===false)			


				// Add final components nodes 
					const ar_content_nodes_length = render_component_portal.ar_content_nodes.length
					for (let i = 0; i < ar_content_nodes_length; i++) {
						
						// Cell 
							const item_cell = common.create_dom_element({
								element_type : "div",
								class_name	 : this.model + "_column",
								parent 		 : node
							})

						// Component node
							const component_node = render_component_portal.ar_content_nodes[i]

						// Add node to cell
							item_cell.appendChild(component_node);
					}
			}//end if(typeof data!=="undefined" && data.value!==false)


		return node
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