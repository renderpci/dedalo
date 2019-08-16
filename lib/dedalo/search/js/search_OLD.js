/**
* SEARCH
*
*
*
*/
var search = new function() {

	"use strict";

	this.search_operators_showed  = false
	this.search_operators_objects = null

	// READY (EVENT)

	window.ready(function(){
		switch(page_globals.modo) {

			case 'edit' :
				search.move_paginator_to_inspector()
				break;
			}
	
	});//end ready

	/**
	* AUTO_SEARCH
	* When request auto_search (URL GET) trigger search mimic form search
	*/
	this.auto_search = function() {

		const url_vars = get_current_url_vars()
			if (!url_vars.auto_search) {
				return false;
			}

		const form_obj 	= document.getElementById('search_form')
		const result 	= this.Search(form_obj)

		return result
	};//end auto_search



	/**
	* LOAD_ROWS : Ajax loads records
	* @return promise js_promise
	*/
	this.load_rows = function(options, button_obj) {

		const start = new Date().getTime()	

		if (typeof options==="string") {
			options = JSON.parse(options)
		}
		if(SHOW_DEBUG===true) {
			//console.log("options parsed:",options);
		}		

		// Target div
		var target
		if (page_globals.modo==='edit') {
			target = document.querySelector('.section_list_rows_content_div')
		}else{
			// Use find_ancestor from trigger button for proper select container when time_machine list is open
			target = find_ancestor(button_obj, 'section_list_rows_content_div') //section_content_list
		}		
		if ( typeof target==="undefined" || target===null ) {			
			console.warn("load_rows: Error. Sorry: target dom element not found. ("+page_globals.modo+")")
			console.log("button_obj",button_obj);
			return false;
		}		

		// Wrap div
		const wrap_div = target.querySelector('.css_section_list_wrap')
			if (wrap_div === null ) {
				return alert("load_rows: Sorry: wrap_div dom element not found");
			}

		// Options fallback to default
		//if (typeof options==="undefined" || options===null) {
		//	var options = $(button_obj).parents('.css_section_list_wrap').first().data('options');
		//	console.log("Using default options on load_rows");
		//}
		
		// Options test mandatory vars
		if (typeof options==="undefined" || options===null) {
			return alert("Error: Few vars: options is mandatory: "+options)
		}
		// modo check
		if (typeof options.modo==="undefined" || typeof options.modo===null) {
			return alert("Error: Few vars: modo is mandatory: "+options.modo)
		}		

		// Check if options.context is object json encoded as string
		if (options.context && typeof options.context==="string") {
			if (common.is_json(options.context)) {
				options.context = JSON.parse(options.context)
			}
		}

		// Stop possible downloading videos on paginate
		common.stop_all_videos()

		// Active loading overlap
		html_page.loading_content( wrap_div, 1 )
		

		const url_trigger  = DEDALO_LIB_BASE_URL + '/section_records/trigger.section_records.php'
		const trigger_vars = {
				mode 	 : 'load_rows',
				//options	 : JSON.stringify(options),	// Important. Convert json object options to string to send by ajax as text
				options	 : options,
				top_tipo : page_globals.top_tipo
			}
			//console.log("[search.load_rows] trigger_vars", trigger_vars)

		// PROMISE JSON XMLHttpRequest
		const js_promise = common.get_json_data(url_trigger, trigger_vars).then(function(response){
			if (SHOW_DEBUG===true) {
				console.log("[search.load_rows] response:",response);
				if (response) {
					console.log("[search.load_rows] response "+response.msg +" "+ response.debug.exec_time);
				}
			}

			if (!response) {
				// Notify to log messages in top of page
				console.error("[search.load_rows] Error. response is null", response);

			}else{

				// Parse html text as object
				var el = document.createElement('div')
					el.innerHTML = response.result
	
				//var content = $(received_data).find("div.css_section_group_content:first>*")
				//var content = $(received_data).find("[data-rol='section_records']") //'[data-type="component_autocomplete_new_element"]'
				var content_obj = el
				if(options.modo==="edit") {
					content_obj = el.querySelector("div[data-rol='section_records']")
					if(typeof content_obj === 'undefined') {
						return alert('[search.load_rows] Error on parse received data: \n' + response.result)
					}
				}				
				
				// target_obj
					const target_obj = target.querySelector("div[data-rol='section_records']")
					if(typeof target_obj === 'undefined') {
						return alert('[search.load_rows] Error on place received data. Target DOM obj (data-rol="section_records") not found')
					}
	
				// Pure javascript option (replace content and exec javascript code inside)
					insertAndExecute(target_obj, content_obj)

				// Update page info labels
					if (page_globals.modo==='edit') {

						search.update_page_labels()
						search.move_paginator_to_inspector()

						// Update url to maintain record on user reloads page
						//search.update_url( response.result, options )
						search.update_url( el, options )


						// LOCK_COMPONENTS : Reset user_section_locks
						// Unlock all components of current section
						if(typeof lock_components !== 'undefined') {
							lock_components.delete_user_section_locks()
						}
					}//end if (page_globals.modo==='edit') 

				// Launch event load_rows is done
					const event_detail 	  = {}
					const load_rows_event = new CustomEvent('load_rows', {detail:event_detail})
					// launch custom event
					window.dispatchEvent(load_rows_event)
			
			}//end if (!response) 
			
			// Debug
				if (SHOW_DEBUG===true) {
					//console.log( "[component_common.load_component_by_wrapper_id]-> loaded wrapper: " + wrapper_id + " tipo:"+tipo+ " modo:"+modo )				
					var end = new Date().getTime(); var time = end - start
					//console.log("[search.load_rows] -> execution time: " +time+' ms' )
					if (response && response.debug) {
						response.debug.ajax_time = time+' ms'
					}				
				}

			html_page.loading_content( wrap_div, 0 )

			return true

		}, function(error) {
			// log
			console.log("[search.load_rows] Error.", error)
			html_page.loading_content( wrap_div, 0 )
		})

		return js_promise;
	};//end load_rows



	/**
	* GET_SEARCH_OPTIONS_FROM_DOM_ELEMENT
	* @return object search_options
	*/
	this.get_search_options_from_dom_element = function(button_obj) {
		
		var search_options = {}

		var list_wrap
		if (page_globals.modo==="edit") {
			list_wrap = document.querySelector(".css_section_list_wrap")
		}else{
			list_wrap = find_ancestor(button_obj, 'css_section_list_wrap') // css_section_wrap			
			let table = list_wrap.querySelector(".table_rows_list")
			list_wrap = table // override for coherence with edit
		}
		if (list_wrap) {
			
			let search_options_string = list_wrap.dataset.search_options
			if(SHOW_DEBUG===true) {
				//console.log("[search.get_search_options_from_dom_element] search_options_string:",search_options_string)
			}

			// Decode string (encoded in php with encodeURIComponent)
			search_options_string = decodeURIComponent(search_options_string)

			// Parse and set as object
			search_options = JSON.parse(search_options_string)			
		}

		return search_options
	};//end get_search_options_from_dom_element



	/**
	* FIRST_LOAD_ROWS
	* @return 
	*/
	this.first_load_rows = function(button_obj) {

		// Get search_options parsed object from dom
		const search_options = this.get_search_options_from_dom_element(button_obj)

		// launch new search load rows
		this.load_rows(search_options, button_obj)
		
		return true
	};//end first_load_rows



	/**
	* GO_TO_PAGE
	* @return bool true
	*/
	this.go_to_page = function(input_obj, e, total_pages, item_per_page) {
		
		if (e.keyCode===13) {
			e.preventDefault()
			e.stopPropagation();

			const page = parseInt(input_obj.value)
				//console.log("page:",page);

			total_pages   = parseInt(total_pages)
			item_per_page = parseInt(item_per_page)	

			if (page<1 || page>total_pages) {
				console.log("Invalid page:",page);
				return false
			}

			const button_obj = input_obj			
		
			// Get search_options parsed object from dom
			const search_options 		= this.get_search_options_from_dom_element(button_obj)
			const search_query_object = search_options.search_query_object

			const new_offset = ((page -1) * item_per_page) 
				//console.log("new_offset:",new_offset);

			// Change offset in query object
			search_query_object.offset = new_offset

			// launch new search load rows
			this.load_rows(search_options, button_obj)		

			return true
		}

		return false
	};//end go_to_page



	/**
	* LOAD_PAGINATED_ROWS
	* Read css_section_list_wrap wrap dataset options, edit offset, and call to load_rows sending the new search_options
	* @return bool true
	*/
	this.load_paginated_rows = function(button_obj, offset) {			
		
		// Get search_options parsed object from dom
		const search_options = this.get_search_options_from_dom_element(button_obj)

		let search_query_object = search_options.search_query_object

		// Change offset in query object
		search_query_object.offset = offset

		// launch new search load rows
		this.load_rows(search_options, button_obj).then(function(){
			
			//reset the relation_list inside inspector
			const inspector_relation_list_sections = document.getElementById('wrap_relation_list_sections')
				if (inspector_relation_list_sections) inspector_relation_list_sections.innerHTML=''

			//set the current section_id to the relation_list dataset if found
			const inspector_relation_list = document.getElementById('inspector_relation_list')
			if (inspector_relation_list) {
				const section_id = page_globals._parent
				inspector_relation_list.dataset.section_id = section_id
			}
			// relation_list_button. Update relation_list_button dataset section_id
			const inspector_relation_list_button = document.getElementById('relation_list_button');
			if(inspector_relation_list_button){
				inspector_relation_list_button.classList.remove('relation_list_button_off');
				inspector_relation_list_button.classList.add('relation_list_button');
				const section_id = page_globals._parent
				inspector_relation_list_button.dataset.section_id = section_id
			}

			//reset the time_machine_list inside inspector
			const inspector_time_machine_list_sections = document.getElementById('wrap_time_machine_list_sections')
				if (inspector_time_machine_list_sections) inspector_time_machine_list_sections.innerHTML=''

			//set the current section_id to the time_machine_list dataset if found
			const inspector_time_machine_list = document.getElementById('inspector_time_machine_list')
			if (inspector_time_machine_list) {
				const section_id = page_globals._parent
				inspector_time_machine_list.dataset.section_id = section_id
			}
			// time_machine_button. Update time_machine_button dataset section_id
			const inspector_time_machine_list_button = document.getElementById('time_machine_list_button');
			if(inspector_time_machine_list_button){
				const section_id = page_globals._parent
				inspector_time_machine_list_button.classList.remove('time_machine_list_button_off');
				inspector_time_machine_list_button.classList.add('time_machine_list_button');
				inspector_time_machine_list_button.dataset.section_id = section_id
			}

		})

		return true
	};//end load_paginated_rows



	/**
	* LOAD_ORDERED_ROWS
	* Read css_section_list_wrap wrap dataset options, edit order, and call to load_rows sending the new search_options
	* @return bool true
	*/
	this.load_ordered_rows = function(button_obj, tipo, direction, path) {

		// Decode php encoded path
		path = decodeURIComponent(path)	

		// Get search_options parsed object from dom
		let search_options = this.get_search_options_from_dom_element(button_obj)

		let search_query_object = search_options.search_query_object

		let order = []
			order.push({
				direction : direction,
				path 	  : JSON.parse(path)
			})
		// Change offset in query object
		search_query_object.order  = order
		search_query_object.parsed = false
		if(SHOW_DEBUG===true) {
			console.log("[load_ordered_rows] Ordered with:",order);
		}

		// launch new search load rows
		this.load_rows(search_options, button_obj)

		return true
	};//end load_ordered_rows


	/**
	* UPDATE_URL
	* Updates url on paginate prevents loose record on refresh page
	* @return bool true
	*/
	this.update_url = function( el, options ) {

		const offset 			  = options.search_query_object.offset
		const current_record_wrap = el.querySelector("#current_record_wrap")		
		const current_section_id  = current_record_wrap.dataset.section_id

		let url = window.location.search.substring(1) // Current url vars like ?id=1&...
	
		let	keyString
		let	replaceString

		keyString 	 = 'id' // Key to change
		replaceString= current_section_id  // new value for replace old
			// Update url
			url = change_url_variable(url, keyString, replaceString)  // Change value in url
		
		keyString 	 = 'offset' // Key to change
		replaceString= offset  // new value for replace old
			// Update url
			url = change_url_variable(url, keyString, replaceString)  // Change value in url
	
		history.pushState({}, null, '?'+url) // Replace url portion of vars

		page_globals._parent = current_section_id

		return true
	};//end update_url	


	/**
	* UPDATE_PAGE_LABELS
	*/
	this.update_page_labels = function() {
		// Update inspector info
		section.force_inspector_info_update();
	};//end update_page_labels



	/**
	* MOVE_PAGINATOR_TO_INSPECTOR
	*/
	this.move_paginator_to_inspector = function() {

		//get the paginator cotainer into the inpector
		const wrap_inspector_paginator = document.getElementById('wrap_inspector_paginator')

		if (wrap_inspector_paginator) {

			// Clean wrap_inspector_paginator (remove old paginators)
				while (wrap_inspector_paginator.firstChild) {
					wrap_inspector_paginator.removeChild(wrap_inspector_paginator.firstChild);
				}

			//get the paginator in the page
				const css_wrap_rows_paginator = document.querySelector('.css_wrap_rows_paginator');

			//apend the paginator to the inspector
				if (css_wrap_rows_paginator) {
					wrap_inspector_paginator.appendChild(css_wrap_rows_paginator);
				}
				
		}
	

		return true
	};// end move_paginator_to_inspector



	/**
	* TOGGLE_FILTER_SEARCH_TAP
	* @return 
	*/
	this.toggle_filter_search_tap = function() {

		const open_search2_button = document.getElementById("open_search2_button")
			open_search2_button.click();		
		
		return true;
	};//end toggle_filter_search_tap



	/**
	* GET_QUERY_PATH
	* function to obtain final complete path of each element in json query object
	* Used in component common to build components path for select
	*/
	this.get_query_path = function(component_tipo, section_tipo, component_name, name){

		const current_path = [{
			name 			: name,
			modelo 			: component_name,
			section_tipo 	: section_tipo,
			component_tipo 	: component_tipo
		}]

		return current_path
	}//end get_query_path



	/**
	* INIT_PAGINATOR
	* @param object options
	* @return bool
	*/
	this.init_paginator = function(options) {

		const container_id = options.container_id

		// Load js lib dynamically
			const url = DEDALO_LIB_BASE_URL + '/search/js/paginator.js'
			common.load_script(url).then(function(e){					
		
				// add event listener to the load_rows, 
				// when the search load the result into the rows container 
				// the paginator get the new search_query object and get the new ofsset, limit and total
				// render the new buttons and add to the container node
				window.addEventListener('load_rows',function(e){					

					// get the search_query_object_element and decode the search_options
						const search_query_object_element = options.search_query_object_element || document.getElementById('table_rows_list');
					
					// get search_options from dataset
						const search_options_string = decodeURIComponent(search_query_object_element.dataset.search_options)

					// pase the search_options from dataset
						const search_options = JSON.parse(search_options_string)
						if (typeof search_options.search_query_object==="undefined") {
							console.log("[init_paginator.load_rows] Undefined search_options.search_query_object:",search_options);
							return false
						}

					// search_query_object
						const search_query_object = search_options.search_query_object

					// get offset, limit and total from new search_query_object
						const offset = search_query_object.offset
						const limit  = search_query_object.limit
						const total  = search_query_object.full_count
					
					// render the node_paginator buttons and text
						const node_paginator = paginator.render({
							offset 		: offset,
							limit 		: limit,
							total 		: total
						})

					// container . Select container on every call to make sure you get the dom updated element
						const container = document.getElementById(container_id)

					// Clean container (remove old paginators)
						while (container.firstChild) {
							container.removeChild(container.firstChild);
						}
						//console.log("node_paginator:",node_paginator);
					
					// add the paginator to the container
						container.appendChild(node_paginator);

				}, false)
			})


		return true;		
	};//end init_paginator



}//end section_list