




// COMPONENT_SECURITY_AREAS CLASS
var component_security_areas = new function() {

	this.security_areas_objs 		= []
	this.security_areas_admin_objs 	= []
	this.global_admin_element 		= []
	this.input_checkbox 			= []
	this.input_checkbox_admin 		= []
	this.save_arguments = { 
							"update_security_access"  : true,
						  } // End save_arguments


	$(document).ready(function() {

		switch(page_globals.modo) {
			
			case 'edit' :

					//var filter_master_iframe = document.getElementById('filter_master_iframe');
					component_security_areas.security_areas_objs 		= $('.css_component_security_areas')
					component_security_areas.security_areas_admin_objs 	= $('.component_security_areas_admin')
					component_security_areas.global_admin_element		= $('.global_admin_element')
					component_security_areas.input_checkbox				= component_security_areas.security_areas_objs.filter('input[type="checkbox"]')
					component_security_areas.input_checkbox_admin		= component_security_areas.security_areas_admin_objs.filter('input[type="checkbox"]')


					// AREA BUTTON
					$(component_security_areas.input_checkbox).each(function() {
									
							$(this).bind("change", function(event) {
										
									// CHEQUEAMOS
									if( $(this).prop("checked") == true ) {

										// MOSTRAMOS EL CHECK DE ADMINISTRACIÓN PARA ESTE AREA
										$(this).prev().filter('span').css('display','inline-block');

										// Reseteamos sus hijos si los hubiere y los mostramos
										$(this).nextAll('ul').find('input[type="checkbox"]').prop("checked", false);
										$(this).nextAll('ul').find('span').css('display','inline-block')

									// DES-CHEQUEAMOS
									}else{
										
										// Des-chequeamos el check del admin de este area y lo ocultamos
										$(this).prev().filter('span').children('input[type="checkbox"]').prop("checked", false);
										$(this).prev().filter('span').css('display','none')

										// Ocultamos además los posibles admin de los hijos del area actual
										$(this).nextAll('ul').find('span').children('input[type="checkbox"]').prop("checked", false);
										$(this).nextAll('ul').find('span').css('display','none')
									}															
							});
					});

					
					// ADMIN AREA BUTTON
					//component_security_areas.security_areas_admin_objs.filter('input[type="checkbox"]').each(function() {
					$(component_security_areas.input_checkbox_admin).each(function() {													
							$(this).bind("change", function(event) {							
								component_security_areas.update_checks_security_areas_admin(); 
								//component_security_areas.Save(this);
								//if(DEBUG) console.log("saving component_security_areas_admin ")
							});
					});					
					component_security_areas.update_checks_security_areas_admin();


					// ON CHANGE SAVE					
					$(component_security_areas.input_checkbox).change(function(e) {

						var checked   = $(this).prop("checked"),
							container = $(this).parent(),
							siblings  = container.siblings();

							container.find('.css_component_security_areas:input[type="checkbox"]')
								.prop({
									indeterminate: false,
									checked: checked
								});
						
						component_security_areas.checkSiblings(container, checked);		    
						component_security_areas.Save(this);

					});//end on change
				
					break;
		}//switch modo

	});
	

	/**
	* SAVE
	*/
	this.Save = function(component_obj) {		

		// Exec general save		
		component_common.Save(component_obj, this.save_arguments);		

		// Udate checks_security_areas_admin after save
		component_security_areas.update_checks_security_areas_admin();	
	};


	/**
	* Test all checkboxes 'css_component_security_areas' 
	* By default hide 'global_admin_element' elements
	* If any 'component_security_areas_admin' if checked, show elements 'global_admin_element'
	*/ 
	this.update_checks_security_areas_admin = function() {

			// Default hide <li> elements with class 'global_admin_element'
			component_security_areas.global_admin_element.hide();

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



	this.checkSiblings = function(el, checked) {

		var parent  = el.parent().parent(),
			all 	= true;

		el.siblings().each(function() {
				return all = ($(this).children('.css_component_security_areas:input[type="checkbox"]').prop("checked") === checked);
		});

		if (all && checked) {
				parent.children('.css_component_security_areas:input[type="checkbox"]').prop({
						indeterminate: false,
						checked: checked
				});
				component_security_areas.checkSiblings(parent,checked);
		} else if (all && !checked) {
				parent.children('.css_component_security_areas:input[type="checkbox"]').prop("checked", checked);
				parent.children('.css_component_security_areas:input[type="checkbox"]').prop("indeterminate", (parent.find('.css_component_security_areas:input[type="checkbox"]:checked').length > 0));
				component_security_areas.checkSiblings(parent, checked);
		} else {
				el.parents("li").children('.css_component_security_areas:input[type="checkbox"]').prop({
						indeterminate: true,
						checked: false
				});
		}
	};//end checkSiblings



};//end component_security_areas






