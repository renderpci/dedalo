





var component_security_access = new function() {

	this.security_access_objects = []
	this.save_arguments 		 = {}

		
	switch(page_globals.modo) {			
		case 'edit' :
			/*
			$(document).ready(function() {
				component_security_access.security_access_objects = $(".css_wrap_security_access")
			});	
			*/			
			break;							
	}
	
	

	/**
	* SAVE
	*/
	this.Save = function(component_obj) {
									
		
		$('.css_wrap_security_access ul').css('background-color','');

		// Hiden input element
		var componente = component_obj;	//document.getElementById('component_security_access');
			
		
		//
		// UPDATE CHILDREN CHECKBOXES	
		//
			// Obtenemos el nuevo valor asignado
			var value = parseInt(component_obj.value);									//if (DEBUG) console.log(value);


			// Seleccionamos el 'padre_ul'
			var padre_ul = $(component_obj).parents('li').first().children('ul');		//if (DEBUG) console.log(padre_ul);
			

			// Selecionamos todos los checkbox hijos de 'padre_ul'
			var checkbox_hijos = padre_ul.find(':input');								//if (DEBUG) console.log(checkbox_hijos);

			// Los recorremos
			$(checkbox_hijos).map(function () {
	          
				// Si tienen el mismo value que el padre los checkeamos para que 
				// sean coherentes con nuevo permiso del padre
				if ( $(this).val()==value) {
					$(this).prop('checked',true);              	
				}
	        });


		// Cuando termine el loop de 'checkbox_hijos'
        $.when.apply($,checkbox_hijos).done(function() {				

				var dato_final= {};
				// Seleccionamos todos los radio buttons dentro del wrapper del componente
				//var hijos = component_security_access.security_access_objects.find(':input');
				var hijos = $('.css_wrap_component_security_areas').find(':input:radio');				
					//console.log(hijos); return;

				// Recorremos todos los radio buttons y guardamos los que están chekeados
				$(hijos).map(function () {

					if($(this).prop('checked')==true) {
						
						var dato_section_tipo 	= this.dataset.dato_section_tipo,
							tipo 		 		= this.dataset.dato_tipo,
							value 		 		= this.value							

						dato_final[dato_section_tipo] = dato_final[dato_section_tipo] || {}
						//if (typeof dato_final[dato_section_tipo]=='undefined') {
						//	dato_final[dato_section_tipo] = {};
						//}
						dato_final[dato_section_tipo][tipo] = parseInt( value );
					};		             
		        });
		        //console.log(dato_final); return;
		        
		        // Dato final : Cuando se ha completado el loop anterior y tenemos el array resultante, salvamos
				$.when.apply($,hijos).done(function(){

					// Component wrapper : Actualizamos el dato del wrapper
					/* DESACTIVO
					var element_wrapper = document.getElementsByClassName("css_wrap_security_access")[0];
					if (!element_wrapper) {
						return alert("Error: css_wrap_security_access element not found in DOM")
					};
					var dato_final_json = JSON.stringify(dato_final);					 
					//element_wrapper.setAttribute("data-dato", dato_final_json);
					element_wrapper.dataset.dato = dato_final_json
					*/
					
					//console.log(dato_final); return 	

					// SAVE
					// El 'componente' será un input hidden con los datos necesarios de tipo, parent, lag ...
					// y será el que pasemos a la función de salvado, junto con el array de todos los radio buttons seleccionados	
					// Exec general save													
					component_common.Save(componente, {'dato':dato_final});

				});
        });

        // Resalta el grupo de checkboxes modificados para que quede claro que se han modificado
		$(padre_ul).find('a')
			.animate({ backgroundColor: "#acc6b8" }, 100 )
			.delay(600)
			.animate({ backgroundColor: "#efefef" }, 1000 );

	}//end save



	this.get_dato = function(component_obj) {

	}//end get_dato
	



}//end component_security_access


