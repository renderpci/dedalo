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

	this.ar_used_section_id
	this.custom_order
	this.order_custom


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
			self.ar_used_section_id 		= options_obj.ar_used_section_id
			self.custom_order 				= options_obj.custom_order


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

				// button order custom
					const button_order_custom = common.create_dom_element({
							element_type		: 'input',
							type 				: 'button',
							value 				: 'Custom order',
							parent				: grid_left,
							class_name			: 'custom_order_button'
						})
						button_order_custom.addEventListener("click",function(e){
							// sections_select
								const sections_select = document.getElementById("sections_select")
								const section_tipo 	  = sections_select.value
							// section_options
								const section_options 	= main_object.data.filter(section => section.section_tipo===section_tipo)[0]
								const search_options  	= JSON.parse(section_options.search_options)
							// toggle
							if (this.classList.contains("active")) {
								this.classList.remove("active")
								search_options.search_query_object.order = null
								search_options.search_query_object.order_custom = self.order_custom
							}else{
								this.classList.add("active")
								search_options.search_query_object.order = self.custom_order
								search_options.search_query_object.order_custom = null
							}

							// fix
							section_options.search_options 	= JSON.stringify(search_options)

							// reload list
							self.load_section(section_tipo)
						},false)

				// button set original/copy
					const button_original_duplicate  = common.create_dom_element({
						element_type	: 'input',
						type 			: 'button',
						value 			: "Set original/copy",
						class_name		: "button_original_duplicate",
						parent			: grid_left
					})
					button_original_duplicate.addEventListener('click',function(e){
						self.set_original_duplicate(this)
					},false)


				// select . create the select of the sections for change it
					const sections_select = common.create_dom_element({
									id					: 'sections_select',
									element_type		: 'select',
									parent				: grid_left,
									class_name			: 'css_sections_select'
									})

					// options for change the sections
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

				// section_container. create the section container of the tool
					const section_container = common.create_dom_element({
						id 					: 'section_container',
						element_type		: 'div',
						parent				: grid_left,
						class_name			: 'css_section_container'
					})

				resolve(true)
			})

		return js_promise
	}//end parse_html



	/**
	* LOAD_SECTION
	* Exec search process and get section records in json data format
	*/
	this.load_section = async function(section_tipo, search_options){

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
			const section_options 	= main_object.data.filter(section => section.section_tipo===section_tipo)[0]

		// ar_list_map
			const ar_list_map 		= section_options.ar_list_map

		// search_options
			if (typeof search_options==="undefined") {
				search_options = JSON.parse(section_options.search_options)
			}

		// fix order_custom once
			if (!self.order_custom) {
				self.order_custom = search_options.search_query_object.order_custom
			}

		// table_rows_list. create the results container
			const table_rows_list = common.create_dom_element({
					id 				: 'table_rows_list',
					element_type	: 'div',
					class_name		: 'table_rows_list rows_container _' + section_tipo,
					dataset			: { search_options : JSON.stringify(search_options) },
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
				ar_list_map				: ar_list_map
			}
			search2.init(options, section_filter_container).then(function(e){
				// Promise actions
			})

		// First search with previous user search options
			const search_query_object 	= search2.get_search_query_object()
			const result_promise 		= search2.search(null, search_query_object)

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
	this.load_section_records = function(result_query_object){
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
			})
			.then(function(table_rows_list_element){

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

						const current_section_id = element.dataset.section_id

						// columns original duplicate
							const column_original_duplicate  = common.create_dom_element({
 								element_type	: 'div',
 								class_name		: "column_original_duplicate",
 								parent			: element
 							})
 							const checkbox_original  = common.create_dom_element({
	 								element_type	: 'input',
	 								type 			: 'checkbox',
	 								id 				: 'checkbox_original_' + current_section_id,
	 								class_name		: "checkbox_original",
	 								value 			: current_section_id,
	 								parent			: column_original_duplicate
	 							})
	 							const checkbox_original_label  = common.create_dom_element({
	 								element_type	: 'label',
	 								text_content 	: 'Original',
	 								parent			: column_original_duplicate
	 							})
	 							checkbox_original_label.setAttribute('for','checkbox_original_' + current_section_id)

 							common.create_dom_element({
	 								element_type	: 'br',
	 								parent			: column_original_duplicate
	 							})

 							const checkbox_duplicate  = common.create_dom_element({
	 								element_type	: 'input',
	 								type 			: 'checkbox',
	 								id 				: 'checkbox_duplicate_' + current_section_id,
	 								class_name		: "checkbox_duplicate",
	 								value 			: current_section_id,
	 								parent			: column_original_duplicate
	 							})
 								const checkbox_duplicate_label  = common.create_dom_element({
	 								element_type	: 'label',
	 								text_content 	: 'Copy',
	 								parent			: column_original_duplicate
	 							})
	 							checkbox_duplicate_label.setAttribute('for','checkbox_duplicate_' + current_section_id)

	 						//const button_original_duplicate  = common.create_dom_element({
	 						//		element_type	: 'input',
	 						//		type 			: 'button',
	 						//		value 			: "Set",
	 						//		class_name		: "button_original_duplicate",
	 						//		parent			: column_original_duplicate
	 						//	})
	 						//	button_original_duplicate.addEventListener('click',function(e){
	 						//		self.set_original_duplicate(this)
	 						//	},false)

						// columns snap_item
							const snap_item  = common.create_dom_element({
	 								element_type	: 'div',
	 								class_name		: "row_snap",
	 								parent			: element
 								})
								const checkbox_snap  = common.create_dom_element({
	 								element_type	: 'input',
	 								type 			: 'checkbox',
	 								id 				: 'checkbox_snap_' + current_section_id,
	 								class_name		: "checkbox_snap",
	 								value 			: current_section_id,
	 								parent			: snap_item
	 							})
	 							const checkbox_snap_label  = common.create_dom_element({
	 								element_type	: 'label',
	 								text_content 	: 'Snap',
	 								parent			: snap_item
	 							})
	 							checkbox_snap_label.setAttribute('for','checkbox_snap_' + current_section_id)
	 							checkbox_snap.addEventListener("click", function(){

	 								const row_container = find_ancestor(this, 'row_container')

	 								if (this.checked) {
	 									row_container.classList.add("snap")
	 								}else{
										row_container.classList.remove("snap")
	 								}
	 							},false)

						// columns drag item
							const class_used = (self.ar_used_section_id.indexOf(current_section_id)!==-1) ? " row_used" : ""
 							const drag_item  = common.create_dom_element({
 								element_type	: 'div',
 								class_name		: "drag_item" + class_used,
 								//dataset		: { search_options : section_options.search_options },
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

						// dragend event
							element.addEventListener("dragend",function(e){
								// avoid select inside dom elements
								e.stopPropagation()

								// ignore dragend without drop
								if (e.dataTransfer.dropEffect!=="move") {
									return false
								}

								const drag_item = this.querySelector(".drag_item")
								if (drag_item) {
									drag_item.classList.add("row_used")
								}
								//console.log("dragstart - e:", e);
								//console.log("---- dragend - this:",this);
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
	* SET_ORIGINAL_DUPLICATE
	* @return
	*/
	this.set_original_duplicate = function() {

		const self = this

		const table_rows_list   = document.getElementById('table_rows_list')
		const section_tipo 		= document.getElementById('sections_select').value

		// original
			const checkbox_original = table_rows_list.querySelectorAll('input.checkbox_original')
			const ar_checked_items  = []
			checkbox_original.forEach(item => {
				if (item.checked) {
					ar_checked_items.push(item)
				}
			})
			const ar_checked_items_length = ar_checked_items.length
			if (ar_checked_items_length<1) {
				alert("Select one original");
				return false
			}else if (ar_checked_items_length>1) {
				alert("Select only one original");
				return false
			}
			const original_id = ar_checked_items[0].value
			//console.log("original_id:",original_id);


		// duplicates
			const checkbox_duplicate = table_rows_list.querySelectorAll('input.checkbox_duplicate')
			const ar_checked_items_duplicate  = []
			checkbox_duplicate.forEach(item => {
				if (item.checked) {
					ar_checked_items_duplicate.push(item)
				}
			})
			const ar_checked_items_duplicate_length = ar_checked_items_duplicate.length
			if (ar_checked_items_duplicate_length<1) {
				if (!confirm("Remove all duplicates reference for current original")) {
					return false
				}
			}
			const duplicates_id = []
			ar_checked_items_duplicate.forEach(item => {
				if (item.checked && item.value!==original_id) {
					duplicates_id.push(item.value)
				}
			})
			//console.log("duplicates_id:",duplicates_id);


		// trigger request
			const trigger_url = self.trigger_tool_sort_url
			const trigger_vars= {
				mode   			: 'set_original_duplicate',
				section_tipo 	: section_tipo,
				original_id 	: original_id,
				duplicates_id 	: duplicates_id
			}; //return console.log("trigger_vars:",trigger_url, trigger_vars);
			const js_promise = common.get_json_data(trigger_url, trigger_vars).then(function(response){
				console.log("response:",response);

				// update list
					self.load_section(section_tipo)
			})

		return true
	};//end set_original_duplicate





};//end tool_sort
