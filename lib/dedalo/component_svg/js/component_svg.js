"use strict";
/**
* COMPONENT_SVG
* Manage the components logic and appearance in client side
*
*/
var component_svg = new function() {


	// Object vars
	this.save_arguments 	= {}


	/**
	* INIT
	* @return bool true
	*/
	this.inited = {}
	this.init = function(options) {

		const self = this

		switch(options.modo) {
			case 'edit':
			//case 'player':
				const svg_container_id  = "svg_container_" + options.uid
				const svg_container_obj = document.getElementById(svg_container_id)
					
				// Add svg element
				self.build_svg_player(svg_container_obj, options)
				break;
		}
		

		return true
	}//end init



	/**
	* BUILD_SVG_PLAYER
	* @return dom obejct player_obj
	*/
	this.build_svg_player = function(svg_container_obj, options) {

		const file_exists 	= options.file_exists // if false, a default upload svg is used as file_url
		const file_url 		= options.file_url
		const file_content 	= options.file_content
		
		const player_obj = common.create_dom_element({
			element_type	: 'div',
			parent 			: svg_container_obj,
			class_name 		: "svg_player_div",
			//inner_html 	: file_content	
		})

		const wrapper = document.getElementById("wrapper_" + options.uid) 

		/*
		<img id="[svg-n-1-]"
		class="svg
		grid_image"
		data-type="svg"
		data-tag_id="0"
		data-state="n"
		data-label=""
		data-data="{'section_tipo':'scell1','section_id':'2','component_tipo':'hierarchy95'}"
		src="/dedalo4/media_test/media_development/svg/hierarchy95_scell1_2.svg?1532420736,8719">
		*/

		const locator = {
			section_tipo 	: wrapper.dataset.section_tipo,
			section_id 		: wrapper.dataset.parent,
			component_tipo 	: wrapper.dataset.tipo,
		}
		const locator_flat = replaceAll('"', '\'', JSON.stringify(locator))
		const img_default_dataset = {
				type 	: "svg",
				tag_id 	: "0",
				state 	: "n",
				label 	: "",
				data 	: locator_flat
			}; // console.log("img_default_dataset:",img_default_dataset, options);
				
		const svg_obj = common.create_dom_element({
			element_type	: 'img',
			id 				: "[svg-n-0-]",
			parent 			: player_obj,
			class_name 		: "svg svg_element",
			dataset 		: img_default_dataset
		})
		svg_obj.setAttribute("src",file_url)
		//svg_obj.setAttribute("draggable",true)		
		//svg_obj.setAttribute("width", "100")
		//svg_obj.setAttribute("height", "100")

		// When real file not exists
		if (file_exists===false) {
			// Add different class placeholder
			svg_obj.classList.add("upload_placeholder")
			// Add click event handler
			svg_obj.addEventListener("click", function(e){

				// Wrapper
				const wrapper = component_common.get_wrapper_from_element(this)

				// Add dataset for compatibility
				this.dataset.tipo 			= wrapper.dataset.tipo
				this.dataset.tipo 		 	= wrapper.dataset.tipo,
				this.dataset.parent 		= wrapper.dataset.parent,
				this.dataset.section_tipo 	= wrapper.dataset.section_tipo,
				//this.dataset.sid		 	= options.svg_id,
				//this.dataset.quality 	 	= null
				
				// Open upload tool
				tool_common.open_tool_upload(this)
			})
		}
		//console.log("file_url:",file_url);
		//console.log("svg_obj:",svg_obj);
		
		return player_obj
	}//end build_svg_player



	/**
	* GET_DATO
	* @param DOM object wrapper_obj
	* @return array dato
	*//*
	this.get_dato = function(wrapper_obj) {

		if (typeof(wrapper_obj)==="undefined" || !wrapper_obj) {
			console.log("[component_input_text:get_dato] Error. Invalid wrapper_obj");
			return false
		}

		let dato = []

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
	}//end get_dato
	*/



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
	}//end get_search_value_from_dato

	

	/**
	* SAVE
	* @param object component_obj
	* @return promise js_promise
	*/
	this.Save = function(component_obj) {

		let self = this

		let wrap_div = find_ancestor(component_obj, 'wrap_component')
			if (wrap_div === null ) {
				if(SHOW_DEBUG===true) console.log(btn_obj);
				return alert("component_input_text:Save: Sorry: wrap_div dom element not found")
			}

		// Get dato specific
		let dato = self.get_dato(wrap_div)

		// Set for save
		self.save_arguments.dato = dato;	
		
		// Exec general save
		let js_promise = component_common.Save(component_obj, self.save_arguments).then(function(response) {

				// Update possible dato in list (in portal x example)
				component_common.propagate_changes_to_span_dato(component_obj);

				// Exec mandatory test
				component_input_text.mandatory(wrap_div.id)

			}, function(xhrObj) {
				console.log(xhrObj);
			});

		return js_promise
	}//end Save



}//end component_svg