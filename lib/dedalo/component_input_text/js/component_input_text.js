"use strict";
/**
* COMPONENT_INPUT_TEXT
* Manages the component's logic and apperance in client side
*
*
*/
var component_input_text = new function() {

	// Inheritance
	//this.__proto__ = component_common
	//component_common.call(this); // call super constructor.
	//this = Object.create(component_common);

	// subclass extends superclass
	//this.prototype = Object.create(component_common.prototype);
	//this.prototype.constructor = this;

	// Object vars
	this.input_text_objects = []
	this.save_arguments 	= {}


	/**
	* INIT
	* @return 
	*/
	this.inited = {}
	this.init = function(data) {

		var self = this		

		let wrapper_id  = "wrapper_" + data.uid		
		let wrapper_obj = document.getElementById(wrapper_id)
		if (!wrapper_obj) {
			console.log("[component_input_text.init] Error: wrapper_obj not found. wrapper_id:",wrapper_id);
			return false;
		}

		// Fix vars
		self.section_tipo 	= wrapper_obj.dataset.section_tipo
		self.section_id 	= wrapper_obj.dataset.parent
		self.component_tipo= wrapper_obj.dataset.tipo
		self.lang 			= wrapper_obj.dataset.lang

		// UID for init object tracking (not add lang never here!)
		const init_uid = self.section_tipo +"_"+ self.section_id +"_"+ self.component_tipo
		

		//if( typeof this.inited[init_uid]==="undefined" ) {

			//console.log("[component_input_text.init] data", data);			

			// Add tool lang multi button
			if ( ((wrapper_obj.dataset.modo==='edit' && page_globals.modo==='list') || page_globals.modo==='edit' || page_globals.modo==='tool_lang' || page_globals.modo==='tool_structuration') && data.traducible==='si') {
				let tool_button = inspector.build_tool_button({ tool_name	: 'tool_lang_multi',
																label 		: "",//get_label['tool_lang_multi'],
																title 		: get_label['tool_lang_multi'],
																tipo		: wrapper_obj.dataset.tipo,
																parent 		: wrapper_obj.dataset.parent,
																section_tipo: wrapper_obj.dataset.section_tipo,
																lang  		: wrapper_obj.dataset.lang,
																context_name: "tool_lang_multi"
																})
				
				let component_tools_container = document.createElement("div")
					component_tools_container.classList.add('component_tools_container', 'edit_hidden')
					component_tools_container.appendChild(tool_button)

				wrapper_obj.appendChild(component_tools_container)
			}//end if (page_globals.modo==='edit')
		//}//end if( typeof this.inited[init_uid]==="undefined" )


		this.inited[init_uid] = true

		return true
	}//end init
	
	

	/**
	* SAVE
	* @param object component_obj
	* @return promise js_promise
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
		var js_promise = component_common.Save(component_obj, this.save_arguments).then(function(response) {

			  	// Update possible dato in list (in portal x example)
				component_common.propagate_changes_to_span_dato(component_obj);

				// Exec mandatory test
				component_input_text.mandatory(wrap_div.id)

			}, function(xhrObj) {
			  	console.log(xhrObj);
			});

		return js_promise
	};//end Save



	/**
	* GET_DATO
	* @param DOM object component_obj
	* @return array dato
	*/
	this.get_dato = function(component_obj) {

		var dato =[]

		if (component_obj.classList.contains('wrap_component')===true) {
			// Case received object is the component wrapper
			var parent_ul = component_obj.getElementsByTagName('ul')[0]
		}else{
			// Common case, component received is a input text inside a li element
			var parent_ul = component_obj.parentNode.parentNode
		}	
		
		// li elements
		var li_nodes = parent_ul.childNodes

		var len = li_nodes.length
		for (var i = 0; i < len; i++) {
			//var value = li_nodes[i].querySelector("input").value
			var value = li_nodes[i].getElementsByTagName('input')[0].value
			if(value.length > 0){
				dato.push(value)
			}
		}

		return dato
	};//end get_dato



	/**
	* MANDATORY
	* When input dataset mandatory var is true
	* Add class 'mandatory' to element (input) only when content is empty
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
	* Generates new full input html (including li) cloning first input element
	* and append to parent ul
	*/
	this.add_input_text = function(component_obj) {

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
		ul_input_text.appendChild(new_li)

		return true
	}//end add_input_text
	


}//end component_input_text