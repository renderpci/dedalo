/*global get_label, page_globals, SHOW_DEBUG, DEDALO_LIB_BASE_URL, common, readCookie, createCookie, $, html_page, Promise*/
/*eslint no-undef: "error"*/


/**
* TOOL_EXPORT2 CLASS
*
*/
var tool_export2 = new function() {

	this.url_trigger 	= DEDALO_LIB_BASE_URL + '/tools/tool_export2/trigger.tool_export2.php?top_tipo='+page_globals.top_tipo ;
	this.source_columns = {};
	this.target_columns = {};
	this.target_ul 		= null;
	this.section_tipo 	= null;



	/**
	* INIT
	* Activate drag and drop behaviour for two columns of elements
	*/
	this.init = function(options) {

		const self = this

		self.section_tipo = options.section_tipo

		self.load_components_from_section({
			target_div 	 : document.getElementById("tool_export2_container_selector"),
			section_tipo : self.section_tipo,
			path 		 : []
		})

		$(function() {
			$("#list_target_ul").sortable({
				//connectWith : ".connectedSortable",
			  	stop 	  : function(event, ui) {
			  					// Update var target_columns
			  					//tool_export2.update_export_stored_columns_cookie(event, ui);
			  				},
			  	receive   : function(event, ui) {
				  				console.log("event:",event);
				  				console.log("ui:",ui.item[0]);

				  				//const item = ui.item[0]
				  				//const data = JSON.parse(item.dataset.column)
								//
				  				//const section_label = common.create_dom_element({
								//	element_type 	: "div",
								//	class_name  	: "item_section_label",
								//	inner_html 		: data.section_label
								//})

								//item.insertBefore(section_label, item.firstChild);

				  					//$('.col').equalHeight();
				  					//console.log("equalHeight receive");
			  				},
			  	create    : function(event, ui) {
			  					//$('.col').equalHeight();
			  					//console.log("equalHeight create");
			  				}
			}).disableSelection();
		});

		// Keydown listener
			window.addEventListener("keydown", function (e) {
				// enter key
					if (e.keyCode===13) {
						const button_export = document.getElementById("button_export")
						if (button_export) button_export.click()
					}
			})

		return

		// source list
			const ar_columns  = options.ar_columns

			const list_container = self.build_list({
				ar_columns 		: ar_columns,
				section_tipo 	: options.section_tipo,
				section_label 	: options.section_label
			})

			const list_selector = document.getElementById("list_selector")
			list_selector.appendChild(list_container)

		// target list
			// Start sortable
			$(function() {
				$("#list_target_ul").sortable({
					//connectWith : ".connectedSortable",
				  	stop 	  : function(event, ui) {
				  					// Update var target_columns
				  					//tool_export2.update_export_stored_columns_cookie(event, ui);
				  				},
				  	receive   : function(event, ui) {
				  				console.log("event:",event);
				  				console.log("ui:",ui.item[0]);

				  				const item = ui.item[0]
				  				const data = JSON.parse(item.dataset.column)


				  				const section_label = common.create_dom_element({
									element_type 	: "div",
									class_name  	: "item_section_label",
									inner_html 		: data.section_label
								})

								item.insertBefore(section_label, item.firstChild);

				  					//$('.col').equalHeight();
				  					//console.log("equalHeight receive");
				  				},
				  	create    : function(event, ui) {
				  					//$('.col').equalHeight();
				  					//console.log("equalHeight create");
				  				}
				}).disableSelection();
			});

		return

		// Keydown listener
			window.addEventListener("keydown", function (e) {

				// enter key
					if (e.keyCode===13) {
						const button_export = document.getElementById("button_export")
						if (button_export) {
							button_export.click()
						}
					}
			})

		// Select ul target_list and store
			tool_export2.target_ul 	  = document.getElementById('target_list');
			tool_export2.section_tipo = tool_export2.target_ul.dataset.section_tipo;

		// Read and parse cookie export_stored_columns if esits
			const export_stored_columns = JSON.parse(readCookie('export_stored_columns'));
			if (export_stored_columns) {

				var i=0;for(var tipo in export_stored_columns) {
			        //console.log(tipo);
			        // Select element from left column
			        var li = document.querySelectorAll('[data-tipo="'+tipo+'"]')[0];

			        // Move li element from source to target ul
			        if(li) {
			        	tool_export2.target_ul.appendChild(li); i++;
			        }
			    }
			   	if(SHOW_DEBUG===true) console.log("Moved li elements: "+i);

			    // Set var tool_export2.target_columns with cookie value
				tool_export2.target_columns = export_stored_columns;
			}

		// Start sortable
			$(function() {
				$( "#source_list" ).sortable({
				  connectWith : ".connectedSortable",
				  	stop 	  : function(event, ui) {
				  					// Update var target_columns
				  					//tool_export2.update_export_stored_columns_cookie(event, ui);
				  				},
				  	receive   : function(event, ui) {
				  					//$('.col').equalHeight();
				  					//console.log("equalHeight receive");
				  				},
				  	create    : function(event, ui) {
				  					//$('.col').equalHeight();
				  					//console.log("equalHeight create");
				  				}
				}).disableSelection();
			});

		return true
	}//end init



	/**
	* GET_AR_COLUMNS
	* @return promise js_promise
	*//*
	this.get_ar_columns = function(options) {

		const section_tipo 			= options.section_tipo
		const from_component_tipo 	= options.from_component_tipo

		const trigger_url  = tool_export2.url_trigger
		const trigger_vars = {
			mode 				: 'get_ar_columns',
			section_tipo 		: section_tipo,
			from_component_tipo : from_component_tipo
		}
		const js_promise = common.get_json_data(trigger_url, trigger_vars).then(function(response) {
			console.log("[get_ar_columns] response:",response);

			return response
		})

		return js_promise
	};//end get_ar_columns
	*/



	/**
	* BUILD_LIST
	* @return
	*//*
	this.build_list = function(options) {

		const self = this

		const ar_columns 	= options.ar_columns
		const section_tipo 	= options.section_tipo
		const section_label = options.section_label || 'section_label'

		const columns_list = common.create_dom_element({
			element_type 	: "div",
			class_name  	: "columns_list"
		})

		// section list
			const section_list_div = common.create_dom_element({
				element_type 	: "div",
				class_name  	: "section_list_div",
				parent 			: columns_list
			})

		// section label
			const section_label_div = common.create_dom_element({
				element_type 	: "div",
				class_name  	: "section_label",
				inner_html 		: SHOW_DEBUG ? section_label + " " + section_tipo : section_label,
				parent 			: section_list_div
			})
			if (section_tipo!==self.section_tipo) {
				section_label_div.addEventListener("click", function(e){
					section_list_div.remove()
				})
			}

		// ul list
			const ul = common.create_dom_element({
				element_type 	: "ul",
				//id 				: "source_list",
				class_name  	: "source_list connectedSortable", // connectedSortable
				parent 			: section_list_div
			})

			const ar_columns_length = ar_columns.length
			for (let i = 0; i < ar_columns_length; i++) {

				const column = ar_columns[i]

				// li
					const li = common.create_dom_element({
						element_type 	: "li",
						class_name  	: column.have_childrens ? "have_childrens" : "",
						data_set 		: {
							column : JSON.stringify(column)
						},
						inner_html 		: SHOW_DEBUG ? column.label + " " + column.tipo : column.label,
						parent 			: ul
					})

				// have_childrens arrow
					if (column.have_childrens) {
						const arrow = common.create_dom_element({
							element_type 	: "span",
							class_name  	: "arrow_down",
							parent 			: li
						})
						.addEventListener("click", function(e){
							//e.stopPropagation()

							// selected class reset and add
								const li_options = this.parentNode.parentNode.querySelectorAll("li")
								for (let i = li_options.length - 1; i >= 0; i--) {
									li_options[i].classList.remove("selected")
								}
								this.parentNode.classList.add("selected")

							// load columns from trigger
								self.get_ar_columns({
									section_tipo 		: column.target_section_tipo,
									from_component_tipo : column.tipo
								}).then(function(response){

									// clean container
										while (target_container.firstChild) {
											target_container.removeChild(target_container.firstChild);
										}

									// build new selected list
										const list = self.build_list({
											ar_columns 		: response.result,
											section_tipo 	: column.target_section_tipo,
											section_label 	: column.target_section_label
										})
										target_container.appendChild(list)

									// activate_sortable
										self.activate_sortable()
								})
						})
					}
			}//end for (let i = 0; i < ar_columns_length; i++)

		// target_container (where user select section will be loaded on click)
			const target_container = common.create_dom_element({
				element_type 	: "div",
				class_name  	: "target_container",
				parent 			: columns_list
			})

		// activate_sortable
			self.activate_sortable()

		return columns_list
	};//end build_list
	**/



	/**
	* ACTIVATE_SORTABLE
	* @return
	*//*
	this.activate_sortable = function() {

		// Start sortable
			$(function() {

				$(".source_list").sortable({
					connectWith : ".connectedSortable",
				  	stop 	  : function(event, ui) {
				  					// Update var target_columns
				  					//tool_export2.update_export_stored_columns_cookie(event, ui);
				  				},
				  	receive   : function(event, ui) {
				  					//$('.col').equalHeight();
				  					//console.log("equalHeight receive");
				  				},
				  	create    : function(event, ui) {
				  					//$('.col').equalHeight();
				  					//console.log("equalHeight create");
				  				}
				}).disableSelection();

			});


		return true
	};//end activate_sortable
	*/



	/**
	* UPDATE_EXPORT_STORED_COLUMNS_COOKIE
	* Iterate all target ul childNodes and update cookie value
	* Triggered on drag elements and on sort elements
	*/
	this.update_export_stored_columns_cookie = function( event, ui ) {

		// TARGET : Read all target container and store elements ordered as vieweved now
			tool_export2.target_columns = {}; // Reset always
			const len = tool_export2.target_ul.childNodes.length
			for (var i = 0; i < len; i++) {

				const tipo = tool_export2.target_ul.childNodes[i].dataset.tipo;
				tool_export2.target_columns[tipo] = 1;
			}

		createCookie( 'export_stored_columns', JSON.stringify(tool_export2.target_columns), 365 );

		return true
	}//end update_export_stored_columns_cookie



	/**
	* EXPORT_DATA
	*/
	this.export_data = function(button) {

		const table_data_preview  		= document.getElementById('table_data_preview')
		const download_file 			= document.getElementById('download_file')
		const download_file_link 		= document.getElementById('download_file_link')
		const select_encoding 			= document.getElementById('select_encoding_export')
		const select_data_format 		= document.getElementById('select_data_format_export')
		const wrap_div 					= document.getElementById('wrap_tool_export2')

		const columns = [...document.getElementById('list_target_ul').querySelectorAll('li')].map(item => JSON.parse(item.dataset.path))
			//console.log("columns:",columns);

		// trigger vars
			const trigger_url  = tool_export2.url_trigger
			const trigger_vars = {
				mode 			: 'export_data',
				columns 		: columns, // readCookie('export_stored_columns'),
				section_tipo 	: tool_export2.section_tipo,
				encoding  	 	: 'UTF-8',// select_encoding.value,
				data_format 	: select_data_format.value
			}
			console.log(trigger_vars);

		// Add overlay
			html_page.loading_content( wrap_div, 1 );

		// AJAX request
			const js_promise = common.get_json_data(trigger_url, trigger_vars).then(function(response) {
					if(SHOW_DEBUG===true) {
						console.log("[tool_export2.export_data] response",response);
						//html_page.loading_content( wrap_div, 0 );
					}

					if (response && response.result) {
						if (response.result===true) {

							// Download link
								download_file_link.setAttribute('href', response.url);
								download_file.style.display = 'block'

							// Download link excel
								const download_file_link_excel = document.getElementById('download_file_link_excel')
								const download_file_link_html = document.getElementById('download_file_link_html')
								if (response.data_format==="dedalo") {
									// hide button link excel
									download_file_link_excel.classList.add("hide")
									download_file_link_html.classList.add("hide")

								}else{
									download_file_link_excel.classList.remove("hide")
									download_file_link_excel.setAttribute('href', response.url_excel);

									download_file_link_html.classList.remove("hide")
									download_file_link_html.setAttribute('href', response.url_html);
								}

							// Table preview
							table_data_preview.innerHTML = response.table;

						}else{
							table_data_preview.innerHTML = "Error on export data. \n"+response.msg;
						}
					}else{
						if (response) {
							table_data_preview.innerHTML = "Error on export data. \n"+response.msg;
						}else{
							table_data_preview.innerHTML = "Null response is received !"
							console.warn("[tool_export2.export_data] response",response);
						}
					}

					// Remove overlay
					html_page.loading_content( wrap_div, 0 );

					// Scrool to preview table
					$('html, body').animate({
									        scrollTop: $(table_data_preview).offset().top -0
									    }, 400);

			}, function(error) {
					console.log("[tool_export2.export_data] Error",error)
					// Remove overlay
					html_page.loading_content( wrap_div, 0 );
			});


		return js_promise;
	}//end export_data



	/**
	* ACTIVE_ALL_COLUMNS
	* @return bool
	*/
	this.active_all_columns = function(button) {

		const self = this

		const ul_source_list = document.getElementById("source_list")
		const ul_target_list = document.getElementById("target_list")


   		// Get all source list nodes
   			const source_ar_li = ul_source_list.querySelectorAll("li")
   			const source_ar_li_length = source_ar_li.length
   			if (source_ar_li_length>0) {

   				const js_promise = new Promise(function(resolve) {
			   		// Move element from source to target ul
			   			for (var i = 0; i < source_ar_li_length; i++) {
			   				ul_target_list.appendChild(source_ar_li[i])
			   			}

			   		resolve(true)
			   	})

			   	js_promise.then(function(){
					// Update cookie state
						self.update_export_stored_columns_cookie()
				})
   			}

   		return true
	}//end active_all_columns



	/**
	* UNACTIVE_ALL_COLUMNS
	* @return
	*/
	this.unactive_all_columns = function() {

		const self = this

		const ul_source_list = document.getElementById("source_list")
		const ul_target_list = document.getElementById("target_list")

		// Get all source list nodes
   			const target_ar_li 		  = ul_target_list.querySelectorAll("li")
   			const target_ar_li_length = target_ar_li.length
   			if (target_ar_li_length>0) {

   				const js_promise = new Promise(function(resolve) {

					// Move element from source to target ul
			   			for (var i = 0; i < target_ar_li_length; i++) {
			   				ul_source_list.appendChild(target_ar_li[i])
			   			}

			   		resolve(true)
				})

				js_promise.then(function(){
					// Update cookie state
						self.update_export_stored_columns_cookie()
				})

   			}

   		return true
	}//end unactive_all_columns




	/************************* FROM SEARCH2 **************************************************************/



	/**
	* LOAD_COMPONENTS_FROM_SECTION
	* Create the lef list of components to show in components selector
	* User can drag and drop components from this list to search canvas (at center of page)
	* @param object options
	*	string options.section_tipo
	*	dom object options.target_div
	*	array options.path
	* @return promise
	*/
	this.load_components_from_section = function(options) {

		const self = this

		// options
			const target_div 	= options.target_div || null
			const section_tipo 	= options.ar_real_section_tipo || options.section_tipo
			const path 			= options.path

		// Wrap div
			const wrap_div = target_div || document.getElementById("search2_container_selector")

		// Spinner loading on
			html_page.loading_content( wrap_div, 1 );

		// Trigger vars
			const trigger_url  = DEDALO_LIB_BASE_URL + '/search/trigger.search2.php' // self.url_trigger
			const trigger_vars = {
					mode 	 	 : "get_components_from_section",
					section_tipo : section_tipo
				};	//console.log("[search2.load_components_from_section] trigger_vars", trigger_vars); return;

		// Promise JSON XMLHttpRequest
			const js_promise = common.get_json_data(trigger_url, trigger_vars).then(function(response){
				if (SHOW_DEBUG===true) {
					if (response) {
						console.log("[search2.load_components_from_section] response:",response);
						//console.log("[search2.load_components_from_section] response "+response.msg +" "+ response.debug.exec_time, response);
					}
				}

				if (!response) {
					// Notify to log messages in top of page
					console.error("[search2.load_components_from_section] Error. response is null", response)
				}else{
					// Dom create html
					self.build_components_list(response.result, wrap_div, path)
				}//end if (!response)

				wrap_div.style.display = "flex"

				// Spinner loading off
					html_page.loading_content( wrap_div, 0 );
			}, function(error) {
				console.log("[search2.load_components_from_section] Error.", error);
				// Spinner loading off
					html_page.loading_content( wrap_div, 0 );
			})


		return js_promise
	};//end load_components_from_section



	/**
	* BUILD_COMPONENTS_LIST
	* Create dom elements to generate list of components and section groups of current section
	* @see this.load_components_from_section
	* @param array ar_components
	*	Array of component and section groups elements
	* @param dom object target_div
	*	Target dom element on new data will be added
	* @param array path
	*	Cumulative array of component path objects
	*
	* @return bool
	*/
	this.build_components_list = function(ar_components, target_div, path) {

		const self = this

		// Clean target_div
			while (target_div.hasChildNodes()) {
				target_div.removeChild(target_div.lastChild);
			}

		// Fisrts item check
			if (typeof ar_components[0]==="undefined") {
				console.error("Error on build_components_list. Empty ar_components",ar_components);
				return false
			}

		// Div container
			const top_parent = common.create_dom_element({
				element_type	: 'div',
				class_name 	 	: "search_section_container",
				//data_set 		: {section_tipo:section_tipo},
				parent 		    : target_div
			})

		// Div target_container
			const target_container = common.create_dom_element({
				element_type	: 'div',
				class_name 	 	: "search_section_container target_container",
				//data_set 		: {section_tipo:section_tipo},
				parent 		    : target_div
			})


		let last_section_group_tipo
		let section_group
		let last_section_tipo

		const len = ar_components.length
		for (let i = 0; i < len; i++) {
			const component = ar_components[i]

				if(component.section_tipo!==last_section_tipo){
					// section title bar
					let section_bar = common.create_dom_element({
						element_type : 'div',
						parent 		 : top_parent,
						class_name 	 : "search_section_bar_label ",
						inner_html 	 : component.section_label
					})
					section_bar.addEventListener("click", function(e){
						//this.parentNode.parentNode.innerHTML = ""
						if (target_div.classList.contains("target_container")) {
							target_div.innerHTML = ""
						}

					}, false);
				}

			// SECTION GROUP (build only on changes)
				if (component.section_group_tipo!==last_section_group_tipo) {
					// Section group container (ul)
					section_group = common.create_dom_element({
						element_type : 'ul',
						parent 		 : top_parent
					})
					// Section group label (li)
					common.create_dom_element({
						element_type : 'li',
						parent 		 : section_group,
						class_name 	 : "search_section_group_label",
						inner_html 	 : component.section_group_label
					})
				}

			// LI ELEMENT
				let element
				// Calculated path (from dom position)
				let calculated_component_path = self.calculate_component_path( component, path )

				switch(component.has_subquery) {

					case true :

						let class_names 				= "search_component_label has_subquery"
						let has_subquery_event_function = null
						let has_subquery_graggable 		= false
						if (component.modelo_name==="component_autocomplete") {
							// Autocompletes only
							// Pointer to open "children" section (portals and aurocompletes)
							// Builds li element
							has_subquery_event_function = [
												{'type':'dragstart','name':'tool_export2.on_dragstart'}
												,{'type':'dragend','name':'tool_export2.on_drag_end'}
												,{'type':'drop','name':'tool_export2.on_drop'}
											 ]
							class_names = "search_component_label has_subquery element_draggable"
							has_subquery_graggable = true
						}
						// Portals only
						// Pointer to open "children" section (portals and aurocompletes)
						// Builds li element
						element = common.create_dom_element({
							element_type 			: 'li',
							parent 		 			: section_group,
							class_name 	 			: class_names,
							inner_html 				: component.component_label,
							draggable 	 			: has_subquery_graggable,
							data_set 				: { path : JSON.stringify(calculated_component_path),
														modelo_name : component.modelo_name
													  },
							custom_function_events	: has_subquery_event_function
						})
						// Event on click load "children" section inside target_container recursively
						let target_section  = component.target_section[0] // Select first only
						element.addEventListener("click", function(e){

							//let calculated_component_path = self.calculate_component_path( component, path )
							// component_tipo : component.component_tipo
							self.load_components_from_section({ section_tipo : target_section,
															    target_div 	 : target_container,
															    path 		 : calculated_component_path,
															  })
							// Reset active in current wrap
							let ar_active_now = top_parent.querySelectorAll("li.active")
							let len = ar_active_now.length
							for (let i = len - 1; i >= 0; i--) {
								ar_active_now[i].classList.remove('active');
							}
							// Active current
							this.classList.add('active');
						}, false);
						break;

					default:
						// Regular component
						// Builds li element
						let event_function = [
												 {'type':'dragstart','name':'tool_export2.on_dragstart'}
												,{'type':'dragend','name':'tool_export2.on_drag_end'}
												,{'type':'drop','name':'tool_export2.on_drop'}
											 ]

						element = common.create_dom_element({
							element_type 			: 'li',
							parent 		 			: section_group,
							class_name 	 			: "search_component_label element_draggable",
							inner_html 				: component.component_label,
							draggable 	 			: true,
							data_set 				: { path 		: JSON.stringify(calculated_component_path),
														modelo_name : component.modelo_name
													  },
							custom_function_events	: event_function
						})
						break;
				}

				if(SHOW_DEBUG===true) {
					element.addEventListener("click", function(e){
						console.log("calculated_component_path:",calculated_component_path);
					}, false);
				}


			// Fix current section_group_tipo
			last_section_group_tipo = component.section_group_tipo
			last_section_tipo 		= component.section_tipo
		}//end for (let i = 0; i < ar_components.length; i++)


		// Scroll window to top always
		window.scrollTo(0, 0);


		return true
	};//end build_components_list



	/**
	* CALCULATE_COMPONENT_PATH
	* Resolve component full search path. Used to build json_search_object and
	* create later the filters and selectors for search
	* @param object element
	*	Contains all component data collected from trigger
	* @param array path
	*	Contains all paths prom previous click loads
	* @return array component_path
	*	Array of objects
	*/
	this.calculate_component_path = function(component_data, path) {

		if (!Array.isArray(path)) {
			console.log("[tool_export2.calculate_component_path] Fixed bad path as array! :",path);
			path = []
		}

		const calculate_component_path = []

		// Add current path data
		const path_len = path.length
		for (let i = 0; i < path_len; i++) {
			calculate_component_path.push(path[i])
		}

		// Add component path data
		calculate_component_path.push({
			section_tipo 	: component_data.section_tipo,
			component_tipo 	: component_data.component_tipo,
			modelo  		: component_data.modelo_name,
			name  			: component_data.component_label
		})

		return calculate_component_path
	};//end calculate_component_path



	/**
	* ONDRAG_START
	* Get element dataset path as event.dataTransfer from selected component
	* @return bool true
	*/
	this.on_dragstart = function(obj, event) {
		event.stopPropagation();

		event.dataTransfer.effectAllowed = 'move';
		event.dataTransfer.setData('text/plain', obj.dataset.path); //

		return true
	};//end on_dragstart



	this.on_dragend = function(obj, event) {
		event.stopPropagation();

		event.dataTransfer.effectAllowed = 'move';
		event.dataTransfer.setData('text/plain', obj.dataset.path);

		return true
	};//end on_dragend



	/**
	* ON_DROP
	* Get data path from event.dataTransfer and call to build required component html
	* @return bool true
	*/
	this.on_drop = function(target_obj, event) {
		event.preventDefault(); // Necessary. Allows us to drop.
		event.stopPropagation();

		const self = this

		const path 		  = event.dataTransfer.getData('text/plain');// element thats move
		const wrap_target = target_obj 	 // element on user leaves source wrap

		// Build build_target_item html
		const li = self.build_target_item(path);
		wrap_target.appendChild(li)

		return true
	};//end on_drop


	/**
	* ALLOWDROP
	* @return
	*/
	this.allowDrop = function(ev) {
		ev.preventDefault();
	};//end allowDrop


	/**
	* BUILD_TARGET_ITEM
	* @return
	*/
	this.build_target_item = function(path) {

		const ar_path 		 = JSON.parse(path)
		const ar_path_length = ar_path.length
		//const last_item 	 = ar_path[ar_path_length - 1]
		//const name 			 = last_item.name;

		// li
			const li = common.create_dom_element({
				element_type 	: "li",
				class_name  	: "",
				dataset 		: {
					path : path
				}
			})

		// close button
			const close = common.create_dom_element({
				element_type 	: "span",
				class_name  	: "close",
				inner_html 		: "x",
				parent 			: li
			}).addEventListener("click", function(e){
				e.stopPropagation()
				li.remove()
			})

		// section_tipo info
			if(SHOW_DEBUG===true) {
				const pre_name_dom = common.create_dom_element({
					element_type 	: "span",
					class_name  	: "pre_name",
					inner_html 		: ar_path.map(e => e.section_tipo+" : "+e.component_tipo).join(" > ")+"<br>",
					parent 			: li
				})
			}

		// name label
			const name_dom = common.create_dom_element({
				element_type 	: "span",
				class_name  	: "name",
				inner_html 		: ar_path.map(e => e.name).join(" : "),
				parent 			: li
			})


		return li
	};//end build_target_item




}//end class
