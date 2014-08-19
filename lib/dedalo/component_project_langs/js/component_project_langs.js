// JavaScript Document
$(document).ready(function() {
	
	switch(page_globals.modo) {
		
		case 'edit' :	// OBJ SELECTOR
						var sortable_project_langs = $('.css_component_project_langs');											
													
						// DRAG SORTABLE ACTIVATE
						sortable_project_langs.sortable({
							
							update: function(event, ui) {
								component_project_langs.Save(this);
							},
							cancel: '.drag_disabled'							
						});						
						sortable_project_langs.disableSelection();						
						
						// BTN DELETE ELEMENT LIVE EVENT CLICK TO BUTTON 	
						$(document.body).on("click", '.css_component_project_langs_lang_delete', function(){			
							component_project_langs.delete_list_element(this);
						});
						
						
						// BTN ADD LANG (OPEN NEW WINDOW)
						$('.css_btn_add_lang').bind("click", function(){			
							component_project_langs.open_tesauro_lang_to_add(this);							
						});
						
		case 'search' :	
						break;
							
	}	

});


/**
* COMPONENT_PROJECT_LANGS
*/
var component_project_langs = new function() {

	this.save_arguments = {	} // End save_arguments							
	this.trigger_url 	= DEDALO_LIB_BASE_URL + '/component_project_langs/trigger.component_project_langs.php' ;

	/**
	* SAVE
	*/
	this.Save = function(component_obj) {

		// Exec general save
		component_common.Save(component_obj, this.save_arguments);
	}

	/**
	* COMPONENT PROJECT LANG REBUILD LIST 
	*/
	this.component_project_lang_rebuild_list = function(ar_dato, target_obj) {
		
		// Reset. Eliminamos todos los elementos li del elemento ul	
		$(target_obj).children('li').remove();
			
		// Calculamos los elementos del array e iteramos todos los elementos, creando la línea (li) para cada uno de ellos			
		var len = ar_dato.length;		
		if(ar_dato && len >0) for(var i=0; i<len ; i++) {
			
			// Cada dato del array es un terminoID tipo 'lg-eng'
			var terminoID	= ar_dato[i];					//if (DEBUG) console.log(terminoID);
			
			
			switch( true ) {
				
				// CASE REAL COMPONENT
				case $(target_obj).prop('id') == 'sortable_project_langs'	:
				
						// Construimos el elemento li con el dato actual
						var li_div_id	= 'li_div_'+ terminoID ;					
						var string_li	= '<li class="ui-state-default" data-value="' + terminoID + '">\
						<div class="ui-icon ui-icon-arrowthick-2-n-s"></div>\
						<div class="css_component_project_langs_lang_name" id="'+ li_div_id +'">'+terminoID+'</div>\
						<div class="css_component_project_langs_lang_delete">Delete</div>\
						</li>';					
						break;
						
				// CASE TIME MACHINE PREVIEW COMPONENT
				default :
						// Construimos el elemento li con el dato actual
						var li_div_id	= 'li_div_tm_'+ terminoID ;
						var string_li	= '<li class="ui-state-default" data-value="' + terminoID + '">\
						<div class="ui-icon ui-icon-arrowthick-2-n-s"></div>\
						<div class="css_component_project_langs_lang_name" id="'+ li_div_id +'">'+terminoID+'</div>\
						</li>';										
			}		
							
			// Añadimos el elemento li al contenedor ul
			$(string_li).appendTo($(target_obj));
			
			// Enviamos la orden ajax de resolver el nombbre del lenguaje a partir del id y rellenar el texto del elemento li creado
			component_project_langs.get_termino_by_tipo(terminoID, $('#' + li_div_id) );
					
		}		
	}//end component_project_lang_rebuild_list


	/**
	* DELETE ELEMENT
	*/
	this.delete_list_element = function(button_delete_element) {
		
		//var r = confirm(" WARNING! \n\n If you remove selected lang, you delete and loose all data entered in this lang for this project ! \n\n Are you sure? \n"); if(r==false) return false;
		var r = confirm(" WARNING! \n\nIf you remove selected lang, you will not have this language available for translations of the records on this project ! \n\n Are you sure? \n"); if(r==false) return false;
		
		var element_li	= $(button_delete_element).parent().closest('li');
		var element_ul	= $(button_delete_element).parent().closest('ul');
		
		// Remove line (li)
		$(element_li).remove();
		
		// Save (iterate all li's for get ar value)
		component_project_langs.Save(element_ul);
	}


	/**
	* GET TERMINO BY TIPO (RESOLVE LANG NAME)
	*/
	this.get_termino_by_tipo = function(terminoID, target_ob) {
		
		var mode 		= 'get_termino_by_tipo';
		var mydata		= { 'mode': mode, 'terminoID': terminoID };
		var wrapper_id 	= $(target_ob).attr('id');
		var div 		= $(target_ob);

		//html_page.loading_content( wrapper_id, 1 );
		target_ob.addClass('css_spinner');

		// AJAX CALL
		$.ajax({
			url		: this.trigger_url,
			data	: mydata,
			type	: "POST"
		})
		// DONE
		.done(function(data_response) {

			div.html(data_response);
		})			
		.fail( function(jqXHR, textStatus) {
			alert("cargarTSrel error "+textStatus)
		})
		.always(function() {
			//html_page.loading_content( wrapper_id, 1 );
			target_ob.removeClass('css_spinner');
		});
		
	}//end get_termino_by_tipo


	/**
	* OPEN TESAURO LANG WINDOW TO ADD LANG
	*/
	this.relwindow = null ;
	this.open_tesauro_lang_to_add = function(obj) {
		
		var modo = 'tesauro_rel';
		var type = 'lenguaje';	
			
		var theUrl = DEDALO_LIB_BASE_URL + '/ts/ts_list.php?modo=' + modo +'&type=' + type ;
		
		// Si no está abierta la abrimos
		if ((this.relwindow == null) || (this.relwindow.closed)) {    
		
			this.relwindow = window.open(theUrl ,'listwindow','status=yes,scrollbars=yes,resizable=yes,width=900,height=650');//resizable
			if (this.relwindow) this.relwindow.moveTo(-10,1);		
		}
		
		if (window.focus) this.relwindow.focus();	
		
		return false;	
	}


	this.newLang = function(terminoID) {
	
		var target_obj	= $(sortable_project_langs)
		var ar_dato		= component_common.common_get_dato(target_obj); 	//if (DEBUG) console.log(ar_dato);
		
		if(terminoID) {
			
			if( common.inArray(terminoID,ar_dato)!= -1 ) {
				//alert("The selected language already exists !");
				return false;
			}
			
			ar_dato.push(terminoID);			//if (DEBUG) console.log(ar_dato);
			
			// Array unique avoid duplicates
			uniqueArray = ar_dato.filter(function(elem, pos) {
				return ar_dato.indexOf(elem) == pos;
			})		
			ar_dato = uniqueArray; 				//if (DEBUG) console.log(uniqueArray);
						
			component_project_langs.component_project_lang_rebuild_list(ar_dato, target_obj);
			component_project_langs.Save(target_obj);
		}
	}




}//end component_project_langs





// NEW LANG . TRIGGERED BY OPENED TESAURO WINDOW
function newLang(terminoID) {	
	return component_project_langs.newLang(terminoID);
}










