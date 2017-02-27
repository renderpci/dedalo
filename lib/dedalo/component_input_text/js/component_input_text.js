// JavaScript Document





var component_input_text = new function() {

	
	this.input_text_objects = []
	this.save_arguments 	= {}

	
	/**
	* SAVE
	* @param object component_obj
	*/
	this.Save = function(component_obj) {

		// Get dato specific
		this.save_arguments.dato = JSON.stringify(this.get_dato(component_obj))

		var wrap_div = find_ancestor(component_obj, 'wrap_component')
			if (wrap_div === null ) {
				if(DEBUG) console.log(btn_obj);
				return alert("component_input_text:Save: Sorry: wrap_div dom element not found")
			}
		
		// Exec general save
		var jsPromise = component_common.Save(component_obj, this.save_arguments).then(function(response) {

			  	// Update possible dato in list (in portal x example)
				component_common.propagate_changes_to_span_dato(component_obj);

				// Exec mandatory test
				component_input_text.mandatory(wrap_div.id)

			}, function(xhrObj) {
			  	console.log(xhrObj);
			});
	};



	/**
	* GET_DATO
	* @return string dato
	*/
	this.get_dato = function(component_obj) {

		var parent_ul 	= component_obj.parentNode.parentNode;
		var li_nodes 	= parent_ul.childNodes;

		var dato =[];

		for (var i = 0; i < li_nodes.length; i++) {
			var value = li_nodes[i].querySelector("input").value
			if(value.length > 0){
				dato.push(value)
			}
		}
		return dato
	};//end get_dato



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
		var component_obj = wrapper.querySelector('input.css_input_text')
		
		// Component dataset mandatory info
		var mandatory = JSON.parse(component_obj.dataset.mandatory)
		if (!mandatory || mandatory!==true) return false;

		if (this.is_empty_value(component_obj)===true) {
			component_obj.classList.add('mandatory')
		}else{
			component_obj.classList.remove('mandatory')
		}
	};//end mandatory



	/**
	* IS_EMPTY_VALUE
	* @return bool
	*/
	this.is_empty_value = function(component_obj) {

		var empty_value = true;

		var dato = this.get_dato(component_obj);
		if (dato.length>0) {
			empty_value = false;
		}

		return empty_value;
	};//end is_empty_value

	
	/**
	* ADD_INPUT_TEXT
	*/
	this.add_input_text = function(component_obj){
		var parent = component_obj.parentNode;
		//select the ul and li nodes
		var ul_input_text = parent.querySelector("ul");
		var li_input_text = ul_input_text.querySelector("li");
		//clone the frist li
		var new_li = li_input_text.cloneNode(true);

		//count the number of childrens
		var total_li_nodes = ul_input_text.childNodes.length
		//clear value for the new li node
		var new_li_input = new_li.querySelector("input")
		new_li_input.value ="";

		//remove the mandatoy style
		new_li_input.classList.remove('mandatory')

		//set the id to the raid position
		new_li_input.id = new_li_input.id.replace("input_0","input_"+total_li_nodes);
		//remove the clone "onchange" listener
		//new_li_input.removeEventListener("onchange","component_iri")
		//append the new node to the ul
		ul_input_text.appendChild(new_li);
	
	}
	
		

}//end component_input_text