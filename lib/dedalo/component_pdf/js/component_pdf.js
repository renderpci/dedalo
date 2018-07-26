"use strict"
/**
* COMPONENT_PDF CLASS
*
*
*/
var component_pdf = new function() {


	// URL TRIGGER
	this.url_trigger = DEDALO_LIB_BASE_URL + '/component_pdf/trigger.component_pdf.php';



	/**
	* INIT
	* @return 
	*/
	this.init = function(options) {
		

		return true
	};//end init



	/**
	* SELECT_COMPONENT
	* Overwrite common method
	* @param object obj_wrap
	*/
	this.select_component = function(obj_wrap) {

		obj_wrap.classList.add("selected_wrap");
		//$(obj_wrap).find('a').first().focus();

		return true
	};
	

	/**
	* OPEN_PDF
	*/
	this.open_pdf = function(button_obj) {

		var pdf_url 		= button_obj.dataset.pdf_url,
			pdf_viewer_url 	= button_obj.dataset.pdf_viewer_url

		//var window_url 	= DEDALO_ROOT_WEB + '/lib/pdfjs/web/dedalo_viewer.html?pdf_url=' + pdf_url
		var window_url 		= DEDALO_LIB_BASE_URL + '/component_pdf/html/component_pdf_viewer.php?pdf_url=' + pdf_url

		// Windown name
		var nameWindow 	 = "view_pdf ",
			media_window = window.open(window_url, nameWindow, 'width=900,height=650');
			media_window.focus();
		
		return false;
	};//end open_pdf



	this.load_iframe_url = function(iframe_id,url) {
		$( document ).ready(function() {
        	$('#'+iframe_id).attr('src', url)
    	})

    	return true
	};



}; //end component_pdf class