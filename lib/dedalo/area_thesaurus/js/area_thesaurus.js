"use strict";

/**
*	AREA_THESAURUS
*	Manage area_thesaurus
*
*
*/
var area_thesaurus = new function() {
	

	this.trigger_url = DEDALO_LIB_BASE_URL + '/area_thesaurus/trigger.area_thesaurus.php'
	this.root_nodes  = null
	this.model_view



	/**
	* READY (EVENT)
	*/
	window.ready(function(){
		
		// init typologies from
			//area_thesaurus.init_form()		

		// restore previous tipology state
			area_thesaurus.set_toggle_tipology()
	})



	/**
	* INIT
	* @return 
	*/
	this.init = function(options) {

		if(SHOW_DEBUG===true) {
			console.log("[area_thesaurus.init] Initied with options:", options);	
		}			

		const self = this

		// Set mode (mode view true/false) default is false
		self.model_view = options.model_view || false

		// Root nodes set
		self.root_nodes = options.root_nodes

		// Exec init search
		if (options.search_options) {
			// Direct search from url received vars
			self.search(options.search_options)
		}else{
			// Default action load all root nodes
			self.load_root_nodes();
		}


		return true
	};//end init



	/**
	* INIT_FORM
	* @return 
	*/
	this.is_initied = false
	this.init_form = function() {
	
		// search_form
			const search_form = document.getElementById('search_form') 				
			if(!search_form) {
				console.warn("[init_form] search_form not found");
				return false;
			}

		// form_submit_button. Overwrites default behaviour of form submit button
			const form_submit_button = search_form.querySelector('[data-role="button_search"]')
				  form_submit_button.setAttribute( "onClick", "area_thesaurus.search(this)" )

		// form_reset_button. Overwrites default behaviour of form reset button
			const form_reset_button = search_form.querySelector('[data-role="button_reset"]')
				  form_reset_button.setAttribute( "onClick", "area_thesaurus.reset(this)" )

		// max_rows
		const max_rows = search_form.querySelector('.css_max_rows')
			  max_rows.value = 100
		
		// SELECTOR OF HIERARCHYS		
			if (this.is_initied===false) {
	
				const selector = document.createElement("select")
					  selector.id 	= "hierarchy_selector"
					  selector.name = "hierarchy_id"
					// Create and append the options	
						const option_blank = document.createElement("option");
						selector.appendChild(option_blank);

					const hlen = this.ar_hierarchy.length
					for (let i = 0; i < hlen; i++) {
						let option = document.createElement("option");
							option.value	= this.ar_hierarchy[i].id;
							option.text		= this.ar_hierarchy[i].label;
					    selector.appendChild(option);
					}

					let label = document.createElement("span")
						label.appendChild( document.createTextNode("Hierarchy") );
						label.classList.add("css_label","label","label_hierarchy_selector")

					// Find last input and add selector after
					let wrap_hierarchy25 = document.getElementById('wrap_hierarchy25');
						if (wrap_hierarchy25) {
							wrap_hierarchy25.parentNode.insertBefore(selector, wrap_hierarchy25.nextSibling)
							wrap_hierarchy25.parentNode.insertBefore(label, wrap_hierarchy25.nextSibling)

							// Move reset and submit buttons
							let max_button		= document.querySelector(".css_wrap_max_rows");
							let reset_button	= document.querySelector(".css_wrap_button_reset");
							let submit_button	= document.querySelector(".css_wrap_button_search")
							let submit_group	= document.createElement("div")
								submit_group.id = "submit_group"
								submit_group.appendChild(max_button)
								submit_group.appendChild(reset_button)
								submit_group.appendChild(submit_button)
							wrap_hierarchy25.parentNode.appendChild(submit_group)
						}

			}//end if (this.is_initied===false)
		
		area_thesaurus.load_root_nodes()

		this.is_initied = true
	};//end init_form



	/**
	* LOAD_ROOT_NODES
	* @return 
	*/
	this.load_root_nodes = function() {
	
		if (!this.root_nodes) {
			console.warn("[area_thesaurus.load_root_nodes] Empty this root_nodes")
			return false;
		}
	
		const len = this.root_nodes.length
		for (let i = 0; i < len; i++) {		
		
			const root_node_id = this.root_nodes[i]
			
			// Launch ajax call promise
				ts_object.get_childrens(document.getElementById(root_node_id))			
		}

		return true	
	};//end load_root_nodes



	/**
	* SEARCH
	* @return promise
	*/
	this.search = function(search_options, button_obj) {
	
		const self = this

		// JSON format verify (is string encoded sometimes)
			if (typeof search_options==='string' || search_options instanceof String) {
				search_options = JSON.parse(search_options)
			}

		// search_response
			const search_response = document.getElementById('search_response')
				  search_response.innerHTML = ''

		// Add model_view (true/false)
			search_options.model_view = self.model_view || false

		// Check if empty
			const filter_obj = search_options.search_query_object.filter
			const is_empty 	 = search2.filter_is_empty(filter_obj)
		
		if (is_empty===true) {

			const promise = new Promise(function(resolve, reject) {
				area_thesaurus.load_root_nodes()
				resolve("Loaded root nodes again to reset thesaurus state")
			});

			return promise
		}

		// Add loading overlap
			const wrap_div = document.getElementById('thesaurus_list_wrapper')
				  html_page.loading_content( wrap_div, 1 )

		const trigger_url  = self.trigger_url
		const trigger_vars = {
				mode 			: "search_thesaurus",
				search_options 	: search_options
			}
			if(SHOW_DEBUG===true) {
				//console.log("[area_thesaurus.search] search trigger_vars: ",trigger_vars, trigger_url); return;
			}

		// Return a promise of XMLHttpRequest
		const js_promise = common.get_json_data(trigger_url, trigger_vars).then(function(response){
			if(SHOW_DEBUG===true) {
				console.log("[area_thesaurus.search] response",response)
			}

			// Remove loading overlap
				html_page.loading_content( wrap_div, 0 );

			
			// clean thesaurus data
				area_thesaurus.clean_thesaurus()			
			
			// parse result in dom
				if (response && response.result) {
					ts_object.parse_search_result(response.result, null, false)	
					search_response.innerHTML = response.msg
				}else{
					// Restore default state
					//area_thesaurus.load_root_nodes()
				}
			// debug
				if(SHOW_DEBUG===true) {
					let debug_sql_time  = document.getElementById("debug_sql_time")
					let span 			= debug_sql_time.querySelector("span.exec_time")
						span.innerHTML  = ". Exec time: " + response.debug.exec_time

					let pre 			= debug_sql_time.querySelector("pre")
						pre.innerHTML 	= ""
					
					let search_query_object = document.createElement("div")
					    search_query_object.innerHTML = JSON.stringify(response.debug.search_options.search_query_object, null, 2)
					    pre.appendChild(search_query_object)

					let query = document.createElement("div")
						query.innerHTML = "<hr>" + response.strQuery
						pre.appendChild(query)
				}

		}, function(error) {
			//console.error("Failed search!", error);
			console.log(error);
			// Remove loading overlap
			html_page.loading_content( wrap_div, 0 );
		});

		
		return js_promise
	};//end search



	/**
	* RESET
	*/
	this.reset = function(button_obj) {		
		// Restore default state
		this.load_root_nodes()

		return true
	};//end reset



	/**
	* CLEAN_THESAURUS
	* Removes thesaurus nodes. Useful for prepare parse search results
	*/
	this.clean_thesaurus = function() {
		
		if (!this.root_nodes) return false;

		const root_nodes_len = this.root_nodes.length
		for (let i = root_nodes_len - 1; i >= 0; i--) {
			const root_node_id	= this.root_nodes[i]
			const main_div		= document.getElementById(root_node_id).parentNode.parentNode.querySelector('[data-role="childrens_container"]')
			// Remove childrens recursive
			while (main_div.firstChild) {
			    main_div.removeChild(main_div.firstChild)
			}
		}

		return true
	};//end clean_thesaurus



	/**
	* TOGGLE_TIPOLOGY
	* @return 
	*/
	this.toggle_tipology = function(button_obj) {

		let display = ""
		if (button_obj.dataset.state==="show") {
			display = "none"
			button_obj.dataset.state = "hide"
		}else{
			display = ""
			button_obj.dataset.state = "show"
		}

		const parent_li = button_obj.parentNode
		let ar_childs = parent_li.childNodes

		const len = ar_childs.length
		let ar_hidden = JSON.parse( readCookie("toggle_tipology") ) || []
		for (let i = len - 1; i >= 0; i--) {
			if (ar_childs[i].classList.contains("tipology_name")===false) {
				
				ar_childs[i].style.display = display

			}else{
	
				if (display==="none") {
					if(ar_hidden.indexOf(ar_childs[i].dataset.section_id) === -1) {
						ar_hidden.push(ar_childs[i].dataset.section_id)
					}
					// Set selector bar as hidden
					//ar_childs[i].style.opacity = 0.3
					ar_childs[i].classList.add("typology_hide")	
				}else{
					let index = ar_hidden.indexOf(ar_childs[i].dataset.section_id)
					if (index!==-1) {
						ar_hidden.splice(index, 1)						
					}
					// Set selector bar as visible
					//ar_childs[i].style.opacity = 1
					ar_childs[i].classList.remove("typology_hide")			
				}
			}
		}
		// Create / update cookie
		createCookie("toggle_tipology", JSON.stringify(ar_hidden), 365);

		
		return true
	};//end toggle_tipology



	/**
	* SET_TOGGLE_TIPOLOGY
	* Called on ready page
	* @return 
	*/
	this.set_toggle_tipology = function() {
		
		const ar_hidden		= JSON.parse( readCookie("toggle_tipology") ) || []
		const ar_bars		= document.querySelectorAll(".tipology_name")
		const ar_bars_len	= ar_bars.length
		for (let i = 0; i < ar_bars_len; i++) {
			
			const section_id = ar_bars[i].dataset.section_id
			if(ar_hidden.indexOf(section_id) !== -1) {
				// Mimic toggle_tipology call
				area_thesaurus.toggle_tipology(ar_bars[i])
			}
		}

		return true
	};//end set_toggle_tipology



}//end area_thesaurus