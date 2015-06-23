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

	this.save_arguments = {	"update_security_access" 	: false
							} // End save_arguments

	/**
	* SAVE
	*/
	this.Save = function(component_obj) {		

		// Exec general save							
		
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
				//component_common.Save(this, component_security_access.save_arguments);
              };
        });

		// Cuando termine el loop de 'checkbox_hijos'
        $.when.apply($,checkbox_hijos).done(function() {				

				var dato_final= {};
				// Seleccionamos todos los radio buttons dentro del war del componente
				var hijos = $(".css_wrap_security_access").find(':input');

				// Recorremos todos los radio buttons y guardamos los que están chekeados
				$(hijos).map(function () {

					if($(this).prop('checked')==true) {
						dato_final[$(this).data("tipo")] = $(this).val();
					};		             
		        });
		        // Dato final : Cuando se ha completado el loop anterior y tenemos el array resultante, salvamos
				$.when.apply($,hijos).done(function(){

					// Component wrapper : Actualizamos el dato del wrapper
					var elemento_wrapper = document.getElementsByClassName("css_wrap_security_access")[0];
					var dato_final_json;
					dato_final_json = JSON.stringify(dato_final);					 
					elemento_wrapper.setAttribute("data-dato", dato_final_json);

					// SAVE
					// El 'componente' será un input hidden con los datos necesarios de tipo, parent, lag ...
					// y será el que pasemos a la función de salvado, junto con el array de todos los radio buttons seleccionados
					var componente = document.getElementById('component_security_access');										
					component_common.Save(componente, {'dato':dato_final});

				});
        });

        // Resalta el grupo de checkboxes modificados para que quede claro que se han modificado
		$(padre_ul).find('a').animate({
          backgroundColor: "#acc6b8"
        }, 100 ).delay(600).animate({
          backgroundColor: "#efefef"
        }, 1000 );		

	}//end save



}//end component_security_access










