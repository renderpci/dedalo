
/**
* COMPONENT_INPUT_TEXT
* Manages the component's logic and apperance in client side
*
*/
var component_input_text = new function() {
	'use strict'; 
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
	this.init = function(options) {

		const self = this	

		if (options.modo==="edit_in_list") {
			return false
		}	

		const wrapper_id  = "wrapper_" + options.uid		
		const wrapper_obj = document.getElementById(wrapper_id)
		if (!wrapper_obj) {
			console.log("[component_input_text.init] Error: wrapper_obj not found. wrapper_id:",wrapper_id,options);
			return false;
		}

		// Fix vars
		self.section_tipo 	= wrapper_obj.dataset.section_tipo
		self.section_id 	= wrapper_obj.dataset.parent
		self.component_tipo = wrapper_obj.dataset.tipo
		self.lang 			= wrapper_obj.dataset.lang

		// UID for init object tracking (not add lang never here!)
		const init_uid = self.section_tipo +"_"+ self.section_id +"_"+ self.component_tipo
		

		//if( typeof this.inited[init_uid]==="undefined" ) {

			//console.log("[component_input_text.init] options", options);			

			// Add tool lang multi button
			if ((options.traducible==='si' || options.with_lang_versions===true) && 
				((wrapper_obj.dataset.modo==='edit' && page_globals.modo==='list') || page_globals.modo==='edit' || page_globals.modo==='tool_lang' || page_globals.modo==='tool_structuration')) {
				const tool_button = inspector.build_tool_button({ tool_name	: 'tool_lang_multi',
																label 		: "",//get_label['tool_lang_multi'],
																title 		: get_label['tool_lang_multi'],
																tipo		: wrapper_obj.dataset.tipo,
																parent 		: wrapper_obj.dataset.parent,
																section_tipo: wrapper_obj.dataset.section_tipo,
																lang  		: wrapper_obj.dataset.lang,
																context_name: "tool_lang_multi"
																})
				
				const component_tools_container = document.createElement("div")
					component_tools_container.classList.add('component_tools_container', 'edit_hidden')
					component_tools_container.appendChild(tool_button)

				wrapper_obj.appendChild(component_tools_container)
			////}//end if (page_globals.modo==='edit')
		}//end if( typeof this.inited[init_uid]==="undefined" )


		this.inited[init_uid] = true

		return true
	}//end init



	/**
	* GET_DATO
	* @param DOM object wrapper_obj
	* @return array dato
	*/
	this.get_dato = function(wrapper_obj) {

		if (typeof(wrapper_obj)=="undefined" || !wrapper_obj) {
			console.log("[component_input_text:get_dato] Error. Invalid wrapper_obj");
			return false
		}

		const dato = []

		// ul list of inputs
		const parent_ul = wrapper_obj.getElementsByTagName('ul')[0] //wrapper_obj.querySelector('.content_data')
		
		// li elements
		const li_nodes = parent_ul.childNodes			

		const len = li_nodes.length
		for (let i = 0; i < len; i++) {
			let value = li_nodes[i].getElementsByTagName('input')[0].value
			if(value.length > 0){
				dato.push(value)
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
		const dato_parsed  = dato

		if (!Array.isArray(dato_parsed)) {
			console.error("Invalid dato for search (must be an array):", dato);
		}else{
			const dato_parsed_length = dato_parsed.length
			for (let i = 0; i < dato_parsed_length; i++) {
				search_value += dato_parsed[i]
			}
		}

		return search_value
	};//end get_search_value_from_dato
	
	
	

	/**
	* SAVE
	* @param object component_obj
	* @return promise js_promise
	*/
	this.Save = function(component_obj) {

		const self = this

		const wrap_div = find_ancestor(component_obj, 'wrap_component')
			if (wrap_div === null ) {
				if(SHOW_DEBUG===true) console.log(btn_obj);
				return alert("component_input_text:Save: Sorry: wrap_div dom element not found")
			}

		// Get dato specific
		const dato = self.get_dato(wrap_div)

		// Set for save
		self.save_arguments.dato = dato;	
		
		// Exec general save
		const js_promise = component_common.Save(component_obj, self.save_arguments).then(function(response) {

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
	* MANDATORY
	* When input dataset mandatory var is true
	* Add class 'mandatory' to element (input) only when content is empty
	*/
	this.mandatory = function(id_wrapper) {

		const wrap_div = document.getElementById(id_wrapper)
			if (wrap_div===null) {
				console.log("Error on select wrap_div for id: "+id_wrapper);	
				return false;
			}

		const component_obj = wrap_div.querySelector('input.css_input_text')
		const add_button_obj = wrap_div.querySelector('.btn_add_input_text')
		
		if(!component_obj) return false;
		// Component dataset mandatory info
		const mandatory = JSON.parse(component_obj.dataset.mandatory)
		if (!mandatory || mandatory!==true) return false;

		if (this.is_empty_value(wrap_div)===true) {
			component_obj.classList.add('mandatory')
			if (add_button_obj) {
				add_button_obj.classList.add('mandatory')
			}
			
		}else{
			component_obj.classList.remove('mandatory')
			if (add_button_obj) {
				add_button_obj.classList.remove('mandatory')
			}
		}

		return true
	};//end mandatory



	/**
	* IS_EMPTY_VALUE
	* @return bool
	*/
	this.is_empty_value = function(wrap_div) {

		let empty_value = true;

		const dato = this.get_dato(wrap_div);
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

		const parent = component_obj.parentNode;
		//select the ul and li nodes
		const ul_input_text = parent.querySelector("ul");
		const li_input_text = ul_input_text.querySelector("li");
		//clone the frist li
		const new_li = li_input_text.cloneNode(true);

		//count the number of childrens
		const total_li_nodes = ul_input_text.childNodes.length
		//clear value for the new li node
		const new_li_input = new_li.querySelector("input")
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

