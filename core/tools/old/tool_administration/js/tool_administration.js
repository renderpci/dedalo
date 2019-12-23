"use strict";
/**
* TOOL_ADMINISTRATION
*
*
*/
var tool_administration = new function() {


	$(function(){
		$('.panel-heading').on('click',function(){
			tool_administration.toggle_content(this)
		})
		tool_administration.get_active_users();
	})


	// LOCAL VARS
	this.url_trigger = DEDALO_LIB_BASE_URL + '/tools/tool_administration/trigger.tool_administration.php' ;
	this.tid;



	/**
	* MAKE_BACKUP
	*/
	this.make_backup = function(obj, event) {
		return this.trigger_call(obj, event)
	};//end make_backup



	/**
	* UPDATE_STRUCTURE
	*/
	this.update_structure = function(obj, event) {
		if( !confirm('\!!!!!!!!!!!!!!!!!!!!!!!!!!!!!! WARNING !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!\
					\n!!!!!!!!!!!!!!!!!! DELETING ACTUAL DATABASE !!!!!!!!!!!!!!!!\
					\n\nAre you sure to IMPORT and overwrite current structure data with LOCAL FILE \
					\n \"dedalo4_development_str.custom.backup\" ?\n\
			')){
			return false;	
		}

		return this.trigger_call(obj, event)
	};



	/**
	* UPDATE_VERSION
	*/
	this.update_version = function(obj, event) {
		if (!confirm("Sure?")) {
			return false;
		}
		
		return this.trigger_call(obj, event)
	};//end update_version



	/**
	* FORCE_UNLOCK_ALL_COMPONENTS
	*/
	this.force_unlock_all_components = function(obj, event) {
		return this.trigger_call(obj, event)	
	}//end force_unlock_all_components



	/**
	* GET_ACTIVE_USERS
	*/
	this.get_active_users = function( ) {

		var wrap_div = document.getElementById('active_users');
			if (!wrap_div) {
				return false;
			}

		var trigger_vars = {
				mode : 'get_active_users'
			}
		//html_page.loading_content( wrap_div, 1 );

		var js_promise = common.get_json_data(this.url_trigger, trigger_vars).then(function(response) {
				if(SHOW_DEBUG===true) {
					//console.log("[tool_administration.get_active_users] response",response)
				}
				//html_page.loading_content( wrap_div, 0 );
				if (response===null) {
					wrap_div.innerHTML = "<pre>An error has occurred. Null data is received</pre>";
				}else{
					wrap_div.innerHTML = "<pre>"+JSON.stringify(response, null, 2)+"</pre>";
					clearTimeout(tool_administration.tid);
					tool_administration.tid = setTimeout(function() {
						tool_administration.get_active_users();
					}, 500)
				}
		}, function(error) {
				console.error("[tool_administration.get_active_users] Failed get_json!", error)
		})//end js_promise
	};//end get_active_users



	/**
	* BUILD_STRUCTURE_CSS
	*/
	this.build_structure_css = function(obj, event) {
		return this.trigger_call(obj, event)
	};



	/**
	* REMOVE_AV_TEMPORALS
	*/
	this.remove_av_temporals = function(obj, event) {
		return this.trigger_call(obj, event)
	};//end remove_av_temporals
	


	this.toggle_content = function(panel_heading_obj) {
		$(panel_heading_obj).next('.panel-body').toggle(100);
	};
	


	/**
	* skip_publication_state_check
	*/
	this.skip_publication_state_check = function(obj, event) {
	
		// Inject obj dataset section_tipo
		obj.dataset.value = obj.checked

		return this.trigger_call(obj, event)
	};//end skip_publication_state_check



	/**
	* REMOVE_INVERSE_LOCATORS_IN_SECTION
	*//*
	this.remove_inverse_locators_in_section = function(obj, event) {

		var input = document.getElementById('remove_inverse_locators_in_section_section_tipo')
			if (!input.value || input.value.length <3 ) {
				return alert("Sorry. Field section tipo is mandatory. \nPlase insert a valid section tipo like 'oh1'")
			}

		// Inject obj dataset section_tipo
		obj.dataset.section_tipo = input.value

		return this.trigger_call(obj, event)
	};//end remove_inverse_locators_in_section */



	/**
	* PROPAGATE_RELATIONS
	* @return 
	*/
	this.propagate_relations = function(obj, event) {
		
		var input = document.getElementById('propagate_relations_tables')
			if (!input.value || input.value.length <1 ) {
				return alert("Sorry. Field section tipo is mandatory. \nPlase insert a valid table like 'matrix'")
			}

		// Inject obj dataset section_tipo
		obj.dataset.tables = input.value

		return this.trigger_call(obj, event)
	};//end propagate_relations



	/**
	* DELETE_COMPONENT_TIPO_IN_MATRIX_TABLE
	*/
	this.delete_component_tipo_in_matrix_table = function(obj, event) {
		//console.log(navigator.userAgent.indexOf('AppleWebKit'));

		if (!confirm("Delete ?")) {
			return false;
		}

		var delete_component_tipo 	= document.getElementById('delete_component_tipo')
		var delete_section_tipo 	= document.getElementById('delete_section_tipo')
		var delete_language			= document.getElementById('delete_language')
		var delete_save				= document.getElementById('delete_save')
		
		var component_tipo 			= JSON.stringify(delete_component_tipo.value)
		var section_tipo 			= JSON.stringify(delete_section_tipo.value)
		var	language 				= JSON.stringify(delete_language.value)
		var	save 					= JSON.stringify(delete_save.checked)

		// Inject obj dataset vars
		obj.dataset.component_tipo 	= component_tipo
		obj.dataset.section_tipo 	= section_tipo
		obj.dataset.language 		= language
		obj.dataset.save 			= save

		return this.trigger_call(obj, event)
	}//end delete_component_tipo_in_matrix_table



	/**
	* RENUMERATE_SECTIONS
	*/
	this.renumerate_sections = function(obj, event) {
		//console.log(navigator.userAgent.indexOf('AppleWebKit'));

		if (!confirm("Renumerate ?")) {
			return false;
		}

		var section_tipo 		= document.getElementById('renumerate_section_tipo').value
		var section_id_start	= document.getElementById('renumerate_section_id_start').value
		var section_id_end		= document.getElementById('renumerate_section_id_end').value
		var counter_start		= document.getElementById('renumerate_counter_start').value
		var save				= document.getElementById('renumerate_save').checked
		
	
		// Inject obj dataset vars
		obj.dataset.section_tipo 		= section_tipo
		obj.dataset.section_id_start 	= section_id_start
		obj.dataset.section_id_end 		= section_id_end
		obj.dataset.counter_start 		= counter_start
		obj.dataset.save 				= save


		return this.trigger_call(obj, event)
	}//end renumerate_sections



	/**
	* TRIGGER_CALL
	*/
	var current_trigger = null
	this.trigger_call = function(obj, event) {

		var response_div_id = obj.dataset.mode + '_response';
		var wrap_div 		= document.getElementById(response_div_id)
			wrap_div.innerHTML = "<div><span class=\"blink\">Processing. Please wait..</span> <span class=\"css_spinner\"></span></div>";

		// Prevent duplicate trigger calls
		if (current_trigger!==null) {
			console.log("[tool_administration.trigger_call] Sorry. Active trigger prevent twice calls. Please wait finishes current action: "+current_trigger)
			if (wrap_div) {
				wrap_div.innerHTML = "<div>[tool_administration.trigger_call] Please wait finishes current action</div>" + wrap_div.innerHTML;
			}			
			return false;
		}

		var trigger_vars = {};
			for (var key in obj.dataset) {
			  	//console.log(key, obj.dataset[key]);
			  	trigger_vars[key] = obj.dataset[key]
			}			
			if (typeof trigger_vars.mode==='undefined') {
				console.log("[tool_administration.trigger_call] Error on get data vars. Mode is not defined in element dataset");
				return false
			}
			//return console.log(mydata)

		
		
		// Active overlay
		html_page.loading_content( wrap_div, 1 )
		
		// Set trigger as busy
		current_trigger = obj.dataset.mode
		
		// HTTPX Request
		var js_promise 	 = common.get_json_data(tool_administration.url_trigger, trigger_vars).then(function(response) {
			if(SHOW_DEBUG===true) {
				console.log("[tool_administration.trigger_call] response: "+trigger_vars.mode, response);
			}			

			if (response===null) {
				wrap_div.innerHTML = "<div>[tool_administration.trigger_call] Null value was received. <br>Is possible that server timeout is done and the update process continues on server side, or what an error has occurred (See console for details about)</div>"
			}else{
				wrap_div.innerHTML = "<div>"+response.msg+"</div>"
			}

			if (SHOW_DEBUG===true && trigger_vars.mode!=="update_structure") {
				wrap_div.innerHTML += "<pre>"+JSON.stringify(response, null, 2)+"</pre>"
			}

			// Unactive overlay
			html_page.loading_content( wrap_div, 0 );

			// Free trigger for another call
			current_trigger = null
		})

		return js_promise
	}//end trigger_call



	/**
	* MOVE_COMPONENT_DATA
	*/
	this.move_component_data = function(obj, event) {
		//console.log(navigator.userAgent.indexOf('AppleWebKit'));

		var move_source_section_tipo= document.getElementById('move_source_section_tipo')
		var move_source_section_id 	= document.getElementById('move_source_section_id')
		var move_source_portal_tipo = document.getElementById('move_source_portal_tipo')
		var move_source_delete		= document.getElementById('move_source_delete')
		var move_target_section_tipo= document.getElementById('move_target_section_tipo')
		var move_target_section_id 	= document.getElementById('move_target_section_id')
		var move_map_components 	= document.getElementById('move_map_components')

		var mydata = {	mode					: 'move_component_data',
						source_section_tipo 	: move_source_section_tipo.value || null,
						source_section_id 		: move_source_section_id.value || null,
						source_portal_tipo 		: move_source_portal_tipo.value || null,
						source_delete 			: JSON.stringify(move_source_delete.checked) || null,
						target_section_tipo 	: move_target_section_tipo.value || null,
						target_section_id 		: move_target_section_id.value || null,
						map_components 			: move_map_components.value || null
					 };
					 //console.log(mydata)	

					if (!mydata.source_section_tipo || !mydata.target_section_tipo || !mydata.map_components) {
						return alert("Error. source_section_tipo, target_section_tipo, map_components are mandatory")
					}

			// Inject obj dataset vars
			obj.dataset.source_section_tipo	= mydata.source_section_tipo
			obj.dataset.source_section_id	= mydata.source_section_id
			obj.dataset.source_portal_tipo	= mydata.source_portal_tipo
			obj.dataset.source_delete		= mydata.source_delete
			obj.dataset.target_section_tipo	= mydata.target_section_tipo
			obj.dataset.target_section_id	= mydata.target_section_id
			obj.dataset.map_components		= mydata.map_components

			console.log(obj.dataset);
		
			return this.trigger_call(obj, event)		
	};//end move_component_data



	/**
	* EXPORT_HIERARCHY
	* @return 
	*/
	this.export_hierarchy = function(obj, event) {

		const export_hierarchy_section_tipo = document.getElementById('export_hierarchy_section_tipo')
		const section_tipo 					= export_hierarchy_section_tipo.value 
		if (!section_tipo || section_tipo.length<1) {
			export_hierarchy_section_tipo.focus()
			alert("Empty field");
			return false
		}

		// Inject obj dataset vars
			obj.dataset.section_tipo = section_tipo			

			console.log("export_hierarchy obj.dataset:",obj.dataset);

		
		return this.trigger_call(obj, event)
	};//end export_hierarchy




	/**
	* UPDATE_JER_FROM_4_0_TO_4_1
	* @return 
	*/
	this.update_jer_from_4_0_to_4_1 = function(button_ob) {
		
		var input_tld 	 = button_ob.parentNode.querySelector('#tld')			
		var input_modelo = button_ob.parentNode.querySelector('#modelo')
		var response_div = button_ob.parentNode.querySelector('#update_jer_from_4_0_to_4_1_response')
			response_div.innerHTML = ''

			// Test input value
			var value_errors = false
			if(input_tld.value.length!==2) {
				value_errors = true
			}
			var matches = input_tld.value.match(/\d+/g)
			if (matches !== null) {
			   value_errors = true
			}
			if (value_errors===true) {
				response_div.innerHTML = "<div class=\"error\">Error. Empty or invalid tld. Please, type a valid two-character tld with no numbers</div>"
				input_tld.focus()
				return false;
			}

			response_div.innerHTML = "<div><span class=\"blink\">Processing. Please wait..</span> <span class=\"css_spinner\"></span></div>";

		var trigger_vars = {
			mode 	: 'update_jer_from_4_0_to_4_1',
			tld 	: input_tld.value,
			modelo 	: input_modelo.checked ? 'si' : 'no'
		}
		//return console.log(trigger_vars)

		var js_promise = common.get_json_data(tool_administration.url_trigger, trigger_vars).then(function(response) {
				if(SHOW_DEBUG===true) {
					console.log("[tool_administration.update_jer_from_4_0_to_4_1] response",response);
				}

				if (response===null) {
					response_div.innerHTML = "<div>An error has occurred. Null data is received (See console for details about)</div>"
				}else if(response.msg) {
					response_div.innerHTML = "<div>"+response.msg+"</div>"
				}

				if (SHOW_DEBUG===true) {
					response_div.innerHTML += "<pre>"+JSON.stringify(response, null, 2)+"</pre>"
				}
			})
	};//end update_jer_from_4_0_to_4_1



	/**
	* INIT_JSON_EDITOR
	* @return 
	*/
	this.init_json_editor = function() {

		let self = this 

		let editor_id 		 = "json_editor"
		let editor_text_area = document.getElementById(editor_id)
			// Hide real data container
			editor_text_area.style.display = "none"

		let result_div 		 = document.getElementById("convert_search_object_to_sql_query_response")

		// create the editor
		let container = document.getElementById(editor_id + '_container')
		let options   = {
				mode: 'code',
				modes: ['code', 'form', 'text', 'tree', 'view'], // allowed modes
				onError: function (err) {
				  alert(err.toString());
				},
				onChange: function () {

					setTimeout(function(){

						let editor_text = editor.getText()
				
						//var json = editor.get();
						// Update hidden text area value
						//editor_text_area.value = editor.getText()
						// Call trigger to create a sql query string
						// Inject obj dataset vars
				       	let obj = {
				       		dataset : {
				       			mode 		: "convert_search_object_to_sql_query",
				       			json_string : editor_text
				       		}
				       	}
				       	//return console.log(obj);						

						let result = self.trigger_call(obj, null)
						//console.log(result);

					}, 650)					
			    }			    
			}
		let editor_value = null; //'{"id":"temp","filter":[{"$and":[{"$or":[{"q":"{\"section_id\":\"4\",\"section_tipo\":\"numisdata300\",\"component_tipo\":\"numisdata309\"}","lang":"all","path":[{"name":"Catálogo","modelo":"component_select","section_tipo":"numisdata3","component_tipo":"numisdata309"}]},{"q":"{\"section_id\":\"2\",\"section_tipo\":\"numisdata300\",\"component_tipo\":\"numisdata309\"}","lang":"all","path":[{"name":"Catálogo","modelo":"component_select","section_tipo":"numisdata3","component_tipo":"numisdata309"}]}]},{"q":"1932","lang":"all","path":[{"name":"Número Catálogo","modelo":"component_input_text","section_tipo":"numisdata3","component_tipo":"numisdata27"}]}]}],"select":[{"path":[{"name":"Catálogo","modelo":"component_select","section_tipo":"numisdata3","component_tipo":"numisdata309"},{"name":"Catálogo","modelo":"component_input_text","section_tipo":"numisdata300","component_tipo":"numisdata303"}]},{"path":[{"name":"Número Catálogo","modelo":"component_input_text","section_tipo":"numisdata3","component_tipo":"numisdata27"}]},{"path":[{"name":"Ceca","modelo":"component_autocomplete","section_tipo":"numisdata3","component_tipo":"numisdata30"},{"name":"Ceca","modelo":"component_input_text","section_tipo":"numisdata6","component_tipo":"numisdata16"}]},{"path":[{"name":"Autoridad","modelo":"component_autocomplete","section_tipo":"numisdata3","component_tipo":"numisdata29"},{"name":"Apellidos","modelo":"component_input_text","section_tipo":"numisdata22","component_tipo":"rsc86"}]},{"path":[{"name":"Denominación","modelo":"component_autocomplete","section_tipo":"numisdata3","component_tipo":"numisdata34"},{"name":"Denominación","modelo":"component_input_text","section_tipo":"numisdata33","component_tipo":"numisdata97"}]}],"limit":50,"offset":0}'
		var editor 		 = new JSONEditor(container, options, editor_value)
		

	};//end init_json_editor



	/**
	* LONG_TIME_PROCESS
	* @return 
	*/
	this.long_time_process = function() {

		const trigger_url = tool_administration.url_trigger
		const trigger_vars= {
			mode : "long_time_process",
			timeout : 5000
		}


		// old
			/*
			// HTTPX Request
			common.get_json_data(tool_administration.url_trigger, trigger_vars).then(function(response) {
				console.log("response:",response);
			})

			return true
			*/

		const response = postData(trigger_url, trigger_vars)
			.then(data => console.log(JSON.stringify(data))) // JSON-string from `response.json()` call
			.catch(error => console.error(error));

		async function postData(url = ``, data = {}) {
		  // Default options are marked with *
		    return fetch(url, {
		        method: "POST", // *GET, POST, PUT, DELETE, etc.
		        mode: "cors", // no-cors, cors, *same-origin
		        cache: "no-cache", // *default, no-cache, reload, force-cache, only-if-cached
		        credentials: "same-origin", // include, *same-origin, omit
		        headers: {
		            "Content-Type": "application/json",
		            // "Content-Type": "application/x-www-form-urlencoded",
		        },
		        redirect: "follow", // manual, *follow, error
		        referrer: "no-referrer", // no-referrer, *client
		        body: JSON.stringify(data), // body data type must match "Content-Type" header
		    })
		    .then(response => response.json()); // parses JSON response into native Javascript objects 
		}

		
		

	};//end long_time_process



};//end tool_administration