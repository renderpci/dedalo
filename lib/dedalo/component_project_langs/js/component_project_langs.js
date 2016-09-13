


/**
* COMPONENT_PROJECT_LANGS
*/
var component_project_langs = new function() {

	this.save_arguments = {} // End save_arguments
	this.trigger_url 	= DEDALO_LIB_BASE_URL + '/component_project_langs/trigger.component_project_langs.php' ;
	
	
	switch(page_globals.modo) {
		
		case 'edit' :
			$(function() {
				// OBJ SELECTOR
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
				var button_obj = $('.css_component_project_langs_lang_delete');
				$(document.body).on('click', button_obj.selector, function(e){
					component_project_langs.delete_list_element(this);
				});				
				
				// BTN ADD LANG (OPEN NEW WINDOW)
				var button_open_obj = $('.css_btn_add_lang');
				$(document.body).on('click', button_open_obj.selector, function(e){				
					component_project_langs.open_tesauro_lang_to_add(this);
				});
			});
			break;	
	}	



	/**
	* SAVE
	* @param object component_obj
	*	is DOM ul element
	*/
	this.Save = function(component_obj) {		

		this.save_arguments.dato = this.get_dato(component_obj)

		// Exec general save
		var jsPromise = component_common.Save(component_obj, this.save_arguments);
	};



	/**
	* GET_DATO
	*/
	this.get_dato = function( button_obj ) {
		//console.log(button_obj);

		// Iterate li elements tha contains the values in data attribute
		var ar_childrens = button_obj.querySelectorAll('li');
			//console.log(ar_childrens);			

		var dato = [];
		for(var i=0; i<ar_childrens.length ; i++) {
			var value_string = ar_childrens[i].dataset.value,
				value 		 = JSON.parse(value_string)
			if (value) {
				dato.push( value );
			}			
		}		

		return dato;

	};//end get_dato



	/**
	* COMPONENT PROJECT LANG REBUILD LIST 
	*/
	this.component_project_lang_rebuild_list = function(ar_dato, target_obj, callback) {
		
		// Reset. Eliminamos todos los elementos li del elemento ul	
		$(target_obj).children('li').remove();
			
		// Calculamos los elementos del array e iteramos todos los elementos, creando la línea (li) para cada uno de ellos	
		for(var i=0; i<ar_dato.length ; i++) {
			
			// Cada dato del array es un terminoID tipo 'lg-eng'
			var terminoID	= ar_dato[i].section_tipo;					//if (DEBUG) console.log(terminoID);
			
			switch( true ) {
				
				// CASE REAL COMPONENT
				case target_obj.id == 'sortable_project_langs'	:
				
						// Construimos el elemento li con el dato actual
						var li_div_id	= 'li_div_'+ terminoID ;					
						var string_li	= '<li class="ui-state-default" data-value=\'' + JSON.stringify(ar_dato[i]) + '\'>\
						<div class="ui-icon ui-icon-arrowthick-2-n-s"></div>\
						<div class="css_component_project_langs_lang_name" id="'+ li_div_id +'">'+terminoID+'</div>'
						if (typeof dedalo_projects_default_langs!='undefined' && dedalo_projects_default_langs.indexOf(terminoID)==-1) {
							string_li	+= '<div class="css_component_project_langs_lang_delete">Delete</div>';							
						}						
						string_li	+= '</li>';					
						break;
						
				// CASE TIME MACHINE PREVIEW COMPONENT
				default :
						// Construimos el elemento li con el dato actual
						var li_div_id	= 'li_div_tm_'+ terminoID ;
						var string_li	= '<li class="ui-state-default" data-value=\'' + JSON.stringify(ar_dato[i]) + '\'>\
						<div class="ui-icon ui-icon-arrowthick-2-n-s"></div>\
						<div class="css_component_project_langs_lang_name" id="'+ li_div_id +'">'+terminoID+'</div>\
						</li>';										
			}		
							
			// Añadimos el elemento li al contenedor ul
			$(string_li).appendTo($(target_obj));
			
			// Enviamos la orden ajax de resolver el nombbre del lenguaje a partir del id y rellenar el texto del elemento li creado
			component_project_langs.get_termino_by_tipo(terminoID, $('#' + li_div_id) );					
		}
		
		component_project_langs.Save(target_obj)

	};//end component_project_lang_rebuild_list



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
		component_project_langs.Save(element_ul[0]);
	};



	/**
	* GET TERMINO BY TIPO (RESOLVE LANG NAME)
	*/
	this.get_termino_by_tipo = function(terminoID, target_ob) {
		
		var mode 		= 'get_termino_by_tipo';
		var mydata		= { 'mode': mode,
							'terminoID': terminoID,
							'top_tipo':page_globals.top_tipo
						  };
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
		
	};//end get_termino_by_tipo



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
	};



	/**
	* NEWLANG
	*/
	this.newLang = function(terminoID, ID) {
		
		if(!terminoID || !ID) {
			alert("Invalid data: "+terminoID + " - "+ID)
			return false;
		}

		var dato = this.get_dato(sortable_project_langs);
				
		var exists_in_dato=false;
		for (var i = 0; i < dato.length; i++) {
			var locator = dato[i]
			if (typeof locator.section_tipo!='undefined' && locator.section_tipo==terminoID) {				
				exists_in_dato = true;
				break;				
			}
		}
		if (exists_in_dato==true) { return false; }

		// Create pseudo locator on the fly
		var locator = {
			'section_tipo' : terminoID,
			'section_id'   : ID
		}

		dato.push(locator);
		//console.log(dato); return;
							
		component_project_langs.component_project_lang_rebuild_list(dato, sortable_project_langs);
		//component_project_langs.Save(sortable_project_langs);	
	};



}//end component_project_langs





// NEW LANG . TRIGGERED BY OPENED TESAURO WINDOW
function newLang(terminoID, ID) {	
	return component_project_langs.newLang(terminoID, ID);
}










