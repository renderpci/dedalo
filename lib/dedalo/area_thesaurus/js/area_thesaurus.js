"use strict";
/**
*	AREA_THESAURUS
*	Manage area_thesaurus
*
*/
var area_thesaurus = new function() {

	this.trigger_url = DEDALO_LIB_BASE_URL + '/area_thesaurus/trigger.area_thesaurus.php'
	this.root_nodes  = null

	

	/**
	* READY (EVENT)
	*/
	window.ready(function(){
		area_thesaurus.init_form()
		area_thesaurus.load_root_nodes()
		area_thesaurus.set_toggle_tipology()	
	})
	

	/**
	* LOAD (EVENT)
	*//*
	window.addEventListener("load", function (event) {
		
	});//end load*/



	/**
	* INIT_FORM
	* @return 
	*/
	this.is_initied = false
	this.init_form = function() {

		let search_form = document.getElementById('search_form') 
		if(!search_form) return false;

		// Overwrites default behaviour of form submit button
		let form_submit_button = search_form.querySelector('[data-role="button_search"]')
			form_submit_button.setAttribute( "onClick", "area_thesaurus.search(this)" )

		// Overwrites default behaviour of form reset button
		let form_reset_button = search_form.querySelector('[data-role="button_reset"]')
			form_reset_button.setAttribute( "onClick", "area_thesaurus.reset(this)" )

		let max_rows = search_form.querySelector('.css_max_rows')
			max_rows.value = 100

		// OPERATORS CONTROL
			/*
			// Desactivos de momento porque no está implementada la búsqueda con operadores todavía
			let toggle_search_operator = document.querySelector('.toggle_search_operators')
				toggle_search_operator.style.display = 'none'								
				//toggle_search_operator.parentElement.removeChild(toggle_search_operator);			

			let ar_toggle_operator_select = document.querySelectorAll('.css_operator_select')			
				const len = ar_toggle_operator_select.length
				for (let i = len - 1; i >= 0; i--) {
					ar_toggle_operator_select[i].style.display = 'none'					
					//ar_toggle_operator_select[i].parentElement.removeChild(ar_toggle_operator_select[i]);
				}*/			

		// SELECTOR OF HIERARCHYS		
		if (this.is_initied===false) {			
			let selector = document.createElement("select")
				selector.id = "hierarchy_selector"
				selector.name = "hierarchy_id"
				//Create and append the options	
				let option_blank = document.createElement("option");
				selector.appendChild(option_blank);

				const hlen = this.ar_hierarchy.length
				for (let i = 0; i < hlen; i++) {
					let option = document.createElement("option");
				    	option.value = this.ar_hierarchy[i].id;
				    	option.text  = this.ar_hierarchy[i].label;
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
						let max_button    = document.querySelector(".css_wrap_max_rows");
						let reset_button  = document.querySelector(".css_wrap_button_reset");
						let submit_button = document.querySelector(".css_wrap_button_search")
						let submit_group  = document.createElement("div")
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
	
		if (!this.root_nodes) return false;

		const len = this.root_nodes.length
		for (let i = 0; i < len; i++) {		
		//for (var i = len - 1; i >= 0; i--) {
			let root_node_id = this.root_nodes[i]
			ts_object.get_childrens(document.getElementById(root_node_id))
		}		
	};//end load_root_nodes



	/**
	* SEARCH
	* @return 
	*/
	this.search = function(button_obj) {
		//console.log(button_obj);

		let search_form = document.getElementById('search_form') 
		let dato_form 	= []
		const len = search_form.length
	    for(let i=0; i<len; i++) {
	    	if (!search_form[i].name) continue;
	    	dato_form.push({name  : search_form[i].name,
	    					value : search_form[i].value
	    					})
	    }
		//console.log(dato_form);

		// Add hierarchy selector
		//var hierarchy_selector = document.getElementById('hierarchy_selector')
		//	console.log(hierarchy_selector.value);

	    // build_search_options
		let options = search.build_search_options(dato_form)

		const url_vars = get_current_url_vars()
			//console.log(url_vars)
			options.model = false
			if (typeof url_vars.model!="undefined") {
				options.model = true
			}

		const trigger_vars = {
				mode 	: 'search_thesaurus',
				options : JSON.stringify(options)
			}
			if(SHOW_DEBUG===true) {
				//console.log("[area_thesaurus.search] search trigger_vars: ",trigger_vars); return;
			}

		var search_response = document.getElementById('search_response')
			search_response.innerHTML = ''

		// Add loading overlap
		var wrap_div = document.getElementById('thesaurus_list_wrapper')
			html_page.loading_content( wrap_div, 1 )

		// Return a promise of XMLHttpRequest
		common.get_json_data(this.trigger_url, trigger_vars).then(function(response){
			if(SHOW_DEBUG===true) {
				console.log("[area_thesaurus.search] response",response)
			}

			// clean thesaurus data
			area_thesaurus.clean_thesaurus()

			// Remove loading overlap
			html_page.loading_content( wrap_div, 0 );
			
			// parse result in dom
			if (response && response.result) {
				ts_object.parse_search_result(response.result, null, false)	
				search_response.innerHTML = response.msg
			}else{
				// Restore default state
				//area_thesaurus.load_root_nodes()
			}

		}, function(error) {
			//console.error("Failed search!", error);
			console.log(error);
			// Remove loading overlap
			html_page.loading_content( wrap_div, 0 );
		});
	};//end search



	/**
	* RESET
	*/
	this.reset = function(button_obj) {
		// Reset form fields
		let search_form = document.getElementById('search_form') 
			search_form.reset()

		// Clean response div 
		let search_response = document.getElementById('search_response')
			search_response.innerHTML = ''

		this.init_form()

		// Restore default state
		this.load_root_nodes()
	};//end reset



	/**
	* CLEAN_THESAURUS
	* Removes thesaurus nodes. Useful for prepare parse search results
	*/
	this.clean_thesaurus = function() {
		
		if (!this.root_nodes) return false;

		let len = this.root_nodes.length
		for (let i = len - 1; i >= 0; i--) {
			let root_node_id = this.root_nodes[i]
			let main_div 	 = document.getElementById(root_node_id).parentNode.parentNode.querySelector('[data-role="childrens_container"]')
			let myNode = main_div;
				while (myNode.firstChild) {
				    myNode.removeChild(myNode.firstChild);
				}
		}
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

		let parent_li = button_obj.parentNode
		let ar_childs = parent_li.childNodes

		let len = ar_childs.length
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
					ar_childs[i].style.opacity = 0.5				
				}else{
					let index = ar_hidden.indexOf(ar_childs[i].dataset.section_id)
					if (index!==-1) {
						ar_hidden.splice(index, 1)						
					}
					// Set selector bar as visible
					ar_childs[i].style.opacity = 1				
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
		
		let ar_hidden 	= JSON.parse( readCookie("toggle_tipology") ) || []
		let ar_bars 	= document.querySelectorAll(".tipology_name")
		let ar_bars_len = ar_bars.length
		for (let i = 0; i < ar_bars_len; i++) {
			
			let section_id = ar_bars[i].dataset.section_id
			if(ar_hidden.indexOf(section_id) !== -1) {
				// Mimic toggle_tipology call
				area_thesaurus.toggle_tipology(ar_bars[i])
			}
		}

		return true
	};//end set_toggle_tipology





}//end area_thesaurus