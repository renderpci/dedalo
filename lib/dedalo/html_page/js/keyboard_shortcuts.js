


/**
* KEYBOARD_SHORTCUTS CLASS
*/
var keyboard_shortcuts = new function() {


	// ON READY
	$(function() {
		
		
		window.addEventListener("keydown", function (e) {
			//console.log(e.keyCode);

			switch(true) {

				// PAGINATOR RIGHT ARROW <	
				case (e.ctrlKey==1 && e.keyCode==37):
					var element = $('.paginator_prev_icon');
					if ( $(element).length ) {
						$(element).first().trigger( "click" );
					}
					break;
				
				// PAGINATOR RIGHT ARROW >
				case (e.ctrlKey==1 && e.keyCode==39): 
					var element = $('.paginator_next_icon');
					if ( $(element).length ) {
						$(element).first().trigger( "click" );
					}
					break;

				// DEBUG_INFO : CONTROL + D (ctrlKey+68) TOGGLE DEBUG_INFO
				case (e.ctrlKey==1 && e.keyCode==68):
					//$('.debug_info').slideToggle('100');
					$('.debug_info').toggle();
					break;

				// INSPECTOR : CONTROL + I (ctrlKey+73) TOGGLE INSPECTOR
				case (e.ctrlKey==1 && e.keyCode==73):
					inspector.toggle_sidebar()
					break;

				// LIST FILTER : CONTROL + F (ctrlKey+70) TOGGLE FILTER BODY
				case (e.ctrlKey==1 && e.keyCode==70): 
					$('.css_rows_search_tap').next('.tab_content').toggle(100);
					if (get_localStorage($('.css_rows_search_tap').data('tab_id'))==1) {
						remove_localStorage($('.css_rows_search_tap').data('tab_id'));
					}else{
						set_localStorage($('.css_rows_search_tap').data('tab_id'), 1);
					}
					break;

				// STATS : CONTROL + S (ctrlKey+83) TOGGLE STATS DIV				
				case (e.ctrlKey==1 && e.keyCode==83): 
					$('.css_button_stats').trigger( "click" );
					break;

				// DESELECT COMPONENT (ESC)
				case (e.keyCode==27): 
					if (page_globals.modo=='edit') {
						component_common.reset_all_selected_wraps(false)
					}				
					break;
			}
			

		});//end window.addEventListener("keydown", function (e)
		

	});//end $(document).ready(function() 


};//end class


