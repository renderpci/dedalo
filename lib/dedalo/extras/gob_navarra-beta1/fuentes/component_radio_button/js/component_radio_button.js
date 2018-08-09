// JavaScript Document
$(document).ready(function() {	
	
	switch(page_globals.modo) {
		
		case 'tool_time_machine' :
		case 'edit' :	
						// OBJ SELECTOR
						var radio_button_obj = $('.css_radio_button:input:radio');
						
						$(document.body).on("change", radio_button_obj.selector, function(){
							component_radio_button.Save(this);
						});
						break;						
	}	

});


var component_radio_button = new function() {

	/*
	* REFRESH_COMPONENT
	* triggered when this component save
	* received data is id_matrix of current new/existing component
	*/
	this.refresh_component = function(received_data) {
		//console.log("triggered refresh_component \n"+received_data)	//

		// received data is id_matrix of current new/existing component
		return component_common.update_component_by_ajax( received_data, component_radio_button.update_components_related );
		//$(target).find('.css_autocomplete_ts_valor').text()
		
	}



	/**
	* update_components_related
	* Obtiene el valor seleccionado en el recorrido 0 o 1
	* y actualiza (si procede, cuando hay un término relacionado en estructura de modelo 'component_geolocation')
	*/
	this.update_components_related = function(component_obj) {		

		// TYPE OBJECT Verify
		if(typeof component_obj !== 'object') {
			return alert("Error on update_components_related. Wrong component_obj type")
		}

		// Josetxo 20/01/2015
		var objParent = component_obj.parent();
		var toponimia_string = component_radio_button.get_valor_radio_button(component_obj);
		toponimia_string='recorrido : '+(parseInt(toponimia_string)==1?1:0);
		// Fin Josetxo 20/01/2015

		// PROCESADO Y ACTUALIZACIÓN DEL COMPONENTE RELACIONADO
		var parent = objParent.data('parent');
		var ar_related_components = objParent.data('link_fields');
			//console.log(ar_related_components);

		// Iterate all related components
		$.each(ar_related_components, function(modelo, current_tipo) {
			var fn = window[modelo]['update_component_related'];

			 
			// is object a function?
			if (typeof fn === "function") {
				//alert("llamando")
				fn.apply(null, [parent, current_tipo, toponimia_string]);
			}else{
				//alert("no se encuentra "+fnstring)
				console.log(fn)
			}

		});

		//return alert(toponimia_string);
	}	

	this.save_arguments = {	"update_security_access" 	: false,
	                      	"update_filter_master"		: false,
	                      	"callback"					: this.refresh_component,
							} // End save_arguments


	/**
	* SAVE
	*/
	this.Save = function(component_obj) {

		// Exec general save
		component_common.Save(component_obj, this.save_arguments);

	}

	/**
	* Devuelve el valor seleccionado de un radiobutton
	*/
	this.get_valor_radio_button = function(component_obj) {	
		var valor;
		var toponimia_array = $(component_obj).find('.css_radio_button:input');
		$.each(toponimia_array, function(key, value) {
			if(value.getAttribute('checked')=='checked'){
				valor=value.getAttribute('value');
			}
		});	
		return valor;
	}
}//end component_radio_button

