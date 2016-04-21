


/**
* COMPONENT_LAYOUT CLASS
*/
var component_layout = new function() {

	this.save_arguments = {}
	this.full_component = {}
	this.ar_component_layout = []


	this.Save = function(component_obj) {
		/*
			// Get data from all inputs
			$.each( $('.css_input_text_layout:input'), function( key, element ) {		  

			  	var key_name = $(element).data('key_name'),
			  		value 	 = $(element).val();

			  	component_layout.full_component[key_name] = value		  	
			});
			//JSON.stringify(component_layout.full_component);
			console.log(component_layout.full_component)

			// Verify data is json compilant
			//var json_parse = tryParseJSON(component_layout.full_component)
			//if (!json_parse) {
			//	return alert("Error on save data is not json");
			//};

			this.save_arguments['dato'] = component_layout.full_component;
			*/

		// Exec general save
		component_common.Save(component_obj, this.save_arguments);
	}




	this.Save_html = function(html_content){

		var dato = this.html_parser_json(html_content)
		return dato;
		//return JSON.stringify(dato);
	}

	/**
	* HTML_PARSER_JSON
	* @param string html_content
	* @return object json_data
	*/
	this.html_parser_json = function(html_content){

		var html_pages = document.getElementsByClassName(html_content);


		var json_data  = {
							pages : []
						 }


		for (var i = 0; i<html_pages.length; i++) {

			var nodes_children = [];
			var all_nodes =  html_pages[i].getElementsByTagName('div');

			for (var j = 0; j<all_nodes.length; j++) {
				if (all_nodes[j].parentNode != html_pages[i]){
					continue
				}				
				nodes_children.push(all_nodes[j])
			}
			
			json_data.pages.push({

				html_id 	: html_pages[i].id,
				data 		: {
								tipo : html_pages[i].dataset.tipo,
								label : html_pages[i].dataset.label,
								page_type: html_pages[i].dataset.page_type
								//parent_section : html_pages[i].dataset.parent_section
							  },
				css 		: {
								class : html_pages[i].className.split(' '),
								style : component_layout.get_style_obj(html_pages[i].getAttribute('style'))									
							  },
				components 	: component_layout.get_ar_components(nodes_children),
				free_text 	: component_layout.get_ar_freeText(nodes_children),
				header 		: component_layout.get_ar_fixed(nodes_children, 'header'),
				footer 		: component_layout.get_ar_fixed(nodes_children, 'footer')					
			})
		}//end for (var i = 0; i<html_pages.length; i++) {

		return json_data;
	}//end html_parser_json

	
	/**
	* GET_STYLE_OBJ
	* @param string style_string
	* @reurn object current_style
	*/
	this.get_style_obj = function(style_string){
			
		var current_style = {}

		if(style_string){
			ar_style = style_string.split(';')
			for (var i = 0; i<ar_style.length; i++) {

				if(ar_style[i].length > 2){
					var ar_properties = ar_style[i].split(':')
					//console.log(ar_properties);
				
					var proterty_1 = ar_properties[0].trim()
					var proterty_2 = ar_properties[1].trim()

					current_style[proterty_1] = proterty_2
				}
			}//end for (var i = 0; i<ar_style.length; i++) {
		}
		//current_style = current_style.split(':')
		return current_style;
	}//end get_style_obj


	/**
	* GET_AR_COMPONENTS
	* @param array ar_div_components
	*
	*/
	this.get_ar_components = function(ar_div_components){

		var components = []

		for (var i = 0; i<ar_div_components.length; i++) {

			if(ar_div_components[i].dataset.parent_section) {				
				
				var final_dataset   = {},
					current_dataset = ar_div_components[i].dataset

				for (var key in current_dataset) {
					//console.log( current_dataset[key] );
					//console.log( JSON.parse(current_dataset[key]) );
					switch(true){
						case (key=='layout_map'):
						case (key=='html_options'):
						case (key=='print_options'):
							var element = JSON.parse(current_dataset[key])
							break;
						default:
							var element = current_dataset[key]
							break;
					}										
					//console.log(element );
					final_dataset[key] = element;
				}
				//console.log(final_dataset);

				
				components.push ({					
							html_id : ar_div_components[i].id,
							//data 	: ar_div_components[i].dataset,
							data 	: final_dataset,	
							/*					
							data 	: {
										component_tipo 	: ar_div_components[i].dataset.component_tipo,
										parent_section 	: ar_div_components[i].dataset.parent_section,
										//parent_portal : ar_div_components[i].dataset.parent_portal,
										layout_map 		: JSON.parse(ar_div_components[i].dataset.layout_map)
									},
									*/
							
							css 	: {
										class : ar_div_components[i].className.split(' '),
										style : component_layout.get_style_obj(ar_div_components[i].getAttribute('style'))
									}
						});
			}//end if(ar_div_components[i].dataset.parent_section){

		}//end for (var i = 0; i<ar_div_components.length; i++) {

		function compare(component_a,component_b) {
			var a = parseInt(component_a.css.style.top),
				b = parseInt(component_b.css.style.top);
			if (a < b)
				return -1;
			if (a > b)
				return 1;
			return 0;
		}

		components.sort(compare);
			//console.log(components);
		return components
	}//end get_ar_components


	/**
	* GET_AR_FREETEXT
	* @param array ar_div_freeText
	* @return array ar_free_text
	*/
	this.get_ar_freeText = function(ar_div_freeText){

		var ar_free_text	= []

		for (var i = 0; i<ar_div_freeText.length; i++) {
			
			var element = ar_div_freeText[i],
				typology 	= element.dataset.typology,
				id 		= element.id

			// Filter only elements with dataset typology:'free_text' are accepted
			if(typology == "free_text") {				
				//console.log(element);

				// Text editable conten is in a inside div (class="editable_text")
				var children_editor_div = $(element).find('.editable_text') //console.log(children_editor_div.html());
				// Tex editor content
				var text_editor_content=''
				if (children_editor_div.length==1) {
					text_editor_content = children_editor_div.html();					
				}
				// TinyMCE bug on empty content				
				if (text_editor_content.indexOf('data-mce-bogus=')!=-1) {
					text_editor_content='';  //console.log("Removed bogus bug: "+text_editor_content);
				}

				ar_free_text.push ({
							html_id 	: ar_div_freeText[i].id,
							data 		: {
											typology : ar_div_freeText[i].dataset.typology
										  },
							css 		: {
											class : ar_div_freeText[i].className.split(' '),
											style : component_layout.get_style_obj(ar_div_freeText[i].getAttribute('style'))
										  },
							content 	: text_editor_content
						});
				
				/*
					if(ar_div_freeText[i].dataset.parent_section || typeof ar_div_freeText[i].id == 'undefined' || ar_div_freeText[i].id.length < 1)
						{
							continue;
					}else{
						
						var text_node 		= ar_div_freeText[i].cloneNode(true);
						//var text_node_clean = ar_div_freeText[i].cloneNode(false);
						//var virtual_div = document.createElement("div");
						//virtual_div.appendChild(text_node_clean);
						//html_text = virtual_div.innerHTML
						html_text='';
						//document.removeChild.virtual_div;
						
						var nodes_number 	= text_node.childNodes.length;
						var tinny_text = '';

							for (var i = 0; i < nodes_number; i++) {

								//console.log(text_node);
								console.log(i);
								//console.log(nodes_number);
								//console.log(text_node.childNodes)
								//console.log(text_node.childNodes[i])
								//console.log(text_node.childNodes[i].className)
								//console.log(text_node.childNodes[i].className.indexOf('editable_text'));

								if(typeof text_node.childNodes[i].className == 'undefined'){
									console.log("OJO TEXTO SUELTO");
									//i--;
									continue;
								}

								if(text_node.childNodes[i].className.indexOf("editable_text") > -1){
									console.log("tinny_text!!!");
									//tinny_id = text_node.childNodes[i].id
									//tinny_text = tinyMCE.get(tinny_id);
									//console.log(tinny_id);
									//tinny_text = tinymce.tinny_mierda.getContent({format: 'raw'})
									
									break;
								}
							};  
							*/

					//var content_editalbe = ar_div_freeText[i].getElementsByClassName('editable_text');
					//var text_clean = text_node.appendChild(content_editalbe);
			
			}//end if(tipo == "free_text"){

		}//end for (var i = 0; i<ar_div_freeText.length; i++) {

		return ar_free_text
	}




	/**
	* GET_AR_FIXED_HEADER
	* @param array ar_div_fixed
	* @param object fixed_element
	* @return object ar_fixed
	*/
	this.get_ar_fixed = function(ar_div_fixed, fixed_element){

		var ar_fixed = {}

		for (var i = 0; i<ar_div_fixed.length; i++) {

			if(ar_div_fixed[i].dataset.tipo == "fixed_element"){

				if(ar_div_fixed[i].id == fixed_element){
					
					ar_fixed['html_id'] 	= ar_div_fixed[i].id
					ar_fixed['data'] 		= {
												tipo : ar_div_fixed[i].dataset.tipo
											  }
					ar_fixed['css'] 		= {
												class : ar_div_fixed[i].className.split(' '),
												style : component_layout.get_style_obj(ar_div_fixed[i].getAttribute('style'))
											  }
					ar_fixed['components'] 	= component_layout.get_ar_components(ar_div_fixed[i].childNodes)
					ar_fixed['free_text'] 	= component_layout.get_ar_freeText(ar_div_fixed[i].childNodes)
				}//end if(ar_div_fixed[i].id == fixed_element){
			}//end if(ar_div_fixed[i].dataset.tipo == "fixed_element"){

		}//end for (var i = 0; i<ar_div_fixed.length; i++) {

		return ar_fixed

	}//end get_ar_fixed


			

}//end component_layout class
