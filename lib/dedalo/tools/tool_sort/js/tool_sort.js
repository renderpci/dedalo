/**
* TOOL_SORT CLASS
*
*
*
*/
var tool_sort = new function() {


	'use strict';


	// Local vars
	this.trigger_tool_sort_url = DEDALO_LIB_BASE_URL + '/tools/tool_sort/trigger.tool_sort.php'
	this.main_object

	this.source_component_tipo
	this.target_component_tipo
	this.sub_target_component_tipo
	this.datum


	/**
	* INIT
	* Init the tool
	* @return bool true
	*/
	this.inited = false
	this.init = function(options) {

		const self = this

		const options_obj = JSON.parse(decodeURIComponent(options))
	
		// set vars
			self.source_component_tipo 		= options_obj.source_component_tipo
			self.target_component_tipo 		= options_obj.target_component_tipo
			self.sub_target_component_tipo 	= options_obj.sub_target_component_tipo
			self.datum 						= options_obj.datum


		// wait until portals are ready
			window.addEventListener('portal_ready',function(e){
				
				const portal_data 	 = e.detail.dataset
				const portal_wrapper = e.detail.wrapper				
				
				if(portal_data.tipo===options_obj.target_component_tipo) {

					self.set_target_component(portal_wrapper)
				}

			})//end window.addEventListener('portal_ready',function(e)	

		
		// main_object. create the main sections object
			self.main_object = self.datum

		// update_component
			//self.update_component = update_component

		// create the global html with header, grid (left, right) and load the section and thesaurus when the dom is ready
			self.parse_html().then(function(response){

				// section_tipo get the section_tipo for load the section
					const section_tipo = document.getElementById('sections_select').value
							
				// load the current section
					self.load_section(section_tipo)
	
				// init_paginator
					search.init_paginator({
						container_id : 'section_paginator'
					})
			})

		// set inited
			self.inited = true
		
		return true
	}//end init



	/**
	* SET_SOURCE_COMPONENT
	* @return 
	*//*
	this.set_source_component = async function(portal_wrapper) {

		// disable default portal sortable event
			const base_element 	= portal_wrapper.querySelector('.rows_wrapper')
			$(base_element).sortable( "disable" )
		
		const portal_element_sortable = portal_wrapper.querySelectorAll(".portal_element_sortable")
			//console.log("---- source_component portal_element_sortable:",portal_element_sortable);
		
		const length = portal_element_sortable.length
		for (let i = length - 1; i >= 0; i--) {
			
			const element = portal_element_sortable[i]

			element.draggable = false
			
			// draggable. Set item as html5 draggable
				element.draggable = true

			// dragstart event
				element.addEventListener("dragstart",function(e){
					// avoid select inside dom elements
					e.stopPropagation()
					// effect move
					e.dataTransfer.dropEffect = "move";
					// data_transfer . Note that data transfer is always a string regardless of the mime
					const data_transfer = this.dataset.dato
					e.dataTransfer.setData('application/json', data_transfer)
					//console.log("dragstart - e:", e);
					//console.log("dragstart - this:",this);
				},false)
		}

		return true
	};//end set_source_component
	*/



	/**
	* SET_TARGET_COMPONENT
	* @return promise
	*/
	this.set_target_component = async function(portal_wrapper) {

		const self = this
		
		const portal_element_sortable = portal_wrapper.querySelectorAll(".portal_element_sortable")
			//console.log("---- target_component portal_element_sortable:",portal_element_sortable);

		// portal_wrapper dataset changes
			const component_info = JSON.parse(portal_wrapper.dataset.component_info);
			// portal_link_open. Change portal_link_open config to avoid open new created record in portal
			component_info.propiedades.portal_link_open = false
			// update changed dataset component_info
			portal_wrapper.dataset.component_info = JSON.stringify(component_info)


		const length = portal_element_sortable.length
		for (let i = length - 1; i >= 0; i--) {
			
			const element = portal_element_sortable[i]
			
			// dragover event
				element.addEventListener("dragover",function(e){
					e.preventDefault()
					e.stopPropagation()
					e.dataTransfer.dropEffect = "move"
					// css
						this.classList.add("dragover")
						this.classList.remove("drop")
				},false)
			
			// dragleave event
				element.addEventListener("dragleave",function(e){
					e.preventDefault()
					e.stopPropagation()					
					e.dataTransfer.dropEffect = "move"
					// css
						this.classList.remove("dragover")
				},false)

			// drop event
				element.addEventListener("drop",function(e){
					e.preventDefault()
					e.stopPropagation()
					// css
						this.classList.remove("dragover")
						this.classList.add("drop")
					// data_transfer
						const data_transfer = JSON.parse( e.dataTransfer.getData("application/json") );

					// assign element to target portal
						self.assign_element(this, data_transfer)
					
					//console.log("drop - e:", e);
					//console.log("drop - this:",this);
					//console.log("drop - data_transfer:", data_transfer);					
				},false)
		}

		return true
	};//end set_target_component



	/**
	* ASSIGN_ELEMENT
	* @return 
	*/
	this.assign_element = function(element, data_transfer) {

		const self = this

		//console.log("+++ element:",element);
		//console.log("+++ data_transfer:",data_transfer);
		//console.log("self.sub_target_component_tipo:",self.sub_target_component_tipo);

		// wrapper
			const wrapper = component_common.get_wrapper_from_element(element)

		// locator to add
			const locator = {
				section_tipo : data_transfer.section_tipo,
				section_id 	 : data_transfer.section_id
			}

		// target component where add locator
			const item_dato = JSON.parse(element.dataset.dato)
			const target_section_tipo 	= item_dato.section_tipo
			const target_section_id 	= item_dato.section_id
			const target_component_tipo = self.sub_target_component_tipo

		

		// trigger request
		const trigger_url = self.trigger_tool_sort_url
		const trigger_vars= {
			mode   : 'assign_element',
			target : {
				tipo 		 : target_component_tipo,
				section_tipo : target_section_tipo,
				section_id 	 : target_section_id
			},
			locator : locator
		}
		const js_promise = common.get_json_data(trigger_url, trigger_vars).then(function(response){
			//console.log("response:",response);

			// update target component
				component_common.load_component_by_wrapper_id(wrapper.id, null, function(e){
					// calback actions here
					console.log("Component " + wrapper.dataset.tipo + " reloaded!");
				})
		})

		return js_promise
	};//end assign_element




	/**
	* PARSE_HTML
	* process the JSON received 
	*/
	this.parse_html = function(){

		const self = this
	
		const main_object = self.main_object;

		// Generate html nodes
			const js_promise = new Promise(function(resolve, reject) {

				const content_html = document.getElementsByClassName('content_html')[0]

				const grid_left = document.querySelector(".tool_grid_left")

				//create the header of the tool
				// const header = common.create_dom_element({
 				// 				element_type		: 'div',
 				// 				parent				: content_html,
 				// 				class_name			: 'header_tool'
 				// 				})
				// 
 				// //create the main grid
 				// const grid 	= common.create_dom_element({
 				// 				element_type		: 'div',
 				// 				parent				: content_html,
 				// 				class_name			: 'tool_grid'
 				// 				})
				// 
				// //create the left side of the grid
				// const grid_left 	= common.create_dom_element({
				// 				element_type		: 'div',
				// 				parent				: grid,
				// 				class_name			: 'tool_grid_left'
				// 				})
				// //create the rigth side of the grid
				// const grid_rigth 	= common.create_dom_element({
				// 				element_type		: 'div',
				// 				parent				: grid,
				// 				class_name			: 'tool_grid_rigth'
				// 				})

				//create the select of the sections for change it
				const sections_select = common.create_dom_element({
								id					: 'sections_select',
								element_type		: 'select',
								parent				: grid_left,
								class_name			: 'css_sections_select'
								})

				// SELECT for change the sections 
					// get the sections for select the options of the select
					const ar_select_options = main_object.data.filter(section => section.type==='sections')

					// asign the options to the select
					for (var i = 0; i < ar_select_options.length; i++) {

						const select_option = common.create_dom_element({
									element_type		: 'option',
									parent				: sections_select,
									value				: ar_select_options[i].section_tipo,
									inner_html			: ar_select_options[i].label
									})

					}
					// add the event onchage to the select, when it change, the section selected will be loaded
					sections_select.addEventListener('change',function(){
						self.load_section(this.value)
					},false)

				// create the section container of the tool
				const section_container = common.create_dom_element({
								id 					: 'section_container',
								element_type		: 'div',
								parent				: grid_left,
								class_name			: 'css_section_container'
								})

				// // create the thesaurus container of the tool
				// const thesaurus_container = common.create_dom_element({
				// 				id 					: 'thesaurus_container',
				// 				element_type		: 'div',
				// 				parent				: grid_rigth,
				// 				class_name			: 'css_thesaurus_container css_wrap_area_thesaurus'
				// 				})

				resolve(true)
			})

		return js_promise
	}//end parse_html



	/**
	* LOAD_SECTION
	* Exec search process and get section records in json data format
	*/
	this.load_section = function(section_tipo){
	
		const self = this;

		const main_object = self.main_object;
	
		// section_container. get an clean
			const section_container = document.getElementById('section_container')
			while (section_container.firstChild) {
				section_container.removeChild(section_container.firstChild);
			}

		// filter_container. create the filter container of the tool
			const section_filter_container = common.create_dom_element({
					id 				: 'section_filter_container',
					element_type	: 'div',
					parent			: section_container
				})

		// section_paginator. create the section paginator of the tool
			const section_paginator = common.create_dom_element({
					id 				: 'section_paginator',
					element_type	: 'div',
					parent			: section_container
				})
		
		// section_options
			const section_options = main_object.data.filter(section => section.section_tipo===section_tipo)[0]
		
		// table_rows_list. create the results container
			const table_rows_list = common.create_dom_element({
					id 				: 'table_rows_list',
					element_type	: 'div',
					class_name		: 'table_rows_list rows_container _' + section_tipo,
					dataset			: { search_options : section_options.search_options },
					parent			: section_container
				})			
		
		// init the filter (search2)
			const options = {
				// standard options
				section_tipo 			: section_tipo,
				temp_filter 			: null,
				modo 					: 'json',
				ar_real_section_tipo 	: null,
				ar_sections_by_type 	: null,
				// custom options
				parse_mode				: 'list',
				search_callback			: "tool_sort.load_section_records",
				ar_list_map				: section_options.ar_list_map
			}			
			search2.init(options, section_filter_container).then(function(e){
				// Promise actions				
			})

		// First search with previous user search options
			const search_query_object = search2.get_search_query_object()
			search2.search(null, search_query_object)
		
		// section_container.innerHTML = section_options.filter_html;
		// section_container.insertBefore(section_options.filter_html, section_first_child);		
		
		return true
	}//end load_section



	/**
	* LOAD_SECTION_RECORDS
	* Parse result_query_object to html
	* @param object result_query_object
	* @return promise js_promise
	*/
	this.load_section_records = function( result_query_object ){
		//console.log("**** result_query_object:",JSON.stringify( result_query_object.result.context) );
		//console.log("**** result_query_object:",JSON.stringify( result_query_object.result.data) );
		
		const self = this;
		
		// debug
			if(SHOW_DEBUG===true) {
				console.log("[tool_sort.load_section_records] result_query_object: ",result_query_object);
			}
	
		// table_rows_list. Clean before add
			const table_rows_list = document.getElementById('table_rows_list')
			while (table_rows_list.firstChild) {
				table_rows_list.removeChild(table_rows_list.firstChild);
			}

		// parse_json_rows promise
			const js_promise = section.parse_json_rows({
				json_rows 		: result_query_object.result,
				build_header 	: false,
				container 		: table_rows_list
			}).then(function(table_rows_list_element){
				
				// images . add click listener for open image larger
					const images 		= table_rows_list_element.querySelectorAll("img")
					const images_length = images.length
					for (var i = images_length - 1; i >= 0; i--) {
						images[i].addEventListener("click", function(){						
							tool_common.open_player(this,{
								type 			: "component_image",
								image_full_url 	: this.src
							});
						},false)
					}

				// drag item add
					const rows 			= table_rows_list_element.querySelectorAll(".row_container")
					const rows_length 	= rows.length
					for (let i = rows_length - 1; i >= 0; i--) {

						// // set the row draggable
						// 	rows[i].setAttribute('draggable', true);	
						// 
						// // add listeners to the row
						// 	rows[i].addEventListener('dragstart',function(event){
						// 			self.on_dragstart(this, event)
						// 		},false)
						// 	rows[i].addEventListener('dragend',function(event){
						// 			self.on_drag_end(this, event)
						// 		},false)						
						// 
 						// // Drag item
 						// 	const drag_item = common.create_dom_element({
 						// 		element_type	: 'div',
 						// 		class_name		: "drag_item",
 						// 		//dataset			: { search_options : section_options.search_options },
 						// 		parent			: rows[i]
 						// 	})
 						// 	// add the Even mousedown to prepare the drag mode
 						// 		drag_item.addEventListener('mousedown',function(event){
 						// 			self.on_drag_mousedown(this, event)
						// 		},false)

						const element = rows[i]

						// Drag item
 							const drag_item = common.create_dom_element({
 								element_type	: 'div',
 								class_name		: "drag_item",
 								//dataset			: { search_options : section_options.search_options },
 								parent			: element
 							})

						// draggable. Set item as html5 draggable
							element.setAttribute('draggable', true);

						// dragstart event
							element.addEventListener("dragstart",function(e){								
								// avoid select inside dom elements
								e.stopPropagation()

								// effect move
								//e.dataTransfer.dropEffect = "move";
								// data_transfer . Note that data transfer is always a string regardless of the mime
								const data_transfer = JSON.stringify(this.dataset)								
								e.dataTransfer.setData('application/json', data_transfer)
								//console.log("dragstart - e:", e);
								//console.log("dragstart - this:",this);
							},false)
					}
				
				// Check if is already used in thesaurus	
					// for (let i = 0; i < rows_length; i++) {						
					// 	self.check_used(rows[i])
					// }

			})

		return js_promise
	}//end load_section_records







};//end tool_sort