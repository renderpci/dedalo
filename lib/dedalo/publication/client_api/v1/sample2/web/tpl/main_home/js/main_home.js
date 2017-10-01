"use strict";



var main_home =  {

	trigger_url : "trigger.free_search.php",

	setup : function() {
		window.ready(function(){
			main_home.fix_body_height()
		})		
	},
	
	fix_body_height : function() {
		
		let window_height  = window.innerHeight;
			console.log(window_height);
		let content_height = document.getElementById("content").offsetHeight
			console.log(content_height);
		let footer_height = document.getElementById("footer").offsetHeight
			console.log(footer_height);

		if (window_height > (content_height + footer_height)) {

			document.getElementById("content").style.height = (window_height - footer_height) + "px"
		}	
		
	}

}//end free_search

main_home.setup()