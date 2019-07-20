/**
* KEYBOARD_SHORTCUTS CLASS
* Control geenral keyboard trigger functions
*
*
*/
var keyboard_shortcuts = new function() {

	'use strict';


	// ON READY
	$(function() {
	//window.ready(function(){
		
		
		window.addEventListener("keydown", function (e) {
			//console.log("e.ctrlKey, e.keyCode: ", e.ctrlKey, e.keyCode);

			switch(true) {

				// PAGINATOR RIGHT ARROW <	
				case (e.ctrlKey===true && e.keyCode===37):
					var element = $('.paginator_prev_icon');
					if ( $(element).length ) {
						$(element).first().trigger( "click" );
					}
					break;
				
				// PAGINATOR RIGHT ARROW >
				case (e.ctrlKey===true && e.keyCode===39): 
					var element = $('.paginator_next_icon');
					if ( $(element).length ) {
						$(element).first().trigger( "click" );
					}
					break;

				// DEBUG_INFO : CONTROL + D (ctrlKey+68) TOGGLE DEBUG_INFO
				case (e.ctrlKey===true && e.keyCode===68):					
					html_page.debug_info_toggle()
					break;

				// INSPECTOR : CONTROL + I (ctrlKey+73) TOGGLE INSPECTOR
				case (e.ctrlKey===true && e.keyCode===73):
					inspector.toggle_sidebar()
					break;

				// LIST FILTER : CONTROL + F (ctrlKey+70) TOGGLE FILTER BODY
				case (e.ctrlKey===true && e.keyCode===70):
					search.toggle_filter_search_tap()
					break;

				// STATS : CONTROL + S (ctrlKey+83) TOGGLE STATS DIV				
				case (e.ctrlKey===true && e.keyCode===83): 
					$('.css_button_stats').trigger( "click" );
					break;

				// SEARCH SUBMIT (SEARCH2) : CONTROL + RETURN (ctrlKey+13)
				//case (e.ctrlKey==1 && e.keyCode==13):
				case (e.keyCode===13):
					if (page_globals.modo.indexOf('list')!==-1 || page_globals.modo.indexOf('tool_')!==-1) {						
						if (page_globals.tipo==='dd100' || page_globals.modo==='tool_cataloging' || page_globals.modo==='tool_sort') {
							// Thesaurus case disable (used by order feature)
							return false;
						}
						e.preventDefault()
						e.stopPropagation();
						if (e.target.id==='go_to_page') {
							return false
						}
						//console.log("e:",e.target.id);
						const button_submit = document.getElementById("button_submit")
						if (button_submit) {							
							//button_submit.click()
							search2.search_from_enter_key(button_submit)
						}else{
							e.target.blur()
							if(SHOW_DEBUG===true) {
								console.warn("Submit button 'button_submit' not found in dom!");
							}
						}
					}
					break;

				// ESC
				case (e.keyCode===27):
					// Toggle filter tab in list
					/*
					if (page_globals.modo.indexOf('list')!==-1 || page_globals.modo.indexOf('tool_')!==-1) {
						search.toggle_filter_search_tap()
					}*/
					// Deselect components	
					if (page_globals.modo && page_globals.modo.indexOf('edit')!==-1) {
						component_common.reset_all_selected_wraps(false)
					}
					// Deselect menu
					menu.close_all_drop_menu();

					// Reset thesaurus hilite terms
					if (page_globals && page_globals.section_tipo==='dd100' || page_globals.section_tipo==='dd101') {
						if (ts_object) ts_object.reset_hilites()
					}
					break;
			}
			

		});//end window.addEventListener("keydown", function (e)
		

	});//end $(document).ready(function() 


};//end class