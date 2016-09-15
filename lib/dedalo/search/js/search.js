





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
				var max_pp_obj = document.querySelector('.css_max_rows');	if(max_pp_obj && max_pp_obj.value < 1) max_pp_obj.value = 5

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

		var url_vars = get_current_url_vars()
			if (!url_vars.auto_search) {
				return false;
			}

		var form_obj = document.getElementById('search_form')
		this.Search(form_obj)
	};//end auto_search



	/**
	* TOGGLE_SEARCH_OPERATORS
	* Show / hide operators dom elements on click button .toggle_search_operators
	*/
	this.toggle_search_operators = function(){
		var operator_elements = $('.css_operator_select');
		var i=0;
		var count = operator_elements.length;
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
	}//end toggle_search_operators



	/**
	* LOAD_ROWS : Ajax loads records
	*/
	this.load_rows = function(options, button_obj) {

		var start = new Date().getTime()

		// Target div		
		if (page_globals.modo==='edit') {
			var target = document.querySelector('.section_list_rows_content_div')
		}else{
			// Use find_ancestor from trigger button for proper select container when time_machine list is open
			var target = find_ancestor(button_obj, 'section_list_rows_content_div') //section_content_list
		}		
		if ( typeof target === 'undefined' || target === null ) {
			console.log("load_rows: Error. Sorry: target dom element not found. ("+page_globals.modo+")")
			return false;
		}

		// Wrap div
		var wrap_div = target.querySelector('.css_section_list_wrap')
			if (wrap_div === null ) {
				return alert("load_rows: Sorry: wrap_div dom element not found");
			}

		// Options fallback to default
		if (typeof options === 'undefined' || typeof options === null) {
			var options = $(button_obj).parents('.css_section_list_wrap').first().data('options');
			console.log("Using default options on load_rows");
		}
		
		// Options test mandatory vars
		if (typeof options.section_tipo === 'undefined' || typeof options.section_tipo === null) {
			return alert("Error: Few vars: section_tipo is mandatory: "+options.section_tipo)
		}
		if (typeof options.modo === 'undefined' || typeof options.modo === null) {
			return alert("Error: Few vars: modo is mandatory: "+options.modo)
		}		

		var mydata = {
					'mode' 		: 'load_rows',
					'options'	: JSON.stringify(options),	// Important. Convert json object options to string to send by ajax as text
					'top_tipo'	: page_globals.top_tipo
					}
					//return console.log(mydata);

		// Stop possible downloading videos on paginate
		common.stop_all_videos()

		// Active loading overlap
		html_page.loading_content( wrap_div, 1 )				

		// AJAX REQUEST
		$.ajax({
			url		: DEDALO_LIB_BASE_URL + '/section_records/trigger.section_records.php',
			data	: mydata,
			type 	: 'POST'
			//,processData: false//, contentType: "application/x-www-form-urlencoded"
		})
		// ALWAYS
		.always(function() {
			html_page.loading_content( wrap_div, 0 ) // Remove loading overlap
		})
		// DONE
		.done(function(received_data) {

			if (DEBUG) {
				var end  = new Date().getTime()
				var time_ajax = end - start
				//console.log("->load_rows: [time_ajax] "+" - ajax load time: " +time_ajax+' ms');
				//console.log(received_data);		
			}

			// Parse html text as object
			var el = document.createElement('div')
			el.innerHTML = received_data

			//var content = $(received_data).find("div.css_section_group_content:first>*")
			//var content = $(received_data).find("[data-rol='section_records']") //'[data-type="component_autocomplete_new_element"]'
			var content_obj = el.querySelectorAll("[data-rol='section_records']")[0]
				if(typeof content_obj === 'undefined') {
					return alert('Error on parse received data: \n' + received_data)
				}
			var target_obj  = target.querySelectorAll("[data-rol='section_records']")[0]
				if(typeof target_obj === 'undefined') {
					return alert('Error on place received data. Target DOM obj (data-rol="section_records") not found')
				}

			/*
			// Replace container content with inner_content
			$container.html(
				//common.get_inner_html(received_data)
				//$(received_data).find("div.css_section_group_content:first>*")
				content
				)
				*/
			
			// Replace DOM object (don't exec javascript inside html loaded)
			//target_obj.parentNode.replaceChild(content_obj, target_obj);

			// JQuery replace option (replace and eval javascript code)
			//$(target_obj).html(content_obj)

			// Pure javascript option (replace content and exec javascript code inside)
			insertAndExecute(target_obj, content_obj)


			// Update page info labels
			if (page_globals.modo === 'edit') {

				html_page.taps_state_update()
				search.update_page_labels()
				search.move_paginator_to_inspector()

				// Update url to maintain record on user reloads page
				search.update_url( received_data, options )

				// LOCK_COMPONENTS : Reset user_section_locks
				// Unlock all components of current section
				if(typeof lock_components !== 'undefined') {
					lock_components.delete_user_section_locks()
				}

			}//end if (page_globals.modo=='edit') {


			if (DEBUG) {
				var end  = new Date().getTime();
				var time = end - start;
				console.log("->load_rows: [done] "+" - execution time: " +time+' ms' + ' (ajax:'+time_ajax+')')
			}
		})
		// FAIL ERROR 
		.fail(function(error_data) {
			if (DEBUG) {console.log(error_data)};	
		})
	};//end load_rows


	
	/**
	* UPDATE_URL
	* Updates url on paginate prevents loose record on refresh page
	*/
	this.update_url = function( received_data, options ) {		
					
		var current_section_id = $(received_data).find('#current_record_wrap').first().data('section_id')

		var url 		 = window.location.search.substring(1), // Current url vars like ?id=1&...
			//url 		 = remove_url_variable('offset', url), // Remove offset var
			keyString 	 = 'id', // Key to change
			replaceString= current_section_id,  // new value for replace old
			url 		 = change_url_variable(url, keyString, replaceString),  // Change value in url 
			keyString 	 = 'offset', // Key to change
			replaceString= options.offset,  // new value for replace old
			url 		 = change_url_variable(url, keyString, replaceString)  // Change value in url
	
		history.pushState({}, null, '?'+url) // Replace url portion of vars

		page_globals._parent = current_section_id
	};//end update_url	



	/**
	* RELOAD_ROWS_LIST
	*/
	this.reload_rows_list = function (call_uid) {

		var caller_obj = $('#'+call_uid);
			if ($(caller_obj).length<1) {
				console.log("Error on find caller_obj element with call_uid: "+call_uid);
				return false;
			}

		var options 	= $('#'+call_uid).data('options'),	// options data are stored in json format on wrap div like 'wrap_dd1140_list'
			button_obj 	= $('#'+call_uid).find('.paginator_first_icon').first() // Any button inside is valid

			// If button paginator not exits, reload complete page
			if ($(button_obj).length<1) {
				window.location.href = window.location.href;
				return false;
			}
		search.load_rows(options, button_obj)
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
	};



	/**
	* SEARCH
	*/
	this.Search = function(obj_form) {

		//console.log(obj_form);	
		var dato_form = $(obj_form).serializeArray()
			//console.log(dato_form);
		var obj = dato_form.reduce(function(o, v, i) {

				if(v.value.length >0 && v.value!='[]' && v.value!='{}' && v.name.indexOf("_operator")<0) { // Only include no empty vars and exclude operator vars

					if ( v.name.indexOf("_array")>0 ) { // Case array values like checkboxes (name html input like 'oh20_array')
						var current_name = v.name.substring(0,v.name.indexOf("_array")) // Reduce name as tipo like oh20 from 'oh20_array'
						if (!o[current_name]) {o[current_name]=[]}; // If not exists, create var as array
						o[current_name].push(v.value)			// Add value to existing array
					}else{
						o[v.name] = v.value // Default string values
					}
				}	
				return o
			}, {});
			//console.log(obj);	return;
			

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
					//return console.log(options);

		if (DEBUG) {
			console.log(options);
		}
		
		//var virtual_button_obj = $(obj_form).parents('.css_section_wrap').first().find('.paginator_first_icon').first()[0]
		var virtual_button_obj = find_ancestor(obj_form, 'css_section_wrap').querySelector('.paginator_first_icon')	
			//console.log(virtual_button_obj); return;

		this.load_rows( options, virtual_button_obj )
		return false
	};//end Search



	/**
	* RESET FORM
	*/
	this.reset_form = function(obj_form) {
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

		//var virtual_button_obj = $(obj_form).parents('.css_section_wrap').first().find('.paginator_first_icon').first()[0]		
		var virtual_button_obj = find_ancestor(obj_form, 'css_section_wrap').querySelector('.paginator_first_icon')		
			//console.log(virtual_button_obj);

		this.load_rows(options, virtual_button_obj)

		$(obj_form).trigger("reset")

		return false
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




}//end section_list




