"use strict";
/**
* COMPONENT_IRI
*
*
*/
var component_iri = new function() {

	
	this.iri_objects 	= []
	this.save_arguments = {}



	/**
	* INIT
	* @return 
	*/
	this.init = function(options) {
		
		return true
	};//end init


	/**
	* GET_DATO
	* update 13-01-2018
	* @return string dato
	*/
	this.get_dato = function(wrapper_obj) {

		if (typeof(wrapper_obj)=="undefined" || !wrapper_obj) {
			console.log("[component_iri:get_dato] Error. Invalid wrapper_obj");
			return false
		}

		//const li_nodes = wrapper_obj.getElementsByTagName("li");

		const li_nodes = wrapper_obj.getElementsByClassName("input-group");

		//var parent_ul 	= component_obj.parentNode.parentNode;
		//let li_nodes 	= parent_ul.childNodes;

		let dato = []

		const len = li_nodes.length

		for (let i = 0; i < len; i++) {
			const title_value 	= li_nodes[i].querySelector('input[type="text"]').value
			const iri_value 	= li_nodes[i].querySelector('input[type="url"]').value
			if(title_value.length > 0 || iri_value.length > 0 ){
				dato.push({
					iri 	: iri_value,
					title	: title_value
					})
			}
		}
		
		return dato
	};//end get_dato



	/**
	* SAVE
	* @param object component_obj
	*/
	this.Save = function(component_obj) {

		let self = this

		let wrap_div = find_ancestor(component_obj, 'wrap_component')
			if (wrap_div === null ) {
				if(SHOW_DEBUG===true) console.log(btn_obj);
				return alert("component_iri:Save: Sorry: wrap_div dom element not found")
			}		

		// Get dato specific
		let dato = self.get_dato(wrap_div)

		// Set to save
		self.save_arguments.dato = dato
		
		// Exec general save
		var js_promise = component_common.Save(component_obj, self.save_arguments).then(function(response) {

				// Exec mandatory test
				//component_iri.mandatory(wrapper_obj.id)

				//Reload the component
				//component_common.load_component_by_wrapper_id(wrapper_obj.id);

				self.reload_source_component(component_obj)

			}, function(xhrObj) {
			  	console.log(xhrObj);
			});


		return js_promise
	};//end Save


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
	* VALIDATE_IRI
	*/
	this.validate_iri = function(component_obj){
		component_obj.classList.add("css_iri_validate")
	}//end validate_iri



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
		var iri = parent.querySelector('input[type="url"]').value
			//console.log(iri.value);
		if(iri.length <= 0){
			return
		}
		window.open(iri, '_blank')

	}//end go_iri_link



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
	}//end add_iri
		



	/**
	* RELOAD_SOURCE_COMPONENT
	*/
	this.reload_source_component = function(component_obj){

		let self = this

		let wrap_div = find_ancestor(component_obj, 'wrap_component')
			if (wrap_div === null ) {
				if(SHOW_DEBUG===true) console.log(btn_obj);
				return alert("component_iri:Save: Sorry: wrap_div dom element not found")
			}
		
		const source_component_tipo = wrap_div.dataset.source_for_component
		if(source_component_tipo){
			const section_id = wrap_div.dataset.parent
			const section_tipo = wrap_div.dataset.section_tipo
			const source_component = component_common.get_component_wrapper(source_component_tipo, section_id, section_tipo)

			const wrapper_id = source_component.id

			component_common.load_component_by_wrapper_id(wrapper_id)

			return true

		}


	}//end reload_source_component

}//end component_iri