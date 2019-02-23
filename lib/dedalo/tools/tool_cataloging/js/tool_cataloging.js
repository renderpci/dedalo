/**
* TOOL_CATALOGING CLASS
*
*
*
*/
var tool_cataloging = new function() {


	'use strict';


	// Local vars
	this.trigger_tool_description_url = DEDALO_LIB_BASE_URL + '/tools/tool_description/trigger.tool_description.php'
	this.main_object



	/**
	* INIT
	* Init the tool
	* @return bool true
	*/
	this.inited = false
	this.init = function(options) {

		const options_obj 	= JSON.parse(decodeURIComponent(options));
		const data 			= options_obj.data;
		const hierarchy 	= options_obj.hierarchy;

		const self = this;

		if (self.inited!==true) {

			// READY (EVENT)
			//$(function() {
			window.ready(function(){
			
			});//end ready


			// LOAD (EVENT)			
			window.addEventListener("load", function (event) {				
			
			}, false)//end load

			
			// BEFOREUNLOAD (EVENT)
			window.addEventListener("beforeunload", function (event) {				
				event.preventDefault();

			}, false)//end beforeunload


			// UNLOAD (EVENT)			
			window.addEventListener("unload", function (event) {
				event.preventDefault();
				
			}, false)//end unload
			
		}//end if (this.inited!==true)

		self.inited = true

		//create the main sections object
			self.main_object = data;
				//console.log("main_object:",self.main_object);

		// create the global html with header, grid (left, rigth) and load the section and thesaurus when the dom is ready
			self.parse_html().then(function(response){

				// section_tipo get the section_tipo for load the section
					const section_tipo = document.getElementById('sections_select').value
							
				// load the current section
					self.load_section(section_tipo)
	
				// init_paginator
					search.init_paginator({
						container_id : 'section_filter_paginator'
					})

				// create the thesaurus nodes
					self.build_thesaurus(hierarchy)
			})

			
		
		return true
	}//end init



	/**
	* PARSE_HTML
	* process the JSON recived 
	*/
	this.parse_html = function(){

		const self = this
	
		const main_object = self.main_object;

		// Generate html nodes
			const js_promise = new Promise(function(resolve, reject) {

				const content_html = document.getElementsByClassName('content_html')[0]

				//create the header of the tool
				const header = common.create_dom_element({
								element_type		: 'div',
								parent				: content_html,
								class_name			: 'header_tool'
								})

				//create the main grid
				const grid 	= common.create_dom_element({
								element_type		: 'div',
								parent				: content_html,
								class_name			: 'tool_grid'
								})

				//create the left side of the grid
				const grid_left 	= common.create_dom_element({
								element_type		: 'div',
								parent				: grid,
								class_name			: 'tool_grid_left'
								})
				//create the rigth side of the grid
				const grid_rigth 	= common.create_dom_element({
								element_type		: 'div',
								parent				: grid,
								class_name			: 'tool_grid_rigth'
								})

				//create the select of the sections for changeit
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
					//add the Even onchage to the select, whe it change the section selected will be loaded
					sections_select.addEventListener('change',function(){
						self.load_section(this.value)
					},false)

				//create the section container of the tool
				const section_container = common.create_dom_element({
								id 					: 'section_container',
								element_type		: 'div',
								parent				: grid_left,
								class_name			: 'css_section_container'
								})

				//create the section container of the tool
				const thesaurus_container = common.create_dom_element({
								id 					: 'thesaurus_container',
								element_type		: 'div',
								parent				: grid_rigth,
								class_name			: 'css_thesaurus_container'
								})



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

		// filter_paginator. create the filter paginator of the tool
			const section_filter_paginator = common.create_dom_element({
					id 				: 'section_filter_paginator',
					element_type	: 'div',
					parent			: section_container
				})
		
		// section_options
			const section_options = main_object.data.filter(section => section.section_tipo===section_tipo)[0]    	
				//console.log("section_options:",section_options)  

		// table_rows_list. create the results container
			const table_rows_list = common.create_dom_element({
					id 				: 'table_rows_list',
					element_type	: 'div',
					class_name		: 'table_rows_list rows_container _' + section_tipo,
					dataset			: { search_options : section_options.search_options },
					parent			: section_container
				})

		// const section_first_child = section_container.firstChild;	
		  	
		
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
				search_callback			: "tool_cataloging.load_section_records",
				ar_list_map				: section_options.ar_list_map
			}	
			search2.init(options, section_filter_container).then(function(e){
				// Promise actions
			})

		// First search with previous user search options		
			search2.search(null, search2.get_search_query_object())
		
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

		const self = this;
		
		// debug
			if(SHOW_DEBUG===true) {
				console.log("result_query_object: ",result_query_object);
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
				
				// images . add click listerner for open image larger
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
					for (var i = rows_length - 1; i >= 0; i--) {

						// set the row dragagable
						rows[i].setAttribute('draggable', true);	
						
						// add listeners to the row
						rows[i].addEventListener('dragstart',function(){
								self.on_dragstart(this, event)
							},false)
						rows[i].addEventListener('dragend',function(){
								self.on_drag_end(this, event)
							},false)
						

						// Drag item
							const drag_item = common.create_dom_element({
								element_type	: 'div',
								class_name		: "drag_item",
								//dataset			: { search_options : section_options.search_options },
								parent			: rows[i]
							})
						//add the Even mousedown to prepare the drag mode
							drag_item.addEventListener('mousedown',function(){
								self.on_drag_mousedown(this, event)
							},false)				
					}

			})

		return js_promise
	}//end load_section_records



	/**
	* BUILD_THESAURUS
	* @return 
	*/
	this.build_thesaurus = function(hierarchy) {

		const self = this;

		//create the root_nodes of the hierachy for build the thesarurus
			let root_nodes = []
		// create ar_promises to build htmml
			let ar_promises = [];

			for (var i = 0; i < hierarchy.length; i++) {
				const current_hierarchy =  hierarchy[i]
				root_nodes.push(current_hierarchy.hierarchy_section_tipo + '_' + current_hierarchy.section_id  + '_' + current_hierarchy.hierarchy_node_type)
				
				//parse the current hierarchy HTML
				ar_promises.push(self.parse_thesaurus_html(current_hierarchy))

			}

			//wait for all promises (parse_thesaurus_html) will done
			Promise.all(ar_promises).then(function(response){
				// prepare the options to build the thseaurus
					const options = {
						model_view : false,
						root_nodes : root_nodes,
						search_options : false
					}

				//init the thesaurus
					area_thesaurus.init(options)
			})

	};//end build_thesaurus


	/**
	* PARSE_THESAURUS_HTML
	* @return 
	*/
	this.parse_thesaurus_html = function(current_hierarchy) {

		const js_promise = new Promise(function(resolve, reject) {
	
			const node_id = current_hierarchy.hierarchy_section_tipo + '_' + current_hierarchy.section_id  + '_' + current_hierarchy.hierarchy_node_type

			const hierarchy_section_tipo 		=  current_hierarchy.hierarchy_section_tipo;
			const hierarchy_section_id 			=  current_hierarchy.section_id;
			const hierarchy_target_section_tipo	=  current_hierarchy.hierarchy_target_section_tipo;
			const hierarchy_childrens_tipo		=  current_hierarchy.hierarchy_childrens_tipo;

			const thesaurus_container = document.getElementById('thesaurus_container')

			// Generate html nodes
			// create the wrap for the thesaurus
				const wrap_ts_object = common.create_dom_element({
							element_type		: 'div',
							parent				: thesaurus_container,
							class_name			: 'wrap_ts_object hierarchy_root_node',
							dataset				: { node_type 			: 'hierarchy_node',
													section_tipo 		: hierarchy_section_tipo,
													section_id 			: hierarchy_section_id,
													target_section_tipo : hierarchy_target_section_tipo
													 },
							})

				// create the elements_container
					const elements_container = common.create_dom_element({
								element_type		: 'div',
								parent				: wrap_ts_object,
								class_name			: 'elements_container',
								})


					// create the root_node_id
						const root_node_id = common.create_dom_element({
									id 					: node_id,
									element_type		: 'div',
									parent				: elements_container,
									class_name			: 'list_thesaurus_element',
									dataset				: { tipo 		: hierarchy_childrens_tipo,
															type 		: 'link_childrens',
															},
									})
				// create the childrens_container
					const childrens_container = common.create_dom_element({
								element_type		: 'div',
								parent				: wrap_ts_object,
								class_name			: 'childrens_container',
								dataset				: { role 		: 'childrens_container',
														section_id 	: hierarchy_section_id,
														},
								})
			resolve(true)

		})// end js_promise

		return js_promise

	};//end parse_thesaurus_html


	/**
	* ON_DRAG_MOUSEDOWN
	* @return 
	*/
	var source = false;
	var handle =''
	this.on_drag_mousedown = function(obj, event) {
			handle = event
	};//end on_drag_mousedown


	/**
	* ON_DRAGSTART
	*/
	this.old_parent_wrap = null
	this.on_dragstart = function(obj, event) {

		obj.ondrop = null;
		
		//if (handle.contains(target)) {
		if (handle) {
			event.stopPropagation();
			//event.dataTransfer.setData('text/plain', 'handle');
			source = obj;
			event.dataTransfer.effectAllowed = 'move';
			const locator = {section_id 	: obj.dataset.section_id,
							 section_tipo 	: obj.dataset.section_tipo
						}
			event.dataTransfer.setData('application/json', JSON.stringify(locator));
		} else {
			event.preventDefault();
		}

		// Fix class var 'old_parent_wrap'
		ts_object.old_parent_wrap = obj.parentNode.parentNode;
		if(!ts_object.old_parent_wrap) {
			console.log("[on_dragstart] Error on find old_parent_wrap");
		}
		//console.log(event);
		//obj.parentNode.parentNode.removeEventListener("drop", 'ts_object.on_drop');		
	};//end on_dragstart	



	/**
	* ON_DRAG_END
	* @return 
	*/
	var target
	this.on_drag_end = function() {
		target = false;
		handle = '';
		source = '';
		//window.onmouseup = null;
	};//end on_drag_end




};//end tool_cataloging