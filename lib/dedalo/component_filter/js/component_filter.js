"use strict"
/**
* COMPONENT_FILTER
*
*
*/
var component_filter = new function() {
	

	this.component_filter_objects = {}
	this.save_arguments = {}
	
	
	switch(page_globals.modo) {
		case 'tool_time_machine' :
		case 'edit' :
			$(function() {
				component_filter.check_filter_state();
			});
			break;
	}



	/**
	* INIT
	* @return 
	*/
	this.init = function(options) {
		

		return true
	};//end init



	/**
	* GET_DATO
	* @return 
	*/
	this.get_dato = function(wrapper_obj) {

		if (typeof(wrapper_obj)=="undefined" || !wrapper_obj) {
			console.log("[component_filter:get_dato] Error. Invalid wrapper_obj");
			return false
		}		

		let dato = []

		// ul list of inputs
		const parent_ul = wrapper_obj.getElementsByTagName('ul')[0] //wrapper_obj.querySelector('ul.filter_projects_list')
		if (typeof(parent_ul)=="undefined" || !parent_ul) {
			console.log("[component_filter:get_dato] Error. Invalid parent_ul");
			return false
		}
		
		// li elements
		const li_nodes = parent_ul.childNodes

		const len = li_nodes.length
		for (let i = 0; i < len; i++) {
			let checkbox_item 	= li_nodes[i].getElementsByTagName('input')[0]
			let checked 		= checkbox_item.checked			
			if(checked===true) {
				let checkbox_value 	= JSON.parse(checkbox_item.value)					
				dato.push( checkbox_value)		
			}
		}


		return dato
	};//end get_dato



	/**
	* GET_SEARCH_VALUE_FROM_DATO
	* Converts dato object to string ready to search
	* @return string search_value
	*/
	this.get_search_value_from_dato = function(dato) {
			
		let search_value = ''
		
		const size = Object.keys(dato).length		
		if (size>0) {
			search_value = JSON.stringify(dato)
		}		
	
		return search_value
	};//end get_search_value_from_dato



	/**
	* SAVE
	*/
	this.Save = function(component_obj) {

		const self = this

		const wrap_div = find_ancestor(component_obj, 'wrap_component')
			if (wrap_div === null ) {
				if(SHOW_DEBUG===true) console.log(btn_obj);
				return alert("component_input_text:Save: Sorry: wrap_div dom element not found")
			}

		// Get dato
		const dato = self.get_dato(wrap_div)
		
		// Asign to save
		self.save_arguments.dato = dato		
		
		// Exec general save
		let js_promise = component_common.Save(component_obj, self.save_arguments).then(function(response) {
		  	
			// check_filter_state
		  	component_filter.check_filter_state();
		
		}, function(xhrObj) {
		  	console.log("xhrObj",xhrObj);
		});


		return js_promise
	};//end Save


	/**
	* GET_FILTER_CHECKED_VALUE
	* Get checked values
	*/
	this.get_filter_checked_values = function() {
		//console.log($(component_obj).val())
		//console.log(document.querySelector('.filter_checkbox:checked').value)
		var checked_values 	= []; 
		const inputElements 	= document.getElementsByClassName('filter_checkbox');	//console.log(inputElements.length)

		// If not exists 'inputElements' we are in read onl mode. Return 1 to avoid add class 'filter_without_selection'
		if (inputElements.length==0) return 1;

		var len = inputElements.length;
		for (var i = len - 1; i >= 0; i--) {
		      if(inputElements[i].checked){
		      	let val = inputElements[i].value;
				checked_values.push(val) ;	//console.log(checked_values+" i:"+i)	
		        //break; 
		      }
		}
		//console.log(checked_values)
		return checked_values;
	};



	/**
	* CHECK_FILTER_STATE
	*/
	this.check_filter_state = function() {
		setTimeout(function() {
			var checked_values = component_filter.get_filter_checked_values();
			if (checked_values.length<1) {
				//console.log("adding style")
				$('.css_wrap_filter').addClass('filter_without_selection')
			}else{
				//console.log("removing style")
				$('.css_wrap_filter').removeClass('filter_without_selection')
			}
		}, 10)
		
	}



}//end component_filter