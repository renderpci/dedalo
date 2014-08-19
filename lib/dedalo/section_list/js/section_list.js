// JavaScript Document
$(document).ready(function() {
	
	/* TOGGLE FILTER TAP CONTENT 
	$('.css_rows_search_tap').each(function() {		
		
		$(this).bind("click", function(event) {			
			
			$(this).parent().find('.css_rows_search_content').toggle(250);
			
		});
	});
		*/
	// SET DEFAULT VALUE FOR FIELD MAX PER PAGE (5)
	var max_pp_obj = $('.css_max_rows');	if(max_pp_obj.val() <1)	max_pp_obj.val(5);	
	
});



var section_list = new function() {

	/**
	* SEARCH
	*/
	this.Search = function(obj_form) {	
		//obj_form.submit();
		return false;
	}

	/**
	* RESET FORM
	*/
	this.reset_form = function(obj_form) {
		
		var my_url = '?' + page_query_string + "&reset=y" ;
		window.location = my_url;	
		//obj_form.reset(); return false;
	}

	/**
	* SORT RECORDS
	*/
	this.sort_records = function(tipo, direction) {	
		//alert( page_query_string )
		if(page_query_string == -1 || page_query_string == 'undefined') return (alert("page_query_string nod defined! " + page_query_string ));
		
		var my_url = '?' + page_query_string + "&order_by=" + tipo + "&order_dir=" + direction ;		
		
		window.location = my_url ;

		return false;
	}



}//end section_list










