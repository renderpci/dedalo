/**
* COMPONENT_SELECT
*
*
*
*/
var component_select = new function() {


	this.save_arguments = {} // End save_arguments


	/**
	* SAVE
	*/
	this.Save = function(component_obj) {

		var wrap_div = find_ancestor(component_obj, 'wrap_component')
			if (wrap_div === null ) {
				if(DEBUG) console.log(btn_obj);
				return alert("component_input_text:Save: Sorry: wrap_div dom element not found")
			}
		

		// Exec general save
		var jsPromise = component_common.Save(component_obj, this.save_arguments).then(function(response){

			// mandatory test
			component_select.mandatory(wrap_div.id)
		})		
	};



	/**
	* OPEN_SECTION
	* @return 
	*/
	this.open_section = function(button_obj) {
		
		var wrap_div = find_ancestor(button_obj, 'wrap_component')
			if (wrap_div === null ) {
				if(DEBUG) console.log(button_obj);
				return alert("component_select:open_section: Sorry: wrap_div dom element not found")
			}

		var section_tipo = wrap_div.dataset.referenced_section_tipo
			//console.log(section_tipo);

		var window_url	= DEDALO_LIB_BASE_URL + '/main/?t='+section_tipo
		var window_name	= "component_select_window";

		// Open and focus window
		var component_select_window=window.open(window_url, window_name, page_globals.float_window_features.small);
		component_select_window.focus()

		// REFRESH_COMPONENTS ADD PORTAL
		// Calculate wrapper_id and ad to page global var 'components_to_refresh'
		// Note that when tool window is closed, main page is focused and trigger refresh elements added
		var wrap_div = find_ancestor(button_obj, 'wrap_component')
			if (wrap_div === null ) {
				if(DEBUG) console.log(button_obj);
				return alert("component_select:open_section: Sorry: wrap_div dom element not found")
			}
		var wrapper_id = wrap_div.id;
		//var wrapper_id = component_common.get_wrapper_id_from_element(button_obj);			
		html_page.add_component_to_refresh(wrapper_id);
	};//end open_section



	/**
	* MANDATORY
	* When input dataset mandatory var is true
	* Add class 'mandatory' to element (input) when content is empty
	*/
	this.mandatory = function(id_wrapper) {
	
		var wrapper = document.getElementById(id_wrapper)
			if (wrapper===null) {
				console.log("Error on select wrapper for id: "+id_wrapper);	
				return false;
			}

		var input_obj = wrapper.querySelector('select.css_select')

		if (this.is_empty_value(input_obj)===true) {
			input_obj.classList.add('mandatory')
		}else{
			input_obj.classList.remove('mandatory')
		}			
	};//end mandatory



	/**
	* IS_EMPTY_VALUE
	* @return bool
	*/
	this.is_empty_value = function(input_obj) {
		
		if (input_obj.value.length > 0) {
			return false
		}

		return true;
	};//end is_empty_value



	/**
	* SELECT_COMPONENT
	*/
	this.select_component = function(obj_wrap) {	
			
		obj_wrap.classList.add("selected_wrap");
		
		var select = obj_wrap.querySelector('select.css_select') //$(obj_wrap).find('select.css_select').first()
			if(select) {
				select.focus()				
			}				
		
		return false;
	};//end select_component



}//end component_select