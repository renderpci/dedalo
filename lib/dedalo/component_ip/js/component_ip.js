"use strict"
/**
* COMPONENT_IP
*
*
*/
var component_ip = new function() {



	/**
	* OPEN IP INFO
	*/
	this.open_ip_info = function(obj) {

		let ip = $(obj).html();

		if (ip.length>2) {
			// Open geoip info window
			let url = "http://whatismyipaddress.com/ip/" + ip;
			window.open(url)
		}

		return true;
	}//end open_ip_info



	/**
	* LOAD_IP_INFO
	* Max 150 requests per minute
	* Unban IP: http://ip-api.com/docs/unban
	*/
	this.load_ip_info = function(ip) {
		$.getJSON("http://ip-api.com/json/"+ip, function(data) {
			console.log(data)
		});
	}//end load_ip_info



}//end component_ip