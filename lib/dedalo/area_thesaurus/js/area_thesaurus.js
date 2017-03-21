


/*

	AREA_THESAURUS
	Manage area_thesaurus

*/
var area_thesaurus = new function() {

	this.trigger_url = DEDALO_LIB_BASE_URL + '/area_thesaurus/trigger.area_thesaurus.php'
	this.root_nodes  = null

	$(function() {

		area_thesaurus.init_form()

		//area_thesaurus.load_root_nodes()
	});//end $(document).ready(function()


	/**
	* LOAD (EVENT)
	*/
	window.addEventListener("load", function (event) {
		area_thesaurus.load_root_nodes()
	});//end load



	/**
	* INIT_FORM
	* @return 
	*/
	this.init_form = function() {

		var search_form = document.getElementById('search_form') 
		if(!search_form) return false;

		// Overwrites default behaviour of form submit button
		var form_submit_button = search_form.querySelector('[data-role="button_search"]')
			form_submit_button.setAttribute( "onClick", "area_thesaurus.search(this)" )

		// Overwrites default behaviour of form submit button
		var form_reset_button = search_form.querySelector('[data-role="button_reset"]')
			form_reset_button.setAttribute( "onClick", "area_thesaurus.reset(this)" )

		var max_rows = search_form.querySelector('.css_max_rows')
			max_rows.value = 1000

		// OPERATORS CONTROL
			// Desactivos de momento porque no está implementada la búsqueda con operadores todavía
			var toggle_search_operators = document.querySelector('.toggle_search_operators')
				toggle_search_operators.style.display = 'none'

			var ar_toggle_operator_select = document.querySelectorAll('.css_operator_select')
			//setTimeout(function(){
				var len = ar_toggle_operator_select.length
				for (var i = len - 1; i >= 0; i--) {
					ar_toggle_operator_select[i].style.display = 'none'
				}			
			//},10)			

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

	    // build_search_options
		var options = search.build_search_options(dato_form)

		var url_vars = get_current_url_vars()
			//console.log(url_vars)
			options.model = false
			if (typeof url_vars.model !== 'undefined') {
				options.model = true
			}

		var trigger_vars = {
			mode 	: 'search_thesaurus',
			options : JSON.stringify(options)
			}
			if(SHOW_DEBUG===true) {
				console.log(trigger_vars);
			}
			

		var search_response = document.getElementById('search_response')
			search_response.innerHTML = ''

		// Add loading overlap
		var wrap_div = document.getElementById('thesaurus_list_wrapper')
			html_page.loading_content( wrap_div, 1 );

		// Return a promise of XMLHttpRequest
		common.get_json_data(this.trigger_url, trigger_vars).then(function(response){
			if(SHOW_DEBUG===true) {
				console.log(response)
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





}//end area_thesaurus