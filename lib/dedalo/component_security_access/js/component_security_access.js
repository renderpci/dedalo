// JavaScript Document
$(document).ready(function() {
	
	switch(page_globals.modo) {
		
		case 'edit' :	// EDIT MODE	
						$(".css_wrap_security_access").on("change", "input", function(event){
							
							component_security_access.Save(this);
							/*
							$('ul').css('background-color','');
				
							component_common.Save(this,true);								
							

							
							// UPDATE CHILDREN CHECKBOXES								
							// Obtenemos el nuevo valor asignado
							var valor = $(this).val(); 											//if (DEBUG) console.log(valor);

							// Seleccionamos el 'padre_ul'
							var padre_ul = $(this).parents('li').first().children('ul');		//if (DEBUG) console.log(padre_ul);

							// Selecionamos todos los checkbox hijos de 'padre_ul'
							var checkbox_hijos = $(padre_ul).find(':input');					//if (DEBUG) console.log(checkbox_hijos);

							// Los recorremos
							$(checkbox_hijos).map(function () {
			                  
				                  // Si tienen el mismo valor que el padre los checkeamos para que 
				                  // sean coherentes con nuevo permiso del padre
				                  if ( $(this).val()==valor) {
				                  	$(this).prop('checked',true);
				                  	// Salvamos el nuevo valor de este checkbox
				                  	Save($(this),true);
				                  };
			                });
			                
							// Resalta el grupo de checkboxes modificados para que quede claro que se han modificado
							$(padre_ul).find('a').animate({
					          backgroundColor: "#acc6b8"
					        }, 100 ).delay(600).animate({
					          backgroundColor: "#efefef"
					        }, 1000 );								
							

					        //$(this).blur():
					        */
					});
					break;	
						
	}
	
});


var component_security_access = new function() {

	this.save_arguments = {	"update_security_access" 	: false,
	                      	"update_filter_master"		: false,
							} // End save_arguments

	/**
	* SAVE
	*/
	this.Save = function(component_obj) {		

		// Exec general save
		component_common.Save(component_obj, this.save_arguments);								
		
		$('ul').css('background-color','');

		
		// UPDATE CHILDREN CHECKBOXES		
		// Obtenemos el nuevo valor asignado
		var valor = $(component_obj).val(); 										//if (DEBUG) console.log(valor);

		// Seleccionamos el 'padre_ul'
		var padre_ul = $(component_obj).parents('li').first().children('ul');		//if (DEBUG) console.log(padre_ul);

		// Selecionamos todos los checkbox hijos de 'padre_ul'
		var checkbox_hijos = $(padre_ul).find(':input');					//if (DEBUG) console.log(checkbox_hijos);

		// Los recorremos
		$(checkbox_hijos).map(function () {
          
              // Si tienen el mismo valor que el padre los checkeamos para que 
              // sean coherentes con nuevo permiso del padre
              if ( $(this).val()==valor) {
              	$(this).prop('checked',true);
              	// Salvamos el nuevo valor de este checkbox [Use global Save to avoid infinite loop recursion]
              	// Exec general save
				component_common.Save(this, this.save_arguments);
              };
        });
        
		// Resalta el grupo de checkboxes modificados para que quede claro que se han modificado
		$(padre_ul).find('a').animate({
          backgroundColor: "#acc6b8"
        }, 100 ).delay(600).animate({
          backgroundColor: "#efefef"
        }, 1000 );								
		

	}//end save



}//end component_security_access










