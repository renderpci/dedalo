// JavaScript Document

// ON READY
$(document).ready(function() {
	
	$(document).keydown(function(e){
		//console.log(e.keyCode);

		switch(true) {

			case (e.keyCode==37): // paginator right arrow <				
				var element = $('.paginator_prev_icon');
				if ( $(element).length ) {
					$(element).first().trigger( "click" );
				}
				break;

			case (e.keyCode==39): // paginator right arrow >
				var element = $('.paginator_next_icon');
				if ( $(element).length ) {
					$(element).first().trigger( "click" );
				}
				break;

			case (e.ctrlKey==1 && e.keyCode==68): // DEBUG_INFO : CONTROL + D (ctrlKey+68) TOGGLE DEBUG_INFO
				$('.debug_info').slideToggle('100');
				break;

			case (e.ctrlKey==1 && e.keyCode==73):// INSPECTOR : CONTROL + I (ctrlKey+73) TOGGLE INSPECTOR
				inspector.toggle_sidebar()
				break;

			case (e.ctrlKey==1 && e.keyCode==70): // LIST FILTER : CONTROL + F (ctrlKey+70) TOGGLE FILTER BODY
				$('.css_rows_search_tap').next('.tab_content').toggle(100);
				if (get_localStorage($('.css_rows_search_tap').data('tab_id'))==1) {
					remove_localStorage($('.css_rows_search_tap').data('tab_id'));
				}else{
					set_localStorage($('.css_rows_search_tap').data('tab_id'), 1);
				}
				break;

			case (e.keyCode==83): // STATS : CONTROL + S (ctrlKey+83) TOGGLE STATS DIV	
				$('.css_button_stats').trigger( "click" );
				break;
		}
		

	});//$("body").keydown(function(e)
	

});//end $(document).ready(function() 




/**
* KEYBOARD_SHORTCUTS CLASS
*/
var keyboard_shortcuts = new function() {	

	

};//end html_page class


