"use strict"
/**
* COMPONENT_RELATION_RELATED
*
*
*
*/
var component_relation_related = new function() {


	this.save_arguments = {} // End save_arguments
	this.url_trigger    = DEDALO_LIB_BASE_URL + '/component_relation_related/trigger.component_relation_related.php';



	/**
	* SAVE (Deprecated!)
	*//*
	this.Save = function(component_obj) {

		this.save_arguments.dato = this.get_dato( component_obj );
			//console.log(this.save_arguments);

		// From component wrapper
		var wrap_div = find_ancestor(component_obj, 'wrap_component')
			if (wrap_div === null ) {
				if(DEBUG) console.log(component_obj);
				return alert("component_relation_related:Save: Sorry: wrap_div dom element not found")
			}

		// Exec general save
		var jsPromise = component_common.Save(component_obj, this.save_arguments);

		jsPromise.then(function(response) {
		  	// Action post save
		  	component_common.load_component_by_wrapper_id(wrap_div.id);
		}, function(xhrObj) {
		  	console.log(xhrObj);
		});
	};
	*/


	/**
	* GET_DATO
	* @return array dato
	*//*
	this.get_dato = function( component_obj ) {
		
		// From component wrapper
		var wrap_div = find_ancestor(component_obj, 'wrap_component')
			if (wrap_div === null ) {
				if(DEBUG) console.log(component_obj);
				return alert("component_relation_related:get_dato: Sorry: wrap_div dom element not found")
			}

		// INPUTS . Select all inputs inside current wrapper
		var input_elements = wrap_div.querySelectorAll('[data-role="component_relation_related_input"]')
	
		// DATO. Iterate each input and store their value in the array 'dato'
		var dato = []
		var len  = input_elements.length
		for (var i = len - 1; i >= 0; i--) {
			
			var element = input_elements[i]
			if(element.value.length>1) {
				var locator = null;
				try {
				  locator = JSON.parse(element.value)
				} catch (e) {
				  console.log(e.message); // "missing ; before statement"
				  //return alert(e.message) 
				}
				if(locator)	dato.push( locator )
			}
		}

		return dato
	};//end get_dato
	*/


	/**
	* SELECT_COMPONENT
	*/
	this.select_component = function(obj_wrap) {
		obj_wrap.classList.add("selected_wrap");		
		
		// If only one is present, we focus it on click wrapper
		let ar_input_text = obj_wrap.querySelectorAll('[data-role="component_relation_related_input"]')
			if (ar_input_text.length===1) {
				let input_text = ar_input_text[0]
				if(input_text) {
					input_text.focus();
				}
			}				
		
		return false;
	}//end select_component



	/**
	* OPEN_RELATED_SELECTOR_WINDOW
	* @return 
	*/
	var related_selector_window = null; // Global var
	this.opener_button = null;	// class var
	this.open_related_selector_window = function( button_obj ) {

		// Fix current button_obj as var
		this.opener_button = button_obj

		// context_name
		const context_name = 'select_related'
		
		const url = DEDALO_LIB_BASE_URL + '/main/?t=' + button_obj.dataset.target_section_tipo + '&context_name='+context_name
		const strWindowFeatures = "menubar=no,location=yes,resizable=yes,scrollbars=yes,status=yes";

		if(related_selector_window === null || related_selector_window.closed) {
			related_selector_window = window.open(
			    url,
			    "related_selector_window",
			    strWindowFeatures
			);	
		}else{
			related_selector_window.focus();
		}
	};//end open_related_selector_window



	/**
	* ADD_RELATION_FROM_OPENED_WINDOW
	* Triggered from opened window button
	* @return 
	*/
	this.add_relation_from_opened_window = function( button_obj ) {

		let locator = button_obj.dataset.locator
		this.add_locator(locator)		

		// Close opened window
		if(related_selector_window) related_selector_window.close();
	};//end add_relation_from_opened_window



	/**
	* ADD_LOCATOR
	* Clone first DOM input element, update value with requested locator and
	* trigger save normally
	*/
	this.add_locator = function(locator, wrap_div) {

		// Related component data from received locator
		const locator_obj 			= typeof locator === 'string' ? JSON.parse(locator) : locator
		const target_section_tipo 	= locator_obj.section_tipo
		const target_section_id   	= locator_obj.section_id
		
		if (typeof wrap_div=="undefined") {
			
			if (component_common.selected_wrap_div) {
				// From tree
				wrap_div = component_common.selected_wrap_div
				if (wrap_div === null ) {
					if(DEBUG) console.log("add_locator selected_wrap_div",component_common.selected_wrap_div)
					return alert("component_relation_related:add_locator: Sorry: wrap_div dom element not found")
				}
			}else{
				// From list
				if(this.opener_button===null) return alert("Error. Button obj not found: opener_button")

				// From component wrapper
				wrap_div = find_ancestor(this.opener_button, 'wrap_component')
					if (wrap_div === null ) {
						if(DEBUG) console.log("add_locator opener_button",this.opener_button)
						return alert("component_relation_related:add_locator: Sorry: wrap_div dom element not found")
					}
			}
		}		

		// SAVE
		const trigger_vars = {
				mode 	 			: 'add_related',
				tipo 	 			: wrap_div.dataset.tipo,
				parent	 		  	: wrap_div.dataset.parent,
				section_tipo 		: wrap_div.dataset.section_tipo,
				target_section_tipo : target_section_tipo,
				target_section_id   : target_section_id,
		}
		//return console.log("[component_relation_related.add_locator] trigger_vars",trigger_vars);

		common.get_json_data(this.url_trigger, trigger_vars).then(function(response){
			if(SHOW_DEBUG===true) {
				console.log("[component_relation_related.add_locator] response",response)
			}

			// Reloads always the component
			component_common.load_component_by_wrapper_id( wrap_div.id )

			// Response is bool value decoded from json trigger response
			if (response && response.result===true) {
				
				// Inspector msg
				const label = wrap_div.querySelector("label").innerHTML
				const msg   = "<span class='ok'>" + label + " " + get_label.guardado + "</span>";
				inspector.show_log_msg(msg);
			}//end if (response===true) {
		})//end promise
	};//end add_locator



	/**
	* REMOVE_LOCATOR
	* @return 
	*/
	this.remove_locator = function( button_obj ) {

		if (!confirm(get_label.seguro)) return false;

		// From component wrapper
		const wrap_div = find_ancestor(button_obj, 'wrap_component')
			if (wrap_div === null ) {
				if(DEBUG) console.log(button_obj);
				return alert("component_relation_related:remove_locator: Sorry: wrap_div dom element not found")
			}

		const trigger_vars = {
				mode 	 			: 'remove_related',
				tipo 	 			: wrap_div.dataset.tipo,
				parent	 			: parseInt(wrap_div.dataset.parent),
				section_tipo 		: wrap_div.dataset.section_tipo,
				locator_to_delete 	: JSON.parse(button_obj.dataset.locator),
		}
		//return console.log("[component_relation_related.remove_locator] trigger_vars",trigger_vars);

			// SAVE
			common.get_json_data(this.url_trigger, trigger_vars).then(function(response){
				if(SHOW_DEBUG===true) {
					console.log("[component_relation_related.remove_locator] response",response)
				}

				// Reloads always the component
				component_common.load_component_by_wrapper_id( wrap_div.id );

				if (response && response.result===true) {
					// Inspector msg
					const label = wrap_div.querySelector("label").innerHTML
					const msg   = "<span class='ok'>" + label + ' ' + get_label.guardado +"</span>";
					inspector.show_log_msg(msg);
				}
			})//end promise
			/*
			// INPUTS . Select all inputs inside current wrapper
			var input_elements = wrap_div.querySelectorAll('[data-role="component_relation_related_input"]')
			
			if (input_elements.length>1) {
				var input_line = button_obj.parentNode
				if (input_line) {
					input_line.remove()
				}
				// Select again for avoid lose the first element (Important)
				input_elements = wrap_div.querySelectorAll('[data-role="component_relation_related_input"]')	
			}else{
				// Never removes last input element. Only empty value
				input_elements[0].value = ''
			}		

			// Save normally
			if(input_elements[0]) this.Save( input_elements[0] )
			*/
	};//end remove_locator



	/**
	* SHOW_RELATED_TERMS
	* Show and hide related terms data in ts_object content_data div
	*/
	this.show_related_terms = function(button_obj) {
		
		const html_data = " Hi html_data! "
		const role 	  = 'related_terms'

		return ts_object.show_list_thesaurus_data(button_obj, html_data, role)
	};//end show_related_terms



	/**
	* OPEN_REALATED
	*/
	this.open_realated = function(button_obj) {

		let url = DEDALO_LIB_BASE_URL + '/main/?'
			url += 'm=edit&'
			url += 't=' + button_obj.dataset.section_tipo +'&'
			url += 'id=' + button_obj.dataset.section_id

		let relwindow = window.open(url ,'relwindow');
	};//end open_realated



	/**
	* LINK_TERM
	* Se llama aquí desde la ventana flotante del tesauro
	* @param object button_obj
	*	Botón del tesauro desde donde se hace click (contiene los datos su dataset)
	* @param object url_vars
	*	Objecto con las variables que la ventana del tesauro recibe y después vuelve a pasar de forma transparente
	*/
	this.link_term = function( section_id, section_tipo, label ) {
		
		const locator = {
			"section_id" 	: section_id,
			"section_tipo"  : section_tipo
		}

		return this.add_locator( locator )
	};//end link_term



	/**
	* CONVERT_DATA_TO_LABEL_VALUE
	* @return array result
	*/
	this.convert_data_to_label_value = function(data) {
		
		var result 	= []
		for (var key in data) {

			var obj = {
				label : data[key],
				value : key
			}
			result.push(obj)
		}

		return result
	};//end convert_data_to_label_value



	/**
	* ACTIVATE
	* This method is invoked when user click on input text field of current component
	*/
	this.activated = {};
	this.activate = function(input_obj) {
		
		let self = this

		// Activate once
		let tipo 		 = input_obj.dataset.tipo
		let section_tipo = input_obj.dataset.section_tipo
		if ( typeof component_relation_related.activated[tipo] !== "undefined" ) {
			//return false;
		}
		component_relation_related.activated[tipo] = true;
		//console.log(input_obj);

		// From component wrapper		
		let wrap_div = find_ancestor(input_obj, 'wrap_component')
			if (wrap_div === null ) {
				if(DEBUG) console.log(input_obj);
				return alert("[component_relation_related:activate]: Sorry: wrap_div dom element not found")
			}
			let obj_warp = wrap_div	

		let search_fields 			= input_obj.dataset.search_fields
		let divisor 				= input_obj.dataset.divisor
		
		let	ar_target_section_tipo	= input_obj.dataset.ar_target_section_tipo		
		let	div_valor 				= wrap_div.querySelector('[data-role="autocomplete_valor"]')		
			
		// search_query_object
		//let search_query_object = JSON.parse(wrap_div.dataset.search_query_object);
			//console.log("search_query_object",search_query_object);
				
		let filter_fields 			= input_obj.parentNode.parentNode.querySelectorAll("input.filter_fields_input")
		let filter_fields_len 		= filter_fields.length

		let cache = {};
		$(input_obj).autocomplete({
			delay 	 : 650,
			minLength: 1,
			source 	 : function( request, response ) {
				let start = new Date().getTime();
				let term = request.term;
				
				// search_query_object
				let search_query_object = JSON.parse(wrap_div.dataset.search_query_object);
					//console.log("search_query_object",search_query_object);

				// FILTER_SECTIONS
				let filter_sections = self.get_filter_sections(wrap_div)  

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
						top_tipo 				: page_globals.top_tipo,						
						divisor 				: divisor,
						search_query_object 	: JSON.stringify(search_query_object)
				}
				//return console.log("[component_relation_related.autocomplete] trigger_vars",trigger_vars); //return

				common.get_json_data(component_relation_related.url_trigger, trigger_vars).then(function(response_data) {
						if(SHOW_DEBUG===true) {
							console.log("[component_relation_related.autocomplete] response_data",response_data)
						}
						
						let label_value = component_relation_related.convert_data_to_label_value(response_data.result)
						response(label_value)

				}, function(error) {
						console.error("[component_relation_related.autocomplete] Failed get_json!", error);
				});				
			},
			// When a option is selected in list
			select: function( event, ui ) {
				// prevent set selected value to autocomplete input
				event.preventDefault();
				
				this.value = ''
				var label = ui.item.label
				var value = ui.item.value
				
				// New value selected in list. Parse to proper compare with ar locator values
				const locator = JSON.parse(value) // parse Important !
				
				self.add_locator(locator, wrap_div)
			},
			// When a option is focus in list
			focus: function( event, ui ) {
				// prevent set selected value to autocomplete input
				event.preventDefault();			    	
			},
			change: function( event, ui ) {
				//console.log(event)
				this.value = ''		   		
			},
			response: function( event, ui ) {
				//console.log(ui);
			}			
		})
		.on( "keydown", function( event ) {
			if ( event.keyCode === $.ui.keyCode.ENTER ) {
				// prevent set selected value to autocomplete input
				event.preventDefault();

				
			}//end if ( event.keyCode === $.ui.keyCode.ENTER )
		});// bind		

		//this.activated[tipo] = true;
	};//end this.activate



	/**
	* SPLIT_Q
	* Alias of component_autocomplete.split_q
	* @return 
	*/
	this.split_q = function(term) {
		return component_autocomplete.split_q(term)
	};//end split



	/**
	* DETERMINE_Q_TYPE
	* Alias of component_autocomplete.determine_q_type
	* @return 
	*/
	this.determine_q_type = function(q) {
		return component_autocomplete.determine_q_type(q)
	};//end determine_q_type



	/**
	* REBUILD_SEARCH_QUERY_OBJECT
	* Alias of component_autocomplete.rebuild_search_query_object
	* @return 
	*/
	this.rebuild_search_query_object = function(search_query_object, wrap_div, filter_fields, filter_sections) {
		return component_autocomplete.rebuild_search_query_object(search_query_object, wrap_div, filter_fields, filter_sections)
	};//end rebuild_search_query_object



	/**
	* PROPAGATE_TO_FILTER_FIELD
	* @return 
	*/
	this.propagate_to_filter_field = function(filter_fields, q, q_type) {
		return component_autocomplete.propagate_to_filter_field(filter_fields, q, q_type)
	};//end propagate_to_filter_field



	/**
	* GET_FILTER_SECTIONS
	* @return 
	*/
	this.get_filter_sections = function(wrap_div) {
		return component_autocomplete.get_filter_sections(wrap_div) 
	};//end get_filter_sections



	/**
	* INIT_FILTER_BY_LIST
	* @return 
	*/
	this.init_filter_by_list = function(options) {
		return component_autocomplete.init_filter_by_list(options)
	};//end init_filter_by_list



	/**
	* TOGGLE_OPTIONS
	* @return 
	*/
	this.toggle_options = function(button_obj) {

		return component_autocomplete.toggle_options(button_obj)
	};//end toggle_options



	/**
	* SEARCH_FROM_FILTER_FIELDS
	* @return 
	*/
	this.search_from_filter_fields = function(input_obj) {
		return component_autocomplete.search_from_filter_fields(input_obj)	
	};//end 



}//end component_relation_related