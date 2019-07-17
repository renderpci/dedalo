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


	/**
	* INIT
	* Init the tool
	* @return bool true
	*/
	this.inited = false
	this.init = function(options) {

		const self = this

		const options_obj 			= JSON.parse(decodeURIComponent(options))
		const data 					= options_obj.data		
		const update_component 		= options_obj.update_component

		if(SHOW_DEBUG===true) {
			console.log("[tool_sort.init] options_obj:",options_obj);
		}

		if (self.inited!==true) {
			
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

		// main_object. create the main sections object
			self.main_object = data

		// update_component
			self.update_component = update_component

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

			
		
		return true
	}//end init



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

				// create the thesaurus container of the tool
				const thesaurus_container = common.create_dom_element({
								id 					: 'thesaurus_container',
								element_type		: 'div',
								parent				: grid_rigth,
								class_name			: 'css_thesaurus_container css_wrap_area_thesaurus'
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

						// set the row draggable
							rows[i].setAttribute('draggable', true);	
						
						// add listeners to the row
							rows[i].addEventListener('dragstart',function(event){
									self.on_dragstart(this, event)
								},false)
							rows[i].addEventListener('dragend',function(event){
									self.on_drag_end(this, event)
								},false)						

						// Drag item
							const drag_item = common.create_dom_element({
								element_type	: 'div',
								class_name		: "drag_item",
								//dataset			: { search_options : section_options.search_options },
								parent			: rows[i]
							})
							// add the Even mousedown to prepare the drag mode
								drag_item.addEventListener('mousedown',function(event){
									self.on_drag_mousedown(this, event)
								},false)								
					}
				
				// Check if is already used in thesaurus	
					// for (let i = 0; i < rows_length; i++) {						
					// 	self.check_used(rows[i])
					// }

			})

		return js_promise
	}//end load_section_records



	/**
	* CHECK_USED
	* @return bool
	*/
	this.check_used = function(row) {

		const self = this
		
		const section_tipo 	= row.dataset.section_tipo
		const section_id 	= row.dataset.section_id

		relation_list.load_relation_list_data({
			modo 			: 'list',
			tipo 			: section_tipo,
			section_tipo 	: section_tipo,
			section_id 		: section_id,
			value_resolved 	: false,
			limit 			: false,
			offset 			: 0,
			count 			: false
		}).then(function(response){
			if(SHOW_DEBUG===true) {
				//console.log("++ section_tipo/id: ",section_tipo,"-",section_id);
				//console.log("[tool_sort.check_used] response:",response);
			}

			const hierarchy_target_section_tipo = self.hierarchy_target_section_tipo
			const ar_found = response.data.filter(item => item.section_tipo===hierarchy_target_section_tipo)
			if(SHOW_DEBUG===true) {
				//console.log("ar_found:",ar_found);
			}
			if (ar_found.length>0) {
				self.mark_as_used(row)
				return true
			}else{
				return false
			}
		})
	};//end check_used



	/**
	* MARK_AS_USED
	* @return bool true
	*/
	this.mark_as_used = function(row) {		

		const drag_item = row.querySelector(".drag_item")
		if (drag_item) {
			drag_item.classList.add("row_used")
		}		

		return true
	};//end mark_as_used



	/**
	* ON_DRAG_MOUSEDOWN
	* @return 
	*/
	var source = false;
	var handle =''
	this.on_drag_mousedown = function(obj, event) {
		if(SHOW_DEBUG===true) {
			console.log("drag_mouse !");;
		}
		
		handle = event			
	};//end on_drag_mousedown


	/**
	* ON_DRAGSTART
	*/
	this.old_parent_wrap = null
	this.on_dragstart = function(obj, event) {
		if(SHOW_DEBUG===true) {
			//console.log("tool_sort on_dragstart ! , obj",obj);
		}
		
		obj.ondrop = null;
		
		//if (handle.contains(target)) {
		if (handle) {
			event.stopPropagation();
			
			source = obj;
			event.dataTransfer.effectAllowed = 'move';

			const section_id 	= obj.dataset.section_id
			const section_tipo  = (obj.dataset.section_tipo==="hierarchy1") ? obj.dataset.target_section_tipo : obj.dataset.section_tipo			

			// data_obj
				const data_obj = {
						manager	 : "tool_sort",
						fallback : "set_new_thesaurus_value",
						locator  : { section_id   : section_id,
									 section_tipo : section_tipo
								   }
					}				
			event.dataTransfer.setData('application/json', JSON.stringify(data_obj));
			
		}else{
			event.preventDefault();
		}		
	};//end on_dragstart	



	/**
	* ON_DRAG_END
	* @return 
	*/
	var target
	this.on_drag_end = function(item, event) {
		if(SHOW_DEBUG===true) {
			//console.log("on_drag_end !", event);
		}		

		target = false;
		handle = '';		
	};//end on_drag_end




};//end tool_sort