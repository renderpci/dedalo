/**
* COMPONENT_SECURITY_AREAS
*
*
*
*/
var component_security_areas = new function() {

	this.security_areas_objs 		= []
	this.security_areas_admin_objs 	= []
	this.global_admin_element 		= []
	this.input_checkbox 			= []
	this.input_checkbox_admin 		= []
	this.save_arguments 			= {}

	this.url_trigger = DEDALO_LIB_BASE_URL + '/component_security_areas/trigger.component_security_areas.php'
	

	switch(page_globals.modo) {
		
		case 'edit' :
			$(function() {
				// Fix general selectors
				component_security_areas.security_areas_objs 		= $('.css_component_security_areas')
				component_security_areas.security_areas_admin_objs 	= $('.component_security_areas_admin')
				component_security_areas.input_checkbox				= component_security_areas.security_areas_objs.filter('input[type="checkbox"]')
				component_security_areas.input_checkbox_admin		= component_security_areas.security_areas_admin_objs.filter('input[type="checkbox"]')				
			});
			break;
	}//switch modo



	/**
	* UPDATE_CHECKS_STATE
	* Exec before save
	*/
	this.update_checks_state = function(component_obj, callback) {
	
		var checked   = component_obj.checked
		//var	container = $(component_obj).parent() //component_obj.parentNode  //
		//var	siblings  = $(container).siblings()
		var container = component_obj.parentNode
		var	siblings  = container.parentNode.childNodes

			//console.log(siblings);
			//console.log(container.parentNode.childNodes);

		// WHEN USER CHECK
		if( checked === true ) {

			// Mostramos el check de administración para este area
			$(component_obj).prev().filter('span').css('display','inline-block');

			// Reseteamos sus hijos si los hubiere y los mostramos
			$(component_obj).nextAll('ul').find('input[type="checkbox"]').prop("checked", false);
			//$(component_obj).nextAll('ul').find('span').css('display','inline-block')

		// WHEN USER UNCHECK
		}else{
			
			// Des-chequeamos el check del admin de este area y lo ocultamos
			$(component_obj).prev().filter('span').children('input[type="checkbox"]').prop("checked", false);
			//$(component_obj).prev().filter('span').css('display','none')

			// Ocultamos además los posibles admin de los hijos del area actual
			$(component_obj).nextAll('ul').find('span').children('input[type="checkbox"]').prop("checked", false);
			//$(component_obj).nextAll('ul').find('span').css('display','none')
		}

		// INDETERMINATE . Fijamos como indeterminate el camino hacia arriba cuando no están chekeados los padres
		$(container).find('.css_component_security_areas:input[type="checkbox"]')
			.prop({
				indeterminate: false,
				checked: checked
			});
		
		// Update parents path state
		var update_parents = component_security_areas.checkSiblings( container, checked);

		// update_checks_security_areas_admin . NO LONGER USED
		//component_security_areas.update_checks_security_areas_admin();

		// On finish, save normally
		callback()
	}//end update_checks_state



	/**
	* SAVE
	*/
	this.trigger_update_access = false;
	this.Save = function(component_obj, event) {

		// Stop propagation to avoid focus element and scroll to top...
		if(typeof event==='object') {
			event.stopPropagation();
		}		
		 

		// WRAP_SECURITY_ACCESS
		// On finish save will be necessary reload component_security_access
		//var wrapper_id = document.querySelectorAll('[data-component_name="component_security_access"]')[0].id			

		// UPDATE_CHECKS_STATE
		component_security_areas.update_checks_state(component_obj, function(){				
			
			// DATO . Add inputs data to save
			component_security_areas.save_arguments.dato = JSON.stringify(component_security_areas.get_dato(component_obj))
				//console.log("component_security_areas.save_arguments",component_security_areas.save_arguments);  return;

			// SAVE . Exec general save		
			var jsPromise = component_common.Save(component_obj, component_security_areas.save_arguments).then(function(response) {					
					/*
					// Update security access			
					// Reload component (update showed data)					
					if (component_security_areas.trigger_update_access===false) {
						// Block overlap updates
						component_security_areas.trigger_update_access=true;
						var handler = function() {
							// Remove listener (only we need one)
							window.removeEventListener('scroll',handler,false);
							// Update acces component and on finish, set trigger_update_access to false to allow another updates
							component_common.load_component_by_wrapper_id(wrapper_id, null, function(){
																								component_security_areas.trigger_update_access=false;																								
																							});											
						};
						// Add handler on document scroll to trigger update access
						window.addEventListener('scroll',handler,false)						
					}*/
				}, function(xhrObj) {
				  	console.log("xhrObj",xhrObj);
				})
			})				
	};//end Save
	


	/**
	* CHECKSIBLINGS
	*/
	this.checkSiblings = function(el, checked) {

		var parent  = $(el).parent().parent()
		//var parent  = el.parentNode.parentNode
		var	all 	= true

		/*
		var	siblings  = parent.childNodes
		var s_len 	  = siblings.length
		for (var i = 0; i < s_len; i++) {
			var element = siblings[i]

			var checkboxes = element.querySelectorAll('.css_component_security_areas input[type="checkbox"]')
			var checkboxes_length = checkboxes.length
			for (var i = checkboxes_length - 1; i >= 0; i--) {
				checkboxes[i].checked = true
			}
		}
		*/
		$(el).siblings().each(function() {
			return all = ($(this).children('.css_component_security_areas:input[type="checkbox"]').prop("checked") === checked);
		});
		

		if(all && checked) {
			/*
			var checkboxes = parent.querySelectorAll('.css_component_security_areas input[type="checkbox"]')
			var checkboxes_length = checkboxes.length
			for (var i = checkboxes_length - 1; i >= 0; i--) {
				checkboxes[i].indeterminate = false
				checkboxes[i].checked 		= checked
			}
			*/
			
			parent.children('.css_component_security_areas:input[type="checkbox"]').prop({
				indeterminate: false,
				checked: checked
			});
			
			component_security_areas.checkSiblings(parent,checked);

		
		}else if (all && !checked) {

			parent.children('.css_component_security_areas:input[type="checkbox"]').prop("checked", checked);
			parent.children('.css_component_security_areas:input[type="checkbox"]').prop("indeterminate", (parent.find('.css_component_security_areas:input[type="checkbox"]:checked').length > 0));
			component_security_areas.checkSiblings(parent, checked);
		
		}else{
			$(el).parents("li").children('.css_component_security_areas:input[type="checkbox"]').prop({
				indeterminate: true,
				checked: false
			});
		}	
	};//end checkSiblings



	/**
	* GET_DATO
	*/
	this.get_dato = function (input_obj) {
	
		var name		 = input_obj.name;
		var obj_checkbox = {};

		var elements_checked = $('[name="'+name+'"]:checked, [name="'+name+'"]:indeterminate')
			//console.log(elements_checked);

		// Iterate checked adn indeterminate input elements and store value in object
		$(elements_checked).map(function() {

			var tipo = $(this).val()
			if( tipo ) {

				// INDETERMINATE : Añadimos ':1' que será 'solo lectura' en admin_access
				if($(this).prop('indeterminate')===true) {
					//return String( $(this).val() +':1' );
					var estado = 2;

				// CHECKED : Añadimos ':2' que será 'lectura-escritura' en admin_access
				}else if($(this).prop('checked')===true) {
					//return String( $(this).val() +':2' );
					var estado = 2;

				// UNCHECKED
				}else{
					//var estado = 0;
				}
				obj_checkbox[tipo] 	= parseInt(estado);
			}
		}).get();


		$.when.apply($,elements_checked).done(function(){
			// Convert -admin elements to '3' value
			for (var tipo in obj_checkbox) {

				if ( tipo.indexOf('-admin') > -1 ) {
					//console.log("changed "+tipo);
					var tipo_clean = tipo.replace("-admin", "", "gi");
					if (obj_checkbox[tipo]>0) {
						obj_checkbox[tipo_clean] = 3; // Admin
						delete obj_checkbox[tipo]
					}
				}
			}
		});			
					
		return obj_checkbox;
	};//end get_dato



	/**
	* LOAD_ACCESS_ELEMENTS
	* Load selected security access elements (elements permisions) inside security areas container (areas permisions)
	*/
	this.load_access_elements = function( button_obj, event ) {

		var wrapper_obj = document.getElementById(button_obj.dataset.wrap_div_id)
		var	tipo 	 	= button_obj.dataset.tipo
		var	parent 	 	= button_obj.dataset.parent
		

		var area_access_obj = get_localStorage('area_access_obj') || '{}';
			area_access_obj = JSON.parse(area_access_obj);

		if (wrapper_obj.classList.contains('access_elements_show')) {
			wrapper_obj.classList.remove('access_elements_show');

			delete area_access_obj[tipo];
				set_localStorage('area_access_obj', JSON.stringify(area_access_obj) )
			return;
		}		

		var trigger_vars = {
				mode	: 'load_access_elements',
				tipo	: tipo,
				parent	: parent
		}
		//return console.log("[component_security_areas.load_access_elements] trigger_vars",trigger_vars)

		html_page.loading_content( wrapper_obj, 1 );

		// PROMISE JSON XMLHttpRequest
		var js_promise = common.get_json_data(this.url_trigger, trigger_vars).then(function(response){
			if (SHOW_DEBUG===true) {
				console.log("[component_security_areas.load_access_elements] response", response)
			}

			if (response && response.result) {

				// Include li list resuls in a ul element
				var ul = document.createElement("ul")
					ul.innerHTML = response.result

				// Clean wrapper_obj html
				while (wrapper_obj.firstChild) {
				    wrapper_obj.removeChild(wrapper_obj.firstChild);
				}
				
				wrapper_obj.classList.add('access_elements_show')
				wrapper_obj.appendChild(ul)

				area_access_obj[tipo] = 1;
					set_localStorage('area_access_obj', JSON.stringify(area_access_obj) )				
			}else{
				alert("[component_security_areas.load_access_elements] Error. invalid response", response);
			}		
			
			html_page.loading_content( wrapper_obj, 0 );
		}, function(error) {
			// log
			console.log("[component_security_areas.load_access_elements] Error.", error);
			inspector.show_log_msg( "<span class='error'>Error on " + getFunctionName() + " (Ajax error)<br>Data is NOT saved!</span>" + error );
			
			html_page.loading_content( wrapper_obj, 0 );
		})

		return js_promise		
	};//end load_access_elements



	/**
	* TOGGLE_AREA_CHILDRENS
	*/
	this.toggle_area_childrens = function(button_obj, event) {

		var li    = button_obj.parentNode,
			ar_ul = li.getElementsByTagName('ul')

		if (ar_ul[0]) {

			var ul 	 = ar_ul[0],
				tipo = ul.dataset.tipo		

			var area_childrens_obj = get_localStorage('area_childrens_obj') || '{}';
				area_childrens_obj = JSON.parse(area_childrens_obj);

			if (ul.style.display!='block') {
				ul.style.display='block'
				button_obj.classList.add('area_childrens_opened');
				
				area_childrens_obj[tipo] = 1;
				set_localStorage('area_childrens_obj', JSON.stringify(area_childrens_obj) )

			}else{
				ul.style.display='none'
				button_obj.classList.remove('area_childrens_opened');

				delete area_childrens_obj[tipo];
				set_localStorage('area_childrens_obj', JSON.stringify(area_childrens_obj) )
			}
		}
	};//end toggle_area_childrens



	/**
	* UPDATE_AREA_CHILDRENS_OBJ_OPENED
	*/
	this.update_area_childrens_obj_opened = function() {
		
		var area_childrens_obj = get_localStorage('area_childrens_obj') || '{}';
			area_childrens_obj = JSON.parse(area_childrens_obj);
		for(var tipo in area_childrens_obj)	{
			var ar_ul = document.querySelectorAll('[data-button_tipo="'+tipo+'"]')
			if (ar_ul[0]) {
				ar_ul[0].click()
			}
		}
	};//end update_area_childrens_obj_opened



	/**
	* UPDATE_AREA_ACCESS_OBJ_OPENED
	*/
	this.update_area_access_obj_opened = function() {

		var area_access_obj = get_localStorage('area_access_obj') || '{}';
			area_access_obj = JSON.parse(area_access_obj);
		for(var tipo in area_access_obj)	{
			var ar_span = document.querySelectorAll('[data-button_tipo="'+tipo+'"]')
			if (ar_span[0]) {
				ar_span[0].click()
			}
		}		
	};//end update_area_access_obj_opened




	/**
	* Test all checkboxes 'css_component_security_areas' 
	* By default hide 'global_admin_element' elements
	* If any 'component_security_areas_admin' if checked, show elements 'global_admin_element'
	*/ /*  NO LONGER USED
	this.update_checks_security_areas_admin = function() {

			// Default hide <li> elements with class 'global_admin_element'
			component_security_areas.global_admin_element.hide();

			return 	console.log(component_security_areas.global_admin_element);

			// Default value for uncheck_global_admin_areas
			var uncheck_global_admin_areas = true;

			// Iterate all 'component_security_areas_admin' checkboxes
			component_security_areas.security_areas_admin_objs.filter('input[type="checkbox"]').each(function() {
																					
				// If one is checked, stop and set uncheck_global_admin_areas as 'false' and show <li> elements with class 'global_admin_element'
				if($(this).prop("checked")) {
					component_security_areas.global_admin_element.show();
					uncheck_global_admin_areas = false;
					return false;
				}
			});

			// If var 'uncheck_global_admin_areas' is true (no checked 'component_security_areas_admin' elements are found)
			// iterate 'global_admin_element' elements unchecking all
			if (uncheck_global_admin_areas === true) {

				//if (DEBUG) console.log("unchecking global_admin_areas");
				component_security_areas.global_admin_element.children('input[type="checkbox"]').each(function() {
					if($(this).prop("checked")) {
						$(this).prop("checked",false);
					}else if( $(this).prop('indeterminate') == true && checkbox!=-1 ) {
						checkbox.indeterminate=false;
					}
				});

			}//end if (uncheck_global_admin_areas === true)
		
	};//end update_checks_security_areas_admin
	*/




};//end component_security_areas