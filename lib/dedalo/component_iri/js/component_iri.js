// JavaScript Document





var component_iri = new function() {

	
	this.iri_objects = []
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
				return alert("component_iri:Save: Sorry: wrap_div dom element not found")
			}
		
		// Exec general save
		var jsPromise = component_common.Save(component_obj, this.save_arguments).then(function(response) {

				// Exec mandatory test
				//component_iri.mandatory(wrap_div.id)

				//Reload the component
				//component_common.load_component_by_wrapper_id(wrap_div.id);

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
				dato.push({
					iri : value
					})
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
		var component_obj = wrapper.querySelector('input.css_iri')
		
		// Component dataset mandatory info
		//var mandatory = JSON.parse(component_obj.dataset.mandatory)
		//	if (!mandatory || mandatory!==true) return false;

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
	* GO_IRI_LINK
	*/
	this.go_iri_link = function(component_obj){
		var parent = component_obj.parentNode;
		var iri = parent.querySelector("input").value
			console.log(iri.value);
		if(iri.length <= 0){
			return
		}
		window.open(iri, '_blank')

	}

	/**
	* ADD_IRI
	*/
	this.add_iri = function(component_obj){
		var parent = component_obj.parentNode;
		//select the ul and li nodes
		var ul_iri = parent.querySelector("ul");
		var li_iri = ul_iri.querySelector("li");
		//clone the frist li
		var new_li = li_iri.cloneNode(true);
		//count the number of childrens
		var total_li_nodes = ul_iri.childNodes.length
		//clear value for the new li node
		var new_li_input = new_li.querySelector("input")
		new_li_input.value ="";

		//set the id to the raid position
		new_li_input.id = new_li_input.id.replace("input_0","input_"+total_li_nodes);
		//remove the clone "onchange" listener
		//new_li_input.removeEventListener("onchange","component_iri")
		//append the new node to the ul
		ul_iri.appendChild(new_li);	
	}
		

}//end component_iri