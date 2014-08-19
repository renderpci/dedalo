// JavaScript Document
/*
	TRANSCRIPTION
*/
$(document).ready(function() {
	
	switch(page_globals.modo){

		case 'edit':
				/*
				// OBJ SELECTOR BUTTON OPEN NEW WINDOW
				var button_transcription_open = $('#btn_transcription_open');
					
					// LIVE EVENT CLICK TO BUTTON (ICON) LOAD TOOL
					$(document.body).on("click", button_transcription_open.selector, function(){
						
						// LOAD TOOL (OPEN NEW WINDOW)
						tool_transcription.open_tool_transcription(this,true);
					});
				*/
				break;

		case 'tool_transcription':
				window.onresize = fix_height_of_texteditor;
				break;
		
	}

});

// BEFORE UNLOAD
$(window).bind("beforeunload", function(event){

	if(page_globals.modo=='tool_transcription') {
		try {
			// Update transcription text component in opener page
			var component_related_obj = window.opener.$(".css_text_area[data-id_matrix=" +component_related_obj_id+ "]");
			if( $(component_related_obj).length == 1 ) {
				window.opener.component_common.update_component_by_ajax(component_related_obj_id);
				if(DEBUG) opener.window.console.log("->trigger opener update component "+component_related_obj_id)
			}else{
				//if(DEBUG) opener.window.alert("->trigger opener update component ERROR for "+component_related_obj_id)
				if(DEBUG) opener.console.log("->trigger opener update component ERROR on beforeunload for component_related_obj_id:"+component_related_obj_id)
			}
		}catch(e) {
			console.log("Error: "+e)
		}		
	}
});

$(window).load(function(){
    // full load
    //tool_transcription.resize_window();

    fix_height_of_texteditor()
});





// TOOL transcription CLASS
var tool_transcription = new function() {

	// LOCAL VARS
	this.trigger_tool_transcription_url = DEDALO_LIB_BASE_URL + '/component_tools/tool_transcription/trigger.tool_transcription.php' ;


	// RESIZE WINDOW
	this.resize_window = function() {

		if(window.self !== window.top) return alert("Please exec in top window");

		var selector= $('#html_page_wrap'),
			wo 		= 0,
			ho 		= 70;
		
		setTimeout ( function () {
	        var contentWidth  = $(selector).outerWidth(true) + wo;	//alert(contentWidth)
		   	var contentHeight = $(selector).outerHeight(true)+ ho;	

			//alert( $('#html_page_wrap').outerWidth(true) +" - " +$('#html_page_wrap').outerHeight(true) )

		   	window.moveTo(0,0);
			window.resizeTo(contentWidth,contentHeight);		
	    }, 2000);	   
	}	




};
//end tool_transcription








// Automatically change the height of the editor based on window resize
function fix_height_of_texteditor() {

    if (!tinyMCE || typeof tinyMCE=='undefined') return;

    try {
		var w = $('.tool_transcription_left').width();	
	    var h = $('.tool_transcription_left').height();
	    //console.log(w+"+"+h)
	    tinyMCE.activeEditor.theme.resizeTo(
	        null,
	        h -66
	    );
	}catch(e) {
		console.log("Error: "+e)
	}
    
    
}


