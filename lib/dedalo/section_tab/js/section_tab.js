





var section_tabs = new function() {

	$(function() {
		
		/*
		// OBJ SELECTOR
		var section_group_wrap_obj = $('div.css_section_tab_content');	
		
		// INITIAL ITERATION TO SHOW / HIDE TAPS
		section_group_wrap_obj.each(function() {
			// Si el section gruoup actual está dentro de otro, le asignamos un estilo específico
			var parent_section_group = $(this).parents('div.css_section_group_wrap');
			if ($(parent_section_group).length>0) {
				$(this).addClass("css_section_group_wrap_inside");
				if(DEBUG) console.log("section_group inside detected. Added class css_section_group_wrap_inside")
			};
		});
		*/
		
	    $( ".css_section_tab_content" ).tabs({
	      collapsible: true
	    });
		
		
	});


}//end class



