// import
import {data_manager} from '../../../common/js/data_manager.js'

/**
* SERVICE_AUTOCOMPLETE
* Used as service by component_autocomplete, component_autocomplete_hi, 
* component_relation_parent, component_relation_children, component_relation_related
*
*/
export const service_autocomplete = function() {


	this.external_relation_type = 'dd687'

	// sections_without_filter_fields . exclude this section to build dom filter fields
	this.sections_without_filter_fields = ['zenon1']

	/**
	* INIT
	* @return bool
	*/
	this.init = function(options) {

		const self = this



		self.instance_caller 		= options.caller
		self.wrapper 				= options.wrapper
		self.sqo_context			= self.instance_caller.sqo_context
		self.ar_search_section_tipo	= self.sqo_context.find((current_item)=> current_item.typo === 'sqo').section_tipo

		// Vars
			self.tipo 				= self.instance_caller.tipo
			self.properties 		= self.instance_caller.context.properties || {}

		// Custom events defined in propiedades			
			self.custom_events = (self.properties.custom_events) ? self.properties.custom_events : []

		// Build_autocomplete_input input 
		self.build_autocomplete_input()

		return true
		
	};//end init



	/**
	* DESTROY
	* @return bool
	*/
	this.destroy = function(){

		const self = this
		self.searh_container.remove()

	}// end destroy


	/**
	* BUILD_AUTOCOMPLETE_INPUT
	* Create the html of input search autocomplete
	* @return
	*/
	this.build_autocomplete_input = function() {

		const self = this

		const list_name = self.instance_caller.id + "_" + new Date().getUTCMilliseconds()

		//search container
			self.searh_container = common.create_dom_element({
				element_type 	: "div",
				class_name 	 	: "autocomplete_searh_container", // css_autocomplete_hi_search_field 
				parent 			: self.wrapper
			})
		
		//search field
			self.search_input = common.create_dom_element({
				element_type 	: "input",
				type 			: 'text',
				class_name 	 	: "autocomplete_input",
				parent 			: self.searh_container
			})
			self.search_input.setAttribute("list", list_name)
			self.search_input.setAttribute("placeholder", get_label.buscar + '...')
			self.search_input.setAttribute("autocomplete", "off")
			self.search_input.setAttribute("autocorrect", "off")
		
		// datalist
			self.datalist = common.create_dom_element({
				element_type	: 'ul',
				id 				: list_name,
				class_name 	 	: "autocomplete_data",
				parent 			: self.searh_container
			})

		// event change the input value fire the serarch
			self.search_input.addEventListener('input', async function(e){
				const api_response = await self.autocomplete_search(this.value)
				const options = self.autocomplete_build_options(api_response)
			}, false);

		
		return true
	};//end build_autocomplete_input



	/**
	* AUTOCOMPLETE_BUILD_OPTIONS
	* @return 
	*/
	this.autocomplete_build_options = function(api_response) {

		const self = this
		const datalist = self.datalist
		//delete the last list
		while (datalist.firstChild) {
			datalist.removeChild(datalist.firstChild)
		}
		// get the result from the api response
		const result = api_response.result
		const data = result.data
			console.log("data:",data);
		// get the sections that was serarched
		const ar_search_sections = self.ar_search_section_tipo

		// itterate the sections
		for (const current_section of ar_search_sections) {
			// get the ar_section_id founded
			const ar_section_id = data.find((item)=> item.tipo === current_section).value;
			const current_section_length = ar_section_id.length
			// get data that mach with the current section from the global data sended by the api
			const current_section_data = data.filter((item)=> item.section_tipo === current_section)
			// get dd objects from the context that will be used to build the lists in correct order 
			const current_ddo = self.sqo_context.filter((item)=> item.section_tipo === current_section && item.parent === current_section)
			// get the list with the loop of the section_id founded
			for (let i = 0; i < current_section_length; i++) {
				// get the full row with all items in the ddo that mach with the section_id
				const current_row = current_section_data.filter((item)=> item.section_id === ar_section_id[i])
				// build the locator of the row
				const current_locator =  { 
					section_id 		: ar_section_id[i],
					section_tipo	: current_section
				}
				// create the li node container
				const li_node = common.create_dom_element({
					element_type	: 'li',
					class_name 	 	: "autocomplete_data_li",
					dataset 		: {value : JSON.stringify(current_locator)},
					parent 			: self.datalist
				})
				// when the user do click in one row send the data to the caller_instance for save it.
				li_node.addEventListener('click', function(e){
					e.stopPropagation()
					const value = JSON.parse(this.dataset.value)
					self.instance_caller.add_value(value)
	
				}, false);
				
				// build the text of the row with label nodes in correct order (the ddo order in context).
				for(const ddo_item of current_ddo){
					const current_value = current_row.find((item)=> item.tipo === ddo_item.tipo).value

					common.create_dom_element({
						element_type	: 'label',
						text_content	: current_value,
						parent 			: li_node
					})// end create dom node
				}// enf for ddo_item
			}// end for of current_section (section_id)
		}// end for of current_section (section_tipo)
	};//end autocomplete_build_options


	/**
	* AUTOCOMPLETE_SEARCH
	* @param object options {
	* 	component_tipo, section_tipo, divisor, search_query_object
	* }
	*/
	this.autocomplete_search = function(search_value){
		const self = this

		// Request term
			const q = search_value
			const search_query_object = self.rebuild_search_query_object(q);

		// todo get the serarch engine with the sqo_context
		//	const context_search = self.sqo_context.filter((current_item)=> current_item.typo === 'ddo')
		//	context_search.push(search_query_object)

			// search source selector
			//let search_engine = (search_options.search_engine !== null) ? search_options.search_engine : "search_dedalo";
			const search_engine = "search_dedalo";

			if(SHOW_DEBUG===true) {
				console.log("[service-autocomplete.autocomplete_search] search_engine:",search_engine);	 //return	
			}				

		// exec search
			const js_promise = this[search_engine](self.sqo_context)
	
		// test
			//const js_promise = this["search_zenon"](search_options)
			//	console.log("js_promise:",js_promise);

		return js_promise


	}//end autocomplete_search


	/**
	* REBUILD_SEARCH_QUERY_OBJECT
	* Re-combines filter by fields and by sections in one search_query_object
	* @return bool
	*/
	this.rebuild_search_query_object = function(q) {
	
		const self = this

		// search_query_object base stored in wrapper dataset

			const search_query_object = self.sqo_context.find((current_item)=> current_item.typo === 'sqo')
			if(SHOW_DEBUG===true) {
				//console.log("search_query_object:",search_query_object);
			}

		// search_sections. Mandatory. Always are defined, in a custom ul/li list or as default using wrapper dataset 'search_sections'
			const search_sections = search_query_object.section_tipo

		// filter_by_field_list. Optional. Uses propiedades config params
			const filter_by_field_list_tipo  	 = false//self.get_filter_by_field_list_tipo(wrap_div)
			const filter_by_field_list_value 	 = false//self.get_filter_by_field_list_value(wrap_div)
			const filter_by_field_list_value_len = false//filter_by_field_list_value ? filter_by_field_list_value.length : 0;	
			
		// filter_fields_data. Optional. Used when you give the user control to the search fields and operators (like component autocomplete)
			const filter_fields_data = false//self.get_filter_fields_data(wrap_div, q)
			if(SHOW_DEBUG===true) {
				//console.log("==== filter_fields_data:",filter_fields_data);				
			}

		// rebuild search_query_object filter
			// sections property
				//??????????	search_query_object.section_tipo = search_sections
			// filter property
			if (filter_by_field_list_tipo!==false || filter_fields_data!==false) {
				// Advanced mode
				if(SHOW_DEBUG===true) {
					console.log("==== filter_by_field_list_tipo:",filter_by_field_list_tipo, " - filter_fields_data:", filter_fields_data);
				}

				// operator. Selector operator
					const operator_selector = wrap_div.querySelector(".operator_selector")		
					let operator_selected   = (operator_selector) ? "$" + operator_selector.value : "$or";

				// split. Selector split
					const split_selector 	= wrap_div.querySelector(".split_selector")	
					let split_selected   	= (split_selector) ? JSON.parse(split_selector.value) : true;
				
				let clean_group 	= []
				let filter_element 	= search_query_object.filter

				// Iterate current filter
				for (let operator in filter_element) {
				
					// Current group
					let group = filter_element[operator]

					// New group
					let sub_group2 = {}
						sub_group2[operator_selected] = []

					// Iterate filter main group
					group.forEach(function(search_unit, i) {
						const base_component_tipo = search_unit.path ? search_unit.path[0].component_tipo : false
						const last_component_tipo = search_unit.path ? search_unit.path[search_unit.path.length-1].component_tipo : false
						
						// q_split
						search_unit.q_split = split_selected

						if (base_component_tipo===filter_by_field_list_tipo && filter_by_field_list_value_len>0) {
							// Add filter_by_field_list value to filter
							let sub_group1 = {'$or':[]}
							for (let k = 0; k < filter_by_field_list_value_len; k++) {

								let locator 		= filter_by_field_list_value[k]
								let new_search_unit = cloneDeep(search_unit)
								new_search_unit.q   = JSON.stringify(locator)
								// Remove all path filter_elements but first
								new_search_unit.path.splice(1)
								// Add to group
								sub_group1['$or'].push(new_search_unit)
							}
							clean_group.push(sub_group1)
						
						}else{
							// Add fields values to filter
							if (filter_fields_data && typeof filter_fields_data[last_component_tipo]!=="undefined") {

								let value = filter_fields_data[last_component_tipo] || [] // Always use 'last_component_tipo' here (!)
								
								// If value is empty will be ignored in final object
								if (value.length>0) {
										
									// Override q value
									search_unit.q = value		
									// When filter is not empy, send search_unit to a special subgroup
									if (filter_by_field_list_value_len>0) {
										// Add to subgroup2
										sub_group2[operator_selected].push(search_unit);
									}else{
										// Add to subgroup
										clean_group.push(search_unit)
									}
								};//end if (value.length>0) 
							}
						}
						
					})//end group.forEach(function(search_unit, i)

					// When filter is not empy, add filled sub_group2
					if (filter_by_field_list_value_len>0) {
						clean_group.push(sub_group2)
					}

					// Overwrite filter value with modified group
					filter_element[operator] = clean_group

					break; // Only one is expected in fisrt level
				};//end for (let operator in filter_element) {

				// When filter_sections is not empy, use operator '$and' to exclude results by filter_sections
				let main_operator = operator_selected
				if (filter_by_field_list_value_len>0) {
					// Force and
					main_operator = '$and'
				}

				// New clean final filter
				const clean_filter = {}
					  clean_filter[main_operator] = clean_group

				// Replaces old filter in search_query_object
				search_query_object.filter = clean_filter
						
			}else{

				let filter_element 	= search_query_object.filter
				
				// Iterate current filter
				for (let operator in filter_element) {

					const current_filter = filter_element[operator]

					for (var i = 0; i < current_filter.length; i++) {
		
						// Update q property
						current_filter[i].q 	  = (q !== "") ? "*" + q + "*" : "NULL" // Begins with
						current_filter[i].q_split = false
						
					}
				
				}
				// Default basic mode (autocomplete hi)
				//const operator  = Object.keys(search_query_object.filter)[0] || '$and'
				//const key 		= 0
				
				
				// Update wrapper dataset (only in this modo)
				//	wrap_div.dataset.search_query_object = JSON.stringify(search_query_object)			
			}

			// allow_sub_select_by_id set to false to allow select deep fields
				search_query_object.allow_sub_select_by_id = false		

		// Debug
			if(SHOW_DEBUG===true) {
				//console.log("... search_query_object:",search_query_object, JSON.stringify(search_query_object));
				//console.log("... search_query_object filter:",search_query_object.filter);
				//if(typeof clean_filter!=="undefined") console.log("+++ rebuild_search_query_object final clean_filter ",clean_filter);
			}
				

		return search_query_object	
	};//end rebuild_search_query_object



	/**
	* SEARCH_DEDALO
	* @return promise 
	*/
	this.search_dedalo = async function(search_query_object) {
			
		const current_data_manager 		= new data_manager()
		const load_section_data_promise = current_data_manager.autocomplete_load_data(search_query_object)
		
		// render section on load data
	 		const api_response = await load_section_data_promise

		return api_response

	};//end search_dedalo





/**************************************************/



	/**
	* INIT
	* @return bool
	*/
	this.init_OLD = function(request_options) {
	
		const self = this
		
		const options = {
			component_js    	 : null,
			autocomplete_wrapper : null
		}
		for(let key in request_options) {
			if (options.hasOwnProperty(key)) { options[key] = request_options[key] }
		}

		if (page_globals.modo==='tool_time_machine') {
			return true;
		}

		const wrapper = options.autocomplete_wrapper
			if (!wrapper) {
				alert("Error. Invalid wrapper");
				return false
			}
	
		// Build_autocomplete_input input 
		const input_obj = self.build_autocomplete_input({
			parent : wrapper
		})
		// Activate autocomplete on click
		input_obj.addEventListener("click", function(e){
			// Activate
			self.activate(input_obj, options.component_js)
		}, false)


		return true
	};//end init


 	/**
	* ACTIVATE
	* This method is invoked when user clicks on input text field of current component
	*/
	let cache = {};
	this.activate_OLD = function( input_obj, component_js ) {
		
		const self = this

		// wrap_div . From component wrapper
			const wrap_div = find_ancestor(input_obj, 'wrap_component')
				if (wrap_div===null) {
					if(SHOW_DEBUG) console.log(input_obj);
					return alert("service_autocomplete:activate: Sorry: wrap_div dom element not found")
				}

		// Vars
			const tipo 				= wrap_div.dataset.tipo
			const component_info	= (wrap_div.dataset.component_info) ? JSON.parse(wrap_div.dataset.component_info) : {}
			const propiedades 		= component_info.propiedades || {}
			const wrap_id 			= wrap_div.dataset.section_tipo +'_'+ wrap_div.dataset.tipo+'_'+wrap_div.dataset.parent

		// Custom events defined in propiedades			
			const custom_events = (propiedades.custom_events) ? propiedades.custom_events : []
			if(SHOW_DEBUG===true) {
				console.log("[service_autocomplete.activate] custom_events:",custom_events)
			}

		
		$(input_obj).autocomplete({
			delay 		: 300,
			minLength 	: component_js.min_length || 1,
			source: function( request, response ) {

				// Cache
					//const uid = tipo + '_' + request.term
					//if ( uid in cache ) {
					//	if(SHOW_DEBUG===true) {
					//		//console.log("From cache!!: ",uid);;
					//	}
					//	response(cache[uid])
					//	return;
					//}
								
				// Request term
				const q = request.term
				// Get wrap_div base search_query_object and updates with user input value

				// rebuild_search_query_object with fallback
					//const search_query_object = typeof(component_js.rebuild_search_query_object)!=="undefined" ? component_js.rebuild_search_query_object(wrap_div, q) : self.rebuild_search_query_object(wrap_div, q);
					// search_query_object build

					// search engine
						let search_engine   = "search_dedalo";
						let selected_fields = null;
						const source_selector = document.getElementById('select_autosearch_options_'+wrap_id)
						if (source_selector) {
							const selector_source 		= JSON.parse(source_selector.options[source_selector.selectedIndex].dataset.source);
							search_engine 				= selector_source.search_engine;
							const original_ar_elements 	= JSON.parse(source_selector.dataset.source);
							selected_fields 		= original_ar_elements.ar_elements.filter(element => element.section_tipo===selector_source.section_tipo)
						}				

					const search_query_object = self.rebuild_search_query_object2(wrap_div, q);
		
					
				// Search
					const search_options = {						
						component_tipo 		: wrap_div.dataset.tipo,
						section_tipo 		: wrap_div.dataset.section_tipo,
						divisor 			: wrap_div.dataset.divisor || " | ",
						search_query_object : search_query_object,
						wrap 				: wrap_div,
						search_engine		: search_engine,
						selected_fields 	: selected_fields,
						q 					: q
					}					
					self.autocomplete_search(search_options)
					.then(function(response_data){
						if(SHOW_DEBUG===true) {
							console.log("[service_autocomplete.activate] response_data:",response_data);
						}
							
						// Format result for use in jquery label / value
						const label_value = self.convert_data_to_label_value(response_data)
						
						// Exec response callback for jquery source
						response(label_value)
					})
			},
			// When a option is selected in list
			select: function( event, ui ) {
				event.preventDefault();
				event.stopPropagation();

				const custom_events_select = custom_events.filter(item => item.hasOwnProperty("select"))
				if (custom_events_select.length>0) {

					// Custom behavior
					for (let i = 0; i < custom_events_select.length; i++) {
						const fn = custom_events_select[i].select						
						component_js[fn]({
							event 		 : event,
							ui 			 : ui,
							input_obj 	 : this,
							params 		 : custom_events_select[i].params || {},
							component_js : component_js,
							wrap_div 	 : wrap_div
						})
					}
					
				}else{

					// Default behavior
					if (typeof component_js.on_select!=="undefined") {
						// Component specific action
						component_js.on_select({
							event 		 : event,
							ui 			 : ui,
							input_obj 	 : this,
							params 		 : {},
							component_js : component_js,
							wrap_div 	 : wrap_div
						})
					}else{
						// Generic action
						self.on_select({
							event 		 : event,
							ui 			 : ui,
							input_obj 	 : this,
							params 		 : {},
							component_js : component_js,
							wrap_div 	 : wrap_div
						})
					}
				}
			},
			// When a option is focus in list
			focus: function( event, ui ) {
				event.preventDefault(); // prevent set selected value to autocomplete input
			},
			change: function( event, ui ) {
				this.value = ''
			},
			response: function( event, ui ) {
			}
		});//end $(this).autocomplete({	

		return true	
	};//end this.activate



	/**
	* AUTOCOMPLETE_SEARCH
	* @param object options {
	* 	component_tipo, section_tipo, divisor, search_query_object
	* }
	*/
	this.autocomplete_search_OLD = function(search_options){
		
		// check if there are selected values as section_tipo
			if (!search_options.search_query_object.section_tipo || search_options.search_query_object.section_tipo.length<1) {
				return new Promise(function(resolve, reject) {
					console.warn("Empty selected values as section. Ignored search!")
					resolve(false)
				})	
			}

		// search source selector
			let search_engine = (search_options.search_engine !== null) ? search_options.search_engine : "search_dedalo";
			
			if(SHOW_DEBUG===true) {
				console.log("[service-autocomplete.autocomplete_search] search_engine:",search_engine);	 //return	
			}				

		// exec search
			const js_promise = this[search_engine](search_options)
	
		// test
			//const js_promise = this["search_zenon"](search_options)
			//	console.log("js_promise:",js_promise);

		return js_promise
	}//autocomplete_search



	/**
	* SEARCH_DEDALO
	* @return promise 
	*/
	this.search_dedalo_OLD = function(search_options) {
		
		// trigger vars
			const url_trigger  = DEDALO_LIB_BASE_URL + "/services/service_autocomplete/trigger.service_autocomplete.php"
			const trigger_vars = {
					mode 	 			: 'autocomplete_search',
					component_tipo 		: search_options.component_tipo, 
					section_tipo 		: search_options.section_tipo,
					top_tipo 			: page_globals.top_tipo,
					divisor 			: search_options.divisor || " | ",
					search_query_object : search_options.search_query_object
				}; //console.log("*** [autocomplete_search.load_rows] trigger_vars", trigger_vars)

		// promise JSON XMLHttpRequest
			const js_promise = common.get_json_data(url_trigger, trigger_vars).then(function(response){
				if (SHOW_DEBUG===true) {
					if (!response.result) {
						console.warn("[services.autocomplete_search] response:",response);
						//console.log("[services.autocomplete_search] response "+response.msg +" "+ response.debug.exec_time);
					}
				}

				if (!response) {
					// Notify to log messages in top of page
					console.error("[services.autocomplete_search] Error. response is null", response);
					return null
				}else{
					// Return result
					return response.result
				}
			})

		return js_promise
	};//end search_dedalo



	/**
	* SEARCH_ZENON
	* @return 
	*/
	this.search_zenon = function(search_options) {
		
		const self = this

		if(SHOW_DEBUG===true) {
			//console.log("[search_zenon] search_options:",search_options);
			console.log("[search_zenon] source:", search_options);
		}

		const ar_selected_fields = search_options.selected_fields;
		const ar_fields = ar_selected_fields.map(field => field.fields_map[0].remote)

		// fields of Zenon "title" for zenon4
			const fields 		= ar_fields
			const fields_length = fields.length
		// section_tipo of Zenon zenon1
			const section_tipo 	= ar_selected_fields[0].section_tipo
			const relation_type = self.external_relation_type

		const q = search_options.q

	  	// format data
	  		const format_data = function(data){
	  			if(SHOW_DEBUG===true) {
	  				console.log("+++ data 1:",data);
					//console.log("+++ search_options 1:",search_options);
					//console.log("+++ source 1:",source);
	  			}				

				const data_formatted = []
				const records 		 = data.records || []
				const records_length = records.length
				for (let i = 0; i < records_length; i++) {					
					
					const record 	= records[i]
					const ar_value 	= []
					for (let j = 0; j < fields_length; j++) {
						
						const field = fields[j]						
						switch(field) {
							case 'authors':
								// console.log("++ authors:",record[field]);
								const authors_ar_value  = []
								const primary 			= record[field].primary
								const secondary 		= record[field].secondary
								const corporate 		= record[field].corporate
								const authors_separator = " - "
								
								if(SHOW_DEBUG===true) {
									//console.log("primary:",primary);	console.log("secondary:",secondary);	console.log("corporate:",corporate);
								}
								
								if (Object.keys(primary).length > 0) {
									authors_ar_value.push(Object.keys(primary).join(authors_separator))
								}
								if (Object.keys(secondary).length > 0) {
									authors_ar_value.push(Object.keys(secondary).join(authors_separator))
								}
								if (Object.keys(corporate).length > 0) {
									authors_ar_value.push(Object.keys(corporate).join(authors_separator))
								}
								ar_value.push(authors_ar_value.join(authors_separator))
								break;
							default:
								if (Array.isArray(record[field])) {
									if (record[field].length>0) {
										ar_value.push(record[field].join(', '))
									}
								}else{
									if (record[field].length>0) {
										ar_value.push(record[field])
									}									
								}
								break;
						}
					}//end iterate fields

					// value
						const value = ar_value.join(search_options.divisor)

					// locator
						const locator = {
							section_tipo 		: section_tipo,
							section_id 	 		: record['id'],
							type 		 		: self.external_relation_type,
							from_component_tipo : search_options.component_tipo
						}

					// build formatted item
						const result_item = {
							key 	: JSON.stringify(locator),
							label 	: value,
							value 	: value
						}

					// insert fomatted item
						data_formatted.push(result_item)

				}//end iterate recoords

				if(SHOW_DEBUG===true) {
					console.log("+++ data_formatted 2:",data_formatted);
				}
				
				return data_formatted
			}	
			
		// trigger vars
			const url_trigger  = "https://zenon.dainst.org/api/v1/search"
			const trigger_vars = {
					lookfor 	: q,
					type 		: "AllFields", // search in all fields							
					sort 		: "relevance",
					limit 		: 20,
					prettyPrint : false,
					lng 		: "de"		
				}; // console.log("*** [search_zenon] trigger_vars", trigger_vars, search_options)		

			let url_arguments = build_url_arguments_from_vars( trigger_vars )
			// const fields   = ["id","authors","title","urls","publicationDates"]
			for (let i = 0; i < fields_length; i++) {			
				url_arguments += "&field[]=" + fields[i]
			}

		// XMLHttpRequest promise
			return new Promise(function(resolve, reject) {

				const request = new XMLHttpRequest();

					// ready state change event
						// request.onreadystatechange = function() {
						// 	if (request.readyState == 4 && request.status == 200) {
						// 		//console.dir(request.response)
						// 		//console.dir(request.responseText);
						// 	}
						// }

					// open xmlhttprequest
						//request.open("POST", "https://zenon.dainst.org/api/v1/search?type=AllFields&sort=relevance&page=1&limit=20&prettyPrint=false&lng=de&lookfor=david", true);
						request.responseType = 'json';
						request.open("POST", url_trigger + "?" + url_arguments, true);

					// onload event
						request.onload = function(e) {
							if (request.status === 200) {

								// data format 
									const data = format_data(request.response)

								// If successful, resolve the promise by passing back the request response
									resolve(data);

							}else{
								// If it fails, reject the promise with a error message
								reject(Error('Reject error don\'t load successfully; error code: ' + request.statusText));
							}
						};

					// request error
						request.onerror = function(e) {
							// Also deal with the case when the entire request fails to begin with
							// This is probably a network error, so reject the promise with an appropriate message
							reject(Error('There was a network error. data_send: '+url+"?"+ data_send + "statusText:" + request.statusText));
						};

				// send the request
					request.send();

			})//end Promise		
	};//end search_zenon



	/**
	* ON_SELECT (GENERIC)
	* Default action on autocomplete select event
	* @return bool true
	*/
	this.on_select_OLD = function(options) {
		
		const self = this

		// Prevent set selected value to autocomplete input
		//options.event.preventDefault()
		// Clean input value
		options.input_obj.value = ''

		// Default behavior
		const ui 	= options.ui
		const label = ui.item.label
		const value = JSON.parse(ui.item.value)

		const wrap_div = options.wrap_div

		// Add locator (and saves in edit mode)
		// add_locator is a generic and needed function in each component tha use autocomplete
		options.component_js.add_locator(value, wrap_div, ui)

		// Blur input
		options.input_obj.blur()

		return true
	};//end on_select


	/**
	* REBUILD_SEARCH_QUERY_OBJECT2
	* Re-combines filter by fields and by sections in one search_query_object
	* @return bool
	*/
	this.rebuild_search_query_object2_OLD = function(wrap_div, q) {
	
		const self = this

		// search_query_object base stored in wrapper dataset
			const search_query_object = JSON.parse(wrap_div.dataset.search_query_object)
			if(SHOW_DEBUG===true) {
				//console.log("search_query_object:",search_query_object);
			}

		// search_sections. Mandatory. Always are defined, in a custom ul/li list or as default using wrapper dataset 'search_sections'
			const search_sections = self.get_search_sections(wrap_div)		

		// filter_by_field_list. Optional. Uses propiedades config params
			const filter_by_field_list_tipo  	 = self.get_filter_by_field_list_tipo(wrap_div)
			const filter_by_field_list_value 	 = self.get_filter_by_field_list_value(wrap_div)
			const filter_by_field_list_value_len = filter_by_field_list_value ? filter_by_field_list_value.length : 0;	
			
		// filter_fields_data. Optional. Used when you give the user control to the search fields and operators (like component autocomplete)
			const filter_fields_data = self.get_filter_fields_data(wrap_div, q)
			if(SHOW_DEBUG===true) {
				//console.log("==== filter_fields_data:",filter_fields_data);				
			}

		// rebuild search_query_object filter
			// sections property
			search_query_object.section_tipo = search_sections
			// filter property
			if (filter_by_field_list_tipo!==false || filter_fields_data!==false) {
				// Advanced mode
				if(SHOW_DEBUG===true) {
					console.log("==== filter_by_field_list_tipo:",filter_by_field_list_tipo, " - filter_fields_data:", filter_fields_data);
				}

				// operator. Selector operator
					const operator_selector = wrap_div.querySelector(".operator_selector")		
					let operator_selected   = (operator_selector) ? "$" + operator_selector.value : "$or";

				// split. Selector split
					const split_selector 	= wrap_div.querySelector(".split_selector")	
					let split_selected   	= (split_selector) ? JSON.parse(split_selector.value) : true;
				
				let clean_group 	= []
				let filter_element 	= search_query_object.filter

				// Iterate current filter
				for (let operator in filter_element) {
				
					// Current group
					let group = filter_element[operator]

					// New group
					let sub_group2 = {}
						sub_group2[operator_selected] = []

					// Iterate filter main group
					group.forEach(function(search_unit, i) {
						const base_component_tipo = search_unit.path ? search_unit.path[0].component_tipo : false
						const last_component_tipo = search_unit.path ? search_unit.path[search_unit.path.length-1].component_tipo : false
						
						// q_split
						search_unit.q_split = split_selected

						if (base_component_tipo===filter_by_field_list_tipo && filter_by_field_list_value_len>0) {
							// Add filter_by_field_list value to filter
							let sub_group1 = {'$or':[]}
							for (let k = 0; k < filter_by_field_list_value_len; k++) {

								let locator 		= filter_by_field_list_value[k]
								let new_search_unit = cloneDeep(search_unit)
								new_search_unit.q   = JSON.stringify(locator)
								// Remove all path filter_elements but first
								new_search_unit.path.splice(1)
								// Add to group
								sub_group1['$or'].push(new_search_unit)
							}
							clean_group.push(sub_group1)
						
						}else{
							// Add fields values to filter
							if (filter_fields_data && typeof filter_fields_data[last_component_tipo]!=="undefined") {

								let value = filter_fields_data[last_component_tipo] || [] // Always use 'last_component_tipo' here (!)
								
								// If value is empty will be ignored in final object
								if (value.length>0) {
										
									// Override q value
									search_unit.q = value		
									// When filter is not empy, send search_unit to a special subgroup
									if (filter_by_field_list_value_len>0) {
										// Add to subgroup2
										sub_group2[operator_selected].push(search_unit);
									}else{
										// Add to subgroup
										clean_group.push(search_unit)
									}
								};//end if (value.length>0) 
							}
						}
						
					})//end group.forEach(function(search_unit, i)

					// When filter is not empy, add filled sub_group2
					if (filter_by_field_list_value_len>0) {
						clean_group.push(sub_group2)
					}

					// Overwrite filter value with modified group
					filter_element[operator] = clean_group

					break; // Only one is expected in fisrt level
				};//end for (let operator in filter_element) {

				// When filter_sections is not empy, use operator '$and' to exclude results by filter_sections
				let main_operator = operator_selected
				if (filter_by_field_list_value_len>0) {
					// Force and
					main_operator = '$and'
				}

				// New clean final filter
				const clean_filter = {}
					  clean_filter[main_operator] = clean_group

				// Replaces old filter in search_query_object
				search_query_object.filter = clean_filter
						
			}else{

				let filter_element 	= search_query_object.filter				
				// Iterate current filter
				for (let operator in filter_element) {

					const current_filter = filter_element[operator]

					for (var i = 0; i < current_filter.length; i++) {
		
						// Update q property
						current_filter[i].q 	  = q + "*" // Begins with
						current_filter[i].q_split = false
						
					}
				
				}
				// Default basic mode (autocomplete hi)
				//const operator  = Object.keys(search_query_object.filter)[0] || '$and'
				//const key 		= 0
				
				
				// Update wrapper dataset (only in this modo)
				//	wrap_div.dataset.search_query_object = JSON.stringify(search_query_object)			
			}

			// allow_sub_select_by_id set to false to allow select deep fields
				search_query_object.allow_sub_select_by_id = false		

		// Debug
			if(SHOW_DEBUG===true) {
				//console.log("... search_query_object:",search_query_object, JSON.stringify(search_query_object));
				//console.log("... search_query_object filter:",search_query_object.filter);
				//if(typeof clean_filter!=="undefined") console.log("+++ rebuild_search_query_object final clean_filter ",clean_filter);
			}
				

		return search_query_object	
	};//end rebuild_search_query_object2

	

	/**
	* GET_SEARCH_SECTIONS
	* @return array of checked hierarchy_sections sections
	*/
	this.get_search_sections = function(wrap_div) {
		
		let selected_values = [] // Default

		const search_sections_list_ul = wrap_div.querySelector('ul.search_sections_list')
		if (search_sections_list_ul) {
			const ar_inputs 	= search_sections_list_ul.querySelectorAll('input')
			const len 			= ar_inputs.length
			for (let i = len - 1; i >= 0; i--) {
				// skip all option
					if (ar_inputs[i].value==="all") {
						continue;
					}
				// add checked
					if(ar_inputs[i].checked) {
						selected_values.push(ar_inputs[i].value)
					}
			}
		}		

		// Fallback to dataset
		if (selected_values.length<1) {

			// Get from wrapper dataset
			const search_sections = wrap_div.dataset.search_sections
			if (search_sections) {
				selected_values = JSON.parse(search_sections)
			}
			
			if(SHOW_DEBUG===true) {
				console.log("Fallback apply. Get hierarchy_sections from wrapper:", selected_values);
			}
		}

		return selected_values
	}//end get_search_sections



	/**
	* GET_FILTER_FIELDS_DATA
	* @return object filter_fields_data | bool false
	*/
	this.get_filter_fields_data = function(wrap_div, q) {

		const self = this

		const filter_fields 	= wrap_div.querySelectorAll("input.filter_fields_input")
		const filter_fields_len = filter_fields.length

		if (filter_fields_len<1) {			
			return false
		}
		
		// Propagate filter_field
			if (q!=="manual_trigger") {
					
				// Reset filter fields
				for (let j = 0; j < filter_fields_len; j++) {
					filter_fields[j].value = ''
				}

				// ar q split iterate
				let split_q = self.split_q(q)
				let ar_q 	= split_q.ar_q
				if (split_q.divisor==='|') {
					// PROPAGATE TO FILTER FIELDS
					for (let j = 0; j < filter_fields_len; j++) {
						if (ar_q[j]) {
							//let q 		= ar_q[j]							
							let q_type 	= 'all'//self.determine_q_type(q)
							self.propagate_to_filter_field(filter_fields[j], ar_q[j], q_type) 
						}							
					}
				}else{											
					for (let i = 0; i < ar_q.length; i++) {
						//let q 		= ar_q[i]
						let q_type 	= self.determine_q_type(q)
						// PROPAGATE TO FILTER FIELDS
						for (let j = 0; j < filter_fields_len; j++) {
							self.propagate_to_filter_field(filter_fields[j], ar_q[i], q_type) 
						}					
					}
				}					
			}

		// filter_fields_data
			const filter_fields_data = {}		
			for (let i = 0; i < filter_fields_len; i++) {		
				const current_tipo 				 = filter_fields[i].dataset.tipo
				filter_fields_data[current_tipo] = filter_fields[i].value
			}
			

		return filter_fields_data
	}//end get_filter_fields_data



	/**
	* GET_FILTER_BY_FIELD_LIST_TIPO
	* @return string | bool false
	*/
	this.get_filter_by_field_list_tipo = function(wrap_div) {
		
		let filter_by_field_list_tipo = false

		let filter_by_list = false
		if (wrap_div.dataset.filter_by_list) {
			filter_by_list = JSON.parse(wrap_div.dataset.filter_by_list)
		}		
	
		if (filter_by_list) {
			const filter_by_list_len = filter_by_list.length
			for (let i = 0; i < filter_by_list_len; i++) {
				filter_by_field_list_tipo = filter_by_list[i].component_tipo
				break; // Only one at now
			}			
		}
		
		return filter_by_field_list_tipo
	};//end get_filter_by_field_list_tipo



	/**
	* GET_FILTER_BY_FIELD_LIST_VALUE
	* @return array | bool false
	*/
	this.get_filter_by_field_list_value = function(wrap_div) {

		let selected_values = false

		const list_ul = wrap_div.querySelector('ul.filter_by_field_list')
		if (list_ul) {
			// case no hi
			selected_values = []
			const ar_inputs = list_ul.querySelectorAll('input')
			const len 	  	= ar_inputs.length
			for (let i = len - 1; i >= 0; i--) {
				if(ar_inputs[i].checked) {
					let current_val = ar_inputs[i].value // 
					if (current_val!=='on') {
						selected_values.push( JSON.parse(current_val) )
					}
				}
			}
		}

		return selected_values
	};//end get_filter_by_field_list_value



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

		let divisor = false;		
		if (q.indexOf('|')!==-1) {
			divisor = '|'
		}		

		const result = {
			ar_q 	: ar_q,
			divisor : divisor
		}

		return result
	};//end split_q



	/**
	* DETERMINE_Q_TYPE
	* @return string q_type
	*/
	this.determine_q_type = function(q) {

		let q_type = ''

		const str  = q

		const regex_code = /^(\W{1,2})?\d+([.,\/-]+[\d\w]*)?(\D)?$/
		const regex_date = /^(\W{1,2})?([0-9]{1,12})-?([0-9]{1,2})?-?([0-9]{1,2})?$/ 	//  /^(\W{1,2})?(-?[0-9]{1,12})(-[0-9]{1,2})?(-[0-9]{1,2})?$/
		const regex_int  = /^(\W{1,2})?\d+$/
	
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
	* PROPAGATE_TO_FILTER_FIELD
	* @return 
	*/
	this.propagate_to_filter_field = function(input_obj, q, q_type) {

		const ar_type_map = JSON.parse(input_obj.dataset.type_map)
		const len 		  = ar_type_map.length
		
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
	* CONVERT_DATA_TO_LABEL_VALUE
	* @return array result
	*/
	this.convert_data_to_label_value = function(data) {
		
		const result = []
		const len 	 = data.length
		for (let i = 0; i < len; i++) {
			
			const obj = {
				label 	 : data[i].label, // Label with additional info (parents, model, etc.)
				value 	 : data[i].key,   // Locator stringnified
				original : data[i].value  // Original value without parents etc
			}
			result.push(obj)
		}

		// Sort result by original property
		result.sort(function(a,b) {return (a.label.toLowerCase() > b.label.toLowerCase()) ? 1 : ((b.label.toLowerCase() > a.label.toLowerCase()) ? -1 : 0);} );

		
		return result
	};//end convert_data_to_label_value



	/**
	* TOGGLE_OPTIONS
	* @return bool true
	*/
	this.toggle_options = function(button_obj) {

		const tipo 		= button_obj.dataset.tipo		
		const container = button_obj.parentNode.parentNode.querySelector('.autosearch_options[data-tipo="'+tipo+'"]')

		if (container.classList.contains("hide")) {
			// Show
			container.classList.remove("hide")
		}else{
			// Hide
			container.classList.add("hide")
		}

		// Hides autocomplete list
			const menu_list = document.querySelector(".ui-widget-content")
			if (menu_list) {
				menu_list.style.display = "none"
			}

		/*
		if (options_div.style.display==="block") {
			options_div.style.display = "";
		}else{
			options_div.style.display = "block";	
		}
		*/

		return true
	};//end toggle_options



	/**
	* SET_LIST_ELEMENT_FROM_COOKIE
	* Reads cookie if exists and aply values to current list
	*/
	this.set_list_element_from_cookie = function(list_element, cookie_name) {

		let ar_values = readCookie(cookie_name)
			if (!ar_values) {
				return false;
			}		
			ar_values = JSON.parse(ar_values)

		function compare_object(obj1, obj2) {
		    return JSON.stringify(obj1) === JSON.stringify(obj2) 
		}
		
		const ar_inputs = list_element.querySelectorAll('input')			
		const len 		= ar_inputs.length
		for (let i = len - 1; i >= 0; i--) {
			
			let current_value = ar_inputs[i].value			
			if(common.is_json(current_value)===true) {
				current_value = JSON.parse(current_value)
			}									

			let checked = false
			for (var j = ar_values.length - 1; j >= 0; j--) {
				if(compare_object(ar_values[j], current_value)===true) {
					checked = true
					break;
				}
			}

			ar_inputs[i].checked = checked
		}

		return true
	}//end set_list_element_from_cookie



	/* FILTER_SEARCH_SECTIONS INTERFACE //////////////////////////////////////////////////////////////////////
		*/



	/**
	* BUILD_SEARCH_SECTIONS_LIST
	* @return 
	*/
	this.build_search_sections_list = function(options) {
			
		const self = this

		const tipo 				= options.tipo
		const section_tipo 		= options.section_tipo
		const ar_elements 		= options.ar_elements
		const cookie_name 		= 'search_sections_list_' + section_tipo + '_' + tipo;
		const target_id 		= options.target_id
		const options_wrapper 	= document.getElementById(target_id)
		if (!options_wrapper) {
			console.error("[build_search_sections_list] Error on locate dom element:", target_id);
			return false
		}			

		const js_promise = new Promise(function(resolve, reject) {

			// ul container
				const ul = common.create_dom_element({
					element_type 	: "ul",
					class_name 	 	: "search_sections_list text_unselectable hide",
					parent 			: options_wrapper
				})

			// li check all
				const li_all = common.create_dom_element({
					element_type 	: "li",					
					parent 			: ul
					})
					const checkbox_all = common.create_dom_element({
						element_type 	: "input",
						type 			: "checkbox",
						value 			: "all",
						id 				: "select_all_" + tipo,						
						parent 			: li_all
						})
						checkbox_all.addEventListener("change",function(){
							self.select_all_search_sections(this, cookie_name)
						},false)
					const label_all = common.create_dom_element({
						element_type 	: "label",
						parent 			: li_all,
						text_content 	: get_label["todos"]
						})
						label_all.setAttribute("for", "select_all_" + tipo)
					const hr = common.create_dom_element({
						element_type 	: "hr",
						parent 			: ul
						})

 			// li sections
 				const ar_elements_len = ar_elements.length;
				for (var i = 0; i < ar_elements_len; i++) {
					
					const element = ar_elements[i]
					
					const current_id 		= "sections_list_" + element.key + "_" + i
					const current_value 	= element.key
					const current_label 	= element.label
					const current_checked 	= false						

					const li = common.create_dom_element({
						element_type 	: "li",						
						parent 			: ul
						})
						let checkbox = common.create_dom_element({
							element_type 	: "input",
							type 			: "checkbox",
							value 			: current_value,
							id 				: current_id,				
							parent 			: li
							})
							checkbox.setAttribute("checked", current_checked)
							checkbox.addEventListener("change",function(){
								self.save_filter_list(this, cookie_name)
							},false)
						let label = common.create_dom_element({
							element_type 	: "label",
							parent 			: li,
							text_content 	: current_label
							})
							label.setAttribute("for", current_id)
				}

			resolve(ul)

		}).then(function(){
			// set_list_element_from_cookie . Read from cookie if exists and update ul list				
			const list_element = options_wrapper.querySelector('ul.search_sections_list') 
			self.set_list_element_from_cookie(list_element, cookie_name)
		})


		return js_promise
	};//end build_search_sections_list



	/**
	* TOGGLE_SEARCH_SECTIONS_LIST
	* @return bool true
	*/
	this.toggle_search_sections_list = function(button_obj) {

		const wrapper	= component_common.get_wrapper_from_element(button_obj)
		const container = wrapper.querySelector('ul.search_sections_list')

		if (container.classList.contains("hide")) {
			container.classList.remove("hide")
		}else{
			container.classList.add("hide")
		}

		return true;
	};//end toggle_search_sections_list



	/**
	* SELECT_ALL_SEARCH_SECTIONS
	* Check or uncheck all elements at once
	* @param dom node input_obj
	* @param string cookie_name
	*/
	this.select_all_search_sections = function(input_obj, cookie_name) {

		const wrap_div 		 	= find_ancestor(input_obj, 'wrap_component')
		const toponymy_list_ul 	= wrap_div.querySelector('ul.search_sections_list')
		const ar_inputs 		= toponymy_list_ul.querySelectorAll('input')
		
		const len = ar_inputs.length	
		for (let i = len - 1; i >= 0; i--) {
			ar_inputs[i].checked = input_obj.checked
		}		

		this.save_search_sections(input_obj, cookie_name)

		return true
	}//end select_all_search_sections



	/**
	* SAVE_SEARCH_SECTIONS
	* Cookie stores current list values as json encoded array
	*/
	this.save_search_sections = function(input, cookie_name) {

		const wrap_div 			  	= input.parentNode.parentNode.parentNode.parentNode;
		const selected_values 		= service_autocomplete.get_search_sections(wrap_div)
		const hierarchy_sections  	= JSON.stringify(selected_values)
		
		// Store values as cookie to preserve config
		createCookie(cookie_name, hierarchy_sections, 365)
		
		return true
	}//end save_search_sections



	/* FILTER_BY_LIST INTERFACE //////////////////////////////////////////////////////////////////////
		*/



	/**
	* BUILD_FILTER_LIST
	* @return promise
	*/
	this.build_filter_list = function(options) {
	
		const self = this

		const tipo 				= options.tipo
		const section_tipo 		= options.section_tipo
		const ar_elements 		= options.ar_elements
		const cookie_name 		= 'filter_by_list_' + section_tipo + '_' + tipo;
		const target_id 		= options.target_id
		const options_wrapper 	= document.getElementById(target_id)
		if (!options_wrapper) {
			console.error("[build_filter_list] Error on locate dom element:", target_id);
			return false
		}
		

		const js_promise = new Promise(function(resolve, reject) {

			// button show options
				//const button_options = common.create_dom_element({
				//	element_type 	: "div",
				//	class_name 	 	: "icon_bs autocomplete_list_button_options edit_hidden",
				//	data_set 		: {
				//		tipo : tipo
				//	},
				//	parent 			: options_wrapper
				//})
				//button_options.addEventListener("change",function(){
				//	self.toggle_options(this)
				//},false)

			// ul container
				const ul = common.create_dom_element({
					element_type 	: "ul",
					class_name 	 	: "filter_by_list filter_by_field_list text_unselectable",
					parent 			: options_wrapper
				})

			// li check all
				const li_all = common.create_dom_element({
					element_type 	: "li",					
					parent 			: ul
					})
					const checkbox_all = common.create_dom_element({
						element_type 	: "input",
						type 			: "checkbox",
						id 				: "select_all_" + tipo,						
						parent 			: li_all
						})
						checkbox_all.addEventListener("change",function(){
							self.select_all_filter_elements(this, cookie_name)
						},false)
					const label = common.create_dom_element({
						element_type 	: "label",
						parent 			: li_all,
						text_content 	: get_label["todos"]
						})
						label.setAttribute("for", "select_all_" + tipo)
					const hr = common.create_dom_element({
						element_type 	: "hr",
						parent 			: ul
						})

 			// li sections
 				const ar_elements_len = ar_elements.length
				for (var i = 0; i < ar_elements_len; i++) {
					
					const element = ar_elements[i]
					
					const current_id 		= element.id
					const current_value 	= JSON.stringify(element.value)
					const current_label 	= element.label
					const current_checked 	= false						

					const li = common.create_dom_element({
						element_type 	: "li",						
						parent 			: ul
						})
						const checkbox = common.create_dom_element({
							element_type 	: "input",
							type 			: "checkbox",
							value 			: current_value,
							id 				: current_id,				
							parent 			: li
							})
							checkbox.setAttribute("checked", current_checked)
							checkbox.addEventListener("change",function(){
								self.save_filter_list(this, cookie_name)
							},false)
						const label = common.create_dom_element({
							element_type 	: "label",
							parent 			: li,
							text_content 	: current_label
							})
							label.setAttribute("for", current_id)
				}

			resolve(ul)

		}).then(function(){
			// set_filter_elements . Read from cookie if exists and update ul list				
			const list_element = options_wrapper.querySelector('ul.filter_by_list')
			self.set_list_element_from_cookie(list_element, cookie_name)
		})


		return js_promise
	};//end build_filter_list



	/**
	* SELECT_ALL_FILTER_ELEMENTS
	* Check or uncheck all elements at once
	*/
	this.select_all_filter_elements = function(input_obj, cookie_name) {

		const wrap_div 	= find_ancestor(input_obj, 'wrap_component')
		const list_ul	= wrap_div.querySelector('ul.filter_by_list')
		const ar_inputs	= list_ul.querySelectorAll('input')
		const len 		= ar_inputs.length

		for (let i = len - 1; i >= 0; i--) {
			ar_inputs[i].checked = input_obj.checked
		}

		this.save_filter_list(input_obj, cookie_name)

		return true
	};//end select_all_filter_elements



	/**
	* SAVE_FILTER_LIST
	* Cookie stores current list values as json encoded array
	* If found input search field, auto tigger a search with selection (manual_trigger)
	*/
	this.save_filter_list = function(input_obj, cookie_name) {

		const self = this
	
		const wrap_div 		  			= component_common.get_wrapper_from_element(input_obj) // input_obj.parentNode.parentNode.parentNode.parentNode
		const ar_filter_elements 		= self.get_filter_elements(wrap_div)
		const filter_elements 			= JSON.stringify(ar_filter_elements)
		const autocomplete_search_field = wrap_div.querySelector(".autocomplete_input")

		if (autocomplete_search_field) {

			// Chek if autocomplete is instantiated before search (search mode case)
			const autocomplete_instance = $(autocomplete_search_field).autocomplete( "instance" );
			if (typeof autocomplete_instance!=="undefined") {
				// Trigger autocomplete
				$(autocomplete_search_field).autocomplete( "search", "manual_trigger" );
			}			
		}

		const cookie_create = createCookie(cookie_name, filter_elements, 365);

		return cookie_create;
	};//end save_filter_list



	/**
	* GET_FILTER_ELEMENTS
	* @return array of checked hierarchy_sections sections
	*/
	this.get_filter_elements = function(wrap_div) {

		const self = this
		
		let selected_values  = false

		const component_name = wrap_div.dataset.component_name

		switch(component_name) {

			case "component_autocomplete":
			case "component_relation_related":
				const list_ul = wrap_div.querySelector('ul.filter_by_list')
				if (list_ul) {
					// case no hi
					selected_values = []
					const ar_inputs = list_ul.querySelectorAll('input')
					const len 	  	= ar_inputs.length
					for (let i = len - 1; i >= 0; i--) {
						if(ar_inputs[i].checked) {
							let current_val = ar_inputs[i].value // 
							if (current_val!=='on') {
								selected_values.push( JSON.parse(current_val) )
							}
						}
					}
				}
				break;

			case "component_autocomplete_hi":	
			default:
				selected_values = self.get_search_sections(wrap_div)
				break;
		}

		return selected_values;
	};//end get_filter_elements
	


	/* FILTER_FIELDS INTERFACE //////////////////////////////////////////////////////////////////////
		*/



	/**
	* BUILD_FILTER_FIELDS
	* @return promise
	*/
	this.build_filter_fields = function(selection, options) {

		const self = this

		// sections that not show fields options
			const sections_without_fields = self.sections_without_filter_fields

		//const search_selector = self.build_source_search_selector(options)
		if(SHOW_DEBUG===true) {
			//console.log("build_filter_fields options:",options, selection);
		}

		const tipo 					= options.tipo
		const section_tipo 			= options.section_tipo
		const ar_elements_unfilter	= options.ar_elements
		const op_label_or 			= options.op_label_or
		const op_label_and 			= options.op_label_and
		const operator 				= options.operator
		const q_split 				= options.q_split
		const target_id 			= options.target_id
		const options_wrapper 		= document.getElementById(target_id)

		// remove the children nodes of the components to search
		const div_filter_fields = options_wrapper.querySelector(".filter_fields")

		if (div_filter_fields) {
			//remove the childrens of the dilter_fields div 
			/*while (div_filter_fields.firstChild) {
					div_filter_fields.removeChild(div_filter_fields.firstChild);
				}
				*/
			//remove the filter_fields div container
			options_wrapper.removeChild(div_filter_fields)
		}

		//get the current component_tipo from selection
		const ar_elements = ar_elements_unfilter.filter(section => section.section_tipo===selection)
		
		if (!options_wrapper) {
			console.error("[build_filter_list] Error on locate dom element:", target_id);
			return false
		}			

		const js_promise = new Promise(function(resolve, reject) {

			// div container
				const div_container = common.create_dom_element({
					element_type 	: "div",
					class_name 	 	: "filter_fields text_unselectable",
					parent 			: options_wrapper
				})

			// sections without filter fields selector
				if (sections_without_fields.indexOf(selection)!==-1) {
					//div_container.classList.add("hide")
					return resolve(div_container)
				}	

			// ul container
				const ul = common.create_dom_element({
					element_type 	: "ul",
					parent 			: div_container
				})				

 			// li sections
 				const ar_elements_len = ar_elements.length
				for (var i = 0; i < ar_elements_len; i++) {
					
					const element = ar_elements[i]						
					
					const current_tipo 			= element.tipo
					const current_name 			= element.name
					const current_modelo_name 	= element.modelo_name
					const current_type_map 		= JSON.stringify(element.type_map)			

					const li = common.create_dom_element({
						element_type 	: "li",						
						parent 			: ul
						})
						const label = common.create_dom_element({
							element_type 	: "label",
							class_name 		: "css_label label",
							parent 			: li,
							text_content 	: current_name
							})
						const input = common.create_dom_element({
							element_type 	: "input",
							type 			: "text",
							name 			: "filter_field_" + current_tipo,
							class_name 	 	: "filter_fields_input",							
							data_set 		: {
								tipo   	 : current_tipo,
								modelo 	 : current_modelo_name,
								type_map : current_type_map
							},
							parent 			: li
							})
							input.setAttribute("autocomplete", "off")
							input.setAttribute("placeholder", current_tipo)
							input.addEventListener("keyup",function(){
								self.search_from_filter_fields(this)
							},false)							
				}

			// operator selector
				const operator_selector = common.create_dom_element({
					element_type 	: "div",
					class_name 	 	: "search_operators_div",
					parent 			: div_container
					})
					const label = common.create_dom_element({
						element_type 	: "label",
						class_name 		: "css_label label",
						parent 			: operator_selector,
						text_content 	: get_label["operadores_de_busqueda"] || "Search operators"
						})
					const select = common.create_dom_element({
						element_type 	: "select",
						class_name 		: "operator_selector",
						parent 			: operator_selector
						})
						select.addEventListener("change",function(){
							self.search_from_filter_fields(this)
						},false)
						const option_or = common.create_dom_element({
							element_type 	: "option",
							parent 			: select,
							value 			: "or",
							text_content 	: op_label_or
							})
						const option_and = common.create_dom_element({
							element_type 	: "option",
							parent 			: select,
							value 			: "and",
							text_content 	: op_label_and
							})
						if (operator==='or') {
							option_or.setAttribute("selected", true)
						}else{
							option_and.setAttribute("selected", true)
						}

			// split selector
				const split_selector = common.create_dom_element({
					element_type 	: "div",
					class_name 	 	: "search_operators_div",
					parent 			: div_container
					})
					const label_split = common.create_dom_element({
						element_type 	: "label",
						class_name 		: "css_label label",
						parent 			: split_selector,
						text_content 	: get_label["dividir_palabras"] || "Split words"
						})
					const select_split = common.create_dom_element({
						element_type 	: "select",
						class_name 		: "split_selector",
						parent 			: split_selector
						})
						select.addEventListener("change",function(){
							self.search_from_filter_fields(this)
						},false)
						const option_true = common.create_dom_element({
							element_type 	: "option",
							parent 			: select_split,
							value 			: "true",
							text_content 	: get_label["si"]
							})
						const option_false = common.create_dom_element({
							element_type 	: "option",
							parent 			: select_split,
							value 			: "false",
							text_content 	: get_label["no"]
							})
						if (q_split===true) {
							option_true.setAttribute("selected", true)
						}else{
							option_false.setAttribute("selected", true)
						}

			resolve(div_container)

		}).then(function(response){
			if(SHOW_DEBUG===true) {
				//console.log("build_filter_fields Done ",response);
			}
		})


		return js_promise
	};//end build_filter_fields



	/**
	* SEARCH_FROM_FILTER_FIELDS
	* Exec on event: onkeyup
	* @return bool true
	*/
	this.search_from_filter_fields_busy = false
	this.search_from_filter_fields = function(input_obj) {
	
		const self = this

		// Input model
		const component_modelo_name = input_obj.dataset.modelo

		// wrap_div of component
		const wrap_div = find_ancestor(input_obj, 'wrap_component')

		// Select autocomplete_wrapper by id (remember in new element showed case, inside wrap can be more than one)
		const wrap_div_id 				= wrap_div.id
		const autocomplete_wrapper_id 	= wrap_div_id.replace('wrapper_', 'aw_')
		const autocomplete_wrapper 		= document.getElementById(autocomplete_wrapper_id)
		
		//if (self.search_from_filter_fields_busy===false) {
			const autocomplete_search_field = autocomplete_wrapper.querySelector("input.autocomplete_input")

			self.search_from_filter_fields_busy = true
			setTimeout(function() {
				
				// Trigger autocomplete manually
				$(autocomplete_search_field).autocomplete( "search", "manual_trigger" );					
				
				//self.search_from_filter_fields_busy = false
			}, 200)
		//}

		return true
	};//end search_from_filter_fields



	/**
	* BUILD_SOURCE_SEARCH_SELECTOR
	* @return 
	*/
	this.build_source_search_selector = function(options) {

		const self = this
				
		// debug 
			if(SHOW_DEBUG===true) {
				console.log("[build_source_search_selector] options:",options);
			}		

		// container
			const container = document.getElementById(options.target_id)


		// search elements
			const ar_elements 	= options.ar_elements.map(element => element.section_tipo);
			const ar_search 	= options.ar_elements.filter( (obj, index) => {
															return ar_elements.indexOf(obj.section_tipo) === index;
														})

			const ar_fields 	= options.ar_elements.map(element => element.fields_map);

		// switcher source
			const label_select = common.create_dom_element({
						element_type 	: "label",
						class_name 		: "css_label label",
						parent 			: container,
						text_content 	: get_label["origen"] || "Source"
					})
			
			const select = common.create_dom_element({
						id 				: 'select_'+options.target_id,
						element_type 	: "select",
						parent 			: container,
						class_name 		: "source_selector",
						data_set 		: {
							source : JSON.stringify(options)
						}				
					})

			// others
				const ar_search_length = ar_search.length
				for (let i = 0; i < ar_search_length; i++) {
					
					const item = ar_search[i]
					
					const swicher_source = common.create_dom_element({
						element_type 	: "option",
						parent 			: select,
						value 			: item.section_tipo,
						text_content 	: item.section_tipo_name,
						data_set 		: {
							source : JSON.stringify(item),
							search_engine: item.search_engine
						}
					})
				}

			// add listener to the select
			select.addEventListener('change',function(){
						self.build_filter_fields(this.value, options)
					},false)

		// set default value
			//select.value = "rsc205"
			self.build_filter_fields(select.value, options)
				
		return true
	};//end build_source_search_selector



}//end class