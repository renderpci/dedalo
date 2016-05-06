


/**
* COMPONENT_PDF CLASS
*/
var component_pdf = new function() {

	// URL TRIGGER
	this.url_trigger = DEDALO_LIB_BASE_URL + '/component_pdf/trigger.component_pdf.php';


	/**
	* SELECT_COMPONENT
	* Overwrite common method
	* @param object obj_wrap
	*/
	this.select_component = function(obj_wrap) {

		obj_wrap.classList.add("selected_wrap");
		//$(obj_wrap).find('a').first().focus();
	}


	this.open_pdf = function(button_obj) {

		//var wrap_obj 	= $(button_obj).parents('.wrap_component:first');
		var pdf_url 	= $(button_obj).data('pdf_url');


		pdf_url = DEDALO_ROOT_WEB + '/lib/pdfjs/web/dedalo_viewer.html?pdf_url=' + pdf_url
		//return console.log(pdf_url);


		// Windown name
		nameWindow 	 = "view_pdf" ;
		media_window = window.open(pdf_url,nameWindow,'width=900,height=650');
		media_window.focus();
	}

	this.load_iframe_url = function(iframe_id,url) {
		$( document ).ready(function() {
        	$('#'+iframe_id).attr('src', url)
    	});
	}


}; //end component_pdf class
