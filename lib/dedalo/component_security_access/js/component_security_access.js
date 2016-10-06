





var component_security_access = new function() {

	this.security_access_objects = []
	this.save_arguments 		 = {}
	this.url_trigger 			 = DEDALO_LIB_BASE_URL + '/component_security_access/trigger.component_security_access.php';


	/**
	* PROPAGATE_CHANGES_TO_CHILDRENS
	* @return 
	*/
	this.propagate_changes_to_childrens = function(checkbox_hijos, value) {
		for (var i = checkbox_hijos.length - 1; i >= 0; i--) {
			var current = checkbox_hijos[i]
			if (current.value == value ) {
				current.checked = true
			}
		}
		return checkbox_hijos;
	};//end propagate_changes_to_childrens



	/**
	* SAVE
	*/
	this.Save = function(component_obj) {
		
		//$('.css_wrap_security_access ul').css('background-color','');

		// div_section . DIV that contains whole current section radio buttons
		var div_section = find_ancestor(component_obj, 'access_elements');	//$(component_obj).parents('.access_elements').first()[0]
			if (!div_section) {
				return alert("Error on find div_section (.access_elements)")
			}
			//return console.log(div_section);				
		

		// PROPAGATE VALUE TO CHILDREN CHECKBOXESIF EXISTS
		// Obtenemos el nuevo valor asignado
		var value = parseInt(component_obj.value);									//if (DEBUG) console.log(value);			

		// Selecionamos todos los checkbox hijos
		var li = component_obj.parentNode.parentNode;
		var ul = li.querySelector('ul.menu')
		var checkbox_hijos = ul.querySelectorAll('input')
			//console.log(checkbox_hijos); 	console.log(component_obj);
			//checkbox_hijos.unshift(component_obj) // Add self to array

		var propagation = component_security_access.propagate_changes_to_childrens(checkbox_hijos, value)	
		/*
			// Los recorremos
			$(checkbox_hijos).map(function () {	          
				// Si tienen el mismo value que el padre los checkeamos para que 
				// sean coherentes con nuevo permiso del padre
				if ( $(this).val()==value) {
					$(this).prop('checked',true);              	
				}
	        });
	        */

		// Cuando termine el loop de 'checkbox_hijos'
        $.when.apply($,propagation).done(function() {			

			// Seleccionamos todos los radio buttons de esta sección
			var elements = div_section.querySelectorAll('input')

			// Recorremos todos los radio buttons de la sección y guardamos los que están chekeados
			var dato_final= {};
			$(elements).map(function () {

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
			$.when.apply($,elements).done(function(){
				// SAVE	
				// console.log(dato_final); //return
				component_security_access.custom_save(component_obj, {'dato':dato_final});
			});
        });

        /*
        // Resalta el grupo de checkboxes modificados para que quede claro que se han modificado
		$(padre_ul).find('a')
			.animate({ backgroundColor: "#acc6b8" }, 100 )
			.delay(600)
			.animate({ backgroundColor: "#efefef" }, 1000 );
		*/
	}//end save



	this.get_dato = function(component_obj) {
	}//end get_dato



	/**
	* SAVE
	* @param obj component_obj 
	*	DOM obj
	* @param object save_arguments
	*	Optional
	* @param object event
	*	Optional
	*/
	this.custom_save = function (component_obj, save_arguments, event) {
	
		/* NATIVE JS */
		// From component
		var name			= component_obj.getAttribute('name'),
			id				= component_obj.id,
			flag			= component_obj.dataset.flag,
			caller_tipo		= component_obj.dataset.caller_tipo		

		// From component wrapper
		var wrap_div = find_ancestor(component_obj, 'wrap_component')
			if (wrap_div === null ) {
				return alert("load_rows: Sorry: wrap_div dom element not found")
			}

		var	tipo			= component_obj.dataset.tipo
		var	parent			= component_obj.dataset.parent
		var	lang			= component_obj.dataset.lang
		var	modo			= component_obj.dataset.modo || 'edit'
		var	section_tipo 	= component_obj.dataset.section_tipo
		var label 			= 'security access'
		var debug_div 		= document.getElementById('inspector_debug')	
		var dato 			= save_arguments.dato		

		var mydata = {	'mode'			: 'Save',
						'parent'		: parent,
						'dato'			: JSON.stringify(dato), // Stringify dato					
						'tipo'			: tipo,
						'section_tipo'  : section_tipo,
						'modo'			: modo,
						'lang'			: lang,
						'top_tipo'		: page_globals.top_tipo						
					};
					//return console.log(mydata)

		html_page.loading_content( wrap_div, 1 );

		var jsPromise = Promise.resolve(

			// AJAX REQUEST
			$.ajax({
				url		: component_security_access.url_trigger,
				data	: mydata,
				type 	: "POST",
				async 	: component_common.save_async,
			})
			.always(function() {
				html_page.loading_content( wrap_div, 0 );
			})
			.done(function(received_data) {

				// DEBUG
					if (DEBUG) console.log("->Save response: "+received_data + " for tipo: " + tipo );

				// INSPECTOR LOG INFO
					if (received_data.indexOf("Error")!=-1 || received_data.indexOf("error")!=-1 || received_data.indexOf("Failed")!=-1) {
						var msg = "<span class='error'>Failed Save!<br>" +received_data+ " for " + label + "</span>";
					}else{
						var msg = "<span class='ok'>" + label + ' ' + get_label.guardado +"</span>";
					}
					inspector.show_log_msg(msg);

					// INSPECTOR DEBUG INFO
					if( debug_div ) {
						debug_div.innerHtml = "";
						debug_div.innerHtml += "<div class=\"key\">saved</div><div class=\"value\">" + label + "</div><br>\n"
						debug_div.innerHtml += "<div class=\"key\">tipo</div><div class=\"value\">"  + tipo + "</div><br>\n"
						debug_div.innerHtml += "<div class=\"key\">chars</div><div class=\"value\">" + received_data.length + "</div><br>\n"
						debug_div.innerHtml += "<div class=\"key\">dato</div><div class=\"value\">"  + received_data.replace(/<br ?\/?>/g, " ") + "</div><br>\n"
					}
			})
			.fail(function(error_data) {
				// Notify to log messages in top of page
				var msg = "<span class='error'>ERROR: on Save data id:" + id + " (Ajax error)<br>Data is NOT saved!</span>";
				inspector.show_log_msg(msg);
				if (DEBUG) {
					console.log(msg);
					console.log(error_data);
				}
			})			

		)//end promise

		return jsPromise;		
	};//end custom_save
	



}//end component_security_access


