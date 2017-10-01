/**
*	AREA_THESAURUS
*	Manage area_thesaurus
*
*/
"use strict"
var area_thesaurus = new function() {

	this.trigger_url = DEDALO_LIB_BASE_URL + '/area_thesaurus/trigger.area_thesaurus.php'
	this.root_nodes  = null



	/**
	* READY (EVENT)
	*/
	window.ready(function(){
		area_thesaurus.init_form()		
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

		var search_form = document.getElementById('search_form') 
		if(!search_form) return false;

		// Overwrites default behaviour of form submit button
		var form_submit_button = search_form.querySelector('[data-role="button_search"]')
			form_submit_button.setAttribute( "onClick", "area_thesaurus.search(this)" )

		// Overwrites default behaviour of form reset button
		var form_reset_button = search_form.querySelector('[data-role="button_reset"]')
			form_reset_button.setAttribute( "onClick", "area_thesaurus.reset(this)" )

		var max_rows = search_form.querySelector('.css_max_rows')
			max_rows.value = 100

		// OPERATORS CONTROL
			// Desactivos de momento porque no está implementada la búsqueda con operadores todavía
			var toggle_search_operator = document.querySelector('.toggle_search_operators')
				toggle_search_operator.style.display = 'none'								
				//toggle_search_operator.parentElement.removeChild(toggle_search_operator);			

			var ar_toggle_operator_select = document.querySelectorAll('.css_operator_select')
			//setTimeout(function(){
				var len = ar_toggle_operator_select.length
				for (var i = len - 1; i >= 0; i--) {
					ar_toggle_operator_select[i].style.display = 'none'					
					//ar_toggle_operator_select[i].parentElement.removeChild(ar_toggle_operator_select[i]);
				}			
			//},10)	

		// SELECTOR OF HIERARCHYS		
		if (this.is_initied===false) {			
			var selector = document.createElement("select")
				selector.id = "hierarchy_selector"
				selector.name = "hierarchy_id"
				//Create and append the options	
				var option_blank = document.createElement("option");
				selector.appendChild(option_blank);

				var hlen = this.ar_hierarchy.length
				for (var i = 0; i < hlen; i++) {
					var option = document.createElement("option");
				    	option.value = this.ar_hierarchy[i].id;
				    	option.text  = this.ar_hierarchy[i].label;
				    selector.appendChild(option);
				}
				// Find last input and add selector after
				let wrap_hierarchy25 = document.getElementById('wrap_hierarchy25');
					if (wrap_hierarchy25) {
						wrap_hierarchy25.parentNode.insertBefore(selector, wrap_hierarchy25.nextSibling);	
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

		var len = this.root_nodes.length
		for (var i = 0; i < len; i++) {		
		//for (var i = len - 1; i >= 0; i--) {
			var root_node_id = this.root_nodes[i]
			ts_object.get_childrens(document.getElementById(root_node_id))
		}		
	};//end load_root_nodes



	/**
	* SEARCH
	* @return 
	*/
	this.search = function(button_obj) {
		//console.log(button_obj);

		var search_form = document.getElementById('search_form') 
		var dato_form 	= []
		var len = search_form.length
	    for(var i=0; i<len; i++) {
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
		var options = search.build_search_options(dato_form)

		var url_vars = get_current_url_vars()
			//console.log(url_vars)
			options.model = false
			if (typeof url_vars.model!="undefined") {
				options.model = true
			}

		var trigger_vars = {
				mode 	: 'search_thesaurus',
				options : JSON.stringify(options)
			}
			if(SHOW_DEBUG===true) {
				//console.log("[area_thesaurus.search] search trigger_vars: ",trigger_vars);
			}
			

		var search_response = document.getElementById('search_response')
			search_response.innerHTML = ''

		// Add loading overlap
		var wrap_div = document.getElementById('thesaurus_list_wrapper')
			html_page.loading_content( wrap_div, 1 );

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
		var search_form = document.getElementById('search_form') 
			search_form.reset()

		// Clean response div 
		var search_response = document.getElementById('search_response')
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

		var len = this.root_nodes.length
		for (var i = len - 1; i >= 0; i--) {
			var root_node_id = this.root_nodes[i]
			var main_div 	 = document.getElementById(root_node_id).parentNode.parentNode.querySelector('[data-role="childrens_container"]')
			var myNode = main_div;
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
		for (var i = len - 1; i >= 0; i--) {
			if (ar_childs[i].classList.contains("tipology_name")===false) {
				ar_childs[i].style.display = display;
			}
		}
		
		return true
	};//end toggle_tipology





}//end area_thesaurus