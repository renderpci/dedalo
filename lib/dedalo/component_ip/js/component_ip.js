// JavaScript Document
$(document).ready(function() {

	
	switch(page_globals.modo) {
		
		case 'list' :	// OBJ SELECTOR
						/*
						var ip_dato_obj = $('.list_ip_dato');
						
						$(document.body).on("click", ip_dato_obj.selector, function(){							
							component_ip.open_ip_info(this);								
						});
						*/					
						break;
						
	}

});


var component_ip = new function() {

	/**
	* OPEN IP INFO
	*/
	this.open_ip_info = function(obj) {

		var ip = $(obj).html();

		if (ip.length>2) {
			// Open geoip info window
			var url = "http://whatismyipaddress.com/ip/" + ip;
			window.open(url)
		}
		return true;
	}




}//end component_ip








