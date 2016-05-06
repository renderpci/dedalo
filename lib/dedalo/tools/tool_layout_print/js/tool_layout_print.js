


/**
* TOOL_LAYOUT_PRINT CLASS
*/
var tool_layout_print = new function() {

	this.trigger_url 		 = DEDALO_LIB_BASE_URL + '/tools/tool_layout_print/trigger.tool_layout_print.php?top_tipo='+page_globals.top_tipo ;
	this.layout_html_content = '';


	
	window.addEventListener("load", function (event) {
		//console.log($('.page_title'));
		$('.page_title').on('dblclick',function(){				
			$(this).parent('.page').toggle();
		})
	});


	/**
	* GET_DATA
	*
	*/
	this.get_data__DEPRECATED = function( url, data ) {

		var method = 'GET';
		if (data) {
			method = 'POST';
		};
		
		var str_data = JSON.stringify(data)
		//console.log(str_data);
		
		// Return a new promise.
		return new Promise(function(resolve, reject) {	
			// Do the usual XHR stuff
			var xhr = new XMLHttpRequest();				
				xhr.open(method, url);								
				xhr.setRequestHeader("Content-Type", "application/json");
				//xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
				xhr.onload = function(e) {
					// This is called even on 404 etc
					// so check the status
					if (xhr.status == 200) {
						// Resolve the promise with the response text
						resolve(xhr.response);
					}
					else {
						// Otherwise reject with the status text
						// which will hopefully be a meaningful error
						reject(Error(xhr.statusText));
					}
					//console.log(e);
				};
				// Handle network errors
				xhr.onerror = function() {
					reject(Error("Network Error"));
				};
				// Make the request
				xhr.send( str_data );
		});
	};//end get_data



	/**
	* GET_DATA
	*
	*/
	this.get_data = function( url, mydata ) {
		
		var jsPromise = Promise.resolve(
			
			// AJAX REQUEST
			$.ajax({
				url		: url ,
				data	: mydata ,
				type 	: "POST"
			})
			// DONE
			.done(function(received_data) {
				// DEBUG CONSOLE Console log
				//if (DEBUG) console.log("->Save response: "+received_data );
			})
			// FAIL ERROR 
			.fail(function(error_data) {
				console.log(error_data);
			})
			// ALWAYS
			.always(function() {
			})

		)//end promise

		return jsPromise;

	};//end get_data


	/**
	* RENDER_PDF
	* Ajax call to trigger that procees previously generated html files with pd renderer (wkhtml)
	*/
	this.render_pdf = function(render_pdf_data) {
		//console.log(render_pdf_data);

		var render_pdf_response 		= document.getElementById('render_pdf_response'),
			render_pdf_response_debug	= document.getElementById('render_pdf_response_debug')

		var url  	= DEDALO_LIB_BASE_URL + '/tools/tool_layout_print/trigger.tool_layout_print.php'	//this.trigger_url //+ "&mode=render_pdf";	//&render_pdf_data="+render_pdf_data,
		var	mydata  = {
						"mode" 				: "render_pdf",
						"render_pdf_data" 	: render_pdf_data						
					  }
					  //return console.log(url);

		this.get_data(url,mydata).then(function(response) {
			
			//console.log("Success!");
			//console.log( typeof response );
			//console.log( response );
			//console.log( JSON.parse(response) );	

			if (DEBUG) {
				console.log("->Save response: ");
				//console.log(response);
			}		
			
			var response_obj = JSON.parse(response)	

			
			$(render_pdf_response).fadeOut(350, function(){
				render_pdf_response.innerHTML  = response_obj.msg
				$(render_pdf_response).fadeIn(500)
			})
			
			// DEGUG ONLY
			// console.log(response_obj.debug);
			if (response_obj.debug) {
				render_pdf_response_debug.innerHTML  = '';

				

				for (var i = 0; i < response_obj.debug.length; i++) {

					var current_debug = response_obj.debug[i]

					if (i==0) {
						render_pdf_response_debug.innerHTML += "<strong>Debug renderer daemon info: </strong>";
						render_pdf_response_debug.innerHTML += "<br>version: "+current_debug['version'];
						render_pdf_response_debug.innerHTML += "<br>path: "+current_debug['path'];
						//render_pdf_response_debug.innerHTML += "<hr>";
					}
					
					render_pdf_response_debug.innerHTML += "<hr>";
					render_pdf_response_debug.innerHTML += "<strong>Debug info: </strong>";
					render_pdf_response_debug.innerHTML += "<br>exit_status: "+current_debug['exit_status'];					
					render_pdf_response_debug.innerHTML += "<br>output: <br>"+current_debug['output'];					

				}//end for				
			};

		}, function(error) {
			console.error("Failed!", error);
		});
		return;


		/*
		var jsPromise = Promise.resolve(
			
			// AJAX REQUEST
			$.ajax({
				url		: url ,
				data	: mydata ,
				type 	: "POST"
			})
			// DONE
			.done(function(received_data) {
				// DEBUG CONSOLE Console log
				if (DEBUG) console.log("->Save response: "+received_data );	

				//console.log(received_data);
				var response_obj = JSON.parse(received_data)	
					// Response msg		
					render_pdf_response.innerHTML  = response_obj.msg
					// Debug adds
					if (response_obj.debug) {
						render_pdf_response.innerHTML += "<hr>Debug info:";
						render_pdf_response.innerHTML += "<br>exit_status: "+response_obj.debug['exit_status'];
						render_pdf_response.innerHTML += "<br>output:<br>"+response_obj.debug['output'];
					}
			})
			// FAIL ERROR 
			.fail(function(error_data) {
				console.log(error_data);
			})
			// ALWAYS
			.always(function() {
			})

		)//end promise
		return jsPromise;
		*/

	};//end render_pdf



	
	/**
	* GOTO_EDIT
	* @param object button_obj
	*/
	this.goto_edit = function(button_obj) {

		var template_id 	= $(button_obj).parent('li').data('template_id'),
			template_tipo 	= $(button_obj).parent('li').data('template_tipo'),
			url_vars 		= get_current_url_vars();

		// Edit / update object
		url_vars.context_name 	= 'edit';
		url_vars.template_id 	= template_id;
		url_vars.template_tipo 	= template_tipo;
	
		var url='?'
		$.each( url_vars, function( key, value ) {
			url += key + "=" + value + '&';
		});
		//return console.log(url.slice(0,-1))

		return window.location.href = url.slice(0,-1);

	};//end goto_edit



	/**
	* DELETE_TEMPLATE
	* @param object button_obj
	*/
	this.delete_template = function(button_obj) {

		var section_layout_id 	= $(button_obj).parent('li').data('template_id'),
			section_layout_tipo = $(button_obj).parent('li').data('template_tipo'),
			wrap_div 			= $('#wrap_list')		

		// Confirm dialog
		if (!confirm( get_label.esta_seguro_de_borrar_este_registro )) {			
			return false;
		}

		// Spinner ON
		html_page.loading_content( wrap_div, 1 );

		var mydata = {
				'mode' 				  : 'delete_template',
				'section_layout_tipo' : section_layout_tipo,
				'section_layout_id'	  : section_layout_id,
			}
			//return console.log(mydata)

			// AJAX REQUEST
			$.ajax({
				url		: this.trigger_url,
				data	: mydata,
				type	: "POST",
			})
			// DONE
			.done(function(data_response) {

				// If data_response contain 'error' show alert error with (data_response) else reload the page
				if(/error/i.test(data_response)) {
					// Alert error
					alert("[trigger] Request failed: \n" + data_response +' ' );
				}else{
					// Simply reload page							
					location.reload();
				}			
			})
			// FAIL ERROR	 
			.fail(function(jqXHR, textStatus) {
				var msg = "[trigger] Request failed: " + textStatus ;
				wrap_div.html(" <span class='error'>Error on call trigger " + msg + "</span>");
				alert( msg );
			})
			// ALWAYS
			.always(function() {
				// Spinner OFF
				html_page.loading_content( wrap_div, 0 );
			})

	}//end delete_template


	/**
	* GET_PAGE_TEMPLATE
	* Get html content of all pages and clean code removing unnecessary elements
	* @return string html_content
	* @see save_template()
	*/
	this.get_page_template = function() {

		var ar_pages 	 = $('.page'),
			html_content = ''

			//console.log(ar_pages);

		$.each(ar_pages, function(index, page_value) {
			
			// Clone element to manipulate contents without affect original element
			var temp_page_obj = $(page_value).clone()
				//console.log(temp_page_obj)

			// Remove resizable elements and close buttons
			// NOT USED...
			//$(temp_page_obj).find(".ui-resizable-handle, .close, .page_close_button" ).remove()			
			//$(temp_page_obj[0]).find('.draggable').draggable("destroy").resizable("destroy");
			//console.log(temp_page_obj)

			// Remove drag / resize elements from DOM before continue
			html_content += clean_page_to_save(temp_page_obj).outerHTML;

			//return 	console.log(clean_page_obj)

			// Add page and contents html
			//html_content += $(temp_page_obj)[0].outerHTML

			//html_content += $(val)[0].outerHTML
		});
		
		return html_content;
	}//end get_page_template



	/**
	* SAVE_TEMPLATE
	* Get pages html code and save contents into component_layout using ajax call to trigger
	* @param object button_obj
	*/
	this.save_template = function(button_obj) {

		var html_content 			= 'page',
			component_layout_tipo	= button_obj.dataset.component_layout_tipo,
			section_layout_tipo		= button_obj.dataset.section_layout_tipo,
			section_layout_id		= $('#input_section_layout_id').val(),			
			section_target_tipo		= $('#input_section_target_tipo').val(),
			layout_label			= $('#input_layout_label').val(),
			wrap_div 				= $('.right')
			//return 	console.log(layout_label.length)	

			if (layout_label.length<1) {
				$('#input_layout_label').focus();
				return alert("Please, fill layout name")				
			}

		var mydata = {
				'mode' 					: 'save_template',
				'component_layout_tipo'	: component_layout_tipo,
				'section_layout_id'		: section_layout_id,
				'section_layout_tipo'	: section_layout_tipo,
				'type'					: 'pages',
				'html_content' 			: html_content,
				'dato'					: JSON.stringify(tool_layout_print.html_parser_json(html_content)),
				'section_target_tipo'	: section_target_tipo,
				'layout_label'  		: layout_label
			}			

			// Spinner ON
			html_page.loading_content( wrap_div, 1 );

		var jsPromise = Promise.resolve(			

			// AJAX REQUEST
			$.ajax({
				url		: this.trigger_url,
				data	: mydata,
				type	: "POST",
			})
			// DONE
			.done(function(data_response) {		  							

				// If data_response contain 'error' show alert error with (data_response) else reload the page
				if(/error/i.test(data_response)) {
					// Alert error
					alert("[trigger] Request failed: \n" + data_response +' ' );
				
				}else{

					var template_id = parseInt(data_response);

					if (isNaN(template_id)) { return alert(data_response) };

					// Update input value
					$('#input_section_layout_id').val(template_id)
					
					/**/
					// Update page url
					var url = window.location.href
					if (section_layout_id==template_id) {
						window.history.pushState("", "", url)
					}else{
						var new_url = change_url_variable(url, 'template_id', template_id)
						window.history.pushState("", "", new_url)
					}

					
					// Show msg in save response div		
					$('#save_response').html('ok').css('padding','5px');
					setTimeout(function(){
						$('#save_response').fadeOut(1000, function(){ $(this).html('')})
					}, 5000);				

					// Change mode
					tool_layout_print.set_mode('print');
				}			
			})
			// FAIL ERROR	 
			.fail(function(jqXHR, textStatus) {
				var msg = "[trigger] Request failed: " + textStatus ;
				wrap_div.html(" <span class='error'>Error on call trigger " + msg + "</span>");
				alert( msg );
			})
			// ALWAYS
			.always(function() {
				// Spinner OFF
				html_page.loading_content( wrap_div, 0 );
			})

		)//end promise


		return jsPromise;
		/*
		jsPromise.then(function(response) {
			console.log(jsPromise);
			console.log(response);

		}, function(xhrObj) {
			console.log(xhrObj);
		});
		*/

	}//end save_template


	/**
	* SET_MODE
	* @param string mode like 'edit' / 'print'
	* Change visual apperance of page in different modes
	*/
	this.set_mode = function(mode) {

		var filename_css_render = DEDALO_LIB_BASE_URL + '/tools/tool_layout_print/css/tool_layout_render.css'

		switch(mode) {

			case 'print':

				$('#info_stats').show();
				// Hide elements
				/*
				$('.wrap_add_page_fixed, .wrap_add_page_fluid, .wrap_select_option_pages_fixed, .wrap_select_option_pages_fluid').fadeOut(300); // Right side buttons
				//$('#left').children().fadeOut(300); // Left side components
				$('.template_name, .warp_icon_editable_text, .warp_icon_header_button, .warp_icon_footer_button').fadeOut(300); // Top buttons				
				$('.page_close_button, .close').hide()// page
				*/
				$('.wrap_save').fadeOut(100); // Hide save button
				$('.wrap_edit').fadeIn(100); // Show edit page button
				
				// Load css file render				
				var fileref=document.createElement("link")
					fileref.setAttribute("rel", "stylesheet")
					fileref.setAttribute("type", "text/css")
					fileref.setAttribute("href", filename_css_render + '?t='+new Date().getTime())
					document.getElementsByTagName("head")[0].appendChild(fileref)

				window.scrollTo(0,0);
				break;

			case 'edit':

				$('#info_stats').hide();

				// Unload css file render		
				var targetelement 	= "link",
					targetattr 	 	= "href",
					allsuspects 	= document.getElementsByTagName(targetelement)			    
					for (var i=allsuspects.length; i>=0; i--){ //search backwards within nodelist for matching elements to remove
					if (allsuspects[i] && allsuspects[i].getAttribute(targetattr)!=null && allsuspects[i].getAttribute(targetattr).indexOf(filename_css_render)!=-1)
						allsuspects[i].parentNode.removeChild(allsuspects[i]) //remove element by calling parentNode.removeChild()
					}

				$('.wrap_save').fadeIn(100); // Hide save button
				$('.wrap_edit').fadeOut(100); // Show edit page button


				break;
		}
		$("#wrap_edit .center").hide().css("opacity",1).fadeIn(300);
	}//end set_mode



	/**
	* INIT_EDITABLE_TEXT
	* Init inline text editor of request object id
	* @param string obj_id
	*/
	this.init_editable_text = function(obj_id) {

		setTimeout(function() {
			tinymce.init({
				selector: "#"+obj_id,
				//cache_suffix: "?v="+page_globals.dedalo_version,
				cache_suffix: "?"+page_globals.dedalo_version,
				inline: true,			    
				plugins: [
					"advlist autolink lists link image charmap print preview anchor",
					"searchreplace visualblocks code fullscreen",
					"insertdatetime media table contextmenu paste"
				],
				toolbar: "insertfile undo redo | styleselect | bold italic | alignleft aligncenter alignright alignjustify | bullist numlist outdent indent | link image"
			});
		}, 500)	

	}//end init_editable_text


	
	/*
	* PRINT_PDF
	* @param object button_obj
	*/
	this.print_pdf = function(button_obj){

		this.save_template(button_obj);


		function open_url() {
			/**/
			var url 		 = window.location.search.substring(1), // Current url vars like ?id=1&...
				//url 		 = remove_url_variable('offset', url), // Remove offset var
				
				keyString 	 = 'context_name', // Key to change
				replaceString= 'render',  // new value for replace old						
				url 		 = change_url_variable(url, keyString, replaceString)  // Change value in url 				
				//return console.log(window.location.pathname+'?'+url);
				window.open(window.location.pathname+'?'+url);
			
			/*
			var section_tipo = get_parameter_value(window.location, 'section_tipo'),
				template_id  = get_parameter_value(window.location, 'template_id'),
				template_tipo  = get_parameter_value(window.location, 'template_tipo')

			var url = '../tools/tool_layout_print/trigger.tool_layout_print.php?mode=print_pages&section_tipo='+section_tipo+'&template_id='+template_id+'&template_tipo='+template_tipo
			window.open(url);
			*/			
			
		}//end open_url	
		return open_url()


		//return;

		var section_target_tipo		= page_globals.top_tipo,
			section_layout_id		= button_obj.dataset.section_layout_id,
			component_layout_tipo	= button_obj.dataset.component_layout_tipo,
			section_layout_tipo 	= button_obj.dataset.section_layout_tipo

			//return 	console.log(button_obj.dataset);

		var html_content 	= this.get_page_template();
		wrap_div = $('.right')
		var mydata = {
				'mode' 					: 'print_pages',
				'section_target_tipo'	: section_target_tipo,
				'section_layout_id'		: section_layout_id,
				'component_layout_tipo'	: component_layout_tipo,
				'section_layout_tipo' 	: section_layout_tipo
			}
			//return console.log(mydata)

			// AJAX REQUEST
			$.ajax({
				url		: this.trigger_url,
				data	: mydata,
				type	: "POST",
			})
			// DONE
			.done(function(data_response) {
				//console.log(data_response);
				
				// Search 'error' string in response
				var error_response = /error/i.test(data_response);								

				// If data_response contain 'error' show alert error with (data_response) else reload the page
				if(error_response) {
					// Alert error
					// console.log(data_response)
					alert("[trigger] Request failed: \n" + data_response +' ' );
				}else{
					console.log("HECHOOOOO");

					// Change mode
					tool_layout_print.set_mode('print');
				}			
			})
			// FAIL ERROR	 
			.fail(function(jqXHR, textStatus) {
				var msg = "[trigger] Request failed: " + textStatus ;
				wrap_div.html(" <span class='error'>Error on call trigger " + msg + "</span>");
				alert( msg );
			})
			// ALWAYS
			.always(function() {
				// Spinner OFF
				html_page.loading_content( wrap_div, 0 );
			})

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
								style : tool_layout_print.get_style_obj(html_pages[i].getAttribute('style'))									
							  },
				components 	: tool_layout_print.get_ar_components(nodes_children),
				free_text 	: tool_layout_print.get_ar_freeText(nodes_children),
				header 		: tool_layout_print.get_ar_fixed(nodes_children, 'header'),
				footer 		: tool_layout_print.get_ar_fixed(nodes_children, 'footer')					
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
										style : tool_layout_print.get_style_obj(ar_div_components[i].getAttribute('style'))
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
											style : tool_layout_print.get_style_obj(ar_div_freeText[i].getAttribute('style'))
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
												style : tool_layout_print.get_style_obj(ar_div_fixed[i].getAttribute('style'))
											  }
					ar_fixed['components'] 	= tool_layout_print.get_ar_components(ar_div_fixed[i].childNodes)
					ar_fixed['free_text'] 	= tool_layout_print.get_ar_freeText(ar_div_fixed[i].childNodes)
				}//end if(ar_div_fixed[i].id == fixed_element){
			}//end if(ar_div_fixed[i].dataset.tipo == "fixed_element"){

		}//end for (var i = 0; i<ar_div_fixed.length; i++) {

		return ar_fixed

	}//end get_ar_fixed




};//end class	