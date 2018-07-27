"use strict";
/**
* EXTENSION_AUTOCOMPLETE
*
*
*/
var extension_autocomplete = new function() {


	this.url_trigger = DEDALO_LIB_BASE_URL + '/extensions/extension_autocomplete/trigger.extension_autocomplete.php'
	this.ajax_container
	this.tipo
	this.parent
	this.current_tipo_section
	this.propiedades
	this.label
	this.wrapper_id
	this.cookie_name;
	this.limit = 0; // Max items to manage (zero to unlimited)
	this.save_arguments = {}


	/**
	* INIT
	* @return 
	*/
	this.init = function(options) {

		let self = this;

		// Init filter by list
		self.init_filter_by_list({
			wrapper_id  : options.wrapper_id,
			cookie_name : options.cookie_name,
			limit 		: options.limit
		})
		
		return true
	};//end init



	/**
	* INIT_FILTER_BY_LIST
	* @return 
	*/
	this.init_filter_by_list = function(options) {
		
		let wrapper = document.getElementById(options.wrapper_id)	
			if (wrapper===null) {
				console.log("Error. Wrapper not found. " + options.wrapper_id);
				return false;
			}
		// set_filter_sections . Read from cookie if exists and update ul list
		this.set_filter_sections(wrapper, options.cookie_name)


		return true
	};//end init_filter_by_list


	/**
	* ACTIVATE
	* This method is invoked when user click on input text field of current component
	*/
	this.activate = function(input_obj) {
		
		const self = this		

		// From component wrapper		
		const wrap_div = find_ancestor(input_obj, 'wrap_component')
			if (wrap_div === null ) {
				if(SHOW_DEBUG===true) console.log(input_obj);
				return alert("[extension_autocomplete:activate]: Sorry: wrap_div dom element not found")
			}		

		var cache = {};
		$(input_obj).autocomplete({
			delay 	 : 250,
			minLength: 1,
			source 	 : function( request, response ) {

				// Component default behavior
				self.on_source({
					request 	 : request,
					response 	 : response,
					wrap_div 	 : wrap_div,
					input_obj 	 : input_obj,
					component_js : self,
					cache 		 : cache
				})	
			},
			// When a option is selected in list
			select: function( event, ui ) {

				// Default behavior
				self.on_select({
					event 		 : event,
					ui 			 : ui,
					input_obj 	 : input_obj,
					params 		 : {},
					component_js : self
				})				
			},
			// When a option is focus in list
			focus: function( event, ui ) {				
				event.preventDefault();			    	
			},
			change: function( event, ui ) {				
				this.value = ''   		
			},
			response: function( event, ui ) {				
			}			
		})
		

		return true
	};//end this.activate



	/**
	* ON_SOURCE
	* @return 
	*/
	this.on_source = function(options) {

		const self = this

		let start = new Date().getTime();

		const request 		= options.request 
		const response		= options.response
		const wrap_div		= options.wrap_div
		const input_obj 	= options.input_obj
		const tipo 			= wrap_div.dataset.tipo
		const section_tipo 	= wrap_div.dataset.section_tipo
		const divisor 		= wrap_div.dataset.divisor
		const term  		= request.term
		
		const filter_fields 	  = input_obj.parentNode.parentNode.querySelectorAll("input.filter_fields_input")
		const filter_fields_len   = filter_fields.length

		// search_query_object
		const search_query_object = JSON.parse(wrap_div.dataset.search_query_object);
			//console.log("search_query_object",search_query_object);

		// Filter_sections
		const filter_sections = self.get_filter_sections(wrap_div)

		if (term!=="manual_trigger") {
			
			// Reset filter fields
			for (let j = 0; j < filter_fields_len; j++) {
				filter_fields[j].value = ''
			}

			// ar q split iterate
			let split_q = self.split_q(term)
			let ar_q 	= split_q.ar_q
			if (split_q.divisor==='|') {
				// PROPAGATE TO FILTER FIELDS
				for (let j = 0; j < filter_fields_len; j++) {
					if (ar_q[j]) {
						let q 		= ar_q[j]							
						let q_type 	= 'all'//self.determine_q_type(q)
						self.propagate_to_filter_field(filter_fields[j], ar_q[j], q_type) 
					}							
				}
			}else{											
				for (let i = 0; i < ar_q.length; i++) {
					let q 		= ar_q[i]
					let q_type 	= self.determine_q_type(q)
					// PROPAGATE TO FILTER FIELDS
					for (let j = 0; j < filter_fields_len; j++) {
						self.propagate_to_filter_field(filter_fields[j], q, q_type) 
					}					
				}
			}					
		}//end if (term!=="manual_trigger") 							

		self.rebuild_search_query_object(search_query_object, wrap_div, filter_fields, filter_sections)
		//search_query_object = self.set_search_query_object_q(search_query_object, term)
			//console.log("search_query_object", JSON.stringify(search_query_object.filter)); //return

		const trigger_vars = {
				mode 					: "autocomplete",
				tipo					: tipo,
				section_tipo 			: section_tipo,
				//ar_target_section_tipo: ar_target_section_tipo,
				//string_to_search 		: request.term,
				top_tipo 				: page_globals.top_tipo,
				//search_fields 		: search_fields,
				//filter_sections 		: filter_sections,
				divisor 				: divisor,
				search_query_object 	: JSON.stringify(search_query_object)
		}
		//return console.log("[extension_autocomplete.autocomplete] trigger_vars",trigger_vars); //return

		const js_promise = common.get_json_data(extension_autocomplete.url_trigger, trigger_vars).then(function(response_data) {
				if(SHOW_DEBUG===true) {
					console.log("[extension_autocomplete.autocomplete] response_data",response_data)
				}						
				//if (response_data!==null) {
				//	cache[ term ] = response_data.result;							
				//}					
				const label_value = service_autocomplete.convert_data_to_label_value(response_data.result)												

				response(label_value)

		}, function(error) {
				console.error("[extension_autocomplete.autocomplete] Failed get_json!", error);
		});

		return js_promise
	};//end on_source



	/**
	* ON_SELECT
	* Default action on autocomplete select event
	* @return bool true
	*/
	this.on_select = function(options) {

		const self = this

		// Prevent set selected value to autocomplete input
		options.event.preventDefault()
		// Clean input value
		options.input_obj.value = ''

		// wrap_div
		const wrap_div = find_ancestor(options.input_obj, 'wrap_component')
			if (!wrap_div) {
				alert("[on_select] Error on select wrapper");
				return false
			}

		const input_obj 	= options.input_obj
		const hidden_input  = wrap_div.querySelector('[data-role="autocomplete_dato_hidden"]')
		const div_valor		= wrap_div.querySelector('[data-role="autocomplete_valor"]')
		
		// Base vars
		const ui 	= options.ui
		const label = ui.item.label
		const value = JSON.parse(ui.item.value)

		if (value && typeof value==='object') {

			// Input text hidden tracks component value
			let current_input_value 	= hidden_input.value || []
			
			// parse json stored array of locators value
			let current_val 			= JSON.parse( current_input_value )
			// New value selected in list. Parse to proper compare with ar locator values
			let new_value 				= value
			
			// check if value already exits
			for (var key in current_val) {
				//if (JSON.stringify(current_val[key]) === JSON.stringify(new_value)) {
				// Compare js objects, NOT stringify the objects (fail somtimes)
				if (is_obj_equal(current_val[key], new_value)) {
					console.log("Value already exists (1). Ignored value: "+JSON.stringify(new_value)+" => "+label)
					return;
				}
			}
			
			const current_val_length = current_val.length + 1
			const limit 			 = parseInt(hidden_input.dataset.limit)
			if (limit>0 && (current_val_length > limit)) {
				const exceeded_limit = get_label.exceeded_limit
				alert (exceeded_limit + limit)
				return false
			}

			// Add new value to array
			current_val.push( new_value )

			//return console.log("current_val",current_val)
			//console.log(page_globals.modo);

			// INPUT HIDDEN . Set value to component input
			hidden_input.value = JSON.stringify(current_val)
				//console.log("hidden_input.value", hidden_input.value);
	
				//console.log("page_globals.modo:",page_globals.modo);
			switch(page_globals.modo){
				case 'edit':
					// Edit Save value 
					self.Save(hidden_input, {"reload":true})
					break;
				case 'list':
				case 'search':					
					// Component showed in search form
					component_common.fix_dato(input_obj,'extension_autocomplete')
				case 'tool_import_files':	
					// Search set hidden input value
					// New li element
					const new_li 	  = document.createElement('li')
					const new_li_button_delete = document.createElement('div')
						new_li_button_delete.classList.add('icon_bs','link','css_autocomplete_button_delete')
						new_li_button_delete.dataset.current_value = JSON.stringify(value)
						new_li_button_delete.addEventListener('click', function(event){
							extension_autocomplete.delete(this)
						}, false);

						new_li.appendChild(new_li_button_delete)
						new_li.appendChild( document.createTextNode(label) )

					// Add created li to ul
					div_valor.appendChild(new_li)

					//div_valor.innerHTML += "<li><div class=\"icon_bs link css_autocomplete_button_delete\" \
					//	data-current_value='"+JSON.stringify(value)+"' onclick=\"extension_autocomplete.delete(this)\"></div>"+ label + "</li>"					
					break;	
				default:
					break;
			}
		}

		// Search component mode
		//if (wrap_div.dataset.modo==="search") {
		//	component_common.fix_dato(hidden_input,'extension_autocomplete')
		//}				

		// Blur input
		options.input_obj.blur()

		return true
	};//end on_select



	/**
	* REBUILD_SEARCH_QUERY_OBJECT
	* Re-combines filter by fields and by sections in one search_query_object
	* @return bool
	*/
	this.rebuild_search_query_object = function(search_query_object, wrap_div, filter_fields, filter_sections) {
		
		const filter_sections_len = filter_sections ? parseInt(filter_sections.length) : 0;
		
		// input data
		const filter_fields_len = filter_fields.length
		let filter_fields_data 	= {}		
		for (let i = 0; i < filter_fields_len; i++) {		
			let tipo 				 = filter_fields[i].dataset.tipo
			filter_fields_data[tipo] = filter_fields[i].value
		}
		//console.log("filter_fields_data ",filter_fields_data)

		// filter_by_list
		let filter_by_list_tipo = false
		let filter_by_list 		= JSON.parse(wrap_div.dataset.filter_by_list)
		if (filter_by_list) {
			const filter_by_list_len = filter_by_list.length
			for (let i = 0; i < filter_by_list_len; i++) {
				filter_by_list_tipo = filter_by_list[i].component_tipo
			}			
		}

		// Selector operator
		const operator_selector = wrap_div.querySelector(".operator_selector")		
		let operator_selected   = (operator_selector) ? "$" + operator_selector.value : "$or";
		
		let clean_group = []
		// Iterate filter elements
		let filter_element = search_query_object.filter
		for (let operator in filter_element) {

			//console.log("operator, filter_element[operator]", operator, filter_element[operator]);			
			let group = filter_element[operator]

			let sub_group2 = {}
				sub_group2[operator_selected] = []

			group.forEach(function(search_unit, i) {
				//console.log("search_unit ",search_unit);

				let base_component_tipo 	= search_unit.path ? search_unit.path[0].component_tipo : false
				let current_component_tipo 	= search_unit.path ? search_unit.path[search_unit.path.length-1].component_tipo : false
					//console.log("current_component_tipo ",current_component_tipo);
				
				if (filter_sections_len>0 && base_component_tipo===filter_by_list_tipo) {
					
					let sub_group1 = {'$or':[]}					
					for (let k = 0; k < filter_sections_len; k++) {

						let locator 		= filter_sections[k]
						let new_search_unit = cloneDeep(search_unit)
						new_search_unit.q   = JSON.stringify(locator)
						// Remove all path filter_elements but first
						new_search_unit.path.splice(1)						
						// Add to group
						sub_group1['$or'].push(new_search_unit)
					}
					clean_group.push(sub_group1)
					
				}else{
					
					if (typeof filter_fields_data[current_component_tipo]!=="undefined") {

						let value = filter_fields_data[current_component_tipo]
						// If value is empty will be ignored in final object					
						if (value.length>0) {
							// Override q value
							search_unit.q = value		
							// When filter is not empy, send search_unit to a special subgroup
							if (filter_sections_len>0) {
								// Add to subgroup2
								sub_group2[operator_selected].push(search_unit)
							}else{
								// Add to subgroup
								clean_group.push(search_unit)
							}
						}//end if (value.length>0) 
					}
				}
				
			})//end group.forEach(function(search_unit, i)
			
			// When filter is not empy, add filled sub_group2
			if (filter_sections_len>0) {
				clean_group.push(sub_group2)
			}				
			//console.log(clean_group);

			// Overwrite filter value with modified group
			filter_element[operator] = clean_group

			break; // Only one is expected in fisrt level
		}//end for (let operator in filter_element) {
	
		// When filter_sections is not empy, use operator '$and' to exclude results by filter_sections
		if (filter_sections_len>0) {
			// Force and
			operator_selected = '$and'			
		}

		// New clean final filter
		const clean_filter = {}
			  clean_filter[operator_selected] = clean_group

		// Replaces old filter in search_query_object
		search_query_object.filter = clean_filter

		if(SHOW_DEBUG===true) {
			console.log("rebuild_search_query_object final clean_filter ",clean_filter);
		}
		//console.log("search_query_object ",search_query_object.filter[0]['$or'] );

		return true
	};//end rebuild_search_query_object


	/**
	* TOGGLE_OPTIONS
	* @return 
	*/
	this.toggle_options = function(button_obj) {

		const tipo = button_obj.dataset.tipo		
		
		const options_div = button_obj.parentNode.querySelector('.autosearch_options[data-tipo="'+tipo+'"]')
			//console.log(options_div);

		if (options_div.style.display==="block") {
			options_div.style.display = "";
		}else{
			options_div.style.display = "block";	
		}

		return true
	};//end toggle_options


	/**
	* PROPAGATE_TO_FILTER_FIELD
	* @return 
	*/
	this.propagate_to_filter_field = function(input_obj, q, q_type) {

		const ar_type_map = JSON.parse(input_obj.dataset.type_map)
		const len 		  = ar_type_map.length
			//console.log("ar_type_map",ar_type_map, " - q: ",q," - ",input_obj.name);

		// Force skip types on q_type = 'all'
		// console.log("len ",len, " - q_type: ",q_type);
		if (len>0 && q_type!=='all') {

			// type is defined for current element
			if(ar_type_map.indexOf(q_type)!==-1) {
				if (input_obj.value.length===0) {
					input_obj.value = q
				}else{
					input_obj.value = input_obj.value +" "+ q
				}
			}
		}else{
			// type is NOT defined in structure
			if (input_obj.value.length===0) {
				input_obj.value = q
			}else{
				input_obj.value = input_obj.value +" "+ q
			}
		}

		return true
	};//end propagate_to_filter_field



	/**
	* SPLIT_Q
	* @return array ar_q
	*/
	this.split_q = function(q) {

		let ar_q = []
		
		const regex = /"[^"]+"|'[^']+'|[^|\s]+|[^\s|]+/ug;
		const str 	= q
		let m;

		while ((m = regex.exec(str)) !== null) {
		    // This is necessary to avoid infinite loops with zero-width matches
		    if (m.index === regex.lastIndex) {
		        regex.lastIndex++;
		    }
		    
		    // The result can be accessed through the `m`-variable.
		    m.forEach((match, groupIndex) => {
		        //console.log(`Found match, group ${groupIndex}: ${match}`);
		        ar_q.push(match)
		    });
		}
		//console.log("ar_q ",ar_q);

		let divisor = false;		
		if (q.indexOf('|')!==-1) {
			divisor = '|'
		}	
		

		let result = {
			ar_q 	: ar_q,
			divisor : divisor
		}
		//console.log("split_q",result,q);

		return result
	};//end split_q



	/**
	* DETERMINE_Q_TYPE
	* @return string q_type
	*/
	this.determine_q_type = function(q) {

		let q_type = ''

		const str  = q

		//const regex_code 	= /^(\W{1,2})?\d+([.,\/-][\d])?(\D)?$/
		const regex_code 	= /^(\W{1,2})?\d+([.,\/-]+[\d\w]*)?(\D)?$/
		const regex_date  	= /^(\W{1,2})?([0-9]{1,12})-?([0-9]{1,2})?-?([0-9]{1,2})?$/ 	//  /^(\W{1,2})?(-?[0-9]{1,12})(-[0-9]{1,2})?(-[0-9]{1,2})?$/
		const regex_int  	= /^(\W{1,2})?\d+$/
	
		switch(true) {

			case (regex_date.exec(str) !== null) :
				q_type = 'date'
				break;

			case (regex_code.exec(str) !== null) :
				q_type = 'code'
				break;			

			case (regex_int.exec(str) !== null) :
				q_type = 'int'
				break;			

			default:
				q_type = 'string'
		}
		if(SHOW_DEBUG===true) {
			console.log("[determine_q_type] q_type for "+q+" : ",q_type);
		}
		

		return q_type
	};//end determine_q_type



	/**
	* SET_SEARCH_QUERY_OBJECT_Q
	* @return 
	*/
	this.set_search_query_object_q = function(search_query_object, q) {
		
		let ar_filters = search_query_object.filter[0]['$or']
			//console.log(ar_filters);

		let len = ar_filters.length
		for (var i = len - 1; i >= 0; i--) {
			// Set q on each element
			ar_filters[i].q = q
		}	

		return search_query_object
	};//end set_search_query_object_q



	/**
	* SEARCH_FROM_FILTER_FIELDS
	* @return 
	*/
	this.search_from_filter_fields_busy = false
	this.search_from_filter_fields = function(input_obj) {

		let self = this

		const component_modelo_name = input_obj.dataset.modelo

		/*let component_js 	= window[component_modelo_name]
		let selected_wrap 	= find_ancestor(input_obj, 'wrap_component')
		let dato 			= component_js.get_dato(selected_wrap)
			console.log("search_from_filter_fields dato:",dato);*/

		// From component wrapper		
		const wrap_div = find_ancestor(input_obj, 'wrap_component')
		
		//if (self.search_from_filter_fields_busy===false) {
			const autocomplete_search_field = wrap_div.querySelector(".css_autocomplete_search_field")

			self.search_from_filter_fields_busy = true
			setTimeout(function() {
				
				// Trigger autocomplete
				$(autocomplete_search_field).autocomplete( "search", "manual_trigger" );					
				
				self.search_from_filter_fields_busy = false
			}, 200)
		//}

		return true
	};//end search_from_filter_fields




	/* FILTER_BY_LIST
	------------------------------------------------------------------ */



	/**
	* SELECT_ALL_FILTER_SECTIONS
	* Check or uncheck all elements at once
	*/
	this.select_all_filter_sections = function(input_obj, cookie_name) {

		var wrap_div 	= find_ancestor(input_obj, 'wrap_component')
		var list_ul		= wrap_div.querySelector('ul.filter_by_list')
		var ar_inputs	= list_ul.querySelectorAll('input')
		var len 		= ar_inputs.length

		for (var i = len - 1; i >= 0; i--) {
			ar_inputs[i].checked = input_obj.checked
		}

		this.save_filter_sections(input_obj, cookie_name)
	}//end select_all_filter_sections



	/**
	* SAVE_FILTER_SECTIONS
	* Cookie stores current list values as json encoded array
	*/
	this.save_filter_sections = function(input_obj, cookie_name) {

		const wrap_div 		  = input_obj.parentNode.parentNode.parentNode.parentNode;
		const filter_sections = JSON.stringify(this.get_filter_sections(wrap_div)) //  

		let autocomplete_search_field = wrap_div.querySelector(".css_autocomplete_search_field")

		if (autocomplete_search_field) {

			// Chek if autocomplete is instantiated before search (search mode case)
			let autocomplete_instance = $(autocomplete_search_field).autocomplete( "instance" );
			if (typeof autocomplete_instance!=="undefined") {
				// Trigger autocomplete
				$(autocomplete_search_field).autocomplete( "search", "manual_trigger" );
			}			
		}
		
		let cookie_create = createCookie(cookie_name, filter_sections, 365);
			//console.log(cookie_create, " cookie_name:",cookie_name," filter_sections:",filter_sections);
			//console.log( "cookie_name: ",cookie_name, readCookie(cookie_name) );

		return cookie_create;
	}//end save_filter_sections



	/**
	* GET_FILTER_SECTIONS
	* @return array of checked hierarchy_sections sections
	*/
	this.get_filter_sections = function(wrap_div) {
		
		let selected_values = false

		const list_ul = wrap_div.querySelector('ul.filter_by_list')
		if (list_ul) {
			selected_values = []
			let ar_inputs = list_ul.querySelectorAll('input')
			const len 	  = ar_inputs.length
			for (let i = len - 1; i >= 0; i--) {
				if(ar_inputs[i].checked) {
					let current_val = ar_inputs[i].value // 
					if (current_val!=='on') {
						selected_values.push( JSON.parse(current_val) )
					}					
				}
			}
		}	

		return selected_values;
	}//end get_filter_sections



	/**
	* SET_FILTER_SECTIONS
	* Reads cookie if exists and aply values to current list
	*/
	this.set_filter_sections = function(wrap_div, cookie_name) {

		let ar_values = readCookie(cookie_name)
			//console.log("set_filter_sections ar_values from cookie",ar_values,cookie_name);
			if (!ar_values) {
				return false;
			}
		
		let list_ul   = wrap_div.querySelector('ul.filter_by_list')
		let ar_inputs = list_ul.querySelectorAll('input')
		
		const len = ar_inputs.length
		for (let i = len - 1; i >= 0; i--) {
			if(ar_values.indexOf(ar_inputs[i].value)!==-1 && ar_inputs[i].value!=='on') {
				ar_inputs[i].checked = true
			}else{
				ar_inputs[i].checked = false
			}
		}
	}//end set_filter_sections



}//end extension_autocomplete