/**
* SEARCH2
*
*
*
*/
var search2 = new function() {


	"use strict";


	/**
	* OBJECT VARS
	*/
		this.url_trigger = DEDALO_LIB_BASE_URL + '/search/trigger.search2.php'

		this.search_presets_section_tipo = "dd623" // Search Presets

		this.search_layout_state

		this.initied = false

		this.search_panel_is_open = false

		this.modo = null
		// 	main_object is the JSON object used for init the search
		this.main_object
		// call back on submit search
		this.search_callback
		// layout_map of the select for procesing the columns of the result of the search
		this.ar_list_map
		// get the components in the result_query_object with a concrect mode, by default parse_mode = list
		this.parse_mode 
		// search_options_store . Store current sections search options var
		//this.search_options_store = {}



	/**
	* INIT
	* Set and configure default options for search
	*
	* options:
			{	"section_tipo" 			: section_tipo,
				# temp_filter = presets of the user
				"temp_filter" 			: encodeURIComponent(temp_filter),
				"modo" 					: modo,
				"ar_real_section_tipo" 	: ar_real_section_tipo || null,
				# thesaurus mode
				"ar_sections_by_type"	: ar_sections_by_type
				}
	#postion the script / node into the dom				
	current_node: document.currentScript

	* @return 
	*/
	this.init = function(options, current_node) {

		const self = this

		if(SHOW_DEBUG===true) {
			console.log("!search2 initied with options:" ,options)
		}

		// Wrapper node
			const wrapper_node = (current_node.nodeName === 'SCRIPT') ? current_node.parentNode : current_node
			
		self.search_callback 	= options.search_callback || null;
		self.ar_list_map 		= options.ar_list_map || null;
		self.parse_mode 		= options.parse_mode || 'list';
		self.main_object 		= options;

		// search_options_store
			const section_tipo = options.section_tipo
			//self.search_options_store[section_tipo] = options.search_options

		// parse_html
			self.parse_html(wrapper_node).then(function(response){
		
				self.modo = options.modo || "list"			
				const global_container 				= document.getElementById("search2_global_container")
				const search_wrap	 	 			= document.getElementById("search2_container_selector")
				const container_selection 			= document.getElementById("search2_container_selection")
				const container_presets   			= document.getElementById("search2_container_selection_presets")
				const thesaurus_search_selector   	= document.getElementById("thesaurus_search_selector")
				
				// If already initilized, hide search panel and return
				/*if (search2.initied===true) {
					// Hide search panel and stop
					self.toogle_search_panel()
					return false;
				}
				*/
				// Set search panel as opened
				//self.track_show_search_panel({action:"close",section_tipo:section_tipo})

				// Read cookie to auto open search_panel
					/*
				if(search2.cookie_track("search_panel")===true) {
					// Open search panel
					self.track_show_search_panel({action:"open",section_tipo:section_tipo})
				}else{
					self.track_show_search_panel({action:"close",section_tipo:section_tipo})
				}
				*/

				// LEFT SIDE
				// Get initial list of components and load into search_wrap
				self.load_components_from_section({
						target_div   		 : search_wrap,
						section_tipo 		 : section_tipo,
						ar_real_section_tipo : options.ar_real_section_tipo,
						path 		 		 : []
					})/*.then(function(){
						// Show hidden div container		
						global_container.style.display = "flex"
					})*/

				// RIGHT SIDE
				// Load user presets list
				const component_presets_promise = self.get_component_presets({target_section_tipo : section_tipo}).then(function(){
						// Show hidden div container		
						//global_container.style.display = "flex"

						if(search2.cookie_track("search_panel")===true) {
						// Open search panel
							global_container.style.display = "flex"

							// Thesaurus mode case
							if (self.modo==="thesaurus") {
								thesaurus_search_selector.style.display = "block"
							}
						}else{
							global_container.style.display = "none"

								// Thesaurus mode case
							if (self.modo==="thesaurus") {
								thesaurus_search_selector.style.display ="none"
							}
						}
					})


				// Set initial state as unchanged
				self.update_state({state:'unchanged'})


				// Check if exists previous user search options stored		
				// Decode encoded string
				const temp_filter_string = decodeURIComponent(options.temp_filter)
					//console.log("temp_filter_string:",temp_filter_string);
					
				if (temp_filter_string.length>10) {
					
					const filter_obj = JSON.parse(temp_filter_string)	
					
					if(SHOW_DEBUG===true) {
						//console.log("[search2.init] **** FILTER:",filter_obj);
					}
					
					// Parse filter in DOM
					self.parse_json_query_obj_to_dom(null, filter_obj, {allow_duplicates:true})

					if(SHOW_DEBUG===true) {
						console.log("[search2.init] Loaded from previous filter_obj:",filter_obj)
					}			
				}else{

					// When components presets are loaded, try lo load default preset
					component_presets_promise.then(function(){

						const loaded_default_preset = self.load_default_preset()
						if(SHOW_DEBUG===true) {
							if (loaded_default_preset===true) {
								console.log("[search2.init] Loaded default preset. ",loaded_default_preset);
							}else{
								console.log("[search2.init] Failed load default preset. No default preset found. ",loaded_default_preset);
							}					
						}			

						// If no default preset found, do fallback to empty root group
						if (loaded_default_preset===false) {
							
							// Read cookie to track preset selected for current section
							//let current_cookie_track = self.cookie_track("search_presets")
							//if (current_cookie_track===false) {
								// Builds root search_group at dom when not is defined a default	
								self.build_search_group( document.getElementById("search_group_container"), {
									operator : "$and",
									is_root  : true
								})
								if(SHOW_DEBUG===true) {
									console.log("[search2.init] Created fallback root search_group (no previous options or presets found)");
								}	
							//}
						}
					})//end promise then
				}


				// Read cookie to auto open search_presets_panel
				const cookie_name_panel 	= "search_presets_open_panel"
				const cookie_value_panel 	= readCookie(cookie_name_panel) || "false"
				if (cookie_value_panel==="true") {
					container_presets.style.display = "block"
				}

				// Read cookie to auto open fields_open_panel
				const cookie_name_fields 	= "fields_open_panel"
				const cookie_value_fields 	= readCookie(cookie_name_fields) || "false"
				if (cookie_value_fields==="true") {
					search_wrap.style.display = "flex"			 
				}
				
				// Set as initied
				search2.initied = true

				// Set as opened (search panel)
				//self.search_panel_is_open = true

				return true
			})//end parse_html promise

	};//end init



	/**
	* PARSE_HTML
	* process the JSON recived 
	*/
	this.parse_html = function(wrapper_node){

		const self = this
	
		const main_object = self.main_object
		
		const js_promise = new Promise(function(resolve, reject) {

			//create the buton of the filter
				const btn_filter = common.create_dom_element({
								id 					: 'open_search2_button',
								element_type		: 'div',
								parent				: wrapper_node,
								class_name			: 'btn btn-default btn-sm button_open_search2',
								text_content		: get_label["filtro"],
								})
						//add the Even onchage to the select, whe it change the section selected will be loaded
						btn_filter.addEventListener('click',function(){
							self.toogle_search_panel()
						},false)

			//if the modo is thesaurus the filter need build a selector of the sections that can be searchables
			// build one select and one checbox
			if (main_object.modo ==='thesaurus'){

				const ar_sections_by_type = main_object.ar_sections_by_type //decodeURIComponent(main_object.ar_sections_by_type)

				const thesaurus_search_selector = common.create_dom_element({
								id 					: 'thesaurus_search_selector',
								element_type		: 'div',
								parent				: wrapper_node,
								})
					const thesaurus_typology_selector = common.create_dom_element({
								id 					: 'thesaurus_typology_selector',
								element_type		: 'select',
								parent				: thesaurus_search_selector,
								class_name			: 'form-control',
								})
						//add the Even onchage to the select, whe it change the section selected will be loaded
						thesaurus_typology_selector.addEventListener('change',function(){
							self.show_sections_checkboxes(this.value, ar_sections_by_type)
						},false)


						// asign the options to the select
							for (const propierty in ar_sections_by_type) {

								const typology_id 	= ar_sections_by_type[propierty][0].typology;				
								const typology_name = ar_sections_by_type[propierty][0].typology_name;

								const select_option = common.create_dom_element({
											element_type		: 'option',
											parent				: thesaurus_typology_selector,
											value				: typology_id,
											inner_html			: typology_name
											})

							}
					const thesaurus_search_selector_ul = common.create_dom_element({
								id 					: 'thesaurus_search_selector_ul',
								element_type		: 'ul',
								parent				: thesaurus_search_selector,
								})

					self.init_tipology_selector({"ar_data_string":ar_sections_by_type})

			}

			//create the global_container 
				const global_container 	= common.create_dom_element({
								id 					: 'search2_global_container',
								element_type		: 'div',
								class_name			: 'display:none',
								parent				: wrapper_node								
								})

				//create the button_save_preset
					const button_save_preset 	= common.create_dom_element({
									id 					: 'button_save_preset',
									element_type		: 'button',
									parent				: global_container,
									class_name			: 'btn btn-danger btn-sm',
									text_content		: get_label["salvar"]+' '+get_label["cambios"],
									})
						//add the Even onchage to the select, whe it change the section selected will be loaded
						button_save_preset.addEventListener('click',function(){
							self.save_preset(this)
						},false)

				//create the toggle_container_selector
				// FIELDS SELECTOR search2_container_selector. Where section fields list are loaded
					const toggle_container_selector 	= common.create_dom_element({
									id 					: 'toggle_container_selector',
									element_type		: 'div',
									parent				: global_container,
									text_content		: get_label["campos"],
									})
						//add the Even onchage to the select, whe it change the section selected will be loaded
						toggle_container_selector.addEventListener('click',function(){
							self.toggle_fields(this)
						},false)

				//create the search2_container_selector
					const search2_container_selector = common.create_dom_element({
									id					: 'search2_container_selector',
									element_type		: 'div',
									parent				: global_container,
									inner_html			: 'search2_container_selector',
									})

				//create the search2_container_selection
				//CANVAS SELECTION search2_container_selection. Where dragged fields are dragged and stored
					const search2_container_selection = common.create_dom_element({
									id					: 'search2_container_selection',
									element_type		: 'div',
									parent				: global_container,
									})
							const search_group_container = common.create_dom_element({
									id					: 'search_group_container',
									element_type		: 'div',
									parent				: search2_container_selection,
									})

				//create the search2_container_selection_presets
				//PRESETS SELECTION_PRESETS search2_container_selection_presets. List of stored selection presets
					const search2_container_selection_presets = common.create_dom_element({
									id					: 'search2_container_selection_presets',
									element_type		: 'div',
									parent				: global_container,
									dataset 			: {'section_tipo':main_object.section_tipo},
									})
							const component_presets_label = common.create_dom_element({
									element_type		: 'div',
									parent				: search2_container_selection_presets,
									class_name 			: 'component_presets_label',
									inner_html			: get_label["presets_de_busqueda"],
									})
								const button_new_preset = common.create_dom_element({
										id 					: 'button_new_preset',
										element_type		: 'span',
										parent				: component_presets_label,
										class_name 			: 'button_plus',
										inner_html			: '+',
										})
									button_new_preset.addEventListener('click',function(){
										self.new_preset(this)
									},false)
					//create the  new_preset_div
						const new_preset_div = common.create_dom_element({
										id					: 'new_preset_div',
										element_type		: 'div',
										parent				: search2_container_selection_presets,
										class_name 			: 'div_edit',
										})
					//create the  component_presets_list
						const component_presets_list = common.create_dom_element({
										id					: 'component_presets_list',
										element_type		: 'ul',
										parent				: search2_container_selection_presets,
										})

				//create the toggle_container_selection_presets
					const toggle_container_selection_presets = common.create_dom_element({
										id					: 'toggle_container_selection_presets',
										element_type		: 'div',
										parent				: global_container,
										inner_html			: get_label["preset"],
										})
						toggle_container_selection_presets.addEventListener('click',function(){
										self.toggle_presets(this)
									},false)

			resolve(true)
		})

		return js_promise
	}//end parse_html



	/**
	* TRACK_SHOW_SEARCH_PANEL
	* @return 
	*/
	this.track_show_search_panel = function(options) {

		// Read cookie to auto open search_panel
			let cookie_name_search_panel  = "search_panel"
			let cookie_value_search_panel = readCookie(cookie_name_search_panel) || '{}'
				cookie_value_search_panel = JSON.parse(cookie_value_search_panel)

		if (options.action==="open") {
			// Open
			// Set search panel as opened
			cookie_value_search_panel[options.section_tipo] = true
			createCookie(cookie_name_search_panel, JSON.stringify(cookie_value_search_panel), 365)

		}else{
			// Close
			// Set search panel as closed
			cookie_value_search_panel[options.section_tipo] = false
			createCookie(cookie_name_search_panel, JSON.stringify(cookie_value_search_panel), 365)
		}
		
		return true
	};//end track_show_search_panel



	/**
	* TOOGLE_SEARCH_PANEL
	* @return bool
	*/
	this.toogle_search_panel = function() {
		
		const self = this
		
		const global_container = document.getElementById("search2_global_container")	

		const search2_container_selection_presets = document.getElementById("search2_container_selection_presets")
		const section_tipo = search2_container_selection_presets.dataset.section_tipo

		if (global_container.style.display!=="none") {

			if(SHOW_DEBUG===true) {
				return false;
			}
			global_container.style.display = "none"
			// Set search panel as closed
			self.track_show_search_panel({action:"close",section_tipo:section_tipo})

			// Thesaurus mode case
			if (self.modo==="thesaurus") {
				let thesaurus_search_selector = document.getElementById("thesaurus_search_selector")
					thesaurus_search_selector.style.display = "none"
			}

			self.search_panel_is_open = false
		}else{
			global_container.style.display = "flex"
			// Set search panel as opened
			self.track_show_search_panel({action:"open",section_tipo:section_tipo})

			// Thesaurus mode case
			if (self.modo==="thesaurus") {
				let thesaurus_search_selector = document.getElementById("thesaurus_search_selector")
					thesaurus_search_selector.style.display = "block"
			}

			self.search_panel_is_open = true
		}

		return false;
	};//end toogle_search_panel



	/**
	* GET_LIMIT
	* @return int limit
	*/
	this.get_limit = function() {
		
		let limit = 10

		// Get current search_query_object to obtain current limit
			const table_rows_list = document.querySelector(".table_rows_list")		
				
		if (table_rows_list!==null) {

			let search_options_string = table_rows_list.dataset.search_options
			if (search_options_string.length>1) {
				// Decode encoded string
					search_options_string = decodeURIComponent(search_options_string)

				// search_options get from dataset
					const search_options 		= JSON.parse(search_options_string)
					const search_query_object 	= search_options.search_query_object
					limit 						= parseInt(search_query_object.limit)
			}else{
				// Empty case
					console.error("Empty search_options data.", table_rows_list.dataset)
			}
		}

		return limit
	};//end get_limit



	/**
	* UPDATE_STATE
	* @return bool true
	*/
	this.update_state = function(options) {

		if(SHOW_DEBUG===true) {
			console.log("[search2.update_state] options:",options);
		}
		
		const self = this

		self.search_layout_state = options
			//console.log("self.search_layout_state:",self.search_layout_state);

		// Store current editing section_id in search2_container_selection_presets dataset
			const search2_container_selection_presets = document.getElementById("search2_container_selection_presets")
			const button_save_preset 				  = document.getElementById("button_save_preset")

		if (self.modo==="thesaurus") {			
			button_save_preset.classList.add("in_thesaurus")
		}

		// editing_section_id set
			if (options.editing_section_id) {
				// Set dataset section_id
				search2_container_selection_presets.dataset.section_id 		= options.editing_section_id	
				// Set dataset save_arguments
				search2_container_selection_presets.dataset.save_arguments 	= options.editing_save_arguments
			}

		const editing_section_id = search2_container_selection_presets.dataset.section_id
		//const editing_section_id = self.loaded_preset ? self.loaded_preset.section_id : null
		
		if (button_save_preset) {
			if (options.state==="changed" && editing_section_id) {
				// Show save preset button			
				button_save_preset.classList.add("show")
			}else{
				// Hide save preset button
				button_save_preset.classList.remove("show")
			}			
		}

		if (options.state==="changed") {

			const section_tipo = search2_container_selection_presets.dataset.section_tipo
			// Save temp preset 
			self.save_temp_preset(section_tipo)
			if(SHOW_DEBUG===true) {
				console.log("[search2.update_state] Saved tem preset of section: ",section_tipo);
			}
		}
				

		return true
	};//end update_state


	
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
	
		// Wrap div
			let wrap_div
			if (options.target_div) {
				wrap_div = options.target_div
			}else{
				wrap_div = document.getElementById("search2_container_selector") // Default container
			}
		
		// section_tipo
			let section_tipo = null
			if(options.ar_real_section_tipo){ // && options.ar_real_section_tipo.length>0
				section_tipo = options.ar_real_section_tipo
			}else{
				section_tipo = options.section_tipo
			}

		/*
		if (options.toggle===false) {
			// Always load data

		}else{
			// Normal behaviour
			if (wrap_div.innerHTML.length>0) {
				// Clean target_div
				while (wrap_div.hasChildNodes()) {
					wrap_div.removeChild(wrap_div.lastChild);
				}
				return false
			}
		}*/

		// Spinner loading on
			html_page.loading_content( wrap_div, 1 );

		// Trigger vars
			const trigger_url  = self.url_trigger
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
					self.build_components_list(response.result, wrap_div, options.path)
				}//end if (!response)
				
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

		//let section_tipo  = ar_components[0].section_tipo

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
												{'type':'dragstart','name':'search2.on_dragstart'}
												,{'type':'dragend','name':'search2.on_drag_end'}
												,{'type':'drop','name':'search2.on_drop'}
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
												{'type':'dragstart','name':'search2.on_dragstart'}
												,{'type':'dragend','name':'search2.on_drag_end'}
												,{'type':'drop','name':'search2.on_drop'}
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
			console.log("[search2.calculate_component_path] Fixed bad path as array! :",path);
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
	* GET_COMPONENT_PRESETS
	* Call to trigger and get data of all presets available for current section and user
	* @return promise
	*/
	this.get_component_presets = function(options) {

		const self = this

		const wrap_div = document.getElementById("component_presets_list")

		// Spinner loading on
			html_page.loading_content( wrap_div, 1 )
		
		// Trigger vars
			const trigger_url  = self.url_trigger
			const trigger_vars = {
					mode 	 			: "get_component_presets",
					target_section_tipo : options.target_section_tipo
				}
				//console.log("[search2.get_component_presets] trigger_vars", trigger_vars);		

		// Promise JSON XMLHttpRequest
			const js_promise = common.get_json_data(trigger_url, trigger_vars).then(function(response){
				if (SHOW_DEBUG===true) {
					if (response) {
						console.log("[search2.get_component_presets] response:",response);
						//console.log("[search2.get_component_presets] response "+response.msg +" "+ response.debug.exec_time, response);
					}
				}

				if (!response) {
					// Notify to log messages in top of page
					console.error("[search2.get_component_presets] Error. response is null", response)
				}else{			

					// Dom create html
					self.build_component_presets_list(response.result, wrap_div, response.permissions, options.target_section_tipo)
				}//end if (!response)
				
				// Spinner loading off
					html_page.loading_content( wrap_div, 0 )
			}, function(error) {
				console.log("[search2.get_component_presets] Error.", error);
				// Spinner loading off
					html_page.loading_content( wrap_div, 0 )
			})


		return js_promise
	};//end get_component_presets



	/**
	* BUILD_COMPONENT_PRESETS_LIST
	* Auxiliar function to create dom elements needed for build components presets list
	* @return bool
	*/
	this.build_component_presets_list = function(ar_elements, wrap_div, permissions, target_section_tipo) {

		const self = this

		// Clean wrap_div
			while (wrap_div.hasChildNodes()) {
				wrap_div.removeChild(wrap_div.lastChild);
			}

		// Firts item check
			if (typeof ar_elements[0]==="undefined") {
				console.warn("[search2.build_component_presets_list] Warning. Empty ar_elements received",ar_elements);
				/*
				// When empty, set base root config	
				// Clean deleted preset
				let search_group_container = document.getElementById("search_group_container")
					while (search_group_container.hasChildNodes()) {
						search_group_container.removeChild(search_group_container.lastChild);
					}
				// Builds root search_group at dom		
				self.build_search_group( search_group_container, {
					operator : "$and",
					is_root  : true				
				})
				if(SHOW_DEBUG===true) {
					console.log("[search2.build_component_presets_list] Created default empty root search group (empty ar_elements)")
				}
				*/
				return false
			}

		// Read cookie to track preset selected
			const cookie_name 				= "search_presets"
			let cookie_value 				= readCookie(cookie_name) || '{}'
				cookie_value 				= JSON.parse(cookie_value)
			let current_cookie_track 		= cookie_value[target_section_tipo] || false
				//return console.log("current_cookie_track:",current_cookie_track);

		let is_default = false
		const len = ar_elements.length
		for (let i = 0; i < len; i++) {

			let element = ar_elements[i]
			
			if(current_cookie_track===false) {
				// Default is defined by record data
				if (element.default===true && is_default===false) {
					is_default = true
				}else{
					is_default = false
				}				
			}else{
				// Default is defined by user selection (cookie)
				if (current_cookie_track==element.section_id) {
					is_default = true
					/*
					// Load current preset
					self.parse_json_query_obj_to_dom(null, JSON.parse(element.json_preset))
		
					// Update state
					self.update_state({
						state 					: 'unchanged',
						editing_section_id 		: element.section_id,
						editing_save_arguments 	: element.save_arguments
					})
					*/
				}else{
					is_default = false
				}
			}

			// Builds li element
				const li_element = common.create_dom_element({
					element_type 	: 'li',
					parent 		 	: wrap_div,
					class_name 	 	: (is_default===true) ? "selected" : "",
					data_set 		: {
						section_id  	: element.section_id,
						json_preset 	: element.json_preset,
						save_arguments 	: element.save_arguments
					}
				})
				// Button load preset (<)
				const icon_load = common.create_dom_element({
					element_type 			: 'span',
					parent 		 			: li_element,
					class_name 	 			: "icon_bs link component_presets_button_load"
				})
				icon_load.addEventListener("click",function(e){
					self.load_search_preset(this)
				},false)

				// Button edit preset (options)
				/*
				if (permissions>=2) {
				let icon_options = common.create_dom_element({
					element_type 			: 'span',
					parent 		 			: li_element,
					class_name 	 			: "icon_bs link component_presets_button_options"
				})
				icon_options.addEventListener("click",function(e){
					self.edit_preset(this)
				},false)
				}*/

				// Span label name
				const span_name = common.create_dom_element({
					element_type 			: 'span',
					parent 		 			: li_element,
					text_content 			: element.name,
					class_name 	 			: "css_span_dato",
					data_set 				: {
						parent 	 	 : element.section_id,
						section_tipo : "dd623",						
						tipo 	 	 : "dd624"
					}
				})
				if (permissions>=2) {
					span_name.addEventListener("click",function(e){
						self.edit_preset(this)
					},false)
				}

				// Button delete preset
				if (permissions>=2) {
				const icon_delete = common.create_dom_element({
					element_type 			: 'span',
					parent 		 			: li_element,
					class_name 	 			: "icon_bs link component_presets_button_delete"
				})
				icon_delete.addEventListener("click",function(e){
					self.delete_preset(this)
				},false)
				}

				// DIV edit
				const div_edit = common.create_dom_element({
					element_type 			: 'div',
					parent 		 			: li_element,
					class_name 	 			: "div_edit"
				})
		}//end for (var i = 0; i < ar_elements.length; i++)


		return true
	};//end build_component_presets_list



	/**
	* LOAD_DEFAULT_PRESET
	* @return bool
	*/
	this.load_default_preset = function(wrap_div) {

		const self = this
		
		const ul = document.getElementById("component_presets_list")
		const li = ul.querySelector("li.selected")
		if (li) {

			const json_preset 	 = li.dataset.json_preset
			const section_id 	 = li.dataset.section_id
			const save_arguments = li.dataset.save_arguments

			self.parse_json_query_obj_to_dom(null, JSON.parse(json_preset), {allow_duplicates:true})
			
			// Update state
			self.update_state({
				state 					: 'unchanged',
				editing_section_id 		: section_id,
				editing_save_arguments 	: save_arguments
			})

			return true

		}else{

			return false
		}
	};//end load_default_preset



	/**
	* ONDRAG_START
	* Get element dataset path as event.dataTransfer from selected component
	* @return bool true
	*/
	this.on_dragstart = function(obj, event) {
		event.stopPropagation();
		
		event.dataTransfer.effectAllowed = 'move';
		event.dataTransfer.setData('text/plain', obj.dataset.path);

		return true	
	};//end ondrag_start



	/**
	* ON_DRAGENTER
	*/
	this.on_dragenter = function(obj, event) {

		//console.log("dragenter");
	};//end on_dragenter



	/**
	* ON_DRAGOVER
	*/
	this.on_dragover = function(obj, event) {
		event.preventDefault(); 
		event.stopPropagation();
		//console.log("dragover");
		//event.dataTransfer.dropEffect = 'move';  // See the section on the DataTransfer object.

		// Add drag_over class
		//	obj.classList.add('drag_over')		
	};//end on_dragover



	/**
	* ON_DRAGLEAVE
	*/
	this.on_dragleave = function(obj, event) {

		//console.log("dragleave");
		//obj.classList.remove('drag_over')		
	};//end on_dragleave



	/**
	* ON_DROP
	* Get data path from event.dataTransfer and call to build required component html
	* @return bool true
	*/
	this.on_drop = function(obj, event) {
		event.preventDefault(); // Necessary. Allows us to drop.
		event.stopPropagation();

		const path 		  = event.dataTransfer.getData('text/plain');// element thats move
		const wrap_target = obj 	 // element on user leaves source wrap
		
		// Build component html
		search2.build_search_component(wrap_target, path);

		// Set as changed
		search2.update_state({state:'changed'})


		return true
	};//end on_drop



	/**
	* LOAD_SEARCH_PRESET
	* Onclick arrow button in search presets list, load jquery preset from db and apply to current canvas
	* @return true
	*/
	this.load_search_preset = function(button_obj) {

		const self = this

		const li 		  	 = button_obj.parentNode 
		const json_object 	 = JSON.parse(li.dataset.json_preset)
		const section_id  	 = li.dataset.section_id
		const save_arguments = JSON.parse(li.dataset.save_arguments)

		self.parse_json_query_obj_to_dom( button_obj, json_object, {allow_duplicates:true} )


		const search2_container_selection_presets 	= document.getElementById("search2_container_selection_presets")
		const section_tipo 							= search2_container_selection_presets.dataset.section_tipo

		// Set cookie
		// Save cookie to track preset selected
		const cookie_name 				= "search_presets"
		let cookie_value 				= readCookie(cookie_name) || '{}'
			cookie_value 				= JSON.parse(cookie_value)
			cookie_value[section_tipo]  = section_id
			createCookie(cookie_name, JSON.stringify(cookie_value), 365)

		// Re-Load user presets list
		// self.get_component_presets({target_section_tipo : section_tipo})
		
		// Reset all selections		
		const all_selected = li.parentNode.childNodes
		const len = all_selected.length
			for (let i = len - 1; i >= 0; i--) {
				all_selected[i].classList.remove("selected")
			}
		// Select current
		li.classList.add("selected")

		// Set initial state as unchanged
		self.update_state({
				state 			   		: 'unchanged',
				editing_section_id 		: section_id,
				editing_save_arguments 	: save_arguments
			})


		return true
	};//end load_search_preset



	/**
	* BUILD_SEARCH_GROUP
	* @return dom object
	*/
	this.build_search_group = function(parent_div, options) {
	
		const self = this

		// Create defaults when no received options
			if (typeof options==="undefined") {
				options = {
					operator : '$and',
					is_root  : false
				}
			}

		// Check already created root_search_group
			if (options.is_root===true && document.getElementById("root_search_group")) {
				return false
			}

		const counter 			  = self.calculate_search_group_counter()		 
		const event_function 	  = [{'type':'dragstart','name':'search2.on_dragstart'}
									,{'type':'dragend','name':'search2.on_drag_end'}
									,{'type':'drop','name':'search2.on_drop'}
									,{'type':'dragenter','name':'search2.on_dragenter'}
									,{'type':'dragover','name':'search2.on_dragover'}
									,{'type':'dragleave','name':'search2.on_dragleave'}]								  
	
		// search_group
			const search_group = common.create_dom_element({
				element_type 			: 'div',
				parent 		 			: parent_div,
				class_name 	 			: "search_group",
				data_set 				: {id:counter},
				custom_function_events	: event_function,
				id 						: options.is_root ? 'root_search_group' : null
			})
	
		// Add operator
			const search_group_operator = common.create_dom_element({
				element_type 			: 'div',
				parent 		 			: search_group,
				//text_content 			: options.operator.slice(1) + " "+counter,
				text_content 			: self.localize_operator(options.operator)+ " ["+counter+"]",
				data_set 				: { value : options.operator },
				class_name 	 			: "operator search_group_operator" + (options.operator==="$and" ? " and" : " or")
			})
			search_group_operator.addEventListener("click",function(e){
				//console.log("Clicked search_group_operator:",search_group_operator );
				self.toggle_operator_value(this)
				// Set initial state as unchanged
				self.update_state({state:'changed'})
			},false)

		// Add button close
			if (options.is_root===false) {
			const search_group_button_close = common.create_dom_element({
				element_type 			: 'span',
				parent 		 			: search_group,
				//text_content 			: "X",
				class_name 	 			: "button_close"
			})
			search_group_button_close.addEventListener("click",function(e){
				self.remove_dom_component(search_group)
				// Set as changed
				self.update_state({state:'changed'})
			},false)
			}

		// Add button + group
			const search_group_button_plus = common.create_dom_element({
				element_type 			: 'span',
				parent 		 			: search_group,
				//text_content 			: "X",
				class_name 	 			: "button_plus"
			})
			search_group_button_plus.addEventListener("click",function(e){
				self.add_search_group_to_dom(this, search_group)
				// Set as changed
				self.update_state({state:'changed'})
			},false)


		if (options.is_root===true) {
			/*
				// MUTATION OBSERVER

				// select the target node
				//var target = document.getElementById('search2_container_selection');
				 
				// create an observer instance
				var observer = new MutationObserver(function(mutations) {
				    mutations.forEach(function(mutation) {
				        console.log(mutation);
				    });    
				});
				 
				// configuration of the observer:
				var config = { attributes: false, childList: true, subtree: false }
				 
				// pass in the target node, as well as the observer options
				observer.observe(search_group, config);
				*/

			/*let search2_container_selection = document.getElementById("search2_container_selection")
				// Save preset button
				let button_save_preset = common.create_dom_element({
					element_type 			: 'button',
					id 						: "button_save_preset",
					parent 		 			: search2_container_selection,
					text_content 			: get_label["salvar"] + " " + get_label["cambios"],
					class_name 	 			: "btn btn-danger", // btn-sm btn-block
					custom_function_events	: [{'type':'click','name':'search2.save_preset'}]
				})*/
	
			// Add Send and reset buttons
				const search_group_container = document.getElementById("search_group_container")

				// max group
					const max_group = common.create_dom_element({
						element_type 			: "div",
						parent 		 			: search_group_container,
						class_name 	 			: "max_group"
					})
				// max label
					const max_input_label = common.create_dom_element({
						element_type 			: "span",
						parent 		 			: max_group,
						text_content 			: "max", // get_label["max"]
						class_name 	 			: "max_input_label"
					})	
				// max input
					const max_default = (SHOW_DEBUG===true) ? 10 : 10
					const max_input = common.create_dom_element({
						element_type 			: "input",
						parent 		 			: max_group,
						value 					: max_default, // default 10
						class_name 	 			: "max_input" // btn css_max_rows
					})
				// load_rows event updates max_input value from search_options in dataset
					window.addEventListener('load_rows',function(){
						max_input.value = self.get_limit()
					})				
				// resert group
					const reset_group = common.create_dom_element({
						element_type 			: "div",
						parent 		 			: search_group_container,
						class_name 	 			: "reset_group"
					})
				// Reset button
					const reset_button = common.create_dom_element({
						element_type 			: "button",
						parent 		 			: reset_group,
						text_content 			: get_label["recargar"], //"Reset",
						class_name 	 			: "btn btn-warning button_reset",					
					})
					reset_button.addEventListener("click", function(e){
						self.reset()
					}, false)
				// Show all
					const show_all_button = common.create_dom_element({
						element_type 			: "button",
						parent 		 			: reset_group,
						text_content 			: get_label["mostrar_todos"], //"mostrar_todos",
						class_name 	 			: "btn btn-warning button_reset button_show_all",					
					})
					show_all_button.addEventListener("click", function(e){
						self.show_all(this)
					}, false)
				// Submit button
					const submit_button = common.create_dom_element({
						id 						: "button_submit",
						element_type 			: "button",
						parent 		 			: search_group_container,
						text_content 			: get_label["aplicar"], //"Submit",
						class_name 	 			: "btn btn-success button_submit"
					})
					submit_button.addEventListener("click", function(e){
						const search_json_object = self.get_search_json_object()
						search2.search(this, search_json_object).then(function(){
							// Close search div
							self.toogle_search_panel()
						})
					},false)
		}//end if (options.is_root===true)

		return search_group
	};//end build_search_group



	/**
	* BUILD_SEARCH_COMPONENT
	* @return dom object
	*/
	this.build_search_component = function(parent_div, path_plain, current_value, q_operator) {
		
		const self = this

		const path 		 = JSON.parse(path_plain)
		const last_item  = path[path.length-1]
		const first_item = path[0]
	
		// Create dom element before load html from trigger
		// search_component
		const search_component = common.create_dom_element({
			element_type 			: 'div',
			parent 		 			: parent_div,
			class_name 	 			: "search_component",
			data_set 				: { path : path_plain },
			style 					: { display :"none" }		
		})

		// Load component script / css
		//component_common.load_component_class()

		const js_promise	= self.get_component_html({
								section_tipo 	: last_item.section_tipo,
								component_tipo 	: last_item.component_tipo,
								section_id 		: null,
								current_value 	: current_value,
								q_operator 		: q_operator || null
			}).then(function(response){								
				
				const component_html = response
				
				// Inject component html
				search_component.innerHTML = component_html

				// Run inside scripts
				// Run scripts after dom changes are finish
				//setTimeout(function(){
					exec_scripts_inside(search_component);
				//},1)
				

				//search_component.addEventListener("click",function(e){
				//	console.log("Clicked search_component:",search_component );
				//},false)

				// Add operator
				//let search_component_operator = common.create_dom_element({
				//	element_type 			: 'div',
				//	parent 		 			: search_component,
				//	text_content 			: "AND",
				//	data_set 				: { value : "$and" },
				//	class_name 	 			: "operator search_component_operator"
				//})
				//search_component_operator.addEventListener("click",function(e){
				//	console.log("Clicked search_component_operator:",search_component_operator );
				//},false)

				// Add button close
				const search_component_button_close = common.create_dom_element({
					element_type 			: 'span',
					parent 		 			: search_component,
					//text_content 			: "X",
					class_name 	 			: "button_close"
				})
				search_component_button_close.addEventListener("click",function(e){
					self.remove_dom_component(search_component)
					// Set as changed
					self.update_state({state:'changed'})
				},false)

				// Add label component source if exists
				if (first_item!==last_item) {
					//console.log("first_item:",first_item);					
					const label_add = search_component.querySelector("span.label_add")
						if (label_add) {
							label_add.innerHTML = first_item.name +" "+ label_add.innerHTML
						}
				}

				// Check update_component_with_value_state
				// If component have any value or q_operator, set style with different color to remark it
				component_common.update_component_with_value_state( search_component.querySelector("div.wrap_component") )
				
				//search_component.style.display = "block"
				$(search_component).fadeIn(250) 
			})


		return js_promise
	};//end build_search_component



	/**
	* GET_COMPONENT_HTML
	* @return promise 
	*/
	this.get_component_html = function(options) {

		const self = this
					
		// Load component from trigger
		const trigger_vars = {
				mode 		: "load_components",
				components 	: [
				{
					component_tipo 	: options.component_tipo,
					section_tipo 	: options.section_tipo,
					section_id 		: options.section_id,
					current_value 	: options.current_value,
					q_operator 		: options.q_operator,
					modo 			: 'search'// modo: search | edit
				}
				]
		}
		//console.log("trigger_vars:",trigger_vars); //return;
		
		// PROMISE JSON XMLHttpRequest // return new Promise
		return new Promise(function(resolve, reject) {

			common.get_json_data(self.url_trigger, trigger_vars).then(function(response){

				let component_html
				if (response) {
					component_html = response.result
				}else{
					component_html = "Error on load component " + options.component_tipo
				}//end if (!response)

				resolve(component_html)	
				
			}, function(error) {
				console.log("[search2.get_component_html] Error.", error)
				reject(Error("There was a network error. statusText:" + error));	
			})
		})
	};//end get_component_html



	/**
	* REMOVE_DOM_COMPONENT
	* @return 
	*/
	this.remove_dom_component = function(element) {

		element.parentNode.removeChild(element);
	};//end remove_dom_component



	/**
	* CALCULATE_SEARCH_GROUP_COUNTER
	* @return 
	*/
	this.calculate_search_group_counter = function() {
		
		const all_search_groups = document.getElementById("search_group_container").querySelectorAll(".search_group")
		const total  			= all_search_groups.length 		
		const counter 		  	= total + 1


		return counter
	};//end calculate_search_group_counter



	/**
	* PARSE_DOM_TO_JSON_FILTER
	* @return object json_query_obj
	*/
	this.parse_dom_to_json_filter = function(options) {

		const self = this

		const json_query_obj = {
			id 		: "temp",
			filter 	: {}
		}
		
		// First level
			const root_search_group = document.getElementById("root_search_group")

		// Add arguments. Used to exclude search arguments on save preset in this mode
			let add_arguments = true // Default is true
			if ( typeof options.save_arguments!=="undefined" && (options.save_arguments==="true" || options.save_arguments==="false")) {
				add_arguments = JSON.parse(options.save_arguments)
			}
			//console.log("++ parse_dom_to_json_filter options.save_arguments:",options.save_arguments, " - add_arguments:", add_arguments);

		// Mode. Used to indicate that q values for search must be converted to usable search values by the components (search)			
			const mode = (options.mode) ? options.mode : 'default'

		// Calculate recursively all groups inside
			const filter_obj = this.recursive_groups(root_search_group, add_arguments, mode)
			if(SHOW_DEBUG===true) {
				//console.log("++ filter_obj: ", JSON.stringify(filter_obj));
			}

		// Add object with groups fo filter array
			json_query_obj.filter = filter_obj


		return json_query_obj
	};//end parse_dom_to_json_filter



	/**
	* RECURSIVE_GROUPS
	* @return object query_group
	*/
	this.recursive_groups = function(group_dom_obj, add_arguments, mode) {

		const self = this
	
		const operator = self.get_search_group_operator(group_dom_obj)

		const query_group = {}
			  query_group[operator] = []
		
		// elements inside
		// let ar_elements = group_dom_obj.querySelectorAll(":scope > .search_component,:scope > .search_group") // 
		const ar_elements = group_dom_obj.children
		const len = ar_elements.length
		for (let i = 0; i < len; i++) {

			const element = ar_elements[i]

			if( element.classList.contains('search_component') ) {

				// Q . Search argument
				// Get value from component wrapper dataset (previously fixed on change value)
				let q 			= null
				let q_operator 	= null
				// Get wrapper. From element_childrens (nodelilst converted to array)
				if (add_arguments!==false) {
					const element_childrens = [].slice.call(element.childNodes)
					const div_childrens 	= element_childrens.filter(current_node => current_node.nodeName === "DIV")
					const wrapper 			= div_childrens[0]
						if (wrapper && typeof(wrapper.dataset.dato)!=="undefined" ) {
							q = JSON.parse(wrapper.dataset.dato)
		
							// Check if current component have specific search value from dato
							if (mode==="search") {
								let component_name = wrapper.dataset.component_name
								if (typeof window[component_name].get_search_value_from_dato === 'function') {
									// Component specific format to search
									q = window[component_name].get_search_value_from_dato(q)

								}else{
									// Generic format (component_common)
									q = window["component_common"].get_search_value_from_dato(q)	

								}
							}
						}
						if (wrapper && wrapper.dataset.q_operator) {
							try{
								q_operator = JSON.parse(wrapper.dataset.q_operator)
							}catch(err){
								q_operator = wrapper.dataset.q_operator
							}
						}
				}

				// Add component
				if (mode==="search") {
					// Add only if not empty
					if ( (q && q.length>0 && q!=='[]') || (q_operator && q_operator.length>0) ) {
						// If empty q but not q_operator, set q as 'only_operator' for avoid send empty q value
						if( (!q || q.length===0 || q==='[]') && (q_operator && q_operator.length>0) ) {
							q = "only_operator"
						}						
						query_group[operator].push({
							q 	 		: q,
							q_operator 	: q_operator,
							path 		: JSON.parse(element.dataset.path)
						})											
					}
				}else{
					// Add always
					query_group[operator].push({
						q 	 		: q,
						q_operator 	: q_operator,
						path 		: JSON.parse(element.dataset.path)
					})					
				}				

			}else if (element.classList.contains('search_group') ) {

				// Chek if contain components
				//const ar_search_components = element.querySelectorAll(".search_component")
				//if (ar_search_components.length>0) {

					// Check if all components have empty values. If not, add
					/* let values_obj = self.recursive_groups(element, add_arguments, mode)					
					for (let opkey in values_obj) {
						if (values_obj[opkey].length>0) {
							// Add group
							query_group[operator].push( self.recursive_groups(element, add_arguments, mode) )
							break; // Only one is expected
						}						
					} */
					// Add group
					query_group[operator].push( self.recursive_groups(element, add_arguments, mode) )								
				//}
			}
		}
		//console.log("query_group:",query_group);

		return query_group
	};//end recursive_groups



	/**
	* GET_SEARCH_GROUP_OPERATOR
	* @return string search_group_operator (Like '$and' | '$or')
	*/
	this.get_search_group_operator = function(search_group) {

		let operator_value = '$and' // Default (first level)

		// Get search_group direct childrens
		const childrens = search_group.children
			//console.log("childrens:",childrens);

		// Iterate to find .search_group_operator div
		const len = childrens.length
		for (let i = 0; i < len; i++) {
			if(childrens[i].classList.contains('search_group_operator')) {	
				operator_value = childrens[i].dataset.value;
				break;
			}
		}

		return operator_value
	};//end get_search_group_operator



	/**
	* PARSE_JSON_QUERY_OBJ_TO_DOM
	* @return bool
	*/
	this.parse_json_query_obj_to_dom = function(button_obj, json_object, options) {

		const self = this
		
		//const json_object = JSON.parse('{"$and":[{"$or":[{"$and":[{"$or":[{"$and":[{"q":null,"path":[{"section_tipo":"rsc167","component_tipo":"rsc175"}]},{"q":null,"path":[{"section_tipo":"rsc167","component_tipo":"rsc53"}]},{"q":null,"path":[{"section_tipo":"rsc167","component_tipo":"rsc26"}]},{"$and":[{"q":null,"path":[{"section_tipo":"rsc167","component_tipo":"rsc23"}]}]}]}]}]}]},{"$or":[{"$and":[{"$or":[{"$and":[{"q":null,"path":[{"section_tipo":"rsc167","component_tipo":"rsc175"}]},{"q":null,"path":[{"section_tipo":"rsc167","component_tipo":"rsc53"}]}]}]}]}]}]}')
		//	console.log("json_object:",json_object);
		//	console.log("json_object string:",JSON.stringify(json_object));

		// First level
			const search_group_container = document.getElementById("search_group_container")		
	
		// Clean target_div
			while (search_group_container.hasChildNodes()) {
				search_group_container.removeChild(search_group_container.lastChild);
			}		
		
		// Reset resolved
			this.ar_resolved_elements = []
	
		// Build global_group 
			const clean_q 		 	= (options && options.clean_q) ? options.clean_q : false
			const allow_duplicates 	= (options && options.allow_duplicates) ? options.allow_duplicates : false
			self.build_dom_group(json_object, search_group_container, {
				is_root 		 : true,
				clean_q 		 : clean_q,
				allow_duplicates : allow_duplicates
			})
			//console.log("global_group:",global_group);

		return true
	};//end parse_json_query_obj_to_dom



	/**
	* BUILD_DOM_GROUP
	* @return 
	*/
	this.ar_resolved_elements = []
	this.build_dom_group = function(json_object, dom_element, options) {

		const self = this
		
		let   dom_group 		= null
		const allow_duplicates 	= (options && options.allow_duplicates) ? options.allow_duplicates : false
	
		for (let key in json_object) {						
				
			// Case is component, only add when key is path				
			if (key==='path') {

				let current_value 	= json_object.q
					//console.log("current_value:",current_value, json_object);
				let q_operator 		= json_object.q_operator
					//console.log("q_operator:",json_object);

				// Resolved check (useful for sequences or split strings)
					const resolved_string = JSON.stringify(json_object.path) + current_value
					if (self.ar_resolved_elements.indexOf(resolved_string)===-1) {

						if (options.clean_q===true) {
							current_value 	= ''
							q_operator 		= ''
						}
					
						// Add. If not already resolved, add
							self.build_search_component( dom_element, JSON.stringify(json_object.path), current_value, q_operator)

						// Set as resolved
							if (allow_duplicates!==true) {
								self.ar_resolved_elements.push(resolved_string)
							}
					}

			}else
			// If key contains $ is a group
			if (key.indexOf('$')!==-1) {

				// Case is group
					const ar_data = json_object[key]			
					//console.log("key,ar_data:",key,ar_data);

				// Build dom search_group
					const current_search_group = self.build_search_group( dom_element, {
						operator : key,
						is_root	 : options.is_root ? options.is_root : false
					})

				// Recursions
					const ar_data_len = ar_data.length
					for (let i = 0; i < ar_data_len; i++) {
						const current_json_object = ar_data[i]
						options.is_root = false
						self.build_dom_group(current_json_object, current_search_group, options)
					}
			}			
		}


		return dom_group
	};//end build_dom_group



	/**
	* GET_COMPONENT_OPERATOR
	* @return string component_operator (Like '$and' | '$or')
	*//*
	this.get_component_operator = function(search_component) {

		let childrens = search_component.childNodes
			console.log("childrens:",childrens);
		
		let search_component_operator 	= search_component.querySelector(".search_component_operator")
		let operator_value 	  			= search_component_operator.dataset.value

		return operator_value
	};//end get_component_operator*/



	/**
	* GET_SECTION_GROUP_COMPONENTS_DATA
	* @return 
	*//*
	this.get_section_group_components_data = function(search_group_container) {
		
		let section_group_components_data = []

		let ar_components = search_group_container.querySelectorAll(":scope > .search_component")
		const len = ar_components.length
		for (var i = 0; i < len; i++) {
			let component = ar_components[i]
			section_group_components_data.push({
				path : JSON.parse(component.dataset.path)
			})
		}


		return section_group_components_data
	};//end get_section_group_components_data
	*/



	/**
	* ADD_SEARCH_GROUP_TO_DOM
	* Called from event click in button + inside every search_group for
	* create another search_grou inside
	* @return bool true
	*/
	this.add_search_group_to_dom = function(button_obj, parent) {
		
		const self = this

		if (typeof parent==="undefined") {
			// Default is root search_group_container
			parent = document.getElementById("search_group_container")
		}

		self.build_search_group( parent )

		return true
	};//end add_search_group_to_dom



	/**
	* TOGGLE_OPERATOR_VALUE
	* @return 
	*/
	this.toggle_operator_value = function(element) {

		const self = this

		const text 	  = element.innerHTML
		const ar_text = text.split(" ");
		const number  = ar_text[1]
		
		if (element.dataset.value==="$and") {
			// Replace dataset value
			element.dataset.value = "$or";			
			
			// Inject new html value
			element.innerHTML = self.localize_operator(element.dataset.value) + " " + number

			element.classList.remove("and")
			element.classList.add("or")

		}else{
			// Replace dataset value
			element.dataset.value = "$and";			
			
			// Inject new html value
			element.innerHTML = self.localize_operator(element.dataset.value) + " " + number

			element.classList.remove("or")
			element.classList.add("and")
		}

		return true
	};//end toggle_operator_value



	/**
	* NEW_PRESET
	* Creates a temp presets section to collect fileds data and save a new preset
	* @return promise
	*/
	this.new_preset = function(button_obj) {

		const self = this

		if (typeof button_obj==="undefined") {
			button_obj = document.getElementById("button_new_preset")
		}
					
		// Load component from trigger
		const section_tipo 	= self.search_presets_section_tipo //"dd623" // Search Presets
		const section_id 	= "tmp"

		const new_preset_div = document.getElementById("new_preset_div")
		if (new_preset_div.innerHTML.length>0) {
			// Clean
			while (new_preset_div.hasChildNodes()) {
				new_preset_div.removeChild(new_preset_div.lastChild);
			}
			button_obj.innerHTML = "+";
			return false
		}

		button_obj.innerHTML = "x";

		// Reset all div_edit
		//let all_div_edit = li.parentNode.querySelectorAll('.div_edit')
		const search2_container_selection_presets 	= document.getElementById("search2_container_selection_presets")
		const all_div_edit 							= search2_container_selection_presets.querySelectorAll('.div_edit')
		const len = all_div_edit.length
		for (let i = len - 1; i >= 0; i--) {
			// Clean
			while (all_div_edit[i].hasChildNodes()) {
				all_div_edit[i].removeChild(all_div_edit[i].lastChild);
			}
		}		
					
		// Load component from trigger
		const trigger_vars = {
				mode 		: "load_components",
				components 	: [
				{
					component_tipo 	: "dd624", // Name
					section_tipo 	: section_tipo,
					section_id 		: section_id,
					modo 			: 'edit',// modo: search | edit
					clean 			: true // clean posible dato in temp sections
				},
				{
					component_tipo 	: "dd640", // Public
					section_tipo 	: section_tipo,
					section_id 		: section_id,
					modo 			: 'edit',// modo: search | edit
					clean 			: true // clean posible dato in temp sections
				},
				{
					component_tipo 	: "dd641", // Default
					section_tipo 	: section_tipo,
					section_id 		: section_id,
					modo 			: 'edit',// modo: search | edit
					clean 			: true // clean posible dato in temp sections
				},
				{
					component_tipo 	: "dd648", // Save arguments
					section_tipo 	: section_tipo,
					section_id 		: section_id,
					modo 			: 'edit',// modo: search | edit
					clean 			: true // clean posible dato in temp sections
				}
				]
		}
		//console.log("trigger_vars:",trigger_vars); return;
		
		// PROMISE JSON XMLHttpRequest
		const js_promise = common.get_json_data(self.url_trigger, trigger_vars).then(function(response){
			if(SHOW_DEBUG===true) {
				console.log("response:",response);;
			}
			
			if (response) {
				// Add component html to target div
				new_preset_div.innerHTML = response.result

				// Exec scripts of component
				exec_scripts_inside(new_preset_div)

				const button_label = (get_label["crear"] ? get_label["crear"] : "Create") + " " + (get_label["nuevo"] ? get_label["nuevo"] : "new")

				const button_new = common.create_dom_element({
					element_type 		: "button",
					parent 		 		: new_preset_div,
					class_name 	 		: "btn btn-success",
					inner_html 			: button_label
				})
				button_new.addEventListener("click",function(e){
					self.save_new_preset(this)
				},false)

			}//end if (response)

		}, function(error) {
			console.log("[search2.new_preset] Error.", error);
			html_page.loading_content( wrap_div, 0 );
		})

		return js_promise
	};//end new_preset



	/**
	* SAVE_NEW_PRESET
	* Save temporal preset section across save_preset
	* @see save_preset
	* @return true
	*/
	this.save_new_preset = function(button_obj) {
 
		const self = this	

		const input_preset_name = button_obj.parentNode.querySelector('input[type="text"]')		
		if (input_preset_name.value.length<1) {
			input_preset_name.focus()
			input_preset_name.placeholder = "Empty preset name !"
			return false
		}

		const search2_container_selection_presets = document.getElementById("search2_container_selection_presets")
		const section_tipo = search2_container_selection_presets.dataset.section_tipo

		// Fix section tipo from temporal section (dd623_tmp)
		search2_container_selection_presets.dataset.section_id = self.search_presets_section_tipo + "_" +DEDALO_SECTION_ID_TEMP

		// save_preset
		self.save_preset(button_obj, {}).then(function(response){
			console.log("[search2.save_new_preset] response:",response);

			// Close new_preset_div
			self.new_preset()
		})
        
		
		return true
	};//end save_new_preset



	/**
	* SAVE_PRESET
	* Save a full section preset
	* Builds a parsed object search from dom and send to trigger to save
	* @return promise
	*/
	this.save_preset = function(button_obj) {

		const self = this		

		const search2_container_selection_presets = document.getElementById("search2_container_selection_presets")
		const section_tipo 	 = search2_container_selection_presets.dataset.section_tipo
		const section_id 	 = search2_container_selection_presets.dataset.section_id
		const save_arguments = search2_container_selection_presets.dataset.save_arguments

		// parse_dom_to_json_filter (use save_arguments to true to save user search values)
		const json_query_obj = self.parse_dom_to_json_filter({save_arguments:save_arguments})
		
		const wrap_div = search2_container_selection_presets // document.getElementById("component_presets_list") 

		html_page.loading_content( wrap_div, 1 )

		// Save preset
		const trigger_vars = {
			mode   		 		: "save_preset",
			filter 		 		: json_query_obj.filter,
			data_section_tipo 	: section_tipo, // Like oh1 (current working section)
			preset_section_id 	: section_id // preset section_id
		}
		//return console.log("trigger_vars:",trigger_vars);

		// PROMISE JSON XMLHttpRequest
		const js_promise = common.get_json_data(self.url_trigger, trigger_vars).then(function(response){
				if(SHOW_DEBUG===true) {
					console.log("save_preset response:",response);
				}
			
				if (response && response.result!==false) {

					// Save cookie to track preset selected
					const cookie_name 				= "search_presets"
					let cookie_value 				= readCookie(cookie_name) || '{}'
						cookie_value 				= JSON.parse(cookie_value)
						cookie_value[section_tipo]  = response.result
						createCookie(cookie_name, JSON.stringify(cookie_value), 365)
					
					// Re-Load user presets list
					self.get_component_presets({target_section_tipo : section_tipo})

					// Hide button
					button_obj.classList.remove("show")

				}//end if (response)

				html_page.loading_content( wrap_div, 0 );

			}, function(error) {
				console.log("[search2.save_preset] Error.", error);
				html_page.loading_content( wrap_div, 0 );
			})
		

		return js_promise
	};//end save_preset



	/**
	* DELETE_PRESET
	* @return 
	*/
	this.delete_preset = function(button_obj) {

		const self = this
		
		// Confirm delete by user
		if (!confirm(get_label.seguro)) {
			return false
		}		

		const li		 = button_obj.parentNode
		const section_id = li.dataset.section_id

		const search2_container_selection_presets = document.getElementById("search2_container_selection_presets")
		const section_tipo = search2_container_selection_presets.dataset.section_tipo
		
		const wrap_div = search2_container_selection_presets // document.getElementById("component_presets_list") 
		html_page.loading_content( wrap_div, 1 )

		// Save preset
		const trigger_vars = {
			mode   		 : "delete_preset",
			section_id 	 : section_id
		}
		//return console.log("trigger_vars:",trigger_vars);

		// PROMISE JSON XMLHttpRequest
		const js_promise = common.get_json_data(self.url_trigger, trigger_vars).then(function(response){
				if(SHOW_DEBUG===true) {
					console.log("[search2.delete_preset] response:",response);
				}
			
				if (response && response.result!==false) {
					
					// Update state
					self.update_state({
						state 				:'unchanged',
						editing_section_id 	: null
					})

					// Save cookie to track preset selected
					const cookie_name 				= "search_presets"
					let cookie_value 				= readCookie(cookie_name) || '{}'
						cookie_value 				= JSON.parse(cookie_value)
						if (cookie_value[section_tipo]==section_id) {
							delete cookie_value[section_tipo]
							createCookie(cookie_name, JSON.stringify(cookie_value), 365);
						}								
					
					// Re-Load user presets list
					self.get_component_presets({target_section_tipo : section_tipo})

				}//end if (response)

				html_page.loading_content( wrap_div, 0 );

			}, function(error) {
				console.log("[search2.delete_preset] Error.", error);
				html_page.loading_content( wrap_div, 0 );
			})
		

		return js_promise
	}//end delete_preset



	/**
	* EDIT_PRESET
	* Load a customized presets section with all required components to edit
	* @return promise
	*/
	this.edit_preset = function(button) {

		const self = this

		const li 		= button.parentNode
		const div_edit 	= li.querySelector('.div_edit')
		let json_preset = {}
		
		if (div_edit.innerHTML.length>1) {
			// Clean
			while (div_edit.hasChildNodes()) {
				div_edit.removeChild(div_edit.lastChild);
			}
			return false;
		}

		// Reset all div_edit
		//let all_div_edit = li.parentNode.querySelectorAll('.div_edit')
		const search2_container_selection_presets 	= document.getElementById("search2_container_selection_presets")
		const all_div_edit 							= search2_container_selection_presets.querySelectorAll('.div_edit')
		const len = all_div_edit.length
		for (let i = len - 1; i >= 0; i--) {
			// Clean
			while (all_div_edit[i].hasChildNodes()) {
				all_div_edit[i].removeChild(all_div_edit[i].lastChild);
			}
		}

		const section_tipo = self.search_presets_section_tipo //"dd623" // Search Presets
					
		// Load component from trigger
		const trigger_vars = {
				mode 		: "load_components",
				components 	: [
				{
					component_tipo 	: "dd624", // Name
					section_tipo 	: section_tipo,
					section_id 		: li.dataset.section_id,
					modo 			: 'edit'// modo: search | edit
				},
				{
					component_tipo 	: "dd640", // Public
					section_tipo 	: section_tipo,
					section_id 		: li.dataset.section_id,
					modo 			: 'edit'// modo: search | edit
				},
				{
					component_tipo 	: "dd641", // Default
					section_tipo 	: section_tipo,
					section_id 		: li.dataset.section_id,
					modo 			: 'edit'// modo: search | edit
				},
				{
					component_tipo 	: "dd648", // Save arguments
					section_tipo 	: section_tipo,
					section_id 		: li.dataset.section_id,
					modo 			: 'edit'// modo: search | edit
				}
				]
		}
		//console.log("trigger_vars:",trigger_vars); return;
		
		// PROMISE JSON XMLHttpRequest
		const js_promise = common.get_json_data(self.url_trigger, trigger_vars).then(function(response){
			
			if (response) {

				// Add component html to target div
				div_edit.innerHTML = response.result

				// Exec comonents scripts
				exec_scripts_inside(div_edit)

				// Locate wrap_component_dd648 inside html and add an listerner to radio button save_arguments
				const wrapper_dd648  = div_edit.querySelector("div.wrap_component_dd648")
				const radio_buttons  = wrapper_dd648.querySelectorAll(".css_radio_button")
				for (let i = radio_buttons.length - 1; i >= 0; i--) {
					radio_buttons[i].addEventListener("change",function(e){
						//console.log("radio_button:",this, this.checked, this.value);
						if (this.checked===true) {
							let seleted_value_obj = JSON.parse(this.value)
							let save_arguments 	  = false
							if (seleted_value_obj.section_id==1) {
								save_arguments = true
							}
							// Update state
							self.update_state({
								state 					:'changed',
								editing_section_id 		: li.dataset.section_id,
								editing_save_arguments 	: save_arguments
							})
							// Update li dataset
							li.dataset.save_arguments = save_arguments
						}						
					})
				}

			}//end if (response)

		}, function(error) {
			console.log("[search2.edit_preset] Error.", error);
			html_page.loading_content( wrap_div, 0 );
		})

		return js_promise
	};//end edit_preset



	/**
	* TOGGLE_FIELDS
	* @return 
	*/
	this.toggle_fields = function(button) {

		const search2_container_selector = document.getElementById("search2_container_selector")

		// Read cookie to track state
		const cookie_name = "fields_open_panel"
	
		if (search2_container_selector.style.display!=="flex") {
			search2_container_selector.style.display = "flex"
			createCookie(cookie_name, "true", 365)
		}else{
			search2_container_selector.style.display = "none"
			createCookie(cookie_name, "false", 365)
		}

		return true
	};//end toggle_fields



	/**
	* TOGGLE_PRESETS
	* @return 
	*/
	this.toggle_presets = function(button, mode) {

		const search2_container_selection_presets = document.getElementById("search2_container_selection_presets")

		// Read cookie to track state
		const cookie_name = "search_presets_open_panel"		
	
		if (search2_container_selection_presets.style.display==="block") {
			search2_container_selection_presets.style.display = "none"
			createCookie(cookie_name, "false", 365)
		}else{
			search2_container_selection_presets.style.display = "block"
			createCookie(cookie_name, "true", 365)
		}

		return true
	};//end toggle_presets



	/**
	* CLEAN_ALL_INPUTS
	* @return 
	*/
	this.clean_all_inputs = function() {

		const self = this

		const container_selection = document.getElementById("search2_container_selection")

		// Get current search elements and convert to search_query_object
		const search_query_object = self.parse_dom_to_json_filter({})

		// Re-parse to dom with options clean_q = true
		self.parse_json_query_obj_to_dom(null, search_query_object.filter, {clean_q:true, allow_duplicates:true})

		return true
	};//end clean_all_inputs



	/**
	* RESET
	* @return bool
	*/
	this.reset = function(button_obj) {
	
		const self = this


		self.clean_all_inputs()
		return true;


		const table_rows_list = document.querySelector(".table_rows_list")
		let search_options_string = table_rows_list.dataset.search_options
		if (search_options_string.length>1) {

			// Decode encoded string
			search_options_string = decodeURIComponent(search_options_string)

			// search_options get from dataset
			let search_options = JSON.parse(search_options_string);
			
			let search_query_object = search_options.search_query_object
				//console.log("search_query_object:",search_query_object);			

			/*	
			// Re-make the search with empty params 

			// Custom reset params
			search_query_object.filter 	   = null // empty filter
			search_query_object.full_count = true
			search_query_object.order 	   = false
			search_query_object.offset 	   = 0

			// Exec a search with empty filter
			search.load_rows(search_options, table_rows_list).then(function(response){
				
			})
			// Close search div
			//search2.toogle_search_panel()
			*/
		}
		
		/*
		// Try to reload selected preset if found
		const all_presets  = document.getElementById("component_presets_list").childNodes
		const len 		   = all_presets.length
		let found_selected = false
		for (let i = 0; i < len; i++) {
			if (all_presets[i].classList.contains("selected")) {				
				//let button = all_presets[i].querySelector(".component_presets_button_load")
				//	button.click()
				//found_selected = true; 
				// remove class
				all_presets[i].classList.remove("selected")
				break;
			}			
		}
		
		// If not found selected preset, build a clean root container
		if (found_selected===false) {
			let container = document.getElementById("search_group_container")
			// Clean container
			container.innerHTML = ""
			// Build root group
			search2.build_search_group( container, {
				operator : "$and",
				is_root  : true
			})
		}
		*/


		return true;
	};//end reset



	/**
	* SHOW_ALL
	* @return 
	*/
	this.show_all = function(button_obj) {

		const self = this

		if (self.modo==="thesaurus") {

			area_thesaurus.reset(button_obj)

		}else{
			
			// get the search query object
				const search_json_object = self.get_search_json_object()
			
			// set the filter to empty value
				search_json_object.filter = {"$and":[]}
			
			// do the search
				search2.search(button_obj, search_json_object).then(function(){
					// close search div
					self.toogle_search_panel()
				})
		}		
		
		return true
	};//end show_all



	/**
	* SEARCH
	* @return js_promise promise
	*/
	this.search = function(button_obj, search_json_object) {

		const self = this

		// always blur active component to force set dato (!)
			document.activeElement.blur()	

		// promise
			const js_promise = new Promise((resolve, reject) => {

				// search_json_object. Check the search_json_object 
					if (typeof search_json_object==="undefined" || !search_json_object) {
						if(SHOW_DEBUG===true) {
							console.error("[search2.search] invalid search_json_object. ", JSON.stringify(search_json_object));
						}
						reject(false)
					}
					//search_json_object = self.get_search_json_object()
					if(SHOW_DEBUG===true) {
						//console.log("[search2.search] search_json_object \n", JSON.stringify(search_json_object));
						//console.log("+++++++ Filter here:", search_json_object.filter["$and"][0])
					}

				// search_options. From 'table_rows_list' dataset
					let search_options = {}
					const table_rows_list 	  = document.querySelector(".table_rows_list")
					let search_options_string = table_rows_list.dataset.search_options
					if (search_options_string.length>1) {

						// Decode encoded string
							search_options_string = decodeURIComponent(search_options_string)

						// search_options get from dataset
							search_options = JSON.parse(search_options_string);

						// Set search oprions
							search_options.search_query_object = search_json_object

					}else{
						
						// New search options
							search_options = {
								modo 				: 'list',
								context 			: {context_name:'default'},
								search_query_object : search_json_object
							}
					}

				// modo switcher determines call 
					switch(self.modo) {

						case "json":
							// Exec database search an get the result rows 
							const url_trigger  = DEDALO_LIB_BASE_URL + '/section_records/trigger.section_records.php'
							const trigger_vars = {
									mode 	 			: 'search_rows',
									search_query_object	: search_json_object,
									result_parse_mode	: self.parse_mode, // list | edit
									ar_list_map 		: self.ar_list_map
								}

							const current_js_promise = common.get_json_data(url_trigger, trigger_vars).then(function(response){
								if (SHOW_DEBUG===true) {
									console.log("+++++ [search2.search_rows] response:",response,response.debug.exec_time);
									if (response) {
									//	console.log("[search2.search_rows] response "+response.msg +" "+ response.debug.exec_time);
									}
								}

								if (response===null || response.result===false) {
									// Notify to log messages in top of page
									console.error("[search2.search_rows] Error. response is invalid.", response);
									reject(false)
								}

								// Update search_query_object in dom dataset
									//search_options.search_query_object  = response.result.search_query_object
									//const search_options_string_updated = JSON.stringify(search_options) 
									//table_rows_list.dataset.search_options = encodeURIComponent(search_options_string_updated)
									self.update_search_options(response.result.search_query_object)

								// Launch event load_rows is done
									const event_detail 	  = {response:response}
									const load_rows_event = new CustomEvent('load_rows', {detail:event_detail})
									// launch custom event
									window.dispatchEvent(load_rows_event)

								// exec callback with the result of the search to the component /tool that init the filter search.
									if(self.search_callback !== null){
										common.execute_function_by_name(self.search_callback, window, response)									
									}

								resolve(response)
							})
							break;

						case "thesaurus":
							// Load rows with current search options
							area_thesaurus.search(search_options, button_obj).then(function(response){
								if(SHOW_DEBUG===true) {
									console.log("[search2.search] end search ", self.modo, response);
								}
							})
							resolve(true)
							break;						

						case "list":
						default:
							// Load rows with current search options
							search.load_rows(search_options, button_obj).then(function(response){
								if(SHOW_DEBUG===true) {
									console.log("[search2.search] end load_rows mode:", self.modo, " - response: ", response);
								}
							})
							resolve(true)
							break;
					}			
			})
		

		return js_promise
	};//end search



	/**
	* GET_SEARCH_JSON_OBJECT
	* Resolve and configure the final search json object used for build sql query
	* @return object search_json_object
	*/
	this.get_search_json_object = function() {

		const self = this

		// Always blur active component to force set dato Important (!)
			document.activeElement.blur()	

		// json_filter
			const json_filter = self.parse_dom_to_json_filter({
				mode : "search"
			})
		
		// global_container
			const search2_global_container 	= document.getElementById("search2_global_container")
			const max_input 				= search2_global_container.querySelector("input.max_input")
			//const select_path 			= decodeURIComponent(search2_global_container.dataset.select_path)	
			//const select 					= JSON.parse(select_path)
		
		// modo default
			const modo = "list"		

		// table_rows_list base search options
			//const search2_container_selection_presets = document.getElementById("search2_container_selection_presets")
			//const section_tipo 	= search2_container_selection_presets.dataset.section_tipo // page_globals.section_tipo
			// Changed 21-03-2018
			//if (self.modo==="json") {
				const table_rows_list 			= document.querySelector(".table_rows_list")
				const search_options  			= decodeURIComponent(table_rows_list.dataset.search_options)
				const base_search_query_object 	= JSON.parse(search_options).search_query_object
			//}else{
			//	const base_search_query_object  = self.search_options_store[]
			//}
			

			const select 					= base_search_query_object.select
			let section_tipo 	  			= base_search_query_object.section_tipo

		// Thesaurus mode
			if (self.modo==="thesaurus") {
				// Selected sections to search. From checkboxes
				const thesaurus_search_selector_ul = document.getElementById("thesaurus_search_selector_ul")
				const ar_checkboxes = thesaurus_search_selector_ul.querySelectorAll("input")
				let ar_sections = []
				const ar_checkboxes_len = ar_checkboxes.length
				for (let i = 0; i < ar_checkboxes_len; i++) {
					if(ar_checkboxes[i].checked === true) {
						ar_sections.push(ar_checkboxes[i].value)
					}
				}
				//console.log("ar_sections:",ar_sections);
				if (ar_sections.length<1) {
					alert("Please select at least one section to search")
					return false
				}
				// Replace search_query_object section with user selected values
				section_tipo = ar_sections
			}

		// Final search_json_object
		const search_json_object = {
				id 			 : base_search_query_object.id, //section_tipo + "_" + modo,
				modo 		 : modo,
				parsed 		 : false,
				section_tipo : section_tipo,
				limit 		 : parseInt(max_input.value) || 10,
				offset 		 : 0,
				type 		 : "search_json_object",
				//context 	 : {context_name:false},
				full_count   : (self.modo==="thesaurus") ? false : true,
				order 	 	 : false,
				filter 		 : json_filter.filter,
				select 		 : select
			}

		return search_json_object
	};//end get_search_json_object



	/**
	* SAVE_TEMP_PRESET
	* @return 
	*/
	this.save_temp_preset = function(section_tipo) {

		const self = this

		// Recalculate filter_obj from DOM in default mode (include components with empty values)
		const filter_obj = self.parse_dom_to_json_filter({})

		const trigger_vars = {
			mode 		 : "save_temp_preset",
			section_tipo : section_tipo,
			filter_obj 	 : filter_obj.filter
		}
		if(SHOW_DEBUG===true) {
			console.log("[search2.save_temp_preset] trigger_vars:",trigger_vars);;
		}
		
		// PROMISE JSON XMLHttpRequest
		const js_promise = common.get_json_data(self.url_trigger, trigger_vars).then(function(response){
			if (SHOW_DEBUG===true) {
				if (response) {
					//console.log("[search2.save_temp_preset] response:",response);
				}
			}

			if (!response) {
				// Notify to log messages in top of page
				console.error("[search2.save_temp_preset] Error. response is null", response)
			}else{
				// Dom create html
				
			}//end if (!response)			

		}, function(error) {
			console.log("[search2.save_temp_preset] Error.", error);
		})
		
		return false
	};//end save_temp_preset



	/**
	* COOKIE_TRACK
	* Check if cookie value for this section is true/false
	* @return bool
	*/
	this.cookie_track = function(cookie_name) {

		const search2_container_selection_presets = document.getElementById("search2_container_selection_presets")
		if (search2_container_selection_presets) {

			const section_tipo = search2_container_selection_presets.dataset.section_tipo // page_globals.section_tipo

			// Read cookie to auto open search_panel		
			let cookie_value = readCookie(cookie_name) || '{}'
				cookie_value = JSON.parse(cookie_value)
				//console.log("cookie_value:",cookie_value);
			const cookie_track = cookie_value[section_tipo] || false
			
			return cookie_track
		}

		return false	
	};//end cookie_track



	/**
	* LOCALIZE_OPERATOR
	* @return 
	*/
	this.localize_operator = function(operator) {
		
		// Remove $ (first char)
		operator = operator.slice(1)

		let localized = '';//operator 

		let name = operator
		if (operator==="and") {
			name = "y"
		}else if(operator==="or"){
			name = "o"
		}

		let label = get_label[name]
		if (label) {
			localized = label			
		}

		return localized
	};//end localize_operator



	/**
	* SEARCH_FROM_ENTER_KEY
	* @return 
	*/
	this.search_from_enter_key = function(button_submit) {
		if(SHOW_DEBUG===true) {
			//console.log("[saerch2.search_from_enter_key] search_panel_is_open:",search2.search_panel_is_open);
		}		

		if (search2.search_panel_is_open===true) {
			button_submit.click()
		}else{
			this.toogle_search_panel()
		}
		
		return true
	};//end search_from_enter_key



	/**
	* FILTER_IS_EMPTY
	* Check if filter is empty
	* @return bool is_empty
	*/
	this.filter_is_empty = function(filter_obj) {

		const first_property = filter_obj[Object.keys(filter_obj)[0]]
		const is_empty 		 = (first_property.length<1) ? true : false
		
		
		return is_empty
	};//end filter_is_empty



	/**
	* SHOW_SECTIONS_CHECKBOXES
	* @return 
	*/
	this.show_sections_checkboxes = function(select_value, ar_data_string) {
		//
		//ar_data_string = decodeURIComponent(ar_data_string)
			
		//	const ar_data = JSON.parse(ar_data_string)
		
		const ar_data = ar_data_string

		console.log(ar_data)

		if(SHOW_DEBUG===true) {
			console.log("[show_sections_checkboxes] ar_data:",ar_data);
		}

		if (ar_data.length===0) {
			return false
		}

		const ul = document.getElementById("thesaurus_search_selector_ul")
				while (ul.hasChildNodes()) {
					ul.removeChild(ul.lastChild);
				}			

		const ar_items 		= ar_data[select_value]
		if(typeof ar_items==="undefined") {
			if(SHOW_DEBUG===true) {
				console.log("[show_sections_checkboxes] ar_items is undefined for ar_data:",ar_data,select_value);
			}
			return false
		}

		const ar_items_len 	= ar_items.length
		for (let i = 0; i < ar_items_len; i++) {
			
			let item = ar_items[i]

			// li
			let li = common.create_dom_element({
				element_type 	: 'li',
				parent 		 	: ul,
				//class_name 	: "",
				//data_set 		: {id:counter},
				//id 			: options.is_root ? 'root_search_group' : null
			})

			// checkbox
			let input = common.create_dom_element({
				element_type 	: 'input',
				parent 		 	: li,				
				id 				: item.hierarchy_target_section_tipo,
				name 			: item.hierarchy_target_section_tipo,
				value 			: item.hierarchy_target_section_tipo,
			})
			input.type = "checkbox"
			input.checked = true

			// label
			let label = common.create_dom_element({
				element_type 	: 'label',
				parent 		 	: li,
				text_content 	: item.hierarchy_target_section_name,
				//class_name 		: "checkbox-inline"
			})
			label.setAttribute("for", item.hierarchy_target_section_tipo)
		}

		// Store selected value as cookie to recover later
		const cookie_name  = "selected_tipology"
		createCookie(cookie_name, select_value, 365)

		return true
	};//end show_sections_checkboxes



	/**
	* init_tipology_selector
	* @return 
	*/
	this.init_tipology_selector = function(options) {

		const thesaurus_typology_selector = document.getElementById("thesaurus_typology_selector");

		const selected_value = readCookie("selected_tipology") || thesaurus_typology_selector.value;

		// Force update selector with selected value
		thesaurus_typology_selector.value = selected_value;

		// Build checkboxes
		this.show_sections_checkboxes(selected_value, options.ar_data_string);


		return true;
	};//end init_tipology_selector



	/**
	* GET_SEARCH_OPTIONS
	* @return object search_options_object
	*/
	this.get_search_options = function() {

		const table_rows_list 		= document.querySelector(".table_rows_list")
		const search_options_string	= decodeURIComponent(table_rows_list.dataset.search_options)
		const search_options_object = JSON.parse(search_options_string)
		
		return search_options_object
	};//end get_search_options



	/**
	* GET_SEARCH_QUERY_OBJECT
	* @return object search_query_object
	*/
	this.get_search_query_object = function() {
		const search_options 		= this.get_search_options()
		const search_query_object 	= search_options.search_query_object

		return search_query_object
	};//end get_search_query_object



	/**
	* UPDATE_SEARCH_OPTIONS
	* @return bool
	*/
	this.update_search_options = function(search_query_object) {
		
		const search_options = this.get_search_options()

		// Update
			search_options.search_query_object = search_query_object

		// set updated value
			const table_rows_list 		 = document.querySelector(".table_rows_list")
			const search_options_string  = JSON.stringify(search_options)
			const search_options_encoded = decodeURIComponent(search_options_string)
			table_rows_list.dataset.search_options = search_options_encoded

		return true
	};//end update_search_options



}//end search2