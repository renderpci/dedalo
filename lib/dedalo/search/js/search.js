"use strict";
/**
* SEARCH
*
*
*/
var search = new function() {

	this.search_operators_showed  = false
	this.search_operators_objects = null

	// DOM Ready functions
	$(function() {
	
		/* TOGGLE FILTER TAP CONTENT 
			$('.css_rows_search_tap').each(function() {		
				
				$(this).on("click", function(event) {			
					
					$(this).parent().find('.css_rows_search_content').toggle(250);
					
				});
			});
			*/		

		switch(page_globals.modo) {

			case 'edit' :
				search.move_paginator_to_inspector()
				break;

			case 'list' :
				// Max records per page. Set default value for field max per page (5)
				const max_pp_obj = document.querySelector('.css_max_rows');	if(max_pp_obj && max_pp_obj.value < 1) max_pp_obj.value = 5

				// Operators DOM obj
				search.search_operators_objects = $('.toggle_search_operators');

				// Button toggle_search_operators activate on click event 
				search.search_operators_objects.on('click', function(event) {

					event.preventDefault()
					search.toggle_search_operators()
				})

				// Search operators check last state
				if (readCookie('search_operators_showed') === 'true') {
					search.toggle_search_operators() // Open operators
				}

				// Auto search (only when get var 'auto_search' is present)
				search.auto_search()
				break
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
	* TOGGLE_SEARCH_OPERATORS
	* Show / hide operators dom elements on click button .toggle_search_operators
	*/
	this.toggle_search_operators = function(){
		const operator_elements = $('.css_operator_select');
		let i=0;
		let count = operator_elements.length;
		//	console.log(count);
		operator_elements.toggle(0, function(){
			i++;		
			if (i==count) {
				// Avoid repeat this for every select
				search.search_operators_showed = $(this).is(":visible");
				//eraseCookie('search_operators_showed')				
				createCookie('search_operators_showed',search.search_operators_showed,1);	// Fix value for maintain state on refresh page	
			}				
		})

		return true
	}//end toggle_search_operators



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
		let target
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
		let js_promise = common.get_json_data(url_trigger, trigger_vars).then(function(response){
			if (SHOW_DEBUG===true) {
				//console.log("[search.load_rows] response:",response);
				if (response) {
					console.log("[search.load_rows] response "+response.msg +" "+ response.debug.exec_time);
				}
			}

			if (!response) {
				// Notify to log messages in top of page
				console.error("[search.load_rows] Error. response is null", response);

			}else{

				// Parse html text as object
				let el = document.createElement('div')
					el.innerHTML = response.result
	
				//var content = $(received_data).find("div.css_section_group_content:first>*")
				//var content = $(received_data).find("[data-rol='section_records']") //'[data-type="component_autocomplete_new_element"]'
				let content_obj = el
				if(options.modo==="edit") {
					content_obj = el.querySelector("div[data-rol='section_records']")
					if(typeof content_obj === 'undefined') {
						return alert('[search.load_rows] Error on parse received data: \n' + response.result)
					}
				}				
				
				let target_obj  = target.querySelector("div[data-rol='section_records']")
					if(typeof target_obj === 'undefined') {
						return alert('[search.load_rows] Error on place received data. Target DOM obj (data-rol="section_records") not found')
					}				
	
				// Pure javascript option (replace content and exec javascript code inside)
				insertAndExecute(target_obj, content_obj)

				// Update page info labels
				if (page_globals.modo === 'edit') {

					html_page.tabs_state_update()
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
			
			}//end if (!response) 
			
			if (SHOW_DEBUG===true) {
				//console.log( "[component_common.load_component_by_wrapper_id]-> loaded wrapper: " + wrapper_id + " tipo:"+tipo+ " modo:"+modo )				
				let end = new Date().getTime(); var time = end - start
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
		
		let search_options = {}

		let list_wrap
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
		let search_options = this.get_search_options_from_dom_element(button_obj)

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

			let page = parseInt(input_obj.value)
				//console.log("page:",page);

			total_pages 	= parseInt(total_pages)
			item_per_page 	= parseInt(item_per_page)	

			if (page<1 || page>total_pages) {
				console.log("Invalid page:",page);
				return false
			}

			let button_obj = input_obj			
		
			// Get search_options parsed object from dom
			let search_options 		= this.get_search_options_from_dom_element(button_obj)
			let search_query_object = search_options.search_query_object

			let new_offset = ((page -1) * item_per_page) 
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
		let search_options = this.get_search_options_from_dom_element(button_obj)

		let search_query_object = search_options.search_query_object

		// Change offset in query object
		search_query_object.offset = offset

		// launch new search load rows
		this.load_rows(search_options, button_obj)		

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
	* SHOW_ALL
	* Read css_section_list_wrap wrap dataset options, reset search options, and call to load_rows sending the new search_options
	* Used by  Tool portal show all
	* @return bool true
	*/
	this.show_all = function(button_obj) {

		let table_rows_list = document.querySelector(".table_rows_list")
		
		// Get search_options parsed object from dom
		let search_options = this.get_search_options_from_dom_element(table_rows_list)

		let search_query_object = search_options.search_query_object

		search_query_object.filter = null
		search_query_object.offset = 0
		search_query_object.order  = {"section_id":"ASC"}

		// launch new search load rows
		this.load_rows(search_options, button_obj)

		return true
	};//end show_all


	
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
	* RELOAD_ROWS_LIST
	*/
	this.reload_rows_list = function (call_uid) {
	
		return false // Desactiva de momento. Arreglar !
		/*
		const caller_obj = document.getElementById(call_uid)
			if (!caller_obj) {
				console.log("[search.reload_rows_list] Error on find caller_obj element with call_uid: "+call_uid);
				return false;
			}

		//var options 	 	= caller_obj.dataset.options
		//let button_obj 	= caller_obj.querySelector('.paginator_first_icon')
		const button_obj 	= caller_obj.querySelector('.css_wrap_rows_paginator')
		const options 	 	= button_obj.dataset.options
		
			// If button paginator not exits, reload complete page
			if (!button_obj) {
				window.location.href = window.location.href; // Force normal complete window refresh
				return false;
			}
		//console.log("options",JSON.parse(options), button_obj);

		//console.log("options:",options);
		search.load_rows( JSON.parse(options), button_obj) */
	};//end reload_rows_list



	/**
	* UPDATE_PAGE_LABELS
	*/
	this.update_page_labels = function() {
		// Update inspector info
		section.update_inspector_info();
	};//end update_page_labels



	/**
	* MOVE_PAGINATOR_TO_INSPECTOR
	*/
	this.move_paginator_to_inspector = function() {

		// Move paginator element to inspector
		var $wrap_inspector_paginator = $('#wrap_inspector_paginator')
		$wrap_inspector_paginator.html('')
		$(".css_wrap_rows_paginator").detach().appendTo($wrap_inspector_paginator)

		return true
	};



	/**
	* BUILD_SEARCH_OPTIONS
	* @return 
	*/
	this.build_search_options = function(dato_form) {
				
		var obj = dato_form.reduce(function(o, v, i) {

				if(v.value.length>0 && v.value!='[]' && v.value!='{}' && v.name.indexOf("_operator")<0) { // Only include no empty vars and exclude operator vars

					if ( v.name.indexOf("_array")>0 ) { // Case array values like checkboxes (name html input like 'oh20_array')
						var current_name = v.name.substring(0,v.name.indexOf("_array")) // Reduce name as tipo like oh20 from 'oh20_array'
						if (!o[current_name]) {o[current_name]=[]}; // If not exists, create var as array
						o[current_name].push( v.value )			// Add value to existing array
					}else{
						o[v.name] = v.value // Default string values
					}
				}	
				return o
			}, {});
			//console.log(obj); return;
			

		var comparison = dato_form.reduce(function(o, v, i) {
			if(v.name.indexOf("_comparison_operator") > 0){
				o[v.name] = v.value		
			}	
			return o
		}, {});

		var logical = dato_form.reduce(function(o, v, i) {
			if(v.name.indexOf("_logical_operator") > 0){
				o[v.name] = v.value	
			}	
			return o
		}, {});

		var comparison_operator = {}
		for(var key in comparison){
				comparison_operator[key.substring(0,key.indexOf("_comparison_operator"))] = comparison[key]
		}

		var logical_operator = {}
		for(var key in logical){
				logical_operator[key.substring(0,key.indexOf("_logical_operator"))] = logical[key]
		}

		var sql = {
			comparison_operator	: comparison_operator,
			logical_operator	: logical_operator

		}

		var current_section_tipo 		= obj.section_tipo,
			current_max_rows 			= obj.max_rows,
			current_modo 				= obj.modo,
			current_options_sesion_key	= obj.search_options_session_key,
			context 					= obj.context

			//return 	console.log(context);

		// Clean final obj to send as filter_by_search var
		delete obj.section_tipo
		delete obj.max_rows
		delete obj.modo
		delete obj.search_options_session_key
		delete obj.context // Delete context as field

		// Create obj options to send to load_rows
		var options = {	
						section_tipo 	 			: current_section_tipo,
						modo 	 					: current_modo,
						search_options_session_key	: current_options_sesion_key,
						context 	 				: context,
						limit 	 		 			: current_max_rows,
						tipo_de_dato_search			: 'dato',
						filter_by_search 			: obj,
						operators					: sql,
						offset 	 		 			: 0,
						offset_list 	 		 	: 0,
					}
					if(SHOW_DEBUG===true) {
						console.log("DEBUG build_search_options: ",options);
					}

		return options
	};//end build_search_options



	/**
	* SEARCH
	*/
	this.Search = function(obj_form) {

		//console.log(obj_form);	
		var dato_form = $(obj_form).serializeArray()
			//console.log(dato_form);

		// build_search_options
		var options = this.build_search_options(dato_form)
			//console.log(options); return;

		// Section wrap				
		var section_wrap = find_ancestor(obj_form, 'css_section_wrap')
			if (!section_wrap) {
				console.log("Error on locate css_section_wrap div");
				return false;
			}
		// Virtual button object used to reference / store search options fallback when no options are available (optional)
		var virtual_button_obj = section_wrap.querySelector('.paginator_first_icon')
			if (!virtual_button_obj) {
				console.log("Error on locate paginator_first_icon element");
				return false;
			}

		// Trigger load rows from ajax
		var js_promise = this.load_rows(options, virtual_button_obj)

		// Hide form (filter_tap)
			var button_filter = document.querySelector("[data-tab_id='filter_tap']")
				if(button_filter) {
					button_filter.click();
				}
			/*
			var from_content = document.querySelectorAll(".css_rows_search_content")[0]
				if (from_content) {
					//from_content.style.display='none'
				}
				*/			

		return js_promise
	};//end Search



	/**
	* RESET FORM
	*/
	this.reset_form = function(obj_form, tab_click) {

		// Get section tipo from form hidden input
		/*
		var section_tipo 						= $("input[name='section_tipo']", obj_form).val(),
			current_modo 						= $("input[name='modo']", obj_form).val(),
			current_search_options_session_key  = $("input[name='search_options_session_key']", obj_form).val()
			*/

		var section_tipo 						= obj_form.querySelectorAll("input[name='section_tipo']")[0].value,
			current_modo 						= obj_form.querySelectorAll("input[name='modo']")[0].value,
			current_search_options_session_key	= obj_form.querySelectorAll("input[name='search_options_session_key']")[0].value


		var options = {	
						section_tipo 				: section_tipo,
						modo 		 				: current_modo,
						search_options_session_key  : current_search_options_session_key,
						context 	 				: obj_form.context.value,
						offset 	 		 			: 0
					}
					//return	console.log(options);	
	
		// Section wrap				
		var section_wrap 	   = find_ancestor(obj_form, 'css_section_wrap')
			if (!section_wrap) {
				console.log("Error on locate css_section_wrap div");
				return false;
			}
		// Virtual button object used to reference / store search options fallback when no options are available (optional)
		var virtual_button_obj = section_wrap.querySelector('.paginator_first_icon')
			if (!virtual_button_obj) {
				console.log("Error on locate paginator_first_icon element");
				return false;
			}

		// Trigger load rows from ajax
		this.load_rows(options, virtual_button_obj)

		var js_promise = $(obj_form).trigger("reset")

		// Default tab_click is true
		if(typeof tab_click=="undefined") {
			tab_click = true
		}

		if (tab_click===true) {
			var button_filter = document.querySelector("[data-tab_id='filter_tap']")
			if(button_filter) {
				button_filter.click();
			}
		}		

		return js_promise
	};//end reset_form



	/**
	* CHECK_SUBMIT
	*/
	this.check_submit = function(form_obj, event) {

		if(event && event.keyCode === 13) {
			//document.forms[0].submit();
			//trigger('event name')css_button_search 
			event.preventDefault()
			$(form_obj).find('.css_button_search').trigger('click');
		}
	};//end check_submit
	

	
	/**
	* COMPARATION_OPERATOR_OPTIONS
	* @param object select_obj
	*/
	this.ar_component_input_container = {}
	this.comparation_operator_options = function(select_obj) {

		var current_value 	 = select_obj.value,
			tipo 			 = select_obj.dataset.tipo,
			id_component 	 = "search_component_"+tipo,
			id_component_temp= "search_component_temp_"+tipo


		switch(current_value){

			case('IS NOT NULL'):
			case('IS NULL'):
				var component_input_container = document.getElementById(id_component);					

				// Container not exists (because already is changed). Nothing to do
				if (component_input_container==null) {
					// If component_temp already exists, only changes it attr value
					var new_component_input_container = document.getElementById(id_component_temp)
					if (new_component_input_container!=null) {
						new_component_input_container.setAttribute("value", '*');
						new_component_input_container.setAttribute("style", 'display: none');
					}
					return false;
				}
				
				// Create new temp element with default value
				var new_component_input_container = document.createElement("input");
					new_component_input_container.setAttribute("type", "text");
					new_component_input_container.setAttribute("name", tipo);
					new_component_input_container.setAttribute("id", id_component_temp);
					//new_component_input_container.setAttribute("disabled", true);
					//new_component_input_container.setAttribute("class", 'input_css_section_id');
					new_component_input_container.setAttribute("style", 'display: none');
					new_component_input_container.setAttribute("value", '*');


				// Store original container element for recover later
				this.ar_component_input_container[tipo] = component_input_container					

				// Remove original element from DOM
				component_input_container.remove()

				// Add temporal element to DOM
				select_obj.parentNode.insertBefore(new_component_input_container, select_obj.nextSibling);
				// Add space to adjust space between select and input
				new_component_input_container.parentNode.insertBefore(document.createTextNode(" "), new_component_input_container);
				break;

			default:
				// When current tipo is already stored, restore original
				if ( typeof this.ar_component_input_container[tipo]!='undefined' ) {
					// Remove temp element from DOM
					document.getElementById(id_component_temp).remove()
					// Add stored original element to DOM
					select_obj.parentNode.insertBefore(this.ar_component_input_container[tipo], select_obj.nextSibling);
					// Remove element from stored var
					delete this.ar_component_input_container[tipo]					
				}
				break;
		}
		//console.log(this.ar_component_input_container);
	};//end comparation_operator_options



	/**
	* TOGGLE_FILTER_SEARCH_TAP
	* @return 
	*/
	this.toggle_filter_search_tap = function() {

		let open_search2_button = document.getElementById("open_search2_button")
			open_search2_button.click();		
		/*
		$('.css_rows_search_tap').next('.tab_content').toggle(100);
		if (get_localStorage($('.css_rows_search_tap').data('tab_id'))==1) {
			remove_localStorage($('.css_rows_search_tap').data('tab_id'));
		}else{
			set_localStorage($('.css_rows_search_tap').data('tab_id'), 1);
		}
		*/
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


}//end section_list